// PersonView.tsx — ภาพวาดในการ์ดขั้นมุมมองของหน้านางแบบ (ระยะ / มุมกล้อง / ตำแหน่ง)
// สไตล์เดียวกับ ViewPreview ของหน้าสินค้า (Packshot.tsx): ฉากสตูดิโอสีอ่อน เส้นเทา · คนเป็นหุ่นเรียบๆ ผมบ๊อบ ใส่เสื้อ + กระโปรง
// ระยะ = ตัดคนที่ความสูงต่างกัน · มุมกล้อง = กล้องเล็กๆ ที่ความสูงนั้น + เส้นสายตา (มุมต่ำขายาว หัวเล็ก · มุมสูงกลับกัน)
// ตำแหน่ง = คนอยู่ 1/3 ซ้าย / กลาง / 1/3 ขวา มีเส้นแบ่งสามส่วนจางๆ
import type { ReactNode } from 'react';

const INK = '#77776f', PAPER = '#fafaf8', CLOTH = '#e7e6df', SHADE = '#dcdbd2', HAIR = '#cfcdc4', LABEL = '#b8b8ae';
// เส้นหนาเท่ากันทุกขนาดตัว (ตัวคนถูกขยายถึง 5 เท่าในการ์ด "ใกล้")
const line = { stroke: INK, strokeWidth: 1.2, vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round' } as const;
const thin = { stroke: LABEL, strokeWidth: 1.2, vectorEffect: 'non-scaling-stroke', fill: 'none' } as const;

// หน่วยของตัวคน: หัว y≈0 เท้า y≈97 กลางตัว x=0 · h = ความสูงตัว 100 หน่วยเป็นพิกเซลในการ์ด
// legs / head = สัดส่วนขา / หัว · turn = หันเฉียง (ตัวแคบลง เห็นด้านข้างเป็นสีเข้ม มีจมูก) · ghost = จางๆ (การ์ดสุ่มตำแหน่ง)
export function Person({ x, top, h, legs = 1, head = 1, turn = false, ghost = false }: {
  x: number; top: number; h: number; legs?: number; head?: number; turn?: boolean; ghost?: boolean;
}) {
  const r = 6.2 * head, cy = 13 - r, R = r + 1.6, foot = 63 + 34 * legs;
  const leg = (side: 1 | -1) => <path d={`M${7 * side} 63 L${2.5 * side} 63 L${3 * side} ${foot - 1} L${6 * side} ${foot - 1}Z`} fill={PAPER} {...line} />;
  const arm = (side: 1 | -1) => <path d={`M${10.6 * side} 18 L${15.4 * side} 47 L${12.4 * side} 48 L${8 * side} 24Z`} fill={PAPER} {...line} />;
  return <g transform={`translate(${x} ${top}) scale(${h / 100})`} opacity={ghost ? 0.4 : 1}>
    <g transform={turn ? 'translate(1.5 0)' : undefined}>
      {/* ผมบ๊อบยาวถึงใต้คาง อยู่หลังหน้า */}
      <path d={`M${-R} ${cy} A${R} ${R} 0 0 1 ${R} ${cy} L${R} ${cy + r + 3} Q0 ${cy + r + 5} ${-R} ${cy + r + 3}Z`} fill={HAIR} {...line} />
      <rect x="-2.2" y="11.5" width="4.4" height="6" fill={PAPER} {...line} />
      <circle cy={cy} r={r} fill={PAPER} {...line} />
      {turn && <path d={`M${r - 0.4} ${cy - 1} l1.6 2.2 l-1.5 .6`} fill={PAPER} {...line} />}
    </g>
    <g transform={turn ? 'scale(.72 1)' : undefined}>
      {arm(-1)}{!turn && arm(1)}
      {leg(-1)}{leg(1)}
      <ellipse cx="-4.6" cy={foot} rx="3.3" ry="1.6" fill={INK} /><ellipse cx="4.6" cy={foot} rx="3.3" ry="1.6" fill={INK} />
      <path d="M-7.5 40 L-15 63 H15 L7.5 40Z" fill={CLOTH} {...line} />
      <path d="M-2.5 41 L-5 62 M2.5 41 L5 62" {...thin} />
      <path d="M-11 17 Q-12 29 -7.5 40 H7.5 Q12 29 11 17 Q0 15 -11 17Z" fill={PAPER} {...line} />
      {turn && <path d="M6 17.4 Q8.5 29 5 40 H7.5 Q12 29 11 17Z M5 40 L9.5 63 H15 L7.5 40Z" fill={SHADE} {...line} />}
      <path d="M-4.5 16.3 Q0 21.5 4.5 16.3" {...thin} />
      <g fill={INK}><circle cy="24" r=".75" /><circle cy="29.5" r=".75" /><circle cy="35" r=".75" /></g>
    </g>
  </g>;
}

// ฉากสตูดิโอ: ผนัง + พื้นโค้งต่อผนัง · horizon = ขอบพื้น (สูง = เห็นพื้นเยอะ)
const Room = ({ horizon = 100 }: { horizon?: number }) => <>
  <rect width="240" height="150" fill="#f3f3f0" />
  <path d={`M0 ${horizon} Q120 ${horizon - 9} 240 ${horizon} V150 H0Z`} fill="#000" opacity=".04" />
</>;
const Shadow = ({ x, y, rx }: { x: number; y: number; rx: number }) => <ellipse cx={x} cy={y} rx={rx} ry="4" fill="#000" opacity=".08" />;
const Sparkle = () => <path d="m206 16 4 9 9 4-9 4-4 9-4-9-9-4 9-4Z M222 44 l2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill={INK} />;

// กล้องเล็กๆ ทางซ้าย หันหาคน · tilt < 0 = เงยขึ้น (มุมต่ำ) · > 0 = ก้มลง (มุมสูง) · เส้นประ = แนวที่กล้องมอง
const Camera = ({ y, tilt = 0 }: { y: number; tilt?: number }) => <g transform={`translate(26 ${y}) rotate(${tilt}) scale(1.35)`}>
  <path d="M12 0 H68" stroke={LABEL} strokeWidth="1.2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
  <rect x="-5" y="-9" width="7" height="3.5" rx="1" fill={INK} />
  <rect x="-10" y="-6" width="18" height="12" rx="2.5" fill={PAPER} stroke={INK} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
  <circle cx="8" r="4" fill={PAPER} stroke={INK} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
</g>;

// มุมกล้อง: คนเต็มตัวยืนที่ x=136 (เว้นที่ให้กล้องทางซ้าย)
const ANGLE_ART: Record<string, () => ReactNode> = {
  chest: () => <><Room /><Shadow x={136} y={117} rx={20} /><Person x={136} top={30} h={88} /><Camera y={52} /></>,
  eye: () => <><Room /><Shadow x={136} y={117} rx={20} /><Person x={136} top={30} h={88} /><Camera y={38} /></>,
  side: () => <><Room /><Shadow x={136} y={117} rx={18} /><Person x={136} top={30} h={88} turn /><Camera y={52} /></>,
  low: () => <><Room horizon={116} /><Shadow x={136} y={124} rx={20} /><Person x={136} top={22} h={88} legs={1.22} head={0.85} /><Camera y={132} tilt={-24} /></>,
  high: () => <><Room horizon={64} /><Shadow x={136} y={112} rx={22} /><Person x={136} top={44} h={80} legs={0.8} head={1.18} /><Camera y={20} tilt={22} /></>,
};

// ระยะ: เต็มตัว 60% · เห็นฉากกว้าง (มีหน้าต่าง + ต้นไม้ให้รู้ว่าเห็นสถานที่) · เข่าขึ้นไป · ครึ่งตัว · ใกล้ (คางถึงเอว)
const FRAMING_ART: Record<string, () => ReactNode> = {
  full: () => <><Room /><Shadow x={120} y={118} rx={20} /><Person x={120} top={31} h={90} /></>,
  wide: () => <><Room horizon={98} />
    <rect x="26" y="22" width="44" height="54" rx="2" fill="#fbfbf9" stroke={INK} strokeWidth="1.2" />
    <path d="M48 22 V76 M26 49 H70" stroke={INK} strokeWidth="1.2" />
    <path d="M196 104 h18 l-3 16 h-12Z" fill={CLOTH} stroke={INK} strokeWidth="1.2" />
    <path d="M205 104 C200 92 190 86 184 84 M205 104 C206 90 212 80 220 76 M205 104 C204 94 198 80 199 70" stroke="#8fa77a" strokeWidth="2.2" fill="none" />
    <Shadow x={120} y={112} rx={14} /><Person x={120} top={50} h={62} /></>,
  knee: () => <><Room /><Person x={120} top={10} h={172} /></>,
  waist: () => <><Room /><Person x={120} top={8} h={280} /></>,
  detail: () => <><Room /><Person x={120} top={-66} h={540} /></>,
};

const PLACE_X: Record<string, number> = { left: 80, center: 120, right: 160 };
const thirds = <path d="M80 6 V144 M160 6 V144" stroke={LABEL} strokeWidth="1" strokeDasharray="3 4" opacity=".7" />;

export function PersonView({ framing, angle, placement }: { framing?: string; angle?: string; placement?: string }) {
  let art: ReactNode;
  if (framing) art = (FRAMING_ART[framing] ?? FRAMING_ART.full)();
  else if (angle) art = (ANGLE_ART[angle] ?? ANGLE_ART.chest)();
  else if (placement === 'auto') { // สุ่มต่อรูป: คนจางๆ ทั้งสามตำแหน่ง
    art = <><Room />{thirds}{[80, 120, 160].map((x) => <Person key={x} x={x} top={36} h={82} ghost />)}<Sparkle /></>;
  } else {
    const x = PLACE_X[placement ?? 'center'] ?? 120;
    art = <><Room />{thirds}<Shadow x={x} y={116} rx={18} /><Person x={x} top={36} h={82} /></>;
  }
  return <svg className="scene-preview" viewBox="0 0 240 150" aria-hidden="true" focusable="false">{art}</svg>;
}
