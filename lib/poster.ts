// poster.ts — หน้าโปสเตอร์ (/poster ต้นแบบ 20 พ.ย., docs/poster-plan.md)
// ผู้ใช้เลือก รูปตัวหลัก (สินค้า/อาหาร/คน) + ฉากหลัง (ฉากสำเร็จรูป หรือรูปฉากของตัวเอง) + กราฟิกข้อความ (เทมเพลต วางตำแหน่งเอง)
// -> ส่งตำแหน่งกราฟิกให้ AI (แผนผัง: พื้นที่สีฟ้า) -> AI สร้างทั้งภาพ (ตัวหลักอยู่ในฉาก) โดยเว้นที่กราฟิกไว้เรียบๆ
// -> หน้าเว็บวางกราฟิกทับภาพที่ได้ = โปสเตอร์เสร็จ (ตัวอักษรวาดด้วยฟอนต์จริง ภาษาไทยไม่เพี้ยน แก้คำได้ฟรีไม่ต้องสร้างใหม่)
// ใช้ได้ทั้ง browser และ server (ไม่มี DOM) · ตัววาดลง canvas: lib/poster-draw.ts · พรอมต์: lib/poster-prompts.ts

import { PLATFORM_ASPECTS } from './aspects';

export type Rect = { x: number; y: number; w: number; h: number }; // สัดส่วน 0..1 ของกว้าง / สูงโปสเตอร์

export const POSTER_ASPECTS = PLATFORM_ASPECTS;
export const isPosterAspect = (a: unknown): a is string => PLATFORM_ASPECTS.some((x) => x.id === a);
export const aspectRatio = (aspect: string) => {
  const [w, h] = aspect.split(':').map(Number);
  return w / h;
};

// ---------- ตำแหน่งข้อความ: พื้นที่ใหญ่เท่านั้น (AI ทำตาม "ส่วนบนหนึ่งในสี่" ได้ แต่กล่องเล็กเป๊ะๆ ไม่ได้) ----------
export const ZONE_IDS = ['top', 'bottom', 'left', 'right'] as const;
export type ZoneId = (typeof ZONE_IDS)[number];
export const isZone = (z: unknown): z is ZoneId => ZONE_IDS.includes(z as ZoneId);

// ภาพแนวตั้งยาว (9:16, 2:3) แถบบน/ล่างเตี้ยลง · ภาพแนวนอนให้แถบข้างแคบลง
export function zoneRect(zone: ZoneId, aspect: string): Rect {
  const r = aspectRatio(aspect);
  const band = r < 0.7 ? 0.24 : r > 1.2 ? 0.34 : 0.3;
  const side = r > 1.2 ? 0.42 : 0.46;
  if (zone === 'top') return { x: 0.05, y: 0.04, w: 0.9, h: band };
  if (zone === 'bottom') return { x: 0.05, y: 0.96 - band, w: 0.9, h: band };
  if (zone === 'left') return { x: 0.04, y: 0.1, w: side, h: 0.8 };
  return { x: 0.96 - side, y: 0.1, w: side, h: 0.8 };
}

// ---------- ตำแหน่งกราฟิก (ปรับเองได้อิสระ ผู้ใช้ 23 พ.ย.): ลากย้าย · มุม = ขนาด · ด้านข้าง = ความกว้าง · จัดชิดซ้าย/กลาง/ขวา ----------
// x, y = จุดกลางกรอบ (สัดส่วนของโปสเตอร์) · w = ความกว้างกรอบที่เห็น (ข้อความตัดบรรทัดตามนี้) · size = ขนาด (เท่า)
// แต่ละแบบเริ่มที่ zone แรกของแบบนั้น (startPlace) · ภาพที่เก็บก่อน 23 พ.ย. เก็บแบบ { zone, dx, dy } แปลงด้วย legacyPlace (วาดออกมาเหมือนเดิม)
export const ALIGNS = ['left', 'center', 'right'] as const;
export type Align = (typeof ALIGNS)[number];
export const isAlign = (a: unknown): a is Align => ALIGNS.includes(a as Align);
export type GraphicPlace = { x: number; y: number; w: number; size: number; align: Align };
export const SIZE_MIN = 0.3;
export const SIZE_MAX = 3;
export const WIDTH_MIN = 0.12;
export const WIDTH_MAX = 2; // กรอบเลยขอบโปสเตอร์ได้ (ตัวกราฟิกเองถูกดันให้อยู่ในโปสเตอร์ตอนวาด)
// กรอบก่อนขยาย (w / size) กว้างตั้งแต่นี้ = จัดแบบแถบกว้าง (ป้ายดาวข้างข้อความ ฯลฯ) ไม่งั้นแบบคอลัมน์ · แทนปุ่มด้านบน/ด้านล่าง/ข้าง เดิม
export const WIDE_MIN = 0.6;

const alignOf = (zone: ZoneId): Align => (zone === 'left' ? 'left' : zone === 'right' ? 'right' : 'center');
const centreOf = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export function startPlace(zone: ZoneId, aspect: string): GraphicPlace {
  const z = zoneRect(zone, aspect);
  return { ...centreOf(z), w: z.w, size: 1, align: alignOf(zone) };
}

// แบบเก่า: กรอบของ zone เลื่อนได้แต่ไม่หลุดขอบ (clampPlace เดิม) -> จุดกลาง/ความกว้างเดียวกัน
export function legacyPlace(zone: ZoneId, dx: number, dy: number, aspect: string): GraphicPlace {
  const z = zoneRect(zone, aspect);
  const box = {
    ...z,
    x: z.x + Math.min(1 - z.x - z.w, Math.max(-z.x, dx)),
    y: z.y + Math.min(1 - z.y - z.h, Math.max(-z.y, dy)),
  };
  return { ...centreOf(box), w: z.w, size: 1, align: alignOf(zone) };
}

// กรอบที่ใช้จัดข้อความ (ก่อนขยายตาม size; สัดส่วนของโปสเตอร์) · สูงเท่าแถบ/คอลัมน์ของเดิม ไม่เห็นบนจอ ใช้แค่จำกัดขนาด
export function layoutFrame(place: GraphicPlace, aspect: string) {
  const w = place.w / place.size;
  const wide = w >= WIDE_MIN - 1e-9;
  return { w, h: zoneRect(wide ? 'top' : 'left', aspect).h, wide };
}

const clampNum = (n: unknown, lo: number, hi: number, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
// ค่าจากหน้าเว็บ/ที่เก็บไว้ -> ค่าที่ใช้ได้ · null = ไม่ใช่ตำแหน่ง
export function readPlace(v: unknown, aspect: string): GraphicPlace | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (isZone(o.zone)) return legacyPlace(o.zone, clampNum(o.dx, -1, 1, 0), clampNum(o.dy, -1, 1, 0), aspect);
  if (typeof o.x !== 'number' || typeof o.y !== 'number') return null;
  return {
    x: round4(clampNum(o.x, -1, 2, 0.5)),
    y: round4(clampNum(o.y, 0, 1, 0.5)),
    w: round4(clampNum(o.w, WIDTH_MIN, WIDTH_MAX, 0.9)),
    size: round4(clampNum(o.size, SIZE_MIN, SIZE_MAX, 1)),
    align: isAlign(o.align) ? o.align : 'center',
  };
}

// พื้นที่ที่ส่งให้ AI เว้นว่าง = กราฟิกที่วาดจริง + ขอบเผื่อ 3% ของด้านสั้น (ตัวอักษรไม่ชิดของในภาพ)
export function reservedArea(bounds: Rect, aspect: string): Rect {
  const r = aspectRatio(aspect);
  const mx = r <= 1 ? 0.03 : 0.03 / r;
  const my = r <= 1 ? 0.03 * r : 0.03;
  const x = Math.max(0, bounds.x - mx),
    y = Math.max(0, bounds.y - my);
  return {
    x,
    y,
    w: Math.min(1, bounds.x + bounds.w + mx) - x,
    h: Math.min(1, bounds.y + bounds.h + my) - y,
  };
}

// หลายชิ้น (แต่ละชิ้นย้ายแยกกันได้): ที่ว่างต่อชิ้น · ชิ้นที่ชิด/ทับกันรวมเป็นกรอบเดียว (ไม่ให้ AI ได้กรอบเล็กๆ ติดกันหลายอัน)
export function reservedAreas(bounds: Rect[], aspect: string): Rect[] {
  let list = bounds.map((b) => reservedArea(b, aspect));
  const touch = (a: Rect, b: Rect) => a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
  const union = (a: Rect, b: Rect): Rect => {
    const x = Math.min(a.x, b.x),
      y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  };
  for (let merged = true; merged;) {
    merged = false;
    outer: for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        if (touch(list[i], list[j])) {
          list = [...list.filter((_, k) => k !== i && k !== j), union(list[i], list[j])];
          merged = true;
          break outer;
        }
  }
  // บนลงล่าง ซ้ายไปขวา (ลำดับคงที่ = key เดิมเมื่อไม่ได้ขยับ)
  return list.sort((a, b) => a.y - b.y || a.x - b.x);
}

// บอกตำแหน่งเป็นคำด้วย (นอกจากรูปแผนผัง): AI ทำตามคำ + รูปได้ดีกว่ารูปอย่างเดียว
const pct = (v: number) => `${Math.round(v * 100)}%`;
export function areaWords(a: Rect) {
  const cx = a.x + a.w / 2,
    cy = a.y + a.h / 2;
  const v = cy < 0.4 ? 'top' : cy > 0.6 ? 'bottom' : 'middle';
  const h = cx < 0.4 ? 'left' : cx > 0.6 ? 'right' : 'center';
  const where =
    a.w >= 0.7
      ? `a band across the ${v === 'middle' ? 'middle' : v} of the frame`
      : a.h >= 0.6
        ? `a column down the ${h === 'center' ? 'center' : `${h} side`} of the frame`
        : `the ${v === 'middle' && h === 'center' ? 'center' : v === 'middle' ? `${h} side` : h === 'center' ? v : `${v} ${h}`} of the frame`;
  return `${where} (from ${pct(a.x)} to ${pct(a.x + a.w)} of the width and from ${pct(a.y)} to ${pct(a.y + a.h)} of the height)`;
}
const isUnit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
export const isArea = (a: unknown): a is Rect => {
  const r = a as Rect;
  return (
    !!r && [r.x, r.y, r.w, r.h].every(isUnit) && r.w >= 0.05 && r.h >= 0.03 && r.x + r.w <= 1.001 && r.y + r.h <= 1.001
    // ไม่จำกัดขนาดแล้ว (ผู้ใช้ 26 พ.ย.): เดิมห้ามเกิน 60% ของภาพ แต่กราฟิกโปรแบบ Canva (โปร 1 แถม 1 + ราคา) กินที่มากโดยตั้งใจ
  );
};
export const MAX_AREAS = 12; // 6 จนถึง 26 พ.ย.: กราฟิกโปร (promo) ที่ 9:16 แยกเป็น 7 ที่
// ที่ที่ผู้ใช้วางตัวหลักคร่าวๆ (กรอบรวมของตัวหลักทุกชิ้น ตัดให้อยู่ในโปสเตอร์แล้ว) · ส่งเป็นคำให้อาร์ตไดเรกเตอร์ (23 พ.ย.)
export const isHint = (a: unknown): a is Rect => {
  const r = a as Rect;
  return (
    !!r && [r.x, r.y, r.w, r.h].every(isUnit) && r.w >= 0.02 && r.h >= 0.02 && r.x + r.w <= 1.001 && r.y + r.h <= 1.001
  );
};
export const isAreas = (v: unknown): v is Rect[] =>
  Array.isArray(v) && v.length >= 1 && v.length <= MAX_AREAS && v.every(isArea);

