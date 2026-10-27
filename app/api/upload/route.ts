import { json, post } from '@/lib/route';
import { productGroups } from '@/lib/product-groups';
import { isKind, isStorable, saveImage, listImages } from '@/lib/storage';

// รูปที่เพิ่มเอง (นางแบบ/ชุด/ของเสริม/ฉาก) — ของเสริมเก็บประเภทไว้ด้วย (id ใน ACCESSORY_TYPES ของ lib/catalog.ts)
export const POST = post(async (req) => {
  if (!isKind(req.kind) || !req.data) return json(400, { error: 'ข้อมูลรูปไม่ถูกต้อง' });
  // เดิมชนิดที่ไม่รู้จักถูกเก็บเป็น .png ทั้งที่ข้างในไม่ใช่ PNG -> เปิดรูปไม่ได้ (เจอกับ HEIC 19 ต.ค.)
  if (!isStorable(req.mime || 'image/png')) return json(400, { error: 'ชนิดไฟล์รูปนี้เก็บไม่ได้ (รับ JPG, PNG, WebP, GIF, HEIC)' });
  const meta: Record<string, string> = { name: String(req.name || 'รูปที่เพิ่ม').slice(0, 80) };
  if (req.type) meta.type = String(req.type).slice(0, 20);
  if (req.kind === 'products') {
    if (req.productGroup != null) {
      const group = productGroups(await listImages({ area: 'uploads', kind: 'products' })).find((g) => g.id === req.productGroup);
      if (!group) return json(400, { error: 'ไม่พบสินค้าที่จะเพิ่มรูปให้' });
      meta.productGroup = group.id;
      meta.type = group.type || 'other';
    } else {
      meta.productGroupName = meta.name;
      meta.productGroupType = meta.type || 'other';
    }
    meta.productView = 'unspecified';
  }
  const src = await saveImage({ area: 'uploads', kind: req.kind }, req.data, req.mime || 'image/png', meta);
  return json(200, { src });
});
