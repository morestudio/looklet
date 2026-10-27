import { ACCESSORY_TYPES } from '@/lib/catalog';
import { PRODUCT_TYPES } from '@/lib/packshot';
import { json, post } from '@/lib/route';
import { updateMeta } from '@/lib/storage';

// แก้ชื่อ/ประเภทของเสริมที่เพิ่มไว้แล้ว (AI ทายผิด หรือผู้ใช้อยากเปลี่ยนชื่อ) — รูปสินค้า (หน้าสินค้า) ใช้ประเภทใน PRODUCT_TYPES
export const POST = post(async (req) => {
  const types = typeof req.src === 'string' && req.src.startsWith('/api/files/uploads/products/') ? PRODUCT_TYPES : ACCESSORY_TYPES;
  if (typeof req.src !== 'string' || !types.some((t) => t.id === req.type)) return json(400, { error: 'ข้อมูลไม่ถูกต้อง' });
  const name = String(req.name || '').trim().slice(0, 80);
  if (!name) return json(400, { error: 'ต้องมีชื่อ' });
  if (!(await updateMeta(req.src, { name, type: req.type }))) return json(404, { error: 'ไม่พบรูปนี้' });
  return json(200, { ok: true });
});
