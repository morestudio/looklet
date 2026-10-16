import { ACCESSORY_TYPES } from '@/lib/catalog';
import { json, post } from '@/lib/route';
import { updateMeta } from '@/lib/storage';

// แก้ชื่อ/ประเภทของเสริมที่เพิ่มไว้แล้ว (AI ทายผิด หรือผู้ใช้อยากเปลี่ยนชื่อ)
export const POST = post(async (req) => {
  if (typeof req.src !== 'string' || !ACCESSORY_TYPES.some((t) => t.id === req.type)) return json(400, { error: 'ข้อมูลไม่ถูกต้อง' });
  const name = String(req.name || '').trim().slice(0, 80);
  if (!name) return json(400, { error: 'ต้องมีชื่อ' });
  if (!(await updateMeta(req.src, { name, type: req.type }))) return json(404, { error: 'ไม่พบรูปนี้' });
  return json(200, { ok: true });
});
