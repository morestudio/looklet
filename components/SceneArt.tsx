// SceneArt.tsx — ตัวอย่างพื้นหลังกราฟิกบนการ์ด "ฉากสำเร็จรูป" ของหน้าโปสเตอร์ (23 พ.ย.)
// วาดเอง ไม่ใช้รูปตัวอย่างจาก AI (ผู้ใช้ 29 ต.ค.: การ์ดใช้ภาพวาด) · id ตรงกับ POSTER_SCENES ใน lib/poster.ts
// สีในภาพ = สีของงานโปสเตอร์ (เนื้อหาของลูกค้า ไม่ใช่สีของแอป) · รูปคนกลางภาพ = ตัวหลัก (ภาพถ่ายจริง) วางบนงานออกแบบ
import type { ReactNode } from 'react';

const W = 160,
  H = 120;

// ตัวหลัก: รูปคนเรียบๆ สีเข้มกลางภาพ
const Figure = () => (
  <g fill="#3d3a35">
    <circle cx={80} cy={50} r={9} />
    <rect x={66} y={61} width={28} height={64} rx={12} />
  </g>
);

// ตัวหลักอาหาร: ชาม/จาน + แก้วเครื่องดื่ม (ฉากอาหาร)
const FoodSubject = () => (
  <g>
    <ellipse cx={76} cy={96} rx={36} ry={12} fill="#EFECE6" stroke="#2D2A26" strokeWidth={1.6} />
    <ellipse cx={76} cy={92} rx={26} ry={7.5} fill="#C86432" />
    <circle cx={68} cy={91} r={4} fill="#F2B84B" />
    <circle cx={82} cy={90} r={4.5} fill="#6CA35A" />
    <path
      d="M112,62 h18 l-2,30 a2,2 0 0 1 -2,2 h-10 a2,2 0 0 1 -2,-2 Z"
      fill="#FFFFFF"
      opacity={0.9}
      stroke="#2D2A26"
      strokeWidth={1.4}
    />
    <path d="M123,54 l4,-10" stroke="#2D2A26" strokeWidth={2} strokeLinecap="round" />
  </g>
);

// ตัวหลักสินค้า: ขวด + กล่องบรรจุภัณฑ์ (ฉากสินค้า)
const ProductSubject = () => (
  <g>
    <rect x={54} y={56} width={24} height={46} rx={5} fill="#FFFFFF" stroke="#2D2A26" strokeWidth={1.6} />
    <rect x={60} y={46} width={12} height={10} rx={2} fill="#3D3A35" />
    <rect x={58} y={68} width={16} height={20} rx={2} fill="#E5DFD5" />
    <rect x={82} y={64} width={26} height={38} rx={3} fill="#D8CFC2" stroke="#2D2A26" strokeWidth={1.6} />
  </g>
);

// ดาวหลายแฉก (ป๊อปอาร์ต / ปาร์ตี้)
function star(cx: number, cy: number, outer: number, inner: number, points: number) {
  return Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = (i * Math.PI) / points - Math.PI / 2;
    return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
  }).join(' ');
}

// รัศมีแสงอาทิตย์จากใต้ตัวหลัก
const rays = Array.from({ length: 14 }, (_, i) => {
  const a0 = Math.PI + (i * Math.PI) / 14,
    a1 = Math.PI + ((i + 1) * Math.PI) / 14;
  const [cx, cy, r] = [80, 128, 190];
  return {
    d: `M${cx},${cy} L${cx + Math.cos(a0) * r},${cy + Math.sin(a0) * r} L${cx + Math.cos(a1) * r},${cy + Math.sin(a1) * r} Z`,
    fill: i % 2 ? '#F4E285' : '#F4A259',
  };
});

// กระดาษสีของปาร์ตี้ (ตำแหน่งตายตัว)
const CONFETTI: [number, number, number, string][] = [
  [18, 16, 20, '#EF476F'],
  [40, 34, -30, '#FFD166'],
  [128, 20, 45, '#06D6A0'],
  [146, 46, -15, '#118AB2'],
  [24, 70, 60, '#06D6A0'],
  [132, 84, 25, '#EF476F'],
  [52, 98, -50, '#118AB2'],
  [112, 104, 10, '#FFD166'],
  [100, 14, -60, '#EF476F'],
  [60, 10, 30, '#118AB2'],
];

