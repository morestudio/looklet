import type { Item } from './catalog';

// ข้อมูลกลุ่มเก็บบนรูปแรกของสินค้า แยกจากการเป็นสมาชิกรูป ทำให้ย้าย/นำรูปแรกออกได้โดยกลุ่มไม่หาย
export type ProductPhoto = Item & {
  productGroup?: string;
  productGroupName?: string;
  productGroupType?: string;
  productMain?: string;
  productMainBy?: string;
  productMainNote?: string; // ใครเลือกรูปหลัก ('user' / 'ai') + เหตุผลที่ AI เลือก (ไทย)
  productView?: string;
  productRemoved?: string;
};
// mainBy: 'user' = ผู้ใช้กดเลือกเอง (หรือมี productMain จากก่อนมี AI เลือก) · 'ai' = AI เลือก · ไม่มี = ยังไม่เคยเลือก (รูปแรกที่อัปโหลด)
export type ProductGroup = {
  id: string;
  name: string;
  type?: string;
  photos: ProductPhoto[];
  main?: ProductPhoto;
  mainBy?: 'user' | 'ai';
  mainNote?: string;
};
export const PHOTO_VIEWS = [
  { id: 'unspecified', name: 'ยังไม่ระบุมุม' },
  { id: 'front', name: 'ด้านหน้า' },
  { id: 'back', name: 'ด้านหลัง' },
  { id: 'side', name: 'ด้านข้าง' },
  { id: 'three-quarter', name: '45°' },
  { id: 'top', name: 'ด้านบน' },
  { id: 'bottom', name: 'ด้านล่าง' },
  { id: 'detail', name: 'รายละเอียด' },
] as const;
// สินค้าตัวอย่าง (หน้าสินค้า): ชุดรูป Lolo (20 พ.ย., แทนรูปของบัญชี Tae) ให้ผู้ใช้ใหม่ลองสร้างได้ทันทีโดยไม่ต้องอัปโหลดเอง
// โครงเดียวกับรูปที่อัปโหลด (กลุ่ม = src ของรูปแรก = รูปหลัก) แต่เป็นไฟล์ใน public/images/lolo ไม่ได้อยู่ใน storage -> แก้/นำออก/เพิ่มรูปไม่ได้
// รูปตัวอย่างเดิมใน public/images/products ไม่แสดงแล้ว แต่ยังเก็บไฟล์ไว้ให้หน้าตรวจงานเปิดรูปที่ใช้สร้างภาพเก่าได้
const sample = (name: string, type: string, files: string[]): ProductPhoto[] =>
  files.map((f, i) => {
    const src = `/images/lolo/${f}`,
      root = `/images/lolo/${files[0]}`;
    return i
      ? { name, src, type, productGroup: root }
      : { name, src, type, productGroupName: name, productGroupType: type };
  });
export const PRODUCT_SAMPLES: ProductPhoto[] = [
  // รูปหลักเป็นรูปเฉียง 45° เห็นทั้งคู่ ตามด้วยด้านหน้า / ด้านหลังเฉียง (หรือด้านข้าง) / ด้านหลัง
  ...sample('รองเท้าผ้าใบเทรลสีดำ', 'shoes', ['product-01.jpg', 'product-02.jpg', 'product-03.jpg', 'product-04.jpg']),
  ...sample('รองเท้าส้นสูงหัวแหลมสีดำ', 'shoes', ['product-05.jpg', 'product-06.jpg', 'product-07.jpg', 'product-08.jpg']),
  // หนังนิ่ม ปากกระเป๋าย้วย (hobo) จึงเป็นทรงนิ่ม · รูปหลักด้านหน้า + ด้านข้าง
  ...sample('กระเป๋าสะพายไหล่หนังสีดำ', 'soft-bag', ['product-09.jpg', 'product-10.jpg']),
];
export const isSampleGroup = (group: ProductGroup) => !group.photos.some((p) => p.uploaded);

export function productGroups(records: (Omit<ProductPhoto, 'name'> & { name?: string })[]): ProductGroup[] {
  const photos: ProductPhoto[] = records.map((p) => ({ ...p, name: p.name || 'สินค้า' }));
  const groups = new Map<string, ProductGroup>();
  for (const photo of photos) {
    if (!photo.src) continue;
    if (photo.productGroupName || !photo.productGroup)
      groups.set(photo.src, {
        id: photo.src,
        name: photo.productGroupName || photo.name,
        type: photo.productGroupType || photo.type,
        photos: [],
      });
  }
  for (const photo of photos) {
    if (!photo.src || photo.productRemoved === 'true') continue;
    const id = photo.productGroup || photo.src;
    // กลุ่มที่ไม่มีเจ้าของแล้วไม่เอารูปไปปนกับกลุ่มอื่น
    const group = groups.get(id);
    if (group) group.photos.push(photo);
  }
  for (const group of groups.values()) {
    const root = photos.find((p) => p.src === group.id);
    group.main =
      group.photos.find((p) => p.src === root?.productMain) ??
      group.photos.find((p) => p.src === group.id) ??
      group.photos[0];
    // รูปหลักที่เลือกไว้ถูกนำออกแล้ว = ยังไม่ได้เลือก (ให้ AI เลือกใหม่ได้)
    if (root?.productMain && group.main?.src === root.productMain) {
      group.mainBy = root.productMainBy === 'ai' ? 'ai' : 'user';
      if (group.mainBy === 'ai' && root.productMainNote) group.mainNote = root.productMainNote;
    }
  }
  return [...groups.values()];
}
export function productSources(group: ProductGroup, main = group.main, preferredView?: string) {
  return group.photos
    .filter((p) => p.src !== main?.src)
    .sort((a, b) => Number(b.productView === preferredView) - Number(a.productView === preferredView))
    .slice(0, 5);
}
