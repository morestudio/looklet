import { availableModels, describeLighting, describeSkinLight, directPhoto, generateImage, planPose, reviewShot, type Img } from '@/lib/ai';
import { selectedShot, shotInstruction, type DirectorInput, type StoredPosePlan } from '@/lib/photo-director';
import { deliverDirectedImage } from '@/lib/directed-delivery';
import { createShotProposal, readShotProposal } from '@/lib/director-proposal';
import { me } from '@/lib/account';
import { GPT25_SIZES, isGpt25, MAX_ACCESSORIES, pickHeadGazes, pickMoment, POSE_AUTO, POSE_MODES, POSE_PRESETS, type PoseMode } from '@/lib/catalog';
import { localTime, sentences, writeGenerateLog, type GenerateLog, type LogImage } from '@/lib/genlog';
import { AI_ASPECTS, aspectBaseSize, isPlatformAspect, PLATFORM_ASPECTS } from '@/lib/aspects';
import { buildPrompt, buildSetPrompt, cropLine, harmonizePrompt, pickPlacement } from '@/lib/prompts';
import { json, post } from '@/lib/route';
import { cropTo, servable } from '@/lib/images';
import { saveImage, type SetTag } from '@/lib/storage';
import { ESTIMATED_TOKENS, quotaBlock, recordUsage } from '@/lib/usage';

export const maxDuration = 300;

// what = คำบรรยายประเภท, show = ท่าที่ทำให้ของชิ้นนี้เด่น (ทั้งคู่มาจาก ACCESSORY_TYPES)
type Accessory = { data: string; what?: string; show?: string };
// ที่มาของรูปที่ส่ง (ชื่อ + ไฟล์ต้นฉบับ + ขนาดหลังย่อ + ประเภทของเสริม) หน้าเว็บส่งมาให้ไว้ทำ log เท่านั้น ไม่ได้ส่งให้ AI
type Ref = { name?: string; src?: string; w?: number; h?: number; type?: string };

// ข้อความคำสั่งจากหน้าเว็บ (มาจาก lib/catalog.ts) — ตัดความยาวไว้กันส่งยาวผิดปกติ
const text = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 400) : null);
const texts = (v: unknown) => (Array.isArray(v) ? v.map(text).filter((s): s is string => s !== null).slice(0, 6) : []);
const toRef = (v: unknown): Ref => {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    name: text(r.name) ?? undefined, src: text(r.src) ?? undefined, w: Number(r.w) || undefined, h: Number(r.h) || undefined,
    type: text(r.type) ?? undefined,
  };
};

