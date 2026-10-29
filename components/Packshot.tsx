'use client';
// Packshot: หน้าสินค้า — เลือกสินค้า + ประเภทภาพ + ฉาก + พร็อพ + มุม/ระยะ -> AI สร้างรูปสินค้า -> ดาวน์โหลด
// โครงหน้าเหมือนหน้านางแบบ (components/TryOn.tsx) และใช้ class CSS ชุดเดียวกัน: เมนูขั้นตอนซ้าย แผงเลือก รูปตรงกลาง แผงปรับแต่งขวา
// หน้าเว็บส่งแค่ id ของตัวเลือก (lib/packshot.ts) ไป app/api/packshot แล้ว server แปลงเป็นคำสั่งเอง
// คลังรูปแยกจากหน้านางแบบ: สินค้า / ช็อตต้นแบบ / รูปฉาก (KINDS ใน lib/storage.ts) รูปที่สร้างติดป้าย page = 'product'
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import ImageViewer from './ImageViewer';
import LocalEditDialog, { type LocalEditRequest } from './LocalEditDialog';
import ProductLibrary from './ProductLibrary';
import CreativeShot from './CreativeShot';
import { type CreativeConcept } from '@/lib/creative';
import { productGroups, productSources, type ProductGroup, type ProductPhoto } from '@/lib/product-groups';
import { SignOutButton } from './AuthForm';
import {
  IconAngle, IconBag, IconCopy, IconDownload, IconFrame, IconLeaf, IconPalette, IconRetouch, IconScene, IconSearch, IconSettings,
} from './icons';
import { AddCard, Card, ChipGroup, DeleteButton, PageSwitch, PendingCard, SaveImageDialog, Section, TokenUsage, useChosenSteps } from './ui';
import { useRetouchCanvas, type Amounts } from './useRetouchCanvas';
import { NO_FILM } from '@/lib/film';
import {
  api, canOpenImage, canvasJpeg, finishedCanvas, guessProduct, inAppBrowser, isHeic, jpegBase64, saveImageFile, toWebImage, uploadImage,
} from '@/lib/browser';
import { DEFAULT_AI_MODEL, QUALITIES, QUALITIES_25, defaultQuality, isGpt25, type Item } from '@/lib/catalog';
import {
  DETAIL_TARGETS, SCALE_REFERENCES, SHOT_TYPES, PRODUCT_SET_SHOTS, shotSets, shotFramings, resolveProductBackground, shotAngles, resolveProductAngle, automaticProductAngle, type ShotType,
  PRODUCT_ASPECTS, PRODUCT_FRAMINGS, PRODUCT_PRESETS,
  NO_PROPS, PROP_GROUPS, REF_MODES, SETS, colorable, productType, scenePreset, propStyle, type RefMode,
} from '@/lib/packshot';

type Key = 'product' | 'ref' | 'scene' | 'prop';
const KIND = { product: 'products', ref: 'product-refs', scene: 'product-scenes', prop: 'product-props' } as const;
const NOUN = { product: 'สินค้า', ref: 'ภาพอ้างอิง', scene: 'รูปฉาก', prop: 'รูปพร็อพ' } as const;
const idOf = (item: Item) => item.src ?? item.name;
const find = (list: Item[], id: string | null) => (id === null ? undefined : list.find((i) => idOf(i) === id));
const PRESET = 'preset'; // ทุกขั้น: 'preset' = ตามฉาก (ค่าที่ฉากที่เลือกจับคู่ให้)
const NO_RETOUCH: Amounts = { eye: 0, slim: 0, acne: 0, smooth: 0, white: 0 }; // หน้าสินค้าแสดงรูปโดยไม่แต่งหน้าและไม่ใส่เอฟเฟกต์
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // ยังไม่มีรูปให้โชว์
// เปิดตัวรอบแรก (27 ต.ค.): ใช้ได้แค่ 3 ประเภท เรียงตามนี้ · ที่เหลือยังโชว์แต่เป็นสีเทา กดไม่ได้
// เปิดคืน = เพิ่ม id ในนี้ (UI/API/เทสต์ของประเภทที่ปิดยังอยู่ครบ)
const OPEN_SHOT_TYPES: ShotType[] = ['clean', 'styled', 'creative'];
const SHOT_TYPE_ORDER = [
  ...OPEN_SHOT_TYPES.map((id) => SHOT_TYPES.find((t) => t.id === id)!),
  ...SHOT_TYPES.filter((t) => !OPEN_SHOT_TYPES.includes(t.id)),
];
type Plan = { name: string; th: string }; // พร็อพที่ AI คิดให้
type SetTag = { id: string; index: number }; // ชุดภาพสินค้า (เหมือน SetTag ใน lib/storage.ts)
type Result = { src: string; caption: string; set?: SetTag; editedFrom?: string; stylePlan?: Plan };
type Stored = ProductPhoto & { src: string; name?: string; caption?: string; type?: string; set?: SetTag; page?: string; editedFrom?: string; stylePlan?: Plan };
type Library = { results: Stored[]; uploads: Record<string, Stored[]> };
type AiModel = { id: string; label: string };
const newSetId = () => crypto.randomUUID().slice(0, 13);
const downloadName = (ext: string) => `looklet-product-${Date.now()}.${ext}`; // ชื่อไฟล์ดาวน์โหลด (เรียกตอนกดเท่านั้น)

// ช็อตต้นแบบ (ปิด 27 ต.ค.): ซ้ำกับภาพแรงบันดาลใจของ Creative Packshot และ "ใช้รูปฉากของฉัน" ในขั้นฉากและพื้น
// แถมลอกทั้งช็อตแล้วขั้นอื่นใช้ไม่ได้ครึ่งเมนู · เปิดคืน = true (โค้ด UI/API ยังอยู่ครบ)
const REF_SHOT = false;

type StepKey = 'creative' | 'shot' | 'product' | 'ref' | 'set' | 'props' | 'angle' | 'framing' | 'settings';
const STEPS: { key: StepKey; label: string; title: string; Icon: () => ReactNode }[] = ([
  { key: 'product', label: 'สินค้า', title: 'เลือกสินค้า', Icon: IconBag },
  { key: 'shot', label: 'ประเภทภาพ', title: 'เลือกประเภทภาพ', Icon: IconFrame },
  { key: 'creative', label: 'ไอเดียภาพ', title: 'ไอเดียภาพ', Icon: IconPalette },
  // ช็อตต้นแบบอยู่ก่อนฉาก/พร็อพ/มุม: ลอกทั้งช็อตแล้วขั้นพวกนั้นไม่ถูกใช้ จะได้รู้ก่อนไปเลือก
  { key: 'ref', label: 'ช็อตต้นแบบ', title: 'ช็อตต้นแบบ', Icon: IconCopy },
  { key: 'set', label: 'ฉากและพื้น', title: 'เลือกฉากและพื้น', Icon: IconScene },
  { key: 'props', label: 'พร็อพ', title: 'พร็อพ', Icon: IconLeaf },
  { key: 'angle', label: 'มุมกล้อง', title: 'เลือกมุมกล้อง', Icon: IconAngle },
  { key: 'framing', label: 'ระยะ', title: 'เลือกระยะ', Icon: IconFrame },
  { key: 'settings', label: 'ตั้งค่า', title: 'ตั้งค่าและสร้างรูป', Icon: IconSettings },
] as const).filter((s) => REF_SHOT || s.key !== 'ref');
// ขั้นที่ประเภทภาพนี้ใช้ · เมนูแสดงครบทุกขั้นเสมอ (ขั้นที่ไม่ใช้เป็นสีเทา) จะได้ไม่ขยับ/เปลี่ยนเลขตอนเปลี่ยนประเภทภาพ
function stepUsed(key: StepKey, type: ShotType) {
  if (type === 'creative') return ['product', 'shot', 'creative', 'settings'].includes(key);
  if (key === 'creative') return false;
  if (key === 'ref' || key === 'props') return type === 'styled';
  if (key === 'angle') return type !== 'multi';
  if (key === 'framing') return type === 'styled' || type === 'scale';
  return true;
}

// สัดส่วน "อัตโนมัติ": 4:5 (ฟีด IG) · ลอกทั้งช็อต = สัดส่วนที่ใกล้รูปต้นแบบที่สุด
const nearestAspect = (w: number, h: number) => PRODUCT_ASPECTS.map((a) => a.id).reduce((best, a) => {
  const diff = (id: string) => {
    const [x, y] = id.split(':').map(Number);
    return Math.abs(Math.log(x / y / (w / h)));
  };
  return diff(a) < diff(best) ? a : best;
}, '4:5' as string);