// ---------- ตรวจพื้นตรงข้อความหลังได้ฉาก (ไม่เรียก AI): สว่าง/มืด · ต่างกันมากไหม · ขอบเยอะไหม ----------
export type ZoneCheck = {
  mean: number; // ความสว่างเฉลี่ย 0..1
  spread: number; // ส่วนเบี่ยงเบนมาตรฐานของความสว่าง
  edges: number; // สัดส่วนพิกเซลที่มีขอบชัด
  ink: 'dark' | 'light'; // ตัวอักษรสีเข้ม (พื้นสว่าง) / สีขาว (พื้นมืด)
  busy: boolean; // พื้นยุ่ง (ลาย ของ ขอบเยอะ) · กราฟิกไม่มีพื้นรอง (ผู้ใช้ 20 พ.ย.): บอกในหน้าเว็บเท่านั้น
};
const BUSY_SPREAD = 0.17;
const BUSY_EDGES = 0.08;
const EDGE_STEP = 0.1;
export function zoneStats(rgba: ArrayLike<number>, width: number, height: number, rect: Rect): ZoneCheck {
  const x0 = Math.max(0, Math.floor(rect.x * width));
  const x1 = Math.min(width, Math.ceil((rect.x + rect.w) * width));
  const y0 = Math.max(0, Math.floor(rect.y * height));
  const y1 = Math.min(height, Math.ceil((rect.y + rect.h) * height));
  const lum = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255;
  };
  let n = 0,
    sum = 0,
    sum2 = 0,
    edge = 0,
    edgeN = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const l = lum(x, y);
      sum += l;
      sum2 += l * l;
      n++;
      if (x + 1 < x1 && y + 1 < y1) {
        edgeN++;
        if (Math.abs(l - lum(x + 1, y)) + Math.abs(l - lum(x, y + 1)) > EDGE_STEP) edge++;
      }
    }
  const mean = n ? sum / n : 1;
  const spread = n ? Math.sqrt(Math.max(0, sum2 / n - mean * mean)) : 0;
  const edges = edgeN ? edge / edgeN : 0;
  const busy = spread > BUSY_SPREAD || edges > BUSY_EDGES;
  return { mean, spread, edges, ink: mean > 0.55 ? 'dark' : 'light', busy };
}

// ---------- เทมเพลตข้อความ ----------
export type FieldId =
  | 'kicker'
  | 'title'
  | 'accent'
  | 'sub'
  | 'badge'
  | 'price'
  | 'oldPrice'
  | 'bullet1'
  | 'bullet2'
  | 'bullet3'
  | 'price1'
  | 'price2'
  | 'price3'
  | 'footer'
  | 'date';
export type PosterField = { id: FieldId; label: string; sample: string; max: number };
export type TemplateGroup = 'food' | 'ecommerce' | 'general';

// ฟอนต์ข้อความบนโปสเตอร์ (สไตล์ไทยจาก Google Fonts · ใช้เชิงพาณิชย์ได้ฟรี OFL/Apache)
export type PosterFontSpecDef = {
  id: 'kanit' | 'chakra' | 'mali' | 'pattaya' | 'serif' | 'plex' | 'pridi';
  name: string;
  note: string;
  display: string;
  body: string;
};
export const POSTER_FONTS: PosterFontSpecDef[] = [
  { id: 'kanit', name: 'คณิต', note: 'ป้ายโปรหนา', display: 'Kanit', body: 'Kanit' },
  { id: 'chakra', name: 'จักรเพชร', note: 'เทค / สเปก', display: 'Chakra Petch', body: 'Chakra Petch' },
  { id: 'mali', name: 'มะลิ', note: 'คาเฟ่น่ารัก', display: 'Mali', body: 'Mali' },
  { id: 'pattaya', name: 'พัทยา', note: 'พู่กันไทย', display: 'Pattaya', body: 'Mitr' },
  { id: 'serif', name: 'ชลบุรี', note: 'พรีเมียมหรู', display: 'Chonburi', body: 'Noto Serif Thai' },
  { id: 'plex', name: 'ไอบีเอ็ม', note: 'คลีนขายของ', display: 'IBM Plex Sans Thai', body: 'IBM Plex Sans Thai' },
  { id: 'pridi', name: 'ปรีดี', note: 'ตัวพิมพ์ย้อนยุค', display: 'Pridi', body: 'IBM Plex Sans Thai' },
];
export type PosterFontId = PosterFontSpecDef['id'];
export const isPosterFont = (v: unknown): v is PosterFontId => POSTER_FONTS.some((f) => f.id === v);
export const fontDefOf = (id?: string) => POSTER_FONTS.find((f) => f.id === id) ?? POSTER_FONTS[0];

// สไตล์ตัวอักษรแบบงานโฆษณา / Photoshop Layer Styles (ขอบสติ๊กเกอร์ · นูน 3 มิติ · ไล่สีเงา · เรืองแสง · เอียงมีพลัง)
export const POSTER_EFFECTS = [
  { id: 'clean', name: 'เรียบคม', note: 'ตัวอักษรคม ไม่มีเงา' },
  { id: 'sticker', name: 'ขอบสติ๊กเกอร์', note: 'ขอบหนา + เงานุ่ม สไตล์ป้ายยา/คาเฟ่' },
  { id: 'pop3d', name: 'นูน 3 มิติ', note: 'เงานูนหลายชั้น สไตล์ป้ายโปรแรง' },
  { id: 'metallic', name: 'ไล่สีเงา', note: 'ไล่สีทอง/เมทัลลิก พรีเมียม' },
  { id: 'glow', name: 'เรืองแสง', note: 'แสงเรืองขอบ สไตล์เทค/พื้นมืด' },
  { id: 'tilt', name: 'เอียงมีพลัง', note: 'เอียง -3.5° + ขอบสติ๊กเกอร์' },
] as const;
export type PosterEffectId = (typeof POSTER_EFFECTS)[number]['id'];
export const isPosterEffect = (v: unknown): v is PosterEffectId => POSTER_EFFECTS.some((e) => e.id === v);
export const effectDefOf = (id?: string) => POSTER_EFFECTS.find((e) => e.id === id) ?? POSTER_EFFECTS[0];

// sections = ชิ้นของกราฟิกที่ย้าย/ปรับขนาดแยกกันได้ (ผู้ใช้ 23 พ.ย.) ตามลำดับที่วาด · rule = เส้นคั่น (ไม่มีช่องข้อความ)
export type SectionId = FieldId | 'rule';
export type PosterTemplate = {
  id: string;
  group?: TemplateGroup;
  alsoIn?: TemplateGroup;
  defaultFont?: PosterFontId;
  defaultEffect?: PosterEffectId;
  name: string;
  note: string;
  zones: readonly ZoneId[];
  fields: PosterField[];
  sections: readonly SectionId[];
  // ชิ้นที่อยู่หลังตัวหลัก (ผู้ใช้ 27 พ.ย. ชื่อศิลปินตัวยักษ์หลังตัวคน): วาดก่อนตัวหลัก · หลังสร้างภาพ ตัดคนจากภาพ AI (ในเบราว์เซอร์ ฟรี) วาดทับ
  // · ไม่อยู่ในที่ว่างที่ให้ AI เว้น (ตัวหลักบังได้ ศีรษะด้วย) แต่บอก AI ให้พื้นตรงนั้นเรียบ (behind ใน /api/poster)
  behind?: readonly SectionId[];
};

