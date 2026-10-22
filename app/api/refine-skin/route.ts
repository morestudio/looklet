import { availableModels, generateImage } from '@/lib/ai';
import { localTime, sentences, writeGenerateLog, type GenerateLog } from '@/lib/genlog';
import { json, post } from '@/lib/route';
import { SKIN_MODEL, SKIN_PROMPT, SKIN_SIZES } from '@/lib/skin';
import sharp from 'sharp';
import { readImage, saveImage } from '@/lib/storage';

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
  try {
    const refined = await generateImage(SKIN_MODEL, [{ data: image.data.toString('base64'), mime: image.type }], SKIN_PROMPT,
      { size, quality: 'high', aspect: '2:3' });
    // PNG 1664×2496 ~6 MB เกินที่ Vercel ส่งได้ต่อครั้ง (4.5 MB) เปิดรูปไม่ขึ้น -> JPEG q97 ~1.3 MB
    // วัด 22 ต.ค.: q97 รายละเอียดผิวเท่า PNG, q92 ผิวเนียนลง 23%, JPEG ของ OpenAI เอง (output_format) บีบแรงกว่านี้อีก
    const jpeg = await sharp(Buffer.from(refined.data, 'base64')).jpeg({ quality: 97 }).toBuffer();
    // เก็บเป็นรูปใหม่ก่อนเขียน log เสมอ ต้นฉบับยังอยู่แม้ขั้นตอนถัดไปมีปัญหา
    const src = await saveImage({ area: 'results' }, jpeg.toString('base64'), 'image/jpeg', meta);
    await writeGenerateLog({ ...log, status: 'สำเร็จ', duration: `${((Date.now() - t0) / 1000).toFixed(1)} วินาที`, result: src });
    return json(200, { src, ...meta });
  } catch (e) {
    await writeGenerateLog({ ...log, status: 'พัง', duration: `${((Date.now() - t0) / 1000).toFixed(1)} วินาที`, error: (e as Error).message });
    throw e;
  }
});
