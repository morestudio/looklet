// aspects.ts — "ใช้ภาพที่ไหน": เลือกสัดส่วนภาพตามที่จะลงรูป (ใช้ทั้งหน้าสินค้าและหน้านางแบบ) การ์ดวาดกรอบเล็กตามสัดส่วนจริง
// OpenAI ทำได้แค่ 2:3 / 1:1 / 3:2 -> 4:5 / 9:16 ทำขนาดใกล้สุดแล้ว server ตัดกลางภาพ (cropTo ใน lib/images.ts)
export const PLATFORM_ASPECTS = [
  { id: '4:5', name: 'IG · Facebook ฟีด', use: 'โพสต์ทั่วไป เต็มจอในฟีดที่สุด' },
  { id: '9:16', name: 'Story · Reels · TikTok', use: 'เต็มจอแนวตั้ง' },
  { id: '1:1', name: 'Shopee · Lazada', use: 'รูปในร้านค้า หรือโพสต์สี่เหลี่ยม' },
  { id: '3:2', name: 'Facebook แนวนอน · เว็บไซต์', use: 'แบนเนอร์ ลิงก์ หน้าเว็บ' },
  { id: '2:3', name: 'Pinterest · โปสเตอร์', use: 'แนวตั้งยาว' },
] as const;
export const isPlatformAspect = (a: unknown) => PLATFORM_ASPECTS.some((x) => x.id === a);

// สัดส่วนที่ OpenAI ทำได้ตรงๆ (ไม่ต้องตัด)
export const AI_ASPECTS = ['2:3', '1:1', '3:2'];
// ขนาดมาตรฐานของ OpenAI ตามแนวภาพ (route แปลงเป็นขนาดใหญ่ของ GPT Image 2.5 ด้วย GPT25_SIZES)
export function aspectBaseSize(aspect: string) {
  const [w, h] = aspect.split(':').map(Number);
  return w < h ? '1024x1536' : w > h ? '1536x1024' : '1024x1024';
}
