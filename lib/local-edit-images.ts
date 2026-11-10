import 'server-only';
import sharp from 'sharp';
import type { Img } from './ai';
import { MAX_EDIT_PIXELS } from './local-edit';

export type PreparedLocalEdit = {
  width: number; height: number; original: Buffer; selection: Uint8Array;
  bounds: { left: number; top: number; width: number; height: number }; selectedPixels: number;
  image: Img; mask: Img | null; // mask null = ไม่ได้ระบาย (แก้จากคำสั่งอย่างเดียว)
};

export async function prepareLocalEdit(source: Buffer, maskBytes: Buffer | null): Promise<PreparedLocalEdit> {
  const { data: original, info } = await sharp(source, { limitInputPixels: MAX_EDIT_PIXELS }).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  if (!maskBytes) {
    const png = await sharp(original, { raw: { width, height, channels: 4 } }).png().toBuffer();
    return { width, height, original, selection: new Uint8Array(width * height), selectedPixels: 0, bounds: { left: 0, top: 0, width, height },
      image: { data: png.toString('base64'), mime: 'image/png' }, mask: null };
  }
  const meta = await sharp(maskBytes, { limitInputPixels: MAX_EDIT_PIXELS }).metadata();
  if (meta.format !== 'png' || !meta.hasAlpha || meta.width !== width || meta.height !== height) {
    throw new Error('พื้นที่เลือกต้องเป็น PNG โปร่งใสและมีขนาดเท่ารูปต้นฉบับ');
  }
  const rgba = await sharp(maskBytes).ensureAlpha().raw().toBuffer();
  const selection = new Uint8Array(width * height);
  let left = width, top = height, right = -1, bottom = -1, selectedPixels = 0;
  for (let i = 0; i < selection.length; i++) {
    const coverage = 255 - rgba[i * 4 + 3];
    selection[i] = coverage;
    if (!coverage) continue;
    selectedPixels++;
    const x = i % width, y = Math.floor(i / width);
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  const png = await sharp(original, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return {
    width, height, original, selection, selectedPixels,
    bounds: selectedPixels ? { left, top, width: right - left + 1, height: bottom - top + 1 } : { left: 0, top: 0, width, height },
    image: { data: png.toString('base64'), mime: 'image/png' }, mask: { data: maskBytes.toString('base64'), mime: 'image/png' },
  };
}

// ---------- สัดส่วนภาพที่ส่งให้ AI ----------
// AI สร้างได้แค่บางขนาด (เช่น 2:3) แต่รูปสินค้ามักเป็น 4:5 — เดิมยืด/บีบผลลัพธ์กลับด้วย fit: 'fill' ของในรูปจึงแบน/อ้วนขึ้น ~17%
// และพื้นที่ที่แก้ไม่ตรงตำแหน่งเดิม (ผู้ใช้เจอ 28 ต.ค.: ลบพร็อพแล้วกระเป๋ากว้างขึ้น) -> เติมขอบรูปให้เป็นสัดส่วนเดียวกับขนาดที่ขอ
// (คัดลอกพิกเซลขอบ ไม่ย่อ/ขยายรูปเดิม) ส่งให้ AI แล้วตัดขอบที่เติมออก ของในรูปจึงอยู่ที่เดิม ขนาดเดิม
export type EditCanvas = { width: number; height: number; left: number; top: number; source: { width: number; height: number } };

export function editCanvas(width: number, height: number, size: string): EditCanvas {
  const [sw, sh] = size.split('x').map(Number);
  const ratio = sw / sh;
  const wider = width / height > ratio;
  const canvasWidth = wider ? width : Math.round(height * ratio);
  const canvasHeight = wider ? Math.round(width / ratio) : height;
  return { width: canvasWidth, height: canvasHeight, left: Math.floor((canvasWidth - width) / 2), top: Math.floor((canvasHeight - height) / 2), source: { width, height } };
}

const extendBy = (c: EditCanvas) => ({ top: c.top, bottom: c.height - c.source.height - c.top, left: c.left, right: c.width - c.source.width - c.left });

// รูป / ภาพไกด์: เติมขอบด้วยพิกเซลขอบเดิม · หน้ากาก (precise): ขอบที่เติมทึบ = ห้ามแก้
export async function toEditCanvas(img: Img, canvas: EditCanvas): Promise<Img> {
  const png = await sharp(Buffer.from(img.data, 'base64')).extend({ ...extendBy(canvas), extendWith: 'copy' }).png().toBuffer();
  return { data: png.toString('base64'), mime: 'image/png' };
}
export async function maskToEditCanvas(mask: Img, canvas: EditCanvas): Promise<Img> {
  const png = await sharp(Buffer.from(mask.data, 'base64')).ensureAlpha()
    .extend({ ...extendBy(canvas), background: { r: 0, g: 0, b: 0, alpha: 1 } }).png().toBuffer();
  return { data: png.toString('base64'), mime: 'image/png' };
}
// ผลจาก AI (ขนาดที่ขอ สัดส่วนเดียวกับ canvas) -> ย่อ/ขยายแบบสัดส่วนเท่าเดิมให้เท่า canvas แล้วตัดขอบที่เติมออก = ขนาดรูปเดิมพอดี
export async function fromEditCanvas(edited: Img, canvas: EditCanvas): Promise<Img> {
  const png = await sharp(Buffer.from(edited.data, 'base64'), { limitInputPixels: MAX_EDIT_PIXELS }).rotate()
    .resize(canvas.width, canvas.height, { fit: 'fill' })
    .extract({ left: canvas.left, top: canvas.top, width: canvas.source.width, height: canvas.source.height }).png().toBuffer();
  return { data: png.toString('base64'), mime: 'image/png' };
}

// คำนวณระยะจากขอบเข้าด้านในเท่านั้น ไม่ blur ให้การแก้ล้ำออกนอกพื้นที่ที่ระบาย
export async function blendLocalEdit(source: PreparedLocalEdit, edited: Img, feather: number): Promise<Img> {
  const { width, height, bounds, selection, original } = source;
  const changed = await sharp(Buffer.from(edited.data, 'base64'), { limitInputPixels: MAX_EDIT_PIXELS })
    .rotate().resize(width, height, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  const bw = bounds.width, bh = bounds.height;
  const distance = new Float32Array(bw * bh);
  const selected = (x: number, y: number) => selection[(y + bounds.top) * width + x + bounds.left];
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const i = y * bw + x;
    distance[i] = selected(x, y) ? Math.min(x ? distance[i - 1] + 1 : 1, y ? distance[i - bw] + 1 : 1) : 0;
  }
  for (let y = bh - 1; y >= 0; y--) for (let x = bw - 1; x >= 0; x--) {
    const i = y * bw + x;
    if (distance[i]) distance[i] = Math.min(distance[i], x < bw - 1 ? distance[i + 1] + 1 : 1, y < bh - 1 ? distance[i + bw] + 1 : 1);
  }
  const out = Buffer.from(original);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const i = (y + bounds.top) * width + x + bounds.left;
    if (!selection[i]) continue;
    const t = feather ? Math.min(1, Math.max(0, (distance[y * bw + x] - 0.5) / feather)) : 1;
    const weight = selection[i] / 255 * t * t * (3 - 2 * t);
    for (let c = 0; c < 4; c++) out[i * 4 + c] = Math.round(original[i * 4 + c] * (1 - weight) + changed[i * 4 + c] * weight);
  }
  // PNG แบบ lossless รักษาค่าพิกเซลรอบนอก ห้ามผ่าน servable ที่อาจแปลงเป็น JPEG
  const png = await sharp(out, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  return { data: png.toString('base64'), mime: 'image/png' };
}

// ระบายกี่ที่ อยู่ตรงไหนของรูป -> คำสั้นๆ ให้ AI (LOCAL_EDIT_PROMPT areas) เรียงซ้ายไปขวา เช่น ['at the bottom left', 'on the right side']
// นับบนตารางหยาบ (ช่องละ ~1/160 ของด้านสั้น): รอยระบายที่ห่างกันไม่ถึง ~1.5% ของด้านสั้นนับเป็นที่เดียว (ยกนิ้วแล้วระบายต่อ),
// ที่เล็กมาก (< 0.05% ของรูป เช่นแตะพลาด) ไม่นับ · ตำแหน่ง = จุดกลางของสีที่ระบายจริง แบ่งรูปเป็น 3×3
export function highlightAreas(source: PreparedLocalEdit): string[] {
  const { width, height, selection, selectedPixels } = source;
  if (!selectedPixels) return [];
  const cell = Math.max(4, Math.round(Math.min(width, height) / 160));
  const gw = Math.ceil(width / cell), gh = Math.ceil(height / cell);
  const count = new Uint32Array(gw * gh);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (selection[y * width + x]) count[Math.floor(y / cell) * gw + Math.floor(x / cell)]++;
  const r = Math.max(1, Math.round(Math.min(width, height) * 0.015 / cell));
  const near = new Uint8Array(gw * gh); // ช่องที่มีสี + ขยายออก r ช่อง ไว้ต่อรอยที่เกือบติดกัน
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    if (!count[gy * gw + gx]) continue;
    for (let y = Math.max(0, gy - r); y <= Math.min(gh - 1, gy + r); y++) near.fill(1, y * gw + Math.max(0, gx - r), y * gw + Math.min(gw - 1, gx + r) + 1);
  }
  const seen = new Uint8Array(gw * gh);
  const areas: { pixels: number; x: number; y: number }[] = [];
  for (let start = 0; start < near.length; start++) {
    if (!near[start] || seen[start]) continue;
    let pixels = 0, sx = 0, sy = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const gx = i % gw, gy = (i - gx) / gw;
      if (count[i]) { pixels += count[i]; sx += count[i] * (gx + 0.5) * cell; sy += count[i] * (gy + 0.5) * cell; }
      for (const j of [gx > 0 ? i - 1 : -1, gx < gw - 1 ? i + 1 : -1, gy > 0 ? i - gw : -1, gy < gh - 1 ? i + gw : -1]) {
        if (j >= 0 && near[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    if (pixels >= width * height * 0.0005) areas.push({ pixels, x: sx / pixels / width, y: sy / pixels / height });
  }
  return areas.sort((a, b) => a.x - b.x).map(({ x, y }) => {
    const side = x < 1 / 3 ? 'left' : x > 2 / 3 ? 'right' : '';
    const level = y < 1 / 3 ? 'top' : y > 2 / 3 ? 'bottom' : '';
    return level ? `at the ${level} ${side || 'center'}` : side ? `on the ${side} side` : 'in the center';
  });
}

// Rough highlights are visual references, never a clipping mask for the generated result.
export async function roughEditGuide(source: PreparedLocalEdit): Promise<Img> {
  const { width, height, original, selection } = source;
  const guide = Buffer.from(original);
  for (let i = 0; i < selection.length; i++) {
    const alpha = selection[i] / 255 * 0.45;
    if (!alpha) continue;
    for (let c = 0; c < 3; c++) {
      const red = [230, 0, 35][c];
      guide[i * 4 + c] = Math.round(original[i * 4 + c] * (1 - alpha) + red * alpha);
    }
  }
  const png = await sharp(guide, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return { data: png.toString('base64'), mime: 'image/png' };
}

// ภาพไฮไลต์ที่เก็บไว้ให้หน้าตรวจงาน (saveGuide): ย่อด้านยาวไม่เกิน 1024 JPEG ~100–200 KB — ส่งให้ AI ยังเป็น PNG ขนาดเต็มเหมือนเดิม
export async function guidePreview(guide: Img): Promise<Buffer> {
  return sharp(Buffer.from(guide.data, 'base64')).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#fff' }).jpeg({ quality: 82 }).toBuffer();
}

export async function finishRoughEdit(source: PreparedLocalEdit, edited: Img): Promise<Img> {
  const png = await sharp(Buffer.from(edited.data, 'base64'), { limitInputPixels: MAX_EDIT_PIXELS })
    .rotate().resize(source.width, source.height, { fit: 'fill' }).png({ compressionLevel: 9 }).toBuffer();
  return { data: png.toString('base64'), mime: 'image/png' };
}
