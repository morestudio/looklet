import { planCreativeConcepts, type Img } from '@/lib/ai';
import { productType } from '@/lib/packshot';
import { json, post } from '@/lib/route';

export const POST = post(async (req) => {
  const image = (v: unknown): Img | null => typeof v === 'string' && v.length > 0 && v.length < 15_000_000 ? { data: v, mime: 'image/jpeg' } : null;
  const product = image(req.product);
  if (!product) return json(400, { error: 'เลือกสินค้าก่อนคิดไอเดีย' });
  // ไอเดียที่พิมพ์ / ภาพแรงบันดาลใจ / ข้อมูลสินค้า ไม่บังคับ ใส่พร้อมกันได้ (เลิกแยกโหมด 27 ต.ค.)
  const idea = typeof req.idea === 'string' ? req.idea.trim().slice(0, 1200) : '';
  const inspiration = image(req.inspiration);
  const supports: Img[] = Array.isArray(req.support_images) ? req.support_images.slice(0, 5).map(image).filter((v: Img | null): v is Img => Boolean(v)) : [];
  const concepts = await planCreativeConcepts({
    product, supports, inspiration, what: productType(req.product_type).prompt, idea,
    facts: typeof req.facts === 'string' ? req.facts.trim().slice(0, 1200) : '',
    previous: Array.isArray(req.previous) ? req.previous.filter((v: unknown): v is string => typeof v === 'string').slice(0, 12).map((v: string) => v.slice(0, 100)) : [],
  });
  if (!concepts) return json(503, { error: 'AI ยังคิดไอเดียไม่สำเร็จ ลองอีกครั้งได้' });
  return json(200, { concepts });
});