// แสดงวัสดุและองค์ประกอบคร่าวๆ ไม่ใช้รูปสำเร็จที่อาจทำให้เข้าใจว่าเป็นผลลัพธ์จริง
function ScenePreview({ id, color, large = false }: { id: string; color?: string; large?: boolean }) {
  const wall = color ?? ({ pastel: '#dcd8e2', plywood: '#cfd8dc', table: '#d9d2c7', 'dark-fabric': '#3a3a3c', concrete: '#c6c7c4', plaster: '#e7decf', linen: '#eee9e1' }[id] ?? '#efefed');
  const floor = id === 'plywood' ? '#c8aa7d' : id === 'table' || id === 'ledge' ? '#f8f8f4' : wall;
  const fabric = id === 'linen' || id === 'dark-fabric';
  const textured = id === 'concrete' || id === 'plaster';
  return <svg className={'scene-preview' + (large ? ' large' : '')} viewBox="0 0 240 150" role="img" aria-label={`ภาพจำลอง${SETS.find((s) => s.id === id)?.name ?? 'ฉาก'}`}>
    <rect width="240" height="150" fill={wall} />
    {id === 'cove' ? <path d="M0 95 Q120 86 240 95 V150 H0Z" fill="#000" opacity=".025" />
      : <rect y="91" width="240" height="59" fill={floor} />}
    {['pastel', 'table', 'plywood'].includes(id) && <path d="M0 91 H240" stroke="#000" opacity=".12" />}
    {id === 'pastel' && <rect y="92" width="240" height="58" fill="#7278a2" opacity=".16" />}
    {id === 'plywood' && <g stroke="#896639" opacity=".3" fill="none"><path d="M0 104 Q80 95 240 107 M0 122 Q120 110 240 125 M0 143 Q100 129 240 145" /></g>}
    {fabric && <g fill="none" stroke={id === 'dark-fabric' ? '#ddd' : '#b2a99a'} opacity=".25" strokeWidth="5"><path d="M0 30 Q60 75 10 150 M70 0 Q120 90 75 150 M190 0 Q130 85 230 150" /></g>}
    {textured && <g fill="#a18f78" opacity=".18"><ellipse cx="40" cy="50" rx="28" ry="15" /><ellipse cx="198" cy="114" rx="36" ry="18" /><circle cx="150" cy="35" r="15" /></g>}
    {id === 'ledge' && <path d="M0 95 H240 V103 H0 M0 111 H240 M0 116 H240" fill="#fff" stroke="#ccc" />}
    {id === 'plinth' && <path d="M84 99 110 90 157 97 137 108 84 105Z M84 105 V150 H137 V108 M137 108 157 97 V150 H137" fill="#d8cebd" stroke="#b3a999" />}
    <ellipse cx="120" cy={id === 'plinth' ? 96 : 115} rx="38" ry="7" fill="#000" opacity=".1" />
    <rect x="96" y={id === 'plinth' ? 46 : 58} width="48" height="49" rx="5" fill="#fafaf8" stroke="#77776f" strokeWidth="1.2" />
    <path d={id === 'plinth' ? 'M104 55 H136 M104 62 H125' : 'M104 67 H136 M104 74 H125'} stroke="#b8b8ae" strokeWidth="2" />
  </svg>;
}

// ภาพจำลองประเภทภาพ: วาดคร่าวๆ แบบเดียวกับ ScenePreview (ไม่ใช้รูปจริงที่อาจเข้าใจว่าเป็นผลลัพธ์)
function Box({ x, y, w = 48, h = 49, label = true }: { x: number; y: number; w?: number; h?: number; label?: boolean }) {
  return <>
    <ellipse cx={x + w / 2} cy={y + h + 8} rx={w * 0.8} ry="7" fill="#000" opacity=".1" />
    <rect x={x} y={y} width={w} height={h} rx="5" fill="#fafaf8" stroke="#77776f" strokeWidth="1.2" />
    {label && <path d={`M${x + 8} ${y + 9} H${x + w - 8} M${x + 8} ${y + 16} H${x + w * 0.6}`} stroke="#b8b8ae" strokeWidth="2" />}
  </>;
}

function ShotTypePreview({ id }: { id: ShotType }) {
  const studio = <><rect width="240" height="150" fill="#f3f3f0" /><path d="M0 95 Q120 86 240 95 V150 H0Z" fill="#000" opacity=".03" /></>;
  return <svg className="scene-preview" viewBox="0 0 240 150" aria-hidden="true" focusable="false">
    {id === 'clean' && <>{studio}<Box x={96} y={58} /></>}
    {id === 'styled' && <>
      <rect width="240" height="150" fill="#e7decf" />
      <path d="M22 0 H66 L112 91 H68Z" fill="#fff" opacity=".3" />
      <rect y="91" width="240" height="59" fill="#d6bf9c" />
      <path d="M0 91 H240" stroke="#000" opacity=".12" />
      <ellipse cx="62" cy="115" rx="15" ry="3.5" fill="#000" opacity=".1" />
      <circle cx="62" cy="102" r="12" fill="#e8a23a" />
      <path d="M62 90 q3 -6 9 -6" stroke="#6f8a52" strokeWidth="2" fill="none" />
      <path d="M175 80 C171 62 162 54 152 50 M175 80 C178 60 187 51 198 46" stroke="#6f8a52" strokeWidth="2.5" fill="none" />
      <ellipse cx="154" cy="51" rx="9" ry="4" fill="#8fa77a" transform="rotate(30 154 51)" />
      <ellipse cx="196" cy="47" rx="9" ry="4" fill="#8fa77a" transform="rotate(-25 196 47)" />
      <ellipse cx="175" cy="115" rx="13" ry="3" fill="#000" opacity=".1" />
      <rect x="166" y="80" width="18" height="34" rx="6" fill="#f5f2ec" stroke="#b3a999" />
      <Box x={96} y={58} />
      {/* ปรับเองทีละส่วน */}
      <path d="M204 14 H230 M204 23 H230 M204 32 H230" stroke="#77776f" strokeWidth="1.6" />
      <g fill="#fafaf8" stroke="#77776f" strokeWidth="1.4"><circle cx="211" cy="14" r="3" /><circle cx="224" cy="23" r="3" /><circle cx="215" cy="32" r="3" /></g>
    </>}
    {id === 'creative' && <>
      <rect width="240" height="150" fill="#f6d9cf" />
      <circle cx="120" cy="66" r="48" fill="#ee9f86" opacity=".55" />
      <rect y="104" width="240" height="46" fill="#e9b39f" />
      <path d="M92 104 V138 H148 V104" fill="#f8efe9" stroke="#c99683" />
      <ellipse cx="120" cy="104" rx="28" ry="5" fill="#fff6f1" stroke="#c99683" />
      <rect x="98" y="53" width="44" height="49" rx="5" fill="#fafaf8" stroke="#77776f" strokeWidth="1.2" />
      <path d="M106 62 H134 M106 69 H124" stroke="#b8b8ae" strokeWidth="2" />
      {/* AI คิดคอนเซปต์ + โทนสีที่จับคู่ */}
      <path d="m208 12 4 9 9 4-9 4-4 9-4-9-9-4 9-4Z M224 36 l2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="#fff" />
      <g stroke="#fff" strokeWidth="1.5"><circle cx="18" cy="134" r="6" fill="#ee9f86" /><circle cx="33" cy="134" r="6" fill="#f8efe9" /><circle cx="48" cy="134" r="6" fill="#7d8fb3" /></g>
    </>}
    {id === 'multi' && <>{studio}
      <Box x={15} y={66} w={30} h={31} />
      <Box x={75} y={66} w={30} h={31} label={false} />
      <Box x={143} y={66} w={14} h={31} label={false} />
      <ellipse cx="210" cy="105" rx="19" ry="6" fill="#000" opacity=".1" />
      <path d="M197 66 H217 L225 61 V92 L217 97 H197Z" fill="#fafaf8" stroke="#77776f" strokeWidth="1.2" />
      <path d="M217 66 V97" stroke="#77776f" strokeWidth="1.2" />
      <g fill="#8a8a82" fontSize="11" textAnchor="middle"><text x="30" y="128">หน้า</text><text x="90" y="128">หลัง</text><text x="150" y="128">ข้าง</text><text x="210" y="128">45°</text></g>
    </>}
    {id === 'detail' && <>
      <rect width="240" height="150" fill="#ecebe7" />
      <rect x="-20" y="30" width="140" height="140" rx="10" fill="#fafaf8" stroke="#77776f" strokeWidth="1.2" />
      <path d="M-20 44 H106 V170" fill="none" stroke="#b8b8ae" strokeWidth="1.5" strokeDasharray="5 4" />
      <circle cx="98" cy="50" r="12" fill="none" stroke="#77776f" strokeDasharray="3 3" />
      <path d="M195 94 L222 121" stroke="#77776f" strokeWidth="7" strokeLinecap="round" />
      <circle cx="168" cy="66" r="38" fill="#fafaf8" stroke="#77776f" strokeWidth="2" />
      <path d="M134 58 H202 M136 80 H200" stroke="#b8b8ae" strokeWidth="3" strokeDasharray="9 6" />
    </>}
    {id === 'scale' && <>{studio}
      <Box x={92} y={48} w={56} h={57} />
      <path d="M164 48 V105 M159 48 H169 M159 105 H169" stroke="#77776f" strokeWidth="1.4" />
      <rect x="30" y="122" width="180" height="12" rx="2" fill="#efe3c4" stroke="#b3a999" />
      <path d={Array.from({ length: 17 }, (_, i) => `M${40 + i * 10} 122 v${i % 5 ? 4 : 7}`).join(' ')} stroke="#9b8f78" />
    </>}
  </svg>;
}

// มุมกล้อง / ระยะ: วาดภาพที่กล้องเห็นในแต่ละตัวเลือก แบบเดียวกับ ShotTypePreview (ฉากสตูดิโอ + สินค้ากล่องมีฉลาก)
// แทนแผนผังมองจากด้านบนแบบเดิม (ผู้ใช้ขอ 28 ต.ค.: อยากได้ภาพทุกตัวเลือกเหมือนขั้นประเภทภาพ)
const INK = '#77776f', PAPER = '#fafaf8', LABEL = '#b8b8ae', SIDE = '#e7e6df', TOPFACE = '#f1f0ea';
const Studio = ({ horizon = 95 }: { horizon?: number }) => <>
  <rect width="240" height="150" fill="#f3f3f0" />
  <path d={`M0 ${horizon} Q120 ${horizon - 9} 240 ${horizon} V150 H0Z`} fill="#000" opacity=".035" />
</>;
const Shadow = ({ cx, cy, rx }: { cx: number; cy: number; rx: number }) => <ellipse cx={cx} cy={cy} rx={rx} ry="6" fill="#000" opacity=".1" />;
const Label = ({ x, y, w }: { x: number; y: number; w: number }) => <path d={`M${x + 8} ${y + 9} H${x + w - 8} M${x + 8} ${y + 16} H${x + w * 0.6}`} stroke={LABEL} strokeWidth="2" />;

