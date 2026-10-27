import 'server-only';
import sharp from 'sharp';
import type { Img } from './ai';
import { MAX_EDIT_PIXELS } from './local-edit';

export type PreparedLocalEdit = {
  width: number; height: number; original: Buffer; selection: Uint8Array;
  bounds: { left: number; top: number; width: number; height: number }; selectedPixels: number;
  image: Img; mask: Img;
};

export async function prepareLocalEdit(source: Buffer, maskBytes: Buffer): Promise<PreparedLocalEdit> {
  const { data: original, info } = await sharp(source, { limitInputPixels: MAX_EDIT_PIXELS }).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
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
  if (!selectedPixels) throw new Error('ระบายพื้นที่ที่ต้องการแก้ก่อน');
  const png = await sharp(original, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return {
    width, height, original, selection, selectedPixels,
    bounds: { left, top, width: right - left + 1, height: bottom - top + 1 },
    image: { data: png.toString('base64'), mime: 'image/png' }, mask: { data: maskBytes.toString('base64'), mime: 'image/png' },
  };
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

export async function finishRoughEdit(source: PreparedLocalEdit, edited: Img): Promise<Img> {
  const png = await sharp(Buffer.from(edited.data, 'base64'), { limitInputPixels: MAX_EDIT_PIXELS })
    .rotate().resize(source.width, source.height, { fit: 'fill' }).png({ compressionLevel: 9 }).toBuffer();
  return { data: png.toString('base64'), mime: 'image/png' };
}
