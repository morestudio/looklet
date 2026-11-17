// ใช้คลังรูปจริงในโฟลเดอร์ชั่วคราว ทดสอบการเก็บกลุ่มโดยไม่แก้ข้อมูลผู้ใช้หรือเรียก AI
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const root = await fs.mkdtemp(path.join(tmpdir(), 'looklet-product-groups-'));
const modules = new Map();
const json = (status, body) => ({ status, body });
// AI เลือกรูปหลัก: แทนด้วยตัวปลอม (ไม่เรียก AI จริง) · picks = ทุกครั้งที่ถูกเรียก
const picks = [];
const ai = { pick: async () => null };
const aiMock = { pickMainPhoto: async (images, what, name) => { picks.push({ n: images.length, what, name }); return ai.pick(images); } };
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const customRequire = (id) => {
    if (id === 'server-only') return {};
    if (id === './storage-supabase') return { supabaseEnabled: false };
    if (id === './images') return load('lib/images.ts'); // storage.ts ทำรูปย่อตอนเก็บ (เก็บในเครื่องไม่ใช้)
    if (id === './account') return load('lib/account.ts'); // ไม่มีบัญชี (null) = ทีม: เก็บลงเครื่องไม่กรอง
    if (id === '@/lib/route') return { post: (fn) => fn, json, errorResponse: (status, message) => ({ status, body: { error: { code: 'error', message } } }) };
    if (id === '@/lib/ai') return aiMock;
    if (id === './api-error' || id === './fail-reason') return load('lib/' + id.slice(2) + '.ts'); // lib/usage.ts answers quota errors with errorResponse
    if (id.startsWith('@/lib/')) return load(id.slice(2) + '.ts');
    if (id === './aspects') return load('lib/aspects.ts'); // packshot.ts ใช้รายการสัดส่วนร่วมกับหน้านางแบบ
    if (id === './turntable') return load('lib/turntable.ts'); // packshot.ts ใช้คำบรรยายมุมของตั้งมุมเอง
    return require(id);
  };
  new Function('require', 'module', 'exports', 'process', code)(customRequire, loaded, loaded.exports, { cwd: () => root });
  modules.set(file, loaded.exports);
  return loaded.exports;
}
try {
  const { productGroups, productSources } = load('lib/product-groups.ts');
  const storage = load('lib/storage.ts');
  const upload = load('app/api/upload/route.ts').POST;
  const change = load('app/api/product-groups/route.ts').POST;
  const where = { area: 'uploads', kind: 'products' };
  const read = async () => productGroups(await storage.listImages(where));
  const add = async (name, group) => {
    const out = await upload({ kind: 'products', name, type: 'bag', data: 'aW1hZ2U=', mime: 'image/jpeg', ...(group ? { productGroup: group } : {}) });
    assert.equal(out.status, 200);
    return out.body.src;
  };
  const black = await add('กระเป๋า · ดำ');
  const cream = await add('กระเป๋า · ครีม');
  const back = await add('back.jpg', black);
  let groups = await read();
  assert.equal(groups.length, 2);
  assert.equal(groups.find((g) => g.id === black).photos.length, 2);
  assert.equal(groups.find((g) => g.id === cream).photos.length, 1);
  assert.deepEqual(productSources(groups.find((g) => g.id === black)).map((p) => p.src), [back]);
  assert.equal((await change({ action: 'main', group: black, src: cream })).status, 400);
  assert.equal((await change({ action: 'main', group: black, src: back })).status, 200);
  assert.equal((await read()).find((g) => g.id === black).main.src, back);
  assert.equal((await change({ action: 'edit', group: black, name: 'Quilt · Black', type: 'soft-bag' })).status, 200);
  assert.equal((await change({ action: 'view', group: black, src: back, view: 'back' })).status, 200);
  groups = await read();
  assert.equal(groups.find((g) => g.id === black).name, 'Quilt · Black');
  assert.equal(groups.find((g) => g.id === black).type, 'soft-bag');
  assert.equal(groups.find((g) => g.id === black).main.productView, 'back');
  await change({ action: 'remove', group: black, src: back });
  assert.equal((await read()).find((g) => g.id === black).main.src, black);
  await change({ action: 'restore', group: black, src: back });
  assert.equal((await read()).find((g) => g.id === black).main.src, back);
  await change({ action: 'move', group: black, src: black, target: cream });
  groups = await read();
  assert.equal(groups.find((g) => g.id === black).photos.length, 1);
  assert.equal(groups.find((g) => g.id === cream).photos.length, 2);
  assert.equal(groups.find((g) => g.id === black).name, 'Quilt · Black');
  assert.equal((await change({ action: 'remove', group: black, src: cream })).status, 400);
  assert.equal((await change({ action: 'move', group: black, src: back, target: '/missing' })).status, 400);
  assert.equal((await upload({ kind: 'products', productGroup: '/missing', data: 'aW1hZ2U=', mime: 'image/jpeg' })).status, 400);
  const legacy = await storage.saveImage(where, 'aW1hZ2U=', 'image/jpeg', { name: 'Legacy product', type: 'bag' });
  assert.equal((await read()).find((g) => g.id === legacy).photos.length, 1);
  await change({ action: 'move', group: legacy, src: legacy, target: cream });
  groups = await read();
  assert.equal(groups.find((g) => g.id === legacy).photos.length, 0);
  await add('new-side.jpg', legacy);
  assert.equal((await read()).find((g) => g.id === legacy).photos.length, 1);
  for (let i = 0; i < 7; i++) await add(`detail-${i}.jpg`, black);
  const blackGroup = (await read()).find((g) => g.id === black);
  assert.equal(productSources(blackGroup).length, 5);
  assert(productSources(blackGroup).every((p) => p.productGroup === black));

  // ---------- AI เลือกรูปหลัก (16 พ.ย.) ----------
  const sharp = require('sharp');
  const jpg = async (r, g, b) => (await sharp({ create: { width: 16, height: 16, channels: 3, background: { r, g, b } } }).jpeg().toBuffer()).toString('base64');
  const addJpg = async (name, data, group) => {
    const out = await upload({ kind: 'products', name, type: 'bag', data, mime: 'image/jpeg', ...(group ? { productGroup: group } : {}) });
    assert.equal(out.status, 200);
    return out.body.src;
  };
  const veraOf = async () => (await read()).find((g) => g.id === hang);
  // ตัวปลอมเลือกตามสีรูป (รูปที่อัปโหลดวินาทีเดียวกันเรียงไม่แน่นอน เลือกตามตำแหน่งไม่ได้) · 2 = รูปสีน้ำเงิน (clean)
  const byColor = (ch, th) => async (images) => {
    for (const [i, im] of images.entries()) {
      const mean = (await sharp(Buffer.from(im.data, 'base64')).stats()).channels.map((c) => c.mean);
      if (mean[ch] > 120 && mean.every((v, k) => k === ch || v < 80)) return { index: i, th };
    }
    return null;
  };
  const hang = await addJpg('vera hanging', await jpg(200, 0, 0));
  assert.equal((await change({ action: 'auto-main', group: hang })).body.patch.productMain, undefined); // รูปเดียว: ไม่ถาม AI
  assert.equal(picks.length, 0);
  const side = await addJpg('vera side', await jpg(0, 200, 0), hang);
  const clean = await addJpg('vera clean', await jpg(0, 0, 200), hang);
  assert.equal((await veraOf()).mainBy, undefined); // ยังไม่เคยเลือก = รูปแรกที่อัปโหลด
  assert.equal((await veraOf()).main.src, hang);
  ai.pick = byColor(2, 'รูปหน้าตรง พื้นเรียบ');
  let picked = await change({ action: 'auto-main', group: hang });
  assert.equal(picked.status, 200);
  assert.equal(picked.body.patch.productMain, clean);
  assert.deepEqual(picks.at(-1), { n: 3, what: 'a structured handbag', name: 'vera hanging' }); // ส่งรูปย่อทุกรูป + ประเภทสินค้า
  let vera = await veraOf();
  assert.equal(vera.main.src, clean);
  assert.equal(vera.mainBy, 'ai');
  assert.equal(vera.mainNote, 'รูปหน้าตรง พื้นเรียบ');
  // ผู้ใช้กดเลือกเอง -> AI ไม่เปลี่ยนทับ และไม่ถูกเรียก
  await change({ action: 'main', group: hang, src: side });
  assert.equal((await veraOf()).mainBy, 'user');
  assert.equal((await veraOf()).mainNote, undefined);
  let calls = picks.length;
  assert.deepEqual((await change({ action: 'auto-main', group: hang })).body.patch, {});
  assert.equal(picks.length, calls);
  assert.equal((await veraOf()).main.src, side);
  // นำรูปหลักที่เลือกเองออก -> ถือว่ายังไม่ได้เลือก AI เลือกใหม่ได้
  await change({ action: 'remove', group: hang, src: side });
  assert.equal((await veraOf()).mainBy, undefined);
  ai.pick = byColor(2, 'เห็นทั้งใบ');
  assert.equal((await change({ action: 'auto-main', group: hang })).body.patch.productMain, clean);
  await change({ action: 'restore', group: hang, src: side });
  // ระหว่างรอ AI ผู้ใช้กดเลือกเอง -> ไม่ทับ
  ai.pick = async (images) => { await change({ action: 'main', group: hang, src: hang }); return byColor(2, 'x')(images); };
  assert.deepEqual((await change({ action: 'auto-main', group: hang })).body.patch, {});
  vera = await veraOf();
  assert.equal(vera.main.src, hang);
  assert.equal(vera.mainBy, 'user');
  // AI ตอบไม่ได้ -> ใช้รูปหลักเดิม ไม่ error
  await storage.updateMeta(hang, { productMainBy: 'ai' });
  ai.pick = async () => null;
  picked = await change({ action: 'auto-main', group: hang });
  assert.equal(picked.status, 200);
  assert.deepEqual(picked.body.patch, {});
  assert.equal((await veraOf()).main.src, hang);
  // รูปหลักจากก่อนมีระบบนี้ (productMain ไม่มี productMainBy) = ผู้ใช้เลือกเอง
  await storage.updateMeta(hang, { productMain: clean, productMainBy: '' });
  assert.equal((await veraOf()).mainBy, 'user');
  calls = picks.length;
  assert.deepEqual((await change({ action: 'auto-main', group: hang })).body.patch, {});
  assert.equal(picks.length, calls);
  // รูปที่เปิดไม่ได้ไม่ส่งให้ AI (รูปทดสอบด้านบนเป็นข้อความ ไม่ใช่รูป)
  const broken = (await read()).find((g) => g.id === black);
  calls = picks.length;
  await storage.updateMeta(black, { productMain: '', productMainBy: '' });
  assert.deepEqual((await change({ action: 'auto-main', group: black })).body.patch, {});
  assert.equal(picks.length, calls);
  assert(broken.photos.length >= 2);
  console.log('Product groups passed: real metadata persistence, legacy uploads, isolated references, main photo, rename, views, move, remove/restore, empty groups, validation, and AI main-photo choice (never over the user\'s own pick).');
} finally { await fs.rm(root, { recursive: true, force: true }); }
