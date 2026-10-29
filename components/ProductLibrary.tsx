'use client';
// ขั้นสินค้า: สินค้าของฉัน (เพิ่มสินค้าใหม่ + รายการ ใหม่สุดก่อน) ด้านบน -> รายละเอียดสินค้า (ชื่อ + รูปทุกมุม + เพิ่มรูปมุมอื่น + นำรูปออก) ด้านล่าง
// ปรับ 27 ต.ค. ผู้ใช้สับสน: สินค้าที่เลือก (ใหม่สุด) อยู่ท้ายกล่องเลื่อนเล็กๆ มองไม่เห็น, คำว่า "กลุ่ม", ปุ่มอัปโหลด 2 ปุ่มคล้ายกัน, ชื่อไฟล์แก้ไม่ได้
import { useState, type ChangeEvent } from 'react';
import type { ProductGroup } from '@/lib/product-groups';
import { PendingCard } from './ui';

const ACCEPT = 'image/*,.heic,.heif';

export default function ProductLibrary({ groups, selected, busy, analyzing, saving, onSelect, onUpload, onRename, onRemovePhoto, onRestorePhoto }: {
  groups: ProductGroup[]; selected?: ProductGroup; busy: boolean;
  analyzing: string[]; saving: { url: string }[];
  onSelect: (id: string) => void; onUpload: (files: File[], append?: boolean) => Promise<void>;
  onRename: (group: ProductGroup, name: string) => Promise<void>;
  onRemovePhoto: (group: ProductGroup, src: string) => Promise<void>;
  onRestorePhoto: (group: ProductGroup, src: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null); // ชื่อที่กำลังแก้ (null = ไม่ได้แก้)
  const [removed, setRemoved] = useState<{ group: string; src: string } | null>(null); // รูปที่เพิ่งนำออก ไว้กด "เอากลับ"
  const [over, setOver] = useState(false); // กำลังลากไฟล์อยู่เหนือกล่องเพิ่มสินค้า
  const pick = (append: boolean) => (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length) void onUpload(files, append);
  };
  async function saveName() {
    if (!selected || editing === null) return;
    const name = editing.trim();
    if (name && name !== selected.name) await onRename(selected, name).catch(() => {});
    setEditing(null);
  }

  return <div className="product-library">
    <p className="sub product-list-title">สินค้าของฉัน</p>
    <div className="product-group-grid">
      {/* เพิ่มสินค้าใหม่ = กล่องเส้นประขนาดเท่าการ์ดสินค้า ช่องแรกของรายการ (28 ต.ค.) · กดเลือกไฟล์ หรือลากรูปมาวาง */}
      <label className={'product-group-card product-add' + (over ? ' over' : '') + (busy ? ' busy' : '')}
        onDragOver={(e) => { e.preventDefault(); if (!busy) setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setOver(false);
          const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/') || /\.hei[cf]$/i.test(f.name));
          if (files.length && !busy) void onUpload(files, false);
        }}>
        <span className="product-add-plus" aria-hidden="true">+</span>
        <b>เพิ่มสินค้าใหม่</b>
        <small>เลือกหลายรูปได้ถ้าเป็นสินค้าชิ้นเดียวกัน หรือลากรูปมาวาง</small>
        <input type="file" aria-label="เพิ่มสินค้าใหม่" accept={ACCEPT} multiple disabled={busy} onChange={pick(false)} />
      </label>
      {analyzing.map((src) => <PendingCard key={src} src={src} />)}
      {saving.map(({ url }) => <PendingCard key={url} src={url} label="กำลังเก็บรูป..." />)}
      {[...groups].reverse().map((g) => <button type="button" key={g.id} aria-pressed={selected?.id === g.id} disabled={busy}
        onClick={() => { onSelect(g.id); setEditing(null); }} className={'product-group-card' + (selected?.id === g.id ? ' active' : '')}>
        {g.main?.src ? <img src={g.main.src} alt={g.name} /> : <span className="product-empty">ยังไม่มีรูป</span>}
        <b>{g.name}</b><small>{g.photos.length} รูป</small>
      </button>)}
    </div>

    {/* รายละเอียดสินค้า (เดิม "สินค้าที่ใช้" ในกล่องแดง): ส่วนเรียบๆ คั่นด้วยเส้น · ชื่อ + เปลี่ยนชื่อ · รูปทุกมุม + กล่องเส้นประเพิ่มมุม (28 ต.ค.) */}
    {selected && <section className="current-product" aria-labelledby="product-detail-title">
      <p className="sub" id="product-detail-title">รายละเอียดสินค้า</p>
      {editing === null ? <div className="current-product-name">
        <b>{selected.name}</b>
        <button type="button" className="btn btn-tertiary" disabled={busy} onClick={() => setEditing(selected.name)}>✎ เปลี่ยนชื่อ</button>
      </div> : <form className="current-product-name editing" onSubmit={(e) => { e.preventDefault(); void saveName(); }}>
        <input className="text-input" autoFocus value={editing} maxLength={80} aria-label="ชื่อสินค้า"
          onChange={(e) => setEditing(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null); }} />
        <span><button type="submit" className="btn btn-secondary" disabled={busy || !editing.trim()}>บันทึก</button>
          <button type="button" className="btn btn-tertiary" onClick={() => setEditing(null)}>ยกเลิก</button></span>
      </form>}
      <p className="muted-text">{selected.photos.length} รูป</p>
      <div className="current-product-photos">{selected.photos.map((p, i) => <figure key={p.src}>
        <img src={p.src} alt={`${selected.name} รูปที่ ${i + 1}`} />
        {p.src === selected.main?.src && <span className="current-product-main">รูปหลัก</span>}
        {/* นำออกได้เมื่อมีมากกว่า 1 รูป (สินค้าไม่ว่าง) · เก็บไฟล์ไว้ กดเอากลับได้ */}
        {selected.photos.length > 1 && <button type="button" className="current-product-remove" disabled={busy} aria-label={`นำรูปที่ ${i + 1} ออก`}
          onClick={() => void onRemovePhoto(selected, p.src!).then(() => setRemoved({ group: selected.id, src: p.src! }), () => {})}>×</button>}
      </figure>)}
        <label className={'current-product-add' + (busy ? ' busy' : '')} title="เพิ่มรูปมุมอื่นของสินค้านี้">
          <span aria-hidden="true">+</span>
          <input type="file" aria-label="เพิ่มรูปมุมอื่นของสินค้านี้" accept={ACCEPT} multiple disabled={busy} onChange={pick(true)} />
        </label>
      </div>
      {removed?.group === selected.id && <p className="muted-text">นำรูปออกแล้ว · <button type="button" className="btn btn-tertiary" disabled={busy}
        onClick={() => void onRestorePhoto(selected, removed.src).then(() => setRemoved(null), () => {})}>เอากลับ</button></p>}
      <p className="muted-text">กด + เพิ่มรูปด้านหลัง ด้านข้าง หรือรายละเอียด (โลโก้ ซิป) ช่วยให้ AI ทำสินค้าได้ตรงกว่า</p>
    </section>}
  </div>;
}
