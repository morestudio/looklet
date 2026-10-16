// beauty.js — อัลกอริทึมแต่งหน้าทั้งหมด (ไฟล์นี้ไม่ยุ่งกับ UI)
//
// ภาพทั้งหมดเก็บเป็น RGBA แบบเดียวกับ ImageData.data: [r,g,b,a, r,g,b,a, ...]
// จุดบนหน้า (landmarks) เป็นพิกัด pixel: pts[i] = {x, y}

// ---------- index ของจุดบนหน้า (MediaPipe Face Mesh มี 478 จุด) ----------
// เรียงเป็นวงรอบ เอาไปวาดเป็น polygon ได้เลย
// "ขวา/ซ้าย" ตามตัวคนในรูป (ตาขวาของคนในรูป = อยู่ซ้ายของภาพ)
export const RIGHT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
export const LEFT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
export const RIGHT_BROW = [46, 53, 52, 65, 55, 107, 66, 105, 63, 70];
export const LEFT_BROW = [276, 283, 282, 295, 285, 336, 296, 334, 293, 300];
export const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const JAW_RIGHT = [132, 58, 172]; // แก้ม/กรามฝั่งขวาของคนในรูป
const JAW_LEFT = [361, 288, 397];
const NOSE_TIP = 4;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function centerOf(pts, idx) {
  let x = 0, y = 0;
  for (const i of idx) { x += pts[i].x; y += pts[i].y; }
  return { x: x / idx.length, y: y / idx.length };
}

// ความกว้างหน้า (แก้มซ้าย-ขวา) ใช้เป็น "ไม้บรรทัด" ให้ทุกค่าปรับตามขนาดหน้าในรูป
export function faceWidth(pts) {
  return dist(pts[234], pts[454]);
}

// =====================================================================
// 1) หน้าเนียน: Guided Filter
// =====================================================================
// แนวคิด: เบลอเฉพาะบริเวณที่ "เรียบอยู่แล้ว" (ผิว รูขุมขน สิว) แต่ไม่เบลอขอบคมๆ (ขอบตา จมูก ปาก)
// ดูความแปรปรวน (variance) ในหน้าต่างรัศมี r:
//   - variance ต่ำ (ผิว)   -> a ≈ 0 -> ผลลัพธ์ ≈ ค่าเฉลี่ย (เบลอ)
//   - variance สูง (ขอบ)  -> a ≈ 1 -> ผลลัพธ์ ≈ ภาพเดิม (คม)
// eps คือเส้นแบ่งว่า variance เท่าไหร่ถึงนับเป็น "ขอบ"

// เบลอแบบกล่อง (ค่าเฉลี่ยในหน้าต่าง 2r+1) ใช้ผลรวมสะสม เลยเร็วเท่ากันไม่ว่า r จะใหญ่แค่ไหน
export function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  // แนวนอน
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = 0; x <= Math.min(r, w - 1); x++) sum += src[row + x];
    for (let x = 0; x < w; x++) {
      const lo = Math.max(0, x - r), hi = Math.min(w - 1, x + r);
      tmp[row + x] = sum / (hi - lo + 1);
      if (x + r + 1 < w) sum += src[row + x + r + 1];
      if (x - r >= 0) sum -= src[row + x - r];
    }
  }
  // แนวตั้ง
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = 0; y <= Math.min(r, h - 1); y++) sum += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      const lo = Math.max(0, y - r), hi = Math.min(h - 1, y + r);
      out[y * w + x] = sum / (hi - lo + 1);
      if (y + r + 1 < h) sum += tmp[(y + r + 1) * w + x];
      if (y - r >= 0) sum -= tmp[(y - r) * w + x];
    }
  }
  return out;
}

// คืนภาพที่ "เนียนสุด" (100%) ทั้งภาพ — คำนวณครั้งเดียวต่อรูป
// ตอนเลื่อนสไลเดอร์แค่ผสมภาพเดิมกับภาพนี้ ไม่ต้องคำนวณใหม่ เลยลื่น
export function smoothSkin(rgba, w, h, r, eps) {
  const n = w * h;
  const out = new Uint8ClampedArray(rgba.length);
  const I = new Float32Array(n);
  const II = new Float32Array(n);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) {
      const v = rgba[i * 4 + c] / 255;
      I[i] = v;
      II[i] = v * v;
    }
    const meanI = boxBlur(I, w, h, r);
    const meanII = boxBlur(II, w, h, r);
    const a = new Float32Array(n);
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const variance = meanII[i] - meanI[i] * meanI[i];
      a[i] = variance / (variance + eps);
      b[i] = meanI[i] - a[i] * meanI[i];
    }
    const meanA = boxBlur(a, w, h, r);
    const meanB = boxBlur(b, w, h, r);
    for (let i = 0; i < n; i++) out[i * 4 + c] = (meanA[i] * I[i] + meanB[i]) * 255;
  }
  for (let i = 0; i < n; i++) out[i * 4 + 3] = 255;
  return out;
}

