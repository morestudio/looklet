import type { Item } from './catalog';

// ข้อมูลกลุ่มเก็บบนรูปแรกของสินค้า แยกจากการเป็นสมาชิกรูป ทำให้ย้าย/นำรูปแรกออกได้โดยกลุ่มไม่หาย
export type ProductPhoto = Item & {
  productGroup?: string; productGroupName?: string; productGroupType?: string; productMain?: string;
  productView?: string; productRemoved?: string;
};
export type ProductGroup = { id: string; name: string; type?: string; photos: ProductPhoto[]; main?: ProductPhoto };
export const PHOTO_VIEWS = [
  { id: 'unspecified', name: 'ยังไม่ระบุมุม' }, { id: 'front', name: 'ด้านหน้า' }, { id: 'back', name: 'ด้านหลัง' },
  { id: 'side', name: 'ด้านข้าง' }, { id: 'three-quarter', name: '45°' }, { id: 'top', name: 'ด้านบน' },
  { id: 'bottom', name: 'ด้านล่าง' }, { id: 'detail', name: 'รายละเอียด' },
] as const;
// สินค้าตัวอย่าง (หน้าสินค้า): รูปที่บัญชี Tae อัปโหลด (29 ต.ค.) ให้ผู้ใช้ใหม่ลองสร้างได้ทันทีโดยไม่ต้องอัปโหลดเอง
// โครงเดียวกับรูปที่อัปโหลด (กลุ่ม = src ของรูปแรก) แต่เป็นไฟล์ใน public/images/products ไม่ได้อยู่ใน storage -> แก้/นำออก/เพิ่มรูปไม่ได้
const sample = (name: string, type: string, files: string[]): ProductPhoto[] => files.map((f, i) => {
  const src = `/images/products/${f}`, root = `/images/products/${files[0]}`;
  return i ? { name, src, type, productGroup: root } : { name, src, type, productGroupName: name, productGroupType: type };
});
export const PRODUCT_SAMPLES: ProductPhoto[] = [
  ...sample('เป้สะพายหลังสีดำสไตล์สปอร์ต', 'bag', ['backpack-1.jpg', 'backpack-2.jpg', 'backpack-3.jpg']),
  ...sample('รองเท้าผ้าใบสีดำสไตล์สปอร์ต', 'shoes', ['sneaker-black-1.jpg', 'sneaker-black-2.jpg', 'sneaker-black-3.jpg', 'sneaker-black-4.jpg']),
  ...sample('รองเท้าวิ่งสีเขียวสะท้อนแสง', 'shoes', ['sneaker-green-1.jpg', 'sneaker-green-2.jpg', 'sneaker-green-3.jpg', 'sneaker-green-4.jpg']),
];
export const isSampleGroup = (group: ProductGroup) => !group.photos.some((p) => p.uploaded);

export function productGroups(records: (Omit<ProductPhoto, 'name'> & { name?: string })[]): ProductGroup[] {
  const photos: ProductPhoto[] = records.map((p) => ({ ...p, name: p.name || 'สินค้า' }));
  const groups = new Map<string, ProductGroup>();
  for (const photo of photos) {
    if (!photo.src) continue;
    if (photo.productGroupName || !photo.productGroup) groups.set(photo.src, {
      id: photo.src, name: photo.productGroupName || photo.name,
      type: photo.productGroupType || photo.type, photos: [],
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
    group.main = group.photos.find((p) => p.src === root?.productMain) ?? group.photos.find((p) => p.src === group.id) ?? group.photos[0];
  }
  return [...groups.values()];
}
export function productSources(group: ProductGroup, main = group.main, preferredView?: string) {
  return group.photos.filter((p) => p.src !== main?.src)
    .sort((a, b) => Number(b.productView === preferredView) - Number(a.productView === preferredView)).slice(0, 5);
}
