// model page recipe (lib/tryon-recipe.ts): stored -> loaded keeps every field; old / bad / deleted values fall back as documented
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
const { readRecipe, START, idOf } = load('lib/tryon-recipe.ts');
const { recipeKey, storableRecipe } = load('lib/recipe.ts');
const { DEFAULT_AI_MODEL: MODEL, MODELS } = load('lib/catalog.ts');

const up = (kind, name) => ({ name, src: `/api/files/uploads/${kind}/${name}.jpg` });
const lists = {
  model: [...MODELS, up('models', 'nina')],
  outfit: [up('outfits', 'dress'), { ...up('outfits', 'shirt'), type: 'top' }, { ...up('outfits', 'jeans'), type: 'bottom' }],
  accessory: [up('accessories', 'bag'), up('accessories', 'hat'), { ...up('accessories', 'sneaker'), type: 'shoes' }],
  pose: [up('poses', 'lean')],
  scene: [up('scenes', 'cafe'), { name: 'ห้องสีขาว' }],
};
const id = (key, i) => idOf(lists[key][i]);
// every field set to a non-default value; a new Recipe field must be added here (checked below)
const full = {
  pick: { model: id('model', MODELS.length), outfit: null, accessory: [id('accessory', 0), id('accessory', 1)], pose: id('pose', 0), scene: id('scene', 0),
    top: id('outfit', 1), bottom: id('outfit', 2), shoes: id('accessory', 2) },
  preset: 'golden', framing: 'waist', angle: 'low', placement: 'left', poseMode: 'shot-scene', light: 'preset', mood: 'soft',
  aspect: '9:16', quality: 'xhigh', extra: 'ยิ้มเล็กน้อย', harmonize: true, gaze: 'away', props: ['coffee'], background: 'keep', goal: 'editorial', autoRepair: false,
};
const stored = (r) => JSON.parse(JSON.stringify(r)); // as saved to meta.recipe and read back from /api/library

// 1. stored -> loaded: same recipe, nothing missing
{
  const { recipe, missing } = readRecipe(stored(full), lists, MODEL);
  assert.deepEqual(missing, []);
  assert.equal(recipeKey(recipe), recipeKey(full));
  assert.deepEqual(Object.keys(recipe).sort(), Object.keys(full).sort(), 'full fixture must set every Recipe field');
  // whole outfit and text scene round-trip too
  const whole = { ...full, pick: { ...full.pick, outfit: id('outfit', 0), top: null, bottom: null, scene: 'ห้องสีขาว', pose: 'preset:lean' } };
  assert.equal(recipeKey(readRecipe(stored(whole), lists, MODEL).recipe), recipeKey(whole));
}

// 2. older / partial recipe: missing fields get the page-open values
{
  assert.deepEqual(readRecipe({}, lists, MODEL).recipe, { ...START, quality: 'high' }, 'empty recipe = page start (quality = the model\'s default)');
  assert.deepEqual(START, { // page-open values, pinned so a changed default shows up here
    pick: { model: idOf(MODELS[0]), outfit: null, accessory: [], pose: null, scene: null, top: null, bottom: null, shoes: null },
    preset: 'normal', framing: 'auto', angle: 'auto', placement: 'auto', poseMode: 'pose', light: 'ref', mood: 'auto',
    aspect: '4:5', quality: 'medium', extra: '', harmonize: false, gaze: '', props: [], background: 'explore', goal: 'lifestyle', autoRepair: true,
  });
}

// 3. unknown ids / bad values fall back
{
  const { recipe } = readRecipe({ ...stored(full), preset: 'moon', framing: 'x', poseMode: 'copy', aspect: '7:3', gaze: 1, props: ['coffee', 'gun'], background: 'x', goal: 'x', harmonize: 'yes', autoRepair: 0 }, lists, MODEL);
  assert.equal(recipe.preset, 'normal');
  assert.equal(recipe.framing, 'auto');
  assert.equal(recipe.poseMode, 'pose');
  assert.equal(recipe.aspect, '4:5');
  assert.equal(recipe.gaze, '');
  assert.deepEqual(recipe.props, ['coffee']);
  assert.equal(recipe.background, 'explore');
  assert.equal(recipe.goal, 'lifestyle');
  assert.equal(recipe.harmonize, false, 'only true turns harmonize on');
  assert.equal(recipe.autoRepair, true, 'only false turns auto repair off');
  // quality the current model doesn't offer -> that model's default
  assert.equal(readRecipe({ quality: 'low' }, lists, 'openai:gpt-image-2.5-sunburst').recipe.quality, 'high');
  assert.equal(readRecipe({ quality: 'max' }, lists, 'gemini:gemini-3.1-flash-image').recipe.quality, 'medium');
}

// 4. deleted uploads -> null (model -> first model) + the step listed in missing; pose presets aren't uploads
{
  const empty = { model: MODELS, outfit: [], accessory: [], pose: [], scene: [] };
  const { recipe, missing } = readRecipe(stored(full), empty, MODEL);
  assert.deepEqual(recipe.pick, { model: idOf(MODELS[0]), outfit: null, accessory: [], pose: null, scene: null, top: null, bottom: null, shoes: null });
  assert.deepEqual([...missing].sort(), ['accessory', 'model', 'outfit', 'pose', 'scene']);
  assert.equal(readRecipe({ pick: { pose: 'preset:sit' } }, empty, MODEL).recipe.pick.pose, 'preset:sit');
  // one of two accessories deleted: the other stays
  const one = readRecipe(stored(full), { ...lists, accessory: [lists.accessory[1], lists.accessory[2]] }, MODEL);
  assert.deepEqual(one.recipe.pick.accessory, [id('accessory', 1)]);
  assert.deepEqual(one.missing, ['accessory']);
}

// 5. not an object pick -> defaults, no throw
assert.equal(readRecipe({ pick: 'x' }, lists, MODEL).recipe.pick.model, idOf(MODELS[0]));

// 6. longest recipe the page can make is still stored (สั่งเพิ่มเติม at its maxLength, every accessory and prop)
{
  const longest = { ...full, extra: 'ก'.repeat(1000), props: lists.accessory.map(() => 'coffee'),
    pick: Object.fromEntries(Object.entries(full.pick).map(([k, v]) => [k, Array.isArray(v) ? Array(6).fill('/api/files/uploads/accessories/' + 'ก'.repeat(120) + '.jpg') : '/api/files/uploads/x/' + 'ก'.repeat(120) + '.jpg'])) };
  assert.ok(storableRecipe(longest), `longest recipe (${JSON.stringify(longest).length} chars) must fit MAX_RECIPE_CHARS`);
}

console.log('TryOn recipe checks passed: round trip, old recipes, bad values, deleted uploads, longest recipe stored.');
