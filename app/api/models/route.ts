import { connection } from 'next/server';
import { availableModels } from '@/lib/ai';
import { signedIn } from '@/lib/route';

// รายชื่อโมเดล AI ที่ใช้ได้ (มีเฉพาะเจ้าที่มี key ใน .env)
export async function GET() {
  await connection(); // อ่าน .env ตอนมีคนเปิด ไม่ใช่ตอน build (ใส่ key ทีหลังแล้วรีสตาร์ทก็เห็น)
  const denied = await signedIn();
  if (denied) return denied;
  return Response.json(availableModels());
}
