// browser.ts — ตัวช่วยที่ใช้ได้เฉพาะใน browser (รูป, canvas, เรียก API ของเรา)
import type { AccessoryInfo } from './catalog';
import { applyFilm, filmOn, type Film } from './film';

// เรียก API ของเรา: error จาก server -> throw พร้อมข้อความที่ server ส่งมา
export async function api<T = { src: string }>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  // หลุดจากระบบ (session หมดอายุ) -> ไปเข้าสู่ระบบใหม่ — โหลดทั้งหน้าให้ proxy.ts ตัดสินใหม่ (ไม่ใช่ router.push)
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- ตั้งใจโหลดทั้งหน้า
  if (res.status === 401) window.location.assign('/login');
  // error ที่ไม่ได้มาจาก route ของเรา (เช่น Vercel ตอบ 413 ไฟล์ใหญ่เกิน / 504 หมดเวลา) ไม่ใช่ JSON -> บอกเป็นข้อความที่อ่านรู้เรื่อง
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || (res.status === 413 ? 'ไฟล์ใหญ่เกินไป' : res.status === 504 ? 'เซิร์ฟเวอร์ใช้เวลานานเกินไป' : `HTTP ${res.status}`));
  return out;
}

export async function loadImg(src: string) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

export const fileToBase64 = (f: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = reject;
  reader.readAsDataURL(f);
});

// ย่อรูปให้ด้านยาวไม่เกิน 1024 แล้วแปลงเป็น JPEG base64 (ส่งเล็กลง = เร็วขึ้น ถูกลง)
export async function jpegBase64(src: string, maxSide = 1024) {
  const img = await loadImg(src);
  const s = Math.min(1, maxSide / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * s);
  cv.height = Math.round(img.height * s);
  const c = cv.getContext('2d')!;
  c.fillStyle = '#fff'; // รูปสินค้าพื้นใส -> ให้เป็นพื้นขาว
  c.fillRect(0, 0, cv.width, cv.height);
  c.drawImage(img, 0, 0, cv.width, cv.height);
  return { data: cv.toDataURL('image/jpeg', 0.9).split(',')[1], w: cv.width, h: cv.height };
}

// รูปที่ "+ เพิ่มรูป": เล็กพอ -> ส่งไฟล์เดิม, ใหญ่ (เช่นรูปจากมือถือ) -> ย่อด้านยาวเหลือ 2048 ก่อน
// Vercel รับ request ได้ไม่เกิน 4.5 MB (base64 ใหญ่กว่าไฟล์ ~1/3) — PNG ใช้ WebP เก็บพื้นใสไว้ browser ทำ WebP ไม่ได้ค่อยใช้ JPEG
// ชนิดรูปที่เก็บได้ (ตรงกับ EXT ใน lib/storage.ts) — ชนิดอื่นแปลงเป็น JPEG/WebP ก่อนส่ง
const STORABLE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// รูปจาก iPhone เป็น HEIC: Chrome/Edge/Firefox เปิดไม่ได้ (Safari ได้) -> แปลงเป็น JPEG ในเครื่องก่อนทำอย่างอื่น
// ตัวแปลง (heic-to, libheif) ใหญ่ ~3 MB -> โหลดเฉพาะตอนเจอไฟล์ HEIC
export const isHeic = (f: File) => /^image\/hei[cf]/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);
export async function toWebImage(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  const { heicTo } = await import('heic-to');
  const jpeg = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
  return new File([jpeg], file.name.replace(/\.(heic|heif)$/i, '') + '.jpg', { type: 'image/jpeg' });
}

// ไฟล์เกิน 1.5 MB ย่อเหลือ 2048 ก่อนส่ง: เดิม 2.5 MB รูปมือถือส่ง base64 ~3.3 MB ผ่านเน็ตมือถือนานจนผู้ใช้นึกว่ารูปหาย (22 ต.ค.)
// AI ใช้แค่ 1024 อยู่แล้ว 2048 พอสำหรับเก็บ
export async function uploadImage(file: File, maxBytes = 1_500_000, maxSide = 2048) {
  if (file.size <= maxBytes && STORABLE.includes(file.type)) return { data: await fileToBase64(file), mime: file.type };
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const s = Math.min(1, maxSide / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * s);
    cv.height = Math.round(img.height * s);
    cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
    let mime = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
    let out = cv.toDataURL(mime, 0.9);
    if (!out.startsWith(`data:${mime}`)) out = cv.toDataURL((mime = 'image/jpeg'), 0.9);
    return { data: out.split(',')[1], mime };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// เปิดรูปนี้ได้ไหม (ชนิดไฟล์ที่ browser ไม่รู้จัก -> การ์ดจะเป็นรูปเสีย ดูเหมือนรูปหาย)
export async function canOpenImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    await loadImg(url);
    return true;
  } catch {
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- ดาวน์โหลดรูป ----------
// browser ในแอป (LINE, IG, Facebook, TikTok) ดาวน์โหลดไฟล์ไม่ได้ ปุ่มกดแล้วเงียบ -> ให้กดค้างที่รูปบันทึกแทน
export const inAppBrowser = () => /\bLine\/|FBAN|FBAV|Instagram|TikTok|musical_ly|KAKAOTALK/i.test(navigator.userAgent);

// รูปเต็มขนาด + ลุคฟิล์ม/มือถือ (lib/film.ts) วาดจากไฟล์รูปเลย ใช้ตอนกล่องแต่งรูปยังไม่ได้วาดรูปนี้ (เช่น แต่งหน้าพังบน browser ที่ไม่มี WebAssembly)
export async function finishedCanvas(src: string, film: Film) {
  const img = await loadImg(src);
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth;
  cv.height = img.naturalHeight;
  const c = cv.getContext('2d')!;
  c.drawImage(img, 0, 0);
  if (filmOn(film)) c.putImageData(applyFilm(c.getImageData(0, 0, cv.width, cv.height), film), 0, 0);
  return cv;
}

export const canvasJpeg = (cv: HTMLCanvasElement, quality = 0.92) => new Promise<Blob>((resolve, reject) =>
  cv.toBlob((b) => (b ? resolve(b) : reject(new Error('สร้างไฟล์รูปไม่ได้'))), 'image/jpeg', quality));

// มือถือ: เปิดหน้าแชร์ ("บันทึกรูปภาพ" ลงคลังรูป — iPhone ดาวน์โหลดไฟล์แล้วไปอยู่ในแอปไฟล์ หาไม่เจอ) · คอมพิวเตอร์: ดาวน์โหลดไฟล์
// ลิงก์ต้องอยู่ในหน้าเว็บตอนกด และใช้ blob ไม่ใช้ data URL (บาง browser ไม่ดาวน์โหลด data URL หรือ a ที่ไม่ได้อยู่ในหน้า)
export async function saveImageFile(blob: Blob, name: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], name, { type: blob.type });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled'; // ผู้ใช้ปิดหน้าแชร์เอง
      // แชร์ไม่ได้ (เช่น หมดเวลากดของ browser) -> ดาวน์โหลดแทน
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}

