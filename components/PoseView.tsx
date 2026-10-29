// PoseView.tsx — ภาพวาดในการ์ดท่าสำเร็จรูป (หน้านางแบบ ขั้นท่าโพสต์) ให้เห็นท่าแต่ละแบบโดยไม่ต้องจินตนาการ
// หุ่นแบบมีข้อต่อ (แขน/ขางอได้) สไตล์เดียวกับ PersonView: ผมบ๊อบ เสื้อขาว กระโปรง เส้นเทา ฉากสตูดิโอสีอ่อน
// แต่ละท่าวาดจาก "จังหวะ" แรกใน moments ของท่านั้น (lib/catalog.ts POSE_PRESETS) — AI สุ่มจังหวะจริงทุกครั้ง รูปนี้แค่ตัวอย่าง
import type { ReactNode } from 'react';
import { Person } from './PersonView';

const INK = '#77776f', PAPER = '#fafaf8', CLOTH = '#e7e6df', HAIR = '#cfcdc4', LABEL = '#b8b8ae', WOOD = '#ddd0bc';
type P = [number, number];
type Limb = [P, P]; // [ข้อศอก/เข่า, มือ/เท้า]
type Body = {
  head: P; neck: P; hip: P; tilt?: number; laugh?: boolean; side?: boolean; // side = หันข้าง (ไหล่/สะโพกแคบ)
  arms: { l: Limb; r: Limb }; legs: { l: Limb; r: Limb };
  front?: ('l' | 'r')[]; // แขนที่อยู่หน้าตัว (ที่เหลือวาดหลังตัว)
};

// แขนขาเป็นแท่งมน มีเส้นขอบ: ลากเส้นเข้มกว้างกว่า แล้วทับด้วยสีอ่อน
const limb = (points: P[], w: number, key: string) => {
  const d = 'M' + points.map((p) => p.join(' ')).join(' L');
  return <g key={key}>
    <path d={d} stroke={INK} strokeWidth={w + 2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d={d} stroke={PAPER} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </g>;
};
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];

