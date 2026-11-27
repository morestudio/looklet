// cutout.ts — ตัดพื้นหลังรูปตัวหลักของหน้าโปสเตอร์ในเบราว์เซอร์ (MediaPipe ฟรี ไม่เรียก AI) · ผู้ใช้ 23 พ.ย.
// คน = ตัดเองอัตโนมัติ (selfie_multiclass ตัวเดียวกับหน้านางแบบ) · ของ/อาหาร = แตะที่ของ (interactive segmenter "magic touch")
// ใช้ได้เฉพาะใน browser · Poster.tsx โหลดไฟล์นี้ด้วย import() ตอนใช้เท่านั้น · wasm ต้องเวอร์ชันเดียวกับ package.json
import { FilesetResolver, ImageSegmenter, InteractiveSegmenter, type MPMask } from '@mediapipe/tasks-vision';
import { cleanMask } from './cutout-mask';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const SELFIE =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';
const MAGIC =
  'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite';
export const WORK_SIZE = 1024; // ตัดที่ขนาดนี้ (AI ได้รูปไม่เกิน 1024 อยู่แล้ว)
const MIN_PERSON = 0.03; // คนต้องกินอย่างน้อย 3% ของรูป ไม่งั้นถือว่าไม่มีคน (ให้แตะเลือกเอง)

let fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null;
let selfie: ImageSegmenter | null = null;
let magic: InteractiveSegmenter | null = null;
const files = async () => (fileset ??= await FilesetResolver.forVisionTasks(WASM));

// รูปที่ใช้ตัด (ย่อด้านยาวไม่เกิน WORK_SIZE) · mask = ความทึบ 0..1 ต่อพิกเซลของรูปนี้
export type Work = { canvas: HTMLCanvasElement; w: number; h: number };
export type Mask = Float32Array;

export function workCanvas(img: HTMLImageElement): Work {
  const s = Math.min(1, WORK_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * s)),
    h = Math.max(1, Math.round(img.naturalHeight * s));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  return { canvas, w, h };
}

// mask ของโมเดลมักเล็กกว่ารูป -> ขยายแบบ bilinear ขอบไม่เป็นขั้นบันได
function resample(m: MPMask, w: number, h: number): Mask {
  const src = m.getAsFloat32Array();
  if (m.width === w && m.height === h) return src.slice();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(m.height - 1, Math.max(0, ((y + 0.5) * m.height) / h - 0.5));
    const y0 = Math.floor(fy),
      y1 = Math.min(m.height - 1, y0 + 1),
      ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(m.width - 1, Math.max(0, ((x + 0.5) * m.width) / w - 0.5));
      const x0 = Math.floor(fx),
        x1 = Math.min(m.width - 1, x0 + 1),
        tx = fx - x0;
      const top = src[y0 * m.width + x0] * (1 - tx) + src[y0 * m.width + x1] * tx;
      const bottom = src[y1 * m.width + x0] * (1 - tx) + src[y1 * m.width + x1] * tx;
      out[y * w + x] = top * (1 - ty) + bottom * ty;
    }
  }
  return out;
}

// ความมั่นใจ -> ความทึบ: ตัดส่วนที่ไม่แน่ใจทิ้ง ขอบนุ่มนิดหน่อย
const soft = (v: number) => Math.min(1, Math.max(0, (v - 0.35) / 0.3));

// คนในรูป (ทุกคน) = 1 - พื้นหลัง · ไม่มีคน = null
export async function autoCut(work: Work): Promise<Mask | null> {
  selfie ??= await ImageSegmenter.createFromOptions(await files(), {
    baseOptions: { modelAssetPath: SELFIE },
    runningMode: 'IMAGE',
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  });
  const result = selfie.segment(work.canvas);
  const bg = result.confidenceMasks?.[0];
  if (!bg) {
    result.close();
    return null;
  }
  const mask = resample(bg, work.w, work.h);
  result.close();
  let solid = 0;
  for (let i = 0; i < mask.length; i++) {
    mask[i] = soft(1 - mask[i]);
    if (mask[i] > 0.5) solid++;
  }
  return solid / mask.length >= MIN_PERSON ? cleanMask(mask, work.w, work.h) : null;
}

