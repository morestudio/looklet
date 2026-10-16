// vision.js — โมเดล MediaPipe + อ่านรูป + เตรียม/วาดการแต่งรูป (ใช้ใน components/TryOn.tsx)
// ใช้ได้เฉพาะใน browser (canvas, ImageData) — TryOn โหลดไฟล์นี้ด้วย import() ตอนรันเท่านั้น
// ไฟล์ wasm ใน loadModels ต้องเวอร์ชันเดียวกับ @mediapipe/tasks-vision ใน package.json
import { FaceLandmarker, ImageSegmenter, FilesetResolver } from '@mediapipe/tasks-vision';
import {
  faceWidth, buildMasks, smoothSkin, prepareBlemish, applySkin, buildWarps, applyWarps,
  FACE_OVAL, fitSimilarity, polygonMask, blendFace, boxBlur,
} from './beauty.js';

export const MAX_SIZE = 1600; // ย่อรูปใหญ่ลงก่อน ไม่งั้นเลื่อนสไลเดอร์แล้วจะหน่วง

let landmarker, segmenter;

// โหลดโมเดล: หาจุดบนหน้า + แยกส่วน (ผิวหน้า/มือ/ผม/เสื้อ/พื้นหลัง)
export async function loadModels() {
  const fileset = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    },
    runningMode: 'IMAGE',
    numFaces: 5,
  });
  segmenter = await ImageSegmenter.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
    },
    runningMode: 'IMAGE',
    outputConfidenceMasks: true,
    outputCategoryMask: false,
  });
}

// วาดรูปลง canvas (ย่อไม่ให้เกิน MAX_SIZE หรือบังคับขนาด w,h ถ้าส่งมา)
export async function drawImageTo(cv, url, w, h) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const scale = Math.min(1, MAX_SIZE / Math.max(img.width, img.height));
  cv.width = w ?? Math.round(img.width * scale);
  cv.height = h ?? Math.round(img.height * scale);
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.drawImage(img, 0, 0, cv.width, cv.height);
  return c.getImageData(0, 0, cv.width, cv.height);
}

// โมเดลแยกส่วนคืน "ความมั่นใจ" 0..1 ต่อ pixel แยก 6 ประเภท
export function segment(cv) {
  const result = segmenter.segment(cv);
  const get = (k) => {
    const m = result.confidenceMasks[k];
    const data = m.getAsFloat32Array();
    if (m.width === cv.width && m.height === cv.height) return data.slice();
    // ขนาดไม่ตรงกับรูป -> ยืดแบบ nearest
    const out = new Float32Array(cv.width * cv.height);
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        out[y * cv.width + x] = data[Math.floor((y * m.height) / cv.height) * m.width + Math.floor((x * m.width) / cv.width)];
      }
    }
    return out;
  };
  const seg = { background: get(0), hair: get(1), bodySkin: get(2), faceSkin: get(3), clothes: get(4), others: get(5) };
  result.close();
  return seg;
}

