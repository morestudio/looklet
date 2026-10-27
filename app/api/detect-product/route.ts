import { describeProduct } from '@/lib/ai';
import { json, post } from '@/lib/route';

// ดูรูปสินค้าที่เพิ่งเพิ่ม (หน้าสินค้า) -> { type, name } ประเภทใน PRODUCT_TYPES (lib/packshot.ts) — AI ดูไม่ออก = null ทั้งคู่
export const POST = post(async (req) => {
  if (!req.data) return json(400, { error: 'ไม่มีรูป' });
  const guess = await describeProduct({ data: req.data, mime: 'image/jpeg' });
  return json(200, guess ?? { type: null, name: null });
});
