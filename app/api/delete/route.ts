import { json, post } from '@/lib/route';
import { deleteImage, readMeta, updateMeta } from '@/lib/storage';

// from 'history' | 'gallery': take the result out of that place; the file goes when it is in neither (decided on stored meta, not the client's)
export const POST = post(async (req) => {
  const src = String(req.src ?? '');
  if ((req.from === 'history' || req.from === 'gallery') && src.startsWith('/api/files/results/')) {
    const meta = await readMeta(src);
    if (!meta) return json(404, { error: 'ไม่พบรูปนี้' });
    const inOtherPlace = req.from === 'history' ? meta.inGallery === true : meta.inHistory !== false;
    if (inOtherPlace) {
      await updateMeta(src, req.from === 'history' ? { inHistory: false } : { inGallery: false, favorite: false });
      return json(200, { ok: true, fileDeleted: false });
    }
  }
  if (!(await deleteImage(src))) return json(400, { error: 'ลบได้เฉพาะรูปที่สร้างหรือเพิ่มเองเท่านั้น' });
  return json(200, { ok: true, fileDeleted: true });
});
