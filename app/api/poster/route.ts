// /api/poster — ภาพโปสเตอร์ (ต้นแบบ 20 พ.ย., docs/poster-plan.md)
// หน้าเว็บส่ง: รูปตัวหลัก (Image 1) + รูปฉากของผู้ใช้ (Image 2 ถ้ามี) + แผนผัง (รูปสุดท้าย: กราฟิกข้อความจริงบนพื้นขาว สัดส่วนโปสเตอร์, 23 พ.ย.)
// ตัดพื้นหลังแล้ววางเอง: ภาพวางผัง (Image 1) + ตัวหลัก 1–3 ชิ้นบนพื้นขาว (Image 2..) + แผนผัง
// AI สร้างทั้งภาพ (ตัวหลักอยู่ในฉาก) เว้นที่กราฟิกไว้เรียบๆ · route เติมขอบแผนผังให้เป็นสัดส่วนที่ AI ทำได้ (editCanvas)
// แล้วตัดกลางผลลัพธ์กลับเป็นสัดส่วนโปสเตอร์ (cropTo) ที่ความละเอียดเต็ม · กราฟิกข้อความหน้าเว็บวางทับเอง (ไม่ส่งให้ AI วาดตัวอักษร)
import sharp from 'sharp';
import { canUsePoster } from '@/lib/account';
import { availableModels, generateImage, type Img } from '@/lib/ai';
import { AI_ASPECTS, aspectBaseSize } from '@/lib/aspects';
import { defaultQuality, GPT25_SIZES, isGpt25, POSTER_AI_MODEL } from '@/lib/catalog';
import { localTime, sentences, writeGenerateLog, type GenerateLog } from '@/lib/genlog';
import { cropTo, servable } from '@/lib/images';
import { editCanvas, toEditCanvas } from '@/lib/local-edit-images';
import {
  POSTER_EXTRA_MAX,
  POSTER_SUBJECTS_MAX,
  aspectRatio,
  isArea,
  isAreas,
  isHint,
  isLook,
  isPosterAspect,
  paletteOf,
  readGraphic,
  sceneOf,
  type FieldId,
  type Rect,
} from '@/lib/poster';
import { buildPosterPrompt } from '@/lib/poster-prompts';
import { errorResponse, json, post } from '@/lib/route';
import { saveGuide, saveImage } from '@/lib/storage';
import { quotaBlock, recordUsage } from '@/lib/usage';

export const maxDuration = 300;

const MAX_B64 = 2_000_000; // ~1.5 MB ต่อรูป (ทั้ง request ต้องไม่เกิน 4.5 MB ของ Vercel) · หน้าเว็บส่ง ≤1024px ~0.1–0.4 MB
// key ยาวขึ้นได้ตามจำนวนกรอบ (ชิ้นข้อความแยกกัน 23 พ.ย.: กรอบละ ~20 ตัว)
const keyOk = (k: unknown): k is string => typeof k === 'string' && k.length <= 260 && /^[\w:|,.-]+$/.test(k);
const isB64 = (s: unknown): s is string =>
  typeof s === 'string' && s.length <= MAX_B64 && /^[a-zA-Z0-9+/]+={0,2}$/.test(s);

async function readImg(b64: string) {
  const meta = await sharp(Buffer.from(b64, 'base64')).metadata();
  if (!meta.width || !meta.height || !['jpeg', 'png'].includes(meta.format ?? '')) return null;
  const img: Img = { data: b64, mime: meta.format === 'png' ? 'image/png' : 'image/jpeg' };
  return { img, width: meta.width, height: meta.height };
}
const readOrNull = (b64: string) => readImg(b64).catch(() => null);

// เก็บรูปที่ส่งให้ AI ไว้ให้หน้าตรวจงาน (แบบภาพไฮไลต์ของแก้เฉพาะจุด: ไม่มีแถวในคลัง เปิดได้เฉพาะ superadmin) · เก็บไม่ได้ = ไม่เป็นไร
const keepInput = (b64: string) =>
  sharp(Buffer.from(b64, 'base64'))
    .flatten({ background: '#fff' })
    .jpeg({ quality: 85 })
    .toBuffer()
    .then(saveGuide)
    .catch((e) => {
      console.error('เก็บรูปที่ส่งให้ AI ไม่สำเร็จ', e);
      return null;
    });
const fileOf = (src: string | null) => (src ? { file: src } : {});

