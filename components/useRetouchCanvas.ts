'use client';
// แสดงรูปบน canvas พร้อมแต่งรูปตามสไลเดอร์ (ทำในเครื่อง ไม่เสียเงิน) — ใช้อัลกอริทึมใน lib/vision.js + lib/beauty.js
import { useCallback, useEffect, useRef } from 'react';
import { loadImg, loadTools, type Tools } from '@/lib/browser';
import { applyFilm, filmOn, type Film } from '@/lib/film';

export const RETOUCH = ['eye', 'slim', 'acne', 'smooth', 'white'] as const;
export type RetouchId = (typeof RETOUCH)[number];
export type Amounts = Record<RetouchId, number>; // 0..100 ตามสไลเดอร์

type Point = { x: number; y: number };
type Retouch = ReturnType<Tools['prepareRetouch']>;
type Prepared = { t: Tools; r: Retouch; tones: Map<string, ReturnType<Tools['transferTone']> | null> };

export type View = {
  src: string;
  tone: string | null; // สีผิวที่เลือก (hex) null = สีเดิม
  amounts: Amounts;
  zoomed: boolean;
  original: boolean; // กดค้าง "ดูก่อนแต่ง"
  film: Film; // เกรนฟิล์ม + ลดความคม (lib/film.ts) ใส่ทีหลังสุด ไม่ต้องโหลดเครื่องมือหาหน้า
};

// กรอบรอบหน้า (รวมผมและไหล่) สำหรับซูม — ไม่เจอหน้าก็แสดงทั้งรูป
function faceRect(faces: Point[][], W: number, H: number, scale = 1) {
  if (!faces.length) return null;
  const pts = faces[0];
  const xs = pts.map((p) => p.x * scale), ys = pts.map((p) => p.y * scale);
  const fw = Math.max(...xs) - Math.min(...xs), fh = Math.max(...ys) - Math.min(...ys);
  const w = Math.min(W, fw * 3), h = Math.min(H, w * 4 / 3);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2 + fh * 0.4;
  const x = Math.round(Math.min(W - w, Math.max(0, cx - w / 2)));
  const y = Math.round(Math.min(H - h, Math.max(0, cy - h / 2)));
  return { x, y, w: Math.round(w), h: Math.round(h) };
}

// ภาพ "สีผิวใหม่ 100%" ต่อสี เก็บไว้ใช้ซ้ำ
function toneImage({ t, r, tones }: Prepared, hex: string) {
  if (!tones.has(hex)) {
    const stats = t.colorStats(r.image.data, r.masks.skin);
    const [cr, cg, cb] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    tones.set(hex, stats ? t.transferTone(r.image.data, r.masks.toneSkin, stats, t.statsFromColor(stats, cr, cg, cb)) : null);
  }
  return tones.get(hex) ?? null;
}

