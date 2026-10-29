// ทดสอบ mask, feather, API และไฟล์ lossless โดยไม่เรียก AI จริง
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const cache = new Map();
const saved = [], calls = [], logs = [], usages = [];
let sourceMeta, imageRead, editedOutput, rejectFidelity = false, echo = false; // echo = AI ที่ไม่แก้อะไร ส่งรูปแรกที่ได้รับกลับ
const providerFetch = async (_url, options) => {
  const form = options.body;
  calls.push({ prompt: form.get('prompt'), mask: form.get('mask'), fidelity: form.get('input_fidelity'), image: form.getAll('image[]') });
  if (rejectFidelity && form.get('input_fidelity')) return { ok: false, status: 400, json: async () => ({ error: { message: 'input_fidelity is unsupported' } }) };
  const output = echo ? Buffer.from(await form.getAll('image[]')[0].arrayBuffer()) : editedOutput;
  return { ok: true, json: async () => ({ data: [{ b64_json: output.toString('base64') }], usage: { total_tokens: 4116 } }) }; // โทเคนจริงของรูป high 1664×2496
};
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', 'process', 'fetch', code)((id) => {
    if (id === 'server-only') return {};
    if (id === '@/lib/route') return { post: (fn) => fn, get: (fn) => fn, json: (status, body) => ({ status, body }), signedIn: async () => null };
    if (id === '@/lib/usage') return { quotaBlock: async () => null, recordUsage: async (entry) => usages.push(entry) };
    if (id === '@/lib/storage') return { readImage: async () => imageRead, listImages: async () => sourceMeta ? [sourceMeta] : [],
      saveImage: async (where, data, mime, meta) => { saved.push({ where, data, mime, meta }); return '/api/files/results/new.png'; } };
    if (id === '@/lib/genlog') return { localTime: () => 'test', sentences: (s) => [s], writeGenerateLog: async (log) => logs.push(log) };
    if (id.startsWith('@/')) return load(id.slice(2) + '.ts');
    if (id.startsWith('.')) return load(path.posix.normalize(path.posix.join(path.posix.dirname(file), id)) + '.ts');
    return require(id);
  }, loaded, loaded.exports, { env: { OPENAI_API_KEY: 'fake-test-key' } }, providerFetch);
  cache.set(file, loaded.exports); return loaded.exports;
}
const { prepareLocalEdit, blendLocalEdit, roughEditGuide, editCanvas } = load('lib/local-edit-images.ts');
// สัดส่วนที่ส่งให้ AI: เติมขอบ ไม่ยืด (รูปสินค้า 4:5 -> 2:3 เติมบนล่าง 208px) · สัดส่วนตรงอยู่แล้ว = ไม่เติม
assert.deepEqual(editCanvas(1664, 2080, '1664x2496'), { width: 1664, height: 2496, left: 0, top: 208, source: { width: 1664, height: 2080 } });
assert.deepEqual(editCanvas(1664, 2496, '1664x2496'), { width: 1664, height: 2496, left: 0, top: 0, source: { width: 1664, height: 2496 } });
assert.deepEqual(editCanvas(2048, 1365, '2496x1664'), { width: 2048, height: 1365, left: 0, top: 0, source: { width: 2048, height: 1365 } });
assert.deepEqual(editCanvas(1000, 1000, '1536x1024'), { width: 1500, height: 1000, left: 250, top: 0, source: { width: 1000, height: 1000 } });
const { generateImage } = load('lib/ai.ts');
const { supportsMaskedEdit } = load('lib/local-edit.ts');
assert(supportsMaskedEdit('openai:gpt-image-2.5-sunburst'));
assert(!supportsMaskedEdit('gemini:gemini-3.1-flash-image'));
const width = 64, height = 48;
const original = Buffer.alloc(width * height * 4);
const mask = Buffer.alloc(original.length, 255);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const i = (y * width + x) * 4;
  original[i] = (x * 7) % 256; original[i + 1] = (y * 9) % 256; original[i + 2] = (x + y) % 256; original[i + 3] = 255;
  if (x >= 14 && x < 50 && y >= 10 && y < 40) mask[i + 3] = 0;
  if (x >= 28 && x < 32 && y >= 22 && y < 26) mask[i + 3] = 255; // ช่องยางลบต้องไม่เปลี่ยน
}
original[3] = 128;
const png = (data, w = width, h = height) => sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
const source = await png(original);
const maskPng = await png(mask);
editedOutput = await sharp({ create: { width: 32, height: 24, channels: 4, background: '#0033ff' } }).png().toBuffer();
const prepared = await prepareLocalEdit(source, maskPng);
assert.equal(prepared.selectedPixels, 36 * 30 - 4 * 4);
assert.deepEqual(prepared.bounds, { left: 14, top: 10, width: 36, height: 30 });
let changed = 0;
for (const feather of [0, 6, 24]) {
  const result = await blendLocalEdit(prepared, { data: editedOutput.toString('base64'), mime: 'image/png' }, feather);
  assert.equal(result.mime, 'image/png');
  const raw = await sharp(Buffer.from(result.data, 'base64')).ensureAlpha().raw().toBuffer();
  for (let i = 0; i < width * height; i++) {
    if (!prepared.selection[i]) assert.deepEqual(raw.subarray(i * 4, i * 4 + 4), original.subarray(i * 4, i * 4 + 4));
    else if (raw[i * 4] !== original[i * 4]) changed++;
  }
  if (feather === 6) {
    const edge = (10 * width + 14) * 4, center = (18 * width + 22) * 4;
    assert(raw[edge] > 0, 'ขอบนุ่มต้องรักษาบางส่วนของต้นฉบับ');
    assert.equal(raw[center], 0, 'กลางพื้นที่ต้องใช้ผลลัพธ์ AI');
  }
}
assert(changed > 0);
// ระบายว่าง / ไม่ส่งหน้ากาก = ไม่มีไฮไลต์ (แก้จากคำสั่งอย่างเดียว) — route เป็นคนตัดสินว่าโหมดไหนต้องระบาย
assert.equal((await prepareLocalEdit(source, await png(Buffer.alloc(original.length, 255)))).selectedPixels, 0);
assert.equal((await prepareLocalEdit(source, null)).mask, null);
await assert.rejects(prepareLocalEdit(source, await sharp({ create: { width: 10, height: 10, channels: 4, background: '#fff' } }).png().toBuffer()), /ขนาดเท่ารูป/);
await assert.rejects(prepareLocalEdit(source, await sharp({ create: { width, height, channels: 3, background: '#fff' } }).png().toBuffer()), /PNG โปร่งใส/);
const oriented = await sharp(source).jpeg().withMetadata({ orientation: 6 }).toBuffer();
const rotatedMask = await sharp(maskPng).rotate(90).png().toBuffer();
assert.equal((await prepareLocalEdit(oriented, rotatedMask)).width, height);
imageRead = { data: source, type: 'image/png' };
const { POST } = load('app/api/local-edit/route.ts');
const base = { src: '/api/files/results/original.png', model: 'openai:gpt-image-2.5-sunburst', mask: maskPng.toString('base64'), instruction: 'เปลี่ยนบริเวณที่เลือกเป็นสีฟ้า', feather: 6 };
for (const bad of [{ src: 'https://example.com/photo.png' }, { src: '/api/files/uploads/models/image.png' }, { instruction: '' }, { model: 'gemini:gemini-3.1-flash-image' }, { mask: '' }, { feather: -1 }, { mode: 'invalid' }]) {
  assert.equal((await POST({ ...base, ...bad })).status, 400);
}
assert.equal(calls.length, 0);
imageRead = null;
assert.equal((await POST(base)).status, 404);
imageRead = { data: source, type: 'image/png' };
assert.equal((await POST({ ...base, mask: (await png(Buffer.alloc(original.length, 255))).toString('base64') })).status, 400);
assert.equal(calls.length, 0);
rejectFidelity = true;
const out = await POST(base);
assert.equal(out.status, 200);
assert.equal(out.body.editedFrom, base.src);
assert.equal(out.body.finish, 'off');
assert.equal(saved.length, 1);
assert.equal(saved[0].mime, 'image/png');
assert.equal(calls.length, 2);
// รูป 64×48 (4:3) ส่งเป็น 72×48 (3:2 ตามขนาดที่ขอ) เติมซ้ายขวาข้างละ 4px: ขอบที่เติมห้ามแก้ (ทึบ) ส่วนรูปจริงใช้หน้ากากที่ระบายเดิม
const canvas = { width: 72, height: 48, left: 4 };
const rawOf = async (blob) => sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const inner = ({ data }) => { // ตัดส่วนรูปจริงออกจาก canvas
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) data.copy(out, y * width * 4, (y * canvas.width + canvas.left) * 4, (y * canvas.width + canvas.left + width) * 4);
  return out;
};
for (const call of calls) {
  assert.equal(call.mask.type, 'image/png');
  assert.equal(call.image.length, 1);
  const sentMask = await rawOf(call.mask), sentImage = await rawOf(call.image[0]);
  assert.deepEqual([sentMask.info.width, sentMask.info.height, sentImage.info.width, sentImage.info.height], [72, 48, 72, 48]);
  for (let y = 0; y < height; y++) for (let x = 0; x < canvas.width; x++) {
    const inside = x >= canvas.left && x < canvas.left + width;
    assert.equal(sentMask.data[(y * canvas.width + x) * 4 + 3], inside ? mask[(y * width + x - canvas.left) * 4 + 3] : 255);
  }
  assert.deepEqual(inner(sentImage), prepared.original, 'The real image area is sent unscaled');
}
assert.equal(calls[1].fidelity, null);
assert.deepEqual([usages.at(-1).status, usages.at(-1).tokens], ['ok', 4116], 'Real OpenAI token usage reaches the quota, also after the fidelity retry');
const resultRaw = await sharp(Buffer.from(saved[0].data, 'base64')).ensureAlpha().raw().toBuffer();
for (let i = 0; i < width * height; i++) if (!prepared.selection[i]) assert.deepEqual(resultRaw.subarray(i * 4, i * 4 + 4), original.subarray(i * 4, i * 4 + 4));
assert.equal(logs.at(-1).style.operation, 'local-edit');
assert.equal(out.body.page, undefined, 'Model edits must stay in the model library');
sourceMeta = { src: base.src, page: 'product', stylePlan: { name: 'Citrus', th: 'ฉากเลมอน' }, set: { id: 'angles', index: 1 } };
rejectFidelity = false;
const productEdit = await POST(base);
assert.equal(productEdit.status, 200);
assert.equal(productEdit.body.page, 'product');
assert.deepEqual(saved.at(-1).meta.stylePlan, sourceMeta.stylePlan);
assert.equal(saved.at(-1).meta.set, undefined, 'An edit is a new variant, not another angle in the set');
assert.match(calls.at(-1).prompt, /same product.*label, logo/);
sourceMeta = { ...saved.at(-1).meta, src: '/api/files/results/new.png' };
assert.equal((await POST({ ...base, src: sourceMeta.src })).body.page, 'product', 'Repeated edits stay in the product library');