export const POST = post(
  async (req) => {
    if (!canUsePoster()) return errorResponse(403, 'หน้าโปสเตอร์ยังเปิดเฉพาะผู้ดูแล'); // ต้นแบบ (27 พ.ย.)
    if (!isPosterAspect(req.aspect)) return errorResponse(400, 'เลือกขนาดโปสเตอร์ก่อน');
    // subjects = ตัวหลักหลายรูป (23 พ.ย.): ตัดพื้นหลังแล้วทีละชิ้นบนพื้นขาว เรียงซ้ายไปขวา · subject = รูปเดียว (แบบเดิม)
    // cut = ตัวหลักตัดพื้นหลังแล้ว (หลายรูปต้องตัด) · hint = ที่ที่ผู้ใช้วางคร่าวๆ บนเวที (อาร์ตไดเรกเตอร์ทำตามแบบหลวมๆ)
    const subjectList: unknown[] = Array.isArray(req.subjects) ? req.subjects : [req.subject];
    if (!subjectList.length || subjectList.length > POSTER_SUBJECTS_MAX || !subjectList.every(isB64))
      return errorResponse(400, 'เพิ่มรูปสินค้า / อาหารก่อน (หรือรูปใหญ่เกินไป)');
    // layout = ตัวหลักตัดพื้นหลังแล้ว ผู้ใช้วางเอง (23 พ.ย.): ภาพวางผัง (Image 1) + ตัวหลักบนพื้นขาว (Image 2..) + กราฟิก (รูปสุดท้าย)
    // รูปฉากของผู้ใช้อยู่ในภาพวางผังแล้ว (scene: null) ไม่ส่งแยก
    const withLayout = req.layout != null && req.layout !== '';
    if (withLayout && !isB64(req.layout)) return errorResponse(400, 'ภาพวางผังไม่ถูกต้อง หรือใหญ่เกินไป');
    const cut = withLayout || req.cut === true;
    if (subjectList.length > 1 && !cut) return errorResponse(400, 'ตัวหลักหลายรูปต้องตัดพื้นหลังก่อน');
    if (req.hint != null && !isHint(req.hint)) return errorResponse(400, 'ตำแหน่งตัวหลักไม่ถูกต้อง');
    // สไตล์ภาพ (25 พ.ย.): ไม่ส่ง = ภาพถ่าย (หน้าเว็บเก่า)
    if (req.look != null && !isLook(req.look)) return errorResponse(400, 'สไตล์ภาพไม่ถูกต้อง');
    const look = isLook(req.look) ? req.look : 'photo';
    const hint = withLayout ? null : ((req.hint as Rect | undefined) ?? null);
    const ownBackground = withLayout ? req.scene == null : req.background != null && req.background !== '';
    if (!withLayout && ownBackground && !isB64(req.background)) return errorResponse(400, 'รูปฉากไม่ถูกต้อง หรือใหญ่เกินไป');
    const scene = ownBackground ? null : sceneOf(req.scene);
    if (!ownBackground && !scene) return errorResponse(400, 'เลือกฉากหลังก่อน');
    // areas = ชิ้นละกรอบ (23 พ.ย.) · area = แบบเดิม (กรอบเดียว) จากแท็บที่เปิดค้างไว้
    const areas = req.areas != null ? req.areas : isArea(req.area) ? [req.area] : null;
    if (!isAreas(areas)) return errorResponse(400, 'ตำแหน่งกราฟิกไม่ถูกต้อง');
    // ชิ้นหลังตัวหลัก (27 พ.ย. ชื่อตัวยักษ์แบบ artist): ไม่ส่ง = ไม่มี
    if (req.behind != null && !isAreas(req.behind)) return errorResponse(400, 'ตำแหน่งกราฟิกไม่ถูกต้อง');
    const behind = isAreas(req.behind) ? req.behind : [];
    if (!isB64(req.plan)) return errorResponse(400, 'ข้อมูลแผนผังไม่ถูกต้อง');
    if (typeof req.model !== 'string' || !availableModels().some((m) => m.id === req.model))
      return errorResponse(400, 'ยังไม่ได้ตั้งค่าโมเดล AI');
    const [subjects, background, plan, layout] = await Promise.all([
      Promise.all(subjectList.map((b64) => readOrNull(b64 as string))),
      ownBackground && !withLayout ? readOrNull(req.background) : null,
      readOrNull(req.plan),
      withLayout ? readOrNull(req.layout) : null,
    ]);
    if (!subjects.every((x) => x)) return errorResponse(400, 'อ่านรูปสินค้า / อาหารไม่ได้');
    const subjectImgs = subjects as NonNullable<(typeof subjects)[number]>[];
    const subject = subjectImgs[0];
    if (ownBackground && !withLayout && !background) return errorResponse(400, 'อ่านรูปฉากไม่ได้');
    if (!plan) return errorResponse(400, 'อ่านแผนผังไม่ได้');
    if (withLayout && !layout) return errorResponse(400, 'อ่านภาพวางผังไม่ได้');
    // ภาพวางผังเติมขอบด้วยค่าเดียวกับแผนผัง -> ต้องขนาดเท่ากันพอดี
    if (layout && (layout.width !== plan.width || layout.height !== plan.height))
      return errorResponse(400, 'ภาพวางผังกับแผนผังขนาดไม่เท่ากัน');
    const graphic = req.graphic == null ? null : readGraphic(req.graphic, req.aspect);
    if (req.graphic != null && !graphic) return errorResponse(400, 'ข้อมูลกราฟิกไม่ถูกต้อง');
    const target = aspectRatio(req.aspect);
    if (Math.abs(plan.width / plan.height - target) / target > 0.02)
      return errorResponse(400, 'สัดส่วนแผนผังไม่ตรงกับขนาดโปสเตอร์ที่เลือก');

    const blocked = await quotaBlock(); // ลูกค้าใช้ครบโควตา/ถูกปิด -> ไม่เรียก AI
    if (blocked) return blocked;

    const base = aspectBaseSize(req.aspect);
    const size = isGpt25(req.model) ? GPT25_SIZES[base] : base;
    const quality = defaultQuality(req.model);
    // แผนผังเติมขอบ (คัดลอกพิกเซลขอบ) ตรงกลางเสมอ -> ตัดกลางของผลลัพธ์ได้ตำแหน่งกราฟิกเดิมพอดี
    const canvas = editCanvas(plan.width, plan.height, size);
    const padded = canvas.width > plan.width ? 'sides' : canvas.height > plan.height ? 'top-bottom' : null;
    const extra = typeof req.extra === 'string' ? req.extra.trim().slice(0, POSTER_EXTRA_MAX) : '';
    const n = subjectImgs.length;
    // original = ภาพวางผัง + รูปเดิมของผู้ใช้ (ไม่ตัด) เป็น Image 2.. (ไอเดียผู้ใช้ 24 พ.ย.: AI ดูหน้าตาจริงจากรูปเดิม) · ใช้กับภาพวางผังเท่านั้น
    const original = withLayout && req.original === true;
    // AI ออกแบบพื้นหลังเอง (ทดลอง 24 พ.ย.): คำบนกราฟิก + สีหลักของกราฟิก
    const design =
      scene?.kind === 'design' && graphic
        ? {
            // ชิ้นที่ผู้ใช้ลบไม่อยู่บนโปสเตอร์ -> คำของชิ้นนั้นไม่ใช้ออกแบบ
            words: Object.entries(graphic.texts)
              .filter(([id]) => !graphic.hidden?.includes(id as FieldId))
              .map(([, t]) => t)
              .filter((t): t is string => !!t?.trim()),
            color: paletteOf(graphic.palette).accent,
          }
        : null;
    const prompt = buildPosterPrompt({
      scene,
      areas,
      behind,
      padded,
      layout: withLayout,
      extra,
      subjects: n,
      cut,
      hint,
      original,
      design,
      look,
      lookColor: graphic ? paletteOf(graphic.palette).accent : undefined,
    });
    const [subjectFiles, backgroundFile, planFile, layoutFile] = await Promise.all([
      Promise.all(subjectList.map((b64) => keepInput(b64 as string))),
      background ? keepInput(req.background) : null,
      keepInput(req.plan),
      withLayout ? keepInput(req.layout) : null,
    ]);
    // ลำดับรูป: ภาพวางผัง (ถ้ามี) > ตัวหลักทุกชิ้น > รูปฉากของผู้ใช้ (ถ้ามี) > แผนผัง · ต้องตรงกับพรอมต์
    const first = withLayout ? 2 : 1; // เลขรูปของตัวหลักชิ้นแรก
    const bgNo = first + n;
    const planNo = bgNo + (background ? 1 : 0);
    // หลายชิ้น: ชิ้นแรกอยู่ช่อง model ชิ้นถัดไปอยู่ช่อง accessories ของ log (หน้าตรวจงานเรียงตามเลขรูป)
    const cutName = (i: number) =>
      !cut ? 'ตัวหลัก' : `ตัวหลัก${n > 1 ? ` ${i + 1}` : ''} (${original ? 'รูปเดิม ไม่ตัด' : 'ตัดพื้นหลังแล้ว'})`;
    const padNote = padded ? ` · เติมขอบเป็น ${canvas.width}×${canvas.height}` : '';
    const caption = `โปสเตอร์ · ${scene?.name ?? 'ฉากของฉัน'}`;
    const t0 = Date.now();
    const log: Omit<GenerateLog, 'status' | 'duration'> = {
      time: localTime(),
      ai: { model: req.model, params: { size, quality, output: `ตัดกลางเป็น ${req.aspect}` } },
      model: {
        image: first,
        name: cutName(0),
        ...fileOf(subjectFiles[0]),
        sent: `${subject.width}×${subject.height}`,
      },
      guide: {
        image: planNo,
        name: 'แผนผัง: กราฟิกข้อความ (ห้ามวาด)',
        ...fileOf(planFile),
        sent: `${plan.width}×${plan.height}${padNote}`,
      },
      element: {
        outfit: 'โปสเตอร์',
        accessories: subjectImgs.slice(1).map((s, i) => ({
          image: first + 1 + i,
          name: cutName(i + 1),
          ...fileOf(subjectFiles[i + 1]),
          sent: `${s.width}×${s.height}`,
        })),
        scene: background
          ? {
              image: bgNo,
              name: 'รูปฉากของฉัน',
              ...fileOf(backgroundFile),
              sent: `${background.width}×${background.height}`,
            }
          : scene
            ? {
                name: scene.name,
                text: design ? `ออกแบบจาก: ${design.words.join(' / ')} · สี ${design.color}` : scene.prompt,
              }
            : 'รูปฉากของฉัน (อยู่ในภาพวางผัง)',
      },
      // ภาพวางผัง (ตัวหลัก ณ ที่ที่ผู้ใช้วาง) ใช้ช่อง pose ของ log ให้หน้าตรวจงานโชว์เป็น Image 1
      pose: layout
        ? {
            mode: 'โปสเตอร์ · วางตัวหลักเอง',
            image: 1,
            name: `ภาพวางผัง: ตัวหลัก ณ ที่ที่วาง${ownBackground ? ' บนรูปฉากของฉัน' : ''}`,
            ...fileOf(layoutFile),
            sent: `${layout.width}×${layout.height}${padNote}`,
          }
        : { mode: 'โปสเตอร์ · AI จัดวาง (อาร์ตไดเรกเตอร์)' },
      style: {
        operation: 'poster',
        aspect: req.aspect,
        area: JSON.stringify(areas.length > 1 ? areas : areas[0]),
        ...(n > 1 ? { subjects: String(n) } : {}),
        ...(hint ? { hint: JSON.stringify(hint) } : {}),
        ...(original ? { subjectImage: 'รูปเดิม (ไม่ตัด)' } : {}),
        ...(look !== 'photo' ? { look: look === 'bw' ? 'ขาวดำวินเทจ' : 'ภาพวาดย้อนยุค' } : {}),
        ...(extra ? { extra } : {}),
        ...(behind.length ? { behind: JSON.stringify(behind) } : {}),
      },
      prompt: sentences(prompt),
    };
    const usage = { page: 'poster', action: 'poster', model: req.model, quality } as const;
    let tokens = 0;
    try {
      const guidePlan = await toEditCanvas(plan.img, canvas);
      const images = layout
        ? [await toEditCanvas(layout.img, canvas), ...subjectImgs.map((s) => s.img), guidePlan]
        : [...subjectImgs.map((s) => s.img), ...(background ? [background.img] : []), guidePlan];
      const aspect = AI_ASPECTS.includes(req.aspect) ? req.aspect : plan.width < plan.height ? '2:3' : '3:2';
      const output = await generateImage(req.model, images, prompt, { size, quality, aspect });
      tokens = output.tokens;
      const final = await servable(await cropTo(output, req.aspect));
      // posterScene / posterLayout: ภาพที่เคยสร้างในหน้าโปสเตอร์ (ใช้ซ้ำ + รู้ว่าทำมาสำหรับตำแหน่งกราฟิกไหน)
      const meta = {
        caption,
        page: 'poster' as const,
        finish: 'off' as const,
        ...(scene ? { posterScene: scene.id } : {}),
        ...(keyOk(req.key) ? { posterLayout: req.key } : {}),
        // กราฟิกที่ใช้กับภาพนี้ (ติดไปกับภาพ: เปิดภาพนี้อีกครั้ง = กราฟิกเดิม) · แก้ภายหลังผ่าน /api/update
        ...(graphic ? { posterGraphic: JSON.stringify(graphic) } : {}),
      };
      const src = await saveImage({ area: 'results' }, final.data, final.mime, meta);
      const entry = await writeGenerateLog({
        ...log,
        status: 'สำเร็จ',
        duration: `${((Date.now() - t0) / 1000).toFixed(1)} วินาที`,
        result: src,
      });
      await recordUsage({ ...usage, status: 'ok', tokens, log: entry });
      return json(200, { src, ...meta });
    } catch (err) {
      const entry = await writeGenerateLog({
        ...log,
        status: 'พัง',
        duration: `${((Date.now() - t0) / 1000).toFixed(1)} วินาที`,
        error: (err as Error).message,
      });
      await recordUsage({ ...usage, status: 'error', tokens, log: entry });
      throw err;
    }
  },
  { model: POSTER_AI_MODEL },
);
