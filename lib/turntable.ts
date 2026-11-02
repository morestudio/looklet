// turntable.ts — "ตั้งมุมเอง" ของหน้าสินค้า (ขั้นมุมกล้อง Clean / Custom): ผู้ใช้หมุนตัวแทนสามมิติสีเทาเอง
// ใช้ทั้งหน้าเว็บ (ภาพตัวอย่างที่ลาก/เลื่อนได้) และ server (แปลงเป็น JPEG ส่งให้ AI เป็น "ไกด์มุม") -> สิ่งที่ผู้ใช้เห็น = สิ่งที่ AI เห็น
// ทดสอบก่อนใส่ 2 พ.ย. (กระเป๋าเบจของลูกค้า 3 มุม): ข้อความอย่างเดียวหมุนถูกทาง แต่ความสูงกล้อง/ขนาดในภาพเพี้ยน · มีภาพไกด์แล้วตรงกว่ามาก
// ยังไม่ได้พิสูจน์: มุมหลังของสินค้าที่หน้า-หลังต่างกัน และรูปทรงกล่องอาจดึงสินค้าให้เหลี่ยมขึ้นเล็กน้อย
// แกนของสินค้า: x = ขวาของคนดู (ตอนหมุน 0°) · y = ขึ้น · z = เข้าหากล้อง · ด้านหน้าสินค้าหันเข้ากล้อง (+z) ตอน yaw = 0

export type Turn = { yaw: number; elev: number }; // yaw = หมุนสินค้า -180..180 (ลบ = หน้าหันไปทางซ้ายของคนดู) · elev = กล้องสูงกว่าพื้นกี่องศา 0..60
export const TURN_YAW = [-180, 180] as const;
export const TURN_ELEV = [0, 60] as const;
type Shape = { kind: 'box' | 'shoes' | 'bottle'; w: number; h: number; d: number; strap?: boolean };

// ตัวแทนตามประเภทสินค้า (PRODUCT_TYPES id) — สัดส่วนคร่าวๆ ของสินค้าทั่วไป AI ถูกสั่งให้ไม่สนรูปทรงของตัวแทน ใช้แค่มุม
const SHAPES: Record<string, Shape> = {
  bag: { kind: 'box', w: 1.9, h: 1.2, d: 0.55, strap: true },
  'soft-bag': { kind: 'box', w: 1.7, h: 1.2, d: 0.6, strap: true },
  tote: { kind: 'box', w: 1.5, h: 1.4, d: 0.55, strap: true },
  small: { kind: 'box', w: 1.6, h: 1, d: 0.25 },
  jewelry: { kind: 'box', w: 1.2, h: 1, d: 0.6 },
  beauty: { kind: 'bottle', w: 0.9, h: 1.8, d: 0.9 },
  shoes: { kind: 'shoes', w: 1.9, h: 0.8, d: 2.5 },
  other: { kind: 'box', w: 1.3, h: 1, d: 0.8 },
};
export const turnShape = (type: unknown) => SHAPES[String(type)] ?? SHAPES.other;
// มุมเริ่มต้นตอนเปิดตั้งมุมเอง: เฉียงสามส่วนสี่ที่ใช้บ่อย (รองเท้าเห็นข้างมากกว่า)
export const defaultTurn = (type: unknown): Turn => (turnShape(type).kind === 'shoes' ? { yaw: -60, elev: 15 } : { yaw: -30, elev: 15 });

// ค่าที่ส่งมา -> มุมที่ใช้ได้ (ปัดเป็นองศาเต็ม จำกัดช่วง) · ไม่ใช่ตัวเลข = null
export function readTurn(v: unknown): Turn | null {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const yaw = Number(o.yaw), elev = Number(o.elev);
  if (!Number.isFinite(yaw) || !Number.isFinite(elev)) return null;
  const clamp = (n: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, Math.round(n)));
  return { yaw: clamp(yaw, TURN_YAW), elev: clamp(elev, TURN_ELEV) };
}

// สินค้ากินความกว้างภาพกี่ส่วนตามระยะ (PRODUCT_FRAMINGS) — ไกด์ต้องตรงกับระยะ เพราะ AI ทำขนาดตามไกด์ด้วย
export function turnFill(framing: string, withProps = false) {
  if (framing === 'wide') return 0.4;
  if (framing === 'close') return withProps ? 0.72 : 0.82;
  if (framing === 'detail') return 0.9;
  return withProps ? 0.5 : 0.6;
}

