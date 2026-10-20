// film.ts — ให้รูปจาก AI ดูเป็นรูปถ่ายจริง (ทำใน browser ไม่ใช้ AI ไม่เสียเงิน) ใส่ให้ทุกรูปที่สร้างอัตโนมัติ ปรับ/ปิดได้ที่ขั้น "แต่งรูป"
// มี 2 ลุค เพราะรูปจริงสองแบบต่างกันคนละทาง:
//   film  = ลดความคม + เกรนฟิล์ม — ทดสอบ 19 ต.ค. กับรูปแฟลชบนโซฟา (ลุคนิตยสาร) GPT Image 2.5 คมจัดเกิน พอเบลอนิดๆ + เกรนแล้วดูเป็นรูปถ่าย
//          เกรนเบา = เบลอ 0.6px เกรน 5 (สไลเดอร์ ~35/45), เกรนแรงแบบนิตยสาร = เบลอ 0.9px เกรน 9 (~65/65)
//   phone = ลุคมือถือ — เทียบกับรูปจริงจาก iPhone ในฉากเดียวกัน (19 ต.ค.): มือถือคมกว่ารูป AI (ไม่ใช่นุ่มกว่า), ผนังเรียบไม่มีเกรน
//          (มือถือลด noise ให้ เหลือแค่ในเงา), สีจืดกว่า ~20%, เย็นกว่านิด, ยอมให้หน้าต่างขาวจ้า/ส่วนมืดดำสนิท
//          -> เพิ่มความคมนิดๆ ลดความอิ่มสี เพิ่มคอนทราสต์นิดๆ ใส่ noise เบามากเฉพาะในเงา (ลองปรับเย็นแล้วเย็นเกินรูปจริง ตัดออก)

export type FilmLook = 'film' | 'phone' | 'off';
export type Film = { look: FilmLook; grain: number; soften: number; phone: number }; // grain/soften/phone 0..100 ตามสไลเดอร์
export const FILM_DEFAULT: Film = { look: 'film', grain: 35, soften: 45, phone: 50 };
export const NO_FILM: Film = { look: 'off', grain: 0, soften: 0, phone: 0 };
export const filmOn = (f: Film) => (f.look === 'film' ? f.grain > 0 || f.soften > 0 : f.look === 'phone' && f.phone > 0);

const GRAIN_MAX = 14; // ความแรงเกรน (ระดับสว่าง 0..255) ที่สไลเดอร์ 100
const SOFTEN_MAX = 1.4; // รัศมีเบลอ (px) ที่สไลเดอร์ 100
const SOFT_MIX = 0.7; // ผสมภาพเบลอ 70% ภาพเดิม 30%: ขอบนุ่มลงแต่ไม่ดูหลุดโฟกัส

// เบลอเกาส์เซียนแยกแกน (แนวนอนแล้วแนวตั้ง) — รัศมีเล็ก วนลูปตรงๆ เร็วพอ
// src/dst: ช่องละ stride ตัว (RGBA = 4) ทำเฉพาะช่อง 0..channels-1
function gaussian(sigma: number) {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = Array.from({ length: r * 2 + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  const sum = k.reduce((a, b) => a + b, 0);
  return { r, k: k.map((v) => v / sum) };
}

function blur(src: ArrayLike<number>, w: number, h: number, sigma: number, stride: number, channels: number) {
  const { r, k } = gaussian(sigma);
  const tmp = new Float32Array(w * h * stride);
  const out = new Float32Array(w * h * stride);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < channels; c++) {
        let s = 0;
        for (let i = -r; i <= r; i++) {
          const xx = Math.min(w - 1, Math.max(0, x + i)); // ขอบรูป: ใช้พิกเซลขอบซ้ำ
          s += src[(y * w + xx) * stride + c] * k[i + r];
        }
        tmp[(y * w + x) * stride + c] = s;
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < channels; c++) {
        let s = 0;
        for (let i = -r; i <= r; i++) {
          const yy = Math.min(h - 1, Math.max(0, y + i));
          s += tmp[(yy * w + x) * stride + c] * k[i + r];
        }
        out[(y * w + x) * stride + c] = s;
      }
    }
  }
  return out;
}