// =====================================================================
// 2) Mask: บอกว่าแต่ละ pixel เป็นอะไร
// =====================================================================
// seg มาจากโมเดลแยกส่วน (MediaPipe selfie multiclass) — แต่ละ pixel มีค่า 0..1 ว่ามั่นใจแค่ไหนว่าเป็น
//   background, hair, bodySkin (มือ คอ แขน), faceSkin, clothes, others
//
// คืนค่า mask:
//   skin     — ผิวหน้า + ผิวกาย (ไม่รวม ตา คิ้ว ปาก) ใช้กับ ลบสิว/เนียน/ขาว
//   toneSkin — ผิว + คิ้ว + ปาก (เจาะแค่ลูกตา) ใช้กับเปลี่ยนโทนผิว
//              เปลี่ยนโทนต้องเปลี่ยนทั้งหน้า ไม่งั้นรอบตา/ปากจะเป็นดวงสีเดิมให้เห็น
//   freeze   — pixel ที่ "ห้ามขยับ" เวลาดัดหน้า (พื้นหลัง มือ เสื้อ) เส้นตรงในฉากจะได้ไม่งอ
//   solid    — pixel ที่ "ห้ามถูกดึงไปยืดทับที่อื่น" (มือ เสื้อ) ไม่งั้นนิ้วที่อยู่ข้างแก้มจะดูอ้วนขึ้น
export function buildMasks(w, h, faces, seg) {
  const n = w * h;
  const fw = faces.length ? Math.max(...faces.map(faceWidth)) : w / 3;

  // วาดรูที่จะเจาะ (โมเดลแยกส่วนนับ ตา คิ้ว ปาก เป็น "ผิวหน้า" ด้วย)
  // 'lighter' = สีบวกกัน: ช่องแดง = ตา คิ้ว ปาก (เผื่อขอบ), ช่องเขียว = ลูกตาอย่างเดียว
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  const poly = (pts, part) => {
    ctx.beginPath();
    part.forEach((i, k) => (k ? ctx.lineTo(pts[i].x, pts[i].y) : ctx.moveTo(pts[i].x, pts[i].y)));
    ctx.closePath();
  };
  for (const pts of faces) {
    // ขยายรูให้กว้างกว่าตา/ปากนิดเดียว — ถ้ากว้างไป รอบตาจะไม่ขาวตาม เห็นเป็นวงคล้ำ
    ctx.lineWidth = faceWidth(pts) * 0.015;
    ctx.fillStyle = ctx.strokeStyle = '#f00';
    for (const part of [RIGHT_EYE, LEFT_EYE, RIGHT_BROW, LEFT_BROW, LIPS]) {
      poly(pts, part);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#0f0';
    for (const part of [RIGHT_EYE, LEFT_EYE]) {
      poly(pts, part);
      ctx.fill();
    }
  }
  const holeData = ctx.getImageData(0, 0, w, h).data;
  let holes = new Float32Array(n);
  let eyeHoles = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    holes[i] = holeData[i * 4] / 255;
    eyeHoles[i] = holeData[i * 4 + 1] / 255;
  }
  const f = Math.max(1, Math.round(fw * 0.015));
  holes = boxBlur(boxBlur(holes, w, h, f), w, h, f);
  eyeHoles = boxBlur(eyeHoles, w, h, 1);

  const skin = new Float32Array(n);
  const toneSkin = new Float32Array(n);
  const freeze = new Float32Array(n);
  const solid = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // ตัดค่าความมั่นใจต่ำๆ ทิ้ง (โมเดลชอบให้ 0.01-0.1 กระจายทั่วพื้นหลัง ทำให้สีพื้นหลังเพี้ยนตามนิดๆ)
    const s = smoothstep(0.2, 0.8, seg.faceSkin[i] + seg.bodySkin[i]);
    skin[i] = s * (1 - holes[i]);
    toneSkin[i] = s * (1 - eyeHoles[i]);
    solid[i] = Math.min(1, seg.bodySkin[i] + seg.clothes[i] + seg.others[i]);
    freeze[i] = Math.min(1, solid[i] + seg.background[i]);
  }

  // ขอบต้องค่อยๆ ไล่ ไม่งั้นตรงรอยต่อระหว่างส่วนที่ขยับกับไม่ขยับจะเห็นภาพฉีก
  const r = Math.max(2, Math.round(fw * 0.03));
  const freezeSoft = boxBlur(boxBlur(freeze, w, h, r), w, h, r);
  const solidSoft = boxBlur(boxBlur(solid, w, h, r), w, h, r);
  for (let i = 0; i < n; i++) {
    freeze[i] = smoothstep(0.5, 1, freezeSoft[i]); // ไล่ออกไปทางพื้นหลัง: ขอบหน้ายังขยับได้เต็มที่
    solid[i] = smoothstep(0, 0.5, solidSoft[i]); // ไล่เข้ามาทางหน้า: กันพื้นที่รอบมือไว้หน่อย
  }
  return {
    skin: boxBlur(skin, w, h, 1),
    toneSkin: boxBlur(toneSkin, w, h, 1),
    freeze,
    solid,
  };
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lum = (rgba, p) => 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];

