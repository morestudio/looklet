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
let noAuditColumns = false; // จำลองฐานข้อมูลที่ยังไม่ได้รัน db-apply (ไม่มีคอลัมน์ usage.result / usage.log)
const missing = { message: "Could not find the 'log' column of 'usage' in the schema cache" };
function table(name) {
  const filters = [];
  let patch = null, del = false, head = false, single = false, cols = null, sort = null, lim = Infinity;
  const rows = () => db[name].filter((r) => filters.every((f) => f(r)));
  // select('a, b, alias:col->>key') แบบ PostgREST
  const pick = (r) => (!cols || cols.includes('*') ? r : Object.fromEntries(cols.map((c) => {
    const [alias, expr] = c.includes(':') ? c.split(':') : [null, c];
    const [col, key] = expr.split('->>');
    return [alias ?? col, key ? r[col]?.[key] ?? null : r[col]];
  })));
  const b = {
    select: (c, opts) => { head = Boolean(opts?.head); cols = c ? c.split(',').map((x) => x.trim()) : null; return b; },
    eq: (k, v) => { filters.push((r) => r[k] === v); return b; },
    is: (k, v) => { filters.push((r) => (r[k] ?? null) === v); return b; },
    lt: (k, v) => { filters.push((r) => r[k] < v); return b; },
    gte: (k, v) => { filters.push((r) => r[k] >= v); return b; },
    lte: (k, v) => { filters.push((r) => r[k] <= v); return b; },
    in: (k, vs) => { filters.push((r) => vs.includes(r[k])); return b; },
    order: (k, opts) => { const dir = opts?.ascending === false ? -1 : 1; sort = (x, y) => (x[k] < y[k] ? -dir : x[k] > y[k] ? dir : 0); return b; },
    limit: (n) => { lim = n; return b; },
    insert: (row) => {
      if (noAuditColumns && name === 'usage' && ('log' in row || 'result' in row)) return Promise.resolve({ error: missing });
      db[name].push({ id: db[name].length + 1, created: new Date().toISOString(), ...row });
      return Promise.resolve({ error: null });
    },
    update: (p) => { patch = p; return b; },
    delete: () => { del = true; return b; },
    maybeSingle: () => { single = true; return b; },
    then: (ok) => {
      if (noAuditColumns && name === 'usage' && cols?.some((c) => /\b(result|log)\b/.test(c))) return Promise.resolve({ data: null, error: missing }).then(ok);
      const all = rows();
      if (patch) all.forEach((r) => Object.assign(r, patch));
      if (del) db[name] = db[name].filter((r) => !all.includes(r));
      const found = (sort ? [...all].sort(sort) : all).slice(0, lim).map(pick);
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
  THUMB_WIDTHS: [400, 512], GRID_THUMB: 512, sbSaveThumb: async () => {},
  sbReadThumb: async (key, _w, allowed) => { const r = db.images.find((x) => x.path === key); return r && allowed(r.meta) ? Buffer.from('thumb') : null; },
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
const audit = load('app/api/admin/audit/route.ts');
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
// รูปย่อ (/api/files?w=) สิทธิ์เดียวกับรูปเต็ม
assert(await withAccount(alice, () => storage.readThumb(parts(aliceSrc), 512)));
assert.equal(await withAccount(bob, () => storage.readThumb(parts(aliceSrc), 512)), null);
assert.equal(await withAccount(alice, () => storage.readThumb(parts(teamSrc), 512)), null);
assert.equal(await withAccount(bob, () => storage.deleteImage(aliceSrc)), false);
assert(db.images.some((x) => x.meta.caption === 'alice'));
const upload = await withAccount(alice, () => storage.saveImage({ area: 'uploads', kind: 'products' }, 'AA==', 'image/png', { name: 'bag' }));
assert.equal(await withAccount(bob, () => storage.updateMeta(upload, { name: 'stolen' })), false);
assert.equal(await withAccount(alice, () => storage.updateMeta(upload, { name: 'tote', owner: 'bob' })), true);
assert.deepEqual(db.images.find((x) => x.path.endsWith(upload.split('/').pop())).meta, { name: 'tote', owner: 'alice' });
// ♡ on results (/gallery): same privacy as uploads
assert.equal(await withAccount(bob, () => storage.updateMeta(aliceSrc, { favorite: true })), false);
assert.equal(await withAccount(alice, () => storage.updateMeta(teamSrc, { favorite: true })), false);
assert.equal(await withAccount(alice, () => storage.updateMeta(aliceSrc, { favorite: true })), true);
assert.equal(db.images.find((x) => x.meta.caption === 'alice').meta.favorite, true);

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

// ---------- ตรวจงาน (/admin/audit): ทุกการสร้างรูป + พรอมต์ เฉพาะ superadmin ----------
db.usage = [];
// แถวก่อนเริ่มเก็บพรอมต์: ไม่มี result/log -> จับคู่รูปของบัญชีเดียวกันจากเวลา (รูปของ bob เวลาเดียวกันต้องไม่ถูกจับ)
db.usage.push({ id: 1, user_id: 'alice', email: 'a@x', page: 'product', action: 'packshot', model: 'm', quality: 'high', status: 'ok', tokens: 5000, cost_thb: 2, created: '2026-10-30T09:32:21.745Z' });
db.images.push({ path: 'results/bob.jpg', area: 'results', kind: null, meta: { owner: 'bob', caption: 'bob' }, created: '2026-10-30T09:32:21.700Z' });
db.images.push({ path: 'results/old.jpg', area: 'results', kind: null, meta: { owner: 'alice', caption: 'old bag', stylePlan: { name: 'Walnut Pause', th: 'บนเก้าอี้' } }, created: '2026-10-30T09:32:20.626Z' });
const packshotLog = (extra) => ({ time: '2026-11-02 10:00:00', duration: '40.0 วินาที', page: 'สินค้า', ai: { model: 'm', params: { size: '1664x2496' } },
  product: { image: 1, name: 'กระเป๋า', file: '/api/files/uploads/products/a.jpg', sent: '1024×1280 · 120 KB' }, supports: [{ image: 2, file: '/api/files/uploads/products/b.jpg', sent: '80 KB' }],
  element: { set: 'ฉาก', props: { style: 'ไม่มีพร็อพ' } }, style: { preset: 'Creative Packshot · Walnut Pause' }, prompt: ['A photo of the bag.', 'Its strap rests on the table.'], ...extra });
const usageOf = (status, log) => ({ page: 'product', action: 'packshot', model: 'm', quality: 'high', status, tokens: 6000, log });
await withAccount(alice, () => recordUsage(usageOf('ok', packshotLog({ status: 'สำเร็จ', result: aliceSrc }))));
await withAccount(team, () => recordUsage(usageOf('error', packshotLog({ status: 'พัง', error: 'AI timeout' }))));
assert.equal(db.usage[1].result, aliceSrc);
assert.deepEqual(db.usage[1].log.prompt, ['A photo of the bag.', 'Its strap rests on the table.']);
const auditGet = async (query = '') => audit.GET(new Request('http://test/api/admin/audit' + query), {});
caller = alice;
assert.equal((await auditGet()).status, 403);
caller = team;
assert.equal((await auditGet()).status, 403);
caller = boss;
let list = await (await auditGet()).json();
assert.deepEqual(list.rows.map((x) => x.id), [3, 2, 1]); // ใหม่สุดก่อน
const [failed, fresh, old] = list.rows;
assert.deepEqual([fresh.src, fresh.hasLog, fresh.caption, fresh.who, fresh.customer], [aliceSrc, true, 'alice', 'ร้าน A', true]);
assert.deepEqual([failed.status, failed.error, failed.src, failed.who], ['error', 'AI timeout', null, 'team@x']);
assert.deepEqual([old.src, old.guessed, old.hasLog, old.plan.name], ['/api/files/results/old.jpg', true, false, 'Walnut Pause']);
assert(list.people.some((x) => x.user === 'alice' && x.label === 'ร้าน A') && list.people.some((x) => x.email === 'team@x'));
assert.equal(list.next, null);
const detail = await (await auditGet('?id=2')).json();
assert.deepEqual(detail.log.prompt, ['A photo of the bag.', 'Its strap rests on the table.']);
assert.equal(detail.log.supports[0].file, '/api/files/uploads/products/b.jpg');
assert.deepEqual((await (await auditGet('?status=error')).json()).rows.map((x) => x.id), [3]);
assert.deepEqual((await (await auditGet('?user=alice')).json()).rows.map((x) => x.id), [2, 1]);
assert.deepEqual((await (await auditGet('?email=team@x')).json()).rows.map((x) => x.id), [3]);
assert.deepEqual((await (await auditGet('?before=3')).json()).rows.map((x) => x.id), [2, 1]);
// superadmin เปิดรูปของลูกค้าได้เมื่อรู้ชื่อไฟล์ (รูปในพรอมต์/ผลลัพธ์) แต่คลังรูปของตัวเองยังไม่ปนของลูกค้า
assert(await withAccount(boss, () => storage.readImage(parts(aliceSrc))));
assert.equal(await withAccount(team, () => storage.readImage(parts(aliceSrc))), null);
assert.deepEqual(await captions(boss), ['team']);
// ยังไม่ได้รัน db-apply: บันทึกการใช้งานต้องไม่หาย (โควตานับต่อ) และหน้าตรวจงานยังเปิดได้
noAuditColumns = true;
await withAccount(alice, () => recordUsage(usageOf('ok', packshotLog({ status: 'สำเร็จ', result: aliceSrc }))));
assert.equal(db.usage.length, 4);
assert.equal(db.usage[3].log, undefined);
assert.equal(db.usage[3].tokens, 6000);
list = await (await auditGet()).json();
assert.equal(list.rows.length, 4);
assert(list.rows.every((x) => !x.hasLog));
noAuditColumns = false;

console.log('Accounts passed: invite codes, code login, per-account image privacy, owner cannot be forged, forced model, token quota (failures free, unknown tokens estimated), disable, superadmin-only admin, and the audit page (prompts stored with usage, old rows matched by time, filters, paging, works before the DB migration).');
