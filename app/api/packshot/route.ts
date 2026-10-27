import { availableModels, describeLighting, generateImage, planStyling, type Img } from '@/lib/ai';
import { GPT25_SIZES, isGpt25 } from '@/lib/catalog';
import { localTime, sentences, writeGenerateLog, type LogImage, type PackshotLog } from '@/lib/genlog';
import { cropTo, servable } from '@/lib/images';
import {
  DETAIL_TARGETS, SCALE_REFERENCES, SHOT_TYPES, plainShot, shotFramings, resolveProductAngle, resolveProductBackground,
  AUTO_PROP_STYLE, AUTO_PROPS, LENS, NO_PROPS, PRODUCT_ANGLES, PRODUCT_FRAMINGS, PRODUCT_SET_SHOTS, REF_MODES,
  isProductAspect, pickOne, productPreset, productType, propStyle, type RefMode,
} from '@/lib/packshot';
import { readCreativeConcept } from '@/lib/creative';
import { buildCreativePackshotPrompt, buildPackshotPrompt, buildPackshotSetPrompt } from '@/lib/packshot-prompts';
import { json, post } from '@/lib/route';
import { saveImage, type SetTag } from '@/lib/storage';

// หน้าสินค้า (components/Packshot.tsx): หน้าเว็บส่งรูป + id ของตัวเลือก (lib/packshot.ts) server แปลงเป็นคำสั่งเอง
// 'preset' / ไม่ส่ง = ใช้ส่วนนั้นของสไตล์ที่เลือก (เหมือน "ตามสไตล์" ของหน้านางแบบ)
type Ref = { name?: string; src?: string; w?: number; h?: number; type?: string };
const text = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 400) : null);
const toRef = (v: unknown): Ref => {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return { name: text(r.name) ?? undefined, src: text(r.src) ?? undefined, w: Number(r.w) || undefined, h: Number(r.h) || undefined, type: text(r.type) ?? undefined };
};
const image = (v: unknown) => (typeof v === 'string' && v ? v : null);
const jpeg = (data: string): Img => ({ data, mime: 'image/jpeg' });
// id ที่เลือก หรือของสไตล์ (ไม่รู้จัก id = ของสไตล์)
const part = <T extends { id: string }>(list: T[], id: unknown, fallback: string) => list.find((x) => x.id === id) ?? list.find((x) => x.id === fallback)!;

