// Contract and recovery tests; no network, image generation, credentials or stored user images.
import assert from 'node:assert/strict';
import test from 'node:test';
import { appLoader } from './lib/load-app.mjs';

const load = appLoader({ fetchImpl: async () => { throw new Error('Network forbidden in tests'); } });
const { DIRECTOR_FIELDS, directorRequest, readDirectorPlan, selectedShot, shotInstruction, readShotReview, unavailableReview } = load('lib/photo-director.ts');
const { buildPrompt } = load('lib/prompts.ts');
const { deliverDirectedImage } = load('lib/directed-delivery.ts');
const img = (data) => ({ data, mime: 'image/jpeg' });
const input = { person: img('person'), outfit: img('pajamas'), location: img('bedroom'), locationIsModelPhoto: false, locationText: null,
  accessories: [{ img: img('bag'), what: 'a bag' }], backgroundMode: 'explore', goal: 'lifestyle', aspect: '4:5', framing: null,
  angle: null, placement: null, expression: null, gaze: null, props: [], extra: null, previous: [] };
function response() {
  const r = Object.fromEntries(DIRECTOR_FIELDS.map((f) => [f, 'Observed reference detail']));
  for (const n of [1, 2, 3]) Object.assign(r, {
    [`title_${n}`]: `ไอเดีย ${n}`, [`interaction_${n}`]: ['Sit on the visible bed edge', 'Lie supported on the mattress', 'Sit on the floor beside the bed'][n - 1],
    [`placement_${n}`]: 'center', [`feasible_${n}`]: 'yes',
    [`score_outfit_${n}`]: String(100 - n * 5), [`score_natural_${n}`]: '80', [`score_scene_${n}`]: '90', [`score_render_${n}`]: '80',
  });
  return r;
}
const parse = (r = response(), mode = 'explore') => readDirectorPlan(r, { backgroundMode: mode, goal: 'lifestyle' });
const review = (checks = {}) => readShotReview({ identity: 'pass', outfit: 'pass', details: 'pass', anatomy: 'pass', support: 'pass', scene: 'pass', camera_crop: 'pass', summary_th: 'ตรวจภาพแล้ว', correction_en: '', ...checks });

test('every original has one unambiguous role; original scene and no-outfit cases remain usable', () => {
  const r = directorRequest(input);
  assert.deepEqual(r.images.map((i) => i.data), ['person', 'pajamas', 'bedroom', 'bag']);
  assert.match(r.context, /Image 1 is ONLY the model/);
  assert.match(r.context, /Image 2 is ONLY the exact outfit/);
  assert.match(r.context, /Image 3 is ONLY the location/);
  assert.match(r.text, /EXPLORE THIS LOCATION/);
  const original = directorRequest({ ...input, outfit: null, location: input.person, locationIsModelPhoto: true, accessories: [] });
  assert.equal(original.images.length, 1);
  assert.match(original.text, /outfit is what the model wears/);
  assert.match(original.text, /background of image 1/);
  const described = directorRequest({ ...input, location: null, locationText: 'Bedroom with a low bed' });
  assert.match(described.text, /Bedroom with a low bed/);
  assert.equal(described.images.length, 3);
});

test('keep-view mode and user constraints are explicit, and reviewer context has no planning commands', () => {
  const r = directorRequest({ ...input, backgroundMode: 'keep', framing: 'waist up', angle: 'eye level', previous: ['bed-edge sitting'] });
  assert.match(r.text, /KEEP THIS VIEW/);
  assert.match(r.text, /Do not propose overhead/);
  assert.match(r.text, /waist up/);
  assert.match(r.text, /bed-edge sitting/);
  assert.doesNotMatch(r.context, /Plan THREE/);
});

test('selection excludes an infeasible candidate even when its scores are highest', () => {
  const r = response();
  r.feasible_1 = 'no';
  const plan = parse(r);
  assert.equal(plan.selectedId, 'shot-2');
  assert.equal(plan.candidates.length, 3);
  assert.match(shotInstruction(plan), /Lie supported on the mattress/);
  assert(!shotInstruction(plan).includes('Sit on the visible bed edge'));
});