// สัดส่วนรูปที่แต่ละเจ้ารับได้ เลือกอันที่ใกล้รูปนางแบบที่สุด
export function geminiAspect(w: number, h: number) {
  const diff = (a: string) => {
    const [x, y] = a.split(':').map(Number);
    return Math.abs(Math.log(x / y / (w / h)));
  };
  return ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9'].reduce((best, a) => (diff(a) < diff(best) ? a : best));
}
export const openaiSize = (w: number, h: number) => (w / h < 0.85 ? '1024x1536' : w / h > 1.18 ? '1536x1024' : '1024x1024');

// ให้ AI ดูรูปของเสริม/สินค้าว่าเป็นอะไร + ตั้งชื่อ — ดูไม่ออก/เรียกไม่ได้ = null (ให้ผู้ใช้เลือกเอง)
async function guessItem(src: string, route: string): Promise<AccessoryInfo | null> {
  try {
    const { data } = await jpegBase64(src, 768); // ดูแค่ว่าเป็นอะไร ไม่ต้องละเอียด ส่งเล็กลง = เร็วขึ้น
    const g = await api<{ type: string | null; name: string | null }>(route, { data });
    return g.type && g.name ? { type: g.type, name: g.name } : null;
  } catch (err) {
    console.warn('AI ดูรูปไม่สำเร็จ', err);
    return null;
  }
}
export const guessAccessory = (src: string) => guessItem(src, '/api/detect-accessory');
export const guessProduct = (src: string) => guessItem(src, '/api/detect-product'); // หน้าสินค้า: ประเภทใน PRODUCT_TYPES

// ---------- เครื่องมือแต่งรูป (MediaPipe): โหลดครั้งเดียวต่อหน้า เฉพาะตอนจะใช้ หน้าเว็บจะได้เปิดเร็ว ----------

// MediaPipe (wasm) พิมพ์ log ปกติผ่าน console.error เช่น "INFO: Created TensorFlow Lite XNNPACK delegate for CPU."
// หรือ "W1007 07:04:23.337000 ... gl_context_webgl.cc" -> Next.js โหมดพัฒนาขึ้นกรอบแดงว่า error ทั้งที่ไม่ใช่
// ย้ายเฉพาะ log แบบนี้ (INFO / I / W) ไป console.debug ส่วน error จริง (E....) ยังขึ้นตามปกติ
const MEDIAPIPE_LOG = /^(INFO: |[IW]\d{4} \d\d:\d\d:\d\d)/;
let logFilterOn = false;
function quietMediapipeLogs() {
  if (logFilterOn) return;
  logFilterOn = true;
  const error = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && MEDIAPIPE_LOG.test(args[0])) console.debug(...args);
    else error(...args);
  };
}

async function importTools() {
  quietMediapipeLogs();
  const [v, b] = await Promise.all([import('./vision.js'), import('./beauty.js')]);
  await v.loadModels();
  return { ...v, ...b, lut: b.defaultWhiteLut() };
}
export type Tools = Awaited<ReturnType<typeof importTools>>;

let tools: Promise<Tools> | null = null;
export function loadTools(setStatus: (msg: string) => void) {
  tools ??= (async () => {
    setStatus('กำลังโหลดเครื่องมือแต่งรูป... (ครั้งแรกประมาณ 5–20 วินาที)');
    const t = await importTools();
    setStatus('');
    return t;
  })().catch((err) => {
    tools = null; // โหลดไม่สำเร็จ -> แตะสไลเดอร์อีกครั้งจะลองใหม่
    console.error('โหลดเครื่องมือแต่งรูปไม่สำเร็จ', err);
    throw err;
  });
  return tools;
}
