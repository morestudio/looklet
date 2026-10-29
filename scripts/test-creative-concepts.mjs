// ทดสอบตัววางแผนจริงด้วย HTTP จำลอง ไม่ส่งรูปหรือเสียค่า AI
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const modules = new Map();
const requests = [];
let response = {};
const fakeFetch = async (_url, options) => {
  requests.push(JSON.parse(options.body));
  return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(response) } }] }) };
};
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', 'process', 'fetch', code)((id) => {
    if (id === 'server-only') return {};
    if (id === '@/lib/route') return { post: (fn) => fn, json: (status, body) => ({ status, body }) };
    if (id.startsWith('@/')) return load(id.slice(2) + '.ts');
    if (id.startsWith('.')) return load(path.posix.normalize(path.posix.join(path.posix.dirname(file), id)) + '.ts');
    return require(id);
  }, loaded, loaded.exports, { env: { OPENAI_API_KEY: 'fake-test-key' } }, fakeFetch);
  modules.set(file, loaded.exports);
  return loaded.exports;
}
const { CREATIVE_FIELDS, readCreativeConcept } = load('lib/creative.ts');
const { POST } = load('app/api/creative-concepts/route.ts');
for (const n of [1, 2, 3]) {
  const concept = {
    title: `Concept ${n}`, summary: 'คอนเซปต์ภาพสินค้าจากวัสดุและโทนสีที่เห็นจริง', palette: '#ddeeff, #aaaaaa, #eeeeee',
    scene: 'ฉากเรียบ', props: 'กระจกและถาดโลหะ', lighting: 'แสงหน้าต่าง', composition: 'ขวดอยู่ด้านหน้า',
    prompt: 'Photograph the exact product on a silver tray with a small mirror, on a blue-grey surface. Soft daylight from the left reveals natural reflections. Keep the label readable and every product detail intact. Use a medium lens and a slightly elevated viewpoint.',
  };
  for (const field of CREATIVE_FIELDS) response[`${field}_${n}`] = concept[field];
}
const base = { product: 'product-photo', support_images: ['back-photo'], product_type: 'beauty' };
let out = await POST(base);
assert.equal(out.status, 200);
assert.equal(out.body.concepts.length, 3);
assert.equal(new Set(out.body.concepts.map((c) => c.id)).size, 3);
assert(out.body.concepts.every((c) => readCreativeConcept(c)));
const message = requests.at(-1).messages[0].content;
assert.equal(message.filter((m) => m.type === 'image_url').length, 2);
assert.match(message[0].text, /No invented ingredients, fragrance notes/);
assert.match(message[0].text, /Do not repeat these earlier concepts/);
assert.equal(requests.at(-1).response_format.json_schema.schema.required.length, 24);
assert.match(message[0].text, /Choose freely based on the visual product/);
let count = requests.length;
out = await POST({ ...base, product: '' });
assert.equal(out.status, 400);
assert.equal(requests.length, count);
// ไอเดียที่พิมพ์ + ภาพแรงบันดาลใจ + ข้อมูลสินค้า ใส่พร้อมกันได้ (ไม่มีโหมดแล้ว)
out = await POST({ ...base, idea: 'minimal silver', inspiration: 'mood-photo', facts: 'กลิ่นไม้', previous: ['Old idea'] });
assert.equal(out.status, 200);
const inspirationRequest = requests.at(-1).messages[0].content;
assert.equal(inspirationRequest.filter((m) => m.type === 'image_url').length, 3);
assert.match(inspirationRequest[0].text, /Image 3 is inspiration/);
assert.match(inspirationRequest[0].text, /ORIGINAL arrangements/);
assert.match(inspirationRequest[0].text, /minimal silver/);
assert.match(inspirationRequest[0].text, /กลิ่นไม้/);
assert.match(inspirationRequest[0].text, /Old idea/);
response = { ...response, title_2: response.title_1 };
out = await POST(base);
assert.equal(out.status, 503);
response.prompt_1 = '';
out = await POST(base);
assert.equal(out.status, 503);
console.log('Creative concepts passed: three validated concepts, product/inspiration ordering, factual guardrails, combined optional inputs, refresh context, and invalid-response recovery.');
