// ทดสอบคำสั่งและ validation ของประเภทภาพ โดยไม่เรียก AI หรือเขียนคลังรูปจริง
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const cache = new Map();
const calls = [];
const planned = [];
const ai = {
  availableModels: () => [{ id: 'test:image' }],
  describeLighting: async () => 'soft daylight',
  planStyling: async (input) => { planned.push(input); return { en: 'a small pear beside the product', th: 'ลูกแพร์', style: 'fruit' }; },
  generateImage: async (_model, images, prompt) => { calls.push({ images, prompt }); return { data: 'output', mime: 'image/jpeg' }; },
};
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mocks = {
    'server-only': {}, '@/lib/ai': ai,
    '@/lib/catalog': { isGpt25: () => false, GPT25_SIZES: {} },
    '@/lib/images': { cropTo: async (o) => o, servable: async (o) => o },
    '@/lib/route': { post: (handler) => handler, json: (status, body) => ({ status, body }) },
    '@/lib/storage': { saveImage: async () => '/test/result.jpg' },
    '@/lib/genlog': { localTime: () => 'test', sentences: (s) => s, writeGenerateLog: async () => {} },
  };
  new Function('require', 'module', 'exports', code)((id) => {
    if (id in mocks) return mocks[id];
    if (id === '@/lib/creative') return load('lib/creative.ts');
    if (id === '@/lib/packshot') return load('lib/packshot.ts');
    if (id === '@/lib/packshot-prompts') return load('lib/packshot-prompts.ts');
    return require(id);
  }, loaded, loaded.exports);
  cache.set(file, loaded.exports);
  return loaded.exports;
}
const catalog = load('lib/packshot.ts');
const { POST } = load('app/api/packshot/route.ts');
const base = { model: 'test:image', product: 'primary', product_type: 'bag', aspect: '1:1' };
async function shoot(options) {
  calls.length = 0;
  planned.length = 0;
  const result = await POST({ ...base, ...options });
  return { result, call: calls[0] };
}
assert.equal(catalog.SHOT_TYPES.length, 6);
assert.deepEqual(catalog.PRODUCT_SET_SHOTS.map((s) => s.id), ['front', 'back', 'side', 'three-quarter', 'top', 'bottom']);
for (const shot of catalog.SHOT_TYPES) {
  const preset = catalog.productPreset('clean');
  assert(catalog.shotSets(shot.id).some((s) => s.id === preset.set));
  assert(catalog.shotFramings(shot.id).length > 0);
}
let out = await shoot({ shot_type: 'clean', preset: 'still-life', props: 'fruit', set_id: 'plinth', framing: 'detail', ref: 'foreign' });
assert.equal(out.result.status, 200);
assert.match(out.call.prompt, /No props/);
assert.match(out.call.prompt, /seamless paper backdrop/);
assert.doesNotMatch(out.call.prompt, /Props:|reference photo by another brand|a close-up crop/);
assert.equal(out.call.images.length, 1);
out = await shoot({ shot_type: 'detail', detail_target: 'zipper', support_images: ['detail-photo'] });
assert.match(out.call.prompt, /Focus specifically on the existing zipper/);
assert.match(out.call.prompt, /Images 2 are additional photographs/);
assert.equal(out.call.images[1].data, 'detail-photo');
out = await shoot({ shot_type: 'detail', detail_target: 'feature', feature: ' ' });
assert.equal(out.result.status, 400);
assert.equal(calls.length, 0);
for (const dims of [{}, { width: -1, height: 20, depth: 5 }, { width: 'Infinity', height: 20, depth: 5 }]) {
  out = await shoot({ shot_type: 'scale', dimensions: dims });
  assert.equal(out.result.status, 400);
  assert.equal(calls.length, 0);
}
const dimensions = { width: 30, height: 20, depth: 10 };
out = await shoot({ shot_type: 'scale', dimensions, scale_reference: 'hand' });
assert.equal(out.result.status, 200);
assert.match(out.call.prompt, /width 30 cm, height 20 cm, depth 10 cm/);
assert.match(out.call.prompt, /natural holding contact is allowed/);
assert.doesNotMatch(out.call.prompt, /No props: nothing|product rests on the surface with real weight/);
out = await shoot({ shot_type: 'scale', dimensions, scale_reference: 'laptop' });
assert.equal(out.result.status, 400);
out = await shoot({ shot_type: 'scale', dimensions, scale_reference: 'laptop', reference_size: { width: 31, depth: 22 } });
assert.match(out.call.prompt, /Laptop body width 31 cm and depth 22 cm/);
for (const angle of catalog.PRODUCT_SET_SHOTS.slice(1)) {
  out = await shoot({ shot_type: 'multi', set_ref: 'hero', set_shot: angle.id, support_images: ['back-photo'] });
  assert.equal(out.result.status, 200);
  assert.deepEqual(out.call.images.map((i) => i.data), ['hero', 'primary', 'back-photo']);
  assert.match(out.call.prompt, /same light and the same color grading/);
  assert.match(out.call.prompt, /Images 3 are additional photographs/);
  assert.match(out.call.prompt, new RegExp(catalog.PRODUCT_ANGLES.find((a) => a.id === angle.angle).prompt.slice(0, 35)));
}
out = await shoot({ shot_type: 'styled', preset: 'still-life', ref: 'style', ref_mode: 'light', set_image: 'scene', support_images: ['detail-photo'] });
assert.equal(out.result.status, 200);
assert.deepEqual(out.call.images.map((i) => i.data), ['primary', 'style', 'scene', 'detail-photo']);
assert.match(out.call.prompt, /Images 4 are additional photographs/);
assert.match(out.call.prompt, /Props: a small pear/);
out = await shoot({ shot_type: 'unknown' });
assert.equal(out.result.status, 400);
// มุมกล้องต้องตรงกับประเภทภาพ และบังคับอัตโนมัติแม้ส่งค่ามุมเก่ามา
assert.deepEqual(catalog.shotAngles('clean').map((a) => a.id), ['front', 'three-quarter', 'side', 'back', 'top', 'bottom']);
assert.deepEqual(catalog.shotAngles('styled').map((a) => a.id), ['front', 'three-quarter', 'side', 'above', 'top', 'low']);
assert.equal(catalog.resolveProductAngle('clean', 'low', 'low').id, 'front');
assert.equal(catalog.resolveProductAngle('styled', null, 'three-quarter').id, 'three-quarter');
assert.equal(catalog.resolveProductAngle('styled', null, 'high').id, 'above');
assert.equal(catalog.resolveProductAngle('multi', 'back', 'side').id, 'front');
out = await shoot({ shot_type: 'clean', angle: 'low' });
assert.doesNotMatch(out.call.prompt, /looking slightly up|monumental/);
out = await shoot({ shot_type: 'detail', detail_target: 'logo', angle: 'bottom' });
assert.match(out.call.prompt, /face a logo or flat marking straight on/);
assert.match(out.call.prompt, /Focus specifically on the existing logo/);
assert.doesNotMatch(out.call.prompt, /bottom or sole faces the camera/);
out = await shoot({ shot_type: 'scale', dimensions, scale_reference: 'paper', angle: 'low' });
assert.match(out.call.prompt, /camera directly overhead/);
assert.match(out.call.prompt, /same plane, both completely visible/);
assert.match(out.call.prompt, /lies flat/);
out = await shoot({ shot_type: 'scale', dimensions, scale_reference: 'person', angle: 'top' });
assert.match(out.call.prompt, /camera level with the middle of the product/);
assert.match(out.call.prompt, /naturally held or worn/);
assert.doesNotMatch(out.call.prompt, /true flat lay/);
out = await shoot({ shot_type: 'styled', preset: 'still-life', angle: 'low' });
assert.match(out.call.prompt, /looking slightly up/);
// ฉาก สี และแสงต้องเป็นคู่เดียวกันในหน้าเว็บและ API
const studio = catalog.productPreset('clean');
assert.deepEqual(catalog.sceneColors('clean', catalog.SETS.find((s) => s.id === 'cove')).map((c) => c.id), ['white', 'light-grey', 'cream']);
assert.equal(catalog.resolveProductBackground('clean', studio, 'plinth', 'charcoal', null).set.id, 'cove');
assert.equal(catalog.resolveProductBackground('clean', studio, null, 'charcoal', null).color.id, 'white');
assert.equal(catalog.resolveProductBackground('detail', studio, 'plywood', 'blush', null).set.id, 'cove');
assert.equal(catalog.resolveProductBackground('detail', studio, null, null, null).colors.length, 0);
for (const reference of ['paper', 'laptop']) {
  const background = catalog.resolveProductBackground('scale', studio, 'plinth', 'cream', null, reference);
  assert.equal(background.set.id, 'table');
  assert.equal(background.light.id, 'softbox');
}
for (const reference of ['hand', 'person']) assert.equal(catalog.resolveProductBackground('scale', studio, 'table', 'white', null, reference).set.id, 'cove');
const styledPreset = catalog.productPreset('still-life');
assert.equal(catalog.resolveProductBackground('styled', styledPreset, 'dark-fabric', 'white', null).light.id, 'flash');
assert.equal(catalog.resolveProductBackground('styled', styledPreset, 'dark-fabric', 'white', 'window').light.id, 'window');
assert.equal(catalog.resolveProductBackground('styled', styledPreset, 'plywood', 'lilac', null).color.id, 'match');
assert.equal(catalog.resolveProductBackground('styled', styledPreset, 'plywood', null, null).light.id, 'window');
out = await shoot({ shot_type: 'clean', set_id: 'plinth', set_color: 'charcoal' });
assert.match(out.call.prompt, /backdrop in pure neutral white/);
out = await shoot({ shot_type: 'detail', set_id: 'linen', set_color: 'blush' });
assert.match(out.call.prompt, /plain, visually quiet neutral background, softly out of focus/);
assert.doesNotMatch(out.call.prompt, /crumpled cotton bedsheet/);
out = await shoot({ shot_type: 'scale', dimensions, scale_reference: 'laptop', reference_size: { width: 31, depth: 22 }, set_id: 'plinth' });
assert.match(out.call.prompt, /matte white tabletop/);
out = await shoot({ shot_type: 'styled', set_id: 'plywood', set_color: 'match' });
assert.match(out.call.prompt, /visible luminance contrast/);
out = await shoot({ shot_type: 'styled', set_image: 'uploaded-room', light: 'flash', support_images: ['side'] });
assert.match(out.call.prompt, /horizon, vanishing points and camera perspective/);
assert.match(out.call.prompt, /natural contact shadow/);
assert.doesNotMatch(out.call.prompt, /direct on-camera flash/);
assert.deepEqual(out.call.images.map((i) => i.data), ['primary', 'uploaded-room', 'side']);
// ภาพ Creative ต้องใช้คอนเซปต์ที่เลือก โดยไม่ถูก preset packshot ทับ
const creative = { id: 'test', title: 'Silver Study', summary: 'จัดขวดบนถาดเงินและกระจก', palette: ['#ccddee', '#eeeeee', '#777777'],
  scene: 'ฉากฟ้าเทา ถาดเงิน', props: 'ถาดเงินและกระจก', lighting: 'แสงหน้าต่างด้านซ้าย', composition: 'ขวดเด่นด้านหน้า',
  prompt: 'An editorial photograph of the exact product standing on a polished silver tray, with a small tilted mirror behind it, on a cool blue-grey seamless set. Soft window light from the left creates controlled reflections, with a 70mm lens and a slightly elevated camera. The label stays readable and the product is the hero.' };
