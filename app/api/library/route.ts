import { KINDS, listImages } from '@/lib/storage';

// เปิดหน้าเว็บ -> รูปที่เคยสร้าง + รูปที่เคยเพิ่มเอง (แยกตามประเภท)
export async function GET() {
  const [results, ...uploads] = await Promise.all([
    listImages({ area: 'results' }),
    ...KINDS.map((kind) => listImages({ area: 'uploads', kind })),
  ]);
  return Response.json({ results, uploads: Object.fromEntries(KINDS.map((k, i) => [k, uploads[i]])) });
}
