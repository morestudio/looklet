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
  const jpeg = await sharp(data).jpeg({ quality: 97 }).toBuffer();
  return { data: jpeg.toString('base64'), mime: 'image/jpeg' };
}
