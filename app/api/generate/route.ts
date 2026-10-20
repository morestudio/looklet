import { availableModels, describeLighting, generateImage, planPose, type Img } from '@/lib/ai';
import { MAX_ACCESSORIES, pickMoment, POSE_AUTO, POSE_MODES, POSE_PRESETS, type PoseMode } from '@/lib/catalog';
import { localTime, sentences, writeGenerateLog, type GenerateLog, type LogImage } from '@/lib/genlog';
import { buildPrompt, buildSetPrompt, harmonizePrompt } from '@/lib/prompts';
import { json, post } from '@/lib/route';
import { saveImage, type SetTag } from '@/lib/storage';

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
  // สุ่มจังหวะของท่า 1 แบบ (POSE_PRESETS moments) — ไม่สุ่ม = AI ตัววางแผนให้ท่าเดิมซ้ำทุกรูป
  const presetDef = POSE_PRESETS.find((p) => p.id === posePreset);
  const moment = presetDef ? pickMoment(presetDef) : null;
  const [refLight, sceneLight, plan] = await Promise.all([
    !setRef && req.pose && poseMode !== 'pose' && !look && req.light_from_ref ? describeLighting({ data: req.pose, mime: 'image/jpeg' }) : null,
    !setRef && req.scene_image && !shotScene ? describeLighting({ data: req.scene_image, mime: 'image/jpeg' }) : null,
    posePreset ? planPose({
      location: req.scene_image ? { data: req.scene_image, mime: 'image/jpeg' } : sceneText0 ? null : { data: req.person, mime: 'image/jpeg' },
      locationIsModelPhoto: !req.scene_image && !sceneText0,
      locationText: req.scene_image ? null : sceneText0,
      outfit: req.outfit ? { data: req.outfit, mime: 'image/jpeg' } : null,
      accessories: accessories.map((a) => ({ img: { data: a.data, mime: 'image/jpeg' }, what: String(a.what || 'an accessory').slice(0, 200) })),
      preset: posePreset,
      moment,
    }) : null,
  ]);
  const planName = plan ? (POSE_PRESETS.find((p) => p.id === plan.preset)?.name ?? POSE_AUTO.name) : null;
  const prompt = setRef ? buildSetPrompt({
    framing: text(setShot!.framing)!,
    angle: text(setShot!.angle)!,
    fullBody: setShot!.full_body !== false,
    hasOutfit: Boolean(req.outfit),
    accessories: accessories.map((a) => String(a.what || 'an accessory').slice(0, 200)),
    extra: req.extra,
  }) : buildPrompt({
    hasOutfit: Boolean(req.outfit),
    hasSceneImage: !shotScene && Boolean(req.scene_image),
    sceneText: shotScene ? null : req.scene_text,
    extra: req.extra,
    look,
    fullBody: req.full_body ?? true,
    accessories: accessories.map((a) => String(a.what || 'an accessory').slice(0, 200)),
    hasPose: Boolean(req.pose),
    // ท่าสำเร็จรูปวางแผนไม่สำเร็จ -> ใช้คำสั่ง "AI เลือกท่าให้" แบบเดิม (ยังได้รูป)
    autoPose: !req.pose && (Boolean(req.auto_pose) || (Boolean(posePreset) && !plan)),
    posePlan: plan?.en ?? null,
    poseHints: accessories.map((a) => String(a.show ?? '').slice(0, 200)).filter(Boolean),
    poseMode,
    framing: text(req.framing),
    gaze: text(req.gaze),
    props: texts(req.props),
    face: text(req.face),
    faceFromRef: Boolean(req.face_from_ref),
    refLight,
    sceneLight,
  });
  const opt = { aspect: req.aspect ?? '2:3', size: req.size ?? '1024x1536', quality: req.quality ?? 'medium' };

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
  const style: GenerateLog['style'] = {};
  for (const k of ['preset', 'light', 'lens', 'angle', 'framing', 'color', 'face', 'lightSource', 'gaze', 'aspect'] as const) {
    const v = text(choices[k]);
    if (v) style[k] = v;
  }
  if (texts(choices.props).length) style.props = texts(choices.props);
  if (harmonizeText) style.harmonize = true;
  if (refLight) style.refLight = refLight; // แสงที่ AI อ่านจากรูปต้นแบบ (ส่งต่อในพรอมต์ด้วย)
  if (sceneLight) style.sceneLight = sceneLight; // แสงที่ AI อ่านจากรูปฉาก
  if (text(req.extra)) style.extra = text(req.extra)!;
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
      mode: setRef ? 'AI จัดท่าให้เข้ากับมุมกล้อง' : plan ? `AI คิดท่า: ${planName}` : posePreset ? 'AI คิดท่าไม่สำเร็จ ใช้ AI เลือกท่าแบบเดิม'
        : text(choices.poseMode) ?? (req.pose ? poseMode : req.auto_pose ? 'AI เลือกท่าให้' : 'ท่าเดิม'),
      ...(plan ? { moment: moment ?? undefined, plan_th: plan.th, plan_en: plan.en } : {}),
      ...byRole('ท่าโพสต์')[0],
    },
    ...(setRef ? { set: { shot: text(setShot!.name) ?? '', ...byRole('รูปหลักของชุด')[0] } } : {}),
    style,
    prompt: sentences(prompt),
    ...(harmonizeText ? { harmonizePrompt: sentences(harmonizeText) } : {}),
  };
  const t0 = Date.now();
  const duration = () => `${((Date.now() - t0) / 1000).toFixed(1)} วินาที`;
  try {
    let image = await generateImage(req.model, images, prompt, opt);
    if (harmonizeText) image = await generateImage(req.model, [image], harmonizeText, opt);
    // เซฟลง results/ ทันที (เสียเงินไปแล้ว ห้ามหาย)
    const src = await saveImage({ area: 'results' }, image.data, image.mime,
      { caption: String(req.caption ?? '').slice(0, 300), ...(setTag ? { set: setTag } : {}), ...(finish ? { finish } : {}),
        ...(plan ? { posePlan: { name: planName, th: plan.th } } : {}) });
    await writeGenerateLog({ time: localTime(), status: 'สำเร็จ', duration: duration(), result: src, ...logBase });
    return json(200, { src, posePlan: plan ? { name: planName, th: plan.th } : null });
  } catch (e) {
    await writeGenerateLog({ time: localTime(), status: 'พัง', duration: duration(), error: (e as Error).message, ...logBase });
    throw e;
  }
});
