'use client';
// Poster.tsx — หน้าโปสเตอร์ (/poster ต้นแบบ 20 พ.ย., docs/poster-plan.md)
// เลือก รูปตัวหลัก + ฉากหลัง + กราฟิกข้อความ (วาง/ลากตำแหน่งเอง) -> ส่งกราฟิกจริงให้ AI ดู (แผนผัง: ห้ามวาด)
// -> AI สร้างทั้งภาพ (ตัวหลักอยู่ในฉาก) โดยเว้นที่กราฟิกไว้ -> วางกราฟิกทับภาพ = โปสเตอร์เสร็จ (ตรวจพื้นใต้กราฟิก ปรับสีตัวอักษร/แผ่นรองเอง)
import {
  Chakra_Petch,
  Chonburi,
  IBM_Plex_Sans_Thai,
  Kanit,
  Mali,
  Mitr,
  Noto_Serif_Thai,
  Pattaya,
  Pridi,
} from 'next/font/google';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { AccountMenu } from './AuthForm';
import LookArt from './LookArt';
import SceneArt from './SceneArt';
import { IconBag, IconDownload, IconEdit, IconFrame, IconScene, IconSparkle } from './icons';
import { AddCard, Brand, ChipGroup, GalleryLink, PageSwitch, Section, TokenUsage } from './ui';
import { api, canvasJpeg, jpegBase64, loadImg, saveImageFile, thumbSrc, toWebImage } from '@/lib/browser';
import { failText } from '@/lib/errors';
import { forgetColor, rememberColor, useSavedColors } from '@/lib/poster-colors';
import {
  POSTER_ASPECTS,
  POSTER_EFFECTS,
  POSTER_FONTS,
  POSTER_PALETTES,
  POSTER_LOOKS,
  CUSTOM_COLOR,
  customPalette,
  POSTER_SCENES,
  POSTER_TEMPLATES,
  SIZE_MAX,
  SIZE_MIN,
  POSTER_EXTRA_MAX,
  POSTER_SUBJECTS_MAX,
  SUBJECT_MAX,
  SUBJECT_MIN,
  WIDTH_MAX,
  WIDTH_MIN,
  arrangeSubjects,
  aspectRatio,
  generationKey,
  graphicOf,
  keyAspect,
  paletteOf,
  readGraphic,
  reservedAreas,
  resolvedEffectId,
  resolvedFontId,
  sampleTexts,
  layoutFits,
  sceneOf,
  DESIGN_SCENE,
  startPlace,
  subjectRect,
  templateOf,
  type Align,
  type FieldId,
  type GraphicPlace,
  type PosterDoc,
  type PosterFontId,
  type PosterGraphic,
  type PosterLook,
  type PosterTemplate,
  type Rect,
  type SectionId,
  type SubjectPlace,
  type ZoneId,
} from '@/lib/poster';
import type { Mask, Work } from '@/lib/cutout';
import {
  checkAreas,
  drawGraphic,
  graphicBounds,
  graphicItems,
  layoutImage,
  makeCanvas,
  onWhite,
  planImage,
  posterSize,
  renderPoster,
  separateItems,
  type Backdrop,
  type PosterFontSpec,
} from '@/lib/poster-draw';
import { toast } from '@/lib/toast';

// ฟอนต์ไทยจาก Google Fonts (OFL / Apache) จับคู่ใน POSTER_FONTS
const kanit = Kanit({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  style: ['normal', 'italic'],
  display: 'swap',
});
const plex = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});
const chakra = Chakra_Petch({
  subsets: ['thai', 'latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
});
const mali = Mali({
  subsets: ['thai', 'latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
});
const pattaya = Pattaya({
  subsets: ['thai', 'latin'],
  weight: '400',
  display: 'swap',
});
const mitr = Mitr({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});
const chonburi = Chonburi({
  subsets: ['thai', 'latin'],
  weight: '400',
  display: 'swap',
});
const notoSerif = Noto_Serif_Thai({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '600', '700'],
  display: 'swap',
});
const pridi = Pridi({
  subsets: ['thai', 'latin'],
  weight: '700',
  display: 'swap',
  preload: false,
});

const FONT_MAP: Record<PosterFontId, PosterFontSpec> = {
  kanit: { display: kanit.style.fontFamily, body: kanit.style.fontFamily },
  chakra: { display: chakra.style.fontFamily, body: chakra.style.fontFamily },
  mali: { display: mali.style.fontFamily, body: mali.style.fontFamily },
  pattaya: {
    display: pattaya.style.fontFamily,
    body: mitr.style.fontFamily,
    displayWeight: 400,
    displayNoItalic: true,
  },
  serif: {
    display: chonburi.style.fontFamily,
    body: notoSerif.style.fontFamily,
    displayWeight: 400,
    displayNoItalic: true,
  },
  plex: { display: plex.style.fontFamily, body: plex.style.fontFamily },
  pridi: { display: pridi.style.fontFamily, body: plex.style.fontFamily, displayWeight: 700, displayNoItalic: true },
};
const fontSpecOf = (d: Pick<PosterDoc, 'template' | 'font'>) => FONT_MAP[resolvedFontId(d)];

const STEPS = [
  { key: 'subject', label: 'ตัวหลัก', title: 'รูปสินค้า / อาหาร', Icon: IconBag },
  { key: 'bg', label: 'ฉากหลัง', title: 'ฉากหลัง', Icon: IconScene },
  { key: 'text', label: 'กราฟิก', title: 'กราฟิกข้อความ', Icon: IconEdit },
  { key: 'size', label: 'ขนาด', title: 'ใช้ภาพที่ไหน', Icon: IconFrame },
] as const;

const START: PosterDoc = {
  look: 'photo',
  aspect: '4:5',
  template: 'pill',
  place: startPlace(templateOf('pill').zones[0], '4:5'),
  items: {},
  extra: '',
  palette: 'sun',
  texts: sampleTexts(templateOf('pill')),
  // AI ออกแบบพื้นหลังเองเป็นค่าเริ่ม (ผู้ใช้ 24 พ.ย.: "that's a lot better")
  bg: { kind: 'scene', id: DESIGN_SCENE.id },
};
const FEATURED_GRAPHICS = [
  'artist',
  'promo',
  'bigprice',
  'market-print',
  'izakaya',
  'steakhouse',
  'bakery',
  'boba',
  'buffet',
  'setmeal',
  'payday',
  'doublecover',
  'beforeafter',
  'steps3',
  'specsgrid',
  'hangtag',
  'guarantee',
  'speech',
  'countdown',
  'editorial',
  'grandopen',
  'catering',
  'nutrition',
  'halal',
  'concert',
  'gig',
  'launch',
  'compare',
  'spec',
  'tiers',
  'paired',
  'shipping',
  'pack',
  'orbit',
  'hook',
  'gift',
  'priceburst',
  'bogo',
  'bundle',
  'callout',
  'menulist',
  'marketplace',
];
const GRAPHIC_CHOICES = [
  ...FEATURED_GRAPHICS.map(templateOf),
  ...POSTER_TEMPLATES.filter((tpl) => !FEATURED_GRAPHICS.includes(tpl.id)),
];

type Photo = { url: string; img: HTMLImageElement; id: string };
// graphic = กราฟิกที่เก็บกับภาพนี้ (ตอนสร้าง หรือที่แก้บนภาพนี้ทีหลัง ผู้ใช้ 24 พ.ย.) · null = ภาพเก่าที่ยังไม่เก็บกราฟิก
// first = กราฟิกตอนสร้าง (ผู้ใช้ 25 พ.ย.: แก้/ลบบนภาพนั้นแล้วคืนค่าได้)
type Shot = {
  src: string;
  img: HTMLImageElement;
  key: string;
  graphic: PosterGraphic | null;
  first: PosterGraphic | null;
};
// graphic = กราฟิกที่ติดกับภาพนั้น (null = ภาพเก่าที่ยังไม่มี: ใช้กราฟิกที่เปิดอยู่)
type Past = { src: string; key: string; caption: string; graphic: PosterGraphic | null; first: PosterGraphic | null };
type LibraryResult = {
  src: string;
  page?: string;
  inHistory?: boolean;
  caption?: string;
  posterLayout?: string;
  posterGraphic?: string;
  posterGraphicFirst?: string; // กราฟิกตอนสร้าง (เก็บตอนแก้ครั้งแรก, /api/update)
};

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ALIGN_OPTIONS: { id: Align; name: string }[] = [
  { id: 'left', name: 'ชิดซ้าย' },
  { id: 'center', name: 'กึ่งกลาง' },
  { id: 'right', name: 'ชิดขวา' },
];
// ปรับกราฟิกบนเวทีทีละชิ้น (ผู้ใช้ 23 พ.ย.: แต่ละชิ้นแยกกัน): ย้าย · มุม = ขนาด · ข้างซ้าย/ขวา = ความกว้าง (ตัดบรรทัดใหม่)
type DragMode = 'move' | 'size' | 'left' | 'right';
// ชิ้นข้อความ หรือตัวหลักที่ตัดแล้ว ('subject:<id ของรูป>' หลายรูปได้ 23 พ.ย.)
type SubjectSel = `subject:${string}`;
type Sel = SectionId | SubjectSel;
const subjectSel = (id: string): SubjectSel => `subject:${id}`;
const isSubjectSel = (s: Sel | null): s is SubjectSel => !!s && s.startsWith('subject:');
type TextDrag = {
  id: SectionId;
  mode: DragMode;
  x: number;
  y: number;
  doc: PosterDoc; // ตอนเริ่มลาก (แยกชิ้นแล้ว)
  place: GraphicPlace;
  bounds: Rect;
  raw: Rect;
};
// เลือกหลายชิ้น (ผู้ใช้ 24 พ.ย.: ลากกรอบคลุมแล้วย้ายพร้อมกัน): marquee = กำลังลากกรอบจากจุดนี้ · group = ย้ายทั้งกลุ่ม
// lo/hi = เลื่อนได้แค่ไหน (ข้อความทุกชิ้นอยู่ในโปสเตอร์ · จุดกลางตัวหลักอยู่ในโปสเตอร์)
type Drag =
  | TextDrag
  | { id: 'subject'; piece: string; mode: DragMode; x: number; y: number; start: SubjectPlace }
  | { id: 'marquee'; x: number; y: number }
  | {
      id: 'group';
      x: number;
      y: number;
      texts: { id: SectionId; place: GraphicPlace }[];
      subs: { id: string; start: SubjectPlace }[];
      lo: { x: number; y: number };
      hi: { x: number; y: number };
    };
// ตัวหลักแต่ละรูป (ผู้ใช้ 23 พ.ย.: ตัดพื้นหลังแล้ววางเอง · หลายรูปได้ ไม่เกิน POSTER_SUBJECTS_MAX)
// work = รูปที่ใช้ตัด (null = ยังเตรียมอยู่/เตรียมไม่สำเร็จ) · mask จากโมเดล · image = รูปที่ตัดแล้ว (null = ยังไม่ได้เลือก)
// preview = ภาพในแผง · place = ที่วางบนโปสเตอร์ · z = ลำดับชั้น (มาก = อยู่หน้า, แตะชิ้นไหน = ชิ้นนั้นขึ้นหน้า)
type Piece = {
  id: string; // = photo.id
  photo: Photo;
  work: Work | null;
  mask: Mask | null;
  image: HTMLCanvasElement | null;
  preview: HTMLCanvasElement | null;
  auto: boolean; // ตัดคนอัตโนมัติ (ไม่ได้แตะเอง)
  busy: boolean;
  place: SubjectPlace;
  z: number;
};
type PlacedPiece = { id: string; image: HTMLCanvasElement; rect: Rect };
const START_SUBJECT: SubjectPlace = { x: 0.5, y: 0.61, h: 0.72 };
// true = ส่งภาพวางผัง ตัวหลักอยู่ตรงที่วางบนเวทีเป๊ะ (23 พ.ย. ช่วงแรก: AI ลอกผังตาม พิซซ่าที่ถ่ายจากด้านบนจึงตั้งเป็นล้อ)
// false = AI เป็นอาร์ตไดเรกเตอร์ จัดที่วาง ขนาด มุมกล้องเอง ที่วางบนเวทีส่งเป็นไอเดียคร่าวๆ (ผู้ใช้ 23 พ.ย.: "can move but keep the detail")
// ผู้ใช้ 23 พ.ย. 17:40: แบบวางเองเป๊ะดีที่สุดตอนนี้ (พิซซ่าที่ถ่ายเฉียงวางหน้าเขียงสลัด ได้ช็อตอาหารสวย) -> true
const EXACT_PLACEMENT = true;
// วางเองเป๊ะ: Image 2.. = รูปเดิมของผู้ใช้ (ไม่ตัด) แทนรูปตัดบนพื้นขาว (ไอเดียผู้ใช้ 24 พ.ย. ทดสอบขวดน้ำ 1 ภาพ: ห่วงหิ้วที่ตัดไม่ออก
// เห็นฉากใหม่ทะลุได้ ลายน้ำหาย ทรงห่วงตรงของจริงกว่า · รอบรูปตัด 2 ภาพห่วงทึบเป็นห้องเดิม) · false = รูปตัดบนพื้นขาวแบบเดิม
const ORIGINAL_PHOTO = true;
// กรอบรวมของตัวหลักทุกชิ้น ตัดให้อยู่ในโปสเตอร์ (ไอเดียที่วางคร่าวๆ ส่งให้ AI) · เล็ก/อยู่นอกภาพ = ไม่ส่ง
// กรอบที่คลุมทุกกรอบ
const unionRect = (rs: Rect[]): Rect => {
  const x0 = Math.min(...rs.map((r) => r.x)),
    y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w)),
    y1 = Math.max(...rs.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};
