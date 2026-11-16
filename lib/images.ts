// images.ts — เตรียมรูปผลลัพธ์ก่อนเก็บ (ใช้ฝั่ง server เท่านั้น)
import 'server-only';
import sharp from 'sharp';
import type { Img } from './ai';

// รูปใหญ่ (GPT Image 2.5 1664×2496 เป็น PNG ~6 MB) เกินที่ Vercel ส่งได้ต่อครั้ง (4.5 MB) -> เปิด/ดาวน์โหลดรูปไม่ขึ้นบนเว็บจริง
// แปลงเป็น JPEG คุณภาพ 97 (~1.3 MB) — วัด 22 ต.ค.: รายละเอียดผิวเท่า PNG, q92 ผิวเนียนลง 23% · รูปเล็กเก็บไฟล์เดิม
const MAX_BYTES = 3_500_000;
export async function servable(img: Img): Promise<Img> {
  const data = Buffer.from(img.data, 'base64');
  if (data.length <= MAX_BYTES) return img;
  try {
    const jpeg = await sharp(data).jpeg({ quality: 97 }).toBuffer();
    return { data: jpeg.toString('base64'), mime: 'image/jpeg' };
  } catch (e) {
    // แปลงไม่ได้ (เช่น sharp โหลดไม่ขึ้นบนเซิร์ฟเวอร์) -> เก็บ PNG เดิมไว้ก่อน รูปที่จ่ายเงินแล้วต้องไม่หาย (แต่เว็บจริงอาจเปิดรูปใหญ่ไม่ขึ้น)
    console.error('แปลงรูปเป็น JPEG ไม่สำเร็จ เก็บไฟล์เดิม', e);
    return img;
  }
}

// ตัดตรงกลางให้ได้สัดส่วนที่เลือก (หน้าสินค้า): OpenAI ทำได้แค่ 2:3 / 1:1 / 3:2 แต่ฟีด IG ใช้ 4:5 — สัดส่วนตรงอยู่แล้ว (Gemini) = รูปเดิม
// ใช้ก่อน servable (รูปที่ตัดแล้วยังใหญ่ ค่อยแปลงเป็น JPEG) · ตัดไม่ได้ = เก็บรูปเดิม (จ่ายเงินแล้ว ห้ามหาย)
// รูปที่ AI ทำให้ (เช่น ฉากใหม่ของขั้น 1 เมื่อเลือกรูปท่า + ฉาก) -> ส่งต่อให้ AI อีกรอบ: ย่อด้านยาวไม่เกิน 1024 + JPEG q90 แบบเดียวกับที่หน้าเว็บย่อรูปก่อนส่ง (jpegBase64)
// รูปเต็ม PNG ~6 MB ส่งต่อตรงๆ ช้าและเปลืองโทเคนรูปเข้า · ย่อไม่ได้ = ใช้รูปเดิม
export async function inputJpeg(img: Img): Promise<Img> {
  try {
    const buf = await sharp(Buffer.from(img.data, 'base64')).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    return { data: buf.toString('base64'), mime: 'image/jpeg' };
  } catch (e) {
    console.error('ย่อรูปก่อนส่งให้ AI ไม่สำเร็จ ใช้รูปเดิม', e);
    return img;
  }
}

// รูปย่อสำหรับตาราง/ประวัติรูป (/api/files?w=): JPEG พื้นขาว (รูปสินค้าพื้นใส) ไม่ขยายรูปที่เล็กกว่า — lib/storage.ts readThumb / saveImage
export async function thumbJpeg(data: Buffer, width: number): Promise<Buffer> {
  return sharp(data).rotate().resize({ width, withoutEnlargement: true }).flatten({ background: '#fff' }).jpeg({ quality: 80 }).toBuffer();
}

// ภาพ SVG ที่เราวาดเอง (ไกด์มุมของ "ตั้งมุมเอง" lib/turntable.ts) -> JPEG base64 สำหรับส่งให้ AI
export async function svgJpeg(svg: string): Promise<string> {
  return (await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer()).toString('base64');
}

export async function cropTo(img: Img, aspect: string): Promise<Img> {
  const [aw, ah] = aspect.split(':').map(Number);
  if (!aw || !ah) return img;
  const data = Buffer.from(img.data, 'base64');
  try {
    const { width, height } = await sharp(data).metadata();
    const target = aw / ah;
    if (!width || !height || Math.abs(width / height - target) / target < 0.01) return img;
    const wide = width / height > target; // กว้างเกิน = ตัดข้าง, สูงเกิน = ตัดบน/ล่าง
    const w = wide ? Math.round(height * target) : width;
    const h = wide ? height : Math.round(width / target);
    const out = sharp(data).extract({ left: Math.round((width - w) / 2), top: Math.round((height - h) / 2), width: w, height: h });
    const jpeg = img.mime === 'image/jpeg';
    const buf = await (jpeg ? out.jpeg({ quality: 97 }) : out.png()).toBuffer();
    return { data: buf.toString('base64'), mime: jpeg ? 'image/jpeg' : 'image/png' };
  } catch (e) {
    console.error('ตัดรูปตามสัดส่วนไม่สำเร็จ เก็บรูปเดิม', e);
    return img;
  }
}