function ViewPreview({ angle, framing }: { angle?: string; framing?: string }) {
  let art: ReactNode;
  if (framing) {
    // ระยะ: ฉากเดิม สินค้าขนาดต่างกัน (ใกล้ = เกือบเต็มภาพแต่ยังเห็นทั้งชิ้น) · รายละเอียด = ครอปเห็นตะเข็บ ซิป และห่วงโลหะ
    const [size, bottom] = { wide: [54, 112], medium: [84, 116], close: [116, 138] }[framing] ?? [];
    if (size) {
      const h = Math.round(size * 1.04), x = 120 - size / 2, y = bottom - h;
      art = <><Studio /><Shadow cx={120} cy={y + h + 6} rx={size * 0.75} />
        <rect x={x} y={y} width={size} height={h} rx={size / 10} fill={PAPER} stroke={INK} strokeWidth="1.2" />
        <path d={`M${x + size * 0.17} ${y + h * 0.18} H${x + size * 0.83} M${x + size * 0.17} ${y + h * 0.31} H${x + size * 0.6}`} stroke={LABEL} strokeWidth={Math.max(2, size / 24)} /></>;
    } else {
      art = <><rect width="240" height="150" fill="#ecebe7" />
        <rect x="-20" y="18" width="230" height="160" rx="16" fill={PAPER} stroke={INK} strokeWidth="1.4" />
        <path d="M-20 40 H186 V178" fill="none" stroke={LABEL} strokeWidth="2.2" strokeDasharray="7 5" />
        <path d="M30 70 H150" stroke={INK} strokeWidth="5" strokeLinecap="round" />
        <path d="M34 66 v8 M44 66 v8 M54 66 v8 M64 66 v8 M74 66 v8 M84 66 v8 M94 66 v8 M104 66 v8 M114 66 v8 M124 66 v8 M134 66 v8 M144 66 v8" stroke={INK} strokeWidth="1.5" />
        <rect x="150" y="62" width="14" height="22" rx="4" fill="#d8d6cc" stroke={INK} />
        <circle cx="70" cy="114" r="16" fill="none" stroke={INK} strokeWidth="4" /></>;
    }
  } else {
    switch (angle) {
      case 'three-quarter': // เห็นหน้า + ด้านข้าง
        art = <><Studio /><Shadow cx={118} cy={112} rx={40} />
          <path d="M128 58 L152 51 V101 L128 108Z" fill={SIDE} stroke={INK} strokeWidth="1.2" />
          <rect x="86" y="58" width="42" height="50" rx="4" fill={PAPER} stroke={INK} strokeWidth="1.2" /><Label x={86} y={58} w={42} /></>;
        break;
      case 'side': // ด้านข้างแคบ ไม่เห็นฉลาก
        art = <><Studio /><Shadow cx={120} cy={114} rx={24} />
          <rect x="107" y="58" width="26" height="50" rx="4" fill={SIDE} stroke={INK} strokeWidth="1.2" /><path d="M120 62 V104" stroke={LABEL} strokeWidth="1.5" /></>;
        break;
      case 'back': // ด้านหลัง: ไม่มีฉลาก มีสายและห่วงด้านหลัง
        art = <><Studio /><Shadow cx={120} cy={114} rx={38} />
          <rect x="96" y="58" width="48" height="50" rx="5" fill={SIDE} stroke={INK} strokeWidth="1.2" />
          <path d="M106 62 V104 M134 62 V104" stroke={LABEL} strokeWidth="3" /><rect x="113" y="63" width="14" height="7" rx="2" fill="none" stroke={INK} /></>;
        break;
      case 'above': case 'high': // สูงนิดๆ มองลง: เห็นด้านบนของสินค้า เส้นขอบฉากสูงขึ้น
        art = <><Studio horizon={74} /><Shadow cx={122} cy={115} rx={40} />
          <path d="M96 66 L106 54 H154 L144 66Z" fill={TOPFACE} stroke={INK} strokeWidth="1.2" />
          <path d="M144 66 L154 54 V98 L144 110Z" fill={SIDE} stroke={INK} strokeWidth="1.2" />
          <rect x="96" y="66" width="48" height="44" rx="3" fill={PAPER} stroke={INK} strokeWidth="1.2" /><Label x={96} y={66} w={48} /></>;
        break;
      case 'top': // มองตรงลงมา: พื้นเต็มภาพ สินค้าวางนอน
        art = <><rect width="240" height="150" fill="#eeede8" />
          <path d="M0 30 Q120 22 240 34 M0 120 Q120 112 240 126" stroke="#000" opacity=".04" strokeWidth="6" fill="none" />
          <rect x="89" y="40" width="70" height="74" rx="8" fill="#000" opacity=".08" />
          <rect x="85" y="35" width="70" height="74" rx="8" fill={PAPER} stroke={INK} strokeWidth="1.2" /><Label x={85} y={40} w={70} /></>;
        break;
      case 'bottom': // ด้านล่าง: เห็นฐานสินค้า (ปุ่มรองฐาน)
        art = <><Studio /><Shadow cx={120} cy={116} rx={40} />
          <rect x="90" y="50" width="60" height="58" rx="10" fill="#ecebe5" stroke={INK} strokeWidth="1.2" />
          <rect x="102" y="62" width="36" height="34" rx="6" fill="none" stroke={LABEL} strokeWidth="1.5" strokeDasharray="4 3" />
          <g fill={INK}><circle cx="98" cy="58" r="2.5" /><circle cx="142" cy="58" r="2.5" /><circle cx="98" cy="100" r="2.5" /><circle cx="142" cy="100" r="2.5" /></g></>;
        break;
      case 'low': // มุมต่ำ มองขึ้น: เส้นขอบฉากต่ำ สินค้าดูสูงสง่า (ด้านบนแคบกว่าฐาน)
        art = <><Studio horizon={122} /><Shadow cx={120} cy={120} rx={40} />
          <path d="M90 116 H150 L143 44 H97Z" fill={PAPER} stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M104 56 H136 M105 64 H124" stroke={LABEL} strokeWidth="2" /></>;
        break;
      case 'auto': // อัตโนมัติ (รายละเอียด / เทียบขนาด): ระบบเลือกมุมให้
        art = <><Studio /><Shadow cx={120} cy={114} rx={38} />
          <rect x="96" y="58" width="48" height="50" rx="5" fill={PAPER} stroke={INK} strokeWidth="1.2" /><Label x={96} y={58} w={48} />
          <path d="m182 26 4 9 9 4-9 4-4 9-4-9-9-4 9-4Z M200 54 l2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill={INK} /></>;
        break;
      default: // หน้าตรง
        art = <><Studio /><Shadow cx={120} cy={114} rx={38} />
          <rect x="96" y="58" width="48" height="50" rx="5" fill={PAPER} stroke={INK} strokeWidth="1.2" /><Label x={96} y={58} w={48} /></>;
    }
  }
  // การ์ดมุมกล้องอยู่ 2 คอลัมน์ ภาพเล็กกว่าขั้นประเภทภาพ -> ขยายสินค้าให้เห็นความต่างของมุมชัดขึ้น (ฉากยังเต็มกรอบ)
  if (!framing) art = <g transform="translate(120 84) scale(1.3) translate(-120 -84)">{art}</g>;
  return <svg className="scene-preview" viewBox="0 0 240 150" aria-hidden="true" focusable="false">{art}</svg>;
}

