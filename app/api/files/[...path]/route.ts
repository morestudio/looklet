import { signedIn } from '@/lib/route';
import { readImage } from '@/lib/storage';

// เปิดรูปที่เก็บไว้ (results/ และ images/uploads/) — ชื่อไฟล์ไม่ซ้ำ เปลี่ยนไม่ได้ ให้ browser จำไว้ได้นาน
export async function GET(_req: Request, ctx: RouteContext<'/api/files/[...path]'>) {
  const denied = await signedIn();
  if (denied) return denied;
  const { path } = await ctx.params;
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
}