// แตะ = ของชิ้นที่อยู่ใต้จุดนั้น · หลายจุด = รวมกัน (เช่น จาน + แก้ว) · จุด = สัดส่วน 0..1 ของรูป
export async function tapCut(work: Work, points: { x: number; y: number }[]): Promise<Mask | null> {
  if (!points.length) return null;
  magic ??= await InteractiveSegmenter.createFromOptions(await files(), {
    baseOptions: { modelAssetPath: MAGIC },
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  });
  const mask = new Float32Array(work.w * work.h);
  for (const keypoint of points) {
    const result = magic.segment(work.canvas, { keypoint });
    const masks = result.confidenceMasks ?? [];
    const fg = masks[masks.length - 1]; // ช่องสุดท้าย = ของที่แตะ
    if (fg) {
      const m = resample(fg, work.w, work.h);
      for (let i = 0; i < mask.length; i++) mask[i] = Math.max(mask[i], soft(m[i]));
    }
    result.close();
  }
  return mask.some((v) => v > 0.5) ? cleanMask(mask, work.w, work.h) : null;
}

// ตัวหลักที่ตัดแล้ว: โปร่งใสนอก mask ครอปเหลือแค่ตัวของ (เผื่อขอบ 2%) · ไม่เหลืออะไร = null
export function cutCanvas(work: Work, mask: Mask): HTMLCanvasElement | null {
  const { w, h } = work;
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mask[y * w + x] > 0.1) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const pad = Math.round(Math.max(w, h) * 0.02);
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad);
  y1 = Math.min(h - 1, y1 + pad);
  const src = work.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  const ctx = out.getContext('2d')!;
  const data = ctx.createImageData(out.width, out.height);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = (y * w + x) * 4,
        o = ((y - y0) * out.width + (x - x0)) * 4;
      data.data[o] = src.data[i];
      data.data[o + 1] = src.data[i + 1];
      data.data[o + 2] = src.data[i + 2];
      data.data[o + 3] = Math.round(src.data[i + 3] * mask[y * w + x]);
    }
  ctx.putImageData(data, 0, 0);
  return out;
}

// ภาพในแผงด้านซ้าย: รูปเต็ม ส่วนที่ตัดออกมืดลง (เห็นว่าเลือกอะไรไว้)
export function previewCanvas(work: Work, mask: Mask | null): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = work.w;
  out.height = work.h;
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(work.canvas, 0, 0);
  if (!mask) return out;
  const img = ctx.getImageData(0, 0, work.w, work.h);
  for (let i = 0; i < mask.length; i++) {
    const keep = 0.28 + 0.72 * mask[i]; // พื้นหลังเหลือ 28% ของความสว่าง
    img.data[i * 4] *= keep;
    img.data[i * 4 + 1] *= keep;
    img.data[i * 4 + 2] *= keep;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

// คนในภาพที่สร้างแล้ว (ผู้ใช้ 27 พ.ย.: ชื่อตัวยักษ์อยู่หลังตัวคน): ภาพเต็มความละเอียด โปร่งใสนอกตัวคน
// mask ตัดจากรูปย่อ (WORK_SIZE) แล้วขยายขึ้น ขอบนุ่ม · ไม่เจอคน = แตะที่จุด taps (กลางตัวหลักที่วางไว้ สัดส่วน 0..1) · ไม่ได้ = null
export async function frontCut(img: HTMLImageElement, taps: { x: number; y: number }[] = []) {
  const work = workCanvas(img);
  const mask = (await autoCut(work)) ?? (await tapCut(work, taps));
  if (!mask) return null;
  const m = document.createElement('canvas');
  m.width = work.w;
  m.height = work.h;
  const mctx = m.getContext('2d')!;
  const alpha = mctx.createImageData(work.w, work.h);
  // ขอบแน่นกว่าตอนตัดตัวหลัก: ขอบนุ่มของ mask (256px ขยายขึ้น) ทิ้งพื้นหลังเป็นเส้นจางรอบผมทับตัวอักษรดำ -> หดเข้าในนิดหนึ่ง
  for (let i = 0; i < mask.length; i++)
    alpha.data[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, (mask[i] - 0.55) / 0.3)) * 255);
  mctx.putImageData(alpha, 0, 0);
  const out = document.createElement('canvas');
  out.width = img.naturalWidth;
  out.height = img.naturalHeight;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(m, 0, 0, out.width, out.height);
  return out;
}
