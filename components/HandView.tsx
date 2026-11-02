// HandView.tsx — ภาพวาดในการ์ดขั้นท่าถือของ Handshot (หน้าสินค้า) + การ์ดประเภทภาพ Handshot
// สไตล์เดียวกับ ViewPreview / PersonView: ผนังสตูดิโอสีอ่อน เส้นเทา มือ/แขนเป็นหุ่นสีกระดาษ · สินค้าสีแทนให้แยกจากมือออก
// มืออย่างเดียว = มือเข้ามาจากขอบภาพ · เห็นลำตัว = ตัดใต้คางถึงกลางต้นขา (ไม่มีหน้า ตามที่สั่ง AI)
import type { ReactNode } from 'react';
import { CLOTH, HAIR, INK, LABEL, PAPER, SHADE, WALL } from './drawing-colors';

const PRODUCT = '#d9c3a5'; // สินค้า: สีแทนอุ่น (กระเป๋าหนัง / กล่อง) ให้เห็นชัดว่าอะไรคือสินค้า อะไรคือมือ
const line = { stroke: INK, strokeWidth: 1.2, strokeLinejoin: 'round' } as const;
const thin = { stroke: LABEL, strokeWidth: 1.2, fill: 'none', strokeLinecap: 'round' } as const;

// แขน/นิ้วเป็นท่อมีขอบ: เส้นหมึกหนา แล้วทับด้วยเส้นสีกระดาษที่บางกว่า
function Limb({ d, w = 13, fill = PAPER }: { d: string; w?: number; fill?: string }) {
  return <>
    <path d={d} stroke={INK} strokeWidth={w + 2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d={d} stroke={fill} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </>;
}
// ฉลากบนสินค้า: เส้นสีกระดาษ 2 เส้น
const Label = ({ x, y, w }: { x: number; y: number; w: number }) => <path d={`M${x} ${y} H${x + w} M${x} ${y + 8} H${x + w * 0.65}`} stroke={PAPER} strokeWidth="2.5" strokeLinecap="round" />;
// พื้นหลังเรียบ + ลำแสงหน้าต่างจางๆ (Handshot ใช้แสงหน้าต่างเสมอ)
const Backdrop = () => <>
  <rect width="240" height="150" fill={WALL} />
  <path d="M168 0 H214 L132 150 H86Z" fill="#fff" opacity=".45" />
</>;
// ลำตัว (เห็นแขนและลำตัว): คอ ปลายผม เสื้อถัก กางเกง · ตัดใต้คางถึงกลางต้นขา
const Torso = () => <>
  <rect x="109" y="-4" width="22" height="14" fill={PAPER} {...line} />
  <path d="M90 -4 C84 18 86 38 94 50 L101 48 C96 34 97 14 102 -4Z" fill={HAIR} {...line} />
  <path d="M60 20 C72 9 100 7 120 7 C140 7 168 9 180 20 L174 92 H66Z" fill={CLOTH} {...line} />
  <path d="M108 8 Q120 15 132 8" {...thin} />
  <path d="M66 92 H174 L178 154 H62Z" fill={SHADE} {...line} />
  <path d="M120 92 V154 M90 92 L92 112" {...thin} />
</>;

const ART: Record<string, () => ReactNode> = {
  // ถือโชว์: มือเข้ามาจากขอบล่าง กำรอบขวด/กล่องที่ตั้งตรง
  hold: () => <><Backdrop />
    <path d="M84 154 L90 130 H136 L142 154Z" fill={SHADE} {...line} />
    <path d="M93 132 C88 114 91 98 99 86 H143 C151 98 149 117 137 132Z" fill={PAPER} {...line} />
    <rect x="100" y="20" width="40" height="88" rx="6" fill={PRODUCT} {...line} />
    <Label x={108} y={44} w={24} />
    <Limb d="M146 62 H124" w={9} /><Limb d="M147 73 H121" w={9} /><Limb d="M147 84 H122" w={9} /><Limb d="M145 95 H127" w={8} />
    <Limb d="M97 104 C95 92 98 82 105 76" w={10} />
  </>,
  // วางบนฝ่ามือ: มือแบหงายเข้ามาจากซ้าย สินค้าวางอยู่บนฝ่ามือ
  palm: () => <><Backdrop />
    <path d="M-4 100 L34 94 L38 128 L-4 136Z" fill={SHADE} {...line} />
    <path d="M34 96 C70 90 110 94 150 100 L196 101 C205 101 205 110 196 111 L150 114 C118 122 72 126 36 127Z" fill={PAPER} {...line} />
    <path d="M152 104 H192 M150 108 H190" {...thin} />
    <ellipse cx="120" cy="101" rx="34" ry="4" fill="#000" opacity=".08" />
    <rect x="92" y="50" width="56" height="50" rx="6" fill={PRODUCT} {...line} />
    <Label x={100} y={64} w={32} />
    <Limb d="M70 120 C74 110 84 106 92 108" w={10} />
  </>,
  // หิ้วหูกระเป๋า: กำมือที่หูกระเป๋าด้านบน กระเป๋าห้อยลงตามน้ำหนัก
  handle: () => <><Backdrop />
    <path d="M86 78 C88 28 152 28 154 78" stroke={INK} strokeWidth="7.4" fill="none" />
    <path d="M86 78 C88 28 152 28 154 78" stroke={PRODUCT} strokeWidth="5" fill="none" />
    <path d="M70 -4 H104 L112 18 L86 26Z" fill={SHADE} {...line} />
    <path d="M88 24 C92 12 122 8 134 16 C142 22 142 36 134 42 L100 44 C90 40 85 32 88 24Z" fill={PAPER} {...line} />
    <path d="M108 32 V42 M118 31 V42 M127 32 V40" stroke={INK} strokeWidth="1" />
    <path d="M70 76 H170 L178 130 Q120 138 62 130Z" fill={PRODUCT} {...line} />
    <path d="M76 84 H164" stroke={PAPER} strokeWidth="1.2" strokeDasharray="3 3" />
    <g fill={PAPER} stroke={INK}><circle cx="86" cy="78" r="2.6" /><circle cx="154" cy="78" r="2.6" /></g>
  </>,
  // ถือระดับอก: สองมือถือสินค้าไว้หน้าอก
  chest: () => <><Backdrop /><Torso />
    <Limb d="M66 24 L56 74 L102 74" w={14} />
    <Limb d="M174 24 L184 74 L136 84" w={14} />
    <rect x="102" y="24" width="36" height="66" rx="6" fill={PRODUCT} {...line} />
    <Label x={109} y={42} w={22} />
    <ellipse cx="106" cy="70" rx="9" ry="8" fill={PAPER} {...line} />
    <ellipse cx="132" cy="88" rx="11" ry="7" fill={PAPER} {...line} />
  </>,
  // คล้องแขน: งอแขนท่อนล่างขวางเอว กระเป๋าห้อยที่ข้อพับ
  arm: () => <><Backdrop /><Torso />
    <Limb d="M174 24 L180 100" w={14} />
    <Limb d="M66 24 L60 84 L150 92" w={14} />
    <path d="M58 112 C60 56 108 56 110 112" stroke={INK} strokeWidth="6.4" fill="none" />
    <path d="M58 112 C60 56 108 56 110 112" stroke={PRODUCT} strokeWidth="4" fill="none" />
    <path d="M50 110 H118 L122 148 Q86 154 46 148Z" fill={PRODUCT} {...line} />
    <path d="M56 117 H112" stroke={PAPER} strokeWidth="1.2" strokeDasharray="3 3" />
  </>,
  // ถือข้างลำตัว: แขนแนบข้างตัว หิ้วกระเป๋าที่ระดับสะโพก
  side: () => <><Backdrop /><Torso />
    <Limb d="M66 24 L58 70 L54 106" w={14} />
    <path d="M162 130 C164 98 204 98 206 130" stroke={INK} strokeWidth="6.4" fill="none" />
    <path d="M162 130 C164 98 204 98 206 130" stroke={PRODUCT} strokeWidth="4" fill="none" />
    <Limb d="M174 24 L180 70 L184 104" w={14} />
    <path d="M154 128 H214 L218 154 H150Z" fill={PRODUCT} {...line} />
    <path d="M160 135 H208" stroke={PAPER} strokeWidth="1.2" strokeDasharray="3 3" />
  </>,
};

// ภาพของท่าเดียว (ใช้ใน svg ของการ์ดประเภทภาพด้วย) · ท่าที่ไม่รู้จัก = ถือโชว์
export const HandArt = ({ pose }: { pose: string }) => <>{(ART[pose] ?? ART.hold)()}</>;

export function HandView({ pose }: { pose: string }) {
  return <svg className="scene-preview" viewBox="0 0 240 150" aria-hidden="true" focusable="false"><HandArt pose={pose} /></svg>;
}