// เกรน: สุ่มแบบกำหนด seed (เลื่อนสไลเดอร์แล้วเกรนไม่กระพริบ) แล้วเบลอนิดๆ ให้เป็นเม็ดเล็กๆ แบบฟิล์ม ไม่ใช่จุดพิกเซล
// เก็บไว้ใช้ซ้ำตามขนาดรูป (สร้างใหม่ทุกครั้งช้า)
let grainCache: { key: string; noise: Float32Array } | null = null;
function grainField(w: number, h: number) {
  const key = `${w}x${h}`;
  if (grainCache?.key === key) return grainCache.noise;
  let seed = 7;
  const rand = () => { // mulberry32
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const raw = new Float32Array(w * h);
  for (let i = 0; i < raw.length; i++) raw[i] = Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand()); // Box–Muller
  const noise = blur(raw, w, h, 0.6, 1, 1);
  for (let i = 0; i < noise.length; i++) noise[i] *= 1.6; // เบลอแล้วเกรนจางลง ชดเชยกลับ
  grainCache = { key, noise };
  return noise;
}

// แก้ ImageData ในที่ (RGBA)
export function applyFilm(img: ImageData, film: Film) {
  if (film.look === 'phone') return applyPhone(img, film.phone / 50);
  if (film.look === 'off') return img;
  const { width: w, height: h, data } = img;
  const sigma = (film.soften / 100) * SOFTEN_MAX;
  const amount = (film.grain / 100) * GRAIN_MAX;
  const soft = sigma > 0.05 ? blur(data, w, h, sigma, 4, 3) : null;
  const noise = amount > 0 ? grainField(w, h) : null;
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    if (soft) {
      r += (soft[i] - r) * SOFT_MIX;
      g += (soft[i + 1] - g) * SOFT_MIX;
      b += (soft[i + 2] - b) * SOFT_MIX;
    }
    if (noise) {
      // เกรนเฉพาะความสว่าง (ใส่เท่ากันทุกสี ไม่เป็นจุดสี) แรงสุดที่โทนกลาง ขาว/ดำจัดน้อยลง เหมือนฟิล์ม
      const lum = (r + g + b) / 765;
      const n = noise[p] * amount * (0.45 + 2.2 * lum * (1 - lum));
      r += n; g += n; b += n;
    }
    data[i] = r; data[i + 1] = g; data[i + 2] = b; // Uint8ClampedArray ปัด/ตัดให้เอง
  }
  return img;
}

// ลุคมือถือ: k = 1 ที่สไลเดอร์ 50 — จูนกับรูปจากสไตล์ Phone candid แบบใหม่ เทียบกับรูป iPhone จริงในฉากเดียวกัน (20 ต.ค.)
// ได้ใกล้รูปจริง: ความอิ่มสี คอนทราสต์ ส่วนขาวจ้า/ดำสนิท — ยังเย็นกว่ารูปจริงนิดหน่อย (รูปจริงใส่เสื้อเบจ วัดเทียบได้คร่าวๆ)
function applyPhone(img: ImageData, k: number) {
  const { width: w, height: h, data } = img;
  const sharpen = 0.05 * k; // แทบไม่เพิ่มความคม: สไตล์ Phone candid แบบใหม่ได้รูปคมเท่ามือถือจริงอยู่แล้ว (วัด 20 ต.ค.)
  const sat = Math.max(0, 1 - 0.15 * k); // สีจืดลงอีกนิดให้ใกล้รูป iPhone จริง
  const contrast = 1 + 0.06 * k; // ดำให้ดำ ขาวให้ขาว (รูป AI แทบไม่มีส่วนไหนขาวจ้า/ดำสนิท)
  const noiseAmt = 2.4 * k; // noise จาง และอยู่ในเงาเป็นหลัก (ส่วนสว่างมือถือลบ noise ออกหมด)
  const soft = sharpen > 0 ? blur(data, w, h, 1.0, 4, 3) : null;
  const noise = noiseAmt > 0 ? grainField(w, h) : null;
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    if (soft) {
      r += (r - soft[i]) * sharpen;
      g += (g - soft[i + 1]) * sharpen;
      b += (b - soft[i + 2]) * sharpen;
    }
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    r = 128 + (lum + (r - lum) * sat - 128) * contrast;
    g = 128 + (lum + (g - lum) * sat - 128) * contrast;
    b = 128 + (lum + (b - lum) * sat - 128) * contrast;
    if (noise) {
      const dark = 1 - Math.min(1, Math.max(0, lum / 255));
      const n = noise[p] * noiseAmt * (0.2 + dark * dark * 1.6);
      r += n; g += n; b += n;
    }
    data[i] = r; data[i + 1] = g; data[i + 2] = b;
  }
  return img;
}