// color = สีหลักที่ผู้ใช้เลือกในขั้นกราฟิก (เฉพาะการ์ด AI ออกแบบให้: พื้นหลังจะออกมาในสีนี้)
const ART: Record<string, (id: string, color: string) => ReactNode> = {
  // AI ออกแบบพื้นหลังเอง (24 พ.ย.): พื้นสีหลัก แสงฟุ้งกลาง วงกลมใหญ่หลังตัวหลัก ริบบิ้น ใบไม้ ฟอง ประกาย (แบบที่ได้จากการทดสอบขวดน้ำ)
  'ai-design': (id, color) => (
    <>
      <defs>
        <radialGradient id={`${id}-glow`} cx="50%" cy="46%" r="70%">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.85} />
          <stop offset="0.45" stopColor={color} stopOpacity={0.45} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={color} />
      <rect width={W} height={H} fill={`url(#${id}-glow)`} />
      <circle cx={80} cy={66} r={40} fill="#FFFFFF" opacity={0.3} />
      <path
        d="M0,92 C40,78 70,108 110,92 S150,84 160,88 V102 C140,98 120,108 100,108 C70,110 40,96 0,106 Z"
        fill="#FFFFFF"
        opacity={0.55}
      />
      <path d="M24,40 q10,-12 21,-3 q-10,10 -21,3 Z" fill="#5FA052" />
      <path d="M124,28 q12,-7 19,3 q-12,7 -19,-3 Z" fill="#5FA052" />
      <path d="M128,98 q9,-10 18,-2 q-9,9 -18,2 Z" fill="#5FA052" />
      {[
        [38, 74, 4],
        [132, 58, 3],
        [46, 22, 2.4],
      ].map(([x, y, r]) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={r}
          fill="#FFFFFF"
          opacity={0.55}
          stroke="#FFFFFF"
          strokeWidth={0.8}
        />
      ))}
      <polygon points={star(140, 78, 6, 1.6, 4)} fill="#FFFFFF" />
    </>
  ),
  shape: () => (
    <>
      <rect width={W} height={H} fill="#F3E3C3" />
      <circle cx={80} cy={64} r={46} fill="#E9A15B" />
    </>
  ),
  riverside: (id) => (
    <>
      <defs>
        <filter id={`${id}-soft`}>
          <feGaussianBlur stdDeviation={1.4} />
        </filter>
      </defs>
      <rect width={W} height={H} fill="#DCEBFA" />
      <g filter={`url(#${id}-soft)`}>
        <path d="M0,62 Q30,40 58,56 T112,50 T160,54 V84 H0 Z" fill="#A9C6E8" opacity={0.8} />
        <path d="M0,74 Q40,60 80,70 T160,66 V90 H0 Z" fill="#7FA6D6" opacity={0.7} />
        <rect y={84} width={W} height={36} fill="#C9DDF3" />
      </g>
      <g stroke="#5E8FC9" strokeWidth={1.4} fill="none">
        <path d="M118,48 V84 M138,48 V84" />
        <path d="M118,50 L100,78 M118,50 L132,76 M138,50 L124,76 M138,50 L156,78" strokeWidth={0.8} />
        <path d="M96,80 H160" />
      </g>
      {[20, 34, 46, 62].map((x) => (
        <circle key={x} cx={x} cy={78} r={1.4} fill="#F2C46D" />
      ))}
    </>
  ),
  wash: (id) => (
    <>
      <defs>
        <filter id={`${id}-bleed`}>
          <feGaussianBlur stdDeviation={9} />
        </filter>
      </defs>
      <rect width={W} height={H} fill="#F4F1EC" />
      <g filter={`url(#${id}-bleed)`} opacity={0.85}>
        <ellipse cx={46} cy={44} rx={44} ry={30} fill="#C9B8E0" />
        <ellipse cx={118} cy={70} rx={46} ry={34} fill="#A9C8E6" />
        <ellipse cx={76} cy={100} rx={40} ry={18} fill="#F2C6D3" />
      </g>
    </>
  ),
  halftone: (id) => (
    <>
      <defs>
        <pattern id={`${id}-dots`} width={8} height={8} patternUnits="userSpaceOnUse">
          <circle cx={4} cy={4} r={1.9} fill="#E39A00" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="#FFD23F" />
      <rect width={W} height={H} fill={`url(#${id}-dots)`} opacity={0.55} />
      <polygon points={star(80, 66, 62, 42, 14)} fill="#EE4266" stroke="#141414" strokeWidth={2} />
    </>
  ),
  memphis: () => (
    <>
      <rect width={W} height={H} fill="#FCE1E4" />
      <path d="M10,28 q8,-10 16,0 t16,0 t16,0" stroke="#141414" strokeWidth={2.4} fill="none" />
      <path d="M112,104 q8,-10 16,0 t16,0" stroke="#141414" strokeWidth={2.4} fill="none" />
      <polygon points="124,14 144,48 104,48" fill="#9AD0EC" />
      <path d="M16,96 a16,16 0 0 1 32,0 Z" fill="#9AD0EC" />
      <path d="M128,64 l6,-8 l6,8 l6,-8 l6,8" stroke="#F7A541" strokeWidth={2.4} fill="none" />
      {[
        [30, 56],
        [140, 30],
        [108, 86],
        [44, 14],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={3.4} fill="#F7C843" />
      ))}
    </>
  ),
  papercut: (id) => (
    <>
      <defs>
        <filter id={`${id}-lift`} x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx={0} dy={-1.5} stdDeviation={1.6} floodOpacity={0.28} />
        </filter>
      </defs>
      <rect width={W} height={H} fill="#F7D9C4" />
      <g filter={`url(#${id}-lift)`}>
        <path d="M0,58 Q40,38 80,54 T160,46 V120 H0 Z" fill="#E6A57E" />
        <path d="M0,78 Q44,62 88,78 T160,70 V120 H0 Z" fill="#7FB7BE" />
        <path d="M0,98 Q36,86 76,98 T160,92 V120 H0 Z" fill="#4F8A8B" />
      </g>
    </>
  ),
  gradient: (id) => (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7F5AF0" />
          <stop offset="1" stopColor="#FF8E3C" />
        </linearGradient>
        <filter id={`${id}-glow`}>
          <feGaussianBlur stdDeviation={10} />
        </filter>
        <filter id={`${id}-grain`}>
          <feTurbulence type="fractalNoise" baseFrequency={0.9} numOctaves={2} seed={3} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-sky)`} />
      <g filter={`url(#${id}-glow)`} opacity={0.6}>
        <circle cx={40} cy={30} r={26} fill="#FFD6A5" />
        <circle cx={130} cy={92} r={30} fill="#F15BB5" />
      </g>
      <rect width={W} height={H} filter={`url(#${id}-grain)`} opacity={0.12} />
    </>
  ),
  sunburst: () => (
    <>
      <rect width={W} height={H} fill="#F4E285" />
      {rays.map((r, i) => (
        <path key={i} d={r.d} fill={r.fill} />
      ))}
      <rect y={108} width={W} height={12} fill="#E07A3F" />
    </>
  ),
  confetti: () => (
    <>
      <rect width={W} height={H} fill="#2B2D42" />
      <path d="M0,30 C30,10 40,50 70,26" stroke="#FFD166" strokeWidth={2.2} fill="none" />
      <path d="M100,110 C120,86 140,116 160,94" stroke="#EF476F" strokeWidth={2.2} fill="none" />
      {CONFETTI.map(([x, y, r, c]) => (
        <rect
          key={`${x}-${y}`}
          x={x - 4}
          y={y - 2}
          width={8}
          height={4}
          rx={1}
          fill={c}
          transform={`rotate(${r} ${x} ${y})`}
        />
      ))}
      <polygon points={star(30, 102, 6, 2.6, 5)} fill="#FFD166" />
      <polygon points={star(142, 64, 5, 2.2, 5)} fill="#06D6A0" />
    </>
  ),
  'dark-wood': (id) => (
    <>
      <defs>
        <radialGradient id={`${id}-rim`} cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#5C3D28" />
          <stop offset="1" stopColor="#14100D" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-rim)`} />
      <rect y={86} width={W} height={34} fill="#241912" />
      <line x1={0} y1={86} x2={W} y2={86} stroke="#3D2B1F" strokeWidth={1.2} />
    </>
  ),
  'cafe-wood': (id) => (
    <>
      <defs>
        <linearGradient id={`${id}-warm`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FBF4E8" />
          <stop offset="1" stopColor="#E6CEAE" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-warm)`} />
      <polygon points="0,0 74,0 38,88 0,88" fill="#FFFFFF" opacity={0.35} />
      <rect y={86} width={W} height={34} fill="#C9A278" />
    </>
  ),
  'food-splash': (id) => (
    <>
      <defs>
        <radialGradient id={`${id}-hot`} cx="0.5" cy="0.55" r="0.65">
          <stop offset="0" stopColor="#F7B733" />
          <stop offset="1" stopColor="#D63B16" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-hot)`} />
      <circle cx={42} cy={46} r={5} fill="#FFF2B2" opacity={0.6} />
      <circle cx={124} cy={38} r={6} fill="#FFF2B2" opacity={0.55} />
      <circle cx={34} cy={76} r={3.5} fill="#FFFFFF" opacity={0.45} />
      <path
        d="M56,42 q6,-10 0,-20 M96,38 q6,-10 0,-20"
        stroke="#FFFFFF"
        strokeWidth={2.2}
        strokeLinecap="round"
        fill="none"
        opacity={0.5}
      />
      <rect y={90} width={W} height={30} fill="#B82C0C" opacity={0.55} />
    </>
  ),
  'studio-podium': () => (
    <>
      <rect width={W} height={H} fill="#EFECE6" />
      <polygon points="106,0 160,0 160,92 64,92" fill="#E0DAD0" opacity={0.65} />
      <rect x={44} y={92} width={72} height={28} rx={4} fill="#D5CBBF" />
      <ellipse cx={80} cy={92} rx={36} ry={7} fill="#E6DFD5" />
    </>
  ),
  'dark-spotlight': (id) => (
    <>
      <defs>
        <radialGradient id={`${id}-spot`} cx="0.5" cy="0.5" r="0.55">
          <stop offset="0" stopColor="#3B424E" />
          <stop offset="0.65" stopColor="#171B22" />
          <stop offset="1" stopColor="#0B0D10" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-spot)`} />
      <ellipse cx={80} cy={104} rx={48} ry={8} fill="#050608" opacity={0.85} />
    </>
  ),
  'pastel-ecom': (id) => (
    <>
      <defs>
        <linearGradient id={`${id}-soft`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FDF6F0" />
          <stop offset="1" stopColor="#E6D6E8" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-soft)`} />
      <circle cx={80} cy={68} r={44} fill="#FFFFFF" opacity={0.5} />
      <rect y={94} width={W} height={26} fill="#F3E6EC" />
    </>
  ),
};

const FOOD_STAGES = new Set(['dark-wood', 'cafe-wood', 'food-splash']);
const PRODUCT_STAGES = new Set(['studio-podium', 'dark-spotlight', 'pastel-ecom']);

export default function SceneArt({
  id,
  className,
  color = '#F7C843',
}: {
  id: string;
  className?: string;
  color?: string;
}) {
  const draw = ART[id];
  if (!draw) return null;
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {draw(`sa-${id}`, color)}
      {FOOD_STAGES.has(id) ? (
        <FoodSubject />
      ) : PRODUCT_STAGES.has(id) || id === 'ai-design' ? (
        <ProductSubject />
      ) : (
        <Figure />
      )}
    </svg>
  );
}
