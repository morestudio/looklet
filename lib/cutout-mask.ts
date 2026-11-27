// cutout-mask.ts — ทำความสะอาดรอยตัดพื้นหลัง (ไม่มี DOM / MediaPipe: ทดสอบด้วย node ได้) · ใช้ใน lib/cutout.ts
// เก็บเฉพาะชิ้นหลัก (ผู้ใช้ 23 พ.ย.: รูปที่มีตัวหนังสือทับขา ตัดออกมาเหลือเศษสี่เหลี่ยมใต้ตัวคน แล้ว AI วาดตามนั้น)
// ชิ้น = พิกเซลที่ติดกัน (ทึบ > 0.1) · เก็บชิ้นที่ใหญ่อย่างน้อย KEEP_SHARE ของชิ้นใหญ่สุด (คนสองคนแยกกัน = เก็บทั้งคู่)
const KEEP_SHARE = 0.15;
export function cleanMask(mask: Float32Array, w: number, h: number): Float32Array {
  const label = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (label[start] !== -1 || mask[start] <= 0.1) continue;
    const id = sizes.length;
    let size = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % w;
      for (const j of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1])
        if (j >= 0 && j < mask.length && label[j] === -1 && mask[j] > 0.1) {
          label[j] = id;
          stack.push(j);
        }
    }
    sizes.push(size);
  }
  if (sizes.length <= 1) return mask;
  const min = Math.max(...sizes) * KEEP_SHARE;
  const out = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) if (label[i] !== -1 && sizes[label[i]] >= min) out[i] = mask[i];
  return out;
}