test('reject malformed, duplicate, out-of-range and entirely infeasible plans', () => {
  for (const change of [{ score_scene_1: 'NaN' }, { score_scene_1: '101' }, { score_render_2: '4.5' }, { placement_1: 'somewhere' },
    { feasible_1: 'maybe' }, { interaction_1: '' }, { interaction_2: 'Sit on the visible bed edge' }, { title_2: 'ไอเดีย 1' },
    { feasible_1: 'no', feasible_2: 'no', feasible_3: 'no' }]) assert.equal(parse({ ...response(), ...change }), null);
});

test('complete shot owns framing and contact surfaces instead of default standing/feet instructions', () => {
  const plan = parse();
  const shot = selectedShot(plan);
  const prompt = buildPrompt({ hasOutfit: true, hasSceneImage: true, fullBody: true, posePlan: shotInstruction(plan), directed: 'explore',
    framing: shot.framing, camera: { framing: shot.framing, angle: 'overhead view' } });
  assert.match(prompt, /complete shot plan/);
  assert.match(prompt, /planned body contact surfaces/);
  assert.match(prompt, /including every toe and heel/);
  assert.match(prompt, /re-creating its perspective/);
  assert.doesNotMatch(prompt, /Show the full body from head to feet/);
  assert.doesNotMatch(prompt, /feet touch the ground/);
  const keep = buildPrompt({ hasOutfit: true, hasSceneImage: true, posePlan: shotInstruction(parse(response(), 'keep')), directed: 'keep', camera: { framing: 'full body', angle: 'reference viewpoint' } });
  assert.match(keep, /preserve the location reference viewpoint/);
  assert.doesNotMatch(keep, /re-creating its perspective/);
  assert.match(buildPrompt({ hasOutfit: true, hasSceneImage: true, fullBody: true }), /Show the full body from head to feet/);
});

test('uncertainty or unavailable checking is never labeled passed', () => {
  assert.equal(review().status, 'passed');
  assert.equal(review({ identity: 'uncertain' }).status, 'needs_review');
  assert.equal(review({ support: 'fail' }).status, 'needs_review');
  assert.equal(review({ anatomy: 'maybe' }), null);
  assert.equal(unavailableReview().status, 'unavailable');
});

function deliveryDeps(reviews = [review()]) {
  const events = [];
  return { events, deps: {
    review: async (i) => { events.push(`review:${i.data}`); const r = reviews.shift(); if (r instanceof Error) throw r; return r; },
    save: async (i, p) => { events.push(`save:${i.data}:${p.review.status}`); return `/${i.data}.jpg`; },
    canRepair: async () => true,
    repair: async () => { events.push('repair'); return img('fixed'); },
  } };
}
const meta = { name: 'test', th: 'ทดสอบ', director: parse() };
const failed = () => review({ camera_crop: 'fail', correction_en: 'Pull back so both feet are inside the frame.' });

test('save the first result before one repair, recheck the crop and return an improved result', async () => {
  const { events, deps } = deliveryDeps([failed(), review()]);
  const out = await deliverDirectedImage(img('first'), meta, true, deps);
  assert.deepEqual(events, ['review:first', 'save:first:needs_review', 'repair', 'review:fixed', 'save:fixed:passed']);
  assert.equal(out.src, '/fixed.jpg');
  assert.equal(out.posePlan.originalSrc, '/first.jpg');
  assert.equal(out.posePlan.repaired, true);
});

test('keep the original when repair fails or the repaired image is worse', async () => {
  let setup = deliveryDeps([failed()]);
  setup.deps.repair = async () => { throw new Error('provider timeout'); };
  let out = await deliverDirectedImage(img('first'), meta, true, setup.deps);
  assert.equal(out.src, '/first.jpg');
  assert(out.posePlan.repairError);
  setup = deliveryDeps([failed(), review({ support: 'fail', outfit: 'fail' })]);
  out = await deliverDirectedImage(img('first'), meta, true, setup.deps);
  assert.equal(out.src, '/first.jpg');
  assert.equal(setup.events.filter((e) => e === 'repair').length, 1);
});

