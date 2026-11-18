import { pickMainPhoto } from '@/lib/ai';
import { productGroups, PHOTO_VIEWS, type ProductPhoto } from '@/lib/product-groups';
import { PRODUCT_TYPES } from '@/lib/packshot';
import { errorResponse, json, post } from '@/lib/route';
import { listImages, readThumb, updateMeta } from '@/lib/storage';

// AI เลือกรูปหลัก: ดูจากรูปย่อ 512px ในคลัง (ไม่โหลดรูปเต็ม ประหยัดโควตาดาวน์โหลดของ Supabase) ไม่เกิน 10 รูปแรก
const PICK_MAX = 10;
const thumbOf = async (src: string) => {
  const t = await readThumb(
    src
      .replace(/^\/api\/files\//, '')
      .split('/')
      .map(decodeURIComponent),
  ).catch(() => null);
  return t && { data: t.data.toString('base64'), mime: 'image/jpeg' };
};

// ใช้ metadata เดิมทั้ง local และ cloud โดยไม่ต้องเพิ่มตารางหรือย้ายข้อมูลเก่า
export const POST = post(async (req) => {
  const photos = await listImages({ area: 'uploads', kind: 'products' });
  const groups = productGroups(photos as ProductPhoto[]);
  const group = groups.find((g) => g.id === req.group);
  if (!group) return errorResponse(404, 'ไม่พบสินค้านี้');
  const root = photos.find((p) => p.src === group.id)!;
  let src: string;
  let patch: Record<string, string>;
  if (req.action === 'edit') {
    const name = typeof req.name === 'string' ? req.name.trim().slice(0, 80) : '';
    if (!name || !PRODUCT_TYPES.some((t) => t.id === req.type)) return errorResponse(400, 'ระบุชื่อและประเภทสินค้าให้ถูกต้อง');
    src = group.id;
    patch = { productGroupName: name, productGroupType: req.type };
  } else if (req.action === 'main') {
    if (!group.photos.some((p) => p.src === req.src)) return errorResponse(400, 'รูปหลักต้องอยู่ในสินค้านี้');
    src = group.id;
    patch = {
      productGroupName: group.name,
      productGroupType: group.type || 'other',
      productMain: req.src,
      productMainBy: 'user',
      productMainNote: '',
    };
  } else if (req.action === 'auto-main') {
    // ไม่ทับรูปหลักที่ผู้ใช้เลือกเอง · AI ตอบไม่ได้ = ใช้รูปหลักเดิม (ตอบ 200 แบบไม่เปลี่ยน ไม่ให้หน้าเว็บขึ้น error)
    const unchanged = json(200, { src: group.id, patch: {} });
    if (group.mainBy === 'user' || group.photos.length < 2) return unchanged;
    const shown = group.photos.slice(0, PICK_MAX);
    const thumbs = await Promise.all(shown.map((p) => thumbOf(p.src!)));
    const usable = shown.flatMap((p, i) => (thumbs[i] ? [{ src: p.src!, img: thumbs[i]! }] : []));
    if (usable.length < 2) return unchanged;
    const what = PRODUCT_TYPES.find((t) => t.id === group.type)?.prompt ?? 'a product';
    const pick = await pickMainPhoto(
      usable.map((u) => u.img),
      what,
      group.name,
    );
    if (!pick) return unchanged;
    // ระหว่างรอ AI (~4 วินาที) ผู้ใช้อาจกดเลือกเองไปแล้ว -> อ่านใหม่ ไม่ทับ
    const fresh = productGroups((await listImages({ area: 'uploads', kind: 'products' })) as ProductPhoto[]).find(
      (g) => g.id === group.id,
    );
    if (!fresh || fresh.mainBy === 'user') return unchanged;
    src = group.id;
    patch = {
      productGroupName: group.name,
      productGroupType: group.type || 'other',
      productMain: usable[pick.index].src,
      productMainBy: 'ai',
      productMainNote: pick.th,
    };
  } else {
    const photo = photos.find((p) => p.src === req.src);
    if (!photo || ((photo as ProductPhoto).productGroup || photo.src) !== group.id)
      return errorResponse(400, 'รูปนี้ไม่ได้อยู่ในสินค้าที่เลือก');
    src = photo.src;
    if (req.action === 'view') {
      if (!PHOTO_VIEWS.some((v) => v.id === req.view)) return errorResponse(400, 'ไม่มีมุมภาพนี้');
      patch = { productView: req.view };
    } else if (req.action === 'remove' || req.action === 'restore') {
      // นำออกแบบกู้คืนได้ ไม่ลบไฟล์ที่อาจเก็บข้อมูลกลุ่มอยู่
      patch = { productRemoved: req.action === 'remove' ? 'true' : 'false' };
    } else if (req.action === 'move') {
      if (!groups.some((g) => g.id === req.target) || req.target === group.id)
        return errorResponse(400, 'เลือกสินค้าอื่นที่จะย้ายรูปไป');
      patch = { productGroup: req.target, productRemoved: 'false' };
    } else return errorResponse(400, 'ไม่มีคำสั่งนี้');
    // รูปเก่าที่เคยเป็นสินค้าชิ้นเดียว: เก็บข้อมูลกลุ่มไว้ก่อนย้ายรูปไปที่อื่น
    if (src === group.id)
      Object.assign(patch, {
        productGroupName: group.name,
        productGroupType: root.productGroupType || group.type || 'other',
      });
  }
  if (!(await updateMeta(src, patch))) return errorResponse(404, 'ไม่พบรูปนี้');
  return json(200, { src, patch });
});
