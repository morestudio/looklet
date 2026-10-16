import { signedIn } from '@/lib/route';
import { readImage } from '@/lib/storage';

// เปิดรูปที่เก็บไว้ (results/ และ images/uploads/) — ชื่อไฟล์ไม่ซ้ำ เปลี่ยนไม่ได้ ให้ browser จำไว้ได้นาน
export async function GET(_req: Request, ctx: RouteContext<'/api/files/[...path]'>) {
  const denied = await signedIn();
  if (denied) return denied;
  const { path } = await ctx.params;
  const img = await readImage(path);
  if (!img) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: { 'Content-Type': img.type, 'Cache-Control': 'private, max-age=31536000, immutable' },
  });
}