test('minor failures (support, scene, details) are only flagged, never repaired', async () => {
  for (const check of ['support', 'scene', 'details']) {
    const { deps, events } = deliveryDeps([review({ [check]: 'fail', correction_en: 'Use a light fingertip touch instead of a planted palm.' })]);
    const out = await deliverDirectedImage(img('first'), meta, true, deps);
    assert.equal(out.src, '/first.jpg');
    assert.equal(out.posePlan.review.status, 'needs_review');
    assert(!events.includes('repair'));
  }
  for (const check of ['identity', 'outfit', 'anatomy', 'camera_crop']) {
    const { deps, events } = deliveryDeps([review({ [check]: 'fail', support: 'fail', correction_en: 'Fix it.' }), review()]);
    await deliverDirectedImage(img('first'), meta, true, deps);
    assert.equal(events.filter((e) => e === 'repair').length, 1);
  }
});

test('no repair on opt-out, exhausted quota, uncertain-only review, or checker failure', async () => {
  for (const scenario of ['opt-out', 'quota', 'uncertain', 'checker']) {
    const { deps, events } = deliveryDeps([scenario === 'checker' ? new Error('checker timeout') : scenario === 'uncertain' ? review({ identity: 'uncertain' }) : failed()]);
    if (scenario === 'quota') deps.canRepair = async () => false;
    const out = await deliverDirectedImage(img('first'), meta, scenario !== 'opt-out', deps);
    assert.equal(out.src, '/first.jpg');
    assert(!events.includes('repair'));
    if (scenario === 'checker') assert.equal(out.posePlan.review.status, 'unavailable');
  }
});

test('real planner integration sends all references, validates provider output, and falls back without silently generating', async () => {
  const requests = [];
  let reply = response();
  const app = appLoader({ env: { OPENAI_API_KEY: 'test-only' }, fetchImpl: async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(reply) } }] }) };
  } });
  const { directPhoto } = app('lib/ai.ts');
  assert(await directPhoto(input));
  assert.equal(requests[0].messages[0].content.filter((c) => c.type === 'image_url').length, 4);
  assert.equal(requests[0].response_format.json_schema.strict, true);
  assert.equal(requests[0].response_format.json_schema.schema.required.length, DIRECTOR_FIELDS.length);
  reply = { ...response(), feasible_1: 'no', feasible_2: 'no', feasible_3: 'no' };
  assert.equal(await directPhoto(input), null);
});