// =====================================================================
// 3) ลบสิว / กระ / จุดด่าง
// =====================================================================
// สิว กระ จุดด่าง = จุดเล็กๆ ที่ "เข้มกว่าผิวรอบๆ"
// 1. หาสีผิวเฉลี่ยรอบๆ แต่ละจุด (base) โดยเฉลี่ยเฉพาะ pixel ที่เป็นผิว ไม่ให้สีผมหรือพื้นหลังมาปน
// 2. pixel ที่เข้มกว่า base พอสมควร = น่าจะเป็นสิว (spot ≈ 1) ตอนเลื่อนสไลเดอร์จะถูกแทนด้วยสี base
//    แต่ถ้าเข้มกว่ามากๆ (รูจมูก ร่องปาก) ไม่ใช่สิว ปล่อยไว้
export function prepareBlemish(rgba, skin, w, h, r) {
  const n = w * h;
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) m[i] = skin[i] > 0.5 ? 1 : 0;
  const blur = (a) => boxBlur(boxBlur(a, w, h, r), w, h, r);
  const den = blur(m);

  const base = new Uint8ClampedArray(rgba.length);
  const ch = new Float32Array(n);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) ch[i] = rgba[i * 4 + c] * m[i];
    const num = blur(ch);
    for (let i = 0; i < n; i++) base[i * 4 + c] = den[i] > 0.01 ? num[i] / den[i] : rgba[i * 4 + c];
  }

  let spot = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const dark = lum(base, p) - lum(rgba, p);
    spot[i] = smoothstep(3, 12, dark) * (1 - smoothstep(35, 60, dark));
  }
  // ขยายจุดออกนิดนึง ให้คลุมขอบแดงๆ รอบสิวด้วย
  spot = boxBlur(spot, w, h, 2);
  for (let i = 0; i < n; i++) spot[i] = Math.min(1, spot[i] * 2);
  return { base, spot };
}

// =====================================================================
// 4) ผิวขาว: เส้นโค้งสี (LUT)
// =====================================================================
// LUT = ตารางแปลงสี 3 ช่อง (R,G,B) ช่องละ 256 ค่า: lut[c*256 + สีเดิม] = สีใหม่

// แบบตั้งต้น: log(v*(β-1)+1)/log(β) — ยกโทนกลางขึ้น แต่ขาว/ดำสุดไม่เปลี่ยน ใช้เส้นเดียวกันทั้ง 3 ช่อง
export function defaultWhiteLut() {
  const beta = 4;
  const lut = new Float32Array(768);
  for (let v = 0; v < 256; v++) {
    lut[v] = lut[256 + v] = lut[512 + v] = (255 * Math.log((v / 255) * (beta - 1) + 1)) / Math.log(beta);
  }
  return lut;
}