// ---------- ข้อความที่ส่งให้ AI (ภาษาอังกฤษ) + คำอธิบายภาษาไทยในหน้าเว็บ ----------
function view({ yaw }: Turn) {
  const r = (yaw * Math.PI) / 180;
  const off = Math.round((Math.acos(Math.max(-1, Math.min(1, Math.cos(r)))) * 180) / Math.PI); // 0 = หน้าเข้ากล้อง 180 = หลังเข้ากล้อง
  const side = Math.sin(r) > 0 ? 'right' : 'left'; // ด้านหน้าหันไปทางไหนของคนดู
  return { off, side, other: side === 'right' ? 'left' : 'right' };
}
function elevText(elev: number) {
  if (elev <= 4) return 'with the camera low, almost at the height of the surface, looking straight at the product so its top is not visible';
  if (elev < 45) return `with the camera about ${elev} degrees above the product looking down at it so its top edge is visible`;
  return `with the camera high, about ${elev} degrees above the surface, looking steeply down so the top of the product is clearly visible`;
}

// มุมที่ผู้ใช้ตั้ง -> คำบรรยายมุมกล้อง (ใส่แทน PRODUCT_ANGLES prompt) · ถ้อยคำมุม A/B/C ตรงกับที่ทดสอบ
export function describeTurn(type: unknown, turn: Turn) {
  const { off, side, other } = view(turn);
  const kind = turnShape(type).kind;
  let t: string;
  if (kind === 'shoes') {
    t = off <= 8 ? 'the toes point straight at the camera'
      : off >= 172 ? 'the heels face the camera squarely, the toes pointing straight away'
      : off >= 80 && off <= 100 ? `a side profile: the toes point to the viewer's ${side}`
      : off < 80 ? `the shoes turned so the toes point toward the camera and to the viewer's ${side}, about ${off} degrees off the camera axis, showing the toes and one side`
      : `the shoes turned so the heels are toward the camera and the toes point away to the viewer's ${side}, about ${180 - off} degrees off straight back, showing the heels and one side`;
  } else if (kind === 'bottle') {
    t = off <= 8 ? 'the label faces the camera squarely'
      : off >= 172 ? 'the back of the product faces the camera; the label is on the far side and not visible'
      : off < 80 ? `the product turned about ${off} degrees so its label faces ${off < 45 ? 'a little' : 'mostly'} to the viewer's ${side} and wraps out of view on that side`
      : off <= 100 ? `a side view: the label is at the viewer's ${side} edge of the product, seen almost edge-on`
      : `the product turned about ${off} degrees so its back faces the camera and only the edge of the label shows on the viewer's ${side}`;
  } else {
    t = off <= 8 ? "the product's front faces the camera squarely"
      : off >= 172 ? "the product's back faces the camera squarely; the front is not visible"
      : off < 80 ? `the product turned about ${off} degrees so its front faces ${off < 45 ? 'a little' : 'mostly'} to the viewer's ${side} and one end panel is visible on the viewer's ${other}`
      : off <= 100 ? `a side view: the product turned about ${off} degrees so the camera looks straight at one end panel and the front is seen edge-on on the viewer's ${side}`
      : `a three-quarter back view: the product turned about ${off} degrees so its back faces the camera and one end panel is visible on the viewer's ${side}; the front is not visible`;
  }
  return `${t}, ${elevText(turn.elev)}`;
}

// คำอธิบายสั้นๆ ภาษาไทย (ใต้ภาพตั้งมุม + ชื่อมุมในคำบรรยายรูป/log)
export function turnSummary(type: unknown, turn: Turn) {
  const { off, side } = view(turn);
  const s = side === 'right' ? 'ขวา' : 'ซ้าย';
  const kind = turnShape(type).kind;
  const face = kind === 'shoes'
    ? (off <= 8 ? 'ปลายเท้าหันเข้ากล้อง' : off >= 172 ? 'ส้นหันเข้ากล้อง' : off >= 80 && off <= 100 ? `ด้านข้าง ปลายเท้าชี้${s}` : off < 80 ? `เฉียง เห็นปลายเท้า (ชี้${s})` : `เฉียง เห็นส้น (ปลายเท้าชี้${s})`)
    : kind === 'bottle'
      ? (off <= 8 ? 'ฉลากหันเข้ากล้อง' : off >= 172 ? 'ด้านหลัง' : off <= 100 ? `ฉลากเฉียงไปทาง${s}` : 'ด้านหลังเฉียง')
      : (off <= 8 ? 'หน้าตรง' : off >= 172 ? 'ด้านหลังตรง' : off >= 80 && off <= 100 ? 'ด้านข้าง' : off < 80 ? `ด้านหน้า + ด้านข้าง (หน้าหันไป${s})` : 'ด้านหลัง + ด้านข้าง');
  const cam = turn.elev <= 4 ? 'กล้องระดับพื้น' : turn.elev >= 45 ? `กล้องสูง ${turn.elev}° มองลง` : `กล้องสูง ${turn.elev}°`;
  return `${face} · ${cam}`;
}