export const POST = post(async (req) => {
  if (!availableModels().some((m) => m.id === req.model)) return json(400, { error: 'ไม่มีโมเดลนี้ หรือยังไม่ได้ใส่ key ใน .env' });
  const product = image(req.product);
  if (!product) return json(400, { error: 'ไม่มีรูปสินค้า' });
  const type = productType(req.product_type);
  const shotType = req.shot_type == null ? 'styled' : SHOT_TYPES.find((s) => s.id === req.shot_type)?.id;
  if (!shotType) return json(400, { error: 'ไม่มีประเภทภาพนี้' });
  const creative = shotType === 'creative' ? readCreativeConcept(req.creative_concept) : null;
  if (shotType === 'creative' && (!creative || req.set_ref)) return json(400, { error: 'เลือก 1 ไอเดียในขั้นไอเดียภาพก่อนสร้างรูป' });
  const preset = productPreset(shotType === 'styled' ? req.preset : 'clean');
  const detail = DETAIL_TARGETS.find((d) => d.id === req.detail_target) ?? DETAIL_TARGETS[0];
  if (shotType === 'detail' && detail.id === 'feature' && !text(req.feature)?.trim()) return json(400, { error: 'ระบุฟีเจอร์ที่ต้องการถ่าย' });
  const scale = SCALE_REFERENCES.find((r) => r.id === req.scale_reference) ?? SCALE_REFERENCES[0];
  const dims = req.dimensions ?? {};
  const referenceSize = req.reference_size ?? {};
  const validSize = (v: unknown) => (typeof v === 'string' || typeof v === 'number') && Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) <= 10000;
  if (shotType === 'scale' && (!['width', 'height', 'depth'].every((k) => validSize(dims[k]))
    || (scale.id === 'laptop' && !['width', 'depth'].every((k) => validSize(referenceSize[k]))))) {
    return json(400, { error: 'กรอกขนาดจริงเป็นเซนติเมตรให้ครบ และมากกว่า 0' });
  }
  const supports: string[] = Array.isArray(req.support_images) ? req.support_images.slice(0, 5).map(image).filter((i: string | null): i is string => Boolean(i)) : [];
  const aspect = isProductAspect(req.aspect) ? String(req.aspect) : '4:5';
  // ชุดภาพสินค้า (รูปที่ 2 เป็นต้นไป): set_ref = รูปแรกของชุด, set_shot = id ใน PRODUCT_SET_SHOTS — ไม่ส่งช็อตต้นแบบ/รูปฉาก ใช้จากรูปแรก
  const setRef = image(req.set_ref);
  const setShot = setRef ? PRODUCT_SET_SHOTS.find((s) => s.id === req.set_shot) : undefined;
  if (setRef && !setShot) return json(400, { error: 'ชุดภาพ: ไม่มีมุมกล้องของรูปนี้' });
  const setTag: SetTag | null = req.set && typeof req.set.id === 'string' && /^[\w-]{1,40}$/.test(req.set.id) && Number.isInteger(req.set.index)
    ? { id: req.set.id, index: req.set.index } : null;
  const finish = req.finish === 'phone' || req.finish === 'film' || req.finish === 'off' ? req.finish : null;

  // ช็อตต้นแบบ: เอาอะไรจากรูปนั้น (REF_MODES) · รูปฉากใช้ได้เฉพาะตอนไม่ได้ลอกฉากจากช็อตต้นแบบ
  const ref = setRef || shotType !== 'styled' ? null : image(req.ref);
  const refMode: RefMode | null = ref ? (REF_MODES.find((m) => m.id === req.ref_mode)?.id ?? 'shot') : null;
  const setImage = shotType !== 'styled' || setRef || refMode === 'shot' || refMode === 'set-light' ? null : image(req.set_image);
  // พร็อพของฉัน (Custom): พิมพ์เอง และ/หรือ รูปของจริง ใส่เพิ่มจากแนวพร็อพที่เลือก (ไม่มีพร็อพ + ของฉัน = มีแค่ของฉัน)
  const ownProps = shotType === 'styled' && !setRef && refMode !== 'shot';
  const propText = ownProps ? text(req.prop_text)?.trim().slice(0, 200) || null : null;
  const propImage = ownProps ? image(req.prop_image) : null;
  const own = propText || propImage ? `the user's own prop${propText ? ` (${propText})` : ''}${propImage ? ', the exact object from the prop photo' : ''}` : null;

  const angle = setShot ? part(PRODUCT_ANGLES, setShot.angle, 'front') : resolveProductAngle(shotType, req.angle, preset.angle, detail.id, scale.id);
  const framing = setShot ? part(PRODUCT_FRAMINGS, setShot.framing, 'medium') : part(shotFramings(shotType), req.framing, shotType === 'detail' ? 'detail' : preset.framing);
  const background = resolveProductBackground(shotType, preset, req.set_id, req.set_color, req.light, scale.id);
  const light = background.light;
  const setDef = background.set;
  const color = background.color.id === 'set' ? null : background.color;
  const variant = setDef.variants ? pickOne(setDef.variants) : null; // แท่นประติมากรรม: สุ่มของที่ใช้เป็นแท่นต่อรูป
  const setText = setImage ? null : setDef.prompt.replace('{color}', color?.prompt ?? setDef.color ?? '').replace('{variant}', variant ?? '');
  // พร็อพ: ลอกทั้งช็อต = พร็อพตามรูปต้นแบบ · แนวพร็อพ + จังหวะที่สุ่ม -> AI ตัววางแผนเขียนพร็อพจริงให้
  const propsId = shotType !== 'styled' || setRef || refMode === 'shot' ? NO_PROPS : String(propStyle(req.props) || req.props === AUTO_PROPS ? req.props : preset.props);
  const style = propStyle(propsId);
  const moment = style?.moments.length ? pickOne(style.moments) : null;

  // อ่านแสงในช็อตต้นแบบ/รูปฉาก + วางพร็อพ พร้อมกัน (ไม่ต้องรอต่อกัน)
  const [refLight, sceneLight, plan] = await Promise.all([
    ref ? describeLighting(jpeg(ref)) : null,
    setImage ? describeLighting(jpeg(setImage)) : null,
    propsId !== NO_PROPS ? planStyling({
      product: jpeg(product), what: type.prompt, setImage: setImage ? jpeg(setImage) : null, setText, style: propsId, moment,
      ownProp: propText, propImage: propImage ? jpeg(propImage) : null,
    }) : null,
  ]);
  const planName = plan ? (propStyle(plan.style)?.name ?? AUTO_PROP_STYLE.name) : null;
  // วางแผนพร็อพไม่สำเร็จ -> ใช้ brief ของแนวพร็อพ (+ จังหวะที่สุ่ม) แทน ยังได้รูป · "AI เลือกให้" ไม่มี brief -> ไม่ใส่พร็อพ
  const styled = propsId === NO_PROPS ? null : plan?.en ?? (style ? style.brief + (moment ? ` Include ${moment}.` : '') : null);
  const props = styled ? styled + (own ? ` One of the props is ${own}.` : '') : own ? `Only ${own}, placed beside the product.` : null;

  // OpenAI ทำได้แค่ 2:3 / 1:1 / 3:2 -> ทำขนาดใกล้สุดแล้วตัด (cropTo) · GPT Image 2.5 ใช้ขนาดใหญ่ (GPT25_SIZES) แบบหน้านางแบบ
  const [aw, ah] = aspect.split(':').map(Number);
  const baseSize = aw < ah ? '1024x1536' : aw > ah ? '1536x1024' : '1024x1024';
  const openai = String(req.model).startsWith('openai:');
  const size = isGpt25(String(req.model)) ? GPT25_SIZES[baseSize] : baseSize;
  const crop = openai && !['2:3', '1:1', '3:2'].includes(aspect) ? `a ${aspect} ${aw < ah ? 'portrait' : 'landscape'} frame` : null;
  const opt = { aspect, size, quality: req.quality ?? 'high' };

  const flat = Boolean(angle.flat);
  const place = shotType === 'scale' && (scale.id === 'hand' || scale.id === 'person')
    ? `The product is naturally held or worn: ${scale.prompt}. It has real weight, natural contact and gravity.`
    : flat ? type.flat : type.stand;
  const lens = framing.lens ?? LENS;
  let prompt = creative ? buildCreativePackshotPrompt({ what: type.prompt, concept: creative.prompt, crop, extra: req.extra }) : setRef ? buildPackshotSetPrompt({ what: type.prompt, place, flat, lens, angle: angle.prompt, framing: framing.prompt, crop, extra: req.extra })
    : buildPackshotPrompt({
      what: type.prompt, place, flat, refMode, hasSetImage: Boolean(setImage), hasPropImage: Boolean(propImage), set: setText, props,
      light: ref || setImage ? null : light.prompt, refLight, sceneLight, lens, angle: angle.prompt, framing: (props && framing.withProps) || framing.prompt,
      grade: ref ? null : preset.grade, crop, extra: req.extra,
      detail: shotType === 'detail', scale: shotType === 'scale' ? scale.prompt : null,
    });

  if (!setRef && !ref && !setImage && background.color.id === 'match') prompt += ' Choose a background color that complements the product while keeping a visible luminance contrast along its edges. Preserve the exact product color, without tinting it with the backdrop color.';
  if (shotType === 'detail') prompt += ' Use a plain, visually quiet neutral background, softly out of focus, while keeping the selected product detail sharp and readable.';
  if (plainShot(shotType)) prompt += ' This is a catalog packshot: exactly one product on a plain seamless background, no props, no decoration, no text overlays. Preserve accurate product colors and keep every view at consistent photographic magnification, ground line and lighting; do not resize each view independently to fill the frame.';
  if (shotType === 'detail') prompt += ` This is a macro detail photograph. Focus specifically on ${detail.prompt}. ${text(req.feature) ?? ''} Show only that area at high detail; do not invent features absent from the source photos. The rest of the product may extend outside the frame.`;
  if (shotType === 'scale') prompt += ` This image communicates real size. Product dimensions: width ${Number(dims.width)} cm, height ${Number(dims.height)} cm, depth ${Number(dims.depth)} cm. Reference: ${scale.prompt}. ${scale.id === 'laptop' ? `Laptop body width ${Number(referenceSize.width)} cm and depth ${Number(referenceSize.depth)} cm.` : ''} Use these dimensions to establish physically plausible relative scale. Keep the product and reference in the same depth plane, without forced perspective or decorative props. Do not add dimension labels or text.`;

  // รูปที่ส่งให้ AI เรียงตาม buildPackshotPrompt / buildPackshotSetPrompt — รายการเดียวใช้ทั้งส่ง AI และทำ log
  const refs = (req.refs && typeof req.refs === 'object' ? req.refs : {}) as Record<string, unknown>;
  const inputs = [
    { role: 'set', data: setRef, ref: toRef(refs.set_ref) },
    { role: 'product', data: product, ref: toRef(refs.product) },
    { role: 'ref', data: ref, ref: toRef(refs.ref) },
    { role: 'scene', data: setImage, ref: toRef(refs.set_image) },
    { role: 'prop', data: propImage, ref: toRef(refs.prop_image) },
    ...supports.map((data) => ({ role: 'product-detail', data, ref: {} as Ref })),
  ].filter((x): x is { role: string; data: string; ref: Ref } => typeof x.data === 'string');
  const supportIndexes = inputs.flatMap((x, i) => x.role === 'product-detail' ? [i + 1] : []);
  if (supportIndexes.length) prompt += ` Images ${supportIndexes.join(', ')} are additional photographs of the SAME product, showing real sides and fine details. Use them as authoritative design evidence, never as styling or background references. Preserve the actual back, sides, base and features; do not invent details.`;
  const images = inputs.map((x) => jpeg(x.data));

  // ---------- log (lib/genlog.ts PackshotLog) ----------
  const readable = (src?: string) => {
    try {
      return src && decodeURIComponent(src);
    } catch {
      return src;
    }
  };
  const logOf = (role: string): LogImage | undefined => {
    const i = inputs.findIndex((x) => x.role === role);
    if (i < 0) return undefined;
    const { ref: r, data } = inputs[i];
    return {
      image: i + 1, name: r.name, ...(r.type ? { type: r.type } : {}), file: readable(r.src),
      sent: [r.w && r.h ? `${r.w}×${r.h}` : null, `${Math.round((data.length * 0.75) / 1024)} KB`].filter(Boolean).join(' · '),
    };
  };
  const styleLog: PackshotLog['style'] = {
    preset: `${SHOT_TYPES.find((s) => s.id === shotType)!.name} · ${creative?.title ?? preset.name}`, angle: creative ? 'ตามคอนเซปต์' : angle.name, framing: creative?.composition ?? framing.name, aspect: aspect + (crop ? ' (ตัดจาก ' + size + ')' : ''),
  };
  if (!ref && !setRef) styleLog.light = creative?.lighting ?? light.name;
  if (color && setText) styleLog.color = color.name;
  if (creative) styleLog.color = creative.palette.join(' · ');
  if (variant) styleLog.plinth = variant;
  if (refLight) styleLog.refLight = refLight;
  if (sceneLight) styleLog.sceneLight = sceneLight;
  if (text(req.extra)) styleLog.extra = text(req.extra)!;
  const refModeName = REF_MODES.find((m) => m.id === refMode)?.name;
  const logBase = {
    page: 'สินค้า' as const,
    ai: { model: String(req.model), params: (openai ? { size, quality: String(opt.quality), input_fidelity: 'high' } : { aspectRatio: aspect }) as Record<string, string> },
    product: logOf('product')!,
    element: {
      set: creative ? { name: creative.scene, text: creative.prompt } : setRef ? 'ใช้ฉากจากรูปแรกของชุด' : refMode === 'shot' || refMode === 'set-light' ? 'ตามช็อตต้นแบบ'
        : logOf('scene') ?? { name: setDef.name, text: setText ?? '' },
      ...(ref ? { reference: { mode: refModeName ?? '', ...logOf('ref') } } : {}),
      props: {
        style: creative ? creative.props : setRef ? 'ตามรูปแรกของชุด' : refMode === 'shot' ? 'ตามช็อตต้นแบบ' : propsId === NO_PROPS ? (own ? 'พร็อพของฉันอย่างเดียว' : 'ไม่มีพร็อพ')
          : plan ? `AI วางพร็อพ: ${planName}` : `AI วางพร็อพไม่สำเร็จ ใช้แนวทางของ ${style?.name ?? AUTO_PROP_STYLE.name}`,
        ...(moment ? { moment } : {}), ...(plan ? { plan_th: plan.th, plan_en: plan.en } : {}),
        ...(propText ? { own: propText } : {}), ...(propImage ? { image: logOf('prop') } : {}),
      },
    },
    ...(setRef ? { set: { shot: setShot!.name, ...logOf('set') } } : {}),
    style: styleLog,
    prompt: sentences(prompt),
  };
  const t0 = Date.now();
  const duration = () => `${((Date.now() - t0) / 1000).toFixed(1)} วินาที`;
  try {
    let out = await generateImage(req.model, images, prompt, opt);
    out = await servable(await cropTo(out, aspect)); // ตัดตามสัดส่วนก่อน แล้วค่อยแปลงรูปใหญ่เป็น JPEG
    const stylePlan = creative ? { name: creative.title, th: creative.summary } : plan ? { name: planName!, th: plan.th } : null;
    // เซฟทันที (เสียเงินไปแล้ว ห้ามหาย) — page = 'product' ให้แต่ละหน้าโชว์เฉพาะรูปของตัวเอง
    const src = await saveImage({ area: 'results' }, out.data, out.mime, {
      page: 'product', caption: String(req.caption ?? '').slice(0, 300), ...(setTag ? { set: setTag } : {}), ...(finish ? { finish } : {}),
      ...(stylePlan ? { stylePlan } : {}),
    });
    await writeGenerateLog({ time: localTime(), status: 'สำเร็จ', duration: duration(), result: src, ...logBase });
    return json(200, { src, stylePlan });
  } catch (e) {
    await writeGenerateLog({ time: localTime(), status: 'พัง', duration: duration(), error: (e as Error).message, ...logBase });
    throw e;
  }
});
