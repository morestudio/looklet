// browser.ts — ตัวช่วยที่ใช้ได้เฉพาะใน browser (รูป, canvas, เรียก API ของเรา)
import type { AccessoryInfo } from './catalog';

// เรียก API ของเรา: error จาก server -> throw พร้อมข้อความที่ server ส่งมา
export async function api<T = { src: string }>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json();
  if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);
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

// สัดส่วนรูปที่แต่ละเจ้ารับได้ เลือกอันที่ใกล้รูปนางแบบที่สุด
export function geminiAspect(w: number, h: number) {
  const diff = (a: string) => {
    const [x, y] = a.split(':').map(Number);
    return Math.abs(Math.log(x / y / (w / h)));
  };
  return ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9'].reduce((best, a) => (diff(a) < diff(best) ? a : best));
}
export const openaiSize = (w: number, h: number) => (w / h < 0.85 ? '1024x1536' : w / h > 1.18 ? '1536x1024' : '1024x1024');

// ให้ AI ดูรูปของเสริมว่าเป็นอะไร + ตั้งชื่อ — ดูไม่ออก/เรียกไม่ได้ = null (ให้ผู้ใช้เลือกเอง)
export async function guessAccessory(src: string): Promise<AccessoryInfo | null> {
  try {
    const { data } = await jpegBase64(src, 768); // ดูแค่ว่าเป็นอะไร ไม่ต้องละเอียด ส่งเล็กลง = เร็วขึ้น
    const g = await api<{ type: string | null; name: string | null }>('/api/detect-accessory', { data });
    return g.type && g.name ? { type: g.type, name: g.name } : null;
  } catch (err) {
    console.warn('AI ดูรูปของเสริมไม่สำเร็จ', err);
    return null;
  }
}

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