// ประโยคอธิบายภาพไกด์ (n = ลำดับรูปในคำสั่ง) — ถ้อยคำของกล่องตรงกับที่ทดสอบ
export function guideSentence(type: unknown, n: number) {
  const shape = turnShape(type);
  const what = shape.kind === 'shoes'
    ? 'a plain grey stand-in for the pair of shoes, placed exactly as the shoes must be placed, on a grid floor that shows the camera height. The darkest end of each block is the toe and the lightest end is the heel.'
    : shape.kind === 'bottle'
      ? 'a plain grey stand-in cylinder, placed exactly as the product must be placed, on a grid floor that shows the camera height. The darkest band on it is the side with the product\'s front label.'
      : `a plain grey stand-in block${shape.strap ? ' with a thin arc for the strap' : ''}, placed exactly as the product must be placed, on a grid floor that shows the camera height. `
        + 'The darkest face of the block is the product\'s front, the lightest vertical face is its back, the mid-grey faces are its end panels.';
  return `Image ${n} is an angle guide, not a product photo: ${what} `
    + `Turn the product and place the camera so the visible sides, the amount of turn and the camera height and tilt match Image ${n} exactly. `
    + `Use Image ${n} only for orientation and viewpoint: ignore its shape, proportions, color, grid and background.`;
}

// วางสินค้ายังไงตอนตั้งมุมเอง: ตัดคำว่า "หันหน้าเข้ากล้อง" ของ PRODUCT_TYPES stand ออก (ขัดกับมุมที่ตั้ง)
export function turnPlace(type: unknown, stand: string) {
  if (turnShape(type).kind === 'shoes') return 'The pair stands side by side on the surface, parallel to each other, both pointing the same way.';
  return stand.replace(/,? (its|their) (front|label) facing the camera/, '').replace('propped upright at a slight angle', 'propped upright');
}

// ---------- ภาพไกด์ (SVG) ----------
type V3 = [number, number, number];
type Face = { pts: V3[]; n: V3; color: string };
const C = { front: '#7d7d7d', back: '#c4c4c4', side: '#a6a6a6', top: '#e6e6e6', edge: '#555', floor: '#f3f3f3', grid: '#d2d2d2', strap: '#666' };

