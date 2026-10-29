// ทดสอบบัญชีลูกค้า (โค้ดเชิญ / แยกรูปของแต่ละบัญชี / โควตา / admin / บังคับโมเดล) ด้วย Supabase จำลองในหน่วยความจำ
// ไม่ต่อเน็ต ไม่แตะฐานข้อมูลจริง ไม่เสียค่า AI:  node scripts/test-accounts.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
const require = createRequire(import.meta.url);

// ---------- Supabase จำลอง: ตาราง images / invites / usage + auth admin ----------
const db = { images: [], invites: [], usage: [] };
const users = new Map();
const signIns = [];
function table(name) {
  const filters = [];
  let patch = null, del = false, head = false, single = false;
  const rows = () => db[name].filter((r) => filters.every((f) => f(r)));
  const b = {
    select: (_cols, opts) => { head = Boolean(opts?.head); return b; },
    eq: (k, v) => { filters.push((r) => r[k] === v); return b; },
    is: (k, v) => { filters.push((r) => (r[k] ?? null) === v); return b; },
    order: () => b, limit: () => b,
    insert: (row) => { db[name].push({ id: db[name].length + 1, created: new Date().toISOString(), ...row }); return Promise.resolve({ error: null }); },
    update: (p) => { patch = p; return b; },
    delete: () => { del = true; return b; },
    maybeSingle: () => { single = true; return b; },
    then: (ok) => {
      const found = rows();
      if (patch) found.forEach((r) => Object.assign(r, patch));
      if (del) db[name] = db[name].filter((r) => !found.includes(r));
      return Promise.resolve(single ? { data: found[0] ?? null, error: null } : { data: head ? null : found, count: found.length, error: null }).then(ok);
    },
  };
  return b;
}
const serviceClient = () => ({
  from: table,
  auth: { admin: {
    getUserById: async (id) => ({ data: { user: users.get(id) ?? null } }),
    createUser: async ({ email, password, app_metadata }) => {
      const user = { id: `user-${users.size + 1}`, email, password, app_metadata };
      users.set(user.id, user);
      return { data: { user }, error: null };
    },
    updateUserById: async (id, attrs) => { Object.assign(users.get(id), attrs); return { error: null }; },
    deleteUser: async (id) => { users.delete(id); return { error: null }; },
  } },
});

// storage ที่เก็บบน Supabase (lib/storage-supabase.ts) แบบจำลอง — ตัวกรองสิทธิ์อยู่ใน lib/storage.ts ที่ทดสอบจริง
const files = new Map();
const supabaseMock = {
  supabaseEnabled: true, serviceClient,
  sbSave: async (key, area, kind, data, _mime, meta) => { files.set(key, data); db.images.push({ path: key, area, kind, meta, created: new Date().toISOString() }); },
  sbList: async (area, kind) => db.images.filter((r) => r.area === area && (r.kind ?? null) === kind),
  sbRead: async (key, allowed) => { const r = db.images.find((x) => x.path === key); return r && allowed(r.meta) ? files.get(key) ?? Buffer.from('x') : null; },
  sbMeta: async (key) => db.images.find((x) => x.path === key)?.meta ?? null,
  sbUpdateMeta: async (key, meta, allowed) => { const r = db.images.find((x) => x.path === key); if (!r || !allowed(r.meta)) return false; r.meta = { ...r.meta, ...meta }; return true; },
  sbDelete: async (key) => { db.images = db.images.filter((x) => x.path !== key); return true; },
};
let caller; // บัญชีที่ "เข้าสู่ระบบ" อยู่ใน request ถัดไป (undefined = ยังไม่เข้า)
const mocks = {
  'server-only': {},
  'lib/storage-supabase.ts': supabaseMock,
  'lib/supabase/server.ts': {
    signedInAccount: async () => caller, isSignedInMember: async () => caller !== undefined,
    createClient: async () => ({ auth: { signInWithPassword: async (creds) => {
      signIns.push(creds);
      const user = [...users.values()].find((u) => u.email === creds.email);
      return { error: user && user.password === creds.password ? null : { message: 'invalid' } };
    } } }),
  },
  'lib/ai.ts': { ApiError: class extends Error {} },
  'lib/auth.ts': { authEnabled: true },
};

const modules = new Map();
function load(file) {
  if (file in mocks) return mocks[file];
  if (modules.has(file)) return modules.get(file);
  const mod = { exports: {} };
  modules.set(file, mod.exports);
  const code = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)((id) => {
    if (id in mocks) return mocks[id];
    if (id.startsWith('@/')) return load(id.slice(2) + '.ts');
    if (id.startsWith('.')) return load(path.posix.normalize(path.posix.join(path.posix.dirname(file), id)) + '.ts');
    return require(id);
  }, mod, mod.exports);
  modules.set(file, mod.exports);
  return mod.exports;
}
const { withAccount, visibleTo } = load('lib/account.ts');
const storage = load('lib/storage.ts');
const { normalizeInviteCode, newInviteCode, invitePassword } = load('lib/invites.ts');
const { post } = load('lib/route.ts');
const { quotaBlock, recordUsage } = load('lib/usage.ts');
const inviteLogin = load('app/api/invite-login/route.ts');
const admin = load('app/api/admin/route.ts');
const request = (body) => new Request('http://test/api', { method: 'POST', body: JSON.stringify(body) });

