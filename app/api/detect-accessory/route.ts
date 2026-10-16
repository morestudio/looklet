import { describeAccessory } from '@/lib/ai';
import { json, post } from '@/lib/route';

// ดูรูปของเสริมที่เพิ่งเลือก -> { type, name } ให้หน้าต่างเพิ่มของเสริมเลือกไว้ให้ (AI ดูไม่ออก = null ทั้งคู่)
export const POST = post(async (req) => {
  if (!req.data) return json(400, { error: 'ไม่มีรูป' });
  const guess = await describeAccessory({ data: req.data, mime: 'image/jpeg' });
  return json(200, guess ?? { type: null, name: null });
});