function Figure({ head, neck, hip, tilt = 0, laugh = false, side = false, arms, legs, front = [] }: Body) {
  // ทิศลำตัว (สะโพก -> คอ) ใช้วางไหล่/สะโพกให้เอียงตามตัว
  const dx = neck[0] - hip[0], dy = neck[1] - hip[1], len = Math.hypot(dx, dy) || 1;
  const across: P = [-dy / len, dx / len]; // ตั้งฉากกับลำตัว
  const half = (w: number): P => [across[0] * w, across[1] * w];
  const sw = side ? 4 : 9, hw = side ? 4 : 6;
  const sh = { l: add(neck, half(-sw)), r: add(neck, half(sw)) };
  const hp = { l: add(hip, half(-hw)), r: add(hip, half(hw)) };
  // กระโปรงชี้ไปทางเข่า (ยืน = ลงล่าง · นั่ง = ไปตามต้นขา) ยาวราวครึ่งต้นขา
  const knee: P = [(legs.l[0][0] + legs.r[0][0]) / 2, (legs.l[0][1] + legs.r[0][1]) / 2];
  const hem: P = [hip[0] + (knee[0] - hip[0]) * 0.6, hip[1] + (knee[1] - hip[1]) * 0.6];
  const kx = knee[0] - hip[0], ky = knee[1] - hip[1], kl = Math.hypot(kx, ky) || 1, flare = side ? 8 : 11;
  const hemSide: P = [-ky / kl * flare, kx / kl * flare];
  const arm = (s: 'l' | 'r') => limb([sh[s], ...arms[s]], 4.2, 'arm' + s);
  const leg = (s: 'l' | 'r') => limb([hp[s], ...legs[s]], 5, 'leg' + s);
  const hand = (s: 'l' | 'r') => <circle key={'hand' + s} cx={arms[s][1][0]} cy={arms[s][1][1]} r="2.6" fill={PAPER} stroke={INK} strokeWidth="1.1" />;
  const back = (['l', 'r'] as const).filter((s) => !front.includes(s));
  return <g strokeLinejoin="round">
    {back.map(arm)}{back.map(hand)}
    {leg('l')}{leg('r')}
    {(['l', 'r'] as const).map((s) => <ellipse key={'shoe' + s} cx={legs[s][1][0] + (side ? 2 : 0)} cy={legs[s][1][1] + 1} rx="4" ry="2" fill={INK} />)}
    <path d={`M${hp.l.join(' ')} L${hp.r.join(' ')} L${add(hem, [-hemSide[0], -hemSide[1]]).join(' ')} L${add(hem, hemSide).join(' ')}Z`} fill={CLOTH} stroke={INK} strokeWidth="1.2" />
    <path d={`M${sh.l.join(' ')} L${sh.r.join(' ')} L${hp.r.join(' ')} L${hp.l.join(' ')}Z`} fill={PAPER} stroke={INK} strokeWidth="1.2" />
    <path d={`M${neck[0]} ${neck[1] - 1} L${head[0]} ${head[1] + 6}`} stroke={INK} strokeWidth="5.6" strokeLinecap="round" />
    <path d={`M${neck[0]} ${neck[1] - 1} L${head[0]} ${head[1] + 6}`} stroke={PAPER} strokeWidth="3.4" strokeLinecap="round" />
    <g transform={`rotate(${tilt} ${head[0]} ${head[1]})`}>
      <path d={`M${head[0] - 8.6} ${head[1]} A8.6 8.6 0 0 1 ${head[0] + 8.6} ${head[1]} L${head[0] + 8.6} ${head[1] + 9} Q${head[0]} ${head[1] + 11} ${head[0] - 8.6} ${head[1] + 9}Z`} fill={HAIR} stroke={INK} strokeWidth="1.2" />
      <circle cx={head[0] + (side ? 1.5 : 0)} cy={head[1]} r="7" fill={PAPER} stroke={INK} strokeWidth="1.2" />
      {laugh && <g fill="none" stroke={INK} strokeWidth="1.1" strokeLinecap="round">
        <path d={`M${head[0] - 4} ${head[1] - 1} q1.5 -1.6 3 0 M${head[0] + 1} ${head[1] - 1} q1.5 -1.6 3 0`} />
        <path d={`M${head[0] - 3} ${head[1] + 2.4} q3 4 6 0Z`} fill={INK} />
      </g>}
    </g>
    {front.map(arm)}{front.map(hand)}
  </g>;
}

const Room = () => <>
  <rect width="240" height="150" fill="#f3f3f0" />
  <path d="M0 102 Q120 93 240 102 V150 H0Z" fill="#000" opacity=".04" />
</>;
const Shadow = ({ x, rx = 22 }: { x: number; rx?: number }) => <ellipse cx={x} cy="127" rx={rx} ry="4" fill="#000" opacity=".08" />;
const Sparkle = ({ x, y }: { x: number; y: number }) => <path d={`m${x} ${y} 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z`} fill={INK} />;