test('generation route wires director constraints, final crop, stored reviews and repair usage together', async () => {
  const saved = [], usage = [], prompts = [], quotaChecks = [], plannerInputs = [];
  let validPlan = true;
  let reviews = [failed(), review()];
  const app = appLoader({ env: { OPENAI_API_KEY: 'proposal-test-only' }, overrides: {
    'lib/route.ts': { post: (fn) => fn, json: (status, body) => ({ status, body }) },
    'lib/ai.ts': {
      availableModels: () => [{ id: 'openai:gpt-image-2.5-sunburst' }],
      describeLighting: async () => 'Soft window light',
      directPhoto: async (i) => { plannerInputs.push(i); return validPlan ? parse() : null; },
      planPose: async () => { throw new Error('Auto mode must not call the old pose planner'); },
      reviewShot: async (_input, _plan, i) => { assert.match(i.data, /cropped/); return reviews.shift(); },
      generateImage: async (_model, images, prompt) => { prompts.push({ images, prompt }); return { ...img('rendered'), tokens: 123 }; },
    },
    'lib/images.ts': { cropTo: async (i) => ({ ...i, data: i.data + '-cropped' }), servable: async (i) => i },
    'lib/storage.ts': { saveImage: async (_where, data, _mime, meta) => { saved.push({ data, meta }); return `/result-${saved.length}.jpg`; } },
    'lib/usage.ts': { ESTIMATED_TOKENS: 6000, quotaBlock: async (pending) => { quotaChecks.push(pending ?? 0); return null; }, recordUsage: async (entry) => usage.push(entry) },
    'lib/genlog.ts': { localTime: () => 'test', sentences: (s) => [s], writeGenerateLog: async (entry) => entry },
  } });
  const { POST } = app('app/api/generate/route.ts');
  const body = { model: 'openai:gpt-image-2.5-sunburst', person: 'model-original', outfit: 'outfit-original', scene_image: 'room-original',
    pose_preset: 'auto', background_mode: 'explore', photo_goal: 'lifestyle', aspect: '4:5', camera_framing: 'manual close crop', camera_angle: 'manual high angle', placement: 'left',
    face: 'manual expression', gaze: 'manual gaze', props: ['manual held prop'], extra: 'manual additional instruction', previous_shots: ['Old shot'] };
  let out = await POST(body);
  assert.equal(out.status, 200);
  assert.equal(out.body.src, '/result-2.jpg');
  assert.equal(out.body.posePlan.review.status, 'passed');
  assert.equal(saved[0].meta.posePlan.review.status, 'needs_review');
  assert.equal(saved[1].meta.posePlan.originalSrc, '/result-1.jpg');
  assert.equal(usage[0].calls, 2);
  assert.equal(usage[0].tokens, 246);
  assert.equal(quotaChecks[1], 123); // pending original tokens count before allowing another paid render
  assert.deepEqual(prompts[0].images.map((i) => i.data), ['model-original', 'outfit-original', 'room-original']);
  assert.equal(prompts[1].images.length, 4); // originals plus failed draft
  assert.match(prompts[1].prompt, /Image 4 is the failed draft/);
  assert.match(prompts[0].prompt, /planned body contact surfaces/);
  assert.equal(plannerInputs[0].person.data, 'model-original');
  for (const field of ['framing', 'angle', 'placement', 'expression', 'gaze', 'extra']) assert.equal(plannerInputs[0][field], null);
  assert.deepEqual(plannerInputs[0].props, []);
  for (const generated of prompts) assert.doesNotMatch(generated.prompt, /manual close crop|manual high angle|manual expression|manual gaze|manual held prop|manual additional instruction/);
  assert.deepEqual(plannerInputs[0].previous, ['Old shot']);
  // ทิศหน้า/สายตา: ตัววางแผนคิดเองต่อไอเดีย · ย้ำท้ายคำสั่งด้วยของไอเดียที่เลือก
  assert.match(prompts[0].prompt, /Head and gaze: Observed reference detail\. Show her face naturally from this angle/);
  validPlan = false;
  const count = prompts.length;
  out = await POST(body);
  assert.equal(out.status, 503);
  assert.equal(prompts.length, count); // no paid render after planning failure
  validPlan = true;
  reviews = [review()];
  out = await POST({ ...body, auto_repair: false, background_mode: 'keep' });
  assert.equal(out.status, 200);
  assert.equal(plannerInputs.at(-1).backgroundMode, 'keep');
  // Switching away from AI restores manual direction; previously selected choices remain usable.
  out = await POST({ ...body, pose_preset: null, auto_pose: true });
  assert.equal(out.status, 200);
  for (const instruction of ['manual close crop', 'manual high angle', 'manual expression', 'manual gaze', 'manual held prop', 'manual additional instruction']) {
    assert(prompts.at(-1).prompt.includes(instruction));
  }
  const beforePlanning = prompts.length;
  out = await POST({ ...body, plan_only: true });
  assert.equal(out.status, 200);
  const proposal = out.body.proposal;
  assert.equal(proposal.plan.candidates.length, 3);
  assert.equal(prompts.length, beforePlanning); // viewing ideas creates no images
  const plansAsked = plannerInputs.length;
  reviews = [review()];
  out = await POST({ ...body, shot_proposal: proposal.token, shot_id: 'shot-2', auto_repair: false });
  assert.equal(out.status, 200);
  assert.equal(out.body.posePlan.director.selectedId, 'shot-2');
  assert.match(prompts.at(-1).prompt, /Lie supported on the mattress/);
  assert.equal(plannerInputs.length, plansAsked); // choose the exact idea, do not replan
  assert.match(prompts.at(-1).prompt, /Head and gaze: /);
  const renders = prompts.length;
  for (const bad of [
    { shot_id: 'shot-99' }, { shot_proposal: proposal.token + 'tampered' }, { outfit: 'different-outfit' }, { aspect: '1:1' },
  ]) {
    out = await POST({ ...body, shot_proposal: proposal.token, shot_id: 'shot-1', ...bad });
    assert.equal(out.status, 400);
    assert.equal(prompts.length, renders);
    assert.equal(plannerInputs.length, plansAsked);
  }
});

