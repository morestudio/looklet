// product page recipe (lib/packshot-recipe.ts): stored -> loaded keeps every field; old / bad / deleted values fall back as documented
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const loaded = { exports: {} };
  cache.set(file, loaded.exports);
  const code = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)((id) => {
    if (id.startsWith('./')) return load('lib/' + id.slice(2) + '.ts');
    return require(id);
  }, loaded, loaded.exports);
  cache.set(file, loaded.exports);
  return loaded.exports;
}
const { readRecipe } = load('lib/packshot-recipe.ts');
const { recipeKey } = load('lib/recipe.ts');

const BAG = '/api/files/uploads/products/bag.jpg';
const lists = {
  product: [
    { name: 'กระเป๋า', src: BAG, productGroupName: 'กระเป๋า', productGroupType: 'bag' },
    { name: 'ด้านหลัง', src: '/api/files/uploads/products/bag-back.jpg', productGroup: BAG },
  ],
  ref: [{ name: 'แรงบันดาลใจ', src: '/api/files/uploads/product-refs/mood.jpg' }],
  scene: [{ name: 'ห้องนั่งเล่น', src: '/api/files/uploads/product-scenes/room.jpg' }],
  prop: [{ name: 'แก้วแบรนด์', src: '/api/files/uploads/product-props/cup.jpg' }],
};
const concept = {
  id: 'idea-1', title: 'Quiet Morning', summary: 'วางบนโต๊ะไม้ แสงเช้า', palette: ['#f2e8dc', '#8a6a4f'],
  scene: 'โต๊ะไม้โอ๊ค', props: 'แก้วกาแฟ', lighting: 'แสงหน้าต่าง', composition: 'กึ่งกลาง',
  prompt: 'A calm morning still life of the product on an oak table, soft window light from the left, warm neutral palette.',
};
// every field set to a non-default value; a new Recipe field must be added here (checked below)
const full = {
  pick: { product: BAG, ref: lists.ref[0].src, scene: lists.scene[0].src, prop: lists.prop[0].src },
  shotType: 'creative', idea: 'เช้าวันหยุด', facts: 'หนังแท้', concept,
  detailTarget: 'logo', feature: 'ซิปหน้า', scaleRef: 'laptop', handPose: 'chest',
  dimensions: { width: '30', height: '20', depth: '10' }, referenceSize: { width: '31', depth: '22' }, extraAngles: ['top'],
  scene: 'plywood', color: 'match', props: 'fruit', propText: 'ช่อลาเวนเดอร์', angle: 'custom', turn: { yaw: -40, elev: 25 },
  framing: 'close', refMode: 'light', aspect: '9:16', quality: 'medium', extra: 'สายพาดลงพื้น',
};
const stored = (r) => JSON.parse(JSON.stringify(r)); // as saved to meta.recipe and read back from /api/library

// 1. stored -> loaded: same recipe, nothing missing
{
  const { recipe, missing } = readRecipe(stored(full), lists);
  assert.deepEqual(missing, []);
  assert.equal(recipeKey(recipe), recipeKey(full));
  assert.deepEqual(Object.keys(recipe).sort(), Object.keys(full).sort(), 'full fixture must set every Recipe field');
}

// 2. each open shot type loads as itself
for (const shotType of ['clean', 'styled', 'creative', 'handshot']) {
  assert.equal(readRecipe(stored({ ...full, shotType }), lists).recipe.shotType, shotType);
}

// 3. older / partial recipe: missing fields get the page's defaults
{
  const { recipe, missing } = readRecipe({ pick: { product: BAG }, shotType: 'styled' }, lists);
  assert.deepEqual(missing, []);
  assert.deepEqual(recipe, {
    pick: { product: BAG, ref: null, scene: null, prop: null }, shotType: 'styled', idea: '', facts: '', concept: null,
    detailTarget: 'texture', feature: '', scaleRef: 'hand', handPose: 'hold',
    dimensions: { width: '', height: '', depth: '' }, referenceSize: { width: '', depth: '' }, extraAngles: [],
    scene: 'preset', color: 'white', props: 'none', propText: '', angle: 'preset', turn: null,
    framing: 'preset', refMode: 'shot', aspect: '1:1', quality: 'high', extra: '',
  });
}

// 4. unknown ids / bad values fall back; turn is clamped
{
  const { recipe } = readRecipe({ ...stored(full), shotType: 'nope', scene: 'moon', aspect: '7:3', props: 123, turn: { yaw: 999, elev: -5 }, extraAngles: ['top', 'x'] }, lists);
  assert.equal(recipe.shotType, 'clean');
  assert.equal(recipe.scene, 'preset');
  assert.equal(recipe.aspect, '1:1');
  assert.equal(recipe.props, 'none');
  assert.deepEqual(recipe.turn, { yaw: 180, elev: 0 });
  assert.deepEqual(recipe.extraAngles, ['top']);
}

// 5. deleted product / uploads and a broken idea -> null + the step listed in missing
{
  const empty = { product: [], ref: [], scene: [], prop: [] };
  const { recipe, missing } = readRecipe({ ...stored(full), concept: { id: 'x' } }, empty);
  assert.deepEqual(recipe.pick, { product: null, ref: null, scene: null, prop: null });
  assert.equal(recipe.concept, null);
  assert.deepEqual([...missing].sort(), ['creative', 'product', 'props', 'set']);
}

// 6. not an object -> all defaults, no throw
assert.equal(readRecipe({}, lists).recipe.shotType, 'clean');

// 7. recipeKey ignores field order and sees every change
assert.equal(recipeKey({ a: 1, b: { c: 2, d: 3 } }), recipeKey({ b: { d: 3, c: 2 }, a: 1 }));
assert.notEqual(recipeKey(full), recipeKey({ ...full, extra: 'อื่น' }));

console.log('Packshot recipe checks passed: round trip, shot types, old recipes, bad values, deleted uploads, key order.');