// A rough mark must remain a pointer: no provider mask and no strict paste-back.
const guide = await roughEditGuide(prepared);
const guideRaw = await sharp(Buffer.from(guide.data, 'base64')).ensureAlpha().raw().toBuffer();
for (let i = 0; i < width * height; i++) {
  if (!prepared.selection[i]) assert.deepEqual(guideRaw.subarray(i * 4, i * 4 + 4), original.subarray(i * 4, i * 4 + 4));
}
assert(guideRaw[(12 * width + 16) * 4] > original[(12 * width + 16) * 4], 'The guide contains a translucent red pointer');
rejectFidelity = true;
const beforeRough = calls.length;
const rough = await POST({ ...base, src: sourceMeta.src, mode: 'rough' });
assert.equal(rough.status, 200);
assert.equal(rough.body.page, 'product');
assert.equal(rough.body.editedFrom, sourceMeta.src);
for (const call of calls.slice(beforeRough)) {
  assert.equal(call.mask, null, 'Rough highlights must never be sent as hard masks, including on retry');
  assert.equal(call.image.length, 2);
  assert.deepEqual(inner(await rawOf(call.image[0])), prepared.original, 'Clean source comes first, unscaled');
  assert.deepEqual(inner(await rawOf(call.image[1])), guideRaw);
  assert.match(call.prompt, /NOT edit boundaries/);
  assert.match(call.prompt, /handles and straps/);
  assert.match(call.prompt, /color-only change/);
  assert.match(call.prompt, /Remove all annotation marks/);
}
const roughRaw = await sharp(Buffer.from(saved.at(-1).data, 'base64')).ensureAlpha().raw().toBuffer();
assert.notDeepEqual(roughRaw.subarray(4, 8), original.subarray(4, 8), 'Edits outside the rough brush must not be clipped away');
assert.equal(logs.at(-1).style.mode, 'rough');
// พิมพ์อย่างเดียว (ไม่ระบาย หรือระบายว่าง) แก้ได้: ส่งแค่รูปเดิม 1 รูป ไม่มีภาพไฮไลต์ ไม่มี mask และคำสั่งให้หาเป้าหมายจากข้อความ
for (const mask of [undefined, null, (await png(Buffer.alloc(original.length, 255))).toString('base64')]) {
  const before = calls.length;
  const textOnly = await POST({ ...base, mode: 'rough', mask, instruction: 'เอาพร็อพออก' });
  assert.equal(textOnly.status, 200);
  for (const call of calls.slice(before)) {
    assert.equal(call.mask, null);
    assert.equal(call.image.length, 1, 'Instruction-only edits send just the clean photo');
    assert.deepEqual(inner(await rawOf(call.image[0])), prepared.original);
    assert.match(call.prompt, /Find the object or area that the requested change below refers to/);
    assert.doesNotMatch(call.prompt, /red user highlights|Image 2/);
  }
  assert.equal(logs.at(-1).element.outfit, 'แก้ตามคำสั่งที่พิมพ์ (ไม่ได้ระบาย)');
}
// แบบละเอียด (API เก่า) ยังต้องระบาย: ไม่มีพื้นที่ = ไม่เรียก AI
const callsBeforePrecise = calls.length;
assert.equal((await POST({ ...base, mask: null })).status, 400);
assert.equal((await POST({ ...base, mask: (await png(Buffer.alloc(original.length, 255))).toString('base64') })).status, 400);
assert.equal(calls.length, callsBeforePrecise, 'Precise edits without a selection are rejected before charging');

