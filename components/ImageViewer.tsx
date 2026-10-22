'use client';
// ดูรูปเต็มจอ + ซูม (กดรูปบนเวที): กดที่รูป = ซูมตรงจุดนั้น (ขนาดจริงของรูป อย่างน้อย 2 เท่าของตอนพอดีจอ) คลิกเฉยๆ อีกที = กลับมาดูทั้งรูป
// เมาส์: ซูมตั้งแต่ตอนกดลง กดค้างแล้วลากต่อได้เลย (เดิมซูมตอนปล่อยเมาส์ ต้องกดอีกรอบถึงจะลากได้ — ผู้ใช้บอก 22 ต.ค.)
// มือถือ: แตะเพื่อซูม ปัดนิ้วเลื่อนแบบปกติของ browser (ซูมตอนแตะลงจะซูมทุกครั้งที่ปัดหน้าจอ) · Esc หรือ ✕ = ปิด
// รูป 1664×2496 ละเอียดกว่าจอ ต้องซูมถึงจะเห็นผิว/เนื้อผ้า
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { IconHand } from './icons';

type Zoom = { width: number; fx: number; fy: number }; // ความกว้างรูปตอนซูม (px) + จุดที่กด (สัดส่วน 0..1)
// การกดครั้งนี้: จุดเริ่ม, ตำแหน่งเลื่อนตอนเริ่ม, ลากไปแล้วหรือยัง, ซูมเข้าตอนกดครั้งนี้ (คลิกที่ตามมาไม่ต้องซูมออก)
type Drag = { x: number; y: number; left: number; top: number; moved: boolean; zoomedIn: boolean };

export default function ImageViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState<Zoom | null>(null); // null = พอดีจอ
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false); // ตอนซูม: เคอร์เซอร์มือแบมือ (ลากได้) -> กำมือ (กำลังกด/ลาก)

  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }, []);

  // ซูมแล้ว: เลื่อนให้จุดที่กดอยู่กลางจอ — ถ้ายังกดค้างอยู่ ให้การลากเริ่มนับจากตำแหน่งใหม่นี้
  useLayoutEffect(() => {
    const box = boxRef.current;
    const img = imgRef.current;
    if (!zoom || !box || !img) return;
    box.scrollLeft = zoom.fx * img.clientWidth - box.clientWidth / 2;
    box.scrollTop = zoom.fy * img.clientHeight - box.clientHeight / 2;
    if (drag.current?.zoomedIn) {
      drag.current.left = box.scrollLeft;
      drag.current.top = box.scrollTop;
    }
  }, [zoom]);

  const zoomAt = (clientX: number, clientY: number) => {
    const img = imgRef.current!;
    const r = img.getBoundingClientRect();
    setZoom({ width: Math.max(img.naturalWidth, r.width * 2), fx: (clientX - r.left) / r.width, fy: (clientY - r.top) / r.height });
  };

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const box = boxRef.current!;
    const onImage = e.target === imgRef.current;
    const mouse = e.pointerType === 'mouse';
    drag.current = { x: e.clientX, y: e.clientY, left: box.scrollLeft, top: box.scrollTop, moved: false, zoomedIn: false };
    if (!mouse || (!zoom && !onImage)) return;
    if (!zoom) {
      drag.current.zoomedIn = true;
      zoomAt(e.clientX, e.clientY);
    }
    setDragging(true);
    box.setPointerCapture(e.pointerId); // ลากออกนอกรูป/นอกกรอบก็ยังเลื่อนต่อได้
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || e.pointerType !== 'mouse' || !(e.buttons & 1) || !boxRef.current!.classList.contains('zoomed')) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    boxRef.current!.scrollLeft = d.left - dx;
    boxRef.current!.scrollTop = d.top - dy;
  }
  // คลิก (กดแล้วปล่อยโดยไม่ลาก): ตอนซูมอยู่ = กลับมาดูทั้งรูป · มือถือแตะที่รูป = ซูม
  function onClick(e: MouseEvent<HTMLDivElement>) {
    const d = drag.current;
    if (d?.moved || d?.zoomedIn) return;
    if (zoom) setZoom(null);
    else if (e.target === imgRef.current) zoomAt(e.clientX, e.clientY);
  }

  return (
    <dialog ref={dialogRef} className="viewer" onClose={onClose}>
      <div ref={boxRef} className={'viewer-box' + (zoom ? ' zoomed' : '') + (dragging ? ' dragging' : '')}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)} onClick={onClick}>
        <img ref={imgRef} src={src} alt={alt} draggable={false}
          style={zoom ? { width: zoom.width, maxWidth: 'none', maxHeight: 'none' } : undefined} />
      </div>
      <button type="button" className="viewer-close" aria-label="ปิด" onClick={() => dialogRef.current?.close()}>×</button>
      <p className="viewer-hint">{zoom ? <><IconHand /> ลากเพื่อเลื่อน · คลิกเฉยๆ เพื่อดูทั้งรูป</> : 'กดตรงที่อยากดูเพื่อซูม กดค้างแล้วลากได้เลย'}</p>
    </dialog>
  );
}