export default function Packshot() {
  const [lists, setLists] = useState<Record<Key, ProductPhoto[]>>({ product: [], ref: [], scene: [], prop: [] });
  const [pick, setPick] = useState<Record<Key, string | null>>({ product: null, ref: null, scene: null, prop: null });
  const [shotType, setShotType] = useState<ShotType>('clean');
  const [creativeIdea, setCreativeIdea] = useState('');
  const [creativeFacts, setCreativeFacts] = useState('');
  const [conceptState, setConceptState] = useState<{ scope: string; concepts: CreativeConcept[] } | null>(null);
  const [conceptId, setConceptId] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const planningRef = useRef(false);
  const [detailTarget, setDetailTarget] = useState('texture');
  const [feature, setFeature] = useState('');
  const [scaleRef, setScaleRef] = useState('hand');
  const [dimensions, setDimensions] = useState({ width: '', height: '', depth: '' });
  const [referenceSize, setReferenceSize] = useState({ width: '', depth: '' });
  const [extraAngles, setExtraAngles] = useState<string[]>([]);
  const [groupBusy, setGroupBusy] = useState(false);
  const [sceneId, setSceneId] = useState(PRESET); // ฉาก (SETS) · Custom Packshot เลือกฉากจริงเสมอ
  const [colorId, setColorId] = useState('white'); // สีฉาก (BACKDROP_COLORS)
  const [propsId, setPropsId] = useState(NO_PROPS); // เริ่มที่ไม่มีพร็อพ (ไม่มี "ตามฉาก" / "AI เลือกให้" ในขั้นพร็อพแล้ว 27 ต.ค.)
  const [angleId, setAngleId] = useState(PRESET);
  const [framingId, setFramingId] = useState(PRESET);
  const [refMode, setRefMode] = useState<RefMode>('shot');
  const [aspect, setAspect] = useState('1:1');
  const [aiModels, setAiModels] = useState<AiModel[] | null>(null);
  const [aiModel, setAiModel] = useState('');
  const [quality, setQuality] = useState('high');
  const [extra, setExtra] = useState('');
  const [propText, setPropText] = useState(''); // พร็อพของฉันแบบพิมพ์ (Custom)
  const [results, setResults] = useState<Result[]>([]);
  const [current, setCurrent] = useState<number | null>(null); // null = รูปสินค้าที่เลือก (ยังไม่ได้สร้าง)
  const [status, setStatus] = useState('');
  const [canvasStatus, setCanvasStatus] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingSet, setPendingSet] = useState<{ id: string; left: number } | null>(null);
  const [analyzing, setAnalyzing] = useState<string[]>([]); // รูปสินค้าที่ AI กำลังดูว่าเป็นอะไร
  const [saving, setSaving] = useState<{ key: Key; url: string }[]>([]); // รูปที่กำลังเก็บขึ้น server
  const [localEdit, setLocalEdit] = useState<Result | null>(null);
  const [saveSrc, setSaveSrc] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ src: string; alt: string; temp: boolean; start: { fx: number; fy: number } | null } | null>(null);
  const productUploadRef = useRef(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState('');

  const used = (key: StepKey) => stepUsed(key, shotType);
  const shotTypeDef = SHOT_TYPES.find((s) => s.id === shotType)!;
  const isMulti = shotType === 'multi';
  const selectedShots = PRODUCT_SET_SHOTS.filter((s, i) => i < 4 || extraAngles.includes(s.id));
  const shotCount = selectedShots.length;
  const validSize = (v: string) => Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) <= 10000;
  const scaleReady = shotType !== 'scale' || (Object.values(dimensions).every(validSize)
    && (scaleRef !== 'laptop' || Object.values(referenceSize).every(validSize)));
  const detailReady = shotType !== 'detail' || detailTarget !== 'feature' || Boolean(feature.trim());
  const groups = productGroups(lists.product);
  const selectedGroup = groups.find((g) => g.id === pick.product);
  const product = selectedGroup?.main ? { ...selectedGroup.main, name: selectedGroup.name, type: selectedGroup.type } : undefined;
  const inspiration = shotType === 'creative' ? find(lists.ref, pick.ref) : undefined; // ภาพแรงบันดาลใจ (ไม่บังคับ)
  const creativeScope = JSON.stringify([selectedGroup?.id, selectedGroup?.main?.src, selectedGroup?.photos.map((p) => p.src), creativeIdea, creativeFacts, inspiration?.src]);
  const concepts = conceptState?.scope === creativeScope ? conceptState.concepts : [];
  const creativeConcept = concepts.find((c) => c.id === conceptId);
  const creativeReady = shotType !== 'creative' || Boolean(creativeConcept);
  const canPlan = Boolean(product && aiModels?.length) && !groupBusy && busy === null;
  const ref = REF_SHOT && shotType === 'styled' ? find(lists.ref, pick.ref) : undefined;
  const sceneImg = shotType === 'styled' ? find(lists.scene, pick.scene) : undefined;
  // พร็อพของฉัน (Custom): พิมพ์เอง และ/หรือ รูปของจริง ใส่เพิ่มจากแนวพร็อพที่เลือก
  const propImg = shotType === 'styled' ? find(lists.prop, pick.prop) : undefined;
  const ownProp = shotType === 'styled' ? propText.trim() : '';
  const ownName = ownProp || propImg?.name || '';
  // Custom: สไตล์ (โทนสี + พร็อพ/มุม/ระยะเริ่มต้น) มากับฉากที่เลือก · ประเภทอื่นใช้ Clean studio
  const preset = shotType === 'styled' ? scenePreset(sceneId) : PRODUCT_PRESETS[0];
  // ช็อตต้นแบบ: ลอกทั้งช็อต = ไม่ใช้ฉาก/พร็อพ/มุม/ระยะที่เลือก · ลอกฉาก + แสง = ไม่ใช้ฉาก · ทุกโหมดใช้แสงจากรูปต้นแบบ
  const shot = Boolean(ref) && refMode === 'shot';
  const refSet = Boolean(ref) && refMode !== 'light';
  const background = resolveProductBackground(shotType, preset, sceneId, colorId, null, scaleRef); // แสงตามฉากเสมอ (เอาตัวเลือกแสงในตั้งค่าออก 27 ต.ค.)
  const setDef = background.set;
  const usePhoto = Boolean(sceneImg) && !refSet;
  const color = background.color;
  const propsName = propStyle(propsId)?.name ?? '';
  const propsLabel = propsId === NO_PROPS && ownName ? ownName : propsName + (ownName ? ` + ${ownName}` : ''); // ไม่มีพร็อพ + ของฉัน = มีแค่ของฉัน
  const light = background.light;
  const angle = resolveProductAngle(shotType, angleId, preset.angle, detailTarget, scaleRef);
  const automaticAngle = automaticProductAngle(shotType);
  const framing = PRODUCT_FRAMINGS.find((f) => f.id === (framingId === PRESET ? preset.framing : framingId))!;
  const shown = current === null ? null : results[current];

  const { canvasRef, fullRef, fullSrcRef } = useRetouchCanvas(
    { src: shown?.src ?? product?.src ?? BLANK, tone: null, amounts: NO_RETOUCH, zoomed: false, original: false, film: NO_FILM },
    setCanvasStatus,
  );

  // เปิดหน้าเว็บ -> รูปที่เคยสร้างในหน้านี้ + สินค้า/ช็อตต้นแบบ/รูปฉากที่เคยเพิ่ม (เก่าสุดก่อน)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/library')
      .then((r) => (r.ok ? (r.json() as Promise<Library>) : null))
      .then((lib) => {
        if (!lib || cancelled) return;
        setResults(lib.results.filter((r) => r.page === 'product')
          .map((r) => ({ src: r.src, caption: r.caption || 'รูปที่สร้างไว้', set: r.set, editedFrom: r.editedFrom, stylePlan: r.stylePlan })));
        const uploaded = (key: Key) => [...(lib.uploads[KIND[key]] ?? [])].reverse()
          .map((u): ProductPhoto => ({ ...u, name: u.name ?? 'รูปที่เพิ่ม', src: u.src, type: u.type, uploaded: true }));
        const next = { product: uploaded('product'), ref: uploaded('ref'), scene: uploaded('scene'), prop: uploaded('prop') };
        setLists(next);
        setPick((p) => (p.product || !next.product.length ? p : { ...p, product: productGroups(next.product).at(-1)?.id ?? null })); // เลือกสินค้าล่าสุดไว้ให้
      })
      .catch((err) => console.error('โหลดคลังรูปไม่สำเร็จ', err));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    fetch('/api/models')
      .then((r) => (r.ok ? (r.json() as Promise<AiModel[]>) : []))
      .catch(() => [] as AiModel[])
      .then((list) => {
        setAiModels(list);
        if (list.length) { // มีโมเดลเดียว (DEFAULT_AI_MODEL) เลือกเองไม่ได้แล้ว · คุณภาพเริ่มต้นตามโมเดล
          const id = (list.find((m) => m.id === DEFAULT_AI_MODEL) ?? list[0]).id;
          setAiModel(id);
          setQuality(defaultQuality(id));
        }
        else setStatus('สร้างรูปไม่ได้: ต้องมี API key ในไฟล์ .env (แก้แล้วรีสตาร์ท npm run dev)');
      });
  }, []);

  function chooseShotType(id: string) {
    const next = id as ShotType;
    setShotType(next);
    setSceneId(next === 'styled' ? 'table' : PRESET); setColorId(next === 'styled' ? 'match' : 'white'); // Custom เริ่มที่โต๊ะขาว (Still life ผลไม้ เดิม)
    setPropsId(NO_PROPS); setAngleId(PRESET);
    setFramingId(next === 'detail' ? 'detail' : next === 'scale' ? 'medium' : PRESET);
    setAspect(next === 'styled' || next === 'creative' ? '4:5' : '1:1');
    setPick((p) => ({ ...p, ref: null, scene: null }));
  }

  function select(key: Key, id: string | null) {
    setPick((p) => ({ ...p, [key]: id }));
    if (key === 'product') {
      setCurrent(null);
      if (id !== pick.product) setDimensions({ width: '', height: '', depth: '' });
    } // เปลี่ยนสินค้า -> โชว์รูปสินค้าชิ้นใหม่
    if (key === 'prop' && id) setPropsId(NO_PROPS); // พร็อพของฉัน กับ ตัวเลือกพร็อพ เลือกได้อย่างเดียว
  }

  // ตัวเลือกพร็อพ: เลือกแล้วล้างพร็อพของฉัน · กดอันที่เลือกอยู่ซ้ำ = ไม่ใช้พร็อพ (ไม่มีการ์ด "ไม่มีพร็อพ" แล้ว)
  function chooseProp(id: string) {
    setPropsId((cur) => (cur === id ? NO_PROPS : id));
    setPropText('');
    setPick((p) => ({ ...p, prop: null }));
  }

  // อัปโหลดแล้วเก็บไว้ในคลัง แล้วเลือกให้เลย
  async function addUpload(key: Key, file: File, name: string, type?: string, supporting = false, groupId?: string) {
    const targetGroupId = key === 'product' ? groupId ?? (supporting ? selectedGroup?.id : undefined) : undefined;
    const groupMeta = key === 'product' ? targetGroupId ? { productGroup: targetGroupId } : { productGroupName: name, productGroupType: type || 'other' } : {};
    let src: string;
    const preview = URL.createObjectURL(file);
    setSaving((s) => [...s, { key, url: preview }]);
    try {
      ({ src } = await api('/api/upload', { kind: KIND[key], name, type, ...groupMeta, ...(await uploadImage(file)) }));
    } catch (err) {
      src = URL.createObjectURL(file); // เก็บไม่ได้ -> ใช้ชั่วคราวไปก่อน
      setStatus(`เก็บรูปไม่สำเร็จ (${(err as Error).message}) รูปนี้จะหายเมื่อ refresh — ลองเพิ่มใหม่อีกครั้ง`);
    } finally {
      setSaving((s) => s.filter((x) => x.url !== preview));
      URL.revokeObjectURL(preview);
    }
    setLists((l) => ({ ...l, [key]: [...l[key], { name, src, type, ...groupMeta, productView: 'unspecified', uploaded: true }] }));
    if (!targetGroupId) select(key, src);
    return src;
  }

  // แก้สินค้า (เปลี่ยนชื่อ / นำรูปออก / เอากลับ) ผ่าน /api/product-groups แล้วใส่ metadata ที่ server แก้ลงรายการในหน้า
  async function editGroup(body: Record<string, unknown>) {
    setGroupBusy(true);
    try {
      const out = await api<{ src: string; patch: Record<string, string> }>('/api/product-groups', body);
      setLists((l) => ({ ...l, product: l.product.map((p) => (p.src === out.src ? { ...p, ...out.patch } : p)) }));
    } catch (err) {
      setStatus('แก้สินค้าไม่สำเร็จ: ' + (err as Error).message);
      throw err;
    } finally { setGroupBusy(false); }
  }
  const renameGroup = (g: ProductGroup, name: string) => editGroup({ action: 'edit', group: g.id, name, type: g.type || 'other' });
  const removePhoto = (g: ProductGroup, src: string) => editGroup({ action: 'remove', group: g.id, src });
  const restorePhoto = (g: ProductGroup, src: string) => editGroup({ action: 'restore', group: g.id, src });

  // การเลือกไฟล์หนึ่งครั้ง = สินค้าหนึ่งกลุ่ม รูปแรกเป็นภาพปก รูปที่เหลือใช้ id กลุ่มเดียวกัน
  async function onProductFiles(files: File[], append = false) {
    if (!files.length || productUploadRef.current) return;
    const existing = append ? selectedGroup : undefined;
    if (append && !existing) return;
    productUploadRef.current = true;
    setGroupBusy(true);
    setStatus('');
    let groupId = existing?.id;
    let name = existing?.name;
    let type = existing?.type;
    let failed = 0;
    let lastError = '';
    try {
      for (const picked of files) {
        try {
          const file = isHeic(picked) ? await toWebImage(picked) : picked;
          if (!(await canOpenImage(file))) throw new Error('เปิดรูปไม่ได้ ลองใช้ JPG หรือ PNG');
          if (!groupId) {
            const url = URL.createObjectURL(file);
            setAnalyzing((a) => [...a, url]);
            try {
              const guess = await guessProduct(url);
              name = guess?.name || picked.name.replace(/\.[^.]+$/, '');
              type = guess?.type || 'other';
            } finally {
              setAnalyzing((a) => a.filter((u) => u !== url));
              URL.revokeObjectURL(url);
            }
          }
          const src = await addUpload('product', file, groupId ? picked.name.replace(/\.[^.]+$/, '') : name!, type, Boolean(groupId), groupId);
          if (!groupId) groupId = src;
        } catch (err) {
          failed++;
          lastError = (err as Error).message;
        }
      }
      if (failed) setStatus(`เพิ่มรูปได้ ${files.length - failed}/${files.length} รูป — ${lastError}`);
    } finally {
      productUploadRef.current = false;
      setGroupBusy(false);
    }
  }

  // รูปอ้างอิง / รูปฉาก / รูปพร็อพ (สินค้าอัปโหลดผ่าน ProductLibrary -> onProductFiles)
  async function onFile(key: Exclude<Key, 'product'>, picked: File) {
    try {
      const file = isHeic(picked) ? await toWebImage(picked) : picked;
      if (!(await canOpenImage(file))) throw new Error('เปิดรูปนี้ไม่ได้ ลองใช้ JPG หรือ PNG');
      await addUpload(key, file, picked.name.replace(/\.[^.]+$/, ''));
    } catch (err) { setStatus((err as Error).message); }
  }

  async function deleteUpload(key: Key, item: Item) {
    if (!confirm(`ลบ "${item.name}"? (ย้ายไปถังขยะ)`)) return;
    try {
      if (!item.src!.startsWith('blob:')) await api('/api/delete', { src: item.src });
    } catch (err) {
      return setStatus('ลบไม่สำเร็จ: ' + (err as Error).message);
    }
    setLists((l) => ({ ...l, [key]: l[key].filter((i) => i !== item) }));
    setPick((p) => (p[key] === idOf(item) ? { ...p, [key]: null } : p));
  }

  async function deleteResult(i: number) {
    if (!confirm('ลบรูปที่สร้างนี้? (ย้ายไปถังขยะ)')) return;
    try {
      await api('/api/delete', { src: results[i].src });
    } catch (err) {
      return setStatus('ลบไม่สำเร็จ: ' + (err as Error).message);
    }
    const left = results.length - 1;
    setResults((r) => r.filter((_, j) => j !== i));
    setCurrent((c) => (c === i ? (left ? Math.min(i, left - 1) : null) : c !== null && c > i ? c - 1 : c));
  }

  async function planCreative() {
    if (!canPlan || planningRef.current || !product || !selectedGroup) return;
    planningRef.current = true;
    setPlanning(true);
    setStatus('');
    const scope = creativeScope;
    try {
      const [main, extraPhotos, inspirationImage] = await Promise.all([
        jpegBase64(product.src!),
        Promise.all(productSources(selectedGroup).map(async (p) => (await jpegBase64(p.src!)).data)),
        inspiration ? jpegBase64(inspiration.src!) : null,
      ]);
      const out = await api<{ concepts: CreativeConcept[] }>('/api/creative-concepts', {
        product: main.data, support_images: extraPhotos, product_type: productType(product.type).id,
        inspiration: inspirationImage?.data ?? null, idea: creativeIdea, facts: creativeFacts,
        previous: concepts.map((c) => c.title),
      });
      setConceptState({ scope, concepts: out.concepts });
      setConceptId(null);
    } catch (err) { setStatus('คิดไอเดียไม่สำเร็จ: ' + (err as Error).message); }
    finally { planningRef.current = false; setPlanning(false); }
  }

  // ชุดหลายมุม: สร้าง Front ก่อน แล้วใช้เป็นต้นแบบให้มุมที่เหลือคงฉากและแสงเดียวกัน
  async function generate() {
    if (busy !== null || planning) return;
    const set = isMulti;
    if (!product) {
      setStep(0);
      return setStatus('เลือกหรืออัปโหลดรูปสินค้าก่อน');
    }
    if (!creativeReady) {
      setStep(STEPS.findIndex((s) => s.key === 'creative'));
      return setStatus('เลือก 1 ไอเดียในขั้นไอเดียภาพก่อนสร้างรูป');
    }
    if (!scaleReady || !detailReady) {
      setStep(1);
      return setStatus(!scaleReady ? 'กรอกขนาดสินค้าจริงเป็นเซนติเมตรให้ครบก่อน' : 'ระบุฟีเจอร์ที่ต้องการถ่ายก่อน');
    }
    const choice = aiModels?.find((m) => m.id === aiModel);
    if (!choice) return;
    setStatus('');
    const shotsAfter = selectedShots.slice(1);
    const caption = [
      product.name, shotTypeDef.name,
      ...(ref ? [`${REF_MODES.find((m) => m.id === refMode)!.name}จากต้นแบบ`] : []),
      ...(shotType === 'creative' ? [creativeConcept!.title] : shot || shotType === 'styled' ? [] : [preset.name]),
      ...(shotType === 'creative' || refSet ? [] : [usePhoto ? 'ฉาก: ' + sceneImg!.name : setDef.name + (colorable(setDef) && color.id !== 'set' ? ` (${color.name})` : '')]),
      ...(shotType === 'creative' || shot ? [] : [propsLabel, ...(isMulti ? [] : [angle.name]), framing.name]),
    ].join(' · ') + ` — ${choice.label}${choice.id.startsWith('openai:') ? ` (${quality})` : ''}`;
    const setCaption = (i: number, name: string) => `ชุดภาพ ${i + 1}/${shotCount} ${name} · ${caption}`;
    setBusy(set ? `AI กำลังสร้างรูปแรกของชุด (1/${shotCount})...` : 'AI กำลังสร้างรูป... (ประมาณ 20–90 วินาที)');
    try {
      const productImg = await jpegBase64(product.src!);
      const refImg = ref ? await jpegBase64(ref.src!) : null;
      const sceneB = usePhoto ? await jpegBase64(sceneImg!.src!) : null;
      const propB = propImg ? await jpegBase64(propImg.src!) : null;
      const finalAspect = aspect !== 'auto' ? aspect : shot && refImg ? nearestAspect(refImg.w, refImg.h) : '4:5';
      const refOf = (item: Item | undefined, img: { w: number; h: number } | null) => (item && img ? { name: item.name, src: item.src, w: img.w, h: img.h } : null);
      // ส่งแค่ id ('preset' = ตามฉาก ส่งเป็น null) server แปลงเป็นคำสั่งเอง (lib/packshot.ts)
      const supporting = productSources(selectedGroup!, selectedGroup!.main, shotType === 'detail' ? 'detail' : angle.id);
      const supportImages = await Promise.all(supporting.map(async (i) => (await jpegBase64(i.src!)).data));
      const body = {
        creative_concept: shotType === 'creative' ? creativeConcept : null,
        shot_type: shotType, detail_target: detailTarget, feature: feature.trim(),
        scale_reference: scaleRef, dimensions, reference_size: referenceSize,
        support_images: supportImages, product_group: selectedGroup!.id,
        model: choice.id, quality, aspect: finalAspect, extra: extra.trim(), finish: 'off',
        product: productImg.data, product_type: productType(product.type).id, preset: preset.id,
        set_id: sceneId === PRESET ? null : setDef.id, set_color: color.id, set_image: sceneB?.data ?? null,
        props: propsId, light: null,
        angle: automaticAngle ? 'auto' : angle.id, framing: framingId === PRESET ? null : framingId,
        ref: refImg?.data ?? null, ref_mode: refMode, prop_text: ownProp, prop_image: propB?.data ?? null,
        refs: {
          product: { ...refOf(product, productImg), type: productType(product.type).name }, ref: refOf(ref, refImg), set_image: refOf(sceneImg, sceneB), prop_image: refOf(propImg, propB),
        },
      };
      const shootId = set ? newSetId() : null;
      const tag = (i: number) => (shootId ? { id: shootId, index: i } : undefined);
      const firstCaption = set ? setCaption(0, 'Front') : caption;
      const out = await api<{ src: string; stylePlan: Plan | null }>('/api/packshot', { ...body, caption: firstCaption, set: tag(0) });
      setResults((r) => [{ src: out.src, caption: firstCaption, set: tag(0), stylePlan: out.stylePlan ?? undefined }, ...r]);
      setCurrent(0);
      if (out.stylePlan) setStatus(`${shotType === 'creative' ? 'ไอเดีย' : 'พร็อพที่ AI คิดให้'} (${out.stylePlan.name}): ${out.stylePlan.th}`);
      frameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (shootId) {
        // มุมที่เหลือ: ส่งรูปแรกเป็นต้นแบบ ไม่ส่งช็อตต้นแบบ/รูปฉาก — เสร็จรูปไหนขึ้นประวัติรูปนั้นเลย พังบางรูปยังเก็บรูปที่ได้
        setPendingSet({ id: shootId, left: shotsAfter.length });
        setBusy(`AI กำลังสร้างอีก ${shotsAfter.length} มุมพร้อมกัน...`);
        const hero = await jpegBase64(out.src);
        const rest = await Promise.allSettled(shotsAfter.map((s, j) => api('/api/packshot', {
          ...body, ref: null, set_image: null, set_ref: hero.data, set_shot: s.id,
          refs: { ...body.refs, ref: null, set_image: null, set_ref: { name: firstCaption, src: out.src, w: hero.w, h: hero.h } },
          caption: setCaption(j + 1, s.name), set: tag(j + 1),
        }).then(({ src }) => {
          setResults((r) => [{ src, caption: setCaption(j + 1, s.name), set: tag(j + 1) }, ...r]);
          setCurrent((c) => (c === null ? c : c + 1)); // เพิ่มหน้ารายการ -> รูปที่ดูอยู่เลื่อนไป 1 ช่อง
        }).finally(() => setPendingSet((p) => p && { ...p, left: p.left - 1 }))));
        const failed = rest.filter((x) => x.status === 'rejected');
        if (failed.length) {
          setStatus(`ชุดภาพได้ ${shotCount - failed.length}/${shotCount} รูป — สร้างไม่สำเร็จ ${failed.length} รูป: ${(failed[0].reason as Error).message}`);
        }
      }
    } catch (err) {
      setStatus('สร้างรูปไม่สำเร็จ: ' + (err as Error).message);
    } finally {
      setBusy(null);
      setPendingSet(null);
    }
  }

  async function editLocalArea(request: LocalEditRequest) {
    if (!localEdit || busy !== null || planning) throw new Error('เลือกรูปที่ต้องการแก้ก่อน');
    const source = localEdit;
    setBusy('AI กำลังแก้เฉพาะจุด...');
    try {
      const result = await api<Result>('/api/local-edit', { ...request, src: source.src });
      setResults((r) => [result, ...r]);
      setCurrent(0);
      setLocalEdit(null);
      setStatus('แก้เฉพาะจุดแล้ว เก็บรูปใหม่และต้นฉบับไว้ในคลังสินค้า');
    } finally { setBusy(null); }
  }

  function outputBlob(canvas: HTMLCanvasElement, quality = 0.92) {
    return shown?.editedFrom
      ? new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('บันทึก PNG ไม่สำเร็จ')), 'image/png'))
      : canvasJpeg(canvas, quality);
  }

  // รูปที่กำลังดูแบบเต็มขนาด — กล่องรูปยังวาดรูปนี้ไม่เสร็จ -> วาดจากไฟล์เอง
  async function currentCanvas() {
    const src = shown?.src ?? product?.src;
    if (!src) throw new Error('ยังไม่มีรูป');
    const full = fullRef.current;
    return full?.width && fullSrcRef.current === src ? full : finishedCanvas(src, NO_FILM);
  }

  async function openViewer(e: MouseEvent<HTMLElement>) {
    if (!shown && !product) return;
    const pic = e.currentTarget.querySelector('canvas');
    const r = pic?.getBoundingClientRect();
    const inside = r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    const start = inside ? { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height } : null;
    try {
      const url = URL.createObjectURL(await outputBlob(await currentCanvas(), 0.95));
      setViewer({ src: url, alt: 'รูปที่กำลังดู', temp: true, start });
    } catch (err) {
      setStatus('เปิดรูปไม่สำเร็จ: ' + (err as Error).message);
    }
  }

  async function save() {
    try {
      const cv = await currentCanvas();
      if (inAppBrowser()) return setSaveSrc(cv.toDataURL(shown?.editedFrom ? 'image/png' : 'image/jpeg', 0.92));
      await saveImageFile(await outputBlob(cv), downloadName(shown?.editedFrom ? 'png' : 'jpg'));
    } catch (err) {
      console.error('ดาวน์โหลดไม่สำเร็จ', err);
      setStatus('ดาวน์โหลดไม่สำเร็จ: ' + (err as Error).message);
    }
  }

  function goStep(i: number) {
    setStep(i);
    setQuery('');
  }

  const cur = STEPS[step];
  const { chosen, mark } = useChosenSteps(cur.key);
  // ขั้นที่ต้องมีของจริงก่อนถึงจะ "พร้อมไปต่อ" (ปุ่มถัดไปสีชมพู) — ขั้นอื่นแค่ผู้ใช้เลือกอะไรสักอย่างก็พร้อม
  const stepReady = chosen.has(cur.key) && (cur.key === 'product' ? Boolean(product) : cur.key === 'creative' ? Boolean(creativeConcept)
    : cur.key === 'shot' ? scaleReady && detailReady : true);
  const nextStep = STEPS.findIndex((s, i) => i > step && used(s.key)); // ถัดไป: ข้ามขั้นที่ประเภทภาพนี้ไม่ใช้
  const stepDone: Record<StepKey, boolean> = {
    creative: Boolean(creativeConcept), shot: true, product: Boolean(product), ref: Boolean(ref),
    set: sceneId !== PRESET || usePhoto || colorId !== 'set', props: propsId !== NO_PROPS || Boolean(ownName), angle: !automaticAngle && angleId !== PRESET, framing: framingId !== PRESET,
    settings: aspect !== 'auto' || Boolean(extra.trim()),
  };

  const canGenerate = busy === null && !planning && creativeReady && !groupBusy && !saving.some((s) => s.key === 'product') && Boolean(aiModels?.length) && Boolean(product) && scaleReady && detailReady;

  // ปุ่มสร้างรูปท้ายขั้นตั้งค่า (+ เหตุผลที่ยังกดไม่ได้) — ปุ่มสร้างรูปมุมขวาบนใช้ได้ทุกขั้น
  const generateLabel = isMulti ? `สร้างชุดภาพ ${shotCount} มุม` : 'สร้างรูป';
  const genButtons = <>
    <button className="btn btn-primary gen-btn" disabled={!canGenerate} onClick={() => void generate()}>{busy !== null ? 'กำลังสร้าง...' : generateLabel}</button>
    {isMulti && <p className="muted-text">{selectedShots.map((s) => s.name).join(' · ')} · ใช้ค่า AI {shotCount} รูป</p>}
    {!creativeReady && <p className="note">เลือก 1 ไอเดียในขั้นไอเดียภาพก่อนสร้างรูป</p>}
    {!scaleReady && <p className="note">กรอกขนาดจริงให้ครบในขั้นประเภทภาพ</p>}
    {!detailReady && <p className="note">ระบุฟีเจอร์ในขั้นประเภทภาพ</p>}
  </>;

  // ---------- แผงเลือก (ซ้าย) ----------
  const q = query.trim().toLowerCase();
  const visible = (key: Key) => lists[key].filter((i) => !q || i.name.toLowerCase().includes(q));
  const picker = (key: Exclude<Key, 'product'>, kind: string, { special, muted = false }: { special?: ReactNode; muted?: boolean } = {}) => (
    <>
      <label className="search">
        <IconSearch />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`ค้นหา${NOUN[key]}...`} />
      </label>
      <div className={'grid ' + kind + (muted ? ' muted' : '')}>
        {!q && special}
        {visible(key).map((item) => (
          <Card key={idOf(item)} item={item} active={idOf(item) === pick[key]} onClick={() => select(key, idOf(item))}
            onDelete={() => void deleteUpload(key, item)}
 />
        ))}
        {saving.filter((x) => x.key === key).map((x) => <PendingCard key={x.url} src={x.url} label="กำลังเก็บรูป..." />)}
        <AddCard onFile={(f) => void onFile(key, f)} />
      </div>
    </>
  );
  // ตัวเลือกแบบรายการ: ตัวแรก = ตามฉาก (บอกว่าฉากที่เลือกจับคู่อะไรให้)
  const options = (choices: { id: string; name: string; hint: string }[], value: string, choose: (id: string) => void,
    { presetName, disabled = false }: { presetName?: string; disabled?: boolean } = {}) => (
    <div className="options">
      {presetName !== undefined && (
        <button type="button" className={'option' + (value === PRESET ? ' active' : '')} disabled={disabled} onClick={() => choose(PRESET)}>
          <b>ตามฉาก (แนะนำ)</b><small>{setDef.name}: {presetName}</small>
        </button>
      )}
      {choices.map((c) => (
        <button key={c.id} type="button" className={'option' + (value === c.id ? ' active' : '')} disabled={disabled} onClick={() => choose(c.id)}>
          <b>{c.name}</b><small>{c.hint}</small>
        </button>
      ))}
    </div>
  );
  const shotNote = (what: string) => shot && <p className="note">ลอกทั้งช็อตจากรูปต้นแบบอยู่: {what}ตามรูปต้นแบบ ที่เลือกตรงนี้จะไม่ถูกใช้</p>;

  let panel: ReactNode = null;
  if (cur.key === 'product') {
    panel = <>
      <ProductLibrary groups={groups} selected={selectedGroup} busy={groupBusy || busy !== null}
        analyzing={analyzing} saving={saving.filter((s) => s.key === 'product')}
        onSelect={(id) => select('product', id)} onUpload={onProductFiles}
        onRename={renameGroup} onRemovePhoto={removePhoto} onRestorePhoto={restorePhoto} />
    </>;
  } else if (cur.key === 'creative') {
    panel = <CreativeShot idea={creativeIdea} onIdea={setCreativeIdea}
      facts={creativeFacts} onFacts={setCreativeFacts} inspiration={picker('ref', 'refs', { special: <Card item={{ name: 'ไม่ใช้' }} active={!inspiration} onClick={() => select('ref', null)} /> })}
      concepts={concepts} selected={creativeConcept} onSelect={setConceptId} onPlan={() => void planCreative()}
      planning={planning} canPlan={canPlan} hasProduct={Boolean(product)}
      onGenerate={() => void generate()} canGenerate={canGenerate} generating={busy !== null} />;
  } else if (cur.key === 'shot') {
    panel = <>
      <p className="note">เลือกจุดประสงค์ของภาพ เราจับคู่ตัวเลือกเริ่มต้นให้ ปรับรายละเอียดได้ในขั้นถัดไป</p>
      <div className="options shot-type-options">
        {SHOT_TYPE_ORDER.map((t) => <button key={t.id} type="button" aria-pressed={shotType === t.id}
          className={'option' + (shotType === t.id ? ' active' : '')} disabled={!OPEN_SHOT_TYPES.includes(t.id)} onClick={() => chooseShotType(t.id)}>
          <ShotTypePreview id={t.id} /><b>{t.name}</b><small>{t.hint}</small><span className="shot-usage">{OPEN_SHOT_TYPES.includes(t.id) ? t.usage : 'เร็วๆ นี้'}</span>
        </button>)}
      </div>
      {isMulti && <Section title="มุมในชุดภาพ" note={`สร้าง ${shotCount} รูป · ใช้ค่า AI ${shotCount} รูป`}>
        <p className="muted-text">Front · Back · Side · 45°</p>
        <div className="chips">{PRODUCT_SET_SHOTS.slice(4).map((a) => <button key={a.id} type="button"
          aria-pressed={extraAngles.includes(a.id)} className={'chip' + (extraAngles.includes(a.id) ? ' active' : '')}
          onClick={() => setExtraAngles((v) => v.includes(a.id) ? v.filter((id) => id !== a.id) : [...v, a.id])}>+ {a.name}</button>)}</div>
        <p className="muted-text">เพิ่มรูปด้านหลัง ด้านข้าง และฐานจริงในขั้นสินค้า เพื่อให้รายละเอียดตรงกับสินค้าจริง</p>
      </Section>}
      {shotType === 'detail' && <Section title="ต้องการเน้นจุดไหน">
        {options(DETAIL_TARGETS, detailTarget, setDetailTarget)}
        <label className="shot-field">ตำแหน่ง / ฟีเจอร์{detailTarget === 'feature' ? ' (จำเป็น)' : ' (เพิ่มเติม)'}
          <textarea className="text-input" value={feature} maxLength={200} onChange={(e) => setFeature(e.target.value)} placeholder="เช่น ซิปช่องด้านหน้ากระเป๋า" />
        </label>
      </Section>}
      {shotType === 'scale' && <>
        <Section title="ขนาดสินค้าจริง" note="เซนติเมตร · กรอกครบทั้ง 3 ด้าน">
          <div className="shot-dimensions">{(['width', 'height', 'depth'] as const).map((key, i) => <label className="shot-field" key={key}>
            {['กว้าง', 'สูง', 'ลึก'][i]} (ซม.)<input className="text-input" type="number" min="0.1" max="10000" step="any" required
              value={dimensions[key]} onChange={(e) => setDimensions((d) => ({ ...d, [key]: e.target.value }))} />
          </label>)}</div>
        </Section>
        <Section title="เทียบขนาดกับ">{options(SCALE_REFERENCES, scaleRef, setScaleRef)}</Section>
        {scaleRef === 'laptop' && <Section title="ขนาด Laptop จริง" note="ขนาดตัวเครื่องเป็นเซนติเมตร ไม่ใช่นิ้วหน้าจอ">
          <div className="shot-dimensions">{(['width', 'depth'] as const).map((key, i) => <label className="shot-field" key={key}>
            {['กว้าง', 'ลึก'][i]} (ซม.)<input className="text-input" type="number" min="0.1" max="10000" step="any" required
              value={referenceSize[key]} onChange={(e) => setReferenceSize((d) => ({ ...d, [key]: e.target.value }))} />
          </label>)}</div>
        </Section>}
        <p className="muted-text">ภาพ AI ช่วยสื่อสัดส่วนโดยประมาณ ควรแสดงขนาดจริงบนหน้าสินค้าด้วย</p>
      </>}
    </>;
  } else if (cur.key === 'ref') {
    panel = <>
      {picker('ref', 'refs', { special: <Card item={{ name: 'ไม่ใช้' }} active={!ref} onClick={() => select('ref', null)} /> })}
      {ref && <Section title="เอาอะไรจากรูปต้นแบบ">
        <ChipGroup options={[...REF_MODES]} value={refMode} onChange={(v) => setRefMode(v as RefMode)} />
        <p className="muted-text">{REF_MODES.find((m) => m.id === refMode)!.hint}</p>
      </Section>}
    </>;
  } else if (cur.key === 'set') {
    const chooseScene = (id: string) => {
      setSceneId(id); select('scene', null);
      setColorId(shotType === 'styled' ? 'match' : 'white');
    };
    const sceneCards = (title: string) => <Section title={title}>
      <div className="options scene-options">
        {shotSets(shotType, scaleRef).map((s) => <button key={s.id} type="button"
          className={'option' + (setDef.id === s.id && !usePhoto ? ' active' : '')}
          aria-pressed={setDef.id === s.id && !usePhoto} disabled={refSet || background.automatic}
          onClick={() => chooseScene(s.id)}>
          <ScenePreview id={s.id} /><b>{s.name}{background.automatic ? ' · อัตโนมัติ' : ''}</b><small>{s.hint}</small>
        </button>)}
      </div>
    </Section>;
    // Custom: รูปฉากของฉันก่อน แล้วตัวเลือกฉาก ไม่มีเลือกสี/ภาพจำลอง (27 ต.ค.) — สีพื้นหลังให้ AI จับคู่กับสินค้า ('match')
    panel = shotType === 'styled' ? <>
      {refSet && <p className="note">ใช้ฉากและพื้นจากรูปต้นแบบอยู่ ตัวเลือกฉากจะไม่ถูกใช้</p>}
      <Section title="ใช้รูปฉากของฉัน" note="จับคู่แสง มุมมอง และเงาสัมผัสกับรูปฉาก">
        {picker('scene', 'scenes', {
          special: <Card item={{ name: 'ไม่ใช้รูป' }} active={!sceneImg} onClick={() => select('scene', null)} />, muted: refSet,
        })}
      </Section>
      {sceneCards('ตัวเลือกฉาก')}
    </> : <>
      <p className="note">{background.automatic ? shotType === 'detail'
        ? 'อัตโนมัติ: ฉากเรียบ ไม่แย่งรายละเอียด และเบลออย่างนุ่มนวล'
        : 'อัตโนมัติ: มือ / คนใช้สตูดิโอเรียบ ส่วน A4 / Laptop ใช้โต๊ะเรียบเพื่อเทียบขนาด'
        : isMulti ? 'ใช้ฉาก สี และแสงเดียวกันทุกมุมในชุดภาพ' : 'เลือกฉากก่อน แล้วเลือกสีที่เข้ากัน แสงเริ่มต้นจะจับคู่ให้'}</p>
      {sceneCards(background.automatic ? 'ฉากที่จับคู่ให้' : '1. เลือกฉากและพื้น')}
      {background.colors.length > 0 && <Section title="2. เลือกสีที่เข้ากัน" note="คัดสีให้เหมาะกับฉากนี้">
        <div className="background-colors">{background.colors.map((c) => <button type="button" key={c.id}
          className={'background-color' + (color.id === c.id ? ' active' : '')} aria-pressed={color.id === c.id}
          onClick={() => setColorId(c.id)}>
          <span className={'background-swatch' + (!c.swatch ? ' color-auto' : '')} style={c.swatch ? { background: c.swatch } : undefined} />
          <span>{c.name}{c.id === 'white' ? ' (แนะนำ)' : ''}</span>
        </button>)}</div>
      </Section>}
      <Section title="ภาพจำลองคู่ฉากและสี" note="ตัวอย่างองค์ประกอบ ไม่ใช่ภาพที่สร้างแล้ว">
        <ScenePreview id={setDef.id} color={color.swatch} large />
        <p className="muted-text">{setDef.name} · {color.name} · {light.name}</p>
      </Section>
    </>;
  } else if (cur.key === 'props') {
    // พร็อพของฉันก่อน แล้วตัวเลือกพร็อพ (27 ต.ค.) · เลือกได้อย่างเดียว ไม่เลือกอะไร = ไม่มีพร็อพ
    panel = <>
      {shotNote('พร็อพ')}
      <Section title="พร็อพของฉัน" note="ใช้แทนตัวเลือกพร็อพด้านล่าง">
        <textarea className="text-input" value={propText} maxLength={200} disabled={shot} onChange={(e) => {
          setPropText(e.target.value);
          if (e.target.value.trim()) setPropsId(NO_PROPS);
        }}
          placeholder="พิมพ์พร็อพที่อยากได้ เช่น แก้วกาแฟเซรามิกสีครีม, ช่อลาเวนเดอร์แห้ง" />
        <p className="muted-text">หรือใช้รูปของจริง เช่น กล่องหรือแก้วของแบรนด์ — AI วางของชิ้นนั้นให้เหมือนในรูป</p>
        {picker('prop', 'props', { special: <Card item={{ name: 'ไม่ใช้รูป' }} active={!propImg} onClick={() => select('prop', null)} />, muted: shot })}
      </Section>
      <Section title="ตัวเลือกพร็อพ" note="กดอันที่เลือกอยู่ซ้ำ = ไม่ใช้พร็อพ">
        <div className="prop-options">
          {PROP_GROUPS.map((g) => <Section key={g.name} title={g.name}>
            {options(g.ids.map((id) => propStyle(id)!), propsId, chooseProp, { disabled: shot })}
          </Section>)}
        </div>
      </Section>
    </>;
  } else if (cur.key === 'angle') {
    const recommended = resolveProductAngle(shotType, PRESET, preset.angle);
    panel = <>
      {shotNote('มุมกล้อง')}
      {automaticAngle ? <Section title={angle.name}>
        <div className="option active view-option camera-auto"><ViewPreview angle="auto" /><b>{angle.name}</b><small>{angle.hint}</small></div>
        <p className="muted-text">{shotType === 'detail'
          ? 'เปลี่ยนจุดที่ต้องการเน้นในขั้นประเภทภาพ เช่น โลโก้ถ่ายตรง ซิปหรืออะไหล่เอียงเล็กน้อยให้เห็นรูปทรง'
          : 'เปลี่ยนวิธีเทียบขนาดในขั้นประเภทภาพ กล้องจะปรับให้เห็นสัดส่วนจริง ลดภาพหลอกตา'}</p>
      </Section> : <>
        <p className="note">{shotType === 'styled' ? 'เริ่มจากมุมที่เข้ากับฉาก แล้วปรับได้ตามภาพที่ต้องการ' : 'แนะนำหน้าตรงสำหรับภาพหลัก เลือกมุมอื่นเพื่อแสดงทรงและด้านต่างๆ'}</p>
        <div className="options view-options">
          {shotType === 'styled' && <button type="button" className={'option view-option' + (angleId === PRESET ? ' active' : '')}
            aria-pressed={angleId === PRESET} disabled={shot} onClick={() => setAngleId(PRESET)}>
            <ViewPreview angle={recommended.id} /><b>ตามฉาก (แนะนำ)</b><small>{setDef.name} · {recommended.name}</small>
          </button>}
          {shotAngles(shotType).map((a) => <button key={a.id} type="button" className={'option view-option' + ((shotType === 'styled' ? angleId === a.id : angle.id === a.id) ? ' active' : '')}
            aria-pressed={shotType === 'styled' ? angleId === a.id : angle.id === a.id} disabled={shot} onClick={() => setAngleId(a.id)}>
            <ViewPreview angle={a.id} /><b>{a.name}{shotType === 'clean' && a.id === 'front' ? ' (แนะนำ)' : ''}</b><small>{a.hint}</small>
          </button>)}
        </div>
      </>}
    </>;
  } else if (cur.key === 'framing') {
    // ระยะ: การ์ดมีภาพเหมือนมุมกล้อง (ภาพเดียวกัน ขนาดสินค้าในภาพต่างกัน)
    const framingCard = (id: string, active: boolean, title: string, hint: string, value: string) => <button key={id} type="button"
      className={'option view-option' + (active ? ' active' : '')} aria-pressed={active} disabled={shot} onClick={() => setFramingId(value)}>
      <ViewPreview framing={id} /><b>{title}</b><small>{hint}</small>
    </button>;
    panel = <>{shotNote('ระยะ')}<div className="options view-options">
      {framingCard(preset.framing, framingId === PRESET, 'ตามฉาก (แนะนำ)', `${setDef.name}: ${PRODUCT_FRAMINGS.find((f) => f.id === preset.framing)!.name}`, PRESET)}
      {shotFramings(shotType).map((f) => framingCard(f.id, framingId === f.id, f.name, f.hint, f.id))}
    </div></>;
  } else if (cur.key === 'settings') {
    panel = <>
      {/* เลือกตามที่จะโพสต์ (IG / Facebook / TikTok / ร้านค้า) แทนตัวเลขสัดส่วน — กรอบเล็กวาดตามสัดส่วนจริง (28 ต.ค.) */}
      <Section title="ใช้ภาพที่ไหน" note={`สัดส่วน ${aspect === 'auto' ? '4:5' : aspect}`}>
        <div className="options aspect-options">{PRODUCT_ASPECTS.map((a) => <button key={a.id} type="button" aria-pressed={aspect === a.id}
          className={'option aspect-option' + (aspect === a.id ? ' active' : '')} onClick={() => setAspect(a.id)}>
          <span className="aspect-slot" aria-hidden="true"><i className="aspect-frame" style={{ aspectRatio: a.id.replace(':', ' / ') }} /></span>
          <span><b>{a.name}</b><small>{a.use} · {a.id}</small></span>
        </button>)}</div>
      </Section>
      <Section title="สั่งเพิ่มเติม">
        <textarea className="text-input" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="เช่น ให้สายกระเป๋าพาดลงพื้น, เปิดฝากระเป๋าเล็กน้อย" />
      </Section>
      <details className="advanced">
        <summary>ขั้นสูง <small>คุณภาพ</small></summary>
        {/* เลือกโมเดลไม่ได้แล้ว (27 ต.ค. เปิดให้ลูกค้าทดลอง): ใช้ DEFAULT_AI_MODEL เสมอ server บังคับซ้ำ (lib/route.ts) */}
        {aiModels?.length === 0 && <p className="note">ยังไม่มี API key ในไฟล์ .env</p>}
        {aiModel.startsWith('openai:') && (
          <Section title="คุณภาพ (OpenAI)" note={isGpt25(aiModel) ? 'สูงขึ้น = ผิวหนัง/ฝีเข็มชัดขึ้น แต่ช้าและแพงขึ้น' : undefined}>
            <ChipGroup options={isGpt25(aiModel) ? QUALITIES_25 : QUALITIES} value={quality} onChange={setQuality} />
          </Section>
        )}
      </details>
      {genButtons}
    </>;
  }

  // ---------- ประวัติรูป: รูปในชุดภาพเดียวกันอยู่ในกรอบเดียว เรียงตามลำดับในชุด ----------
  const thumb = (i: number, label?: string) => (
    <div className="deletable" key={results[i].src}>
      <button className={current === i ? 'active' : ''} title={results[i].caption} onClick={() => setCurrent(i)}>
        <img src={results[i].src} alt={results[i].caption} />
      </button>
      <DeleteButton onClick={() => void deleteResult(i)} />
      {label && <span className="set-label">{label}</span>}
    </div>
  );
  const historyItems: ReactNode[] = [];
  const seenSets = new Set<string>();
  results.forEach((r, i) => {
    if (!r.set) return void historyItems.push(thumb(i));
    const id = r.set.id;
    if (seenSets.has(id)) return;
    seenSets.add(id);
    const members = results.map((x, j) => ({ x, j })).filter(({ x }) => x.set?.id === id).sort((a, b) => a.x.set!.index - b.x.set!.index);
    const left = pendingSet?.id === id ? pendingSet.left : 0;
    historyItems.push(
      <div className="set-group" key={'set-' + id}>
        <div className="set-head">ชุดภาพ <span>{left ? 'กำลังสร้าง...' : `${members.length} มุม`}</span></div>
        <div className="set-items">
          {members.map(({ x, j }) => thumb(j, x.set!.index === 0 ? 'รูปแรก' : `มุม ${x.set!.index + 1}`))}
          {Array.from({ length: left }, (_, k) => <div className="set-pending" key={k}><div className="spinner" /></div>)}
        </div>
      </div>,
    );
  });

  const empty = !shown && !product;
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Looklet <span className="beta">Beta</span></div>
        <PageSwitch current="product" />
        <div className="status" role="status" title={status}>
          {status && <>{status}<button className="status-x" aria-label="ปิดข้อความ" onClick={() => setStatus('')}>×</button></>}
        </div>
        <div className="top-actions">
          {/* สร้างรูปอยู่ท้ายเส้นทาง (ขั้นตั้งค่า) · ดาวน์โหลดอยู่ใต้รูป (28 ต.ค.) */}
          <TokenUsage />
          <SignOutButton />
        </div>
      </header>

      <div className="workspace">
        <nav className="rail" aria-label="ขั้นตอน">
          {STEPS.map((s, i) => (
            <button key={s.key} className={'rail-btn' + (step === i ? ' active' : '')} onClick={() => goStep(i)} aria-current={step === i ? 'step' : undefined}
              disabled={!used(s.key)} title={used(s.key) ? undefined : `${shotTypeDef.name} ไม่ใช้ขั้นนี้`}>
              <span className="n">{i + 1}</span>
              <s.Icon />
              <span>{s.label}</span>
              {used(s.key) && stepDone[s.key] && s.key !== 'product' && <i className="dot" />}
            </button>
          ))}
        </nav>

        <aside className="panel" onClickCapture={mark} onInputCapture={mark}>
          <div className="panel-head">
            <span className="num">{step + 1}</span>
            <h2>{cur.title}</h2>
          </div>
          {panel}
          {nextStep >= 0 && (
            <button className={'btn next ' + (stepReady ? 'btn-ready' : 'btn-secondary')} onClick={() => goStep(nextStep)}>ถัดไป: {STEPS[nextStep].label} →</button>
          )}
        </aside>

        <section className="stage">
          <div className={'frame' + (busy !== null && !pendingSet ? ' busy' : '')} ref={frameRef}>
            <figure className="zoomable" title="กดเพื่อดูเต็มจอและซูม" onClick={(e) => void openViewer(e)}>
              <canvas ref={canvasRef} hidden={empty} />
              {empty && <p className="muted-text">อัปโหลดรูปสินค้าในขั้นที่ 1 แล้วกด &quot;สร้างรูป&quot;</p>}
            </figure>
            {canvasStatus && <div className="frame-hint" role="status">{canvasStatus}</div>}
            <div className="overlay"><div className="spinner" /><div>{busy}</div></div>
          </div>
          <div className="stage-tools">
            <button className="btn btn-secondary tool" disabled={empty} onClick={save}><IconDownload /> ดาวน์โหลด</button>
            {shown && <button className="btn btn-secondary tool" disabled={busy !== null || planning}
              onClick={() => setLocalEdit(shown)}><IconRetouch /> แก้เฉพาะจุด</button>}
            {shown?.editedFrom && <button className="btn btn-secondary tool" disabled={busy !== null || !results.some((r) => r.src === shown.editedFrom)}
              onClick={() => setCurrent(results.findIndex((r) => r.src === shown.editedFrom))}>ดูต้นฉบับ</button>}
            <div className="caption" title={shown?.caption}>{shown ? shown.caption : product ? `รูปสินค้า: ${product.name} (ยังไม่ได้สร้าง)` : ''}</div>
          </div>
          <div className="history-head">รูปที่สร้างแล้ว <span>{results.length}</span></div>
          <div className="history">
            {historyItems}
            {!results.length && <p className="muted-text">ยังไม่มี เลือกของแต่ละขั้นแล้วกด &quot;สร้างรูป&quot; มุมขวาบน</p>}
          </div>
        </section>

      </div>

      {localEdit && <LocalEditDialog src={localEdit.src} models={aiModels ?? []} initialModel={aiModel} onClose={() => setLocalEdit(null)} onEdit={editLocalArea} />}
      {saveSrc && <SaveImageDialog src={saveSrc} onClose={() => setSaveSrc(null)} />}
      {viewer && <ImageViewer key={viewer.src} src={viewer.src} alt={viewer.alt} start={viewer.start} onClose={() => {
        if (viewer.temp) URL.revokeObjectURL(viewer.src);
        setViewer(null);
      }} />}

    </div>
  );
}
