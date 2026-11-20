// คำเรียกคนในรูปต้องกลางๆ ไม่ระบุเพศ (20 พ.ย. ผู้ใช้เลือก: มีนายแบบแล้ว) — ห้าม she/her/woman ในพรอมต์หน้านางแบบทุกแบบ
// ยกเว้นบรรทัดความสูงที่บอกทั้งผู้หญิงและผู้ชาย · สร้างพรอมต์ทุกตัวเลือกใน lib/catalog.ts + ตัววางแผนท่า/ผู้กำกับ (AI ปลอม ไม่เสียเงิน)
// node scripts/test-neutral-prompts.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { appLoader } from './lib/load-app.mjs';

const GENDERED = /\b(she|her|hers|herself|woman|women|girls?|lady|ladies|female|feminine)\b/i;
const HEIGHT = '(about 1.65 to 1.70 m for a woman, 1.75 to 1.80 m for a man)';
function neutral(text, where) {
  const rest = text.split(HEIGHT).join('');
  const hit = rest.match(GENDERED);
  assert(
    !hit,
    `${where}: "${hit?.[0]}" in …${rest.slice(Math.max(0, (hit?.index ?? 0) - 80), (hit?.index ?? 0) + 40)}…`,
  );
}

const load = appLoader({
  fetchImpl: async () => {
    throw new Error('Network forbidden in tests');
  },
});
const catalog = load('lib/catalog.ts');
const { buildPrompt, buildSetPrompt, buildRoomPrompt, harmonizePrompt, cropLine, roomCropLine } =
  load('lib/prompts.ts');
const { directorRequest } = load('lib/photo-director.ts');
const img = (data) => ({ data, mime: 'image/jpeg' });

test('every English text in lib/catalog.ts is gender-neutral', () => {
  let n = 0;
  const walk = (v, path) => {
    if (typeof v === 'string') {
      if (/[A-Za-z]/.test(v)) {
        n++;
        neutral(v, path);
      }
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  for (const [k, v] of Object.entries(catalog)) walk(v, k);
  assert(n > 100, `checked only ${n} texts`);
});

test('every model-page prompt is gender-neutral, whatever is chosen', () => {
  const { PRESETS, presetPrompt, FRAMINGS, ANGLES, HEAD_GAZES, GAZES, PROPS, FACE_MOODS, POSE_MODES, SET_SHOTS } =
    catalog;
  const wears = [
    {},
    { outfit: true },
    { top: true },
    { bottom: true, shoes: true },
    { top: true, bottom: true, shoes: true },
  ];
  const lights = { refLight: 'Soft window light from the left.', skinLight: 'Soft highlights on the cheekbones.' };
  const bases = [
    { hasSceneImage: false }, // ท่าเดิม ฉากเดิม
    { hasSceneImage: true, sceneLight: 'Overhead daylight.' },
    { hasSceneImage: false, sceneText: 'a quiet cafe' },
    { hasSceneImage: true, autoPose: true, poseHints: ['holding the bag so it is clearly visible'] },
    { hasSceneImage: true, posePlan: 'The model leans on the counter.' },
    { hasSceneImage: true, directed: 'explore', posePlan: 'The model sits on the bed edge.' },
    ...POSE_MODES.map((m) => ({
      hasSceneImage: m.id === 'shot-room',
      hasPose: true,
      poseMode: m.id,
      faceFromRef: true,
      ...lights,
    })),
  ];
  const options = [
    {},
    ...PRESETS.map((p) => ({ look: presetPrompt(p), framing: p.framing?.prompt ?? null })),
    ...FRAMINGS.map((f) => ({ fullBody: f.fullBody, camera: { framing: f.prompt, angle: null } })),
    ...ANGLES.map((a) => ({ camera: { framing: null, angle: a.prompt } })),
    ...HEAD_GAZES.map((h) => ({ headGaze: h.prompt })),
    ...GAZES.map((g) => ({ gaze: g.prompt })),
    ...FACE_MOODS.map((f) => ({ face: f.prompt || null })),
    { props: PROPS.map((p) => p.prompt) },
    ...['left', 'center', 'right'].map((placement) => ({ placement })),
    { crop: cropLine('4:5', true), extra: 'add a soft smile' },
    { crop: cropLine('9:16', false) },
  ];
  let n = 0;
  for (const wear of wears)
    for (const base of bases)
      for (const opt of options) {
        neutral(
          buildPrompt({ wear, accessories: ['a black shoulder bag'], ...base, ...opt }),
          `buildPrompt ${JSON.stringify({ wear, base, opt })}`,
        );
        n++;
      }
  for (const s of SET_SHOTS)
    for (const wear of wears)
      neutral(
        buildSetPrompt({
          framing: s.framing,
          angle: s.angle,
          fullBody: s.fullBody,
          wear,
          accessories: ['a bag'],
          crop: cropLine('4:5', s.fullBody),
        }),
        `buildSetPrompt ${s.id}`,
      );
  neutral(buildRoomPrompt({ refLight: lights.refLight, crop: roomCropLine('4:5') }), 'buildRoomPrompt');
  neutral(harmonizePrompt(null), 'harmonizePrompt');
  neutral(harmonizePrompt(presetPrompt(PRESETS[0])), 'harmonizePrompt + look');
  assert(n > 1000, `built only ${n} prompts`);
});

test('the scale line gives both heights, so a man is not sized like a woman', () => {
  const p = buildPrompt({ wear: {}, hasSceneImage: true });
  assert(p.includes(`Real-world scale: the model is an adult of ordinary height ${HEIGHT}`));
});

test('the pose planner and the AI director ask in neutral words', async () => {
  const requests = [];
  const app = appLoader({
    env: { OPENAI_API_KEY: 'test-only' },
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  preset: 'relaxed',
                  pose_en: 'Leaning on the counter. '.repeat(4),
                  pose_th: 'พิง',
                }),
              },
            },
          ],
        }),
      };
    },
  });
  const { planPose } = app('lib/ai.ts');
  const { POSE_PRESETS, POSE_AUTO, HEAD_GAZES } = catalog;
  const base = {
    location: img('person'),
    locationIsModelPhoto: true,
    locationText: null,
    outfit: img('outfit'),
    accessories: [{ img: img('bag'), what: 'a black shoulder bag' }],
  };
  for (const p of [...POSE_PRESETS, POSE_AUTO])
    for (const headGaze of [null, HEAD_GAZES[0].prompt])
      await planPose({ ...base, preset: p.id, moment: p.moments?.[0] ?? null, headGaze });
  assert(requests.length >= POSE_PRESETS.length * 2);
  for (const r of requests) neutral(r.messages[0].content[0].text, 'planPose');

  const director = directorRequest({
    person: img('person'),
    outfit: img('outfit'),
    location: img('room'),
    locationIsModelPhoto: false,
    locationText: null,
    accessories: [{ img: img('bag'), what: 'a bag' }],
    backgroundMode: 'explore',
    goal: 'lifestyle',
    aspect: '4:5',
    framing: null,
    angle: null,
    placement: null,
    expression: null,
    gaze: null,
    props: [],
    extra: null,
    previous: [],
  });
  neutral(director.text, 'directorRequest');
});