out = await shoot({ shot_type: 'creative' });
assert.equal(out.result.status, 400);
assert.equal(calls.length, 0);
out = await shoot({ shot_type: 'creative', creative_concept: creative, props: 'fruit', set_id: 'plywood', angle: 'low', support_images: ['back'] });
assert.equal(out.result.status, 200);
assert.match(out.call.prompt, /Selected art direction: An editorial photograph/);
assert.match(out.call.prompt, /polished silver tray/);
assert.doesNotMatch(out.call.prompt, /No props:|raw plywood|camera low|One very large, soft/);
assert.deepEqual(out.call.images.map((i) => i.data), ['primary', 'back']);
assert.equal(out.result.body.stylePlan.name, creative.title);
out = await shoot({ shot_type: 'creative', creative_concept: { ...creative, palette: ['invalid'] } });
assert.equal(out.result.status, 400);
// พร็อพ: ทุกแนวอยู่ในกลุ่มเดียวของหน้าเว็บ · พร็อพของฉัน (พิมพ์/รูป) เรียงรูปถูกต้องและใช้เฉพาะ Custom
const grouped = catalog.PROP_GROUPS.flatMap((g) => g.ids);
assert.equal(new Set(grouped).size, grouped.length);
assert.deepEqual([...grouped].sort(), catalog.PROP_STYLES.filter((p) => p.id !== catalog.NO_PROPS).map((p) => p.id).sort());
for (const style of catalog.PROP_STYLES.filter((p) => p.id !== catalog.NO_PROPS)) assert(style.brief && style.moments.length >= 4, style.id);
out = await shoot({ shot_type: 'styled', props: 'ceramics', set_image: 'scene', prop_text: ' cream ceramic cup ', prop_image: 'prop-photo', support_images: ['detail-photo'] });
assert.equal(out.result.status, 200);
assert.deepEqual(out.call.images.map((i) => i.data), ['primary', 'scene', 'prop-photo', 'detail-photo']);
assert.match(out.call.prompt, /Image 3 is the user's own prop: include this exact object/);
assert.match(out.call.prompt, /Images 4 are additional photographs/);
assert.match(out.call.prompt, /One of the props is the user's own prop \(cream ceramic cup\), the exact object from the prop photo/);
assert.match(out.call.prompt, /Apart from the user's own prop, props carry no logos/);
// มีพร็อพ: จัดเป็นกลุ่มกลางภาพ และสินค้าเล็กลง (withProps) ให้พร็อพไม่โดนตัดที่ขอบ · ไม่มีพร็อพ: สินค้ากลางภาพขนาดเดิม
assert.match(out.call.prompt, /composed together as one balanced group in the middle of the frame/);
assert.match(out.call.prompt, /about 75 percent of the frame width, its whole silhouette inside the frame, its props grouped close/);
assert.match(out.call.prompt, /one cohesive, intentional still life/);
assert.equal(planned[0].ownProp, 'cream ceramic cup');
assert.equal(planned[0].propImage.data, 'prop-photo');
out = await shoot({ shot_type: 'styled', props: 'none', prop_text: 'a lavender sprig' });
assert.match(out.call.prompt, /Props: Only the user's own prop \(a lavender sprig\), placed beside the product/);
assert.doesNotMatch(out.call.prompt, /Image 2 is the user's own prop/);
assert.equal(planned.length, 0);
out = await shoot({ shot_type: 'clean', prop_text: 'a cup', prop_image: 'prop-photo' });
assert.equal(out.call.images.length, 1);
assert.doesNotMatch(out.call.prompt, /own prop/);
out = await shoot({ shot_type: 'styled', props: 'none', framing: 'medium' });
assert.match(out.call.prompt, /the product about 60 percent of the frame width, with some space of the set around it, the product centered horizontally/);
assert.match(out.call.prompt, /No props: nothing in the frame/);
console.log('Packshot workflow checks passed: shot constraints, validation, scale, detail, six angles, image ordering, styled references, prop groups and own props.');
