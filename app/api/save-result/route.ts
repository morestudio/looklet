import { json, post } from '@/lib/route';
import { saveImage } from '@/lib/storage';

// รูปที่หน้าเว็บทำต่อจากรูป AI (เช่น ใส่หน้าจริง) เก็บเป็นรูปใหม่ใน results/ รูปจาก AI ยังอยู่ไว้เทียบ
export const POST = post(async (req) => {
  if (!req.data) return json(400, { error: 'ไม่มีข้อมูลรูป' });
  const src = await saveImage({ area: 'results' }, req.data, req.mime || 'image/png', { caption: String(req.caption ?? '').slice(0, 300) });
  return json(200, { src });
});