test('shot proposals are bound to the caller, references and expiry; infeasible ideas cannot be selected', () => {
  const { createShotProposal, readShotProposal } = appLoader({ env: { OPENAI_API_KEY: 'proposal-test-only' } })('lib/director-proposal.ts');
  const now = 1_000_000;
  const plan = parse();
  plan.candidates[2].feasible = false;
  const proposal = createShotProposal(plan, input, 'account-a', now);
  assert.equal(readShotProposal(proposal.token, 'shot-2', input, 'account-a', now).selectedId, 'shot-2');
  assert.equal(readShotProposal(proposal.token, 'shot-1', input, 'account-b', now), null);
  assert.equal(readShotProposal(proposal.token, 'shot-1', { ...input, person: img('different-model') }, 'account-a', now), null);
  assert.equal(readShotProposal(proposal.token, 'shot-1', input, 'account-a', now + 30 * 60_000), null);
  assert.equal(readShotProposal(proposal.token, 'shot-3', input, 'account-a', now), null);
  const [payload, signature] = proposal.token.split('.');
  const tampered = JSON.parse(Buffer.from(payload, 'base64url').toString());
  tampered.plan.candidates[0].interaction = 'User-added manual pose';
  assert.equal(readShotProposal(Buffer.from(JSON.stringify(tampered)).toString('base64url') + '.' + signature, 'shot-1', input, 'account-a', now), null);
});

test('selected ideas render once each; cancelling spends nothing and partial results survive a later failure', async () => {
  const { generateSelectedShots } = load('lib/shot-batch.ts');
  const calls = [], saved = [];
  let out = await generateSelectedShots([], async (id) => calls.push(id), (r) => saved.push(r));
  assert.equal(out.results.length, 0);
  assert.equal(calls.length, 0);
  out = await generateSelectedShots(['shot-2', 'shot-2', 'shot-3'], async (id) => { calls.push(id); return id; }, (r) => saved.push(r));
  assert.deepEqual(out.results, ['shot-2', 'shot-3']);
  assert.deepEqual(saved, ['shot-2', 'shot-3']);
  calls.length = 0;
  // ไอเดียที่ถูกปฏิเสธ (ระบบความปลอดภัยของ OpenAI 2 พ.ย.) ไม่หยุดไอเดียที่เหลือ
  out = await generateSelectedShots(['shot-1', 'shot-2', 'shot-3'], async (id) => {
    calls.push(id);
    if (id === 'shot-2') throw new Error('OpenAI ตอบกลับ 400: Your request was rejected by the safety system. safety_violations=[sexual].');
    return id;
  }, (r) => saved.push(r));
  assert.deepEqual(calls, ['shot-1', 'shot-2', 'shot-3']);
  assert.deepEqual(out.results, ['shot-1', 'shot-3']);
  assert.deepEqual(out.errors.map((e) => e.id), ['shot-2']);
  assert.match(out.errors[0].message, /safety system/);
});