// ผลลัพธ์ต้องไม่ถูกยืด/บีบ (ผู้ใช้เจอ 28 ต.ค.: ลบพร็อพแล้วกระเป๋ากว้างขึ้น): AI ที่ไม่แก้อะไร ต้องได้รูปเดิมทุกพิกเซลทั้งสองโหมด
echo = true;
rejectFidelity = false;
for (const [mode, mask] of [['precise', base.mask], ['rough', base.mask], ['rough', null]]) {
  assert.equal((await POST({ ...base, mode, mask })).status, 200);
  const raw = await sharp(Buffer.from(saved.at(-1).data, 'base64')).ensureAlpha().raw().toBuffer();
  assert.deepEqual(raw, prepared.original, `${mode}${mask ? '' : ' (text only)'}: geometry and pixels unchanged when the AI changes nothing`);
}
echo = false;

assert.throws(() => generateImage('gemini:test', [prepared.image], 'edit', { aspect: '2:3', size: '1024x1536', quality: 'high', mask: prepared.mask }), /OpenAI/);
const { GET } = load('app/api/files/[...path]/route.ts');
imageRead = { data: Buffer.alloc(3_700_000, 42), type: 'image/png' };
const streamed = await GET(new Request('http://localhost/api/files/results/test.png'), { params: Promise.resolve({ path: ['results', 'test.png'] }) });
assert.equal(streamed.status, 200);
assert.deepEqual(Buffer.from(await streamed.arrayBuffer()), imageRead.data);
console.log('Local edit passed: exact outside-mask pixels (including erased holes), inward feathering, orientation, validation before charge, saved provenance, mask-preserving retries, lossless streaming, rough visual pointers without clipping, instruction-only edits without any highlight, no stretching (pad to the AI aspect, crop back), and real token usage recorded.');
