import { ACCESSORY_TYPES } from '@/lib/catalog';
import { PRODUCT_TYPES } from '@/lib/packshot';
import { json, post } from '@/lib/route';
import { readMeta, updateMeta } from '@/lib/storage';

// แก้ชื่อ/ประเภทของเสริมที่เพิ่มไว้แล้ว (AI ทายผิด หรือผู้ใช้อยากเปลี่ยนชื่อ) — รูปสินค้า (หน้าสินค้า) ใช้ประเภทใน PRODUCT_TYPES
// favorite (boolean) = ♡ of a generated image (/gallery)
// inGallery: true = add to /gallery (♡ starts off; no-op when already there, keeps a teammate's ♡)
// inGallery: false = bookmark off: never deletes; a result already out of history goes back there so it is never in neither place
// inHistory: true = back into history (gallery ✎) · removing with a confirm goes through /api/delete
export const POST = post(async (req) => {
  if (typeof req.inGallery === 'boolean' || req.inHistory === true) {
    if (typeof req.src !== 'string' || !req.src.startsWith('/api/files/results/')) return json(400, { error: 'ข้อมูลไม่ถูกต้อง' });
    const old = await readMeta(req.src);
    if (!old) return json(404, { error: 'ไม่พบรูปนี้' });
    const meta: Record<string, boolean | number> =
      req.inGallery === true ? (old.inGallery === true ? {} : { inGallery: true, addedToGalleryAt: Date.now(), favorite: false })
      : req.inGallery === false ? { inGallery: false, favorite: false, ...(old.inHistory === false && { inHistory: true }) }
      : { inHistory: true };
    if (Object.keys(meta).length && !(await updateMeta(req.src, meta))) return json(404, { error: 'ไม่พบรูปนี้' });
    return json(200, { ok: true });
  }
  if (typeof req.favorite === 'boolean') {
    if (typeof req.src !== 'string' || !req.src.startsWith('/api/files/results/')) return json(400, { error: 'ข้อมูลไม่ถูกต้อง' });
    if (!(await updateMeta(req.src, { favorite: req.favorite }))) return json(404, { error: 'ไม่พบรูปนี้' });
    return json(200, { ok: true });
  }
  if (typeof req.src === 'string' && !req.src.startsWith('/api/files/uploads/')) return json(400, { error: 'ข้อมูลไม่ถูกต้อง' }); // name/type: uploads only
  const types = typeof req.src === 'string' && req.src.startsWith('/api/files/uploads/products/') ? PRODUCT_TYPES : ACCESSORY_TYPES;
  if (typeof req.src !== 'string' || !types.some((t) => t.id === req.type)) return json(400, { error: 'ข้อมูลไม่ถูกต้อง' });
  const name = String(req.name || '').trim().slice(0, 80);
  if (!name) return json(400, { error: 'ต้องมีชื่อ' });
  if (!(await updateMeta(req.src, { name, type: req.type }))) return json(404, { error: 'ไม่พบรูปนี้' });
  return json(200, { ok: true });
});