test('head and gaze vary per image instead of always facing the camera', async () => {
  const { pickHeadGazes, POSE_PRESETS } = load('lib/catalog.ts');
  for (let i = 0; i < 300; i++) {
    const g = pickHeadGazes(3);
    assert.equal(new Set(g.map((x) => x.id)).size, 3);
    assert(g.filter((x) => x.contact).length <= 1); // ไอเดีย 3 แบบ สบตากล้องได้ไม่เกิน 1
  }
  let contact = 0;
  for (let i = 0; i < 3000; i++) if (pickHeadGazes(1)[0].contact) contact++;
  assert(contact > 800 && contact < 1200, `eye contact ${contact}/3000 should be about a third`);
  // AI จัดท่าฯ: ตัววางแผนเลือกมุมหน้าเองตามท่า (ผู้ใช้ขอ 2 พ.ย.) แต่ห้ามหันหน้าตรงกล้องเป็นค่าเริ่มต้น
  const directed = directorRequest(input).text;
  assert.match(directed, /Head and gaze are part of each idea, not a default/);
  assert.match(directed, /across the three candidates at most one may look into the lens/);
  assert.match(directed, /head_gaze_expression directs the face: head angle relative to the camera, where the eyes look and why/);
  const requests = [];
  const app = appLoader({ env: { OPENAI_API_KEY: 'test-only' }, fetchImpl: async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ pose_en: 'She leans on the counter. '.repeat(4), pose_th: 'พิงเคาน์เตอร์' }) } }] }) };
  } });
  const { planPose } = app('lib/ai.ts');
  const base = { location: null, locationIsModelPhoto: false, locationText: 'a cafe', outfit: null, accessories: [], preset: POSE_PRESETS[0].id, moment: 'looking at the camera' };
  assert(await planPose({ ...base, headGaze: 'eyelids lowered, looking down at her hands' }));
  const asked = requests[0].messages[0].content[0].text;
  assert.match(asked, /Her head and gaze in this photo \(follow this; it replaces any head direction or gaze in the moment\): eyelids lowered, looking down at her hands\. Plan her expression to suit it\./);
  assert.doesNotMatch(asked, /Plan her gaze and expression too/);
  await planPose(base); // ไม่ได้สุ่ม (ผู้ใช้เลือกการมองเอง) -> คำสั่งเดิม
  assert.match(requests[1].messages[0].content[0].text, /Plan her gaze and expression too/);
  const prompt = buildPrompt({ hasOutfit: true, hasSceneImage: true, fullBody: true, posePlan: 'She leans on the counter.', headGaze: 'her eyes on the light.' });
  assert.match(prompt, /Head and gaze: her eyes on the light\. Show her face naturally from this angle as the camera sees it/);
  assert.doesNotMatch(buildPrompt({ hasOutfit: true, hasSceneImage: true, fullBody: true }), /Head and gaze/);
});

