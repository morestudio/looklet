'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { loadImg } from '@/lib/browser';
import { MAX_EDIT_PIXELS, supportsMaskedEdit, type LocalEditMode } from '@/lib/local-edit';
import { DEFAULT_AI_MODEL } from '@/lib/catalog';
import { IconBrush, IconEraser } from './icons';

// มีแค่แบบไฮไลต์คร่าว ๆ (เอา "ระบายแบบละเอียด" ออก 28 ต.ค.) — API ยังรับ precise สำหรับคำขอเก่า
const MODE: LocalEditMode = 'rough';

type Stroke = { tool: 'brush' | 'erase' | 'clear'; size: number; points: { x: number; y: number }[] };
export type LocalEditRequest = { mask: string | null; instruction: string; model: string; feather: number; mode: LocalEditMode }; // mask null = ไม่ได้ระบาย

function paint(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (stroke.tool === 'clear') { ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); return; }
  ctx.globalCompositeOperation = stroke.tool === 'erase' ? 'destination-out' : 'source-over';
  ctx.fillStyle = ctx.strokeStyle = '#e60023';
  ctx.lineWidth = stroke.size; ctx.lineCap = ctx.lineJoin = 'round';
  const first = stroke.points[0];
  if (!first) return;
  if (stroke.points.length === 1) {
    ctx.beginPath(); ctx.arc(first.x, first.y, stroke.size / 2, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(first.x, first.y);
    for (const p of stroke.points.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

export default function LocalEditDialog({ src, models, initialModel, onClose, onEdit }: {
  src: string; models: { id: string; label: string }[]; initialModel: string;
  onClose: () => void; onEdit: (request: LocalEditRequest) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const base = useRef<HTMLCanvasElement>(null);
  const selection = useRef<HTMLCanvasElement>(null);
  const history = useRef<Stroke[]>([]);
  const active = useRef<{ pointerId: number; stroke: Stroke } | null>(null);
  const submitting = useRef(false);
  const [tool, setTool] = useState<'brush' | 'erase'>('brush');
  const [brushSize, setBrushSize] = useState(32);
  const [instruction, setInstruction] = useState('');
  const supported = models.filter((m) => supportsMaskedEdit(m.id));
  // เลือกโมเดลไม่ได้แล้ว (27 ต.ค.): ใช้โมเดลเดียวที่ /api/models ส่งมา (DEFAULT_AI_MODEL) server บังคับซ้ำ
  const model = supported.find((m) => m.id === initialModel)?.id ?? supported.find((m) => m.id === DEFAULT_AI_MODEL)?.id ?? supported[0]?.id ?? '';
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!dialog.current?.open) dialog.current?.showModal();
    loadImg(src).then((image) => {
      if (cancelled || !base.current || !selection.current) return;
      if (image.naturalWidth * image.naturalHeight > MAX_EDIT_PIXELS) throw new Error('รองรับรูปไม่เกิน 16 ล้านพิกเซล');
      for (const canvas of [base.current, selection.current]) { canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; }
      base.current.getContext('2d')!.drawImage(image, 0, 0);
      setReady(true);
    }).catch((err) => { if (!cancelled) setError('โหลดรูปไม่สำเร็จ: ' + err.message); });
    return () => { cancelled = true; };
  }, [src]);

  function point(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = e.currentTarget, rect = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(canvas.width, (e.clientX - rect.left) * canvas.width / rect.width)),
      y: Math.max(0, Math.min(canvas.height, (e.clientY - rect.top) * canvas.height / rect.height)) };
  }
  function start(e: PointerEvent<HTMLCanvasElement>) {
    if (!ready || busy || active.current || e.button !== 0) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const stroke: Stroke = { tool, size: brushSize * e.currentTarget.width / rect.width, points: [point(e)] };
    active.current = { pointerId: e.pointerId, stroke };
    e.currentTarget.setPointerCapture(e.pointerId);
    paint(e.currentTarget.getContext('2d')!, stroke);
    setDrawing(true); setError('');
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    const a = active.current;
    if (!a || a.pointerId !== e.pointerId) return;
    const p = point(e), previous = a.stroke.points.at(-1)!;
    a.stroke.points.push(p);
    paint(e.currentTarget.getContext('2d')!, { ...a.stroke, points: [previous, p] });
  }
  function end(e: PointerEvent<HTMLCanvasElement>) {
    if (!active.current || active.current.pointerId !== e.pointerId) return;
    history.current.push(active.current.stroke);
    active.current = null;
    setCount(history.current.length); setDrawing(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function undo() {
    if (busy || drawing || !selection.current) return;
    history.current.pop();
    const ctx = selection.current.getContext('2d')!;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    history.current.forEach((stroke) => paint(ctx, stroke));
    setCount(history.current.length);
  }
  function clear() {
    if (busy || drawing || !selection.current) return;
    const stroke: Stroke = { tool: 'clear', size: 0, points: [] };
    history.current.push(stroke); paint(selection.current.getContext('2d')!, stroke);
    setCount(history.current.length);
  }
  async function submit() {
    const canvas = selection.current;
    if (!canvas || !ready || drawing || submitting.current || !instruction.trim() || !model) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
      let selected = 0;
      for (let i = 0; i < pixels.data.length; i += 4) {
        const coverage = pixels.data[i + 3];
        if (coverage) selected++;
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
        pixels.data[i + 3] = 255 - coverage;
      }
      // ไม่ได้ระบาย = แก้จากคำสั่งที่พิมพ์อย่างเดียว (ระบายเป็นแค่ตัวช่วยชี้ ไม่บังคับ)
      let mask: string | null = null;
      if (selected) {
        const out = document.createElement('canvas'); out.width = canvas.width; out.height = canvas.height;
        out.getContext('2d')!.putImageData(pixels, 0, 0);
        mask = out.toDataURL('image/png').split(',')[1];
      }
      await onEdit({ mask, instruction: instruction.trim(), model, feather: 6, mode: MODE });
    } catch (err) { setError((err as Error).message); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <dialog ref={dialog} className="local-edit-dialog" aria-labelledby="local-edit-title" onClose={onClose}
    onCancel={(e) => { if (busy) e.preventDefault(); }}>
    <header className="local-edit-header"><div><h2 id="local-edit-title">แก้เฉพาะจุด</h2>
      <p className="muted-text">พิมพ์สิ่งที่อยากแก้ได้เลย · ระบายชี้จุดเพิ่มได้ถ้าอยากให้ชัดขึ้น</p></div>
      <button className="btn btn-tertiary" disabled={busy} aria-label="ปิดแก้เฉพาะจุด" onClick={() => dialog.current?.close()}>×</button>
    </header>
    <div className="local-edit-layout">
      <section className="local-edit-workspace">
        <p className="muted-text">ไม่ต้องระบายก็ได้ · ถ้าอยากชี้ให้ชัด ระบายบางส่วนของวัตถุ ไม่ต้องเต็มหรือตามขอบ</p>
        <div className="local-edit-toolbar" role="group" aria-label="เครื่องมือเลือกพื้นที่">
          <button className={'chip icon-chip' + (tool === 'brush' ? ' active' : '')} disabled={busy || drawing} aria-pressed={tool === 'brush'}
            aria-label="แปรง" title="แปรง" onClick={() => setTool('brush')}><IconBrush /></button>
          <button className={'chip icon-chip' + (tool === 'erase' ? ' active' : '')} disabled={busy || drawing} aria-pressed={tool === 'erase'}
            aria-label="ยางลบ" title="ยางลบ" onClick={() => setTool('erase')}><IconEraser /></button>
          <button className="chip" disabled={busy || drawing || !count} onClick={undo}>ย้อนกลับ</button>
          <button className="chip" disabled={busy || drawing || !count} onClick={clear}>ล้างพื้นที่</button>
        </div>
        <div className="local-edit-canvas-area"><div className="local-edit-canvas-wrap">
          <canvas className="local-edit-base" ref={base} aria-label="รูปต้นฉบับสำหรับแก้เฉพาะจุด" />
          <canvas className="local-edit-selection" ref={selection} aria-label="ระบายพื้นที่ที่ต้องการแก้" style={{ cursor: tool === 'erase' ? 'cell' : 'crosshair' }}
            onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} />
        </div>{!ready && !error && <p className="muted-text">กำลังโหลดรูป...</p>}</div>
        <p className="muted-text">สีแดง = จุดอ้างอิง ไม่ใช่ขอบเขตการแก้ · AI อาจเปลี่ยนรายละเอียดใกล้เคียงได้</p>
      </section>
      <section className="local-edit-controls">
        <label className="shot-field">ขนาดแปรง <output>{brushSize}</output>
          <input type="range" min="8" max="120" value={brushSize} disabled={busy || drawing} onChange={(e) => setBrushSize(Number(e.target.value))} />
        </label>
        <label className="shot-field">ต้องการแก้อะไร
          <textarea className="text-input" rows={4} maxLength={1200} value={instruction} disabled={busy} onChange={(e) => setInstruction(e.target.value)} placeholder="เช่น เอาพร็อพออกทั้งหมด หรือ เปลี่ยนกระเป๋าเป็นสีแดงทั้งใบ รวมสาย โดยคงทรง ลาย และวัสดุเดิม" />
        </label>
        {!supported.length && <p className="note">ต้องตั้งค่า OpenAI API key ก่อนใช้การแก้เฉพาะจุด</p>}
        <p className="muted-text">ใช้ AI เพิ่ม 1 ครั้ง · เก็บเป็นรูปใหม่ ต้นฉบับยังอยู่</p>
        {error && <p className="note local-edit-error" role="alert">{error}</p>}
        {busy && <p className="muted-text" role="status">AI กำลังแก้ภาพและผสานพื้นที่เลือก...</p>}
        <button className="btn btn-primary gen-btn" disabled={!ready || busy || drawing || !instruction.trim() || !model} onClick={() => void submit()}>{busy ? 'กำลังแก้...' : 'สร้างรูปที่แก้แล้ว'}</button>
      </section>
    </div>
  </dialog>;
}
