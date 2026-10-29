import { availableModels, generateImage } from '@/lib/ai';
import { localTime, sentences, writeGenerateLog, type GenerateLog } from '@/lib/genlog';
import { editCanvas, fromEditCanvas, toEditCanvas } from '@/lib/local-edit-images';
import { json, post } from '@/lib/route';
import { SKIN_MODEL, SKIN_PROMPT, SKIN_SIZES } from '@/lib/skin';
import sharp from 'sharp';
import { readImage, saveImage } from '@/lib/storage';
import { quotaBlock, recordUsage } from '@/lib/usage';

export const maxDuration = 300;

// รับเฉพาะรูปผลลัพธ์ในคลัง ไม่รับ URL ภายนอกหรือรูปอัปโหลด — อ่านต้นฉบับเต็มขนาดบน server
export const POST = post(async (req) => {
  if (!req || typeof req.src !== 'string' || !/^\/api\/files\/results\/[\w-]+\.(?:png|jpe?g|webp)$/.test(req.src)) {
    return json(400, { error: 'เลือกรูปที่สร้างไว้ในคลังก่อนปรับผิว' });
  }
  const size = Object.hasOwn(SKIN_SIZES, req.size) ? SKIN_SIZES[req.size] : null;
  if (!size) return json(400, { error: 'ขนาดรูปไม่ถูกต้อง' });
  if (!availableModels().some((m) => m.id === SKIN_MODEL)) {
    return json(400, { error: 'ปรับผิวไม่ได้: ยังไม่ได้ตั้งค่า OpenAI API key' });
  }
  const blocked = await quotaBlock(); // ลูกค้าใช้ครบโควตา/ถูกปิด -> ไม่เรียก AI
  if (blocked) return blocked;
  const image = await readImage(req.src.slice('/api/files/'.length).split('/'));
  if (!image) return json(404, { error: 'ไม่พบรูปต้นฉบับ อาจถูกลบไปแล้ว' });
  const caption = `${typeof req.caption === 'string' ? req.caption.slice(0, 260) : 'รูปที่สร้างไว้'} · ผิวสมจริง`;
  const meta = { caption, finish: 'off' as const, refinedFrom: req.src };
  const t0 = Date.now();
  const log: Omit<GenerateLog, 'status' | 'duration'> = {
    time: localTime(),
    ai: { model: SKIN_MODEL, params: { size, quality: 'high', input_fidelity: 'high', saved_as: 'JPEG q97' } },
    model: { image: 1, file: req.src, sent: `${Math.round(image.data.length / 1024)} KB` },
    element: { outfit: 'ชุดเดิม', accessories: [], scene: 'ฉากเดิม' },
    pose: { mode: 'ท่าเดิม' },
    style: { operation: 'refine-skin', refinedFrom: req.src },
    prompt: sentences(SKIN_PROMPT),
  };
  let tokens = 0; // โทเคนที่ AI คิดจริง -> โควตาลูกค้า
  try {
    // รูป 4:5 / 9:16 (ใช้ภาพที่ไหน): AI ทำได้แค่ 2:3 / 3:2 / 1:1 -> เติมขอบให้เป็นสัดส่วนที่ขอ แล้วตัดกลับ ห้ามยืด (แบบแก้เฉพาะจุด)
    // รูป 2:3 / 3:2 / 1:1 ส่งตรงเหมือนเดิม ได้รูปใหญ่ขึ้นตามขนาดที่ขอ
    const source = { data: image.data.toString('base64'), mime: image.type };
    const { width = 0, height = 0 } = await sharp(image.data).metadata();
    const canvas = width && height ? editCanvas(width, height, size) : null;
    const padded = canvas && (canvas.width !== width || canvas.height !== height) ? canvas : null;
    const output = await generateImage(SKIN_MODEL, [padded ? await toEditCanvas(source, padded) : source], SKIN_PROMPT,
      { size, quality: 'high', aspect: '2:3' });
    tokens = output.tokens;
    const refined = padded ? await fromEditCanvas(output, padded) : output;
    // PNG 1664×2496 ~6 MB เกินที่ Vercel ส่งได้ต่อครั้ง (4.5 MB) เปิดรูปไม่ขึ้น -> JPEG q97 ~1.3 MB
    // วัด 22 ต.ค.: q97 รายละเอียดผิวเท่า PNG, q92 ผิวเนียนลง 23%, JPEG ของ OpenAI เอง (output_format) บีบแรงกว่านี้อีก
    let saved = { data: refined.data, mime: refined.mime };
    try {
      const jpeg = await sharp(Buffer.from(refined.data, 'base64')).jpeg({ quality: 97 }).toBuffer();
      saved = { data: jpeg.toString('base64'), mime: 'image/jpeg' };
    } catch (e) {
      console.error('แปลงรูปปรับผิวเป็น JPEG ไม่สำเร็จ เก็บไฟล์เดิม', e); // จ่ายเงินแล้ว ต้องเก็บไว้ก่อน
    }
    // เก็บเป็นรูปใหม่ก่อนเขียน log เสมอ ต้นฉบับยังอยู่แม้ขั้นตอนถัดไปมีปัญหา
    const src = await saveImage({ area: 'results' }, saved.data, saved.mime, meta);
    await writeGenerateLog({ ...log, status: 'สำเร็จ', duration: `${((Date.now() - t0) / 1000).toFixed(1)} วินาที`, result: src });
    await recordUsage({ page: 'model', action: 'refine-skin', model: SKIN_MODEL, quality: 'high', status: 'ok', tokens });
    return json(200, { src, ...meta });
  } catch (e) {
    await writeGenerateLog({ ...log, status: 'พัง', duration: `${((Date.now() - t0) / 1000).toFixed(1)} วินาที`, error: (e as Error).message });
    await recordUsage({ page: 'model', action: 'refine-skin', model: SKIN_MODEL, quality: 'high', status: 'error', tokens });
    throw e;
  }
});