// =====================================================================
// 5) โทนผิว: ทำในปริภูมิสี Lab
// =====================================================================
// RGB ผูก "ความสว่าง" กับ "สี" ไว้ด้วยกัน ถ้าจะเปลี่ยนสีโดยเก็บแสงเงาไว้ ต้องแยกสองอย่างนี้ออกจากกัน
// Lab แยกให้แล้ว: L = ความสว่าง (0-100), a = เขียว<->แดง, b = น้ำเงิน<->เหลือง
const LINEAR = new Float32Array(256).map((_, v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
const toSrgb = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const fLab = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
const fLabInv = (t) => (t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787);

export function rgbToLab(r, g, b) {
  const R = LINEAR[r], G = LINEAR[g], B = LINEAR[b];
  const fx = fLab((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const fy = fLab(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const fz = fLab((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb(L, a, b) {
  const fy = (L + 16) / 116;
  const x = fLabInv(fy + a / 500) * 0.95047, y = fLabInv(fy), z = fLabInv(fy - b / 200) * 1.08883;
  return [
    toSrgb(Math.max(0, 3.2406 * x - 1.5372 * y - 0.4986 * z)),
    toSrgb(Math.max(0, -0.9689 * x + 1.8758 * y + 0.0415 * z)),
    toSrgb(Math.max(0, 0.0557 * x - 0.204 * y + 1.057 * z)),
  ];
}

// ค่าเฉลี่ย (mean) และความกระจาย (std) ของสี Lab ตรงที่ mask > 0.5
export function colorStats(rgba, mask) {
  let n = 0;
  const s = [0, 0, 0], s2 = [0, 0, 0];
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    if (mask[i] < 0.5) continue;
    const lab = rgbToLab(rgba[p], rgba[p + 1], rgba[p + 2]);
    for (let c = 0; c < 3; c++) { s[c] += lab[c]; s2[c] += lab[c] * lab[c]; }
    n++;
  }
  if (!n) return null;
  const mean = s.map((v) => v / n);
  return { mean, std: s2.map((v, c) => Math.sqrt(Math.max(1e-6, v / n - mean[c] * mean[c]))) };
}

// ไม่มีรูปอ้างอิง มีแค่สีที่เลือก: ใช้สีนั้นเป็นค่าเฉลี่ยใหม่ ความกระจายของสีคงเดิม
export function statsFromColor(src, r, g, b) {
  return { mean: rgbToLab(r, g, b), std: src.std };
}

// ย้ายโทนผิว (ดัดแปลงจาก Reinhard color transfer) ใช้แค่ค่าสถิติของสีผิว (ค่าเฉลี่ย + ความกระจาย)
//
// สี (a, b): สีใหม่ = (สีเดิม − ค่าเฉลี่ยต้นฉบับ) × (ความกระจายปลายทาง / ความกระจายต้นฉบับ) + ค่าเฉลี่ยปลายทาง
// ความสว่าง (L): แสงเงาทำงานแบบ "คูณ" — จุดที่สว่างกว่าผิวรอบๆ 20% บนผิวขาว
//   ก็ควรสว่างกว่า 20% บนผิวเข้มด้วย ไม่ใช่สว่างกว่า +20 เท่าเดิม (ไม่งั้นรอบตาจะขาวเป็นดวง)
//   ใน Lab ค่า L+16 แปรตามรากที่สามของแสงจริง การคูณแสงจึงเท่ากับการคูณ L+16 ด้วยอัตราส่วนคงที่
export function transferTone(rgba, mask, src, dst) {
  const out = new Uint8ClampedArray(rgba);
  const sL = (dst.mean[0] + 16) / (src.mean[0] + 16);
  const ka = dst.std[1] / src.std[1], kb = dst.std[2] / src.std[2];
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    if (mask[i] < 0.01) continue;
    const lab = rgbToLab(rgba[p], rgba[p + 1], rgba[p + 2]);
    const rgb = labToRgb(
      (lab[0] + 16) * sL - 16,
      (lab[1] - src.mean[1]) * ka + dst.mean[1],
      (lab[2] - src.mean[2]) * kb + dst.mean[2],
    );
    out[p] = rgb[0];
    out[p + 1] = rgb[1];
    out[p + 2] = rgb[2];
  }
  return out;
}

// =====================================================================
// 6) ผสมทุกอย่างตามค่าสไลเดอร์ (ทำเฉพาะตรงที่ mask บอกว่าเป็นผิว)
// =====================================================================
// amt  = { acne, smooth, tone, white } ค่า 0..1 จากสไลเดอร์
// prep = ของที่คำนวณไว้แล้วตอนโหลดรูป { skin, toneSkin, smooth, base, spot, tone }
export function applySkin(orig, prep, amt, lut) {
  const { skin, toneSkin, smooth, base, spot, tone } = prep;
  const out = new Uint8ClampedArray(orig.length);
  for (let i = 0, p = 0; i < skin.length; i++, p += 4) {
    const ka = skin[i] * spot[i] * amt.acne;
    const ks = skin[i] * amt.smooth;
    const kt = tone ? toneSkin[i] * amt.tone : 0;
    const kw = skin[i] * amt.white;
    for (let c = 0; c < 3; c++) {
      const o = orig[p + c];
      let v = o + (base[p + c] - o) * ka; // ลบสิว: แทนจุดเข้มด้วยสีผิวรอบๆ
      v += (smooth[p + c] - o) * ks; // เนียน: บวกส่วนต่างระหว่างภาพเนียนกับภาพเดิม
      if (kt) v += (tone[p + c] - o) * kt; // โทนผิว: ไล่จากสีเดิมไปหาสีปลายทาง
      v = Math.min(255, Math.max(0, v));
      v += (lut[c * 256 + (v | 0)] - v) * kw; // ขาว: ผ่านเส้นโค้งสี
      out[p + c] = v;
    }
    out[p + 3] = 255;
  }
  return out;
}

// =====================================================================
// 7) ดัดรูปทรง: ตาโต + หน้าเรียว (Image Warping)
// =====================================================================
// หลักการ "backward mapping": วนทุก pixel ของภาพผลลัพธ์ แล้วถามว่า
// "pixel นี้ควรไปหยิบสีมาจากตำแหน่งไหนของภาพต้นฉบับ?"
//
// - scale (ตาโต): pixel ใกล้ศูนย์กลางตาไปหยิบสีจากจุดที่ "ใกล้ศูนย์กลางกว่า" -> เหมือนส่องแว่นขยาย
//     ยิ่งห่างจากศูนย์กลางยิ่งขยายน้อยลง จนถึงขอบวง (รัศมี r) ไม่ขยายเลย -> ไม่มีรอยต่อ
// - move (หน้าเรียว): ดันเนื้อภาพในวงกลมไปทางทิศ (dx, dy) แบบเครื่องมือ Liquify/Push ใน Photoshop
//     แรงดันมากสุดที่ศูนย์กลาง ค่อยๆ ลดลงจนเป็น 0 ที่ขอบวง
export function buildWarps(faces, eyeAmt, slimAmt) {
  const warps = [];
  for (const pts of faces) {
    const fw = faceWidth(pts);
    if (eyeAmt > 0) {
      for (const eye of [RIGHT_EYE, LEFT_EYE]) {
        const c = centerOf(pts, eye);
        const eyeW = dist(pts[eye[0]], pts[eye[8]]); // หางตา -> หัวตา
        warps.push({ type: 'scale', cx: c.x, cy: c.y, r: eyeW * 1.1, s: eyeAmt * 0.35 });
      }
    }
    if (slimAmt > 0) {
      // ดันแก้ม/กรามทั้งสองข้างเข้าหาปลายจมูก
      const nose = pts[NOSE_TIP];
      for (const i of [...JAW_RIGHT, ...JAW_LEFT]) {
        const c = pts[i];
        const len = dist(c, nose);
        const move = slimAmt * fw * 0.05;
        warps.push({
          type: 'move', cx: c.x, cy: c.y, r: fw * 0.25,
          dx: ((nose.x - c.x) / len) * move,
          dy: ((nose.y - c.y) / len) * move,
        });
      }
    }
  }
  return warps;
}

// protect = { freeze, solid } จาก buildMasks — กันมือ เสื้อ พื้นหลัง ไม่ให้งอตาม
export function applyWarps(src, w, h, warps, protect) {
  const out = new Uint8ClampedArray(src); // นอกวง warp ไม่มีอะไรเปลี่ยน เลย copy มาก่อน
  if (!warps.length) return out;

  // คำนวณเฉพาะกรอบที่ครอบทุกวง warp
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (const wp of warps) {
    x0 = Math.min(x0, wp.cx - wp.r);
    y0 = Math.min(y0, wp.cy - wp.r);
    x1 = Math.max(x1, wp.cx + wp.r);
    y1 = Math.max(y1, wp.cy + wp.r);
  }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(w - 1, Math.ceil(x1)); y1 = Math.min(h - 1, Math.ceil(y1));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let sx = x, sy = y;
      for (const wp of warps) {
        const dx = sx - wp.cx, dy = sy - wp.cy;
        const d2 = dx * dx + dy * dy, r2 = wp.r * wp.r;
        if (d2 >= r2) continue;
        if (wp.type === 'scale') {
          const t = 1 - d2 / r2; // 1 ที่ศูนย์กลาง -> 0 ที่ขอบวง
          const k = 1 - wp.s * t * t;
          sx = wp.cx + dx * k;
          sy = wp.cy + dy * k;
        } else {
          // แรงดัน = (1 - d²/r²)² : เต็มที่ตรงกลาง ค่อยๆ หายที่ขอบวงแบบนุ่มๆ
          // (สูตร Gustafson ที่ tutorial ชอบใช้ จะ "พับ" ภาพเป็นคลื่นตรงขอบวงเมื่อดันแรง —
          //  สูตรนี้ไม่พับตราบใดที่ระยะดัน < ~0.65 r)
          const t = 1 - d2 / r2;
          sx -= t * t * wp.dx;
          sy -= t * t * wp.dy;
        }
      }

      // ลดการขยับลงตาม mask:
      // 1) pixel นี้อยู่บนพื้นหลัง/มือ/เสื้อ (freeze) -> ไม่ขยับ
      // 2) จุดที่จะไปหยิบสีมาเป็นมือ/เสื้อ (solid) -> ไม่หยิบ ไม่งั้นมือจะถูกยืดไปทับแก้ม
      if (protect) {
        const k1 = 1 - protect.freeze[y * w + x];
        const dx = (sx - x) * k1, dy = (sy - y) * k1;
        const jx = Math.min(w - 1, Math.max(0, Math.round(x + dx)));
        const jy = Math.min(h - 1, Math.max(0, Math.round(y + dy)));
        const k2 = 1 - protect.solid[jy * w + jx];
        sx = x + dx * k2;
        sy = y + dy * k2;
      }

      // ตำแหน่งที่ได้มักเป็นทศนิยม -> เฉลี่ยสี 4 pixel รอบๆ (bilinear) ภาพจะได้ไม่แตกเป็นขั้นบันได
      if (sx < 0) sx = 0; else if (sx > w - 1.001) sx = w - 1.001;
      if (sy < 0) sy = 0; else if (sy > h - 1.001) sy = h - 1.001;
      const ix = sx | 0, iy = sy | 0, fx = sx - ix, fy = sy - iy;
      const p00 = (iy * w + ix) * 4, p10 = p00 + 4, p01 = p00 + w * 4, p11 = p01 + 4;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = src[p00 + c] * (1 - fx) + src[p10 + c] * fx;
        const bottom = src[p01 + c] * (1 - fx) + src[p11 + c] * fx;
        out[o + c] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  return out;
}

// =====================================================================
// 8) คืนหน้าจริง: เอาหน้าจากรูปนางแบบมาใส่แทนหน้าที่ AI วาดใหม่
// =====================================================================
// AI วาดหน้าใหม่ทุกครั้ง หน้าเลยเพี้ยนและดูไม่เป็นคนจริง -> ใช้ pixel หน้าจากรูปนางแบบแทน
// จุดที่ไม่ค่อยขยับตามสีหน้า (หัว/หางตา สันจมูก โหนกแก้ม คาง หน้าผาก) ใช้จับคู่ตำแหน่งหน้า 2 รูป
const RIGID = [33, 133, 362, 263, 168, 6, 197, 195, 5, 4, 234, 454, 152, 10];
// ขอบหน้า หน้าผาก -> แก้ม -> คาง เรียงเป็นวง
export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
  152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

// หาการย่อ/หมุน/เลื่อน ที่ทำให้จุดหน้า src ทับจุดหน้า dst ได้ใกล้ที่สุด (least squares แบบ Umeyama ใน 2 มิติ)
// คืน { a, b, tx, ty, map, err }:  x' = a·x − b·y + tx,  y' = b·x + a·y + ty
// err = ระยะคลาดเฉลี่ยหลังจับคู่ ÷ ความกว้างหน้า — ค่าสูง = มุมหน้า/โครงหน้าต่างกันมาก แปะแล้วจะดูเหลื่อม
export function fitSimilarity(src, dst) {
  const P = RIGID.map((i) => src[i]), Q = RIGID.map((i) => dst[i]);
  const mean = (pts) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
  const mp = mean(P), mq = mean(Q);
  let sxx = 0, sxy = 0, norm = 0;
  P.forEach((p, k) => {
    const px = p.x - mp.x, py = p.y - mp.y, qx = Q[k].x - mq.x, qy = Q[k].y - mq.y;
    sxx += px * qx + py * qy;
    sxy += px * qy - py * qx;
    norm += px * px + py * py;
  });
  const a = sxx / norm, b = sxy / norm;
  const tx = mq.x - (a * mp.x - b * mp.y), ty = mq.y - (b * mp.x + a * mp.y);
  const map = (p) => ({ x: a * p.x - b * p.y + tx, y: b * p.x + a * p.y + ty });
  const rms = Math.sqrt(P.reduce((s, p, k) => s + dist(map(p), Q[k]) ** 2, 0) / P.length);
  return { a, b, tx, ty, map, err: rms / faceWidth(dst) };
}

// วาด polygon เป็น mask 0..1 (scale < 1 = หดเข้าหาจุดกลาง)
export function polygonMask(w, h, pts, scale = 1) {
  const c = centerOf(pts, pts.map((_, i) => i));
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.beginPath();
  pts.forEach((p, k) => {
    const x = c.x + (p.x - c.x) * scale, y = c.y + (p.y - c.y) * scale;
    if (k) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
  const data = ctx.getImageData(0, 0, w, h).data;
  const m = new Float32Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = data[i * 4 + 3] / 255;
  return m;
}

// ผสมหน้า: รายละเอียด (ตา จมูก ปาก ผิว) จากหน้าจริง แต่แสงเงาภาพรวมจากรูป AI
//   แสงเงาภาพรวม = ภาพเบลอรัศมีใหญ่ เบลอเฉพาะในหน้า (region) สีผม/พื้นหลังจะได้ไม่ปน
//   หน้าจริง × (แสงรูป AI ÷ แสงหน้าจริง) -> ได้แสงข้าง/สีฉากของรูป AI แต่หน้ายังเป็นของจริง
// alpha = น้ำหนักผสมต่อ pixel 0..1 (ขอบนุ่ม), r = รัศมีเบลอ
// grain: รูป AI ที่มีเกรน (สไตล์ฟิล์ม/มือถือ) แต่หน้าจริงเรียบ -> เติม noise ให้เท่ากัน ไม่งั้นหน้าดูเหมือนแปะ
export function blendFace(dst, src, w, h, region, alpha, r) {
  const n = w * h;
  const blur = (a, rr = r) => boxBlur(boxBlur(a, w, h, rr), w, h, rr);
  const den = blur(region);
  const out = new Uint8ClampedArray(dst);
  const chD = new Float32Array(n), chS = new Float32Array(n);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) {
      chD[i] = dst[i * 4 + c] * region[i];
      chS[i] = src[i * 4 + c] * region[i];
    }
    const lowD = blur(chD), lowS = blur(chS);
    for (let i = 0; i < n; i++) {
      if (alpha[i] < 0.004) continue;
      const k = den[i] > 0.01 ? Math.min(3, Math.max(0.33, (lowD[i] + 1) / (lowS[i] + 1))) : 1;
      const v = src[i * 4 + c] * k;
      out[i * 4 + c] = dst[i * 4 + c] + (v - dst[i * 4 + c]) * alpha[i];
    }
  }

  // ความหยาบ (เกรน) = ค่าเฉลี่ยของ |ภาพ − ภาพเบลอนิดเดียว| ในหน้า
  const luma = (rgba) => Float32Array.from({ length: n }, (_, i) => lum(rgba, i * 4));
  const roughness = (L) => {
    const fine = blur(L, 1);
    let s = 0, k = 0;
    for (let i = 0; i < n; i++) if (alpha[i] > 0.9) { s += Math.abs(L[i] - fine[i]); k++; }
    return k ? s / k : 0;
  };
  const extra = roughness(luma(dst)) - roughness(luma(out));
  if (extra > 0.3) {
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      if (alpha[i] < 0.004) continue;
      const g = (Math.random() + Math.random() + Math.random() - 1.5) * extra * 2.2 * alpha[i];
      out[p] += g;
      out[p + 1] += g;
      out[p + 2] += g;
    }
  }
  return out;
}
