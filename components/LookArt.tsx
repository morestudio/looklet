// LookArt.tsx — ภาพวาดบนการ์ด "สไตล์ภาพ" ของหน้าโปสเตอร์ (ผู้ใช้ 25 พ.ย. จากโปสเตอร์ตัวอย่าง Nina Simone / Atlanta Jazz)
// วาดเอง ไม่ใช้รูปตัวอย่างจาก AI (ผู้ใช้ 29 ต.ค.: การ์ดใช้ภาพวาด) · id ตรงกับ POSTER_LOOKS ใน lib/poster.ts
// แต่ละใบ = โปสเตอร์ย่อ: สไตล์ภาพ + กราฟิกข้อความที่มากับสไตล์นั้น (แถบสี = ตัวหนังสือ) · ขนาดเดียวกับ SceneArt (160×120)
import type { ReactNode } from 'react';
import type { PosterLook } from '@/lib/poster';

const W = 160,
  H = 120;

// สองคน (ตัวหลักของตัวอย่าง Soul): หัว + ตัว · body = สีเสื้อ
const Pair = ({ skin, left, right, line }: { skin: string; left: string; right: string; line?: string }) => (
  <g stroke={line} strokeWidth={line ? 1.4 : 0}>
    <rect x={56} y={58} width={26} height={70} rx={10} fill={left} />
    <circle cx={69} cy={48} r={9} fill={skin} />
    <rect x={84} y={60} width={26} height={68} rx={10} fill={right} />
    <circle cx={97} cy={50} r={9} fill={skin} />
  </g>
);

// โน้ตดนตรี
const Note = ({ x, y, color }: { x: number; y: number; color: string }) => (
  <g fill={color} stroke={color}>
    <ellipse cx={x} cy={y + 9} rx={3.4} ry={2.6} />
    <path d={`M${x + 3},${y + 9} V${y}`} strokeWidth={1.4} />
    <path d={`M${x + 3},${y} q4,2 5,6`} strokeWidth={1.4} fill="none" />
  </g>
);

// แสงอาทิตย์ครึ่งวงพร้อมรัศมี (ภาพวาดย้อนยุค)
const sunRays = Array.from({ length: 12 }, (_, i) => {
  const a0 = Math.PI + (i * Math.PI) / 12,
    a1 = Math.PI + ((i + 0.5) * Math.PI) / 12;
  const [cx, cy, r] = [82, 74, 120];
  return `M${cx},${cy} L${(cx + Math.cos(a0) * r).toFixed(1)},${(cy + Math.sin(a0) * r).toFixed(1)} L${(cx + Math.cos(a1) * r).toFixed(1)},${(cy + Math.sin(a1) * r).toFixed(1)} Z`;
});

const ART: Record<PosterLook, ReactNode> = {
  // ภาพถ่าย: สีธรรมชาติ แสงนุ่ม
  photo: (
    <>
      <defs>
        <linearGradient id="look-photo-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E7EEF3" />
          <stop offset="1" stopColor="#F3E7D6" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#look-photo-bg)" />
      <circle cx={128} cy={28} r={16} fill="#FFF6E2" opacity={0.9} />
      <Pair skin="#D9A57E" left="#C8423A" right="#A8A6A0" />
      <rect x={44} y={98} width={72} height={9} rx={2} fill="#2D2A26" />
      <rect x={56} y={110} width={48} height={4} rx={2} fill="#2D2A26" opacity={0.7} />
    </>
  ),
  // ขาวดำวินเทจ + โปสเตอร์คอนเสิร์ต: คลับมืด สปอตไลต์ ไมค์ ชื่อตัวโตด้านบน รายละเอียดด้านล่าง
  bw: (
    <>
      <defs>
        <radialGradient id="look-bw-bg" cx="0.5" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#6B6862" />
          <stop offset="1" stopColor="#1C1B19" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill="url(#look-bw-bg)" />
      <path d="M70,0 L96,0 L128,120 L36,120 Z" fill="#FFFFFF" opacity={0.08} />
      <circle cx={20} cy={70} r={3} fill="#D8D4CC" opacity={0.5} />
      <circle cx={142} cy={64} r={2.5} fill="#D8D4CC" opacity={0.5} />
      <g stroke="#CFCBC3" strokeWidth={1.6}>
        <path d="M124,52 V118" />
        <path d="M116,118 H132" />
      </g>
      <rect x={119} y={44} width={10} height={12} rx={5} fill="#CFCBC3" />
      <Pair skin="#BDB8AF" left="#5E5B56" right="#8E8A83" />
      <rect x={34} y={8} width={92} height={15} rx={1.5} fill="#F3EEE4" />
      <rect x={54} y={27} width={52} height={5} rx={1} fill="#C9A24A" />
      <rect x={48} y={100} width={64} height={4} rx={1} fill="#F3EEE4" opacity={0.9} />
      <rect x={58} y={108} width={44} height={5} rx={1} fill="#F3EEE4" />
    </>
  ),
  // ภาพวาดย้อนยุค + คอนเสิร์ตย้อนยุค: ครีม แสงอาทิตย์ส้ม โน้ต คนวาดเส้น วันที่ส้ม + แผ่นป้ายชื่องานสีเข้มด้านล่าง
  print: (
    <>
      <rect width={W} height={H} fill="#F3E3C2" />
      <g fill="#E8823A" opacity={0.55}>
        {sunRays.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <circle cx={82} cy={74} r={34} fill="#E8823A" />
      <Note x={18} y={14} color="#2D1F14" />
      <Note x={136} y={20} color="#2D1F14" />
      <Pair skin="#F0B27A" left="#D9542B" right="#E9D7B5" line="#2D1F14" />
      <g fill="#E8823A">
        <path d="M30,84 l5,3 l-5,3 Z M36,84 l5,3 l-5,3 Z" />
        <path d="M130,84 l-5,3 l5,3 Z M124,84 l-5,3 l5,3 Z" />
      </g>
      <rect x={46} y={82} width={68} height={9} rx={1} fill="#E8823A" stroke="#2D1F14" strokeWidth={1} />
      <rect x={14} y={96} width={132} height={18} fill="#2D1F14" />
      <rect x={17} y={99} width={126} height={12} fill="none" stroke="#F3E3C2" strokeWidth={0.8} />
      <rect x={40} y={102} width={80} height={6} rx={1} fill="#F3E3C2" />
      <rect x={0} y={114} width={W} height={6} fill="#F3E3C2" />
      <rect x={60} y={116} width={40} height={2} rx={1} fill="#2D1F14" />
    </>
  ),
};

export default function LookArt({ id, className }: { id: PosterLook; className?: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {ART[id]}
    </svg>
  );
}
