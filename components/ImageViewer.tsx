'use client';
// ดูรูปเต็มจอ + ซูม (กดรูปบนเวที): คลิก = ซูมตรงจุดที่คลิก (ขนาดจริงของรูป อย่างน้อย 2 เท่าของตอนพอดีจอ) คลิกอีกที = กลับมาดูทั้งรูป
// ตอนซูม ลากด้วยเมาส์เพื่อเลื่อน / มือถือปัดนิ้วเลื่อนได้ตามปกติ · Esc หรือ ✕ = ปิด
// รูป 1664×2496 ละเอียดกว่าจอ ต้องซูมถึงจะเห็นผิว/เนื้อผ้า (22 ต.ค.)
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { IconHand } from './icons';

type Zoom = { width: number; fx: number; fy: number }; // ความกว้างรูปตอนซูม (px) + จุดที่คลิก (สัดส่วน 0..1)

export default function ImageViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState<Zoom | null>(null); // null = พอดีจอ
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false); // ตอนซูม: เคอร์เซอร์มือแบมือ (ลากได้) -> กำมือ (กำลังลาก)

  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }, []);

  // ซูมแล้ว: เลื่อนให้จุดที่คลิกอยู่กลางจอ
  useLayoutEffect(() => {
    const box = boxRef.current;
    const img = imgRef.current;
    if (!zoom || !box || !img) return;
    box.scrollLeft = zoom.fx * img.clientWidth - box.clientWidth / 2;
    box.scrollTop = zoom.fy * img.clientHeight - box.clientHeight / 2;
  }, [zoom]);

  function onImageClick(e: MouseEvent<HTMLImageElement>) {
    if (drag.current?.moved) return; // เพิ่งลากเลื่อนรูป ไม่ใช่คลิก
    if (zoom) return setZoom(null);
    const img = e.currentTarget;
    const r = img.getBoundingClientRect();
    setZoom({ width: Math.max(img.naturalWidth, r.width * 2), fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height });
  }

  // ลากด้วยเมาส์ (นิ้วบนมือถือใช้การเลื่อนของ browser เอง)
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const box = boxRef.current!;
    drag.current = { x: e.clientX, y: e.clientY, left: box.scrollLeft, top: box.scrollTop, moved: false };
    if (zoom && e.pointerType === 'mouse') setDragging(true);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!zoom || !d || e.pointerType !== 'mouse' || !(e.buttons & 1)) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    boxRef.current!.scrollLeft = d.left - dx;
    boxRef.current!.scrollTop = d.top - dy;
  }

  return (
    <dialog ref={dialogRef} className="viewer" onClose={onClose}>
      <div ref={boxRef} className={'viewer-box' + (zoom ? ' zoomed' : '') + (dragging ? ' dragging' : '')}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => setDragging(false)} onPointerLeave={() => setDragging(false)}>
        <img ref={imgRef} src={src} alt={alt} draggable={false} onClick={onImageClick}
          style={zoom ? { width: zoom.width, maxWidth: 'none', maxHeight: 'none' } : undefined} />
      </div>
      <button type="button" className="viewer-close" aria-label="ปิด" onClick={() => dialogRef.current?.close()}>×</button>
      <p className="viewer-hint">{zoom ? <><IconHand /> ลากเพื่อเลื่อน · คลิกเฉยๆ เพื่อดูทั้งรูป</> : 'คลิกตรงที่อยากดูเพื่อซูม'}</p>
    </dialog>
  );
}