const POSES: Record<string, () => ReactNode> = {
  // ท่าเดิม: ลอกท่าจากรูปนางแบบ — รูปนางแบบเล็กๆ ทางซ้าย ลูกศรมาหาคนตรงกลาง (ท่าเดียวกัน)
  keep: () => <><Room />
    <rect x="30" y="36" width="36" height="54" rx="3" fill="#fbfbf9" stroke={INK} strokeWidth="1.2" />
    <Person x={48} top={42} h={44} />
    <path d="M76 63 H100 M94 57 L100 63 L94 69" stroke={LABEL} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <Shadow x={140} /><Person x={140} top={24} h={104} /></>,
  // สบายๆ ตามฉาก: ทิ้งน้ำหนักขาเดียว มือหนึ่งล้วงกระเป๋า อีกมือวางบนโต๊ะในฉาก
  relaxed: () => <><Room />
    <path d="M140 84 H190 M146 84 V127 M184 84 V127" stroke={INK} strokeWidth="1.2" /><rect x="138" y="80" width="54" height="5" rx="1.5" fill={WOOD} stroke={INK} strokeWidth="1.2" />
    <path d="M176 80 v-8 h8 v8" fill={PAPER} stroke={INK} strokeWidth="1.2" />
    <Shadow x={118} />
    <Figure head={[114, 30]} neck={[116, 41]} hip={[120, 75]} tilt={-6}
      arms={{ l: [[104, 58], [112, 73]], r: [[134, 62], [143, 80]] }}
      legs={{ l: [[118, 101], [120, 125]], r: [[131, 99], [128, 125]] }} /></>,
  // นั่งชิล: นั่งบนม้านั่ง หันข้างนิดๆ มือหนึ่งวางเข่า อีกมือยันม้านั่ง
  sit: () => <><Room />
    <rect x="84" y="94" width="84" height="6" rx="2" fill={WOOD} stroke={INK} strokeWidth="1.2" />
    <path d="M90 100 V126 M162 100 V126" stroke={INK} strokeWidth="2" />
    <Shadow x={124} rx={40} />
    <Figure side head={[112, 50]} neck={[112, 61]} hip={[114, 91]}
      arms={{ l: [[104, 78], [98, 94]], r: [[120, 78], [134, 88]] }} front={['r']}
      legs={{ l: [[138, 90], [140, 124]], r: [[136, 93], [132, 124]] }} /></>,
  // พิงผนัง / เสา: ไหล่พิงเสา กอดอก ไขว้ขา
  lean: () => <><Room />
    <rect x="70" y="0" width="24" height="128" fill="#ecebe6" stroke={INK} strokeWidth="1.2" />
    <Shadow x={116} />
    <Figure head={[101, 32]} neck={[104, 43]} hip={[112, 76]} tilt={-10}
      arms={{ l: [[98, 60], [116, 57]], r: [[116, 62], [102, 55]] }} front={['l', 'r']}
      legs={{ l: [[112, 101], [124, 125]], r: [[118, 101], [112, 125]] }} /></>,
  // โชว์สินค้า: ยกกระเป๋าขึ้นหน้าตัวด้วยสองมือ กระเป๋าเป็นพระเอก
  product: () => <><Room /><Shadow x={120} />
    <Figure head={[120, 28]} neck={[120, 39]} hip={[120, 74]}
      arms={{ l: [[106, 60], [114, 66]], r: [[134, 60], [126, 66]] }}
      legs={{ l: [[116, 100], [115, 125]], r: [[124, 100], [125, 125]] }} />
    <path d="M113 66 Q120 54 127 66" stroke={INK} strokeWidth="2" fill="none" />
    <path d="M106 68 H134 L131 90 H109Z" fill="#dcb894" stroke={INK} strokeWidth="1.2" />
    <path d="M114 74 H126" stroke="#b8936e" strokeWidth="1.5" />
    <Sparkle x={150} y={56} /><Sparkle x={94} y={84} /></>,
  // ยืนแฟชั่นมั่นใจ: มือเท้าเอว ทิ้งน้ำหนักขาเดียว อีกขางอเข่าเข้า
  fashion: () => <><Room /><Shadow x={120} />
    <Figure head={[119, 27]} neck={[118, 38]} hip={[121, 73]}
      arms={{ l: [[101, 56], [112, 70]], r: [[133, 56], [136, 76]] }}
      legs={{ l: [[118, 99], [116, 125]], r: [[129, 98], [123, 125]] }} /></>,
  // ถ่ายเผลอ หัวเราะ: เงยหน้าหัวเราะ มือปิดปาก ตัวเอียง มีเส้นเสียงหัวเราะ
  laugh: () => <><Room /><Shadow x={122} />
    <Figure laugh head={[124, 30]} neck={[122, 41]} hip={[120, 75]} tilt={14}
      arms={{ l: [[106, 54], [119, 38]], r: [[136, 58], [140, 74]] }} front={['l']}
      legs={{ l: [[116, 100], [114, 125]], r: [[125, 100], [128, 125]] }} />
    <path d="M140 20 q4 -4 8 0 M144 30 q5 -3 9 1 M138 12 q3 -3 6 -1" stroke={INK} strokeWidth="1.3" fill="none" strokeLinecap="round" /></>,
};

export function PoseView({ id }: { id: string }) {
  return <svg className="scene-preview" viewBox="0 0 240 150" aria-hidden="true" focusable="false">{(POSES[id] ?? POSES.keep)()}</svg>;
}