function box(w: number, h: number, d: number, x0 = 0): Face[] {
  const [a, b, c] = [w / 2, h, d / 2];
  const P = (x: number, y: number, z: number): V3 => [x + x0, y, z];
  return [
    { n: [0, 0, 1], color: C.front, pts: [P(-a, 0, c), P(a, 0, c), P(a, b, c), P(-a, b, c)] },
    { n: [0, 0, -1], color: C.back, pts: [P(a, 0, -c), P(-a, 0, -c), P(-a, b, -c), P(a, b, -c)] },
    { n: [1, 0, 0], color: C.side, pts: [P(a, 0, c), P(a, 0, -c), P(a, b, -c), P(a, b, c)] },
    { n: [-1, 0, 0], color: C.side, pts: [P(-a, 0, -c), P(-a, 0, c), P(-a, b, c), P(-a, b, -c)] },
    { n: [0, 1, 0], color: C.top, pts: [P(-a, b, c), P(a, b, c), P(a, b, -c), P(-a, b, -c)] },
  ];
}
// รองเท้าหนึ่งข้าง: รูปด้านข้าง (z = หัว-ท้าย, y = สูง) ดันออกไปตามแกน x · ปลายเท้า (+z) สีเข้ม ส้น (-z) สีอ่อน
function shoe(x0: number, width: number, len: number, h: number): Face[] {
  const L = len / 2;
  const prof: [number, number][] = [[-L, 0], [L, 0], [L, h * 0.22], [L * 0.8, h * 0.48], [L * 0.15, h * 0.7], [-L * 0.72, h], [-L, h * 0.95]];
  const [xa, xb] = [x0 - width / 2, x0 + width / 2];
  const faces: Face[] = [
    { n: [1, 0, 0], color: C.side, pts: prof.map(([z, y]) => [xb, y, z] as V3) },
    { n: [-1, 0, 0], color: C.side, pts: [...prof].reverse().map(([z, y]) => [xa, y, z] as V3) },
  ];
  prof.forEach(([z1, y1], i) => {
    const [z2, y2] = prof[(i + 1) % prof.length];
    if (y1 === 0 && y2 === 0) return; // พื้นรองเท้า
    const nz = y2 - y1, ny = -(z2 - z1), len2 = Math.hypot(nz, ny) || 1; // ขอบโปรไฟล์ทวนเข็ม -> normal ชี้ออก
    const mid = (z1 + z2) / 2;
    faces.push({ n: [0, ny / len2, nz / len2], color: mid > L * 0.55 ? C.front : mid < -L * 0.8 ? C.back : ny / len2 > 0.7 ? C.top : C.side,
      pts: [[xa, y1, z1], [xb, y1, z1], [xb, y2, z2], [xa, y2, z2]] });
  });
  return faces;
}
// ขวด: ทรงกระบอก 20 เหลี่ยม แถบฉลากด้านหน้าสีเข้ม + ฝาเล็กด้านบน
function bottle(r: number, h: number): Face[][] {
  const cyl = (rad: number, y0: number, y1: number, label: boolean): Face[] => {
    const N = 20, ring = (y: number) => Array.from({ length: N }, (_, i) => { const t = (i / N) * Math.PI * 2; return [rad * Math.sin(t), y, rad * Math.cos(t)] as V3; });
    const lo = ring(y0), hi = ring(y1);
    const faces: Face[] = lo.map((p, i) => {
      const j = (i + 1) % N, t = ((i + 0.5) / N) * Math.PI * 2;
      const front = label && Math.cos(t) > Math.cos(Math.PI / 4);
      return { n: [Math.sin(t), 0, Math.cos(t)], color: front ? C.front : C.side, pts: [p, lo[j], hi[j], hi[i]] };
    });
    faces.push({ n: [0, 1, 0], color: C.top, pts: [...hi].reverse() });
    return faces;
  };
  return [cyl(r, 0, h * 0.78, true), cyl(r * 0.45, h * 0.78, h, false)];
}

