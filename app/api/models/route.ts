import { connection } from 'next/server';
import { availableModels } from '@/lib/ai';
import { DEFAULT_AI_MODEL } from '@/lib/catalog';
import { get } from '@/lib/route';

// โมเดล AI ที่ใช้ — เลือกเองไม่ได้แล้ว (27 ต.ค.) มีแค่ DEFAULT_AI_MODEL ถ้ามี key ใน .env (post() ใน lib/route.ts บังคับซ้ำ)
export const GET = get(async () => {
  await connection(); // อ่าน .env ตอนมีคนเปิด ไม่ใช่ตอน build (ใส่ key ทีหลังแล้วรีสตาร์ทก็เห็น)
  return Response.json(availableModels().filter((m) => m.id === DEFAULT_AI_MODEL));
});