test('skin tone is the second sentence of every model prompt and reference photos never pass on their skin', () => {
  // 3 พ.ย.: ผิวออกมาขาว/สว่างเกินจริง ผู้ใช้ขอให้สีผิวสำคัญที่สุดและอยู่ต้นคำสั่ง
  const { SKIN_TONE } = load('lib/prompts.ts');
  const modes = [
    { hasOutfit: true, hasSceneImage: false }, // เปลี่ยนชุดอย่างเดียว
    { hasOutfit: true, hasSceneImage: true, fullBody: true, posePlan: 'She leans on the counter.', look: 'Soft window light.' },
    { hasOutfit: true, hasSceneImage: false, hasPose: true, poseMode: 'pose' },
    { hasOutfit: true, hasSceneImage: false, hasPose: true, poseMode: 'shot-scene', refLight: 'Bright, high-key window light.' },
    { hasOutfit: true, hasSceneImage: true, posePlan: 'She sits on the bed.', directed: 'explore', camera: { framing: 'full body', angle: 'eye level' } },
  ];
  for (const m of modes) {
    const p = buildPrompt(m);
    assert.equal(p.indexOf(SKIN_TONE), p.indexOf('.') + 2, 'SKIN_TONE must come right after the first sentence');
    assert.match(p, /Keep the same person: identical face, facial features, skin tone/);
    assert.doesNotMatch(p, /only as affected by the scene lighting/);
  }
  assert.match(SKIN_TONE, /^Most important, skin tone:/);
  assert.match(SKIN_TONE, /Never whiten, brighten or pale her skin/);
  const shot = buildPrompt(modes[3]);
  assert.match(shot, /do not copy that person's face, skin tone, hair/);
  assert.match(shot, /never her skin tone, however pale the skin in image 3 looks/);
  assert.match(buildPrompt(modes[2]), /not the face, skin tone, hair/);
  assert.match(buildPrompt(modes[0]), /Ignore the face, body, skin tone and background of image 2/);
  // เลือกแสงของสไตล์แทนแสงรูปต้นแบบ -> ไม่มีประโยคแสงรูปต้นแบบ
  assert.doesNotMatch(buildPrompt({ ...modes[3], look: 'Soft window light.' }), /however pale the skin/);
});

test('copy-the-shot takes pose and framing from the reference photo, never from the model photo', () => {
  // 3 พ.ย.: รูปท่าเป็นภาพใกล้หน้าตรง รูปนางแบบท้าวคางมองข้าง -> ผลได้ท่า/ระยะของรูปนางแบบ ลอกแค่ฉากกับแสง
  const shot = buildPrompt({ hasOutfit: true, hasSceneImage: false, hasPose: true, poseMode: 'shot-scene', faceFromRef: true, fullBody: true, refLight: 'Soft front light.' });
  assert.match(shot, /^Create one fashion photograph that recreates the shot of image 3 with the model from image 1: the same pose, head angle and gaze, framing, camera angle, camera distance and location as image 3\./);
  assert.match(shot, /Image 1 is only for who she is: do not copy its pose, arm and hand position, head angle, gaze or expression, or its framing or camera distance\./);
  assert.match(shot, /If image 3 is a close-up of the head and shoulders, the result is the same close-up; never zoom out/);
  assert.doesNotMatch(shot, /feet|top of the frame well above her head/); // ข้อความภาพเต็มตัวดึงให้ถอยกล้อง
  // ของเสริม 2 ชิ้น -> รูปท่าเป็นรูปที่ 5
  const withAcc = buildPrompt({ hasOutfit: true, hasSceneImage: true, accessories: ['a bag', 'a cap'], hasPose: true, poseMode: 'shot' });
  assert.match(withAcc, /^Create one fashion photograph that recreates the shot of image 5 with the model from image 1: the same pose, head angle and gaze, framing, camera angle and camera distance as image 5\./);
  assert.match(withAcc, /Frame it exactly like image 5/);
  // ลอกแค่ท่า: ไม่ลอกท่าจากรูปนางแบบ แต่ระยะภาพยังตามที่เลือก
  const pose = buildPrompt({ hasOutfit: true, hasSceneImage: true, hasPose: true, poseMode: 'pose', fullBody: true });
  assert.match(pose, /Image 1 is only for who she is: do not copy its pose, arm and hand position, head angle, gaze or expression\./);
  assert.doesNotMatch(pose, /recreates the shot|Frame it exactly like/);
  assert.match(pose, /where the feet touch the ground/);
  assert.match(pose, /top of the frame well above her head/);
});

test('head angle and gaze follow the pose photo whichever way the model photo faces', () => {
  // 3 พ.ย.: รูปท่าหน้าตรงมองกล้อง + รูปนางแบบหันข้าง -> ผลหันข้างตามรูปนางแบบ
  const shot = buildPrompt({ hasOutfit: true, hasSceneImage: false, hasPose: true, poseMode: 'shot-scene', faceFromRef: true });
  assert.match(shot, /Image 1 may show the model with a different head angle and gaze; do not copy them\. Turn and tilt her head exactly like the person in image 3, point her eyes exactly where that person's eyes look \(straight into the lens if she looks into the lens\), and show her face naturally/);
  assert.match(shot, /It must not look like the face from image 1 placed on a turned or tilted body\./);
  assert.doesNotMatch(shot, /front-facing face|facing the camera straight on/);
  // ลอกแค่ท่า + เลือกการมองเอง -> ไม่สั่งสายตาตามรูปท่า (ไม่ขัดกับการมองที่เลือก)
  const chosen = buildPrompt({ hasOutfit: true, hasSceneImage: true, hasPose: true, poseMode: 'pose', gaze: 'Looking away from the camera.' });
  assert.doesNotMatch(chosen, /point her eyes exactly/);
  assert.match(buildPrompt({ hasOutfit: true, hasSceneImage: true, hasPose: true, poseMode: 'pose' }), /point her eyes exactly where that person's eyes look/);
});
