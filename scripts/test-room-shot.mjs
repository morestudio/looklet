// รูปท่า + ฉากที่เลือก (POSE_MODES 'shot-room'): route สร้างฉากใหม่ก่อน (ขั้น 1) แล้วลอกทั้งช็อตลงฉากนั้น (ขั้น 2)
// และ ลอกทั้งช็อต + ฉาก (ไม่เลือกฉาก) ต้องทำงานเหมือนเดิม: เรียก AI ครั้งเดียว รูปท่าไม่ถูกตัด ไม่มีคำสั่งของฉากที่เลือก
// AI / รูป / ที่เก็บ / โควตา เป็นของปลอมทั้งหมด ไม่เสียเงิน: node scripts/test-room-shot.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { appLoader } from './lib/load-app.mjs';

const img = (data) => ({ data, mime: 'image/jpeg' });

function setup() {
  const calls = [], lights = [], usage = [];
  const app = appLoader({ env: { OPENAI_API_KEY: 'room-test-only' }, overrides: {
    'lib/route.ts': { post: (fn) => fn, json: (status, body) => ({ status, body }) },
    'lib/ai.ts': {
      availableModels: () => [{ id: 'openai:gpt-image-2.5-sunburst' }],
      describeLighting: async (i) => { lights.push(i.data); return `light of ${i.data}`; },
      describeSkinLight: async () => 'Soft highlights on the cheekbones.',
      directPhoto: async () => { throw new Error('no director here'); },
      planPose: async () => { throw new Error('no pose planner with a pose photo'); },
      reviewShot: async () => { throw new Error('no review here'); },
      generateImage: async (_model, images, prompt, opt) => { calls.push({ images: images.map((i) => i.data), prompt, quality: opt?.quality }); return { ...img(`rendered-${calls.length}`), tokens: 100 * calls.length }; },
    },
    'lib/images.ts': {
      cropTo: async (i, aspect) => ({ ...i, data: `${i.data}-cropped${aspect}` }),
      inputJpeg: async (i) => ({ ...i, data: `${i.data}-small` }),
      servable: async (i) => i,
    },
    'lib/storage.ts': { saveImage: async () => '/result.jpg' },
    'lib/usage.ts': { ESTIMATED_TOKENS: 6000, quotaBlock: async () => null, recordUsage: async (entry) => usage.push(entry) },
    'lib/genlog.ts': { localTime: () => 'test', sentences: (s) => s.split(/(?<=\.) /), writeGenerateLog: async (entry) => entry },
  } });
  return { POST: app('app/api/generate/route.ts').POST, calls, lights, usage };
}

const body = (poseMode, extra = {}) => ({
  model: 'openai:gpt-image-2.5-sunburst', person: 'model', outfit: 'outfit', pose: 'pose', scene_image: 'room', pose_mode: poseMode,
  light_from_ref: true, face_from_ref: true, aspect: '4:5', ...extra,
});

