import { errorResponse, json, post } from '@/lib/route';
import { deleteImage, readMeta, updateMeta } from '@/lib/storage';

// from 'history' | 'gallery': take the result out of that place; the file goes only when it is in neither (stored meta)
// AND the client confirmed a permanent delete (permanent: true), so a stale page can never delete a file it showed as kept
export const POST = post(async (req) => {
  const src = String(req.src ?? '');
  if ((req.from === 'history' || req.from === 'gallery') && src.startsWith('/api/files/results/')) {
    const meta = await readMeta(src);
    if (!meta) return errorResponse(404, 'ไม่พบรูปนี้');
    const inOtherPlace = req.from === 'history' ? meta.inGallery === true : meta.inHistory !== false;
    if (inOtherPlace) {
      const ok = await updateMeta(src, req.from === 'history' ? { inHistory: false } : { inGallery: false, favorite: false });
      return ok ? json(200, { ok: true, fileDeleted: false }) : errorResponse(404, 'ไม่พบรูปนี้');
    }
    if (req.permanent !== true) return errorResponse(409, 'รูปนี้เพิ่งถูกเปลี่ยน ลองรีเฟรชหน้าแล้วทำอีกครั้ง');
  }
  if (!(await deleteImage(src))) return errorResponse(400, 'ลบได้เฉพาะรูปที่สร้างหรือเพิ่มเองเท่านั้น');
  return json(200, { ok: true, fileDeleted: true });
});