// ข้อความตัวอย่างใส่ไว้ให้ก่อน (ลูกค้าไม่อยากพิมพ์) · ขั้นถัดไป (P3) ให้ AI เขียนให้จากรูป + โอกาส
export const POSTER_TEMPLATES: PosterTemplate[] = [
  {
    id: 'pill',
    group: 'food',
    defaultEffect: 'sticker',
    name: 'ป้ายแคปซูล',
    note: 'หัวข้อตัวหนาในป้าย มีขีดประกาย สนุก สดใส',
    zones: ['top', 'bottom'],
    sections: ['title', 'sub'],
    fields: [
      { id: 'title', label: 'หัวข้อ', sample: 'เมนูใหม่!', max: 16 },
      { id: 'sub', label: 'บรรทัดรอง', sample: 'ข้าวมันไก่ต้ม สูตรต้นตำรับ', max: 40 },
    ],
  },
  {
    id: 'event',
    group: 'general',
    defaultFont: 'serif',
    defaultEffect: 'metallic',
    name: 'อีเวนต์',
    note: 'ชื่องานตัวใหญ่ คำรองเอียงสีเด่น วันที่ชัด',
    zones: ['bottom', 'top'],
    sections: ['kicker', 'title', 'date'], // ชื่องาน + คำรอง = ชิ้นเดียว (คำรองวางทับมุมชื่องาน)
    fields: [
      { id: 'kicker', label: 'คำโปรย', sample: 'ค่ำคืนแห่งเสียงเพลงริมแม่น้ำ', max: 48 },
      { id: 'title', label: 'ชื่องาน', sample: 'Soul', max: 12 },
      { id: 'accent', label: 'คำรอง', sample: 'Live Music', max: 20 },
      { id: 'date', label: 'วันที่', sample: '2 ธันวาคม 2569', max: 30 },
    ],
  },
  // เมนูเด่น ราคาตัวโต (ผู้ใช้ 26 พ.ย. จากงาน Canva ของผู้ใช้ แนวตั้ง พื้นดำ: สเต็กเนื้อ 99.- / แถบพู่กัน อร่อยจัดเต็ม)
  // ฟอนต์ในงานเดิม: UID แท็บ (ชื่อ/ราคา) + Was KamuiNP (ลายมือ) · ใช้ชุดพัทยา: Pattaya (ลายมือ) + Mitr (หนากลม) แทน
  {
    id: 'bigprice',
    group: 'food',
    defaultFont: 'pattaya',
    defaultEffect: 'clean',
    name: 'เมนูเด่น ราคาตัวโต',
    note: 'ชื่อเมนูขอบดำ ราคาใหญ่ แถบพู่กัน เหมาะกับ Story 9:16',
    zones: ['top', 'bottom'],
    sections: ['badge', 'title', 'price', 'kicker', 'sub', 'date', 'footer'],
    fields: [
      { id: 'badge', label: 'โลโก้ / ชื่อร้าน', sample: 'LOGO', max: 12 },
      { id: 'title', label: 'ชื่อเมนู', sample: 'สเต็กเนื้อ', max: 16 },
      { id: 'price', label: 'ราคา', sample: '99.-', max: 8 },
      { id: 'kicker', label: 'คำบนแถบพู่กัน', sample: 'อร่อยจัดเต็ม', max: 18 },
      { id: 'sub', label: 'บรรทัดรอง', sample: 'เปิดทุกวัน', max: 30 },
      { id: 'date', label: 'เวลา', sample: 'เวลา 08.00-18.00 น.', max: 30 },
      { id: 'footer', label: 'เว็บไซต์ / ช่องทาง', sample: 'REALLYGREATSITE.COM', max: 36 },
    ],
  },
  // โปร 1 แถม 1 + ป้ายราคา (ผู้ใช้ 26 พ.ย. จากงาน Canva ของผู้ใช้: ดีลพิเศษรับเดือนธันวาคม / BUY GET 1 FREE / วงกลมราคา)
  // หัวข้อบน · ข้อเสนอตัวโต (คำเล็กสองบรรทัด + ตัวเลขสีทอง + คำใหญ่) · ป้ายของแถม · วงกลมราคา · ข้อความล่างซ้าย · แถวดาวขอบล่าง
  {
    id: 'promo',
    group: 'food',
    alsoIn: 'ecommerce',
    defaultFont: 'kanit',
    defaultEffect: 'clean',
    name: 'โปร 1 แถม 1 + ราคา',
    note: 'ข้อเสนอตัวโต ตัวเลขสีทอง วงกลมราคา ป้ายของแถม',
    zones: ['top', 'bottom'],
    sections: ['kicker', 'badge', 'bullet3', 'price', 'title', 'footer', 'rule'],
    fields: [
      { id: 'kicker', label: 'หัวข้อบน', sample: 'ดีลพิเศษรับเดือนธันวาคม', max: 30 },
      { id: 'bullet1', label: 'คำเล็กบรรทัดบน', sample: 'BUY', max: 6 },
      { id: 'bullet2', label: 'คำเล็กบรรทัดล่าง', sample: 'GET', max: 6 },
      { id: 'accent', label: 'ตัวเลข', sample: '1', max: 3 },
      { id: 'badge', label: 'คำใหญ่', sample: 'FREE', max: 8 },
      { id: 'bullet3', label: 'ป้ายบนของแถม', sample: 'FREE', max: 12 },
      { id: 'sub', label: 'ข้อความในวงกลม', sample: 'อร่อยคุ้ม เริ่มต้นเพียง', max: 30 },
      { id: 'price', label: 'ราคา', sample: '140.-', max: 9 },
      { id: 'title', label: 'ข้อความล่าง', sample: 'อร่อยกับสเต็กทุกเมนู รับสลัดฟรีทันที!', max: 48 },
      { id: 'footer', label: 'บรรทัดเล็กล่าง', sample: 'โปรโมชันตลอดเดือนธันวาคม', max: 40 },
    ],
  },
  // ศิลปินแสดงสด ชื่อยักษ์หลังตัว (ผู้ใช้ 27 พ.ย. จากโปสเตอร์ Atom live at Thirdpark): ชื่อตัวหนาใหญ่เต็มกว้างสองบรรทัดเหลื่อมกัน
  // อยู่หลังตัวคน · ชื่อเล็ก + ชื่อเต็มภาษาไทย · งาน/สถานที่ · เส้นคั่น · วันที่ตัวโต + วัน/เดือนปี · คอลัมน์ช่องทางขวาล่าง
  {
    id: 'artist',
    group: 'general',
    defaultFont: 'kanit',
    defaultEffect: 'clean',
    name: 'ศิลปิน ชื่อยักษ์หลังตัว',
    note: 'ชื่อตัวโตอยู่หลังตัวคน วันที่และช่องทางด้านล่าง เหมาะกับฉากเรียบ',
    zones: ['top', 'bottom'],
    sections: ['title', 'sub', 'kicker', 'rule', 'date', 'footer'],
    behind: ['title'],
    fields: [
      { id: 'title', label: 'ชื่อศิลปิน', sample: 'Atom', max: 12 },
      { id: 'sub', label: 'ชื่อเต็ม (ตัวเล็ก)', sample: 'อะตอม ชนกันต์', max: 30 },
      { id: 'kicker', label: 'งาน / สถานที่', sample: 'LIVE AT THIRDPARK', max: 30 },
      { id: 'date', label: 'วันที่ (ตัวเลข)', sample: '26', max: 3 },
      { id: 'bullet1', label: 'วัน', sample: 'WEDNESDAY', max: 12 },
      { id: 'bullet2', label: 'เดือน ปี', sample: 'NOV 2025', max: 14 },
      { id: 'price1', label: 'ช่องทาง (ตัวเล็ก)', sample: 'FACEBOOK INSTAGRAM', max: 30 },
      { id: 'footer', label: 'ชื่อร้าน', sample: 'THIRDPARK BAKE AND BAR', max: 30 },
      { id: 'price', label: 'เบอร์โทร', sample: '089 703 7777', max: 16 },
      { id: 'price2', label: 'LINE', sample: 'LINE OFFICIAL ACCOUNT @BAKEANDBAR', max: 40 },
    ],
  },
  // โปสเตอร์ดนตรี (ผู้ใช้ 25 พ.ย. จากตัวอย่าง Atlanta Jazz Festival / Nina Simone): ตัวบีบแคบตัวโต แผ่นป้าย ดาว ลูกศร เส้นจุด
  {
    id: 'concert',
    group: 'general',
    defaultFont: 'chakra',
    name: 'คอนเสิร์ตย้อนยุค',
    note: 'วันที่ตัวโตมีดาว ป้ายสถานที่ ชื่องานบนแผ่นป้าย แบบโปสเตอร์ดนตรีวินเทจ',
    zones: ['bottom', 'top'],
    sections: ['date', 'sub', 'kicker', 'rule', 'title', 'footer'],
    fields: [
      { id: 'date', label: 'วันที่', sample: '2 ธันวาคม 2569', max: 30 },
      { id: 'sub', label: 'สถานที่', sample: 'ริมแม่น้ำเจ้าพระยา · กรุงเทพฯ', max: 40 },
      { id: 'kicker', label: 'แนวเพลง / รายละเอียด', sample: 'Live Music • Soul • Jazz • Food', max: 60 },
      { id: 'title', label: 'ชื่องาน', sample: 'Soul After Six', max: 24 },
      { id: 'footer', label: 'บรรทัดท้าย', sample: 'เริ่ม 18:00 น. · เข้าชมฟรี', max: 48 },
    ],
  },
  {
    id: 'gig',
    group: 'general',
    defaultFont: 'chakra',
    name: 'โปสเตอร์คอนเสิร์ต',
    note: 'ชื่อศิลปินตัวโตเต็มกว้างด้านบน รายละเอียดด้านล่าง แบบโปสเตอร์แจ๊สคลาสสิก',
    zones: ['top', 'bottom'],
    sections: ['title', 'sub', 'kicker', 'date', 'footer'],
    fields: [
      { id: 'title', label: 'ชื่อศิลปิน / ชื่องาน', sample: 'Soul After Six', max: 24 },
      { id: 'sub', label: 'บรรทัดรอง', sample: 'Live Music Night', max: 28 },
      { id: 'kicker', label: 'สถานที่', sample: 'แสดงสด ริมแม่น้ำเจ้าพระยา กรุงเทพฯ', max: 48 },
      { id: 'date', label: 'วันที่', sample: '2 ธันวาคม 2569', max: 30 },
      { id: 'footer', label: 'บรรทัดท้าย', sample: 'ค่ำคืนแห่งเสียงเพลงโซลและแจ๊ส', max: 48 },
    ],
  },
  {
    id: 'sale',
    group: 'ecommerce',
    defaultEffect: 'pop3d',
    name: 'ลดราคา',
    note: 'ป้ายดาวตัวเลขใหญ่ อ่านโปรได้ในวินาทีเดียว',
    zones: ['bottom', 'top', 'left', 'right'],
    sections: ['badge', 'title', 'sub'],
    fields: [
      { id: 'badge', label: 'ป้ายโปร', sample: 'ลด 50%', max: 8 },
      { id: 'title', label: 'หัวข้อ', sample: 'ทั้งร้าน วันนี้เท่านั้น', max: 30 },
      { id: 'sub', label: 'บรรทัดรอง', sample: 'ถึง 30 พ.ย. · สั่งทาง LINE ได้เลย', max: 48 },
    ],
  },
  {
    id: 'menu',
    group: 'food',
    defaultFont: 'pattaya',
    defaultEffect: 'sticker',
    name: 'เมนู + ราคา',
    note: 'ริบบิ้นสั้น ชื่อเมนู ราคาในวงกลม',
    zones: ['left', 'right', 'bottom', 'top'],
    sections: ['kicker', 'title', 'price'],
    fields: [
      { id: 'kicker', label: 'ริบบิ้น', sample: 'NEW', max: 10 },
      { id: 'title', label: 'ชื่อเมนู / สินค้า', sample: 'ต้มยำกุ้งน้ำข้น', max: 30 },
      { id: 'price', label: 'ราคา', sample: '฿159', max: 8 },
    ],
  },
  {
    id: 'market-print',
    group: 'food',
    defaultFont: 'pridi',
    name: 'ป้ายเมนูตลาดย้อนยุค',
    note: 'ตัวพิมพ์ปรีดีบนป้ายขอบเหลี่ยม คู่กับป้ายราคาสีเข้ม',
    zones: ['top', 'bottom', 'left', 'right'],
    sections: ['kicker', 'title', 'price', 'sub'],
    fields: [
      { id: 'kicker', label: 'คำเกริ่น', sample: 'จานเด็ดวันนี้', max: 18 },
      { id: 'title', label: 'ชื่อเมนู', sample: 'ข้าวซอยไก่', max: 26 },
      { id: 'price', label: 'ราคา', sample: '฿89', max: 9 },
      { id: 'sub', label: 'รายละเอียดเมนู', sample: 'หอมเครื่องแกง · เสิร์ฟพร้อมเครื่องเคียง', max: 44 },
    ],
  },
  {
    id: 'minimal',
    group: 'general',
    defaultFont: 'serif',
    name: 'เรียบหรู',
    note: 'ตัวบาง เว้นช่องไฟ เส้นคั่นบาง',
    zones: ['top', 'bottom', 'left', 'right'],
    sections: ['title', 'rule', 'sub'],
    fields: [
      { id: 'title', label: 'หัวข้อ', sample: 'New Collection', max: 24 },
      { id: 'sub', label: 'บรรทัดรอง', sample: 'คอลเลกชันใหม่ ฤดูหนาว 2026', max: 40 },
    ],
  },
  {
    id: 'bogo',
    group: 'food',
    alsoIn: 'ecommerce',
    defaultEffect: 'pop3d',
    name: 'ป้ายโปร 1 แถม 1',
    note: 'คำโปรตัวใหญ่ คู่กับชื่อเมนูและวันโปร',
    zones: ['bottom', 'top', 'left', 'right'],
    sections: ['badge', 'title', 'date'],
    fields: [
      { id: 'badge', label: 'โปรโมชัน', sample: '1 แถม 1', max: 16 },
      { id: 'title', label: 'ชื่อเมนู / สินค้า', sample: 'ชานมไข่มุก', max: 26 },
      { id: 'date', label: 'วันโปร / เงื่อนไข', sample: 'เฉพาะวันพุธ', max: 28 },
    ],
  },
  {
    id: 'launch',
    group: 'food',
    defaultEffect: 'sticker',
    name: 'เปิดตัวเมนูใหม่',
    note: 'พาดหัวใหญ่ ป้ายเปิดตัว และข้อความชวนลอง',
    zones: ['top', 'bottom', 'left', 'right'],
    sections: ['kicker', 'title', 'footer'],
    fields: [
      { id: 'kicker', label: 'ป้ายเปิดตัว', sample: 'เมนูใหม่', max: 14 },
      { id: 'title', label: 'ชื่อเมนู / สินค้า', sample: 'มัทฉะมะพร้าว', max: 28 },
      { id: 'footer', label: 'ข้อความชวนลอง', sample: 'ลองได้แล้ววันนี้', max: 28 },
    ],
  },
  {
    id: 'compare',
    group: 'food',
    alsoIn: 'ecommerce',
    defaultFont: 'plex',
    name: 'เทียบราคา 2 ตัวเลือก',
    note: 'การ์ดคู่สำหรับสองขนาด สองรส หรือสองเซต',
    zones: ['bottom', 'top', 'left', 'right'],
    sections: ['title', 'bullet1', 'bullet2'],
    fields: [
      { id: 'title', label: 'หัวข้อ', sample: 'เลือกไซซ์ที่ชอบ', max: 24 },
      { id: 'bullet1', label: 'ตัวเลือก 1', sample: 'แก้วปกติ', max: 20 },
      { id: 'price1', label: 'ราคา 1', sample: '฿65', max: 9 },
      { id: 'bullet2', label: 'ตัวเลือก 2', sample: 'แก้วใหญ่', max: 20 },
      { id: 'price2', label: 'ราคา 2', sample: '฿85', max: 9 },
    ],
  },
  {
    id: 'spec',
    group: 'ecommerce',
    defaultFont: 'chakra',
    defaultEffect: 'glow',
    name: 'โชว์ตัวเลขสินค้า',
    note: 'เน้นสเปกเดียว เช่น แรงดัน ขนาด หรือความจุ',
    zones: ['left', 'right', 'top', 'bottom'],
    sections: ['title', 'badge', 'sub'],
    fields: [
      { id: 'title', label: 'ชื่อสินค้า', sample: 'สว่านไร้สาย', max: 28 },
      { id: 'badge', label: 'ตัวเลขและหน่วย', sample: '12 V', max: 12 },
      { id: 'sub', label: 'คำอธิบายตัวเลข', sample: 'แรงดันแบตเตอรี่', max: 28 },
    ],
  },
  {
    id: 'tiers',
    group: 'food',
    alsoIn: 'ecommerce',
    defaultFont: 'plex',
    name: 'ราคาตามจำนวน',
    note: 'สามขั้นราคา สำหรับจัดเบรกหรือขายส่ง',
    zones: ['bottom', 'top', 'left', 'right'],
    sections: ['title', 'bullet1', 'bullet2', 'bullet3', 'footer'],
    fields: [
      { id: 'title', label: 'หัวข้อ', sample: 'ราคาชุดจัดเบรก', max: 24 },
      { id: 'bullet1', label: 'จำนวนขั้นต่ำ 1', sample: '25–49 กล่อง', max: 20 },
      { id: 'price1', label: 'ราคาต่อหน่วย 1', sample: '฿49', max: 9 },
      { id: 'bullet2', label: 'จำนวนขั้นต่ำ 2', sample: '50–99 กล่อง', max: 20 },
      { id: 'price2', label: 'ราคาต่อหน่วย 2', sample: '฿45', max: 9 },
      { id: 'bullet3', label: 'จำนวนขั้นต่ำ 3', sample: '100 กล่องขึ้นไป', max: 20 },
      { id: 'price3', label: 'ราคาต่อหน่วย 3', sample: '฿39', max: 9 },
      { id: 'footer', label: 'เงื่อนไข / ช่องทางสั่ง', sample: 'ราคาต่อกล่อง · จองล่วงหน้า', max: 36 },
    ],
  },
  {
    id: 'paired',
    group: 'food',
    defaultFont: 'pattaya',
    name: 'จากแพ็กถึงจาน',
    note: 'หัวข้อและป้ายคู่สำหรับรูปแพ็กกับเมนูพร้อมเสิร์ฟ',
    zones: ['top', 'bottom'],
    sections: ['title', 'bullet1', 'bullet2'],
    fields: [
      { id: 'title', label: 'ชื่อสินค้า', sample: 'ซอสผัดกะเพรา', max: 28 },
      { id: 'bullet1', label: 'ป้ายรูปซ้าย', sample: 'ซอสพร้อมปรุง', max: 18 },
      { id: 'bullet2', label: 'ป้ายรูปขวา', sample: 'ไอเดียเมนู', max: 18 },
    ],
  },
  {
    id: 'shipping',
    group: 'food',
    alsoIn: 'ecommerce',
    name: 'ป้ายค่าส่ง + วิธีสั่ง',
    note: 'ค่าส่งตัวใหญ่ คู่กับชื่อเมนูและช่องทางสั่ง',
    zones: ['bottom', 'top', 'left', 'right'],
    sections: ['price', 'title', 'footer'],
    fields: [
      { id: 'kicker', label: 'คำบนป้ายค่าส่ง', sample: 'ค่าส่งเริ่ม', max: 12 },
      { id: 'price', label: 'ค่าส่ง', sample: '฿10', max: 9 },
      { id: 'title', label: 'หัวข้อ', sample: 'ติ่มซำส่งถึงบ้าน', max: 26 },
      { id: 'footer', label: 'ช่องทางสั่ง', sample: 'สั่งผ่าน LINE MAN', max: 30 },
    ],
  },
  {
    id: 'pack',
    group: 'ecommerce',
    alsoIn: 'food',
    name: 'โชว์จำนวนในแพ็ก',
    note: 'ป้ายจำนวนมุมบนและแถบขนาดต่อชิ้น',
    zones: ['top', 'bottom'],
    sections: ['badge', 'title', 'footer'],
    fields: [
      { id: 'badge', label: 'จำนวนในแพ็ก', sample: '2 ถุง', max: 12 },
      { id: 'title', label: 'ชื่อสินค้า', sample: 'กาแฟคั่วบด', max: 26 },
      { id: 'footer', label: 'ขนาดต่อชิ้น', sample: 'ถุงละ 250 กรัม', max: 26 },
    ],
  },
  {
    id: 'orbit',
    group: 'ecommerce',
    defaultFont: 'chakra',
    defaultEffect: 'glow',
    name: 'ป้ายจุดเด่นรอบสินค้า',
    note: 'ป้ายสามจุดรอบภาพสินค้า เว้นกลางให้เห็นของชัด',
    zones: ['top', 'bottom'],
    sections: ['title', 'bullet1', 'bullet2', 'bullet3'],
    fields: [
      { id: 'title', label: 'ชื่อสินค้า', sample: 'โคมไฟตั้งโต๊ะ', max: 26 },
      { id: 'bullet1', label: 'จุดเด่นซ้าย', sample: 'ปรับองศาได้', max: 18 },
      { id: 'bullet2', label: 'จุดเด่นขวา', sample: 'แสง 3 ระดับ', max: 18 },
      { id: 'bullet3', label: 'จุดเด่นด้านล่าง', sample: 'ชาร์จ USB-C', max: 18 },
    ],
  },
  {
    id: 'hook',
    group: 'ecommerce',
    alsoIn: 'general',
    defaultFont: 'mali',
    defaultEffect: 'sticker',
    name: 'คำเปิดคลิป / Story',
    note: 'คำถามตัวใหญ่ด้านบน เหมาะกับภาพแนวตั้ง 9:16',
    zones: ['top', 'bottom', 'left', 'right'],
    sections: ['title', 'sub'],
    fields: [
      { id: 'title', label: 'คำถามเปิดเรื่อง', sample: 'ชงกาแฟให้นุ่มขึ้นยังไง?', max: 44 },
      { id: 'sub', label: 'บรรทัดรอง', sample: 'ลองชงให้ดู', max: 28 },
    ],
  },
  {
    id: 'gift',
    group: 'ecommerce',
    defaultEffect: 'pop3d',
    name: 'ของแถมเมื่อซื้อครบ',
    note: 'ป้ายของแถมเด่น คู่กับชื่อของแถมและยอดซื้อขั้นต่ำ',
    zones: ['bottom', 'top', 'left', 'right'],
    sections: ['badge', 'title', 'sub'],
    fields: [
      { id: 'badge', label: 'ป้ายของแถม', sample: 'แถมฟรี!', max: 12 },
      { id: 'title', label: 'ของแถม', sample: 'แก้วเชค 1 ใบ', max: 24 },
      { id: 'sub', label: 'เงื่อนไขรับของแถม', sample: 'เมื่อซื้อครบ ฿999', max: 32 },
    ],
  },
  {
    id: 'bundle',
    group: 'ecommerce',
    defaultEffect: 'pop3d',
    name: 'โปรคุ้ม / 1 แถม 1',
    note: 'ป้ายโปร + ราคาเดิมขีดฆ่า + ราคาพิเศษ เด่นชัด',
    zones: ['top', 'bottom', 'left', 'right'],
    sections: ['badge', 'title', 'price', 'sub'],
    fields: [
      { id: 'badge', label: 'ป้ายโปร', sample: 'ซื้อ 1 แถม 1', max: 14 },
      { id: 'title', label: 'หัวข้อ', sample: 'เซ็ตสุดคุ้ม วันนี้เท่านั้น', max: 28 },
      { id: 'oldPrice', label: 'ราคาเดิม (ขีดฆ่า)', sample: '฿590', max: 10 },
      { id: 'price', label: 'ราคาพิเศษ', sample: '฿299', max: 10 },
      { id: 'sub', label: 'บรรทัดรอง', sample: 'ส่งฟรีทั่วไทย · สั่งทาง LINE ได้เลย', max: 48 },
    ],
  },
  {
    id: 'callout',
    group: 'ecommerce',
    defaultFont: 'plex',
    name: 'ชูจุดเด่น 3 ข้อ',
    note: 'ริบบิ้น + หัวข้อ + จุดเด่น 3 ข้อ เหมาะกับสินค้า/อาหารแพ็ก',
    zones: ['left', 'right', 'bottom', 'top'],
    sections: ['kicker', 'title', 'bullet1', 'bullet2', 'bullet3', 'price'],
    fields: [
      { id: 'kicker', label: 'ริบบิ้น', sample: 'ขายดีอันดับ 1', max: 14 },
      { id: 'title', label: 'ชื่อสินค้า / หัวข้อ', sample: 'สูตรเข้มข้น คุ้มกว่าเดิม', max: 26 },
      { id: 'bullet1', label: 'จุดเด่น 1', sample: 'วัตถุดิบพรีเมียม แท้ 100%', max: 28 },
      { id: 'bullet2', label: 'จุดเด่น 2', sample: 'ผลิตสดใหม่ทุกวัน ปลอดภัย', max: 28 },
      { id: 'bullet3', label: 'จุดเด่น 3', sample: 'ส่งไว พร้อมเก็บเงินปลายทาง', max: 28 },
      { id: 'price', label: 'ราคา (ไม่ใส่ก็ได้)', sample: '฿199', max: 10 },
    ],
  },
  {
    id: 'marketplace',
    group: 'ecommerce',
    name: 'ปกสินค้า Shopee / Lazada',
    note: 'กรอบปก 1:1 ป้ายลดมุมบน + แถบส่งฟรีด้านล่าง',
    zones: ['top', 'bottom'],
    sections: ['badge', 'title', 'footer'],
    fields: [
      { id: 'badge', label: 'ป้ายลดมุมบน', sample: 'ลด 30%', max: 12 },
      { id: 'title', label: 'หัวข้อสินค้า', sample: 'พร้อมส่ง ของแท้ 100%', max: 26 },
      { id: 'footer', label: 'แถบโปรด้านล่าง', sample: 'ส่งฟรีทั่วไทย · เก็บเงินปลายทาง', max: 42 },
    ],
  },
  {
    id: 'priceburst',
    group: 'food',
    defaultEffect: 'pop3d',
    name: 'ป้ายราคาคู่ / เมนูเด็ด',
    note: 'ป้ายวงกลม 2 ชั้น "เริ่มต้น ฿35.-" เด่นสะดุดตา',
    zones: ['top', 'bottom', 'left', 'right'],
    sections: ['kicker', 'title', 'price', 'sub'],
    fields: [
      { id: 'kicker', label: 'ป้ายสั้น', sample: 'เมนูแนะนำ', max: 14 },
      { id: 'title', label: 'ชื่อเมนู / สินค้า', sample: 'ชานมไข่มุกไต้หวัน', max: 26 },
      { id: 'oldPrice', label: 'คำบนราคา', sample: 'เริ่มต้น', max: 10 },
      { id: 'price', label: 'ราคา', sample: '฿35.-', max: 10 },
      { id: 'sub', label: 'บรรทัดรอง', sample: 'ท็อปปิ้งจุกๆ สดใหม่ทุกแก้ว', max: 44 },
    ],
  },
  {
    id: 'menulist',
    group: 'food',
    defaultFont: 'plex',
    name: 'รายการเมนู / ตารางราคา',
    note: 'ชื่อเมนู + ราคา 3 แถว พร้อมแถบสั่งซื้อ',
    zones: ['left', 'right', 'bottom', 'top'],
    sections: ['title', 'bullet1', 'bullet2', 'bullet3', 'footer'],
    fields: [
      { id: 'title', label: 'หัวข้อ', sample: 'เมนูขายดี', max: 20 },
      { id: 'bullet1', label: 'รายการ 1', sample: 'ข้าวกะเพราเนื้อวากิว', max: 26 },
      { id: 'price1', label: 'ราคา 1', sample: '฿129', max: 8 },
      { id: 'bullet2', label: 'รายการ 2', sample: 'ข้าวไข่ข้นกุ้งกระเทียม', max: 26 },
      { id: 'price2', label: 'ราคา 2', sample: '฿119', max: 8 },
      { id: 'bullet3', label: 'รายการ 3', sample: 'ชาไทยเย็นสูตรเข้มข้น', max: 26 },
      { id: 'price3', label: 'ราคา 3', sample: '฿55', max: 8 },
      { id: 'footer', label: 'ช่องทางสั่งซื้อ', sample: 'สั่งล่วงหน้า LINE @yourshop', max: 42 },
    ],
  },
  {
    id: 'delivery',
    group: 'food',
    defaultFont: 'pattaya',
    defaultEffect: 'sticker',
    name: 'เดลิเวอรี / ช่องทางสั่ง',
    note: 'ป้ายค่าส่ง + แอปเดลิเวอรีเป็นชิป + แถบติดต่อ',
    zones: ['bottom', 'top', 'left', 'right'],
    sections: ['badge', 'title', 'sub', 'footer'],
    fields: [
      { id: 'badge', label: 'ป้ายค่าส่ง', sample: 'ค่าส่งเริ่ม 10.-', max: 18 },
      { id: 'title', label: 'หัวข้อ', sample: 'อร่อยส่งตรงถึงหน้าบ้าน', max: 28 },
      { id: 'sub', label: 'แอป / ช่องทาง (คั่นด้วย ·)', sample: 'GrabFood · LINE MAN · ShopeeFood', max: 48 },
      { id: 'footer', label: 'LINE / เบอร์โทร', sample: 'LINE @yourshop · โทร 089-123-4567', max: 48 },
    ],
  },
  {
    id: 'flash',
    group: 'ecommerce',
    defaultFont: 'chakra',
    defaultEffect: 'pop3d',
    name: 'แคมเปญ 11.11 / Flash',
    note: 'ตัวเลขแคมเปญยักษ์มีเงา + ริบบิ้น + วันที่/โค้ด',
    zones: ['top', 'bottom', 'left', 'right'],
    sections: ['kicker', 'badge', 'title', 'date'],
    fields: [
      { id: 'kicker', label: 'ริบบิ้นแคมเปญ', sample: 'MEGA FLASH SALE', max: 20 },
      { id: 'badge', label: 'ตัวเลขเด่น', sample: '11.11', max: 10 },
      { id: 'title', label: 'หัวข้อโปร', sample: 'ลดสูงสุด 50% ทั้งร้าน', max: 28 },
      { id: 'date', label: 'วันที่ / เงื่อนไข', sample: '11–13 พ.ย. · เก็บโค้ดเลย', max: 36 },
    ],
  },
  {
    id: 'coupon',
    group: 'ecommerce',
    defaultEffect: 'pop3d',
    name: 'คูปองโค้ดส่วนลด',
    note: 'การ์ดคูปองมีรอยปรุฉีก + โค้ดส่วนลดชัดๆ',
    zones: ['bottom', 'top', 'left', 'right'],
    sections: ['title', 'badge', 'sub'],
    fields: [
      { id: 'title', label: 'หัวข้อ', sample: 'เก็บโค้ดลดเพิ่มทันที', max: 28 },
      { id: 'badge', label: 'มูลค่าส่วนลด', sample: 'ลด ฿100', max: 12 },
      { id: 'accent', label: 'โค้ดส่วนลด', sample: 'SAVE100', max: 14 },
      { id: 'sub', label: 'เงื่อนไข', sample: 'เมื่อช้อปครบ ฿499 · ส่งฟรีทั่วไทย', max: 48 },
    ],
  },
  {
    id: 'review',
    group: 'ecommerce',
    defaultFont: 'mali',
    defaultEffect: 'sticker',
    name: 'ป้ายยา / รีวิว 5 ดาว',
    note: 'หัวข้อป้ายไฮไลต์สไตล์ TikTok/UGC + รีวิว 5 ดาว',
    zones: ['top', 'bottom'],
    sections: ['kicker', 'title', 'sub'],
    fields: [
      { id: 'kicker', label: 'คะแนนรีวิว', sample: '★★★★★ 4.9/5', max: 16 },
      { id: 'title', label: 'คำป้ายยา', sample: 'เจอแล้ว! ตัวนี้ใช้ดีมาก', max: 28 },
      { id: 'sub', label: 'คำรีวิวสั้น', sample: 'หอมละมุน ไม่หวานเลี่ยน ซื้อซ้ำแน่นอน', max: 48 },
    ],
  },
  // ---------- อีก 20 แบบกราฟิก (จากงานวิจัยโฆษณาอาหาร & อีคอมเมิร์ซไทย 76 ชิ้น) ----------
  {
    id: 'izakaya',
    group: 'food',
    defaultFont: 'serif',
    defaultEffect: 'metallic',
    name: 'สไตล์ญี่ปุ่น / ตราประทับ',
    note: 'ตราประทับแนวตั้ง ชื่อเมนูเด่น ป้ายราคาด้านล่าง',
    zones: ['top', 'bottom'],
    sections: ['badge', 'title', 'price', 'sub'],
    fields: [
      { id: 'badge', label: 'ตราประทับ', sample: 'พรีเมียม', max: 10 },
      { id: 'title', label: 'ชื่อเมนู', sample: 'แซลมอนซาชิมิสด', max: 26 },
      { id: 'price', label: 'ราคา', sample: 'เริ่ม ฿99.-', max: 12 },
      { id: 'sub', label: 'บรรทัดรอง', sample: 'แล่สดใหม่ทุกวัน นำเข้าจากนอร์เวย์', max: 44 },
    ],
  },
  {
    id: 'steakhouse',
    group: 'food',
    defaultFont: 'serif',
    defaultEffect: 'metallic',
    name: 'กระดานดำ / สเต๊กเฮาส์',
    note: 'ป้ายหัวเรื่องกรอบคู่ ชื่อเมนูเข้ม + ราคาเดิมขีดฆ่า',
    zones: ['top', 'bottom', 'left', 'right'],
    sections: ['kicker', 'title', 'price', 'sub'],
    fields: [
      { id: 'kicker', label: 'ป้ายหัวเรื่อง', sample: 'CHEF SPECIAL', max: 18 },
      { id: 'title', label: 'ชื่อเมนู', sample: 'ริบอายสเต๊กย่างถ่าน', max: 26 },
      { id: 'oldPrice', label: 'ราคาเดิม (ขีดฆ่า)', sample: '฿499', max: 10 },
      { id: 'price', label: 'ราคาพิเศษ', sample: '฿389', max: 10 },
      { id: 'sub', label: 'บรรทัดรอง', sample: 'เสิร์ฟพร้อมซอสพริกไทยดำโฮมเมด', max: 44 },
    ],
  },
  {
    id: 'bakery',
    group: 'food',
    defaultFont: 'mali',
    defaultEffect: 'sticker',
    name: 'ป้ายเบเกอรี / คาเฟ่',
    note: 'ตราขอบหยักน่ารัก ชื่อขนม ป้ายราคาพาสเทล',
    zones: ['top', 'bottom', 'left', 'right'],
    sections: ['badge', 'title', 'price', 'sub'],
    fields: [
      { id: 'badge', label: 'ป้ายกลม', sample: 'อบสดใหม่', max: 12 },
      { id: 'title', label: 'ชื่อเมนู / ขนม', sample: 'ครัวซองต์เนยสดฝรั่งเศส', max: 28 },
      { id: 'price', label: 'ราคา', sample: 'ชิ้นละ ฿65', max: 12 },
      { id: 'sub', label: 'บรรทัดรอง', sample: 'หอมเนยแท้ กรอบนอกนุ่มในทุกเช้า', max: 44 },
    ],
  },
  {
    id: 'boba',
    group: 'food',
    defaultFont: 'mali',
    defaultEffect: 'sticker',
    name: 'ชานม / ท็อปปิ้ง 3 อย่าง',
    note: 'พาดหัวป้ายสี วงกลมท็อปปิ้ง 3 อย่าง + ป้ายราคา',
    zones: ['top', 'bottom', 'left', 'right'],
    sections: ['title', 'bullet1', 'bullet2', 'bullet3', 'price'],
    fields: [
      { id: 'title', label: 'ชื่อเครื่องดื่ม', sample: 'ชานมไต้หวันไข่มุกหนึบ', max: 26 },
      { id: 'bullet1', label: 'ท็อปปิ้ง 1', sample: 'ไข่มุกทอง', max: 14 },
      { id: 'bullet2', label: 'ท็อปปิ้ง 2', sample: 'พุดดิ้งนม', max: 14 },
      { id: 'bullet3', label: 'ท็อปปิ้ง 3', sample: 'ครีมชีส', max: 14 },
      { id: 'price', label: 'ราคา', sample: 'แก้วละ ฿45', max: 12 },
    ],
  },
  {
    id: 'buffet',
    group: 'food',
    defaultFont: 'kanit',
    defaultEffect: 'pop3d',
    name: 'บุฟเฟต์ / อิ่มไม่อั้น',
    note: 'ธงป้ายบุฟเฟต์ ราคาตัวโต เงื่อนไขเวลา + จองโต๊ะ',
    zones: ['bottom', 'top', 'left', 'right'],
    sections: ['kicker', 'price', 'badge', 'footer'],
    fields: [
      { id: 'kicker', label: 'หัวข้อบุฟเฟต์', sample: 'บุฟเฟต์อิ่มไม่อั้น', max: 20 },
      { id: 'price', label: 'ราคาต่อหัว', sample: '฿299', max: 10 },
      { id: 'badge', label: 'เงื่อนไข / เวลา', sample: 'NET · ทานได้ 90 นาที', max: 24 },
      { id: 'footer', label: 'ช่องทางจอง', sample: 'จองโต๊ะ LINE @yourshop', max: 38 },
    ],
  },
  {
    id: 'setmeal',
    group: 'food',
    defaultFont: 'pattaya',
    defaultEffect: 'sticker',
    name: 'เซ็ตอาหารสุดคุ้ม',
    note: 'ป้ายเซ็ต ชื่ออาหารชุด ราคาเปรียบเทียบ + ช่วงเวลา',
    zones: ['bottom', 'top', 'left', 'right'],
    sections: ['kicker', 'title', 'price', 'date'],
    fields: [
      { id: 'kicker', label: 'ป้ายเซ็ต', sample: 'SET สุดคุ้ม', max: 14 },
      { id: 'title', label: 'รายการในเซ็ต', sample: 'ข้าวหน้าเนื้อ + ซุป + ชาเขียว', max: 30 },
      { id: 'oldPrice', label: 'ราคาปกติ (ขีดฆ่า)', sample: '฿240', max: 10 },
      { id: 'price', label: 'ราคาเซ็ต', sample: '฿179', max: 10 },
      { id: 'date', label: 'ช่วงเวลา / เงื่อนไข', sample: '11:00–14:00 น. ทุกวัน', max: 28 },
    ],
  },
  {
    id: 'grandopen',
    group: 'food',
    alsoIn: 'general',
    defaultFont: 'pattaya',
    defaultEffect: 'metallic',
    name: 'เปิดร้านใหม่ / สาขาใหม่',
    note: 'ธง Grand Opening พาดหัวใหญ่ ป้ายของแถมวันเปิด',
    zones: ['top', 'bottom', 'left', 'right'],
    sections: ['kicker', 'title', 'badge', 'footer'],
    fields: [
      { id: 'kicker', label: 'ป้ายธง', sample: 'GRAND OPENING', max: 18 },
      { id: 'title', label: 'ประกาศเปิดร้าน', sample: 'เปิดแล้ววันนี้! สาขาสีลม', max: 28 },
      { id: 'badge', label: 'โปรเปิดร้าน', sample: 'ฟรีเครื่องดื่มทุกโต๊ะ', max: 24 },
      { id: 'footer', label: 'เวลาเปิดบริการ', sample: 'เปิดทุกวัน 10:00–21:00 น.', max: 38 },
    ],
  },
  {
    id: 'catering',
    group: 'food',
    defaultFont: 'plex',
    defaultEffect: 'clean',
    name: 'รับจัดเบรก / ข้าวกล่อง',
    note: 'หัวข้อจัดเลี้ยง ชิปขั้นต่ำ/ส่งฟรี + ราคาต่อกล่อง',
    zones: ['bottom', 'top', 'left', 'right'],
    sections: ['title', 'bullet1', 'bullet2', 'price', 'footer'],
    fields: [
      { id: 'title', label: 'หัวข้อบริการ', sample: 'รับจัด Snack Box & ข้าวกล่อง', max: 30 },
      { id: 'bullet1', label: 'เงื่อนไข 1', sample: 'ขั้นต่ำ 20 กล่อง', max: 18 },
      { id: 'bullet2', label: 'เงื่อนไข 2', sample: 'ส่งฟรีในพื้นที่', max: 18 },
      { id: 'price', label: 'ราคาเริ่มต้น', sample: 'เริ่ม ฿39.-', max: 12 },
      { id: 'footer', label: 'ติดต่อสั่ง', sample: 'สั่งล่วงหน้า โทร 089-123-4567', max: 42 },
    ],
  },
  {
    id: 'nutrition',
    group: 'food',
    alsoIn: 'ecommerce',
    defaultFont: 'mali',
    defaultEffect: 'sticker',
    name: 'อาหารคลีน / จุดเด่นสุขภาพ',
    note: 'วงกลมจุดเด่นสุขภาพ 3 วง สำหรับเครื่องดื่มและอาหารคลีน',
    zones: ['top', 'bottom', 'left', 'right'],
    sections: ['title', 'bullet1', 'bullet2', 'bullet3', 'sub'],
    fields: [
      { id: 'title', label: 'ชื่อสินค้า', sample: 'นมถั่วเหลืองออร์แกนิก 100%', max: 28 },
      { id: 'bullet1', label: 'จุดเด่น 1', sample: '0% น้ำตาล', max: 14 },
      { id: 'bullet2', label: 'จุดเด่น 2', sample: 'โปรตีนสูง', max: 14 },
      { id: 'bullet3', label: 'จุดเด่น 3', sample: 'ไม่ใส่สาร', max: 14 },
      { id: 'sub', label: 'บรรทัดรอง', sample: 'คั้นสดใหม่ทุกวัน หอมมันธรรมชาติ', max: 44 },
    ],
  },
  {
    id: 'halal',
    group: 'food',
    alsoIn: 'ecommerce',
    defaultFont: 'pattaya',
    defaultEffect: 'metallic',
    name: 'อาหารแพ็ก / ของฝากพร้อมส่ง',
    note: 'โล่การันตี ชื่ออาหารแพ็ก น้ำหนัก/ราคา + อายุเก็บ',
    zones: ['bottom', 'top', 'left', 'right'],
    sections: ['badge', 'title', 'price', 'footer'],
    fields: [
      { id: 'badge', label: 'ตรารับรอง / แพ็ก', sample: 'แพ็กสุญญากาศ', max: 16 },
      { id: 'title', label: 'ชื่อสินค้า', sample: 'หมูแดดเดียว ต้นตำรับ', max: 28 },
      { id: 'price', label: 'ขนาดและราคา', sample: '500ก. ฿200', max: 12 },
      { id: 'footer', label: 'การเก็บรักษา / จัดส่ง', sample: 'เก็บเย็นได้ 30 วัน · ส่งทั่วไทย', max: 42 },
    ],
  },
  {
    id: 'payday',
    group: 'ecommerce',
    alsoIn: 'food',
    defaultFont: 'chakra',
    defaultEffect: 'pop3d',
    name: 'แคมเปญ Payday / สิ้นเดือน',
    note: 'ธง Payday ตัวเลขลดใหญ่สะใจ + ส่งฟรีไม่มีขั้นต่ำ',
    zones: ['top', 'bottom', 'left', 'right'],
    sections: ['kicker', 'badge', 'title', 'date'],
    fields: [
      { id: 'kicker', label: 'ป้ายแคมเปญ', sample: 'PAYDAY SALE', max: 16 },
      { id: 'badge', label: 'ส่วนลดเด่น', sample: 'ลด 70%', max: 10 },
      { id: 'title', label: 'ข้อความโปร', sample: 'ส่งฟรีไม่มีขั้นต่ำทั้งร้าน', max: 28 },
      { id: 'date', label: 'ระยะเวลาโปร', sample: '25–31 พ.ย. นี้เท่านั้น', max: 28 },
    ],
  },
  {
    id: 'doublecover',
    group: 'ecommerce',
    alsoIn: 'food',
    defaultFont: 'kanit',
    defaultEffect: 'pop3d',
    name: 'ปก Shopee 4 มุม / Mall',
    note: 'ป้ายติด 4 มุมเว้นกลางให้สินค้าเด่นทั้งภาพ 1:1',
    zones: ['top', 'bottom'],
    sections: ['badge', 'kicker', 'footer', 'price'],
    fields: [
      { id: 'badge', label: 'มุมบนซ้าย (ลด%)', sample: 'ลด 25%', max: 10 },
      { id: 'kicker', label: 'มุมบนขวา (การันตี)', sample: 'ของแท้ 100%', max: 14 },
      { id: 'footer', label: 'มุมล่างซ้าย (ส่ง)', sample: 'ส่งด่วน 24 ชม.', max: 20 },
      { id: 'price', label: 'มุมล่างขวา (ราคา)', sample: '฿199.-', max: 10 },
    ],
  },
  {
    id: 'beforeafter',
    group: 'ecommerce',
    defaultFont: 'plex',
    defaultEffect: 'clean',
    name: 'เทียบ Before / After',
    note: 'หัวข้อผลลัพธ์ด้านบน + ป้ายซ้าย-ขวาเทียบก่อนและหลัง',
    zones: ['top', 'bottom'],
    sections: ['title', 'bullet1', 'bullet2', 'sub'],
    fields: [
      { id: 'title', label: 'หัวข้อผลลัพธ์', sample: 'เห็นผลชัดเจนใน 7 วัน', max: 26 },
      { id: 'bullet1', label: 'ป้ายซ้าย', sample: 'ก่อนใช้', max: 14 },
      { id: 'bullet2', label: 'ป้ายขวา', sample: 'หลังใช้', max: 14 },
      { id: 'sub', label: 'คำยืนยันด้านล่าง', sample: 'รีวิวจากผู้ใช้จริงกว่า 1,000+ ราย', max: 42 },
    ],
  },
  {
    id: 'steps3',
    group: 'ecommerce',
    alsoIn: 'food',
    defaultFont: 'plex',
    defaultEffect: 'clean',
    name: 'วิธีใช้ 3 ขั้นตอน',
    note: 'วงกลมเลข 1-2-3 อธิบายวิธีใช้หรือวิธีชงเข้าใจง่าย',
    zones: ['left', 'right', 'bottom', 'top'],
    sections: ['title', 'bullet1', 'bullet2', 'bullet3', 'sub'],
    fields: [
      { id: 'title', label: 'หัวข้อ', sample: 'ใช้ง่ายๆ แค่ 3 ขั้นตอน', max: 26 },
      { id: 'bullet1', label: 'ขั้นตอน 1', sample: 'ฉีกซองเทใส่แก้ว', max: 24 },
      { id: 'bullet2', label: 'ขั้นตอน 2', sample: 'เติมน้ำเย็นคนให้ละลาย', max: 24 },
      { id: 'bullet3', label: 'ขั้นตอน 3', sample: 'พร้อมดื่มอร่อยสดชื่น', max: 24 },
      { id: 'sub', label: 'คำแนะนำเพิ่ม', sample: 'ทานวันละ 1 ซอง เช้าหรือก่อนนอน', max: 44 },
    ],
  },
  {
    id: 'specsgrid',
    group: 'ecommerce',
    defaultFont: 'chakra',
    defaultEffect: 'glow',
    name: 'สเปก 3 ช่อง / เทค-แกดเจ็ต',
    note: 'กล่องสเปก 3 ช่องเน้นตัวเลขจุดขาย + ปุ่มคลิกสั่งซื้อ',
    zones: ['bottom', 'top', 'left', 'right'],
    sections: ['title', 'bullet1', 'bullet2', 'bullet3', 'footer'],
    fields: [
      { id: 'title', label: 'ชื่อสินค้า / รุ่น', sample: 'โคมไฟโซลาร์เซลล์ PRO', max: 26 },
      { id: 'bullet1', label: 'สเปก 1 (ตัวเลข เว้นวรรค คำอธิบาย)', sample: '200W สว่างจ้า', max: 18 },
      { id: 'bullet2', label: 'สเปก 2 (ตัวเลข เว้นวรรค คำอธิบาย)', sample: 'IP67 กันน้ำฝน', max: 18 },
      { id: 'bullet3', label: 'สเปก 3 (ตัวเลข เว้นวรรค คำอธิบาย)', sample: '12ชม. เปิดทั้งคืน', max: 18 },
      { id: 'footer', label: 'ปุ่มกระตุ้นคลิก', sample: 'สั่งซื้อเลย ▸', max: 22 },
    ],
  },
  {
    id: 'hangtag',
    group: 'ecommerce',
    alsoIn: 'food',
    defaultFont: 'serif',
    defaultEffect: 'metallic',
    name: 'ป้ายห้อยราคา / แฟชั่น',
    note: 'ป้ายแท็กเจาะรูบอกราคา + หัวข้อคอลเลกชันและไซซ์',
    zones: ['left', 'right', 'top', 'bottom'],
    sections: ['price', 'title', 'sub'],
    fields: [
      { id: 'kicker', label: 'แท็กบนป้าย', sample: 'NEW', max: 8 },
      { id: 'price', label: 'ราคาบนป้ายห้อย', sample: '฿390.-', max: 10 },
      { id: 'title', label: 'หัวข้อสินค้า', sample: 'คอลเลกชันใหม่ ใส่สบายทุกวัน', max: 30 },
      { id: 'sub', label: 'สี / ไซซ์ที่มี', sample: 'มี 4 สี · ไซซ์ S–XL พร้อมส่ง', max: 40 },
    ],
  },
  {
    id: 'guarantee',
    group: 'ecommerce',
    alsoIn: 'food',
    defaultFont: 'plex',
    defaultEffect: 'clean',
    name: 'การันตี / รับประกันของแท้',
    note: 'โล่รับประกัน เช็กถูกความน่าเชื่อถือ 2 ข้อ + ช่องทางทัก',
    zones: ['left', 'right', 'bottom', 'top'],
    sections: ['badge', 'title', 'bullet1', 'bullet2', 'footer'],
    fields: [
      { id: 'badge', label: 'โล่รับประกัน', sample: 'รับประกัน 1 ปี', max: 16 },
      { id: 'title', label: 'หัวข้อความมั่นใจ', sample: 'ของแท้ 100% มั่นใจได้', max: 30 },
      { id: 'bullet1', label: 'จุดยืนยัน 1', sample: 'มี อย. รับรอง', max: 18 },
      { id: 'bullet2', label: 'จุดยืนยัน 2', sample: 'เปลี่ยนคืนได้ใน 7 วัน', max: 22 },
      { id: 'footer', label: 'ช่องทางปรึกษา', sample: 'ปรึกษาฟรี LINE @yourshop', max: 38 },
    ],
  },
  {
    id: 'speech',
    group: 'ecommerce',
    alsoIn: 'food',
    defaultFont: 'mali',
    defaultEffect: 'sticker',
    name: 'บับเบิลคำพูด / ป้ายยา UGC',
    note: 'กรอบคำพูดรีวิวจริง + คำแนะนำสั้น + ปุ่มกดตะกร้า',
    zones: ['top', 'bottom', 'left', 'right'],
    sections: ['title', 'sub', 'footer'],
    fields: [
      { id: 'title', label: 'คำถามในบับเบิล', sample: 'ผิวแห้งแต่ไม่ชอบเหนอะ?', max: 28 },
      { id: 'sub', label: 'คำตอบป้ายยา', sample: 'ต้องลองขวดนี้เลย!', max: 26 },
      { id: 'footer', label: 'ราคา / กดสั่ง', sample: 'ขวดละ ฿290 · กดตะกร้าเลย', max: 34 },
    ],
  },
  {
    id: 'countdown',
    group: 'ecommerce',
    alsoIn: 'food',
    defaultFont: 'chakra',
    defaultEffect: 'pop3d',
    name: 'จำกัดสิทธิ์ / รีบจอง',
    note: 'ป้ายจำกัดจำนวนเร่งตัดสินใจ ราคาเด่น + กำหนดหมดเขต',
    zones: ['bottom', 'top', 'left', 'right'],
    sections: ['badge', 'title', 'price', 'date'],
    fields: [
      { id: 'badge', label: 'ป้ายจำกัดสิทธิ์', sample: 'จำกัด 50 สิทธิ์เท่านั้น!', max: 24 },
      { id: 'title', label: 'หัวข้อโปร', sample: 'โปรแรงก่อนหมดเขต', max: 26 },
      { id: 'price', label: 'ราคาพิเศษ', sample: 'เพียง ฿499', max: 12 },
      { id: 'date', label: 'เส้นตายโปร', sample: 'หมดเขต 30 พ.ย. · 23:59 น.', max: 32 },
    ],
  },
  {
    id: 'editorial',
    group: 'ecommerce',
    alsoIn: 'general',
    defaultFont: 'serif',
    defaultEffect: 'clean',
    name: 'กรอบมุมพรีเมียม / ลักชัวรี',
    note: 'กรอบมุมเรขาคณิตสุดหรู ตัวอักษรเว้นช่องไฟ + ป้ายล่าง',
    zones: ['top', 'bottom'],
    sections: ['title', 'rule', 'sub', 'footer'],
    fields: [
      { id: 'title', label: 'หัวข้อพรีเมียม', sample: 'SIGNATURE EDITION', max: 24 },
      { id: 'sub', label: 'คำบรรยายไทย', sample: 'กลิ่นหอมละมุนระดับพรีเมียม', max: 36 },
      { id: 'footer', label: 'คำปิดมุมล่าง', sample: 'LIMITED RELEASE', max: 24 },
    ],
  },
];
export const templateOf = (id: string) => POSTER_TEMPLATES.find((t) => t.id === id) ?? POSTER_TEMPLATES[0];
export const resolvedFontId = (doc: Pick<PosterDoc, 'template' | 'font'>): PosterFontId =>
  doc.font ?? templateOf(doc.template).defaultFont ?? 'kanit';