// หาจุดบนหน้า: MediaPipe คืนพิกัดเป็น 0..1 -> แปลงเป็น pixel
// รูปเต็มตัวหน้าเล็กมาก โมเดลหาไม่เจอ -> ใช้ตำแหน่ง "ผิวหน้า" จากโมเดลแยกส่วน ตัดบริเวณหน้ามาขยายแล้วหาใหม่
export function detectFaces(cv, seg) {
  const { width: w, height: h } = cv;
  const toPx = (lm, ox, oy, sw, sh) => lm.map((p) => ({ x: ox + p.x * sw, y: oy + p.y * sh }));
  const found = landmarker.detect(cv).faceLandmarks;
  if (found.length) return found.map((lm) => toPx(lm, 0, 0, w, h));

  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (seg.faceSkin[y * w + x] < 0.5) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return [];
  const size = Math.max(x1 - x0, y1 - y0) * 2; // เผื่อพื้นที่รอบหน้า
  const sx = Math.max(0, (x0 + x1 - size) / 2), sy = Math.max(0, (y0 + y1 - size) / 2);
  const sw = Math.min(w - sx, size), sh = Math.min(h - sy, size);
  const crop = document.createElement('canvas');
  crop.width = 512;
  crop.height = Math.round((512 * sh) / sw);
  crop.getContext('2d').drawImage(cv, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
  return landmarker.detect(crop).faceLandmarks.map((lm) => toPx(lm, sx, sy, sw, sh));
}

// ---------- แต่งรูป ----------
// เตรียมของที่คำนวณครั้งเดียวต่อรูป (แยกส่วน หาหน้า mask ภาพเนียน จุดสิว) cv = canvas ที่วาดรูปไว้แล้ว
export function prepareRetouch(cv, image) {
  const { width: w, height: h } = image;
  const seg = segment(cv);
  const faces = detectFaces(cv, seg);
  const masks = buildMasks(w, h, faces, seg);
  // รัศมีปรับตามขนาดหน้า: หน้าใหญ่ใช้รัศมีใหญ่ (ไม่เจอหน้า = เดาว่าเป็นรูปเต็มตัว หน้าเล็ก)
  const fw = faces.length ? Math.max(...faces.map(faceWidth)) : w / 8;
  const smooth = smoothSkin(image.data, w, h, Math.max(2, Math.round(fw * 0.02)), 0.002);
  // รัศมีเล็ก = จับเฉพาะจุดเล็กๆ (สิว กระ) ถ้าใหญ่ไป เงาข้างจมูกจะโดนลบไปด้วย หน้าจะแบน
  const { base, spot } = prepareBlemish(image.data, masks.skin, w, h, Math.max(2, Math.round(fw * 0.012)));
  return { image, seg, faces, masks, fw, prep: { skin: masks.skin, toneSkin: masks.toneSkin, smooth, base, spot } };
}

// วาดรูปตามค่าสไลเดอร์: amt = { eye, slim, acne, smooth, tone, white } ค่า 0..1, tone ใช้ prep.tone ที่คำนวณไว้
export function renderRetouch(r, prep, amt, lut) {
  const { width: w, height: h } = r.image;
  const colored = applySkin(r.image.data, prep, amt, lut);
  return new ImageData(applyWarps(colored, w, h, buildWarps(r.faces, amt.eye, amt.slim), r.masks), w, h);
}

// ---------- คืนหน้าจริง ----------
// เอาหน้าจากรูปนางแบบ (srcUrl) มาใส่แทนหน้าที่ AI วาดใหม่ในรูปผลลัพธ์ (dstUrl)
// ใช้ได้เมื่อมุมหน้าใกล้เดิม (prompt สั่งให้คงท่าเดิมอยู่แล้ว) ถ้ามุมต่างกันมากจะไม่ทำ เพราะแปะแล้วจะเห็นเหลื่อม
const MAX_UPSCALE = 1.5;
const MAX_FIT_ERR = 0.04; // วัดจากรูปจริง: 0.003–0.033 แปะแล้วเนียน, รูป Gemini ที่หันต่างไป 0.054 แปะแล้วเห็นเป็นหน้ากาก

const biggest = (faces) => (faces.length ? faces.reduce((a, b) => (faceWidth(b) > faceWidth(a) ? b : a)) : null);

export async function pasteRealFace(srcUrl, dstUrl) {
  const S = document.createElement('canvas'), D = document.createElement('canvas');
  await drawImageTo(S, srcUrl);
  const dst = await drawImageTo(D, dstUrl);
  const segD = segment(D);
  const fs = biggest(detectFaces(S, segment(S))), fd = biggest(detectFaces(D, segD));
  if (!fs) return { error: 'หาหน้าในรูปนางแบบไม่เจอ' };
  if (!fd) return { error: 'หาหน้าในรูปที่ AI สร้างไม่เจอ' };
  const T = fitSimilarity(fs, fd);
  if (T.err > MAX_FIT_ERR) return { error: 'มุมหน้าในรูปใหม่ต่างจากรูปนางแบบเกินไป', err: T.err };
  // รูปถ่ายใกล้: หน้าในรูปใหม่ใหญ่กว่าหน้าในรูปนางแบบมาก ต้องขยายหน้าจริงจนเบลอ -> สู้หน้าจาก AI ไม่ได้
  if (Math.hypot(T.a, T.b) > MAX_UPSCALE) return { error: 'หน้าในรูปนางแบบเล็กเกินไปสำหรับรูปถ่ายใกล้ (ขยายแล้วจะเบลอ)', err: T.err };

  // วาดรูปนางแบบลงตรงตำแหน่งหน้าในรูปใหม่ (ย่อ/หมุน/เลื่อนตามที่จับคู่ได้)
  const { width: w, height: h } = dst;
  const W = document.createElement('canvas');
  W.width = w;
  W.height = h;
  const wc = W.getContext('2d', { willReadFrequently: true });
  wc.imageSmoothingQuality = 'high';
  wc.setTransform(T.a, T.b, -T.b, T.a, T.tx, T.ty);
  wc.drawImage(S, 0, 0);
  const warped = wc.getImageData(0, 0, w, h).data;

  // บริเวณที่จะแทน: ขอบหน้าหดเข้ามานิด (ขอบกราม/ไรผมของ 2 รูปไม่ตรงกันเป๊ะ) แล้วเบลอขอบให้กลืน
  // ไม่ทับเส้นผมในรูปใหม่ที่พาดหน้าอยู่
  const oval = FACE_OVAL.map((i) => T.map(fs[i]));
  const fw = faceWidth(fd);
  const region = polygonMask(w, h, oval);
  const f = Math.max(2, Math.round(fw * 0.05));
  const soft = boxBlur(boxBlur(polygonMask(w, h, oval, 0.86), w, h, f), w, h, f);
  const alpha = soft.map((v, i) => v * (1 - Math.min(1, Math.max(0, (segD.hair[i] - 0.3) / 0.4))));

  const out = blendFace(dst.data, warped, w, h, region, alpha, Math.max(3, Math.round(fw * 0.08)));
  return { image: new ImageData(out, w, h), err: T.err };
}