const alice = { id: 'alice', email: 'a@x', role: 'customer' };
const bob = { id: 'bob', email: 'b@x', role: 'customer' };
const team = { id: 'team', email: 'team@x', role: 'team' };
const boss = { id: 'boss', email: 'boss@x', role: 'superadmin' };

// ---------- โค้ดเชิญ ----------
for (let n = 0; n < 50; n++) assert.match(newInviteCode(), /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
assert.equal(normalizeInviteCode(' abcd 2345 '), 'ABCD-2345');
assert.equal(normalizeInviteCode('ABCD-2345'), 'ABCD-2345');
assert.equal(normalizeInviteCode('ABCD-0001'), null); // 0 / 1 ไม่อยู่ในชุดตัวอักษร
assert.equal(normalizeInviteCode('ABC'), null);
assert.match(invitePassword('ABCD-2345'), /[A-Z]/);
assert.match(invitePassword('ABCD-2345'), /[a-z]/);
assert.match(invitePassword('ABCD-2345'), /[0-9]/);

// ---------- แยกรูปของแต่ละบัญชี ----------
assert.equal(visibleTo({}, null), true); // ในเครื่องไม่มี login = ทีม
assert.equal(visibleTo({ owner: 'alice' }, null), false);
assert.equal(visibleTo({ owner: 'alice' }, alice), true);
assert.equal(visibleTo({ owner: 'alice' }, bob), false);
assert.equal(visibleTo({}, alice), false); // คลังของทีม (รูปเดิมทั้งหมด) ลูกค้าไม่เห็น
assert.equal(visibleTo({ owner: 'alice' }, boss), false);
const r = { area: 'results' };
const teamSrc = await withAccount(team, () => storage.saveImage(r, 'AA==', 'image/png', { caption: 'team', owner: 'alice' }));
const aliceSrc = await withAccount(alice, () => storage.saveImage(r, 'AA==', 'image/png', { caption: 'alice', owner: 'bob' }));
assert.equal(db.images.find((x) => x.meta.caption === 'team').meta.owner, undefined); // ทีมไม่ติดเจ้าของ และส่ง owner มาเองไม่ได้
assert.equal(db.images.find((x) => x.meta.caption === 'alice').meta.owner, 'alice'); // เจ้าของมาจากบัญชีที่เรียก ไม่ใช่ meta
const captions = async (who) => (await withAccount(who, () => storage.listImages(r))).map((x) => x.caption);
assert.deepEqual(await captions(alice), ['alice']);
assert.deepEqual(await captions(bob), []);
assert.deepEqual(await captions(team), ['team']);
assert.deepEqual(await captions(boss), ['team']);
const parts = (src) => src.slice('/api/files/'.length).split('/');
assert(await withAccount(alice, () => storage.readImage(parts(aliceSrc))));
assert.equal(await withAccount(bob, () => storage.readImage(parts(aliceSrc))), null); // รู้ชื่อไฟล์ก็เปิดไม่ได้
assert.equal(await withAccount(alice, () => storage.readImage(parts(teamSrc))), null);
assert.equal(await withAccount(bob, () => storage.deleteImage(aliceSrc)), false);
assert(db.images.some((x) => x.meta.caption === 'alice'));
const upload = await withAccount(alice, () => storage.saveImage({ area: 'uploads', kind: 'products' }, 'AA==', 'image/png', { name: 'bag' }));
assert.equal(await withAccount(bob, () => storage.updateMeta(upload, { name: 'stolen' })), false);
assert.equal(await withAccount(alice, () => storage.updateMeta(upload, { name: 'tote', owner: 'bob' })), true);
assert.deepEqual(db.images.find((x) => x.path.endsWith(upload.split('/').pop())).meta, { name: 'tote', owner: 'alice' });

// ---------- post(): เข้าสู่ระบบก่อน + บังคับโมเดล + รู้ว่าใครเรียก ----------
let seen;
const handler = post(async (body) => { seen = { model: body.model, who: load('lib/account.ts').me() }; return Response.json({ ok: true }); });
caller = undefined;
assert.equal((await handler(request({ model: 'gemini:x' }))).status, 401);
caller = alice;
assert.equal((await handler(request({ model: 'gemini:gemini-3-pro-image' }))).status, 200);
assert.equal(seen.model, load('lib/catalog.ts').DEFAULT_AI_MODEL);
assert.equal(seen.who.id, 'alice');

// ---------- โควตา (โทเคน) ----------
const { usedTokens, ESTIMATED_TOKENS } = load('lib/usage.ts');
db.invites.push({ code: 'AAAA-BBBB', user_id: 'alice', label: 'ร้าน A', quota: 50, token_quota: 20000, disabled: false });
const quota = () => withAccount(alice, () => quotaBlock());
assert.equal(await quota(), null);
await withAccount(alice, () => recordUsage({ page: 'product', action: 'packshot', model: 'openai:gpt-image-2.5-sunburst', quality: 'high', status: 'ok', tokens: 5000 }));
await withAccount(alice, () => recordUsage({ page: 'model', action: 'generate', model: 'openai:gpt-image-2.5-sunburst', quality: 'high', status: 'error', tokens: 9000 }));
assert.equal(await usedTokens('alice'), 5000); // รูปที่พังไม่นับโควตา
await withAccount(alice, () => recordUsage({ page: 'model', action: 'generate', model: 'openai:gpt-image-2.5-sunburst', quality: 'high', status: 'ok', calls: 2, tokens: 0 }));
assert.equal(await usedTokens('alice'), 5000 + ESTIMATED_TOKENS); // AI ไม่บอกโทเคน = นับแบบประมาณ ไม่ฟรี
assert.equal(await quota(), null); // ยังเหลือ -> สร้างได้
await withAccount(alice, () => recordUsage({ page: 'product', action: 'packshot', model: 'openai:gpt-image-2.5-sunburst', quality: 'high', status: 'ok', tokens: 9000 }));
assert.equal((await quota()).status, 429); // 20,000 ครบแล้ว (รูปสุดท้ายเกินได้)
assert.deepEqual(db.usage.map((u) => u.tokens), [5000, 9000, null, 9000]);
assert.deepEqual(db.usage.map((u) => u.cost_thb), [2, 0, 4, 2]);
db.invites[0].token_quota = 1_000_000;
db.invites[0].disabled = true;
assert.equal((await quota()).status, 403);
assert.equal(await withAccount(team, () => quotaBlock()), null); // ทีมไม่มีโควตา

// ---------- admin: เฉพาะ superadmin ออกโค้ด / แก้ / ปิด ----------
caller = alice;
assert.equal((await admin.GET(new Request('http://test/api/admin'), {})).status, 403);
assert.equal((await admin.POST(request({ action: 'create', count: 1 }))).status, 403);
caller = boss;
assert.equal((await admin.POST(request({ action: 'create', count: 1, tokenQuota: 1.5 }))).status, 400);
let res = await admin.POST(request({ action: 'create', count: 2, tokenQuota: 300000 }));
assert.equal(res.status, 200);
const [code1, code2] = (await res.json()).codes;
assert.equal(db.invites.filter((i) => [code1, code2].includes(i.code) && i.token_quota === 300000).length, 2);
const user1 = users.get(db.invites.find((i) => i.code === code1).user_id);
assert.deepEqual(user1.app_metadata, { looklet: true, role: 'customer' });
res = await admin.GET(new Request('http://test/api/admin'), {});
const summary = await res.json();
const aliceRow = summary.invites.find((i) => i.code === 'AAAA-BBBB');
assert.equal(aliceRow.ok, 3);
assert.equal(aliceRow.tokens, 5000 + ESTIMATED_TOKENS + 9000);
assert.equal(aliceRow.tokenQuota, 1_000_000);
assert.deepEqual([summary.total.measured, summary.total.measuredTokens], [2, 14000]); // ค่าเฉลี่ยไม่ปนค่าประมาณ
assert.equal(summary.total.cost, 8);
assert.equal((await admin.POST(request({ action: 'update', code: code2, tokenQuota: 250000 }))).status, 200);
assert.equal(db.invites.find((i) => i.code === code2).token_quota, 250000);

// ---------- เข้าด้วยโค้ด ----------
caller = undefined;
const login = async (code) => (await inviteLogin.POST(request({ code }))).status;
assert.equal(await login('nope'), 400);
assert.equal(await login('ZZZZ-ZZZZ'), 401);
assert.equal(await login(code1.toLowerCase().replace('-', ' ')), 200);
assert.equal(signIns.at(-1).email, user1.email);
caller = boss;
assert.equal((await admin.POST(request({ action: 'update', code: code1, disabled: true }))).status, 200);
assert.equal(user1.app_metadata.looklet, false); // ปิดแล้วถอดสิทธิ์ + แบน
assert.equal(user1.ban_duration, '876000h');
caller = undefined;
assert.equal(await login(code1), 401);
assert.equal(await login(code2), 200);

console.log('Accounts passed: invite codes, code login, per-account image privacy, owner cannot be forged, forced model, token quota (failures free, unknown tokens estimated), disable, and superadmin-only admin.');
