import { canUsePoster } from '@/lib/account';
import { ACCESSORY_TYPES } from '@/lib/catalog';
import { PRODUCT_TYPES } from '@/lib/packshot';
import { GRAPHIC_MAX, keyAspect, readGraphic } from '@/lib/poster';
import { errorResponse, json, post } from '@/lib/route';
import { readMeta, updateMeta } from '@/lib/storage';

const isResultSrc = (v: unknown): v is string => typeof v === 'string' && v.startsWith('/api/files/results/');
const isUploadSrc = (v: unknown): v is string => typeof v === 'string' && v.startsWith('/api/files/uploads/');

// แก้ชื่อ/ประเภทของเสริมที่เพิ่มไว้แล้ว (AI ทายผิด หรือผู้ใช้อยากเปลี่ยนชื่อ) — รูปสินค้า (หน้าสินค้า) ใช้ประเภทใน PRODUCT_TYPES
// favorite (boolean) = ♡ of a generated image (/gallery)
// inGallery: true = add to /gallery (♡ starts off; no-op when already there, keeps a teammate's ♡)
// inGallery: false = bookmark off: never deletes; a result already out of history goes back there so it is never in neither place
// inHistory: true = back into history (gallery ✎) · removing with a confirm goes through /api/delete
// posterGraphic = กราฟิกของโปสเตอร์ที่แก้บนภาพที่สร้างแล้ว (ตำแหน่ง สี คำ แบบ; ผู้ใช้ 24 พ.ย.) เก็บทับกับภาพนั้น
//   ภาพจาก AI ไม่เปลี่ยน (กราฟิกวาดทับในหน้าเว็บ) · posterLayout ไม่เปลี่ยน = ยังรู้ว่า AI เว้นที่ไว้ตรงไหนตอนสร้าง
//   posterGraphicFirst = กราฟิกตอนสร้าง (เก็บตอนแก้ครั้งแรก) ให้หน้าเว็บคืนค่าได้
export const POST = post(async (req) => {
  if (req.posterGraphic !== undefined) {
    if (!canUsePoster()) return errorResponse(403, 'หน้าโปสเตอร์ยังเปิดเฉพาะผู้ดูแล'); // ต้นแบบ (27 พ.ย.)
    if (!isResultSrc(req.src)) return errorResponse(400, 'ข้อมูลไม่ถูกต้อง');
    const old = await readMeta(req.src);
    if (!old) return errorResponse(404, 'ไม่พบรูปนี้');
    if (old.page !== 'poster') return errorResponse(400, 'ข้อมูลไม่ถูกต้อง');
    const graphic = readGraphic(
      req.posterGraphic,
      keyAspect(typeof old.posterLayout === 'string' ? old.posterLayout : '') || '4:5',
    );
    const text = graphic && JSON.stringify(graphic);
    if (!text || text.length > GRAPHIC_MAX) return errorResponse(400, 'ข้อมูลกราฟิกไม่ถูกต้อง');
    // แก้ครั้งแรก: เก็บกราฟิกตอนสร้างไว้ (posterGraphicFirst) ให้กดคืนค่าได้ (ผู้ใช้ 25 พ.ย. "revertable") · ครั้งต่อไปไม่ทับ
    const meta: Record<string, string> = { posterGraphic: text };
    if (typeof old.posterGraphicFirst !== 'string' && typeof old.posterGraphic === 'string')
      meta.posterGraphicFirst = old.posterGraphic;
    if (!(await updateMeta(req.src, meta))) return errorResponse(404, 'ไม่พบรูปนี้');
    return json(200, { ok: true });
  }
  if (typeof req.inGallery === 'boolean' || req.inHistory === true) {
    if (!isResultSrc(req.src)) return errorResponse(400, 'ข้อมูลไม่ถูกต้อง');
    const old = await readMeta(req.src);
    if (!old) return errorResponse(404, 'ไม่พบรูปนี้');
    const meta: Record<string, boolean | number> =
      req.inGallery === true
        ? old.inGallery === true
          ? {}
          : { inGallery: true, addedToGalleryAt: Date.now(), favorite: false }
        : req.inGallery === false
          ? { inGallery: false, favorite: false, ...(old.inHistory === false && { inHistory: true }) }
          : { inHistory: true };
    if (Object.keys(meta).length && !(await updateMeta(req.src, meta))) return errorResponse(404, 'ไม่พบรูปนี้');
    return json(200, { ok: true });
  }
  if (typeof req.favorite === 'boolean') {
    if (!isResultSrc(req.src)) return errorResponse(400, 'ข้อมูลไม่ถูกต้อง');
    if (!(await updateMeta(req.src, { favorite: req.favorite }))) return errorResponse(404, 'ไม่พบรูปนี้');
    return json(200, { ok: true });
  }
  if (!isUploadSrc(req.src)) return errorResponse(400, 'ข้อมูลไม่ถูกต้อง'); // name/type: uploads only
  const types = req.src.startsWith('/api/files/uploads/products/') ? PRODUCT_TYPES : ACCESSORY_TYPES;
  if (!types.some((t) => t.id === req.type)) return errorResponse(400, 'ข้อมูลไม่ถูกต้อง');
  const name = String(req.name || '')
    .trim()
    .slice(0, 80);
  if (!name) return errorResponse(400, 'ต้องมีชื่อ');
  if (!(await updateMeta(req.src, { name, type: req.type }))) return errorResponse(404, 'ไม่พบรูปนี้');
  return json(200, { ok: true });
});
