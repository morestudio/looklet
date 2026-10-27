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
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const customRequire = (id) => {
    if (id === 'server-only') return {};
    if (id === './storage-supabase') return { supabaseEnabled: false };
    if (id === '@/lib/route') return { post: (fn) => fn, json };
    if (id.startsWith('@/lib/')) return load(id.slice(2) + '.ts');
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
  console.log('Product groups passed: real metadata persistence, legacy uploads, isolated references, main photo, rename, views, move, remove/restore, empty groups, and validation.');
} finally { await fs.rm(root, { recursive: true, force: true }); }
