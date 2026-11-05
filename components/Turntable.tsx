// Turntable.tsx — "ตั้งมุมเอง" ในขั้นมุมกล้องของหน้าสินค้า: ลากตัวแทนสามมิติสีเทา (ซ้าย-ขวา = หมุนสินค้า, ขึ้น-ลง = ความสูงกล้อง)
// หรือใช้แถบเลื่อน · ภาพที่เห็นวาดด้วย turntableSvg ตัวเดียวกับที่ server ส่งให้ AI เป็นไกด์มุม (lib/turntable.ts)
import { useMemo, useRef } from 'react';
import { TURN_ELEV, TURN_YAW, turnShape, turnSummary, turntableSvg, type Turn } from '@/lib/turntable';
import { rangeFill } from './ui';

type Orient = 'portrait' | 'square' | 'landscape';
const wrap = (yaw: number) => Math.round(((((yaw + 180) % 360) + 360) % 360) - 180); // -180..180
const clampElev = (e: number) => Math.round(Math.min(TURN_ELEV[1], Math.max(TURN_ELEV[0], e)));
export const turnSrc = (type: unknown, turn: Turn, orient: Orient, fill: number) =>
  'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(turntableSvg(type, turn, { orient, fill }));

const DARK = { box: 'สีเข้มสุด = ด้านหน้า', shoes: 'สีเข้ม = ปลายเท้า', bottle: 'แถบสีเข้ม = ฉลาก' };
// มุมด่วน: คงความสูงกล้องที่ตั้งไว้ เปลี่ยนแค่การหมุน
const QUICK = [{ name: 'หน้าตรง', yaw: 0 }, { name: 'เฉียง', yaw: -35 }, { name: 'ด้านข้าง', yaw: -90 }, { name: 'ด้านหลัง', yaw: 180 }];

export default function Turntable({ type, turn, onChange, orient, fill }: {
  type: unknown; turn: Turn; onChange: (t: Turn) => void; orient: Orient; fill: number;
}) {
  const drag = useRef<{ x: number; y: number; start: Turn } | null>(null);
  const src = useMemo(() => turnSrc(type, turn, orient, fill), [type, turn, orient, fill]);
  const summary = turnSummary(type, turn);
  return <div className="turntable">
    <div className={'turntable-stage ' + orient} role="img" aria-label={`ภาพตั้งมุม: ${summary}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, start: turn };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        // ลากขวา = หน้าสินค้าหันไปทางขวา · ลากลง = กล้องสูงขึ้น (มองลงมากขึ้น) แบบหมุนดูโมเดลสามมิติทั่วไป
        onChange({ yaw: wrap(d.start.yaw + (e.clientX - d.x) * 0.6), elev: clampElev(d.start.elev + (e.clientY - d.y) * 0.25) });
      }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <img src={src} alt="" draggable={false} />
      <span className="turntable-hint">ลากเพื่อหมุน</span>
    </div>
    <p className="turntable-summary">{summary}</p>
    <div className="chips">{QUICK.map((q) => <button key={q.name} type="button" aria-pressed={turn.yaw === q.yaw}
      className={'chip' + (turn.yaw === q.yaw ? ' active' : '')} onClick={() => onChange({ ...turn, yaw: q.yaw })}>{q.name}</button>)}</div>
    <div className="sliders">
      <div className="slider">
        <label htmlFor="turn-yaw">หมุนสินค้า <output>{turn.yaw > 0 ? '+' : ''}{turn.yaw}°</output></label>
        <input type="range" id="turn-yaw" min={TURN_YAW[0]} max={TURN_YAW[1]} value={turn.yaw} style={rangeFill(turn.yaw, TURN_YAW[0], TURN_YAW[1])}
          onChange={(e) => onChange({ ...turn, yaw: +e.target.value })} />
      </div>
      <div className="slider">
        <label htmlFor="turn-elev">ความสูงกล้อง <output>{turn.elev}°</output></label>
        <input type="range" id="turn-elev" min={TURN_ELEV[0]} max={TURN_ELEV[1]} value={turn.elev} style={rangeFill(turn.elev, TURN_ELEV[0], TURN_ELEV[1])}
          onChange={(e) => onChange({ ...turn, elev: +e.target.value })} />
      </div>
    </div>
    <p className="muted-text">AI ใช้ภาพนี้บอกแค่มุมและความสูงกล้อง รูปทรงจริงมาจากรูปสินค้า · {DARK[turnShape(type).kind]}</p>
  </div>;
}
