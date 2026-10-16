'use client';
// ui.tsx — ชิ้นส่วนหน้าเว็บที่ใช้ซ้ำ: การ์ดรูป, ปุ่มกลุ่ม (chips), หัวข้อในแผง
import type { ReactNode } from 'react';
import type { Item } from '@/lib/catalog';

// ---------- การ์ดให้กดเลือก ----------
export function Card({ item, active, onClick, zoom = false, onDelete, footer }: {
  item: Item; active: boolean; onClick: () => void; zoom?: boolean; onDelete?: () => void; footer?: ReactNode;
}) {
  const card = (
    <button className={'card' + (active ? ' active' : '')} title={item.name} onClick={onClick}>
      {item.src ? (
        // รูปนางแบบเต็มตัว ซูมให้เห็นหน้า
        <div className={'pic' + (zoom && !item.uploaded ? ' zoom' : '')}><img src={item.src} alt={item.name} /></div>
      ) : (
        <div className={'tile' + (item.emoji ? '' : ' text')}>{item.emoji ?? 'ไม่เปลี่ยน'}</div>
      )}
      <span>{item.name}</span>
    </button>
  );
  if (!onDelete && !footer) return card;
  return <div className="deletable">{card}{onDelete && <DeleteButton onClick={onDelete} />}{footer}</div>;
}

// การ์ดรอ ระหว่าง AI ดูว่าของเสริมที่เพิ่งเลือกเป็นอะไร
export function PendingCard({ src }: { src: string }) {
  return (
    <div className="card pending">
      <div className="pic"><img src={src} alt="" /><div className="pending-spin"><div className="spinner" /></div></div>
      <span>AI กำลังดูว่าเป็นอะไร...</span>
    </div>
  );
}

// ปุ่ม × (ลบ) มุมซ้ายบนของการ์ด/รูปย่อ
export function DeleteButton({ onClick, title = 'ลบรูปนี้ (ย้ายไปถังขยะ)' }: { onClick: () => void; title?: string }) {
  return (
    <button className="del" title={title} aria-label={title} onClick={(e) => { e.stopPropagation(); onClick(); }}>×</button>
  );
}

// การ์ด "+ เพิ่มรูป"
export function AddCard({ onFile }: { onFile: (f: File) => void }) {
  return (
    <label className="card add">
      <div className="tile">+</div>
      <span>เพิ่มรูป</span>
      <input type="file" accept="image/*" onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = ''; // เลือกไฟล์เดิมซ้ำได้
        if (f) onFile(f);
      }} />
    </label>
  );
}

// ปุ่มกลุ่มเลือกได้ทีละอัน (value = id ที่เลือก)
export function ChipGroup({ options, value, onChange, disabled }: {
  options: { id: string; name: ReactNode }[]; value: string; onChange: (id: string) => void; disabled?: boolean;
}) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.id} type="button" className={'chip' + (value === o.id ? ' active' : '')} disabled={disabled} onClick={() => onChange(o.id)}>
          {o.name}
        </button>
      ))}
    </div>
  );
}

// หัวข้อย่อยในแผง: note = คำอธิบายสั้นๆ ข้างหัวข้อ
export function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="sec">
      <h3>{title}{note && <small>{note}</small>}</h3>
      {children}
    </section>
  );
}