// วาดไกด์: ฉากเทา + พื้นตาราง + เงา + ตัวแทน (+ สายกระเป๋า) ขนาดภาพตามสัดส่วนที่จะสร้าง · fill = กว้างกี่ส่วนของภาพ (turnFill)
export function turntableSvg(type: unknown, turn: Turn, { orient = 'portrait', fill = 0.6 }: { orient?: 'portrait' | 'square' | 'landscape'; fill?: number } = {}) {
  const shape = turnShape(type);
  const W = orient === 'landscape' ? 1536 : 1024, H = orient === 'portrait' ? 1536 : 1024;
  const ry = (turn.yaw * Math.PI) / 180, ph = (turn.elev * Math.PI) / 180;
  const size = Math.max(shape.w, shape.h, shape.d), D = size * 3.2;
  const f = (fill * W * D) / Math.max(shape.w, shape.d);
  const fit = Math.min(f, (0.62 * H * D) / shape.h); // สินค้าสูง (ขวด) ไม่ให้ล้นภาพ
  const target: V3 = [0, shape.h / 2, 0];
  const rot = ([x, y, z]: V3): V3 => [x * Math.cos(ry) + z * Math.sin(ry), y, -x * Math.sin(ry) + z * Math.cos(ry)];
  const cam: V3 = [0, target[1] + D * Math.sin(ph), D * Math.cos(ph)];
  const proj = (p: V3) => {
    const v = [p[0] - target[0], p[1] - target[1], p[2] - target[2]];
    const yc = v[1] * Math.cos(ph) - v[2] * Math.sin(ph), zc = v[1] * Math.sin(ph) + v[2] * Math.cos(ph);
    const depth = D - zc;
    return { x: W / 2 + (fit * v[0]) / depth, y: H * 0.54 - (fit * yc) / depth, depth };
  };
  const pts = (arr: V3[]) => arr.map((p) => proj(rot(p))).map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${C.floor}"/>`];
  // พื้นตาราง (ช่องละ ~1/4 ของสินค้า) แบ่งเส้นเป็นท่อนสั้นๆ ตัดท่อนที่อยู่หลังกล้อง
  const step = size / 4.4, R = step * 12;
  for (let i = -R; i <= R + 1e-9; i += step) {
    for (const [a, b] of [[[i, 0, -R], [i, 0, R * 0.55]], [[-R, 0, i], [R, 0, i]]] as [V3, V3][]) {
      for (let k = 0; k < 24; k++) {
        const p = proj(rot(a.map((v, j) => v + ((b[j] - v) * k) / 24) as V3)), q = proj(rot(a.map((v, j) => v + ((b[j] - v) * (k + 1)) / 24) as V3));
        if (p.depth > step && q.depth > step) out.push(`<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}" stroke="${C.grid}" stroke-width="2"/>`);
      }
    }
  }
  // วัตถุ (ทรงนูน) วาดอันไกลก่อน · เงาสัมผัสพื้นใต้แต่ละชิ้น
  const objects: Face[][] = shape.kind === 'shoes'
    ? [shoe(-shape.w * 0.27, shape.w * 0.42, shape.d, shape.h), shoe(shape.w * 0.27, shape.w * 0.42, shape.d, shape.h)]
    : shape.kind === 'bottle' ? bottle(shape.w / 2, shape.h) : [box(shape.w, shape.h, shape.d)];
  if (shape.kind === 'bottle') { // เงากลมใต้ขวด
    const r = shape.w / 2 + 0.08;
    out.push(`<polygon points="${pts(Array.from({ length: 24 }, (_, i) => [r * Math.sin((i / 24) * Math.PI * 2), 0, r * Math.cos((i / 24) * Math.PI * 2)] as V3))}" fill="#000" opacity=".16"/>`);
  }
  for (const o of shape.kind === 'bottle' ? [] : objects) {
    const xs = o.flatMap((fc) => fc.pts.map((p) => p[0])), zs = o.flatMap((fc) => fc.pts.map((p) => p[2]));
    const [x1, x2, z1, z2] = [Math.min(...xs) - 0.08, Math.max(...xs) + 0.08, Math.min(...zs) - 0.08, Math.max(...zs) + 0.08];
    out.push(`<polygon points="${pts([[x1, 0, z1], [x2, 0, z1], [x2, 0, z2], [x1, 0, z2]])}" fill="#000" opacity=".16"/>`);
  }
  const center = (o: Face[]) => { const all = o.flatMap((fc) => fc.pts); return all.reduce((s, p) => [s[0] + p[0] / all.length, s[1] + p[1] / all.length, s[2] + p[2] / all.length] as V3, [0, 0, 0] as V3); };
  const dist = (p: V3) => { const q = rot(p); return Math.hypot(q[0] - cam[0], q[1] - cam[1], q[2] - cam[2]); };
  const order = shape.kind === 'bottle' ? objects : [...objects].sort((a, b) => dist(center(b)) - dist(center(a)));
  for (const o of order) {
    for (const fc of o) {
      const n = rot(fc.n), c = rot(fc.pts.reduce((s, p) => [s[0] + p[0] / fc.pts.length, s[1] + p[1] / fc.pts.length, s[2] + p[2] / fc.pts.length] as V3, [0, 0, 0] as V3));
      if (n[0] * (cam[0] - c[0]) + n[1] * (cam[1] - c[1]) + n[2] * (cam[2] - c[2]) > 0) {
        out.push(`<polygon points="${pts(fc.pts)}" fill="${fc.color}" stroke="${C.edge}" stroke-width="3" stroke-linejoin="round"/>`);
      }
    }
  }
  if (shape.strap) { // สายกระเป๋า: โค้งเหนือด้านบน กลางความหนา
    const a = shape.w * 0.4;
    out.push(`<polyline points="${pts(Array.from({ length: 25 }, (_, i) => { const x = -a + (i / 24) * 2 * a; return [x, shape.h + shape.h * 0.62 * (1 - (x / a) ** 2), 0] as V3; }))}" fill="none" stroke="${C.strap}" stroke-width="12" stroke-linecap="round"/>`);
  }
  out.push('</svg>');
  return out.join('');
}