// กรอบจากจุดเริ่มลากถึงจุดปัจจุบัน ตัดให้อยู่ในโปสเตอร์
const dragRect = (a: { x: number; y: number }, b: { x: number; y: number }): Rect =>
  clip({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });
function placedHint(placed: PlacedPiece[]): Rect | null {
  if (!placed.length) return null;
  const r = clip(unionRect(placed.map((p) => p.rect)));
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return r.w >= 0.02 && r.h >= 0.02 ? { x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) } : null;
}
// ตัวหลักที่ตัดแล้วทุกชิ้นเรียงกันใหม่ หลบโซนแรกของแบบกราฟิก (เพิ่มรูป / เปลี่ยนแบบกราฟิก)
function arranged(ps: Piece[], aspect: string, zone: ZoneId): Piece[] {
  const cut = ps.filter((p) => p.image);
  const places = arrangeSubjects(
    cut.map((p) => p.image!.width / p.image!.height),
    aspect,
    zone,
  );
  return ps.map((p) => {
    const i = cut.indexOf(p);
    return i < 0 ? p : { ...p, place: places[i] };
  });
}
// แตะโดนตัวหลักไหม: ดูความทึบของรูปที่ตัด (ย่อเหลือ ≤96px ครั้งเดียวต่อรูป) · ส่วนโปร่งใสในกรอบ = แตะทะลุไปชิ้นข้างหลัง
const alphaCache = new WeakMap<HTMLCanvasElement, { w: number; h: number; a: Uint8ClampedArray }>();
function opaqueAt(image: HTMLCanvasElement, u: number, v: number) {
  if (u < 0 || u > 1 || v < 0 || v > 1) return false;
  let m = alphaCache.get(image);
  if (!m) {
    const s = Math.min(1, 96 / Math.max(image.width, image.height));
    const w = Math.max(1, Math.round(image.width * s)),
      h = Math.max(1, Math.round(image.height * s));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0, w, h);
    m = { w, h, a: ctx.getImageData(0, 0, w, h).data };
    alphaCache.set(image, m);
  }
  const x = Math.min(m.w - 1, Math.floor(u * m.w)),
    y = Math.min(m.h - 1, Math.floor(v * m.h));
  return m.a[(y * m.w + x) * 4 + 3] > 24;
}
// กรอบในโปสเตอร์ (ตัวหลักเลยขอบได้ แต่กรอบเลือก/ที่จับต้องอยู่ในจอ)
const clip = (r: Rect): Rect => {
  const x = Math.max(0, r.x),
    y = Math.max(0, r.y);
  return { x, y, w: Math.max(0, Math.min(1, r.x + r.w) - x), h: Math.max(0, Math.min(1, r.y + r.h) - y) };
};
// ชื่อชิ้นในหน้าเว็บ (เส้นคั่นไม่มีช่องข้อความ)
const sectionName = (tpl: PosterTemplate, id: SectionId) =>
  id === 'rule' ? 'เส้นคั่น' : (tpl.fields.find((f) => f.id === id)?.label ?? id);
const newId = () => Math.random().toString(36).slice(2, 8);
// true หลังเปิดในเบราว์เซอร์ (server / ตอน hydrate = false) · วัดกราฟิก/ตรวจพื้นต้องใช้ canvas ซึ่ง server ไม่มี
const noop = () => () => {};
const useInBrowser = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
const sameRatio = (img: HTMLImageElement, aspect: string) =>
  Math.abs(img.naturalWidth / img.naturalHeight - aspectRatio(aspect)) / aspectRatio(aspect) < 0.02;

async function openPhoto(f: File): Promise<Photo> {
  const url = URL.createObjectURL(await toWebImage(f));
  return { url, img: await loadImg(url), id: newId() };
}

// ขยายตัวกราฟิกในการ์ดให้เห็นรายละเอียด ส่วนตำแหน่งจริงดูบนเวที
function TemplateThumb({ tpl, palette, fontsReady }: { tpl: PosterTemplate; palette: string; fontsReady: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !fontsReady) return;
    const aspect = tpl.id === 'marketplace' ? '1:1' : tpl.id === 'hook' ? '9:16' : '4:5';
    const doc: PosterDoc = {
      ...START,
      aspect,
      template: tpl.id,
      place: startPlace(tpl.zones[0], aspect),
      palette,
      texts: sampleTexts(tpl),
    };
    const font = fontSpecOf(doc);
    const bounds = tpl.id === 'marketplace' ? { x: 0, y: 0, w: 1, h: 1 } : graphicBounds(doc, font);
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!bounds || !bounds.w || !bounds.h) return;
    const { w, h } = posterSize(aspect, 1000);
    const scale = Math.min((cv.width * 0.86) / (bounds.w * w), (cv.height * 0.8) / (bounds.h * h));
    ctx.save();
    ctx.translate(
      cv.width / 2 - (bounds.x + bounds.w / 2) * w * scale,
      cv.height / 2 - (bounds.y + bounds.h / 2) * h * scale,
    );
    ctx.scale(scale, scale);
    drawGraphic(ctx, w, h, doc, font, null);
    ctx.restore();
  }, [tpl, palette, fontsReady]);
  return (
    <canvas
      ref={ref}
      width={320}
      height={224}
      className="poster-thumb"
      style={{ background: paletteOf(palette).paper }}
      aria-hidden="true"
    />
  );
}

function FileButton({ label, onFile }: { label: string; onFile: (f: File) => void }) {
  return (
    <label className="btn btn-secondary poster-file">
      {label}
      <input
        type="file"
        accept="image/*,.heic,.heif"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onFile(f);
        }}
      />
    </label>
  );
}

