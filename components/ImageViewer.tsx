'use client';
// ดูรูปเต็มจอ + ซูม (กดรูปบนเวที): เปิดมาพอดีจอเสมอ · กดที่รูปครั้งแรก = ซูม 2 เท่าของตอนพอดีจอตรงจุดนั้น
// หลังซูมแล้ว คลิก/กดลาก = จับรูปเลื่อนอย่างเดียว ไม่ซูมออก (29 ต.ค. ผู้ใช้ขอ) — ซูมออกด้วยปุ่ม − / ทั้งรูป ล้อเมาส์ หรือคลิกขวา
// ซูมเข้า/ออกทีละขั้น: ปุ่ม − / + / ทั้งรูป ด้านล่าง · ล้อเมาส์หรือหนีบนิ้วบนแทร็กแพด (ซูมรอบจุดที่ชี้) · ปุ่มคีย์บอร์ด + − 0
// (29 ต.ค. ผู้ใช้บอกซูมแรงเกินและซูมออกไม่ได้: เดิมซูมไปขนาดจริงของรูปทันที ~3 เท่า ออกได้แค่คลิกนิ่งๆ หรือคลิกขวา)
// เมาส์: ซูมตั้งแต่ตอนกดลง กดค้างแล้วลากต่อได้เลย (เดิมซูมตอนปล่อยเมาส์ ต้องกดอีกรอบถึงจะลากได้ — ผู้ใช้บอก 22 ต.ค.)
// คลิกขวาตอนซูม = กลับมาดูทั้งรูป (ไม่ขึ้นเมนูของ browser) · ตอนพอดีจอคลิกขวาได้เมนูปกติ (คัดลอก/บันทึกรูป)
// มือถือ: แตะครั้งแรกเพื่อซูม ปัดนิ้วเลื่อนแบบปกติของ browser · Esc หรือ ✕ = ปิด
// เดิมเปิดมาซูมตรงจุดที่กดบนเวทีเลย (22 ต.ค.) — 29 ต.ค. ผู้ใช้ขอให้เปิดมาพอดีจอก่อน
// รูป 1664×2496 ละเอียดกว่าจอ ต้องซูมถึงจะเห็นผิว/เนื้อผ้า
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { IconHand } from './icons';

// scale = กี่เท่าของตอนพอดีจอ · (fx, fy) = จุดบนรูป (สัดส่วน 0..1) ที่ต้องอยู่ตรงตำแหน่ง (ax, ay) ในกรอบ (px)
type Zoom = { scale: number; fx: number; fy: number; ax: number; ay: number };
type Anchor = Omit<Zoom, 'scale'>;
// การกดครั้งนี้: จุดเริ่ม, ตำแหน่งเลื่อนตอนเริ่ม, ลากไปแล้วหรือยัง, ซูมเข้าตอนกดครั้งนี้ (คลิกที่ตามมาไม่ต้องซูมออก)
type Drag = { x: number; y: number; left: number; top: number; moved: boolean; zoomedIn: boolean };