export const POST = post(async (req) => {
  if (!availableModels().some((m) => m.id === req.model)) return json(400, { error: 'ไม่มีโมเดลนี้ หรือยังไม่ได้ใส่ key ใน .env' });
  const blocked = await quotaBlock(); // ลูกค้าใช้ครบโควตา/ถูกปิด -> ไม่เรียก AI
  if (blocked) return blocked;
  if (!req.person) return json(400, { error: 'ไม่มีรูปนางแบบ' });
  const accessories: Accessory[] = (Array.isArray(req.accessories) ? req.accessories : []).filter((a: Accessory) => a?.data);
  if (accessories.length > MAX_ACCESSORIES) return json(400, { error: `ของเสริมใส่ได้ไม่เกิน ${MAX_ACCESSORIES} ชิ้นต่อรูป` });
  const poseMode: PoseMode = POSE_MODES.find((m) => m.id === req.pose_mode)?.id ?? 'pose';
  const shotScene = Boolean(req.pose) && poseMode === 'shot-scene'; // ฉากมาจากรูปท่าโพสต์ ไม่ใช้ฉากที่เลือก
  // ชุดภาพหลายมุม (รูปที่ 2 เป็นต้นไป): set_ref = รูปหลักของชุด, set_shot = ระยะ + มุมกล้อง (SET_SHOTS) — ไม่ส่งรูปท่า/ฉาก ใช้จากรูปหลัก
  const setRef: string | null = typeof req.set_ref === 'string' && req.set_ref ? req.set_ref : null;
  const setShot = setRef && req.set_shot && typeof req.set_shot === 'object' ? req.set_shot as Record<string, unknown> : null;
  // ป้ายชุดภาพ (ทุกรูปในชุด รวมรูปหลัก) เก็บใน .json คู่รูป ให้ประวัติรูปจัดกลุ่มได้หลัง refresh
  const setTag: SetTag | null = req.set && typeof req.set.id === 'string' && /^[\w-]{1,40}$/.test(req.set.id) && Number.isInteger(req.set.index)
    ? { id: req.set.id, index: req.set.index } : null;
  const finish = req.finish === 'phone' || req.finish === 'film' ? req.finish : null; // ลุคที่เหมาะกับรูปนี้ (lib/film.ts) เก็บกับรูป
  if (setRef && (!text(setShot?.framing) || !text(setShot?.angle))) return json(400, { error: 'ชุดภาพ: ไม่มีมุมกล้องของรูปนี้' });

  // รูปที่ส่งให้ AI: นางแบบ (ต้องมี) + ชุด + ของเสริม + ท่าโพสต์ + ฉาก (ถ้าเลือก) — ลำดับต้องตรงกับ buildPrompt
  // ทำรายการเดียวใช้ทั้งส่ง AI และทำ log ลำดับใน log จะตรงกับที่ AI เห็นเสมอ
  const refs = (req.refs && typeof req.refs === 'object' ? req.refs : {}) as Record<string, unknown>;
  const accRefs = Array.isArray(refs.accessories) ? refs.accessories : [];
  const inputs = [
    { role: 'รูปหลักของชุด', data: setRef, ref: toRef(refs.set_ref) },
    { role: 'นางแบบ', data: req.person, ref: toRef(refs.person) },
    { role: 'ชุด', data: req.outfit, ref: toRef(refs.outfit) },
    ...accessories.map((a, i) => ({ role: 'ของเสริม', data: a.data, ref: toRef(accRefs[i]) })),
    { role: 'ท่าโพสต์', data: setRef ? null : req.pose, ref: toRef(refs.pose) },
    { role: 'ฉาก', data: setRef || shotScene ? null : req.scene_image, ref: toRef(refs.scene) },
  ].filter((x): x is { role: string; data: string; ref: Ref } => typeof x.data === 'string' && x.data.length > 0);
  const images: Img[] = inputs.map((x) => ({ data: x.data, mime: 'image/jpeg' }));
  const look: string | null = req.look ?? null;
  // ลอกทั้งช็อต + ลอกแสงจากรูปต้นแบบ: ให้ AI อ่านแสงในรูปท่าโพสต์ก่อน (ไม่ถึงสตางค์ 2–5 วินาที) อ่านไม่ได้ = ใช้คำสั่งลอกแสงแบบเดิม
  // รูปฉากที่อัปโหลด: อ่านแสงในฉากด้วย ให้แสง/เงาบนตัวนางแบบตรงกับห้องจริง (อ่านพร้อมกับรูปท่า ไม่ต้องรอต่อกัน)
  // ท่าสำเร็จรูป (ไม่มีรูปท่า): ให้ AI ตัววางแผนดูฉาก + ชุด + ของเสริม แล้วคิดท่า — ทำพร้อมกับอ่านแสง ไม่ต้องรอต่อกัน
  // ที่อยู่ของฉาก: รูปฉากที่อัปโหลด > คำบรรยายฉาก > พื้นหลังของรูปนางแบบ (ฉากเดิม)
  const posePreset = !setRef && !req.pose && (req.pose_preset === POSE_AUTO.id || POSE_PRESETS.some((p) => p.id === req.pose_preset))
    ? String(req.pose_preset) : null;
  const sceneText0 = text(req.scene_text);
  const isDirector = posePreset === POSE_AUTO.id;
  const chosenPlacement = isDirector ? null : (['left', 'center', 'right'] as const).find((p) => p === req.placement) ?? null;
  const aspect = isPlatformAspect(req.aspect) ? String(req.aspect) : '2:3';
  const directorInput: DirectorInput | null = posePreset === POSE_AUTO.id ? {
    person: { data: req.person, mime: 'image/jpeg' },
    location: req.scene_image ? { data: req.scene_image, mime: 'image/jpeg' } : null,
    locationIsModelPhoto: !req.scene_image && !sceneText0,
    locationText: req.scene_image ? null : sceneText0,
    outfit: req.outfit ? { data: req.outfit, mime: 'image/jpeg' } : null,
    accessories: accessories.map((a) => ({ img: { data: a.data, mime: 'image/jpeg' }, what: String(a.what || 'an accessory').slice(0, 200) })),
    backgroundMode: req.background_mode === 'keep' ? 'keep' : 'explore',
    goal: req.photo_goal === 'outfit' || req.photo_goal === 'editorial' ? req.photo_goal : 'lifestyle',
    // AI mode owns all direction. Ignore stale/manual overrides even from older clients.
    aspect, framing: null, angle: null, placement: null,
    expression: null, gaze: null, props: [], extra: null, previous: texts(req.previous_shots),
  } : null;
  const planningOnly = req.plan_only === true;
  if (planningOnly && !directorInput) return json(400, { error: 'เลือก AI จัดท่าและมุมกล้องก่อนขอไอเดียภาพ' });
  const hasSelection = req.shot_proposal !== undefined || req.shot_id !== undefined;
  const caller = me()?.id ?? 'local-team';
  const selectedPlan = hasSelection && directorInput ? readShotProposal(req.shot_proposal, req.shot_id, directorInput, caller) : null;
  if (hasSelection && (!selectedPlan || planningOnly)) return json(400, { error: 'ไอเดียภาพหมดอายุหรือไม่ตรงกับรูปที่เลือก กรุณาคิดไอเดียใหม่' });
  // สุ่มจังหวะของท่า 1 แบบ (POSE_PRESETS moments) — ไม่สุ่ม = AI ตัววางแผนให้ท่าเดิมซ้ำทุกรูป
  const presetDef = POSE_PRESETS.find((p) => p.id === posePreset);
  const moment = presetDef ? pickMoment(presetDef) : null;
  // ทิศหน้า + สายตา สุ่มต่อรูป (2 พ.ย.): ไม่สุ่ม = ตัววางแผนให้หันหน้ามองกล้องทุกรูป · ไม่ใช้กับรูปท่าโพสต์ (ลอกหัว/สายตาจากรูปนั้น),
  // ท่าเดิม (คงท่าในรูปนางแบบ) และตอนผู้ใช้เลือกการมองเอง · AI จัดท่าฯ ไม่สุ่ม: ตัววางแผนคิดมุมหน้าเองตามท่า (HEAD_GAZE_RULE ใน photo-director)
  const headGaze = !setRef && !req.pose && !isDirector && !text(req.gaze) && (posePreset || req.auto_pose) ? pickHeadGazes(1)[0] : null;
  // ลอกทั้งช็อต + แสงจากรูปต้นแบบ: อ่านแสงทั้งภาพ + แสงบนผิว (ไฮไลต์/ความฉ่ำ) จากรูปท่า พร้อมกัน — โมเดลอ่านรูปตัวเล็ก ไม่ถึงสตางค์
  const lightFromRef = !planningOnly && !setRef && req.pose && poseMode !== 'pose' && !look && req.light_from_ref;
  const [refLight, skinLight, sceneLight, plan, director] = await Promise.all([
    lightFromRef ? describeLighting({ data: req.pose, mime: 'image/jpeg' }) : null,
    lightFromRef ? describeSkinLight({ data: req.pose, mime: 'image/jpeg' }) : null,
    !planningOnly && !setRef && req.scene_image && !shotScene ? describeLighting({ data: req.scene_image, mime: 'image/jpeg' }) : null,
    posePreset && !directorInput ? planPose({
      location: req.scene_image ? { data: req.scene_image, mime: 'image/jpeg' } : sceneText0 ? null : { data: req.person, mime: 'image/jpeg' },
      locationIsModelPhoto: !req.scene_image && !sceneText0,
      locationText: req.scene_image ? null : sceneText0,
      outfit: req.outfit ? { data: req.outfit, mime: 'image/jpeg' } : null,
      accessories: accessories.map((a) => ({ img: { data: a.data, mime: 'image/jpeg' }, what: String(a.what || 'an accessory').slice(0, 200) })),
      preset: posePreset,
      moment,
      headGaze: headGaze?.prompt ?? null,
    }) : null,
    directorInput ? selectedPlan ?? directPhoto(directorInput) : null,
  ]);
  if (directorInput && !director) return json(503, { error: 'AI ยังวางแผนภาพที่ใช้ได้ไม่สำเร็จ กรุณาลองอีกครั้ง (ยังไม่ได้สร้างรูป)' });
  if (planningOnly && director && directorInput) return json(200, { proposal: createShotProposal(director, directorInput, caller) });
  const directedShot = director ? selectedShot(director) : null;
  const planName = directedShot?.title ?? (plan ? (POSE_PRESETS.find((p) => p.id === plan.preset)?.name ?? POSE_AUTO.name) : null);
  const poseInstruction = director ? shotInstruction(director) : plan?.en ?? null;
  const poseMeta: StoredPosePlan | null = director && directedShot ? { name: directedShot.title, th: directedShot.reasonThai, director }
    : plan ? { name: planName!, th: plan.th } : null;
  // ตำแหน่งในภาพ: เลือกเอง (ซ้าย/กลาง/ขวา) หรืออัตโนมัติ = สุ่มต่อรูป · ชุดภาพมุมที่ 2 เป็นต้นไปลอกจากรูปหลัก
  const placement = setRef ? null : directedShot?.placement ?? chosenPlacement ?? pickPlacement();
  // ใช้ภาพที่ไหน (lib/aspects.ts): OpenAI ทำได้แค่ 2:3 / 1:1 / 3:2 -> 4:5 / 9:16 ทำ 2:3 แล้วตัดกลางภาพ (cropTo) บอก AI ว่าขอบไหนจะโดนตัด
  const crop = String(req.model).startsWith('openai:') && !AI_ASPECTS.includes(aspect)
    ? cropLine(aspect, director ? false : setRef ? setShot!.full_body !== false : req.full_body ?? true) : null;
  const prompt = setRef ? buildSetPrompt({
    framing: text(setShot!.framing)!,
    angle: text(setShot!.angle)!,
    fullBody: setShot!.full_body !== false,
    hasOutfit: Boolean(req.outfit),
    accessories: accessories.map((a) => String(a.what || 'an accessory').slice(0, 200)),
    extra: isDirector ? null : req.extra,
    crop,
  }) : buildPrompt({
    hasOutfit: Boolean(req.outfit),
    hasSceneImage: !shotScene && Boolean(req.scene_image),
    sceneText: shotScene ? null : req.scene_text,
    extra: isDirector ? null : req.extra,
    look,
    fullBody: req.full_body ?? true,
    accessories: accessories.map((a) => String(a.what || 'an accessory').slice(0, 200)),
    hasPose: Boolean(req.pose),
    // ท่าสำเร็จรูปวางแผนไม่สำเร็จ -> ใช้คำสั่ง "AI เลือกท่าให้" แบบเดิม (ยังได้รูป)
    autoPose: !req.pose && !director && (Boolean(req.auto_pose) || (Boolean(posePreset) && !plan)),
    posePlan: poseInstruction,
    directed: director?.backgroundMode,
    poseHints: accessories.map((a) => String(a.show ?? '').slice(0, 200)).filter(Boolean),
    poseMode,
    framing: directedShot?.framing ?? text(req.framing),
    gaze: isDirector ? null : text(req.gaze),
    headGaze: directedShot?.headGazeExpression ?? headGaze?.prompt ?? null,
    props: isDirector ? [] : texts(req.props),
    face: isDirector ? null : text(req.face),
    faceFromRef: Boolean(req.face_from_ref),
    refLight,
    skinLight,
    sceneLight,
    // ระยะ/มุมกล้องที่เลือกเอง (ไม่ใช่ตามสไตล์) -> lib/prompts.ts สั่งย้ำให้ชนะรูปท่า/รูปฉาก
    camera: directedShot ? { framing: directedShot.framing, angle: directedShot.cameraAngle }
      : text(req.camera_framing) || text(req.camera_angle) ? { framing: text(req.camera_framing), angle: text(req.camera_angle) } : null,
    placement, // ข้างที่วางคนในภาพ สุ่มต่อรูป (ไม่สั่ง = AI วางกลางภาพเสมอ)
    crop,
  });
  // GPT Image 2.5: ค่าเริ่มต้นรูปใหญ่ 1664×2496 (หน้า/ผิวละเอียดขึ้น) · ขนาดตามแนวของสัดส่วนที่เลือก
  const baseSize = aspectBaseSize(aspect);
  const size = isGpt25(String(req.model)) ? GPT25_SIZES[baseSize] : baseSize;
  const opt = { aspect, size, quality: req.quality ?? 'medium' };

  const harmonizeText = req.harmonize && !setRef ? harmonizePrompt(look) : null; // ชุดภาพ: รูปหลักปรับแสงมาแล้ว

  // ---------- log สิ่งที่ส่งให้ AI (lib/genlog.ts) แบ่งเป็น ai / model / element / pose / style / prompt ----------
  // params = ค่าที่ lib/ai.ts ส่งให้เจ้านั้นจริง (OpenAI บางโมเดลไม่รับ input_fidelity แล้วส่งใหม่แบบไม่ใส่ — ดูได้ใน terminal)
  // file: URL รูปตัวอย่างเข้ารหัสชื่อไทยไว้ (%E0%B9...) แปลงกลับให้อ่านออกใน log
  const readable = (src?: string) => {
    try {
      return src && decodeURIComponent(src);
    } catch {
      return src;
    }
  };
  const imgs = inputs.map((x, i) => ({
    role: x.role,
    log: {
      image: i + 1, name: x.ref.name, ...(x.ref.type ? { type: x.ref.type } : {}), file: readable(x.ref.src),
      sent: [x.ref.w && x.ref.h ? `${x.ref.w}×${x.ref.h}` : null, `${Math.round((x.data.length * 0.75) / 1024)} KB`].filter(Boolean).join(' · '),
    } as LogImage,
  }));
  const byRole = (role: string) => imgs.filter((x) => x.role === role).map((x) => x.log);
  const choices = (refs.choices && typeof refs.choices === 'object' ? refs.choices : {}) as Record<string, unknown>;
  const style: GenerateLog['style'] = { placement: (placement ?? 'ไม่สั่ง (AI วางกลาง)') + (chosenPlacement ? ' · เลือกเอง' : ' · อัตโนมัติ') };
  for (const k of ['preset', 'light', 'lens', 'angle', 'framing', 'color', 'scene', 'face', 'lightSource', 'gaze', 'aspect'] as const) {
    if (isDirector && ['lens', 'angle', 'framing', 'face', 'gaze'].includes(k)) continue;
    const v = text(choices[k]);
    if (v) style[k] = v;
  }
  style.aspect = `${PLATFORM_ASPECTS.find((a) => a.id === aspect)!.name} · ${aspect}${crop ? ` (ตัดจาก ${size})` : ''}`;
  if (!isDirector && texts(choices.props).length) style.props = texts(choices.props);
  if (harmonizeText) style.harmonize = true;
  if (refLight) style.refLight = refLight; // แสงที่ AI อ่านจากรูปต้นแบบ (ส่งต่อในพรอมต์ด้วย)
  if (skinLight) style.skinLight = skinLight; // แสงบนผิวที่ AI อ่านจากรูปต้นแบบ
  if (sceneLight) style.sceneLight = sceneLight; // แสงที่ AI อ่านจากรูปฉาก
  if (!isDirector && text(req.extra)) style.extra = text(req.extra)!;
  const sceneText = text(req.scene_text);
  const params: Record<string, string> = req.model.startsWith('gemini:')
    ? { aspectRatio: opt.aspect }
    : { size: opt.size, quality: opt.quality, input_fidelity: 'high' };
  const logBase = {
    ai: { model: String(req.model), params },
    model: byRole('นางแบบ')[0],
    element: {
      outfit: byRole('ชุด')[0] ?? 'ชุดเดิม',
      accessories: byRole('ของเสริม'),
      scene: setRef ? 'ใช้ฉากจากรูปหลักของชุด' : shotScene ? 'ใช้ฉากจากรูปท่าโพสต์' : byRole('ฉาก')[0] ?? (sceneText ? { name: toRef(refs.scene).name, text: sceneText } : 'ฉากเดิม'),
    },
    pose: {
      mode: setRef ? 'AI จัดท่าให้เข้ากับมุมกล้อง' : director ? `AI จัดท่าและมุมกล้อง: ${planName}` : plan ? `AI คิดท่า: ${planName}` : posePreset ? 'AI คิดท่าไม่สำเร็จ ใช้ AI เลือกท่าแบบเดิม'
        : text(choices.poseMode) ?? (req.pose ? poseMode : req.auto_pose ? 'AI เลือกท่าให้' : 'ท่าเดิม'),
      ...(plan ? { moment: moment ?? undefined, plan_th: plan.th, plan_en: plan.en } : {}),
      ...(headGaze ? { headGaze: headGaze.name } : {}),
      ...(director ? { plan_th: poseMeta!.th, plan_en: poseInstruction!, director } : {}),
      ...byRole('ท่าโพสต์')[0],
    },
    ...(setRef ? { set: { shot: text(setShot!.name) ?? '', ...byRole('รูปหลักของชุด')[0] } } : {}),
    style,
    prompt: sentences(prompt),
    ...(harmonizeText ? { harmonizePrompt: sentences(harmonizeText) } : {}),
  };
  const t0 = Date.now();
  const duration = () => `${((Date.now() - t0) / 1000).toFixed(1)} วินาที`;
  const usage = { page: 'model', action: 'generate', model: String(req.model), quality: String(opt.quality) } as const;
  let calls = 0;
  let tokens = 0; // โทเคนที่ AI คิดจริง รวมทุกครั้งที่เรียก (ปรับแสงซ้ำ = 2 ครั้ง) -> โควตาลูกค้า
  try {
    const first = await generateImage(req.model, images, prompt, opt);
    calls++;
    tokens += first.tokens;
    const again = harmonizeText ? await generateImage(req.model, [first], harmonizeText, opt) : null;
    if (again) { calls++; tokens += again.tokens; }
    // ตัดตามสัดส่วนที่เลือกก่อน (4:5 / 9:16) แล้วค่อยแปลง PNG ใหญ่ -> JPEG q97 ไม่งั้นเว็บจริงเปิดรูปไม่ขึ้น
    const image = await servable(await cropTo(again ?? first, aspect));
    // เซฟลง results/ ทันที (เสียเงินไปแล้ว ห้ามหาย)
    const save = (img: Img, savedPlan: StoredPosePlan | null) => saveImage({ area: 'results' }, img.data, img.mime,
      { caption: String(req.caption ?? '').slice(0, 300), ...(setTag ? { set: setTag } : {}), ...(finish ? { finish } : {}),
        ...(savedPlan ? { posePlan: savedPlan } : {}) });
    const delivery = director && directorInput && poseMeta ? await deliverDirectedImage(image, poseMeta, req.auto_repair !== false, {
      review: (img) => reviewShot(directorInput, director, img),
      save,
      canRepair: async () => !(await quotaBlock(tokens || ESTIMATED_TOKENS * calls)),
      repair: async (draft, correction) => {
        const repairPrompt = `${prompt} Image ${images.length + 1} is the failed draft to correct, NOT another identity, outfit or location reference. `
          + `Make one targeted correction: ${correction} Preserve all successful details. The original references remain authoritative.`;
        const fixed = await generateImage(req.model, [...images, draft], repairPrompt, opt);
        calls++; tokens += fixed.tokens;
        logBase.prompt.push(`Automatic repair: ${correction}`);
        return servable(await cropTo(fixed, aspect));
      },
    }) : { src: await save(image, poseMeta), posePlan: poseMeta };
    const log = await writeGenerateLog({ time: localTime(), status: 'สำเร็จ', duration: duration(), result: delivery.src,
      ...logBase, ...(director ? { delivery: delivery.posePlan } : {}) });
    await recordUsage({ ...usage, calls, status: 'ok', tokens, log });
    return json(200, delivery);
  } catch (e) {
    const log = await writeGenerateLog({ time: localTime(), status: 'พัง', duration: duration(), error: (e as Error).message, ...logBase });
    await recordUsage({ ...usage, calls, status: 'error', tokens, log });
    throw e;
  }
});
