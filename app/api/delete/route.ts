import { json, post } from '@/lib/route';
import { deleteImage } from '@/lib/storage';

export const POST = post(async (req) => {
  if (!(await deleteImage(String(req.src ?? '')))) return json(400, { error: 'ลบได้เฉพาะรูปที่สร้างหรือเพิ่มเองเท่านั้น' });
  return json(200, { ok: true });
});