const CLICK_ZOOM = 2; // กด/เปิดจากเวที = 2 เท่าของพอดีจอ
const STEP = 1.5; // ปุ่ม + / − ทีละ 1.5 เท่า
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export default function ImageViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState<Zoom | null>(null); // null = พอดีจอ
  const [fit, setFit] = useState<{ width: number; natural: number } | null>(null); // รูปตอนพอดีจอ: กว้างบนจอ (px) + กว้างจริงของรูป
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false); // ตอนซูม: เคอร์เซอร์มือแบมือ (ลากได้) -> กำมือ (กำลังกด/ลาก)
  // ซูมได้มากสุด 1.5 เท่าของขนาดจริงของรูป (อย่างน้อยเท่ากับตอนกดซูม)
  const maxScale = fit ? Math.max(CLICK_ZOOM, (fit.natural / fit.width) * 1.5) : CLICK_ZOOM;

  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
    // จอเปลี่ยนขนาด: กลับมาพอดีจอแล้ววัดใหม่
    const onResize = () => {
      setZoom(null);
      requestAnimationFrame(() => {
        const img = imgRef.current;
        if (img?.naturalWidth) setFit({ width: img.getBoundingClientRect().width, natural: img.naturalWidth });
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ซูมแล้ว: เลื่อนให้จุด (fx, fy) บนรูปอยู่ตรง (ax, ay) ในกรอบ — ถ้ายังกดค้างอยู่ ให้การลากเริ่มนับจากตำแหน่งใหม่นี้
  useLayoutEffect(() => {
    const box = boxRef.current;
    const img = imgRef.current;
    if (!zoom || !box || !img) return;
    box.scrollLeft = img.offsetLeft + zoom.fx * img.clientWidth - zoom.ax;
    box.scrollTop = img.offsetTop + zoom.fy * img.clientHeight - zoom.ay;
    if (drag.current?.zoomedIn) {
      drag.current.left = box.scrollLeft;
      drag.current.top = box.scrollTop;
    }
  }, [zoom]);

  // จุดบนรูปใต้ตำแหน่งนี้บนจอ (ซูมรอบจุดที่ชี้/กด จุดนั้นอยู่ใต้เมาส์ต่อ)
  const anchorAt = (clientX: number, clientY: number): Anchor => {
    const r = imgRef.current!.getBoundingClientRect();
    const b = boxRef.current!.getBoundingClientRect();
    return { fx: clamp01((clientX - r.left) / r.width), fy: clamp01((clientY - r.top) / r.height), ax: clientX - b.left, ay: clientY - b.top };
  };
  const middle = () => {
    const b = boxRef.current!.getBoundingClientRect();
    return anchorAt(b.left + b.width / 2, b.top + b.height / 2);
  };
  const scaleTo = (scale: number, at: Anchor) => {
    if (!fit) return; // รูปยังไม่โหลด
    const s = Math.min(maxScale, scale);
    setZoom(s <= 1.02 ? null : { scale: s, ...at });
  };
  const zoomBy = (factor: number, at?: Anchor) => scaleTo((zoom?.scale ?? 1) * factor, at ?? middle());

  // ล้อเมาส์ / หนีบนิ้วบนแทร็กแพด (ctrlKey) = ซูมรอบจุดที่ชี้ · ใส่ listener เอง เพราะ React ใส่ wheel แบบ passive (preventDefault ไม่ได้)
  // ไม่ใส่ deps: ผูกใหม่ทุกรอบ ตัวจัดการจะเห็นระดับซูมล่าสุดเสมอ
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const speed = e.ctrlKey ? 0.01 : e.deltaMode === 1 ? 0.05 : 0.002; // หนีบนิ้ว / ล้อแบบบรรทัด / ล้อแบบพิกเซล
      zoomBy(Math.exp(-e.deltaY * speed), anchorAt(e.clientX, e.clientY));
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  });

  // รูปโหลดเสร็จ -> จำขนาดตอนพอดีจอ (ใช้คำนวณการซูม)
  const onLoad = () => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal(); // รูปโหลดเสร็จก่อนหน้าต่างเปิด (รูปจาก cache) -> เปิดก่อน ไม่งั้นวัดขนาดได้ 0
    if (zoom) return;
    const img = imgRef.current!;
    setFit({ width: img.getBoundingClientRect().width, natural: img.naturalWidth });
  };

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const box = boxRef.current!;
    const onImage = e.target === imgRef.current;
    const mouse = e.pointerType === 'mouse';
    if (mouse && e.button !== 0) return; // ซูม/ลากด้วยปุ่มซ้ายเท่านั้น (ปุ่มขวา = ดูทั้งรูป ใน onContextMenu)
    drag.current = { x: e.clientX, y: e.clientY, left: box.scrollLeft, top: box.scrollTop, moved: false, zoomedIn: false };
    if (!mouse || (!zoom && !onImage)) return;
    if (!zoom) {
      drag.current.zoomedIn = true;
      scaleTo(CLICK_ZOOM, anchorAt(e.clientX, e.clientY)); // จุดที่กดอยู่ใต้เมาส์ต่อ ลากต่อได้เลย
    }
    setDragging(true);
    box.setPointerCapture(e.pointerId); // ลากออกนอกรูป/นอกกรอบก็ยังเลื่อนต่อได้
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || e.pointerType !== 'mouse' || !(e.buttons & 1) || !boxRef.current!.classList.contains('zoomed')) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 8) d.moved = true; // ขยับนิดหน่อยตอนคลิก (แทร็กแพด) ยังนับเป็นคลิก
    boxRef.current!.scrollLeft = d.left - dx;
    boxRef.current!.scrollTop = d.top - dy;
  }
  // คลิก/แตะ: ซูมเฉพาะตอนพอดีจอ (มือถือแตะที่รูป) · ซูมอยู่แล้ว = ไม่ทำอะไร (มือไว้จับเลื่อน)
  function onClick(e: MouseEvent<HTMLDivElement>) {
    const d = drag.current;
    if (zoom || d?.moved || d?.zoomedIn) return;
    if (e.target === imgRef.current) scaleTo(CLICK_ZOOM, anchorAt(e.clientX, e.clientY));
  }
  function onKeyDown(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key === '+' || e.key === '=') zoomBy(STEP);
    else if (e.key === '-' || e.key === '_') zoomBy(1 / STEP);
    else if (e.key === '0') setZoom(null);
    else return;
    e.preventDefault();
  }

  // เปอร์เซ็นต์เทียบขนาดจริงของรูป (100% = 1 พิกเซลรูปต่อ 1 พิกเซลจอ)
  const percent = fit && zoom ? Math.round((fit.width * zoom.scale / fit.natural) * 100) : null;
  const atMax = zoom !== null && zoom.scale >= maxScale - 0.01;
  return (
    <dialog ref={dialogRef} className="viewer" onClose={onClose} onKeyDown={onKeyDown}>
      <div ref={boxRef} className={'viewer-box' + (zoom ? ' zoomed' : '') + (dragging ? ' dragging' : '')}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)} onClick={onClick}
        onContextMenu={(e) => {
          if (!zoom) return;
          e.preventDefault();
          setZoom(null);
        }}>
        <img ref={imgRef} src={src} alt={alt} draggable={false} onLoad={onLoad}
          style={zoom && fit ? { width: fit.width * zoom.scale, maxWidth: 'none', maxHeight: 'none' } : undefined} />
      </div>
      <button type="button" className="viewer-close" aria-label="ปิด" onClick={() => dialogRef.current?.close()}>×</button>
      <p className="viewer-hint">{zoom ? <><IconHand /> ลากเพื่อเลื่อน · ซูมออกด้วย − หรือ ทั้งรูป</> : 'กดตรงที่อยากดูเพื่อซูม · เลื่อนล้อเมาส์เพื่อซูมเข้า/ออก'}</p>
      <div className="viewer-tools" role="toolbar" aria-label="ซูม">
        <button type="button" aria-label="ซูมออก" title="ซูมออก (−)" disabled={!zoom} onClick={() => zoomBy(1 / STEP)}>−</button>
        <output aria-live="polite">{percent !== null ? `${percent}%` : 'พอดีจอ'}</output>
        <button type="button" aria-label="ซูมเข้า" title="ซูมเข้า (+)" disabled={atMax} onClick={() => zoomBy(STEP)}>+</button>
        <button type="button" className="viewer-fit" title="ดูทั้งรูป (0)" disabled={!zoom} onClick={() => setZoom(null)}>ทั้งรูป</button>
      </div>
    </dialog>
  );
}