test('ฉากที่เลือก: ขั้น 1 ถ่ายฉากใหม่ตามรูปท่าที่ตัดเป็น 4:5 แล้วขั้น 2 ใช้ฉากใหม่แทนรูปฉากเดิม', async () => {
  const { POST, calls, lights, usage } = setup();
  const out = await POST(body('shot-room', { quality: 'high' }));
  assert.equal(out.status, 200);
  assert.equal(calls.length, 2);
  // 12 พ.ย.: ฉากว่าง (ขั้น 1) ทำที่ medium ประหยัด ~฿1.8 · รูปที่ลูกค้าได้ (ขั้น 2) ยังเป็นคุณภาพที่เลือก
  assert.deepEqual(calls.map((c) => c.quality), ['medium', 'high']);
  assert.match(usage[0].log.style.roomScene, /คุณภาพ medium/);
  // ขั้น 1: Image 1 = รูปฉาก, Image 2 = รูปท่าที่ตัดเป็นสัดส่วนสุดท้ายแล้ว
  assert.deepEqual(calls[0].images, ['room', 'pose-cropped4:5']);
  assert.match(calls[0].prompt, /^Create one photograph of the room in image 1, taken exactly the way image 2 was taken/);
  assert.match(calls[0].prompt, /There is no person in this photo\./);
  assert.match(calls[0].prompt, /relight the whole room with exactly the light of image 2: light of pose-cropped4:5/);
  assert.match(calls[0].prompt, /trimmed to make a 4:5 frame, so keep everything important away/);
  // ขั้น 2: ลำดับเดิม นางแบบ ชุด รูปท่า(ตัดแล้ว) ฉาก — ฉาก = ฉากใหม่จากขั้น 1 (ตัด 4:5 + ย่อ) ไม่ใช่รูปฉากเดิม
  assert.deepEqual(calls[1].images, ['model', 'outfit', 'pose-cropped4:5', 'rendered-1-cropped4:5-small']);
  assert.match(calls[1].prompt, /Image 4 already has this framing, so keep it as it is; she takes the place of the person in image 3 at her real size\./);
  assert.match(calls[1].prompt, /Image 4 was already photographed with the camera, framing and light of image 3/);
  assert.match(calls[1].prompt, /her size comes only from her real height and the camera distance of image 4\./);
  assert.match(calls[1].prompt, /The light in image 4: light of rendered-1-cropped4:5-small/); // แสงอ่านจากฉากใหม่
  assert.doesNotMatch(calls[1].prompt, /light of room/); // ไม่อ่านแสงจากรูปฉากเดิม
  assert(!lights.includes('room'));
  // โควตา/ log: 2 ครั้ง โทเคนรวม · log มีพรอมต์ขั้น 1 และพรอมต์หลักที่ใช้จริง
  assert.equal(usage[0].calls, 2);
  assert.equal(usage[0].tokens, 300);
  assert.equal(usage[0].log.roomPrompt[0], 'Create one photograph of the room in image 1, taken exactly the way image 2 was taken: the same camera position, angle and height, the same lens and framing, the same composition and exactly the same light.');
  assert(usage[0].log.prompt.some((s) => s.includes('Image 4 already has this framing')));
});

test('ฉากที่เลือก: ไม่มีรูปฉาก -> 400 ก่อนเรียก AI', async () => {
  const { POST, calls } = setup();
  const out = await POST(body('shot-room', { scene_image: null }));
  assert.equal(out.status, 400);
  assert.equal(calls.length, 0);
});

test('ลอกทั้งช็อต + ฉาก เหมือนเดิม: AI ครั้งเดียว รูปท่าไม่ถูกตัด ไม่มีคำสั่งของฉากที่เลือก', async () => {
  const { POST, calls, usage } = setup();
  const out = await POST(body('shot-scene'));
  assert.equal(out.status, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].images, ['model', 'outfit', 'pose']);
  assert.match(calls[0].prompt, /camera distance and location as image 3\./);
  assert.doesNotMatch(calls[0].prompt, /already has this framing|already photographed with the camera|room in image 1/);
  assert.equal(usage[0].calls, 1);
  assert.equal(usage[0].log.roomPrompt, undefined);
});

test('ปรับแสงรอบสอง (harmonize) ปิดแล้ว 12 พ.ย.: request เก่าที่ยังส่ง harmonize: true มา ได้ AI ครั้งเดียว ไม่มีพรอมต์รอบสอง', async () => {
  const { POST, calls, usage } = setup();
  const out = await POST(body('shot-scene', { harmonize: true }));
  assert.equal(out.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(usage[0].calls, 1);
  assert.equal(usage[0].log.harmonizePrompt, undefined);
  assert.equal(usage[0].log.style.harmonize, undefined);
});

test('ฉากที่เลือก: เลือกคุณภาพ low ไว้ ขั้น 1 ไม่สูงกว่ารูปสุดท้าย · xhigh ขั้น 1 ยังเป็น medium', async () => {
  for (const [chosen, expected] of [['low', ['low', 'low']], ['xhigh', ['medium', 'xhigh']]]) {
    const { POST, calls } = setup();
    assert.equal((await POST(body('shot-room', { quality: chosen }))).status, 200);
    assert.deepEqual(calls.map((c) => c.quality), expected);
  }
});

test('ลอกทั้งช็อต + ฉาก (ไม่เลือกฉาก) ใช้คุณภาพที่เลือกเหมือนเดิม', async () => {
  const { POST, calls } = setup();
  assert.equal((await POST(body('shot-scene', { quality: 'high' }))).status, 200);
  assert.deepEqual(calls.map((c) => c.quality), ['high']);
});