export const resolvedEffectId = (doc: Pick<PosterDoc, 'template' | 'effect'>): PosterEffectId =>
  doc.effect ?? templateOf(doc.template).defaultEffect ?? 'clean';
export const sampleTexts = (t: PosterTemplate) =>
  Object.fromEntries(t.fields.map((f) => [f.id, f.sample])) as Partial<Record<FieldId, string>>;

// ชุดสีของข้อความกราฟิก (เนื้อหาโปสเตอร์ของลูกค้า ไม่ใช่สีของแอป: สีแดงใช้ได้)
export type PosterPalette = { id: string; name: string; ink: string; accent: string; accentInk: string; paper: string };
export const POSTER_PALETTES: PosterPalette[] = [
  { id: 'sun', name: 'เหลืองสด', ink: '#111111', accent: '#F7C843', accentInk: '#111111', paper: '#FBF4E4' },
  { id: 'chili', name: 'แดงพริก', ink: '#1B1B1B', accent: '#E23B2E', accentInk: '#FFFFFF', paper: '#FFF6EE' },
  { id: 'navy', name: 'กรมท่า', ink: '#14294B', accent: '#E6392F', accentInk: '#FFFFFF', paper: '#F4F7FB' },
  { id: 'leaf', name: 'เขียวใบตอง', ink: '#163A2B', accent: '#3FA36B', accentInk: '#FFFFFF', paper: '#F3F7EE' },
  { id: 'mono', name: 'ขาวดำ', ink: '#111111', accent: '#111111', accentInk: '#FFFFFF', paper: '#FFFFFF' },
  { id: 'shopee', name: 'ส้มช้อปปี้', ink: '#1B1B1B', accent: '#EE4D2D', accentInk: '#FFFFFF', paper: '#FFF5F0' },
  { id: 'gold', name: 'ทองพรีเมียม', ink: '#1A1510', accent: '#D4A13E', accentInk: '#1A1510', paper: '#FBF6EC' },
  { id: 'berry', name: 'ชมพูสดใส', ink: '#261620', accent: '#E85D88', accentInk: '#FFFFFF', paper: '#FFF2F6' },
];
// สีที่ผู้ใช้เลือกเอง (ผู้ใช้ 24 พ.ย.): palette = '#rrggbb' = สีหลัก · สีอื่นของชุดคิดจากสีนี้
// ตัวอักษรบนสีหลัก = ขาว เว้นแต่สีสว่าง (luminance > 0.35) ใช้เกือบดำ: ตรงกับชุดสีสำเร็จรูปทุกชุด
//   (สูตร contrast ของ WCAG เลือกตัวดำบนแดง/เขียว/ชมพูสด ซึ่งงานโฆษณาไม่ทำกัน) · ตัวอักษรเข้ม = เกือบดำอมสีนี้ · พื้นอ่อน = สีนี้จางๆ
export const CUSTOM_COLOR = /^#[0-9a-f]{6}$/i;
const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hexOf = (rgb: number[]) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mixRgb = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const luminance = (rgb: number[]) => {
  const [r, g, b] = rgb.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export function customPalette(hex: string): PosterPalette {
  const id = hex.toLowerCase();
  const c = rgbOf(id);
  const dark = [17, 17, 17],
    white = [255, 255, 255];
  return {
    id,
    name: `สีที่เลือกเอง ${id.toUpperCase()}`,
    ink: hexOf(mixRgb(c, dark, 0.85)),
    accent: id,
    accentInk: luminance(c) > 0.35 ? '#111111' : '#FFFFFF',
    paper: hexOf(mixRgb(c, white, 0.93)),
  };
}
// ชุดสีที่รู้จัก (มีในรายการ หรือ '#rrggbb') · ไม่รู้จัก = null
export const paletteFrom = (id: unknown): PosterPalette | null =>
  typeof id !== 'string'
    ? null
    : (POSTER_PALETTES.find((p) => p.id === id) ?? (CUSTOM_COLOR.test(id) ? customPalette(id) : null));
export const paletteOf = (id: string) => paletteFrom(id) ?? POSTER_PALETTES[0];

// ---------- ฉากหลัง ----------
// ฉากจาก AI: name/note = ไทยในการ์ด · prompt = อังกฤษที่ส่งจริง · swatch = สีของการ์ด (และพื้นตัวอย่างก่อนสร้าง)
// kind: 'graphic' = พื้นหลังกราฟิก (วาดแบบแบน), 'stage' = ฉากถ่ายอาหาร/สินค้า (แสง/เงาสมจริง)
// prompt = ตัวสถานที่เท่านั้น ไม่ล็อกพื้นวางของ (ผู้ใช้ 23 พ.ย.: AI เลือกพื้นที่เข้ากับของเอง · คนไม่มีโต๊ะ/เคาน์เตอร์ข้างหน้า)
export type PosterScene = {
  id: string;
  kind: 'graphic' | 'stage' | 'design'; // design = AI ออกแบบพื้นหลังเองจากสินค้า คำ และสี (24 พ.ย. การ์ดแรก ค่าเริ่มต้น)
  name: string;
  note: string;
  prompt: string;
  swatch: [string, string];
};
// ฉากสำเร็จรูป: ตัวหลักเป็นภาพถ่ายจริงวางบนฉากกราฟิกหรือฉากถ่ายสินค้า · การ์ดวาดตัวอย่างด้วย components/SceneArt.tsx (id ต้องตรงกัน)
export const POSTER_SCENES: PosterScene[] = [
  {
    id: 'shape',
    kind: 'graphic',
    name: 'สีเรียบ + วงกลม',
    note: 'มินิมอล สะอาดตา',
    prompt:
      'a flat solid color with one large soft circle behind the subject, in two calm colors that complement the subject, clean minimal graphic design',
    swatch: ['#F3E3C3', '#E9A15B'],
  },
  {
    id: 'riverside',
    kind: 'graphic',
    name: 'ริมน้ำสีน้ำ',
    note: 'ภาพวาดสีน้ำ โทนฟ้า',
    prompt:
      'a soft blue watercolor painting of a wide river at dusk, a lit cable-stayed bridge in the distance, riverside trees with small warm lights and misty blue hills, loose watercolor on textured paper',
    swatch: ['#DCEBFA', '#5E8FC9'],
  },
  {
    id: 'wash',
    kind: 'graphic',
    name: 'สีน้ำนุ่มๆ',
    note: 'พื้นสีน้ำ เรียบหรู',
    prompt:
      'a soft abstract watercolor wash on textured paper, gentle bleeding colors that complement the subject, with lots of calm space',
    swatch: ['#E6EEF5', '#C9B8E0'],
  },
  {
    id: 'halftone',
    kind: 'graphic',
    name: 'ป๊อปอาร์ต',
    note: 'จุดฮาล์ฟโทน สีจัด',
    prompt:
      'bold pop art, a bright flat color with large halftone dots and a radiating comic burst shape behind the subject, thick clean shapes',
    swatch: ['#FFD23F', '#EE4266'],
  },
  {
    id: 'memphis',
    kind: 'graphic',
    name: 'เมมฟิส',
    note: 'รูปทรงสนุก สีพาสเทล',
    prompt:
      'a playful Memphis-style pattern, a pastel flat color with scattered squiggles, triangles, dots and half circles, 1980s graphic design',
    swatch: ['#FCE1E4', '#9AD0EC'],
  },
  {
    id: 'papercut',
    kind: 'graphic',
    name: 'กระดาษตัด',
    note: 'ชั้นกระดาษ มีมิติ',
    prompt:
      'layered paper cut, several flat paper layers in harmonious colors with soft drop shadows between them, wavy organic shapes, handmade craft look',
    swatch: ['#F7D9C4', '#7FB7BE'],
  },
  {
    id: 'gradient',
    kind: 'graphic',
    name: 'ไล่สีสด',
    note: 'กราเดียนต์ เกรนนุ่ม',
    prompt:
      'a smooth vibrant gradient blending two or three bold colors that complement the subject, with fine film grain and soft glowing light blobs, modern social-media graphic',
    swatch: ['#7F5AF0', '#FF8E3C'],
  },
  {
    id: 'sunburst',
    kind: 'graphic',
    name: 'แสงอาทิตย์ย้อนยุค',
    note: 'เส้นรัศมี โทน 70s',
    prompt:
      'a retro 1970s sunburst, wide rays radiating from behind the subject in warm orange, mustard and cream stripes, flat print look',
    swatch: ['#F4A259', '#F4E285'],
  },
  {
    id: 'confetti',
    kind: 'graphic',
    name: 'ปาร์ตี้ฉลอง',
    note: 'กระดาษสี สตรีมเมอร์',
    prompt:
      'a festive celebration illustration, flat-color confetti, curling streamers and simple star shapes on a deep colored ground',
    swatch: ['#2B2D42', '#EF476F'],
  },
  {
    id: 'dark-wood',
    kind: 'stage',
    name: 'ไม้เข้มพรีเมียม',
    note: 'อาหารปิ้งย่าง สเต๊ก คาเฟ่เข้ม',
    prompt:
      'a moody dark charred-wood dining backdrop with warm directional rim light, rich dark shadows and calm uncluttered space',
    swatch: ['#2B211A', '#14100D'],
  },
  {
    id: 'cafe-wood',
    kind: 'stage',
    name: 'ไม้สว่างแสงเช้า',
    note: 'คาเฟ่ เบเกอรี อาหารจานเดียว',
    prompt:
      'a sunlit warm oak cafe interior in soft morning window light with creamy shallow depth of field and calm open space',
    swatch: ['#F3E7D3', '#C9A278'],
  },
  {
    id: 'food-splash',
    kind: 'stage',
    name: 'สีสด + ไอร้อน/สแปลช',
    note: 'เครื่องดื่ม ชานม ขนม ของทอด',
    prompt:
      'a vibrant warm appetizing studio backdrop with subtle soft steam or fresh dynamic splash droplets behind the subject and clean calm space',
    swatch: ['#F7B733', '#FC4A1A'],
  },
  {
    id: 'studio-podium',
    kind: 'stage',
    name: 'แท่นวางสตูดิโอ 3D',
    note: 'สกินแคร์ ขวดสินค้า แพ็กเกจ',
    prompt:
      'a clean minimalist commercial studio set with a smooth matte stone plinth, soft diagonal window sunlight shadows and calm uncluttered wall behind',
    swatch: ['#EFECE6', '#D5CBBF'],
  },
  {
    id: 'dark-spotlight',
    kind: 'stage',
    name: 'สตูดิโอดำสปอตไลต์',
    note: 'แก็ดเจ็ต อาหารเสริม สินค้าพรีเมียม',
    prompt:
      'a dramatic matte-black commercial studio backdrop with crisp overhead rim spotlight, subtle smooth vignette and deep calm darkness',
    swatch: ['#1F242B', '#0B0D10'],
  },
  {
    id: 'pastel-ecom',
    kind: 'stage',
    name: 'สตูดิโอพาสเทลคลีน',
    note: 'ปกสินค้า Shopee / Lazada สะอาดตา',
    prompt:
      'a bright soft pastel commercial studio backdrop with even gentle daylight, subtle warm glow and generous calm space for product graphics',
    swatch: ['#F7EFE9', '#E6D6E8'],
  },
];
// AI ออกแบบพื้นหลังเอง (ทดลอง 24 พ.ย.): prompt นี้ใช้เฉพาะแบบที่ยังไม่รองรับรายละเอียด (ภาพวางผังใช้ designLine ใน poster-prompts)
export const DESIGN_SCENE: PosterScene = {
  id: 'ai-design',
  kind: 'design',
  name: 'AI ออกแบบให้',
  note: 'ตามสินค้า ข้อความ และสี',
  prompt:
    'an eye-catching advertising background designed for this product and message, built around the main color of the text graphic, mixing bold graphic shapes with photographic elements',
  swatch: ['#FBF4E4', '#F7C843'],
};
export const sceneOf = (id: unknown) =>
  id === DESIGN_SCENE.id ? DESIGN_SCENE : (POSTER_SCENES.find((s) => s.id === id) ?? null);

// ---------- ทั้งโปสเตอร์ ----------
// ฉากหลัง: ฉากสำเร็จรูป (คำบรรยาย) หรือรูปฉากของผู้ใช้ (รูปอยู่ใน state ของหน้าเว็บ ส่งเป็น Image 2)
export type PosterBackground = { kind: 'scene'; id: string } | { kind: 'photo' };
// สไตล์ภาพ (ผู้ใช้ 25 พ.ย. จากโปสเตอร์ตัวอย่าง Nina Simone / Atlanta Jazz): ทั้งภาพ รวมตัวหลัก
// photo = ภาพถ่ายสีธรรมชาติ (แบบเดิม พรอมต์ไม่เปลี่ยน) · bw = ภาพถ่ายขาวดำยุค 60 · print = ภาพวาดสกรีนยุค 70 สีหลัก + ดำ + ครีม
export type PosterLook = 'photo' | 'bw' | 'print';
// graphic = กราฟิกข้อความ + สีที่มากับสไตล์ (ผู้ใช้ 25 พ.ย.: เลือกสไตล์ = ได้กราฟิกและสีที่คู่กันด้วย แก้ทีละอย่างได้ภายหลัง)
export const POSTER_LOOKS: {
  id: PosterLook;
  name: string;
  note: string;
  graphic?: { template: string; palette: string };
}[] = [
  { id: 'photo', name: 'ภาพถ่าย', note: 'ภาพถ่ายจริง สีธรรมชาติ ใช้กราฟิกที่เลือกไว้' },
  {
    id: 'bw',
    name: 'ขาวดำวินเทจ',
    note: 'ภาพถ่ายขาวดำยุค 60 + กราฟิกโปสเตอร์คอนเสิร์ต',
    graphic: { template: 'gig', palette: 'gold' },
  },
  {
    id: 'print',
    name: 'ภาพวาดย้อนยุค',
    note: 'ภาพวาดสกรีนยุค 70 + กราฟิกคอนเสิร์ตย้อนยุค',
    graphic: { template: 'concert', palette: '#e8823a' },
  },
];
export const isLook = (v: unknown): v is PosterLook => POSTER_LOOKS.some((l) => l.id === v);
// ---------- ตัวหลักที่ตัดพื้นหลังแล้ว วางบนโปสเตอร์ก่อนส่ง AI (ผู้ใช้ 23 พ.ย.: ตัดพื้นหลัง + ปรับขนาดเองได้) ----------
// x, y = จุดกลาง · h = ความสูง (สัดส่วนของโปสเตอร์) · กว้างตามสัดส่วนของรูปที่ตัด · เลยขอบโปสเตอร์ได้ (เช่น ครึ่งตัว)
export type SubjectPlace = { x: number; y: number; h: number };
export const POSTER_EXTRA_MAX = 400;
export const SUBJECT_MIN = 0.08;
export const SUBJECT_MAX = 1.6;
// ขนาดเริ่ม: สูง 72% ชิดล่าง แต่กว้างไม่เกิน 90% ของโปสเตอร์
export function startSubject(cutAspect: number, aspect: string): SubjectPlace {
  const h = Math.min(0.72, (0.9 * aspectRatio(aspect)) / cutAspect);
  return { x: 0.5, y: 0.97 - h / 2, h };
}
// วางตัวหลักหลบโซนหลักของเทมเพลต (ซ้าย -> วางขวา, ขวา -> วางซ้าย, ล่าง -> เลื่อนขึ้น, บน -> ชิดล่าง)
export function startSubjectForZone(cutAspect: number, aspect: string, zone: ZoneId): SubjectPlace {
  const r = aspectRatio(aspect);
  if (zone === 'left' || zone === 'right') {
    const h = Math.min(0.68, (0.48 * r) / cutAspect);
    return { x: zone === 'left' ? 0.72 : 0.28, y: 0.56, h };
  }
  if (zone === 'bottom') {
    const h = Math.min(0.64, (0.86 * r) / cutAspect);
    return { x: 0.5, y: 0.05 + h / 2, h };
  }
  return startSubject(cutAspect, aspect);
}
// กรอบของตัวหลักบนโปสเตอร์ (สัดส่วน) · cutAspect = กว้าง/สูง ของรูปที่ตัด
export function subjectRect(p: SubjectPlace, cutAspect: number, aspect: string): Rect {
  const w = (p.h * cutAspect) / aspectRatio(aspect);
  return { x: p.x - w / 2, y: p.y - p.h / 2, w, h: p.h };
}
// ตัวหลักหลายรูป (ผู้ใช้ 23 พ.ย.) ไม่เกินเท่านี้ · ทุกรูปต้องตัดพื้นหลัง (วางเองบนโปสเตอร์) ส่งให้ AI รูปละภาพ
export const POSTER_SUBJECTS_MAX = 3;
// วางตัวหลักหลายชิ้นเรียงกันซ้ายไปขวา (ลำดับตามที่เพิ่ม) ในที่ที่ชิ้นเดียวจะได้ (startSubjectForZone ของทั้งแถว)
// สูงเท่ากัน ชิดล่างเท่ากัน · ชิ้นเดียว = startSubjectForZone เหมือนเดิม
export function arrangeSubjects(cutAspects: number[], aspect: string, zone: ZoneId): SubjectPlace[] {
  if (cutAspects.length < 2) return cutAspects.map((a) => startSubjectForZone(a, aspect, zone));
  const row = startSubjectForZone(
    cutAspects.reduce((s, a) => s + a, 0),
    aspect,
    zone,
  );
  const r = aspectRatio(aspect);
  let left = row.x - cutAspects.reduce((s, a) => s + (row.h * a) / r, 0) / 2;
  return cutAspects.map((a) => {
    const w = (row.h * a) / r;
    const place = { x: left + w / 2, y: row.y, h: row.h };
    left += w;
    return place;
  });
}

// place = กรอบของทั้งก้อนตามแบบ (จุดเริ่ม) · items = ตำแหน่งของแต่ละชิ้นหลังผู้ใช้ขยับ (ขยับชิ้นแรก = ทุกชิ้นได้ตำแหน่งของตัวเอง)
// ที่วางตัวหลักที่ตัดแล้วอยู่กับรูปแต่ละรูปในหน้าเว็บ (Poster.tsx) ไม่อยู่ใน doc (หลายรูป 23 พ.ย.)
export type PosterDoc = {
  aspect: string;
  template: string;
  font?: PosterFontId;
  effect?: PosterEffectId;
  place: GraphicPlace;
  items: Partial<Record<SectionId, GraphicPlace>>;
  extra: string; // สั่งเพิ่มเติม (ผู้ใช้ 23 พ.ย.) ส่งเข้าพรอมต์ตามที่พิมพ์ ไม่เกิน POSTER_EXTRA_MAX
  look?: PosterLook; // สไตล์ภาพ (25 พ.ย.) ไม่มี = ภาพถ่าย
  hidden?: SectionId[]; // ชิ้นของกราฟิกที่ลบออก (ผู้ใช้ 25 พ.ย.) ไม่วาด ไม่เว้นที่ให้ · คำยังเก็บไว้ เอากลับได้
  palette: string;
  texts: Partial<Record<FieldId, string>>;
  bg: PosterBackground;
};

// ภาพที่ AI สร้างทำมาสำหรับอะไร: เปลี่ยนรูป/ฉาก/สัดส่วน หรือย้ายกราฟิกหลังสร้าง = ที่ว่างไม่ตรงแล้ว (หน้าเว็บเตือน)
// ปัดตำแหน่งทีละ 5% ไม่ให้แก้คำนิดหน่อย (กรอบกราฟิกขยับนิดเดียว) แล้วขึ้นเตือน
export function generationKey(aspect: string, areas: Rect | Rect[], subjectId: string, bgId: string) {
  const r = (n: number) => (Math.round(n * 20) / 20).toFixed(2);
  const list = Array.isArray(areas) ? areas : [areas];
  return [aspect, bgId, subjectId, list.map((a) => [a.x, a.y, a.w, a.h].map(r).join(',')).join('_')].join('|');
}
export const keyAspect = (key: string) => key.split('|')[0];
// ภาพยังตรงกับตำแหน่งกราฟิกไหม: ดูแค่สัดส่วน + พื้นที่ (รูป/ฉากเลือกใหม่ได้โดยไม่เตือน) · ภาพเก่าไม่มี key = ไม่รู้ = ไม่เตือน
export function sameLayout(a: string, b: string | null) {
  if (!a || !b) return true;
  const [x, y] = [a.split('|'), b.split('|')];
  return x[0] === y[0] && x[3] === y[3];
}

// ข้อความยังอยู่ในที่ที่ AI เว้นไว้ไหม (ผู้ใช้ 25 พ.ย.: ลบชิ้นบนภาพที่สร้างแล้วไม่ควรขึ้นเตือน) · ทุกที่ของข้อความตอนนี้
// ต้องอยู่ในที่ใดที่หนึ่งตอนสร้าง (เผื่อการปัด 5%) · ลบชิ้น/ย่อ = ยังพอดี · ย้ายออกนอก/ขยายเกิน/เปลี่ยนสัดส่วน = ไม่พอดี
export function layoutFits(made: string, now: string | null) {
  if (!made || !now) return true;
  const [a, b] = [made.split('|'), now.split('|')];
  if (a[0] !== b[0]) return false;
  const rects = (s: string) => (s ? s.split('_').map((r) => r.split(',').map(Number)) : []);
  const before = rects(a[3] ?? ''),
    after = rects(b[3] ?? '');
  const tol = 0.051;
  return after.every(([x, y, w, h]) =>
    before.some(([X, Y, Wd, Ht]) => x >= X - tol && y >= Y - tol && x + w <= X + Wd + tol && y + h <= Y + Ht + tol),
  );
}

// ---------- กราฟิกติดไปกับภาพ (ผู้ใช้ 20 พ.ย.): เปิดดูภาพไหน = กราฟิกตอนสร้างภาพนั้น ----------
// เก็บใน meta.posterGraphic (JSON) ตอนสร้าง (app/api/poster) · แก้บนภาพนั้นทีหลัง = เก็บทับกับภาพนั้น (/api/update, ผู้ใช้ 24 พ.ย.)
export type PosterGraphic = Pick<
  PosterDoc,
  'template' | 'font' | 'effect' | 'place' | 'items' | 'palette' | 'texts' | 'hidden'
>;
export const graphicOf = (d: PosterDoc): PosterGraphic => ({
  template: d.template,
  ...(d.font ? { font: d.font } : {}),
  ...(d.effect ? { effect: d.effect } : {}),
  place: d.place,
  items: d.items,
  palette: d.palette,
  texts: d.texts,
  ...(d.hidden?.length ? { hidden: d.hidden } : {}),
});
export const GRAPHIC_MAX = 4000;
// ค่าที่ไม่รู้จัก (แบบ/สี/ตำแหน่ง) = null · คำยาวเกินตัดตาม max ของช่อง · ช่องที่แบบนั้นไม่มีทิ้งไป
// aspect = สัดส่วนภาพ ใช้แปลงตำแหน่งแบบเก่า ({ zone, dx, dy } ก่อน 23 พ.ย.)
export function readGraphic(v: unknown, aspect = '4:5'): PosterGraphic | null {
  let g = v;
  if (typeof v === 'string') {
    if (v.length > GRAPHIC_MAX) return null;
    try {
      g = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!g || typeof g !== 'object') return null;
  const o = g as Record<string, unknown>;
  const tpl = POSTER_TEMPLATES.find((t) => t.id === o.template);
  const pal = paletteFrom(o.palette);
  const place = readPlace(o.place, aspect);
  if (!tpl || !pal || !place) return null;
  const raw = (o.texts && typeof o.texts === 'object' ? o.texts : {}) as Record<string, unknown>;
  const texts: Partial<Record<FieldId, string>> = {};
  for (const f of tpl.fields) {
    const t = raw[f.id];
    if (typeof t === 'string') texts[f.id] = t.slice(0, f.max);
  }
  // ตำแหน่งของแต่ละชิ้น (เฉพาะชิ้นที่แบบนี้มี · แบบเก่าไม่มี = จัดตามแบบ)
  const rawItems = (o.items && typeof o.items === 'object' ? o.items : {}) as Record<string, unknown>;
  const items: Partial<Record<SectionId, GraphicPlace>> = {};
  for (const id of tpl.sections) {
    const v = rawItems[id] as Record<string, unknown> | undefined;
    const it = v && !isZone(v.zone) ? readPlace(v, aspect) : null;
    if (it) items[id] = it;
  }
  // ชิ้นที่ลบ (25 พ.ย.): เฉพาะชิ้นที่แบบนี้มี เรียงตามแบบ · ไม่มี = ไม่ใส่ key (กราฟิกเก่าอ่านได้เหมือนเดิมทุกตัวอักษร)
  const rawHidden = Array.isArray(o.hidden) ? o.hidden : [];
  const hidden = tpl.sections.filter((id) => rawHidden.includes(id));
  const font = isPosterFont(o.font) ? o.font : undefined;
  const effect = isPosterEffect(o.effect) ? o.effect : undefined;
  return {
    template: tpl.id,
    ...(font ? { font } : {}),
    ...(effect ? { effect } : {}),
    place,
    items,
    palette: pal.id,
    texts,
    ...(hidden.length ? { hidden } : {}),
  };
}

// ---------- ตัดบรรทัดภาษาไทย: ไทยไม่มีช่องว่างระหว่างคำ ตัดตามคำด้วย Intl.Segmenter ----------
const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
const pieces = (text: string) => (segmenter ? [...segmenter.segment(text)].map((s) => s.segment) : text.split(/(\s+)/));

// คำเดียวยาวกว่าบรรทัด -> อยู่บรรทัดเดียวไป (fitText ย่อฟอนต์ให้)
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const piece of pieces(para)) {
      const next = line + piece;
      if (line.trim() && measure(next.trimEnd()) > maxWidth) {
        lines.push(line.trimEnd());
        line = piece.trimStart();
      } else line = next;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

// ฟอนต์ใหญ่สุดที่ข้อความลงกรอบ (ไม่เกินกี่บรรทัด ไม่กว้าง/สูงเกิน) ย่อทีละ 6%
export function fitText(
  text: string,
  o: {
    maxWidth: number;
    maxHeight: number;
    maxLines: number;
    size: number;
    minSize: number;
    lineHeight: number;
    measure: (s: string, size: number) => number;
  },
) {
  for (let size = o.size; ; size *= 0.94) {
    const lines = wrapText(text, o.maxWidth, (s) => o.measure(s, size));
    const widest = Math.max(0, ...lines.map((l) => o.measure(l, size)));
    const fits =
      lines.length <= o.maxLines && widest <= o.maxWidth && lines.length * size * o.lineHeight <= o.maxHeight;
    if (fits || size * 0.94 < o.minSize) return { size, lines, width: widest };
  }
}
