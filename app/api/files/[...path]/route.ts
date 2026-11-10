import { get } from '@/lib/route';
import { readImage, readThumb, THUMB_WIDTHS } from '@/lib/storage';

// ?w=512 = รูปย่อ JPEG ~40 KB (ตาราง/ประวัติรูปทุกหน้า thumbSrc ใน lib/browser.ts, ?w=400 หน้าตรวจงานเดิม) รูปเต็ม 1–6 MB ต่อรูป
// รับแค่ขนาดที่กำหนด ให้ browser จำซ้ำได้ · อ่านรูปย่อที่เก็บไว้ ไม่ดึงรูปเต็มจาก Supabase (โควตา egress, lib/storage-supabase.ts)

// เปิดรูปที่เก็บไว้ (results/ และ images/uploads/) — ชื่อไฟล์ไม่ซ้ำ เปลี่ยนไม่ได้ ให้ browser จำไว้ได้นาน
// readImage เปิดได้เฉพาะรูปที่บัญชีนี้เห็นได้ (ลูกค้าเปิดรูปของคนอื่นไม่ได้แม้รู้ชื่อไฟล์) · Cache-Control private: CDN ไม่แชร์ข้ามคน
export const GET = get(async (req: Request, ctx: RouteContext<'/api/files/[...path]'>) => {
  const { path } = await ctx.params;
  const w = Number(new URL(req.url).searchParams.get('w'));
  if (THUMB_WIDTHS.includes(w)) {
    const thumb = await readThumb(path, w);
    if (!thumb) return new Response('Not found', { status: 404 });
    return new Response(new Uint8Array(thumb.data), { headers: { 'Content-Type': thumb.type, 'Cache-Control': 'private, max-age=31536000, immutable' } });
  }
  const img = await readImage(path);
  if (!img) return new Response('Not found', { status: 404 });
  // รูปแก้เฉพาะจุดเก็บแบบ lossless จึงอาจใหญ่กว่าเพดาน response ปกติ ส่งเป็น stream โดยไม่บีบ JPEG
  let offset = 0;
  const body = img.data.length > 3_500_000 ? new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= img.data.length) { controller.close(); return; }
      const end = Math.min(offset + 64 * 1024, img.data.length);
      controller.enqueue(new Uint8Array(img.data.subarray(offset, end)));
      offset = end;
    },
  }) : new Uint8Array(img.data);
  return new Response(body, {
    headers: { 'Content-Type': img.type, 'Cache-Control': 'private, max-age=31536000, immutable' },
  });
});