export default function Poster() {
  const [step, setStep] = useState(0);
  const [doc, setDoc] = useState<PosterDoc>(START);
  const [pieces, setPieces] = useState<Piece[]>([]); // ตัวหลัก เรียงตามที่เพิ่ม (ลำดับชั้นอยู่ใน z)
  const [activeId, setActiveId] = useState<string | null>(null); // รูปที่แก้การตัดอยู่ในแผงขั้นที่ 1
  const [bgPhoto, setBgPhoto] = useState<Photo | null>(null);
  const [shot, setShot] = useState<Shot | null>(null); // ภาพจาก AI ที่กำลังแสดง
  const [front, setFront] = useState<{ src: string; cut: HTMLCanvasElement | null } | null>(null); // คนที่ตัดจากภาพนั้น
  const [past, setPast] = useState<Past[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [tplGroup, setTplGroup] = useState<'all' | 'food' | 'ecommerce' | 'general'>('all');
  const [tplQuery, setTplQuery] = useState('');
  const stageRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  // ชิ้นที่เลือกอยู่ = เห็นกรอบ + ที่จับบนเวที (แตะชิ้นไหน = เลือกชิ้นนั้น, แตะที่อื่น = เลิก)
  const [selected, setSelected] = useState<Sel | null>(null);
  // หลายชิ้นที่เลือกด้วยการลากกรอบ · key = แบบกราฟิก/สัดส่วน/ภาพที่ดูตอนเลือก (เปลี่ยน = กลุ่มหายเอง ไม่ต้องล้างทุกที่)
  const [group, setGroup] = useState<{ key: string; ids: Sel[] }>({ key: '', ids: [] });
  const [marquee, setMarquee] = useState<Rect | null>(null); // กรอบที่กำลังลาก
  const [whole, setWhole] = useState(false); // ไม่ตัดพื้นหลัง: ส่งทั้งรูป AI เลือกตัวหลักเอง (แบบก่อน 23 พ.ย.) · รูปเดียวเท่านั้น
  const cutRef = useRef<HTMLCanvasElement>(null);
  // ค่าล่าสุดให้งานที่เสร็จทีหลัง (ตัดพื้นหลังเสร็จหลังเปลี่ยนแบบ/เพิ่มรูป) · z = ชั้นถัดไป
  const docRef = useRef(doc);
  const piecesRef = useRef(pieces);
  const zRef = useRef(0);
  useEffect(() => {
    docRef.current = doc;
    piecesRef.current = pieces;
  });
  // งานใหม่ที่ทำค้างไว้ (ไทล์ "รูปใหม่"): เก็บไว้ตอนเปิดดูภาพที่สร้างแล้ว
  const draft = useRef<PosterDoc | null>(null);
  // แก้กราฟิกบนภาพที่สร้างแล้ว = บันทึกกับภาพนั้นเอง (ผู้ใช้ 24 พ.ย.: ย้าย/เปลี่ยนสีบนภาพไหน เก็บไว้กับภาพนั้น)
  // pending = กราฟิกที่ยังไม่ได้ส่ง (ส่งเมื่อหยุดแก้ครู่หนึ่ง เปลี่ยนภาพ กดสร้าง หรือออกจากหน้า) · ส่งทีละครั้งตามลำดับ ค่าใหม่ไม่ถูกค่าเก่าทับ
  const pending = useRef<{ src: string; graphic: PosterGraphic } | null>(null);
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const [saving, setSaving] = useState(0);
  const [savedSrc, setSavedSrc] = useState<string | null>(null);
  // สีของฉัน (ผู้ใช้ 24 พ.ย.): สีที่เลือกเองเก็บเป็นวงสีให้กดใช้ซ้ำ · เก็บเมื่อปิดตัวเลือกสี (change ของจริง ไม่ใช่ทุกครั้งที่ลาก) หรือตอนกดสร้าง
  const savedColors = useSavedColors();
  const colorInput = useCallback((el: HTMLInputElement | null) => {
    if (!el) return;
    const onDone = () => rememberColor(el.value);
    el.addEventListener('change', onDone);
    return () => el.removeEventListener('change', onDone);
  }, []);
  const flushGraphic = useCallback(() => {
    const job = pending.current;
    if (!job) return;
    pending.current = null;
    // ในหน้านี้ภาพนั้นได้กราฟิกใหม่ทันที (เปิดกลับมาก็เห็นแบบที่แก้) · ส่งไม่สำเร็จ = แจ้ง แก้อีกครั้งก็ส่งใหม่
    setShot((s) => (s && s.src === job.src ? { ...s, graphic: job.graphic } : s));
    setPast((list) => list.map((p) => (p.src === job.src ? { ...p, graphic: job.graphic } : p)));
    setSaving((n) => n + 1);
    saveChain.current = saveChain.current
      .then(() => api('/api/update', { src: job.src, posterGraphic: job.graphic }))
      .then(
        () => setSavedSrc(job.src),
        (err) => {
          console.warn('บันทึกกราฟิกไม่สำเร็จ', err);
          toast.error(failText('บันทึกกราฟิกของภาพนี้', err));
        },
      )
      .finally(() => setSaving((n) => n - 1));
  }, []);
  useEffect(() => flushGraphic, [flushGraphic]); // ออกจากหน้า: ส่งที่ค้างก่อน
  const inBrowser = useInBrowser();

  const tpl = templateOf(doc.template);
  const palette = paletteOf(doc.palette);
  const fontId = resolvedFontId(doc);
  const effectId = resolvedEffectId(doc);
  const activeFont = FONT_MAP[fontId];
  const customNow = CUSTOM_COLOR.test(doc.palette) && !savedColors.includes(doc.palette); // กำลังเลือกสีใหม่ (ยังไม่อยู่ในสีของฉัน)
  // แต่ละชิ้นที่วาดจริง -> ที่ที่ส่งให้ AI เว้นว่าง (ชิ้นละกรอบ ชิ้นที่ชิดกันรวมกัน) + กรอบที่จับปรับบนเวที
  const items = useMemo(
    () => (inBrowser && fontsReady ? graphicItems(doc, activeFont) : []),
    [inBrowser, fontsReady, doc, activeFont],
  );
  // ชิ้นหลังตัวหลัก (ชื่อตัวยักษ์ แบบ artist 27 พ.ย.) ไม่ใช่ที่ว่างที่ AI ต้องเว้น: ส่งแยกเป็น behind (ตัวหลักบังได้ พื้นเรียบ)
  const frontItems = items.filter((i) => !i.behind);
  const areaItems = frontItems.length ? frontItems : items;
  const areas = areaItems.length
    ? reservedAreas(
        areaItems.map((i) => i.bounds),
        doc.aspect,
      )
    : null;
  const behindAreas =
    frontItems.length && frontItems.length < items.length
      ? reservedAreas(
          items.filter((i) => i.behind).map((i) => i.bounds),
          doc.aspect,
        )
      : [];
  const bgId = doc.bg.kind === 'photo' ? (bgPhoto ? `photo-${bgPhoto.id}` : '') : `scene-${doc.bg.id}`;
  const key =
    areas && pieces.length > 0 && bgId
      ? generationKey(doc.aspect, areas, pieces.map((p) => p.id).join('-'), bgId)
      : null;
  const shown = shot && sameRatio(shot.img, doc.aspect) ? shot : null;
  // ย้ายกราฟิก/เปลี่ยนสัดส่วนหลังสร้าง = ที่ว่างในภาพอาจไม่ตรงกับกราฟิกแล้ว
  // ลบชิ้น/ย่อ = ยังอยู่ในที่ที่ AI เว้นไว้ ไม่เตือน (ผู้ใช้ 25 พ.ย.)
  const stale = !!shown && !layoutFits(shown.key, key ?? (areas && generationKey(doc.aspect, areas, '', '')));
  // กราฟิกบนภาพที่ดูอยู่ต่างจากที่เก็บกับภาพนั้น = ยังไม่ได้บันทึก (ส่งเมื่อหยุดแก้ 0.6 วิ)
  const onShot = shown ? JSON.stringify(readGraphic(graphicOf(doc))) : '';
  const unsavedText = shown && onShot !== 'null' && onShot !== JSON.stringify(shown.graphic) ? onShot : '';
  const unsaved = !!unsavedText;
  // คืนกราฟิกตอนสร้าง (ผู้ใช้ 25 พ.ย. "revertable"): ปุ่มขึ้นเมื่อกราฟิกบนภาพนี้ต่างจากตอนสร้าง · กดแล้วบันทึกกับภาพนี้เหมือนการแก้อื่น
  const firstText = shown?.first ? JSON.stringify(shown.first) : '';
  const canRevert = !!firstText && onShot !== firstText;
  function revertGraphic() {
    const f = shown?.first;
    if (!f) return;
    setDoc((d) => ({ ...d, ...f, font: f.font, effect: f.effect, hidden: f.hidden ?? [] }));
    setSelected(null);
    setGroup({ key: '', ids: [] });
  }
  const shownSrc = shown?.src ?? '';
  useEffect(() => {
    if (!shownSrc || !unsavedText) {
      pending.current = null;
      return;
    }
    pending.current = { src: shownSrc, graphic: JSON.parse(unsavedText) as PosterGraphic };
    const t = setTimeout(flushGraphic, 600);
    return () => clearTimeout(t);
  }, [shownSrc, unsavedText, flushGraphic]);
  const scene = doc.bg.kind === 'scene' ? sceneOf(doc.bg.id) : null;
  // ก่อนสร้างภาพ: รูปฉากของผู้ใช้ หรือสีของการ์ดฉาก (ใช้เป็นพื้นของภาพวางผังที่ส่งให้ AI ด้วย)
  // AI ออกแบบให้: ตัวอย่างใช้สีหลักของกราฟิก (พื้นหลังจริงจะออกมาในสีนี้)
  const draftBackdrop: Backdrop =
    doc.bg.kind === 'photo' && bgPhoto
      ? { image: bgPhoto.img }
      : {
          gradient:
            scene?.kind === 'design' ? [palette.paper, palette.accent] : (scene?.swatch ?? ['#e8e4dc', '#cfc8bb']),
        };
  const backdrop: Backdrop = shown ? { image: shown.img } : draftBackdrop;
  // ตัวหลักที่ตัดแล้ว ณ ที่ที่วาง เรียงจากหลังไปหน้า (ไม่ตัด / ยังไม่ได้เลือก = ไม่มี) · หลังสร้างภาพ ตัวหลักอยู่ในภาพแล้ว ไม่วาดซ้ำ
  const wholeOn = whole && pieces.length === 1;
  const active = pieces.find((p) => p.id === activeId) ?? pieces[pieces.length - 1] ?? null;
  const cutBusy = pieces.some((p) => p.busy);
  const placed: PlacedPiece[] = wholeOn
    ? []
    : pieces
        .filter((p) => p.image)
        .sort((a, b) => a.z - b.z)
        .map((p) => ({
          id: p.id,
          image: p.image!,
          rect: subjectRect(p.place, p.image!.width / p.image!.height, doc.aspect),
        }));
  const placedShown = shown ? [] : placed;
  // ชื่อหลังตัวคน (ผู้ใช้ 27 พ.ย.): ภาพที่สร้างแล้ว = ตัดคนจากภาพ AI ในเบราว์เซอร์ (ฟรี) วาดทับชิ้นหลังตัว · ตัดครั้งเดียวต่อภาพ
  // ไม่เจอคน = แตะกลางตัวหลักที่วางไว้ · ระหว่างตัด ยังไม่วาดชิ้นหลังตัว (ไม่ให้ชื่อทับหน้าแวบหนึ่ง) · ตัดไม่ได้ = ชื่ออยู่บนภาพ
  const hasBehind = items.some((i) => i.behind);
  const frontNow = shown && hasBehind ? (front?.src === shown.src ? front : undefined) : null;
  const frontWait = frontNow === undefined;
  const frontLayer = { front: frontNow?.cut ?? null, back: !frontWait };
  const frontFor = useRef('');
  useEffect(() => {
    if (!shown || !hasBehind || frontFor.current === shown.src) return;
    frontFor.current = shown.src;
    const { src, img } = shown;
    const taps = placed
      .map((p) => ({ x: p.rect.x + p.rect.w / 2, y: p.rect.y + p.rect.h / 2 }))
      .filter((t) => t.x > 0 && t.x < 1 && t.y > 0 && t.y < 1);
    import('@/lib/cutout')
      .then((lib) => lib.frontCut(img, taps))
      .catch((err) => {
        console.warn('ตัดคนจากภาพไม่สำเร็จ', err);
        return null;
      })
      .then((cut) => setFront({ src, cut }));
    // placed = ที่วางตอนนี้ (ใช้เป็นจุดแตะสำรองเท่านั้น)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, hasBehind]);
  // ตรวจพื้นใต้แต่ละชิ้น -> สีตัวอักษรของชิ้นนั้น (ชิ้นบนพื้นมืด = ขาว ชิ้นบนพื้นสว่าง = เข้ม)
  const checks = useMemo(
    () =>
      items.length ? checkAreas(backdrop, doc.aspect, Object.fromEntries(items.map((i) => [i.id, i.bounds]))) : null,
    // backdrop เปลี่ยนตามภาพ/รูปฉาก/ฉากที่เลือก (ไม่ใส่ object ที่สร้างใหม่ทุก render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, doc.aspect, shown, bgPhoto, doc.bg],
  );

  // ฟอนต์โหลดเสร็จ -> วัด/วาดใหม่ (canvas ไม่วาดใหม่เองเหมือนตัวหนังสือในหน้าเว็บ)
  useEffect(() => {
    const specs = [
      ...['300', '400', '500', '600', '700', '800', '900'].map((w) => `${w} 32px ${kanit.style.fontFamily}`),
      `italic 800 32px ${kanit.style.fontFamily}`,
      `italic 900 32px ${kanit.style.fontFamily}`,
      ...['400', '500', '600', '700'].map((w) => `${w} 32px ${plex.style.fontFamily}`),
      ...['400', '600', '700'].map((w) => `${w} 32px ${chakra.style.fontFamily}`),
      `italic 700 32px ${chakra.style.fontFamily}`,
      ...['400', '600', '700'].map((w) => `${w} 32px ${mali.style.fontFamily}`),
      `italic 700 32px ${mali.style.fontFamily}`,
      `400 32px ${pattaya.style.fontFamily}`,
      ...['400', '500', '600', '700'].map((w) => `${w} 32px ${mitr.style.fontFamily}`),
      `400 32px ${chonburi.style.fontFamily}`,
      `700 32px ${pridi.style.fontFamily}`,
      ...['300', '400', '600', '700'].map((w) => `${w} 32px ${notoSerif.style.fontFamily}`),
    ];
    Promise.all(specs.map((f) => document.fonts.load(f, 'กข Aa 123'))).finally(() => setFontsReady(true));
  }, []);

  // ภาพที่เคยสร้างในหน้านี้ (เปิดดู/วางกราฟิกใหม่ได้ ไม่เสียโทเคน)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/library?only=results')
      .then((r) => (r.ok ? (r.json() as Promise<{ results: LibraryResult[] }>) : null))
      .then((lib) => {
        if (!lib || cancelled) return;
        setPast(
          lib.results
            .filter((r) => r.page === 'poster' && r.inHistory !== false)
            .map((r) => ({
              src: r.src,
              key: r.posterLayout ?? '',
              caption: r.caption ?? '',
              graphic: readGraphic(r.posterGraphic, keyAspect(r.posterLayout ?? '') || '4:5'),
              first: readGraphic(r.posterGraphicFirst ?? r.posterGraphic, keyAspect(r.posterLayout ?? '') || '4:5'),
            })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- เลือกหลายชิ้นด้วยการลากกรอบ (ผู้ใช้ 24 พ.ย.) ----------
  // ลากจากที่ว่างบนเวที = กรอบ · ชิ้นที่อยู่ในกรอบทั้งชิ้น (ข้อความ / ตัวหลักที่ตัดแล้ว) = กลุ่ม · ลากในกรอบกลุ่ม = ย้ายพร้อมกัน
  const groupKey = `${doc.template}|${doc.aspect}|${shot?.src ?? ''}`;
  const boxOf = (s: Sel): Rect | null => {
    if (!isSubjectSel(s)) return items.find((i) => i.id === s)?.bounds ?? null;
    const q = placedShown.find((p) => subjectSel(p.id) === s);
    return q ? clip(q.rect) : null;
  };
  const members = !busy && group.key === groupKey ? group.ids.filter((s) => boxOf(s)) : [];
  const groupOn = members.length > 1;
  const memberBoxes = groupOn ? members.map((s) => boxOf(s)!) : [];
  const groupFrame = groupOn ? unionRect(memberBoxes) : null;
  const groupTexts = groupOn ? members.filter((s): s is SectionId => !isSubjectSel(s)) : [];

  // วาดเวที (ไม่มีกรอบสีฟ้าแล้ว 23 พ.ย.: AI ได้เห็นกราฟิกจริง)
  useEffect(() => {
    const cv = stageRef.current;
    if (!cv) return;
    const { w, h } = posterSize(doc.aspect, 1400);
    if (cv.width !== w) cv.width = w;
    if (cv.height !== h) cv.height = h;
    // ที่จับขนาดคงที่บนจอ (~14px) ไม่ว่าเวทีจะแสดงเล็กหรือใหญ่ · ชิ้นอื่นมีเส้นประบางๆ ให้รู้ว่าแตะแยกได้
    const shownW = cv.getBoundingClientRect().width || w;
    const px = (14 * w) / shownW;
    const sel = !busy ? items.find((i) => i.id === selected) : undefined;
    const selPiece = !busy ? placedShown.find((p) => subjectSel(p.id) === selected) : undefined;
    const grip = groupFrame
      ? { box: groupFrame, px, others: memberBoxes, sides: false, corners: false }
      : sel
        ? { box: sel.box, px, others: items.filter((i) => i !== sel).map((i) => i.bounds) }
        : selPiece
          ? {
              box: clip(selPiece.rect),
              px,
              others: [
                ...items.map((i) => i.bounds),
                ...placedShown.filter((p) => p !== selPiece).map((p) => clip(p.rect)),
              ],
              sides: false,
            }
          : null;
    renderPoster(cv.getContext('2d')!, w, h, doc, backdrop, activeFont, checks, {
      subjects: placedShown,
      handles: grip,
      marquee: marquee && { rect: marquee, px },
      ...frontLayer,
    });
  });

  async function addPhoto(f: File, set: (p: Photo) => void) {
    setBusy('กำลังเปิดรูป...');
    try {
      set(await openPhoto(f));
    } catch (err) {
      console.warn('เปิดรูปไม่สำเร็จ', err);
      toast.error(failText('เปิดรูป', err));
    } finally {
      setBusy(null);
    }
  }

  // ---------- ตัดพื้นหลังรูปตัวหลัก (ผู้ใช้ 23 พ.ย.) · ในเบราว์เซอร์ ฟรี ----------
  // คน = ตัดเองทันทีที่เพิ่มรูป · ของ/อาหาร = แตะที่ของในรูป (แตะหลายครั้ง = รวมกัน) · ไม่ตัด = ส่งทั้งรูปแบบเดิม (รูปเดียว)
  // หลายรูป (23 พ.ย.): แต่ละรูปตัดแยก วางแยก · ตัดได้ครั้งแรกของรูปไหน = เรียงทุกชิ้นใหม่หลบโซนของแบบกราฟิก
  type CutLib = typeof import('@/lib/cutout');
  const patchPiece = (id: string, patch: Partial<Piece> | ((p: Piece) => Partial<Piece>)) =>
    setPieces((ps) => ps.map((p) => (p.id === id ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch) } : p)));
  function applyCut(lib: CutLib, id: string, work: Work, mask: Mask | null, auto: boolean) {
    const image = mask ? lib.cutCanvas(work, mask) : null;
    const preview = lib.previewCanvas(work, mask);
    const d = docRef.current;
    setPieces((ps) => {
      const old = ps.find((p) => p.id === id);
      if (!old) return ps; // เอารูปออก/เปลี่ยนรูปไปแล้ว
      const next = ps.map((p) => (p === old ? { ...p, work, mask, image, preview, auto } : p));
      return image && !old.image ? arranged(next, d.aspect, templateOf(d.template).zones[0]) : next;
    });
  }
  async function runAutoCut(id: string, img: HTMLImageElement) {
    patchPiece(id, { busy: true });
    try {
      const lib = await import('@/lib/cutout');
      const work = lib.workCanvas(img);
      patchPiece(id, (p) => (p.work ? {} : { work, preview: work.canvas }));
      applyCut(lib, id, work, await lib.autoCut(work), true);
    } catch (err) {
      console.warn('ตัดพื้นหลังไม่สำเร็จ', err);
      toast.error(failText('ตัดพื้นหลัง', err));
      // รูปเดียว: ใช้ทั้งรูปแทน (ยังสร้างภาพได้) · หลายรูป: กด ตัดคนอัตโนมัติ ลองใหม่ หรือเอารูปนั้นออก
      const ps = piecesRef.current;
      if (ps.length === 1 && ps[0].id === id) setWhole(true);
    } finally {
      patchPiece(id, { busy: false });
    }
  }
  // รูปใหม่ = ชิ้นใหม่บนสุด (replace = แทนชิ้นเดิมตรงลำดับเดิม ชั้นเดิม)
  function addPiece(photo: Photo, replace?: string) {
    const piece: Piece = {
      id: photo.id,
      photo,
      work: null,
      mask: null,
      image: null,
      preview: null,
      auto: false,
      busy: true,
      place: START_SUBJECT,
      z: ++zRef.current,
    };
    setPieces((ps) => (replace ? ps.map((p) => (p.id === replace ? { ...piece, z: p.z } : p)) : [...ps, piece]));
    setActiveId(photo.id);
    setWhole(false);
    setSelected(null);
    void runAutoCut(photo.id, photo.img);
  }
  async function addSubjects(files: File[]) {
    const room = POSTER_SUBJECTS_MAX - piecesRef.current.length;
    if (room <= 0) return toast.warn(`ตัวหลักได้ไม่เกิน ${POSTER_SUBJECTS_MAX} รูป เอารูปเดิมออกก่อน`);
    if (files.length > room) toast.warn(`เพิ่มได้อีก ${room} รูป (ตัวหลักไม่เกิน ${POSTER_SUBJECTS_MAX} รูป)`);
    setBusy('กำลังเปิดรูป...');
    try {
      for (const f of files.slice(0, room)) addPiece(await openPhoto(f));
    } catch (err) {
      console.warn('เปิดรูปไม่สำเร็จ', err);
      toast.error(failText('เปิดรูป', err));
    } finally {
      setBusy(null);
    }
  }
  function removePiece(id: string) {
    setPieces((ps) => ps.filter((p) => p.id !== id));
    if (activeId === id) setActiveId(null);
    if (selected === subjectSel(id)) setSelected(null);
  }
  async function tapCutAt(e: PointerEvent<HTMLCanvasElement>) {
    const a = active;
    if (!a?.work || a.busy) return;
    const work = a.work;
    const r = e.currentTarget.getBoundingClientRect();
    const point = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    patchPiece(a.id, { busy: true });
    try {
      const lib = await import('@/lib/cutout');
      const add = await lib.tapCut(work, [point]);
      if (!add) return toast.warn('ไม่เจอของตรงที่แตะ ลองแตะกลางตัวของ');
      const old = a.mask;
      const mask = old ? add.map((v, i) => Math.max(v, old[i])) : add;
      setWhole(false);
      applyCut(lib, a.id, work, mask, false);
    } catch (err) {
      console.warn('ตัดพื้นหลังไม่สำเร็จ', err);
      toast.error(failText('ตัดพื้นหลัง', err));
    } finally {
      patchPiece(a.id, { busy: false });
    }
  }
  const clearCut = (id: string) => {
    patchPiece(id, (p) => ({ mask: null, image: null, preview: p.work?.canvas ?? null, auto: false }));
    if (selected === subjectSel(id)) setSelected(null);
  };
  // ภาพในแผง: รูปที่เลือกอยู่ ส่วนที่ตัดออกมืดลง
  const activePreview = !wholeOn && active ? (active.preview ?? active.work?.canvas ?? null) : null;
  useEffect(() => {
    const cv = cutRef.current;
    if (!cv || !activePreview) return;
    cv.width = activePreview.width;
    cv.height = activePreview.height;
    cv.getContext('2d')!.drawImage(activePreview, 0, 0);
  }, [activePreview]);

  // เปลี่ยนแบบกราฟิก: คำที่ผู้ใช้แก้เองในช่องที่มีเหมือนกันเก็บไว้ ที่เหลือใช้ข้อความตัวอย่างของแบบใหม่
  function chooseTemplate(id: string) {
    if (id === doc.template) return;
    setDoc((d) => {
      const old = templateOf(d.template);
      const next = templateOf(id);
      const texts = sampleTexts(next);
      for (const f of next.fields) {
        const prev = d.texts[f.id];
        if (prev !== undefined && prev !== old.fields.find((x) => x.id === f.id)?.sample)
          texts[f.id] = prev.slice(0, f.max);
      }
      // แบบใหม่มีชิ้นไม่เหมือนเดิม = เริ่มที่จุดเริ่มของแบบใหม่ จัดเรียงตามแบบ · คืนฟอนต์ + สไตล์เริ่มต้นของแบบนั้น
      return {
        ...d,
        template: id,
        font: undefined,
        effect: undefined,
        texts,
        place: startPlace(next.zones[0], d.aspect),
        items: {},
        hidden: [],
      };
    });
    // ยังไม่สร้างภาพ = ขยับตัวหลักที่ตัดแล้วทุกชิ้นหลบโซนของแบบใหม่ให้อัตโนมัติ
    if (!shown) setPieces((ps) => arranged(ps, doc.aspect, templateOf(id).zones[0]));
    setSelected(null);
  }

  // สไตล์ภาพ + กราฟิกที่คู่กัน (ผู้ใช้ 25 พ.ย.): ขาวดำ -> โปสเตอร์คอนเสิร์ต สีทอง · ภาพวาด -> คอนเสิร์ตย้อนยุค สีส้ม
  // ภาพถ่าย = ไม่แตะกราฟิก · กดสไตล์เดิมซ้ำ = ไม่เปลี่ยนอะไร (ไม่ทับกราฟิก/สีที่ผู้ใช้แก้แล้ว)
  function chooseLook(id: PosterLook) {
    if ((doc.look ?? 'photo') === id) return;
    const pair = POSTER_LOOKS.find((l) => l.id === id)?.graphic;
    if (pair) chooseTemplate(pair.template);
    setDoc((d) => ({ ...d, look: id, ...(pair ? { palette: pair.palette } : {}) }));
  }

  // ลบ / เอากลับชิ้นของกราฟิก (ผู้ใช้ 25 พ.ย.): ชิ้นที่ลบไม่วาด ไม่เว้นที่ให้ AI · คำยังอยู่ แตะชิปอีกครั้งเพื่อเอากลับ
  const hideParts = useCallback((ids: SectionId[]) => {
    if (!ids.length) return;
    setDoc((d) => ({
      ...d,
      hidden: templateOf(d.template).sections.filter((s) => (d.hidden ?? []).includes(s) || ids.includes(s)),
    }));
    setSelected(null);
    setGroup({ key: '', ids: [] });
  }, []);
  const showPart = (id: SectionId) => setDoc((d) => ({ ...d, hidden: (d.hidden ?? []).filter((h) => h !== id) }));

  const setText = (id: FieldId, value: string) => setDoc((d) => ({ ...d, texts: { ...d.texts, [id]: value } }));

  // เปลี่ยนภาพที่ดู: กราฟิกของภาพเดิมเก็บไว้กับภาพเดิม (หรืองานใหม่) แล้วเปิดกราฟิกของภาพที่เลือก · null = กลับไปงานใหม่ (รูปใหม่)
  // เปิดดูภาพที่สร้างแล้ว = ภาพ + กราฟิกที่เก็บกับภาพนั้น (แก้บนภาพนั้น = บันทึกกับภาพนั้น) · null = กลับไปงานใหม่ที่ทำค้างไว้
  function showOutput(next: (Past & { img: HTMLImageElement }) | null) {
    flushGraphic(); // ที่แก้บนภาพเดิมยังไม่ได้ส่ง -> ส่งก่อนเปลี่ยน
    if (!shot) draft.current = doc;
    if (!next) {
      setShot(null);
      if (draft.current) setDoc(draft.current);
      return;
    }
    setSelected(null);
    // ภาพคนละสัดส่วนกับที่เลือกอยู่ -> เปลี่ยนสัดส่วนตามภาพ
    const fit = POSTER_ASPECTS.find((a) => sameRatio(next.img, a.id));
    // ภาพเก่าที่ยังไม่เก็บกราฟิก: นับกราฟิกที่เปิดอยู่เป็นของภาพนั้น (เปิดดูเฉยๆ ไม่บันทึก แก้แล้วจึงบันทึก)
    setShot({
      src: next.src,
      img: next.img,
      key: next.key,
      graphic: next.graphic ?? readGraphic(graphicOf(doc)),
      first: next.first,
    });
    setDoc((d) => {
      // ชิ้นที่ลบเป็นของภาพนั้นเท่านั้น (ผู้ใช้ 25 พ.ย.): ภาพที่ไม่ได้ลบอะไรไม่มี key -> ต้องล้างของภาพก่อนหน้าเอง
      const base = next.graphic
        ? {
            ...d,
            ...next.graphic,
            font: next.graphic.font,
            effect: next.graphic.effect,
            hidden: next.graphic.hidden ?? [],
          }
        : d;
      return { ...base, aspect: fit?.id ?? d.aspect };
    });
  }

  async function pickPast(p: Past) {
    if (p.src === shot?.src) return;
    setBusy('กำลังเปิดภาพ...');
    try {
      showOutput({ ...p, img: await loadImg(p.src) });
    } catch (err) {
      toast.error(failText('เปิดภาพ', err));
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    if (!pieces.length) return toast.warn('เพิ่มรูปสินค้า / อาหารในขั้นที่ 1 ก่อน');
    if (doc.bg.kind === 'photo' && !bgPhoto) return toast.warn('เพิ่มรูปฉากของคุณในขั้นที่ 2 ก่อน');
    if (!areas || !key) return toast.warn('ใส่คำบนกราฟิกก่อน');
    if (cutBusy) return toast.warn('รอตัดพื้นหลังรูปตัวหลักให้เสร็จก่อน');
    const missing = wholeOn ? -1 : pieces.findIndex((p) => !p.image);
    if (missing >= 0)
      return toast.warn(
        pieces.length > 1
          ? `แตะเลือกตัวหลักในรูปที่ ${missing + 1} ที่ขั้นที่ 1 ก่อน หรือเอารูปนั้นออก`
          : 'แตะเลือกตัวหลักในรูปที่ขั้นที่ 1 ก่อน หรือกด "ไม่ตัดพื้นหลัง"',
      );
    flushGraphic(); // ที่แก้บนภาพที่ดูอยู่ เก็บกับภาพนั้นก่อน
    rememberColor(doc.palette); // สีที่เลือกเองแล้วใช้สร้างภาพ = เก็บในสีของฉัน (สีสำเร็จรูปไม่เก็บ)
    const at = key;
    const graphic = readGraphic(graphicOf(doc)) ?? graphicOf(doc); // ภาพใหม่ได้กราฟิกที่เห็นตอนกดสร้าง (ติดกับภาพนั้น)
    setBusy('AI กำลังสร้างภาพ เว้นที่ให้กราฟิก... (ประมาณ 1 นาที)');
    try {
      const ownBg = doc.bg.kind === 'photo' && bgPhoto ? bgPhoto : null;
      // ตัดพื้นหลังแล้ว: ภาพวางผัง (ฉาก + ตัวหลักทุกชิ้น ณ ที่ที่วาง) + ตัวหลักทีละชิ้น เรียงซ้ายไปขวา (พรอมต์บอกลำดับนี้)
      //   ทีละชิ้น = รูปเดิมของผู้ใช้ (ORIGINAL_PHOTO) หรือรูปตัดบนพื้นขาว · ไม่ตัด (รูปเดียว): ทั้งรูป + รูปฉาก (แบบเดิม)
      const centre = (p: PlacedPiece) => p.rect.x + p.rect.w / 2;
      const ordered = [...placed].sort((a, b) => centre(a) - centre(b));
      const subjects = ordered.map((p) => onWhite(p.image));
      const originals =
        EXACT_PLACEMENT && ORIGINAL_PHOTO && placed.length
          ? await Promise.all(
              ordered.map(async (p) => (await jpegBase64(pieces.find((q) => q.id === p.id)!.photo.url)).data),
            )
          : null;
      const input = placed.length
        ? EXACT_PLACEMENT
          ? {
              subjects: originals ?? subjects,
              original: !!originals,
              layout: layoutImage(doc.aspect, draftBackdrop, placed),
              background: null,
            }
          : {
              subjects,
              cut: true,
              hint: placedHint(placed),
              layout: null,
              background: ownBg ? (await jpegBase64(ownBg.url)).data : null,
            }
        : await Promise.all([jpegBase64(pieces[0].photo.url), ownBg ? jpegBase64(ownBg.url) : null]).then(
            ([subj, bg]) => ({
              subject: subj.data,
              layout: null,
              background: bg?.data ?? null,
            }),
          );
      const res = await api<{ src: string; caption: string }>('/api/poster', {
        model: '',
        aspect: doc.aspect,
        scene: doc.bg.kind === 'scene' ? doc.bg.id : null,
        look: doc.look ?? 'photo',
        ...input,
        plan: planImage(doc, activeFont),
        extra: doc.extra,
        areas,
        ...(behindAreas.length ? { behind: behindAreas } : {}),
        key: at,
        graphic,
      });
      const img = await loadImg(res.src);
      draft.current = doc; // "รูปใหม่" = ตั้งค่าที่ใช้สร้างภาพล่าสุด (แก้ต่อจากตรงนั้นได้)
      setShot({ src: res.src, img, key: at, graphic, first: graphic });
      setSelected(null); // เห็นโปสเตอร์ที่ได้แบบไม่มีกรอบ · แตะชิ้นไหนเพื่อปรับต่อ
      setPast((list) => [{ src: res.src, key: at, caption: res.caption, graphic, first: graphic }, ...list]);
    } catch (err) {
      console.warn('สร้างภาพไม่สำเร็จ', err);
      toast.error(failText('สร้างภาพ', err, true));
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    if (!shown) return toast.warn('กด "สร้างภาพด้วย AI" ก่อน');
    if (frontWait) return toast.warn('รอสักครู่ กำลังแยกคนออกจากชื่อตัวโต');
    try {
      const { w, h } = posterSize(doc.aspect, 2160);
      const cv = makeCanvas(w, h);
      renderPoster(cv.getContext('2d')!, w, h, doc, { image: shown.img }, activeFont, checks, frontLayer);
      await saveImageFile(await canvasJpeg(cv), `lolo-poster-${stamp()}.jpg`);
    } catch (err) {
      console.warn('ดาวน์โหลดไม่สำเร็จ', err);
      toast.error(failText('ดาวน์โหลด', err));
    }
  }

  // ปรับกราฟิกบนเวทีทีละชิ้น: แตะชิ้นไหน = เลือกชิ้นนั้น · ลากย้าย · ที่จับมุม = ขนาด · ที่จับข้าง = ความกว้าง
  const toPoster = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const inside = (p: { x: number; y: number }, b: Rect) =>
    p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  // ที่จับใต้นิ้ว/เมาส์ · ชิ้นข้อความอยู่บนตัวหลัก (แตะซ้อนกัน = ได้ข้อความก่อน)
  function hitTest(e: PointerEvent<HTMLCanvasElement>): { id: Sel; mode: DragMode; cursor: string } | null {
    const p = toPoster(e);
    const r = e.currentTarget.getBoundingClientRect();
    const reach = e.pointerType === 'touch' ? 22 : 11; // พิกเซลรอบที่จับ
    const hx = reach / r.width,
      hy = reach / r.height;
    const grip = (b: Rect, sides: boolean): { mode: DragMode; cursor: string } | null => {
      const left = Math.abs(p.x - b.x) <= hx,
        right = Math.abs(p.x - (b.x + b.w)) <= hx;
      const top = Math.abs(p.y - b.y) <= hy,
        bottom = Math.abs(p.y - (b.y + b.h)) <= hy;
      if ((left || right) && (top || bottom))
        return { mode: 'size', cursor: left === top ? 'nwse-resize' : 'nesw-resize' };
      if (sides && (left || right) && p.y > b.y && p.y < b.y + b.h)
        return { mode: left ? 'left' : 'right', cursor: 'ew-resize' };
      return null;
    };
    const sel = items.find((i) => i.id === selected);
    const onSel = sel ? grip(sel.box, true) : null;
    if (sel && onSel) return { id: sel.id, ...onSel };
    const selPiece = placedShown.find((q) => subjectSel(q.id) === selected);
    const onPiece = selPiece ? grip(clip(selPiece.rect), false) : null;
    if (selPiece && onPiece) return { id: subjectSel(selPiece.id), ...onPiece };
    // ชิ้นบนสุด (วาดทีหลัง) ก่อน · ชิ้นที่เลือกอยู่จับได้ทั้งกรอบ
    // ชิ้นหลังตัวหลัก (ชื่อตัวยักษ์ 27 พ.ย.): แตะตรงตัวหลักที่ทับอยู่ = ได้ตัวหลัก (อยู่ข้างหน้า) · ที่จับของชิ้นที่เลือกยังได้ก่อน
    const textAt = (behind: boolean) =>
      [...items].reverse().find((i) => i.behind === behind && inside(p, i.id === selected ? i.box : i.bounds));
    const hit = textAt(false);
    if (hit) return { id: hit.id, mode: 'move', cursor: 'grab' };
    if (selPiece && inside(p, clip(selPiece.rect)))
      return { id: subjectSel(selPiece.id), mode: 'move', cursor: 'grab' };
    // ตัวหลักชิ้นบนสุดที่ทึบตรงจุดนั้น (ส่วนโปร่งใสในกรอบ = แตะโดนชิ้นข้างหลัง)
    const piece = [...placedShown]
      .reverse()
      .find((q) => opaqueAt(q.image, (p.x - q.rect.x) / q.rect.w, (p.y - q.rect.y) / q.rect.h));
    if (piece) return { id: subjectSel(piece.id), mode: 'move', cursor: 'grab' };
    const back = textAt(true);
    return back ? { id: back.id, mode: 'move', cursor: 'grab' } : null;
  }
  // เมาส์ชี้ตรงไหน: ในกรอบกลุ่ม = จับย้ายได้ · ที่จับ/ชิ้น = ตาม hitTest
  const cursorAt = (e: PointerEvent<HTMLCanvasElement>) =>
    busy ? 'default' : groupFrame && inside(toPoster(e), groupFrame) ? 'grab' : (hitTest(e)?.cursor ?? 'default');
  function startGroupDrag(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.style.cursor = 'grabbing';
    // ข้อความยังจัดตามแบบ = แยกเป็นชิ้นก่อน (เหมือนลากชิ้นเดียวครั้งแรก)
    const base = Object.keys(doc.items).length ? doc : { ...doc, items: separateItems(doc, activeFont) };
    if (base !== doc) setDoc(base);
    const texts = graphicItems(base, activeFont).filter((i) => members.includes(i.id));
    const subs = pieces.filter((q) => members.includes(subjectSel(q.id)));
    drag.current = {
      id: 'group',
      ...toPoster(e),
      texts: texts.map((i) => ({ id: i.id, place: i.place })),
      subs: subs.map((q) => ({ id: q.id, start: q.place })),
      lo: {
        x: Math.max(-Infinity, ...texts.map((i) => -i.bounds.x), ...subs.map((q) => -q.place.x)),
        y: Math.max(-Infinity, ...texts.map((i) => -i.bounds.y), ...subs.map((q) => -q.place.y)),
      },
      hi: {
        x: Math.min(Infinity, ...texts.map((i) => 1 - i.bounds.x - i.bounds.w), ...subs.map((q) => 1 - q.place.x)),
        y: Math.min(Infinity, ...texts.map((i) => 1 - i.bounds.y - i.bounds.h), ...subs.map((q) => 1 - q.place.y)),
      },
    };
  }
  // ปล่อยกรอบ: ชิ้นที่อยู่ในกรอบทั้งชิ้น · 2 ชิ้นขึ้นไป = กลุ่ม · ชิ้นเดียว = เลือกชิ้นนั้นตามปกติ
  function selectInside(r: Rect) {
    const eps = 0.005;
    const within = (b: Rect) =>
      b.x >= r.x - eps && b.y >= r.y - eps && b.x + b.w <= r.x + r.w + eps && b.y + b.h <= r.y + r.h + eps;
    const ids: Sel[] = [
      ...items.filter((i) => within(i.bounds)).map((i) => i.id),
      ...placedShown.filter((q) => within(clip(q.rect))).map((q) => subjectSel(q.id)),
    ];
    if (ids.length > 1) {
      setGroup({ key: groupKey, ids });
      setSelected(null);
    } else if (ids.length === 1) {
      setSelected(ids[0]);
      if (isSubjectSel(ids[0])) setActiveId(ids[0].slice('subject:'.length));
    }
  }
  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    if (busy) return;
    // แตะในกรอบกลุ่ม = ลากทุกชิ้นในกลุ่มพร้อมกัน
    if (groupFrame && inside(toPoster(e), groupFrame)) return startGroupDrag(e);
    const hit = hitTest(e);
    if (group.ids.length) setGroup({ key: '', ids: [] });
    if (!hit) {
      // แตะที่ว่าง = เลิกเลือก + เริ่มลากกรอบเลือกหลายชิ้น
      setSelected(null);
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { id: 'marquee', ...toPoster(e) };
      return;
    }
    setSelected(hit.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.style.cursor = hit.mode === 'move' ? 'grabbing' : hit.cursor;
    if (isSubjectSel(hit.id)) {
      const pieceId = hit.id.slice('subject:'.length);
      const piece = pieces.find((q) => q.id === pieceId);
      if (!piece) return;
      drag.current = { id: 'subject', piece: pieceId, mode: hit.mode, ...toPoster(e), start: piece.place };
      setActiveId(pieceId); // แผงขั้นที่ 1 แสดงรูปนี้
      // แตะชิ้นไหน = ชิ้นนั้นขึ้นหน้า (ซ้อนกันได้ เลือกเองว่าชิ้นไหนอยู่หน้า)
      if (pieces.some((q) => q.z > piece.z)) patchPiece(pieceId, { z: ++zRef.current });
      return;
    }
    const textId = hit.id;
    // ขยับครั้งแรก: ทุกชิ้นได้ตำแหน่งของตัวเองจากที่เห็นอยู่ (แยกกันตั้งแต่นี้)
    const base = Object.keys(doc.items).length ? doc : { ...doc, items: separateItems(doc, activeFont) };
    if (base !== doc) setDoc(base);
    const it = graphicItems(base, activeFont).find((i) => i.id === textId);
    if (!it) return;
    // เริ่มจากตำแหน่งที่เห็นจริง (ชิ้นที่ถูกดันกลับเข้าโปสเตอร์) ไม่งั้นลากแล้วไม่ขยับช่วงแรก
    drag.current = {
      id: textId,
      mode: hit.mode,
      ...toPoster(e),
      doc: base,
      place: it.place,
      bounds: it.bounds,
      raw: it.raw,
    };
  }
  // ระยะจากจุดกลาง (หน่วยเดียวกันทั้งแนวนอน/ตั้ง)
  const distFrom = (c: { x: number; y: number }) => (q: { x: number; y: number }) =>
    Math.hypot(q.x - c.x, (q.y - c.y) / aspectRatio(doc.aspect));
  // ตัวหลัก: ย้าย (จุดกลางอยู่ในโปสเตอร์) · มุม = ขนาด (สัดส่วนเดิม จุดกลางอยู่ที่เดิม)
  function dragSubject(d0: Extract<Drag, { id: 'subject' }>, p: { x: number; y: number }): SubjectPlace {
    const s0 = d0.start;
    if (d0.mode !== 'size') return { ...s0, x: clamp(s0.x + p.x - d0.x, 0, 1), y: clamp(s0.y + p.y - d0.y, 0, 1) };
    const dist = distFrom(s0);
    return { ...s0, h: clamp((s0.h * dist(p)) / Math.max(1e-3, dist(d0)), SUBJECT_MIN, SUBJECT_MAX) };
  }
  function dragTo(d0: TextDrag, p: { x: number; y: number }): GraphicPlace | null {
    const p0 = d0.place;
    if (d0.mode === 'move') {
      const b = d0.bounds;
      return {
        ...p0,
        x: p0.x + clamp(p.x - d0.x, -b.x, 1 - b.x - b.w),
        y: p0.y + clamp(p.y - d0.y, -b.y, 1 - b.y - b.h),
      };
    }
    if (d0.mode === 'size') {
      // ขยายทั้งขนาดและความกว้าง = หน้าตาเดิม ใหญ่/เล็กลง · จุดกลางของชิ้นอยู่ที่เดิม
      const c = { x: d0.raw.x + d0.raw.w / 2, y: d0.raw.y + d0.raw.h / 2 };
      const dist = distFrom(c);
      const size = clamp((p0.size * dist(p)) / Math.max(1e-3, dist(d0)), SIZE_MIN, SIZE_MAX);
      const place = { ...p0, size, w: clamp((p0.w * size) / p0.size, WIDTH_MIN, WIDTH_MAX) };
      const next = graphicItems({ ...d0.doc, items: { ...d0.doc.items, [d0.id]: place } }, fontSpecOf(d0.doc)).find(
        (i) => i.id === d0.id,
      );
      if (!next || next.raw.w > 1 || next.raw.h > 1) return null; // ใหญ่กว่าโปสเตอร์ = หยุดที่ขนาดก่อนหน้า
      return {
        ...place,
        x: place.x + c.x - (next.raw.x + next.raw.w / 2),
        y: place.y + c.y - (next.raw.y + next.raw.h / 2),
      };
    }
    // ข้างขวา: ขอบซ้ายอยู่ที่เดิม · ข้างซ้าย: ขอบขวาอยู่ที่เดิม
    const move = p.x - d0.x;
    const w = clamp(p0.w + (d0.mode === 'right' ? move : -move), WIDTH_MIN, WIDTH_MAX);
    const edge = d0.mode === 'right' ? p0.x - p0.w / 2 : p0.x + p0.w / 2;
    return { ...p0, w, x: d0.mode === 'right' ? edge + w / 2 : edge - w / 2 };
  }
  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const d0 = drag.current;
    if (!d0) {
      e.currentTarget.style.cursor = cursorAt(e);
      return;
    }
    const p = toPoster(e);
    if (d0.id === 'marquee') return setMarquee(dragRect(d0, p));
    if (d0.id === 'group') {
      const dx = clamp(p.x - d0.x, d0.lo.x, d0.hi.x),
        dy = clamp(p.y - d0.y, d0.lo.y, d0.hi.y);
      if (d0.texts.length)
        setDoc((d) => ({
          ...d,
          items: {
            ...d.items,
            ...Object.fromEntries(d0.texts.map((t) => [t.id, { ...t.place, x: t.place.x + dx, y: t.place.y + dy }])),
          },
        }));
      if (d0.subs.length)
        setPieces((ps) =>
          ps.map((q) => {
            const s = d0.subs.find((x) => x.id === q.id);
            return s ? { ...q, place: { ...s.start, x: s.start.x + dx, y: s.start.y + dy } } : q;
          }),
        );
      return;
    }
    if (d0.id === 'subject') return patchPiece(d0.piece, { place: dragSubject(d0, p) });
    const place = dragTo(d0, p);
    if (place) setDoc((d) => ({ ...d, items: { ...d.items, [d0.id]: place } }));
  }
  function onPointerUp(e: PointerEvent<HTMLCanvasElement>) {
    const d0 = drag.current;
    drag.current = null;
    if (d0?.id === 'marquee') {
      setMarquee(null);
      const r = dragRect(d0, toPoster(e));
      if (r.w > 0.01 || r.h > 0.01) selectInside(r); // แตะเฉยๆ (ไม่ได้ลาก) = แค่เลิกเลือก
    }
    e.currentTarget.style.cursor = cursorAt(e);
  }

  // จัดข้อความ: ชิ้นที่เลือกอยู่ หรือทุกชิ้น (ไม่ได้เลือก)
  const selText = selected && !isSubjectSel(selected) ? selected : null;
  // ปุ่ม Delete / Backspace = ลบชิ้นข้อความที่เลือกบนภาพ (ไม่ใช่ตอนพิมพ์ในช่อง) · ตัวหลักไม่ถูกลบด้วยปุ่มนี้
  const deleteTargets = selText ? [selText] : groupTexts;
  const deleteKey = deleteTargets.join(',');
  useEffect(() => {
    if (!deleteKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      e.preventDefault();
      hideParts(deleteKey.split(',') as SectionId[]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteKey, hideParts]);
  function setAlign(a: Align) {
    // ชิ้นที่เลือก / ข้อความในกลุ่มที่ลากกรอบเลือก / ไม่ได้เลือก = ทุกชิ้น
    const targets = selText ? [selText] : groupTexts;
    setDoc((d) => {
      if (targets.length) {
        const items = { ...(Object.keys(d.items).length ? d.items : separateItems(d, fontSpecOf(d))) };
        for (const id of targets) {
          const it = items[id];
          if (it) items[id] = { ...it, align: a };
        }
        return { ...d, items };
      }
      const items = Object.fromEntries(Object.entries(d.items).map(([id, it]) => [id, { ...it, align: a }]));
      return { ...d, place: { ...d.place, align: a }, items };
    });
  }
  const alignNow =
    (selText && doc.items[selText]?.align) || (groupTexts[0] && doc.items[groupTexts[0]]?.align) || doc.place.align;

  const setOwnBg = (p: Photo) => {
    setBgPhoto(p);
    setDoc((d) => ({ ...d, bg: { kind: 'photo' } }));
  };

  const cur = STEPS[step];
  let panel: ReactNode = null;
  if (cur.key === 'subject') {
    const n = pieces.length;
    const a = active;
    panel = (
      <Section
        title="รูปของคุณ"
        note={
          n > 1
            ? `${n} รูป · AI จัดเป็นช็อตเดียวกัน`
            : wholeOn
              ? 'ส่งทั้งรูปให้ AI'
              : EXACT_PLACEMENT
                ? 'ตัดพื้นหลังแล้ววางบนโปสเตอร์'
                : 'ตัดพื้นหลังแล้ว AI จัดวางให้เข้ากับฉาก'
        }
      >
        {!a ? (
          <div className="grid" style={{ '--grid-columns': 2 } as CSSProperties}>
            <AddCard onFile={(f) => void addSubjects([f])} />
          </div>
        ) : (
          <>
            {/* ตัวหลักหลายรูป (23 พ.ย.): แตะรูปเล็ก = แก้การตัดของรูปนั้น · × = เอาออก · + = เพิ่ม (ไม่เกิน POSTER_SUBJECTS_MAX)
                ใช้หน้าตาเดียวกับแถวรูปของสินค้าในหน้าสินค้า (.current-product-photos) */}
            <div className="current-product-photos poster-pieces">
              {pieces.map((p, i) => (
                <figure key={p.id} className={p.id === a.id ? 'is-main' : undefined}>
                  <button
                    type="button"
                    className="current-product-pick"
                    aria-pressed={p.id === a.id}
                    title={`ตัวหลัก ${i + 1}`}
                    onClick={() => setActiveId(p.id)}
                  >
                    <img src={p.photo.url} alt={`ตัวหลัก ${i + 1}`} />
                    <span className="current-product-main">{i + 1}</span>
                  </button>
                  <button
                    type="button"
                    className="current-product-remove"
                    aria-label={`เอารูปตัวหลัก ${i + 1} ออก`}
                    title="เอาออก"
                    disabled={busy !== null}
                    onClick={() => removePiece(p.id)}
                  >
                    ×
                  </button>
                </figure>
              ))}
              {n < POSTER_SUBJECTS_MAX && (
                <label className={'current-product-add' + (busy !== null ? ' busy' : '')} title="เพิ่มตัวหลักอีกรูป">
                  <span aria-hidden="true">+</span>
                  <input
                    type="file"
                    aria-label="เพิ่มตัวหลักอีกรูป"
                    accept="image/*,.heic,.heif"
                    multiple
                    disabled={busy !== null}
                    onChange={(e) => {
                      const files = [...(e.target.files ?? [])];
                      e.target.value = '';
                      if (files.length) void addSubjects(files);
                    }}
                  />
                </label>
              )}
            </div>
            {/* แตะที่ของในรูป = เลือกเป็นตัวหลัก (เพิ่มได้หลายชิ้น) · ส่วนที่มืด = ตัดออก */}
            <div className={'poster-photo poster-cut' + (a.busy ? ' busy' : '')}>
              {activePreview ? (
                <canvas
                  ref={cutRef}
                  onPointerDown={(e) => void tapCutAt(e)}
                  aria-label={`รูปตัวหลัก${n > 1 ? ` ${pieces.indexOf(a) + 1}` : ''} แตะที่ของที่ต้องการเพื่อเลือก`}
                />
              ) : (
                <img src={a.photo.url} alt="รูปตัวหลัก" />
              )}
              {a.busy && <div className="poster-cut-busy">กำลังตัดพื้นหลัง...</div>}
            </div>
            <p className="note">
              {wholeOn
                ? 'ไม่ตัดพื้นหลัง: AI เลือกตัวหลักจากรูปเอง และวางขนาดเอง'
                : !a.work
                  ? a.busy
                    ? 'กำลังเตรียมตัดพื้นหลัง...'
                    : 'ตัดพื้นหลังไม่สำเร็จ กด "ตัดคนอัตโนมัติ" เพื่อลองใหม่'
                  : a.image
                    ? `${a.auto ? 'ตัดคนออกมาให้แล้ว' : 'เลือกแล้ว'} · ส่วนที่มืด = ตัดออก · แตะของในรูปเพื่อเลือกเพิ่ม · ${EXACT_PLACEMENT ? (n > 1 ? 'วางบนโปสเตอร์คร่าวๆ ว่าทั้งกลุ่มอยู่ตรงไหน ใหญ่แค่ไหน · AI จัดทุกชิ้นเป็นช็อตเดียวกันให้ (มุมกล้องเดียวกัน ขนาดจริง วางซ้อนกันได้)' : 'ลากบนโปสเตอร์เพื่อย้าย ลากมุมเพื่อปรับขนาด') : n > 1 ? 'วางบนโปสเตอร์คร่าวๆ ว่าอยากให้ทั้งกลุ่มอยู่ตรงไหน · AI จัดทุกชิ้นเป็นช็อตเดียวกันให้ (มุมกล้องเดียวกัน ขนาดจริง วางซ้อนกันได้) รายละเอียดเหมือนรูปเดิม' : 'วางบนโปสเตอร์คร่าวๆ ว่าอยากให้อยู่ตรงไหน · AI จัดที่วาง ขนาด และมุมกล้องให้เข้ากับฉากเอง รายละเอียดเหมือนรูปเดิม'}`
                    : 'แตะที่ตัวหลักในรูป (เช่น อาหาร สินค้า) เพื่อตัดพื้นหลัง แตะหลายชิ้นได้'}
            </p>
            <div className="chips poster-cut-actions">
              {!wholeOn && a.image && (
                <button type="button" className="chip" disabled={a.busy} onClick={() => clearCut(a.id)}>
                  ล้าง แตะเลือกใหม่
                </button>
              )}
              {!wholeOn && (
                <button
                  type="button"
                  className="chip"
                  disabled={a.busy}
                  onClick={() => void runAutoCut(a.id, a.photo.img)}
                >
                  ตัดคนอัตโนมัติ
                </button>
              )}
              {/* ไม่ตัดพื้นหลังได้เฉพาะรูปเดียว: หลายรูปต้องตัดเพื่อวางแยกกัน */}
              {n === 1 && (
                <button
                  type="button"
                  aria-pressed={wholeOn}
                  className={'chip' + (wholeOn ? ' active' : '')}
                  disabled={a.busy}
                  onClick={() => {
                    setWhole((w) => !w);
                    setSelected(null);
                  }}
                >
                  ไม่ตัดพื้นหลัง
                </button>
              )}
            </div>
            <FileButton
              label={n > 1 ? 'เปลี่ยนรูปนี้' : 'เปลี่ยนรูป'}
              onFile={(f) => void addPhoto(f, (photo) => addPiece(photo, a.id))}
            />
          </>
        )}
        <p className="note">
          รูปที่เห็นของชัด ไม่มีของอื่นบัง ได้ผลดีที่สุด · สินค้า อาหาร หรือคนก็ได้ · ใส่ได้ {POSTER_SUBJECTS_MAX} รูป (เช่น อาหาร + เครื่องดื่ม)
        </p>
      </Section>
    );
  } else if (cur.key === 'bg') {
    const sceneBtn = (s: (typeof POSTER_SCENES)[number]) => {
      const active = doc.bg.kind === 'scene' && doc.bg.id === s.id;
      return (
        <button
          key={s.id}
          type="button"
          aria-pressed={active}
          className={'option' + (active ? ' active' : '')}
          onClick={() => setDoc((d) => ({ ...d, bg: { kind: 'scene', id: s.id } }))}
        >
          <SceneArt
            id={s.id}
            className="scene-preview scene-art"
            color={s.kind === 'design' ? palette.accent : undefined}
          />
          <b>{s.name}</b>
          <small>{s.note}</small>
        </button>
      );
    };
    panel = (
      <>
        {/* AI ออกแบบพื้นหลังเอง (ผู้ใช้ 24 พ.ย.): จากสินค้าในรูป คำบนกราฟิก และสีที่เลือก · แบบหลัก อยู่บนสุด */}
        {/* สไตล์ภาพ (ผู้ใช้ 25 พ.ย. จากโปสเตอร์ตัวอย่าง Nina Simone / Atlanta Jazz): ทั้งภาพ รวมตัวหลัก ใช้ได้กับฉากทุกแบบ
            การ์ดวาดเป็นโปสเตอร์ย่อ · เลือกขาวดำ/ภาพวาด = ได้กราฟิกข้อความและสีที่คู่กันด้วย (แก้ในขั้นกราฟิกได้) */}
        <Section title="สไตล์ภาพ" note="ทั้งภาพ รวมสินค้า / คน">
          <div className="options poster-options">
            {POSTER_LOOKS.map((l) => {
              const active = (doc.look ?? 'photo') === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={active}
                  className={'option' + (active ? ' active' : '')}
                  onClick={() => chooseLook(l.id)}
                >
                  <LookArt id={l.id} className="scene-preview scene-art" />
                  <b>{l.name}</b>
                  <small>{l.note}</small>
                </button>
              );
            })}
          </div>
        </Section>
        <Section title="ให้ AI ออกแบบ" note="แนะนำ">
          <div className="options poster-options">{sceneBtn(DESIGN_SCENE)}</div>
          <p className="note">ออกแบบพื้นหลังจากสินค้าในรูป คำบนกราฟิก และสีที่เลือกในขั้นกราฟิก (เช่น ชานม = ไข่มุกลอย น้ำกระเซ็น)</p>
        </Section>
        <Section title="ฉากถ่ายอาหาร / สินค้า" note="สตูดิโอ / แสงธรรมชาติ">
          <div className="options poster-options">{POSTER_SCENES.filter((s) => s.kind === 'stage').map(sceneBtn)}</div>
        </Section>
        <Section title="พื้นหลังกราฟิก" note="ภาพวาด / ลายกราฟิก">
          <div className="options poster-options">
            {POSTER_SCENES.filter((s) => s.kind === 'graphic').map(sceneBtn)}
          </div>
        </Section>
        <Section title="รูปฉากของฉัน" note="เช่น ในร้าน โต๊ะ หน้าร้านจริง">
          {!bgPhoto ? (
            <div className="grid" style={{ '--grid-columns': 2 } as CSSProperties}>
              <AddCard onFile={(f) => void addPhoto(f, setOwnBg)} />
            </div>
          ) : (
            <>
              <button
                type="button"
                aria-pressed={doc.bg.kind === 'photo'}
                className={'poster-photo pick' + (doc.bg.kind === 'photo' ? ' active' : '')}
                onClick={() => setDoc((d) => ({ ...d, bg: { kind: 'photo' } }))}
              >
                <img src={bgPhoto.url} alt="รูปฉากของฉัน" />
              </button>
              <FileButton label="เปลี่ยนรูปฉาก" onFile={(f) => void addPhoto(f, setOwnBg)} />
            </>
          )}
        </Section>
      </>
    );
  } else if (cur.key === 'text') {
    const countGroup = (g: 'all' | 'food' | 'ecommerce' | 'general') =>
      g === 'all'
        ? GRAPHIC_CHOICES.length
        : GRAPHIC_CHOICES.filter((t) => (t.group ?? 'general') === g || t.alsoIn === g).length;
    const TPL_GROUPS = [
      { id: 'all', name: `ทั้งหมด (${countGroup('all')})` },
      { id: 'food', name: `อาหาร & คาเฟ่ (${countGroup('food')})` },
      { id: 'ecommerce', name: `อีคอมเมิร์ซ & โปร (${countGroup('ecommerce')})` },
      { id: 'general', name: `ทั่วไป (${countGroup('general')})` },
    ];
    const q = tplQuery.trim().toLowerCase();
    const byGroup =
      tplGroup === 'all'
        ? GRAPHIC_CHOICES
        : GRAPHIC_CHOICES.filter((t) => (t.group ?? 'general') === tplGroup || t.alsoIn === tplGroup);
    const shownTemplates = q
      ? byGroup.filter(
          (t) => t.name.toLowerCase().includes(q) || t.note.toLowerCase().includes(q) || t.id.toLowerCase().includes(q),
        )
      : byGroup;
    const pairedFields: FieldId[] = tpl.fields.some((f) => f.id === 'price1')
      ? ['bullet1', 'price1', 'bullet2', 'price2', 'bullet3', 'price3']
      : tpl.id === 'bundle' || tpl.id === 'priceburst' || tpl.id === 'steakhouse' || tpl.id === 'setmeal'
        ? ['oldPrice', 'price']
        : [];
    panel = (
      <>
        {/* รายการแบบกราฟิกแสดงตลอด (ผู้ใช้ 24 พ.ย.: เอาหัวข้อพับ "แบบกราฟิกที่ใช้ · เปลี่ยนแบบ" ออก ไม่ซ่อนตอนเลือก) */}
        <Section title="แบบกราฟิก" note={`${shownTemplates.length} แบบ`}>
          <div className="poster-template-groups">
            <ChipGroup
              options={TPL_GROUPS}
              value={tplGroup}
              onChange={(g) => setTplGroup(g as 'all' | 'food' | 'ecommerce' | 'general')}
            />
            <input
              type="search"
              className="text-input poster-template-search"
              value={tplQuery}
              onChange={(e) => setTplQuery(e.target.value)}
              placeholder="ค้นหาแบบกราฟิก เช่น บุฟเฟต์, ญี่ปุ่น, Shopee, สเปก..."
              aria-label="ค้นหาแบบกราฟิก"
            />
          </div>
          <div className="options poster-options poster-template-options">
            {shownTemplates.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={doc.template === t.id}
                className={'option' + (doc.template === t.id ? ' active' : '')}
                onClick={() => chooseTemplate(t.id)}
              >
                <TemplateThumb tpl={t} palette={doc.palette} fontsReady={fontsReady} />
                <b>{t.name}</b>
                <small>{t.note}</small>
              </button>
            ))}
          </div>
        </Section>
        <Section title="ข้อความบนกราฟิก" note={shown ? 'แก้ได้เลย' : undefined}>
          <div className="poster-copy-fields">
            {tpl.fields.map((f) => (
              <label key={f.id} className={'field' + (pairedFields.includes(f.id) ? '' : ' poster-copy-full')}>
                {f.label}
                <input
                  value={doc.texts[f.id] ?? ''}
                  maxLength={f.max}
                  placeholder={f.sample}
                  onChange={(e) => setText(f.id, e.target.value)}
                />
              </label>
            ))}
          </div>
          {/* ชิ้นบนกราฟิก (ผู้ใช้ 25 พ.ย.): × = ลบชิ้นนั้น (เส้นคั่นด้วย) · ลบแล้วเป็นเส้นประ แตะเพื่อเอากลับ */}
          <div className="poster-parts">
            <span className="poster-parts-label">ชิ้นบนกราฟิก</span>
            <div className="chips">
              {tpl.sections.map((id) => {
                const off = !!doc.hidden?.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    className={'chip poster-part' + (off ? ' is-off' : '')}
                    aria-pressed={!off}
                    aria-label={`${off ? 'เอากลับ' : 'ลบ'} ${sectionName(tpl, id)}`}
                    title={off ? 'แตะเพื่อเอากลับ' : 'แตะเพื่อลบชิ้นนี้'}
                    onClick={() => (off ? showPart(id) : hideParts([id]))}
                  >
                    {sectionName(tpl, id)}
                    <span aria-hidden="true">{off ? '+' : '×'}</span>
                  </button>
                );
              })}
            </div>
            <p className="note">แตะ × เพื่อลบชิ้นนั้น หรือแตะชิ้นบนภาพแล้วกด Delete · ชิ้นที่ลบแล้วแตะอีกครั้งเพื่อเอากลับ</p>
          </div>
        </Section>
        <details className="poster-graphic-style" open={selText ? true : undefined}>
          <summary>สีและการจัดข้อความ</summary>
          <Section
            title="จัดข้อความ"
            note={
              selText
                ? `ชิ้นที่เลือก: ${sectionName(tpl, selText)}`
                : groupTexts.length
                  ? `${groupTexts.length} ชิ้นที่เลือก`
                  : 'ทุกชิ้น'
            }
          >
            <ChipGroup options={ALIGN_OPTIONS} value={alignNow} onChange={(a) => setAlign(a as Align)} />
            {deleteTargets.length > 0 && (
              <button type="button" className="poster-color-forget" onClick={() => hideParts(deleteTargets)}>
                {deleteTargets.length > 1 ? `ลบ ${deleteTargets.length} ชิ้นที่เลือก` : 'ลบชิ้นที่เลือก'}
              </button>
            )}
          </Section>
          <Section title="ฟอนต์" note={POSTER_FONTS.find((f) => f.id === fontId)?.note}>
            <div className="chips">
              {POSTER_FONTS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  title={`${f.display} (${f.note})`}
                  aria-pressed={fontId === f.id}
                  className={'chip' + (fontId === f.id ? ' active' : '')}
                  style={{ fontFamily: FONT_MAP[f.id].display }}
                  onClick={() => setDoc((d) => ({ ...d, font: f.id }))}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </Section>
          <Section title="สไตล์ตัวอักษร" note={POSTER_EFFECTS.find((e) => e.id === effectId)?.note}>
            <div className="chips">
              {POSTER_EFFECTS.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  title={e.note}
                  aria-pressed={effectId === e.id}
                  className={'chip' + (effectId === e.id ? ' active' : '')}
                  onClick={() => setDoc((d) => ({ ...d, effect: e.id }))}
                >
                  {e.name}
                </button>
              ))}
            </div>
          </Section>
          <Section
            title="สี"
            note={savedColors.includes(doc.palette) ? `สีของฉัน ${doc.palette.toUpperCase()}` : palette.name}
          >
            <div className="chips">
              {POSTER_PALETTES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={p.name}
                  aria-label={p.name}
                  aria-pressed={doc.palette === p.id}
                  className={'swatch' + (doc.palette === p.id ? ' active' : '')}
                  style={{ background: `linear-gradient(135deg, ${p.accent} 0 55%, ${p.ink} 55%)` }}
                  onClick={() => setDoc((d) => ({ ...d, palette: p.id }))}
                />
              ))}
              {savedColors.map((c) => {
                const p = customPalette(c);
                return (
                  <button
                    key={c}
                    type="button"
                    title={`สีของฉัน ${c.toUpperCase()}`}
                    aria-label={`สีของฉัน ${c.toUpperCase()}`}
                    aria-pressed={doc.palette === c}
                    className={'swatch' + (doc.palette === c ? ' active' : '')}
                    style={{ background: `linear-gradient(135deg, ${p.accent} 0 55%, ${p.ink} 55%)` }}
                    onClick={() => setDoc((d) => ({ ...d, palette: c }))}
                  />
                );
              })}
              {/* สีที่เลือกเอง (ผู้ใช้ 24 พ.ย.): ตัวเลือกสีของเครื่อง เริ่มจากสีหลักที่ใช้อยู่ · สีตัวอักษร/พื้นอ่อนคิดจากสีนี้ (customPalette)
                  ระหว่างเลือก (ยังไม่อยู่ในสีของฉัน) วงนี้แสดงสีนั้น · ปิดตัวเลือกแล้วสีไปอยู่ในสีของฉัน วงนี้กลับเป็นสีรุ้ง */}
              <label
                title="เลือกสีเอง"
                className={'swatch swatch-custom' + (customNow ? ' active' : '')}
                style={
                  customNow
                    ? { background: `linear-gradient(135deg, ${palette.accent} 0 55%, ${palette.ink} 55%)` }
                    : undefined
                }
              >
                <input
                  ref={colorInput}
                  type="color"
                  aria-label="เลือกสีเอง"
                  value={palette.accent.toLowerCase()}
                  onChange={(e) => setDoc((d) => ({ ...d, palette: e.target.value.toLowerCase() }))}
                />
              </label>
            </div>
            {savedColors.includes(doc.palette) && (
              <button type="button" className="poster-color-forget" onClick={() => forgetColor(doc.palette)}>
                เอาสีนี้ออกจากสีของฉัน
              </button>
            )}
          </Section>
        </details>
      </>
    );
  } else
    panel = (
      <Section title="ใช้ภาพที่ไหน" note={`สัดส่วน ${doc.aspect}`}>
        <div className="options aspect-options">
          {POSTER_ASPECTS.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={doc.aspect === a.id}
              className={'option aspect-option' + (doc.aspect === a.id ? ' active' : '')}
              onClick={() => setDoc((d) => ({ ...d, aspect: a.id }))}
            >
              <span className="aspect-slot" aria-hidden="true">
                <i className="aspect-frame" style={{ aspectRatio: a.id.replace(':', ' / ') }} />
              </span>
              <span>
                <b>{a.name}</b>
                <small>
                  {a.use} · {a.id}
                </small>
              </span>
            </button>
          ))}
        </div>
      </Section>
    );
  // สั่งเพิ่มเติม (ผู้ใช้ 23 พ.ย.): ท้ายขั้นสุดท้าย ใกล้ปุ่มสร้างภาพ เหมือนหน้านางแบบ/สินค้า
  if (cur.key === 'size')
    panel = (
      <>
        {panel}
        <Section title="สั่งเพิ่มเติม" note="ไม่ใส่ก็ได้">
          <textarea
            className="text-input"
            value={doc.extra}
            maxLength={POSTER_EXTRA_MAX}
            onChange={(e) => setDoc((d) => ({ ...d, extra: e.target.value }))}
            placeholder="เช่น ให้สองคนยิ้มกว้างขึ้น, บรรยากาศตอนพลบค่ำ, วางจานบนโต๊ะไม้"
          />
        </Section>
      </>
    );

  const hint = shown
    ? stale
      ? 'ย้ายกราฟิกหลังสร้างแล้ว: ภาพนี้จัดไว้สำหรับกราฟิกตำแหน่งเดิม กด สร้างภาพด้วย AI ใหม่ได้'
      : null
    : !pieces.length
      ? 'เพิ่มรูปสินค้า / อาหารในขั้นที่ 1'
      : doc.bg.kind === 'photo' && !bgPhoto
        ? 'เพิ่มรูปฉากของคุณในขั้นที่ 2'
        : scene?.kind === 'design'
          ? 'ตัวอย่างสีหลักของกราฟิก · AI จะออกแบบพื้นหลังจากสินค้า คำบนกราฟิก และสีนี้ จัดภาพให้เข้ากับกราฟิก'
          : `ตัวอย่าง${doc.bg.kind === 'photo' ? 'จากรูปฉากของคุณ' : `สีของ "${scene?.name ?? 'ฉาก'}"`} · AI จะวางรูปของคุณลงในฉาก จัดภาพให้เข้ากับกราฟิกนี้`;
  const checkList = Object.values(checks ?? {});
  const inks = new Set(checkList.map((c) => c?.ink));
  const checkText = checkList.length
    ? `พื้นใต้กราฟิก${checkList.some((c) => c?.busy) ? 'ค่อนข้างยุ่ง' : 'เรียบ'} · ตัวอักษร${inks.size > 1 ? 'สีตามพื้นแต่ละชิ้น' : inks.has('light') ? 'สีขาว' : 'สีเข้ม'}`
    : '';

  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <PageSwitch current="poster" />
        <div className="top-actions">
          <GalleryLink />
          <TokenUsage />
          <AccountMenu />
        </div>
      </header>

      <div className="workspace">
        <nav className="rail" aria-label="ขั้นตอน">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              className={'rail-btn' + (step === i ? ' active' : '')}
              onClick={() => setStep(i)}
              aria-current={step === i ? 'step' : undefined}
            >
              <span className="n">{i + 1}</span>
              <s.Icon />
              <span>{s.label}</span>
            </button>
          ))}
        </nav>

        <aside className="panel has-bar">
          <div className="panel-body">
            <div className="panel-head">
              <span className="num">{step + 1}</span>
              <h2>{cur.title}</h2>
            </div>
            {panel}
          </div>
          <div className="sticky-bar">
            {step < STEPS.length - 1 && (
              <button className="btn bar-next btn-secondary" disabled={busy !== null} onClick={() => setStep(step + 1)}>
                ถัดไป: {STEPS[step + 1].label} →
              </button>
            )}
            <button className="btn btn-primary" disabled={busy !== null} onClick={() => void generate()}>
              <IconSparkle /> สร้างภาพด้วย AI
            </button>
          </div>
        </aside>

        <section className="stage">
          <div className={'frame poster-stage' + (busy !== null ? ' busy' : '')}>
            <figure>
              <canvas
                ref={stageRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                aria-label="ตัวอย่างโปสเตอร์ แตะข้อความแต่ละชิ้นแล้วลากเพื่อย้าย ลากมุมเพื่อปรับขนาด ลากข้างเพื่อปรับความกว้าง ลากที่ว่างเป็นกรอบเพื่อเลือกหลายชิ้นแล้วย้ายพร้อมกัน"
              />
            </figure>
            {hint && (
              <div className="frame-hint" role="status">
                {hint}
              </div>
            )}
            <div className="overlay">
              <div className="spinner" />
              <div>{busy}</div>
            </div>
          </div>
          <div className="stage-tools">
            <button
              className="btn btn-secondary tool"
              disabled={busy !== null || !shown}
              onClick={() => void download()}
            >
              <IconDownload /> ดาวน์โหลด
            </button>
            {canRevert && (
              <button
                className="btn btn-secondary tool"
                disabled={busy !== null}
                title="กลับไปเป็นข้อความ ตำแหน่ง และสีตอนสร้างภาพนี้ (ชิ้นที่ลบกลับมาด้วย)"
                onClick={revertGraphic}
              >
                คืนกราฟิกตอนสร้าง
              </button>
            )}
            <div className="caption">
              {shown
                ? [
                    checkText,
                    unsaved || saving ? 'กำลังบันทึกกราฟิก...' : savedSrc === shown.src ? 'บันทึกกราฟิกกับภาพนี้แล้ว' : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : ''}
            </div>
          </div>
          {past.length > 0 && (
            <>
              <div className="history-head">
                ภาพที่สร้างแล้ว <span>{past.length}</span>
              </div>
              <div className="history">
                <button
                  type="button"
                  className={'new-tile' + (shot ? '' : ' active')}
                  aria-pressed={!shot}
                  title="โปสเตอร์ใหม่ที่ทำค้างไว้"
                  onClick={() => showOutput(null)}
                >
                  <span className="new-plus" aria-hidden="true">
                    +
                  </span>
                  <span>รูปใหม่</span>
                </button>
                {past.map((p) => (
                  <button
                    key={p.src}
                    type="button"
                    className={shot?.src === p.src ? 'active' : undefined}
                    title={p.caption}
                    onClick={() => void pickPast(p)}
                  >
                    <img src={thumbSrc(p.src)} alt={p.caption} loading="lazy" decoding="async" />
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
