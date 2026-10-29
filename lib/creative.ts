// แผนภาพสร้างสรรค์ (ไอเดียภาพ): ข้อความไทยให้เลือก + คำสั่งอังกฤษหนึ่งชุดที่ใช้สร้างภาพจริง
// (เลิกแยกโหมด AI คิด / ภาพแรงบันดาลใจ / บอกเอง 27 ต.ค.: ทุกอย่างไม่บังคับ ใส่พร้อมกันได้)
export type CreativeConcept = {
  id: string; title: string; summary: string; palette: string[];
  scene: string; props: string; lighting: string; composition: string; prompt: string;
};
export const CREATIVE_FIELDS = ['title', 'summary', 'palette', 'scene', 'props', 'lighting', 'composition', 'prompt'] as const;
export function readCreativeConcept(value: unknown): CreativeConcept | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const limits = { id: 80, title: 100, summary: 500, scene: 500, props: 500, lighting: 500, composition: 500, prompt: 3000 };
  for (const [key, limit] of Object.entries(limits)) {
    if (typeof v[key] !== 'string' || !v[key].trim() || v[key].length > limit) return null;
  }
  if ((v.prompt as string).trim().length < 80 || !Array.isArray(v.palette) || v.palette.length < 2 || v.palette.length > 5
    || !v.palette.every((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))) return null;
  return Object.fromEntries([...Object.keys(limits).map((key) => [key, (v[key] as string).trim()]), ['palette', v.palette]]) as CreativeConcept;
}
