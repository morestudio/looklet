import { productGroups, PHOTO_VIEWS, type ProductPhoto } from '@/lib/product-groups';
import { PRODUCT_TYPES } from '@/lib/packshot';
import { json, post } from '@/lib/route';
import { listImages, updateMeta } from '@/lib/storage';

// ใช้ metadata เดิมทั้ง local และ cloud โดยไม่ต้องเพิ่มตารางหรือย้ายข้อมูลเก่า
export const POST = post(async (req) => {
  const photos = await listImages({ area: 'uploads', kind: 'products' });
  const groups = productGroups(photos as ProductPhoto[]);
  const group = groups.find((g) => g.id === req.group);
  if (!group) return json(404, { error: 'ไม่พบสินค้านี้' });
  const root = photos.find((p) => p.src === group.id)!;
  let src: string;
  let patch: Record<string, string>;
  if (req.action === 'edit') {
    const name = typeof req.name === 'string' ? req.name.trim().slice(0, 80) : '';
    if (!name || !PRODUCT_TYPES.some((t) => t.id === req.type)) return json(400, { error: 'ระบุชื่อและประเภทสินค้าให้ถูกต้อง' });
    src = group.id;
    patch = { productGroupName: name, productGroupType: req.type };
  } else if (req.action === 'main') {
    if (!group.photos.some((p) => p.src === req.src)) return json(400, { error: 'รูปหลักต้องอยู่ในสินค้านี้' });
    src = group.id;
    patch = { productGroupName: group.name, productGroupType: group.type || 'other', productMain: req.src };
  } else {
    const photo = photos.find((p) => p.src === req.src);
    if (!photo || ((photo as ProductPhoto).productGroup || photo.src) !== group.id) return json(400, { error: 'รูปนี้ไม่ได้อยู่ในสินค้าที่เลือก' });
    src = photo.src;
    if (req.action === 'view') {
      if (!PHOTO_VIEWS.some((v) => v.id === req.view)) return json(400, { error: 'ไม่มีมุมภาพนี้' });
      patch = { productView: req.view };
    } else if (req.action === 'remove' || req.action === 'restore') {
      // นำออกแบบกู้คืนได้ ไม่ลบไฟล์ที่อาจเก็บข้อมูลกลุ่มอยู่
      patch = { productRemoved: req.action === 'remove' ? 'true' : 'false' };
    } else if (req.action === 'move') {
      if (!groups.some((g) => g.id === req.target) || req.target === group.id) return json(400, { error: 'เลือกสินค้าอื่นที่จะย้ายรูปไป' });
      patch = { productGroup: req.target, productRemoved: 'false' };
    } else return json(400, { error: 'ไม่มีคำสั่งนี้' });
    // รูปเก่าที่เคยเป็นสินค้าชิ้นเดียว: เก็บข้อมูลกลุ่มไว้ก่อนย้ายรูปไปที่อื่น
    if (src === group.id) Object.assign(patch, { productGroupName: group.name, productGroupType: root.productGroupType || group.type || 'other' });
  }
  if (!(await updateMeta(src, patch))) return json(404, { error: 'ไม่พบรูปนี้' });
  return json(200, { src, patch });
});
