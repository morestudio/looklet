import { availableModels, generateImage, type Img } from '@/lib/ai';
import { MAX_ACCESSORIES, POSE_MODES, type PoseMode } from '@/lib/catalog';
import { localTime, sentences, writeGenerateLog, type GenerateLog, type LogImage } from '@/lib/genlog';
import { buildPrompt, harmonizePrompt } from '@/lib/prompts';
import { json, post } from '@/lib/route';
import { saveImage } from '@/lib/storage';

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

  // รูปที่ส่งให้ AI: นางแบบ (ต้องมี) + ชุด + ของเสริม + ท่าโพสต์ + ฉาก (ถ้าเลือก) — ลำดับต้องตรงกับ buildPrompt
  // ทำรายการเดียวใช้ทั้งส่ง AI และทำ log ลำดับใน log จะตรงกับที่ AI เห็นเสมอ
  const refs = (req.refs && typeof req.refs === 'object' ? req.refs : {}) as Record<string, unknown>;
  const accRefs = Array.isArray(refs.accessories) ? refs.accessories : [];
  const inputs = [
    { role: 'นางแบบ', data: req.person, ref: toRef(refs.person) },
    { role: 'ชุด', data: req.outfit, ref: toRef(refs.outfit) },
    ...accessories.map((a, i) => ({ role: 'ของเสริม', data: a.data, ref: toRef(accRefs[i]) })),
    { role: 'ท่าโพสต์', data: req.pose, ref: toRef(refs.pose) },
    { role: 'ฉาก', data: shotScene ? null : req.scene_image, ref: toRef(refs.scene) },
  ].filter((x): x is { role: string; data: string; ref: Ref } => typeof x.data === 'string' && x.data.length > 0);
  const images: Img[] = inputs.map((x) => ({ data: x.data, mime: 'image/jpeg' }));
  const look: string | null = req.look ?? null;
  const prompt = buildPrompt({
    hasOutfit: Boolean(req.outfit),
    hasSceneImage: !shotScene && Boolean(req.scene_image),
    sceneText: shotScene ? null : req.scene_text,
    extra: req.extra,
    look,
    fullBody: req.full_body ?? true,
    accessories: accessories.map((a) => String(a.what || 'an accessory').slice(0, 200)),
    hasPose: Boolean(req.pose),
    autoPose: !req.pose && Boolean(req.auto_pose), // มีรูปท่าแล้ว ใช้รูปท่า
    poseHints: accessories.map((a) => String(a.show ?? '').slice(0, 200)).filter(Boolean),
    poseMode,
    framing: text(req.framing),
    camera: texts(req.camera),
    gaze: text(req.gaze),
    props: texts(req.props),
  });
  const opt = { aspect: req.aspect ?? '2:3', size: req.size ?? '1024x1536', quality: req.quality ?? 'medium' };

  const harmonizeText = req.harmonize ? harmonizePrompt(look) : null;

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
  for (const k of ['light', 'camera', 'angle', 'framing', 'gaze', 'aspect'] as const) {
    const v = text(choices[k]);
    if (v) style[k] = v;
  }
  if (texts(choices.props).length) style.props = texts(choices.props);
  if (harmonizeText) style.harmonize = true;
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
      scene: shotScene ? 'ใช้ฉากจากรูปท่าโพสต์' : byRole('ฉาก')[0] ?? (sceneText ? { name: toRef(refs.scene).name, text: sceneText } : 'ฉากเดิม'),
    },
    pose: { mode: text(choices.poseMode) ?? (req.pose ? poseMode : req.auto_pose ? 'AI เลือกท่าให้' : 'ท่าเดิม'), ...byRole('ท่าโพสต์')[0] },
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
    const src = await saveImage({ area: 'results' }, image.data, image.mime, { caption: String(req.caption ?? '').slice(0, 300) });
    await writeGenerateLog({ time: localTime(), status: 'สำเร็จ', duration: duration(), result: src, ...logBase });
    return json(200, { src });
  } catch (e) {
    await writeGenerateLog({ time: localTime(), status: 'พัง', duration: duration(), error: (e as Error).message, ...logBase });
    throw e;
  }
});
