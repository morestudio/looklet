import { availableModels, generateImage } from '@/lib/ai';
import { defaultQuality, GPT25_SIZES, isGpt25 } from '@/lib/catalog';
import { localTime, sentences, writeGenerateLog, type GenerateLog } from '@/lib/genlog';
import { LOCAL_EDIT_PROMPT, supportsMaskedEdit } from '@/lib/local-edit';
import { blendLocalEdit, editCanvas, finishRoughEdit, fromEditCanvas, maskToEditCanvas, prepareLocalEdit, roughEditGuide, toEditCanvas } from '@/lib/local-edit-images';
import { json, post } from '@/lib/route';
import { listImages, readImage, saveImage } from '@/lib/storage';
import { quotaBlock, recordUsage } from '@/lib/usage';

export const maxDuration = 300;
export const POST = post(async (req) => {
  if (typeof req.src !== 'string' || !/^\/api\/files\/results\/[\w-]+\.(?:png|jpe?g|webp)$/.test(req.src)) return json(400, { error: 'เลือกรูปที่สร้างไว้ก่อนแก้เฉพาะจุด' });
  const instruction = typeof req.instruction === 'string' ? req.instruction.trim() : '';
  if (!instruction || instruction.length > 1200) return json(400, { error: 'ระบุสิ่งที่ต้องการแก้ ไม่เกิน 1,200 ตัวอักษร' });
  if (typeof req.model !== 'string' || !supportsMaskedEdit(req.model) || !availableModels().some((m) => m.id === req.model)) return json(400, { error: 'เลือกโมเดล OpenAI ที่รองรับการแก้เฉพาะจุด' });
  const mode = req.mode ?? 'precise'; // Older clients retain exact-mask behavior.
  if (mode !== 'rough' && mode !== 'precise') return json(400, { error: 'โหมดการแก้ไม่ถูกต้อง' });
  // ระบายชี้จุดไม่บังคับในแบบไฮไลต์ (พิมพ์อย่างเดียวก็แก้ได้) · แบบละเอียดต้องมีพื้นที่ระบาย
  const hasMask = req.mask != null && req.mask !== '';
  if (mode === 'precise' && !hasMask) return json(400, { error: 'ระบายพื้นที่ที่ต้องการแก้ก่อน' });
  if (hasMask && (typeof req.mask !== 'string' || req.mask.length > 5_333_336 || !/^[a-zA-Z0-9+/]+={0,2}$/.test(req.mask))) return json(400, { error: 'ข้อมูลพื้นที่เลือกไม่ถูกต้อง หรือใหญ่เกิน 4 MB' });
  const feather = req.feather == null ? 6 : Number(req.feather);
  if (!Number.isInteger(feather) || feather < 0 || feather > 24) return json(400, { error: 'ค่าความนุ่มขอบไม่ถูกต้อง' });
  const blocked = await quotaBlock(); // ลูกค้าใช้ครบโควตา/ถูกปิด -> ไม่เรียก AI
  if (blocked) return blocked;
  const image = await readImage(req.src.slice('/api/files/'.length).split('/'));
  if (!image) return json(404, { error: 'ไม่พบรูปต้นฉบับ อาจถูกลบไปแล้ว' });
  const original = (await listImages({ area: 'results' })).find((item) => item.src === req.src);
  const product = original?.page === 'product';
  const mask = hasMask ? Buffer.from(req.mask, 'base64') : null;
  if (mask && mask.length > 4_000_000) return json(400, { error: 'พื้นที่เลือกมีขนาดเกิน 4 MB' });
  let source;
  try { source = await prepareLocalEdit(image.data, mask); }
  catch (err) { return json(400, { error: (err as Error).message }); }
  if (mode === 'precise' && !source.selectedPixels) return json(400, { error: 'ระบายพื้นที่ที่ต้องการแก้ก่อน' });
  const highlighted = mode === 'rough' && source.selectedPixels > 0; // ระบายว่าง = แก้จากคำสั่งอย่างเดียว
  const baseSize = source.width === source.height ? '1024x1024' : source.width < source.height ? '1024x1536' : '1536x1024';
  const size = isGpt25(req.model) ? GPT25_SIZES[baseSize] : baseSize;
  const prompt = LOCAL_EDIT_PROMPT(instruction, product, mode, highlighted);
  const caption = `แก้เฉพาะจุด · ${instruction}`.slice(0, 300);
  const t0 = Date.now();
  const log: Omit<GenerateLog, 'status' | 'duration'> = {
    time: localTime(), ai: { model: req.model, params: { size, quality: defaultQuality(req.model), mask: mode === 'precise' ? 'PNG alpha' : highlighted ? 'visual highlight reference (no clipping mask)' : 'none (instruction only)', output: 'lossless PNG' } },
    model: { image: highlighted ? 2 : 1, file: req.src, sent: `${source.width}×${source.height}` },
    element: { outfit: mode === 'precise' ? 'เปลี่ยนเฉพาะพื้นที่เลือก' : highlighted ? 'แก้วัตถุที่ไฮไลต์ชี้ไว้' : 'แก้ตามคำสั่งที่พิมพ์ (ไม่ได้ระบาย)', accessories: [], scene: 'รักษาส่วนนอกพื้นที่เลือก' },
    pose: { mode: 'ท่าเดิม' }, style: { operation: 'local-edit', mode, editedFrom: req.src, selectedPixels: String(source.selectedPixels), bounds: JSON.stringify(source.bounds), feather: String(feather) }, prompt: sentences(prompt),
  };
  const usage = { page: product ? 'product' : 'model', action: 'local-edit', model: req.model, quality: defaultQuality(req.model) } as const;
  let tokens = 0; // โทเคนที่ AI คิดจริง -> โควตาลูกค้า
  try {
    // ส่งในสัดส่วนเดียวกับขนาดที่ขอ (เติมขอบ) แล้วตัดกลับ — ห้ามยืดผลลัพธ์ ไม่งั้นสินค้าแบน/อ้วนขึ้น (lib/local-edit-images.ts editCanvas)
    const canvas = editCanvas(source.width, source.height, size);
    const images = await Promise.all((highlighted ? [source.image, await roughEditGuide(source)] : [source.image]).map((img) => toEditCanvas(img, canvas)));
    const output = await generateImage(req.model, images, prompt, { size, quality: defaultQuality(req.model), aspect: source.width < source.height ? '2:3' : source.width > source.height ? '3:2' : '1:1', ...(mode === 'precise' ? { mask: await maskToEditCanvas(source.mask!, canvas) } : {}) });
    tokens = output.tokens;
    const edited = await fromEditCanvas(output, canvas);
    const blended = mode === 'rough' ? await finishRoughEdit(source, edited) : await blendLocalEdit(source, edited, feather);
    const meta = { caption, finish: 'off' as const, editedFrom: req.src,
      ...(product ? { page: 'product' as const, ...(original.stylePlan ? { stylePlan: original.stylePlan } : {}) } : {}),
    };
    const src = await saveImage({ area: 'results' }, blended.data, blended.mime, meta);
    await writeGenerateLog({ ...log, status: 'สำเร็จ', duration: `${((Date.now() - t0) / 1000).toFixed(1)} วินาที`, result: src });
    await recordUsage({ ...usage, status: 'ok', tokens });
    return json(200, { src, ...meta });
  } catch (err) {
    await writeGenerateLog({ ...log, status: 'พัง', duration: `${((Date.now() - t0) / 1000).toFixed(1)} วินาที`, error: (err as Error).message });
    await recordUsage({ ...usage, status: 'error', tokens });
    throw err;
  }
});