export function useRetouchCanvas(view: View, setStatus: (msg: string) => void) {
  const canvasRef = useRef<HTMLCanvasElement>(null); // ที่แสดงบนจอ (ทั้งรูป หรือเฉพาะหน้าตอนซูม)
  const fullRef = useRef<HTMLCanvasElement | null>(null); // รูปเต็มขนาดที่แต่งแล้ว ใช้ตอนบันทึก
  const preparedRef = useRef(new Map<string, Promise<Prepared>>());
  const showingRef = useRef(0);

  // เตรียมรูป (แยกส่วน หาหน้า ภาพเนียน จุดสิว) ครั้งเดียวต่อรูป
  const prepare = useCallback((src: string) => {
    const prepared = preparedRef.current;
    if (!prepared.has(src)) {
      prepared.set(src, (async () => {
        const t = await loadTools(setStatus);
        setStatus('กำลังหาหน้าและผิวในรูป...');
        await new Promise((r) => setTimeout(r, 30)); // ให้ข้อความขึ้นจอก่อนเริ่มคำนวณ (ใช้เวลาราว 1 วินาที)
        const cv = document.createElement('canvas');
        const image = await t.drawImageTo(cv, src);
        const r = t.prepareRetouch(cv, image);
        setStatus(r.faces.length ? '' : 'ไม่เจอหน้าในรูปนี้ — ตาโต/หน้าเรียวใช้ไม่ได้ แต่สีผิว/ผิวขาว/เนียนยังใช้ได้');
        return { t, r, tones: new Map() };
      })().catch((err) => {
        prepared.delete(src); // พัง -> แตะสไลเดอร์อีกครั้งจะลองใหม่
        console.error('เตรียมรูปสำหรับแต่งไม่สำเร็จ', err);
        throw err;
      }));
    }
    return prepared.get(src)!;
  }, [setStatus]);

  const display = useCallback(async ({ src, tone, amounts, zoomed, original, film }: View) => {
    const mine = ++showingRef.current;
    const retouched = tone !== null || Object.values(amounts).some((v) => v > 0);
    try {
      let image: HTMLImageElement | ImageData;
      if (original || !retouched) {
        image = await loadImg(src);
      } else {
        const p = await prepare(src);
        const toned = tone ? toneImage(p, tone) : null;
        // รูปเต็มตัวหน้าเล็กมาก เลื่อนตาโต/หน้าเนียนแล้วจะมองไม่ค่อยเห็น -> แนะนำให้ซูม
        const face: Point[] | undefined = p.r.faces[0];
        if (face && !zoomed) {
          const xs = face.map((pt) => pt.x);
          const small = Math.max(...xs) - Math.min(...xs) < p.r.image.width * 0.2;
          if (small && (['eye', 'slim', 'acne', 'smooth'] as const).some((id) => amounts[id] > 0)) {
            setStatus('หน้าในรูปเล็ก กด "ซูมหน้า" ใต้รูปเพื่อดูผลชัดๆ');
          }
        }
        const amt = Object.fromEntries(Object.entries(amounts).map(([k, v]) => [k, v / 100]));
        image = p.t.renderRetouch(p.r, { ...p.r.prep, tone: toned }, { ...amt, tone: toned ? 1 : 0 }, p.t.lut);
      }
      let rect = null;
      if (zoomed) {
        const { r } = await prepare(src);
        rect = faceRect(r.faces, image.width, image.height, image.width / r.image.width);
      }
      const canvas = canvasRef.current;
      if (mine !== showingRef.current || !canvas) return; // ระหว่างรอมีการกดเลือกใหม่ -> ทิ้งผลเก่า
      const full = (fullRef.current ??= document.createElement('canvas'));
      full.width = image.width;
      full.height = image.height;
      const fullCtx = full.getContext('2d')!;
      if (image instanceof ImageData) fullCtx.putImageData(image, 0, 0);
      else fullCtx.drawImage(image, 0, 0);
      // เกรน/ลดความคมใส่บนรูปเต็มขนาด (รูปที่ดาวน์โหลดได้ด้วย) — "ดูก่อนแต่ง" = รูปจาก AI ล้วน
      if (!original && filmOn(film)) {
        fullCtx.putImageData(applyFilm(fullCtx.getImageData(0, 0, full.width, full.height), film), 0, 0);
        if (mine !== showingRef.current) return;
      }
      const { x, y, w, h } = rect ?? { x: 0, y: 0, w: full.width, h: full.height };
      // ตอนซูม ส่วนที่ตัดมาเล็ก -> ขยายให้สูงเท่ารูปเต็ม จะได้แสดงเต็มกรอบ
      const s = rect ? Math.min(4, full.height / h) : 1;
      canvas.width = Math.round(w * s);
      canvas.height = Math.round(h * s);
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(full, x, y, w, h, 0, 0, canvas.width, canvas.height);
    } catch (err) {
      console.error('แต่งรูปไม่สำเร็จ', err);
      if (mine === showingRef.current) setStatus(`แต่งรูปไม่สำเร็จ: ${(err as Error).message} — ลองเลื่อนสไลเดอร์อีกครั้ง`);
    }
  }, [prepare, setStatus]);

  // เลื่อนสไลเดอร์หลายครั้งต่อเฟรม -> วาดแค่ครั้งเดียวต่อเฟรม (ค่าล่าสุด)
  const { src, tone, amounts, zoomed, original, film } = view;
  const { grain, soften } = film;
  useEffect(() => {
    const id = requestAnimationFrame(() => void display({ src, tone, amounts, zoomed, original, film: { grain, soften } }));
    return () => cancelAnimationFrame(id);
  }, [display, src, tone, amounts, zoomed, original, grain, soften]);

  return { canvasRef, fullRef, prepare };
}
