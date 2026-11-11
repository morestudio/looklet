// history <-> gallery flags (/api/update inGallery/inHistory, /api/delete from) on real local storage in a temp dir; no AI, no user data
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const root = await fs.mkdtemp(path.join(tmpdir(), 'looklet-gallery-save-'));
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
    if (id === './images') return load('lib/images.ts');
    if (id === './account') return load('lib/account.ts');
    if (id === 'node:os') return { ...require('node:os'), homedir: () => root }; // no root/.Trash -> deleteImage unlinks inside the temp dir
    if (id === '@/lib/route') return { post: (fn) => fn, json };
    if (id.startsWith('@/lib/')) return load(id.slice(2) + '.ts');
    if (id === './aspects') return load('lib/aspects.ts');
    if (id === './turntable') return load('lib/turntable.ts');
    return require(id);
  };
  new Function('require', 'module', 'exports', 'process', code)(customRequire, loaded, loaded.exports, { cwd: () => root });
  modules.set(file, loaded.exports);
  return loaded.exports;
}
try {
  const storage = load('lib/storage.ts');
  const update = load('app/api/update/route.ts').POST;
  const del = load('app/api/delete/route.ts').POST;
  const make = () => storage.saveImage({ area: 'results' }, 'aW1hZ2U=', 'image/png', { caption: 'test' });
  const meta = async (src) => (await storage.listImages({ area: 'results' })).find((r) => r.src === src);

  // history only: remove from history = file gone
  const a = await make();
  let out = await del({ src: a, from: 'history' });
  assert.deepEqual([out.status, out.body.fileDeleted], [200, true]);
  assert.equal(await meta(a), undefined);

  // both places: remove from history, then from the gallery = file gone
  const b = await make();
  await storage.updateMeta(b, { favorite: true });
  assert.equal((await update({ src: b, inGallery: true })).status, 200);
  let m = await meta(b);
  assert.equal(m.inGallery, true);
  assert.equal(m.favorite, false); // added without ♡
  assert.equal(typeof m.addedToGalleryAt, 'number');
  out = await del({ src: b, from: 'history' });
  assert.deepEqual([out.status, out.body.fileDeleted], [200, false]);
  assert.equal((await meta(b)).inHistory, false);
  out = await del({ src: b, from: 'gallery' });
  assert.deepEqual([out.status, out.body.fileDeleted], [200, true]);
  assert.equal(await meta(b), undefined);

  // both places: remove from the gallery clears ♡, keeps the file
  const c = await make();
  await update({ src: c, inGallery: true });
  await update({ src: c, favorite: true });
  out = await del({ src: c, from: 'gallery' });
  assert.deepEqual([out.status, out.body.fileDeleted], [200, false]);
  m = await meta(c);
  assert.deepEqual([m.inGallery, m.favorite], [false, false]);

  // gallery ✎ on a gallery-only image: back into history
  const d = await make();
  await update({ src: d, inGallery: true });
  await del({ src: d, from: 'history' });
  assert.equal((await update({ src: d, inHistory: true })).status, 200);
  assert.equal((await meta(d)).inHistory, true);

  // only results take these fields; unknown image -> 404; no `from` keeps the old delete
  assert.equal((await update({ src: '/api/files/uploads/models/x.png', inGallery: true })).status, 400);
  assert.equal((await del({ src: '/api/files/results/missing.png', from: 'history' })).status, 404);
  assert.equal((await del({ src: d })).body.fileDeleted, true);
  console.log('gallery save: ok');
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
