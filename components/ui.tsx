'use client';
// ui.tsx — ชิ้นส่วนหน้าเว็บที่ใช้ซ้ำ: การ์ดรูป, ปุ่มกลุ่ม (chips), หัวข้อในแผง
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { authEnabled } from '@/lib/auth';
import { USAGE_EVENT } from '@/lib/browser';
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
export function PendingCard({ src, label = 'AI กำลังดูว่าเป็นอะไร...' }: { src: string; label?: string }) {
  return (
    <div className="card pending">
      <div className="pic"><img src={src} alt="" /><div className="pending-spin"><div className="spinner" /></div></div>
      <span>{label}</span>
    </div>
  );
}

// บันทึกรูปแบบกดค้าง: browser ในแอป (LINE ฯลฯ) ดาวน์โหลดไฟล์ไม่ได้ -> โชว์รูปให้กดค้างแล้ว "บันทึกรูปภาพ"
export function SaveImageDialog({ src, onClose }: { src: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="save-dialog" onClose={onClose}>
      <h2>บันทึกรูป</h2>
      <img src={src} alt="รูปที่จะบันทึก" />
      <p className="sub">กดค้างที่รูป แล้วเลือก &quot;บันทึกรูปภาพ&quot; — เบราว์เซอร์ในแอป (เช่น LINE) ดาวน์โหลดไฟล์ไม่ได้ หรือเปิดเว็บนี้ใน Safari / Chrome</p>
      <form method="dialog" className="retouch-actions"><button className="btn btn-secondary">ปิด</button></form>
    </dialog>
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
      <input type="file" accept="image/*,.heic,.heif" onChange={(e) => {
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

// สลับหน้า นางแบบ (components/TryOn.tsx) / สินค้า (components/Packshot.tsx) อยู่ในหัวเว็บของทั้งสองหน้า
// ปุ่ม "ถัดไป" เป็นสีชมพูเมื่อผู้ใช้เลือกอะไรในขั้นนั้นแล้ว (คลิกตัวเลือก / พิมพ์ / อัปโหลด) — ค่าเริ่มต้นที่เลือกไว้ให้ไม่นับ
// ใส่ mark ที่ onClickCapture + onInputCapture ของแผงเลือก · ช่องค้นหา หัวข้อพับ และปุ่มถัดไปเองไม่นับเป็นการเลือก
export function useChosenSteps<K extends string>(current: K) {
  const [chosen, setChosen] = useState<ReadonlySet<K>>(new Set());
  const mark = (e: SyntheticEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.next, summary, .search') || !target.closest('button, input, textarea, select, .card')) return;
    setChosen((prev) => (prev.has(current) ? prev : new Set(prev).add(current)));
  };
  return { chosen, mark };
}

// บัญชีที่เข้าอยู่ (/api/me): superadmin เห็นแท็บแอดมิน · ลูกค้าเห็นแถบโทเคน (TokenUsage มุมขวาบน)
type Me = { role: 'superadmin' | 'customer' | 'team'; label?: string; tokens?: number; tokenQuota?: number };
export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    if (!authEnabled) return;
    const load = () => void fetch('/api/me').then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => {});
    load();
    window.addEventListener(USAGE_EVENT, load);
    return () => window.removeEventListener(USAGE_EVENT, load);
  }, []);
  return me;
}

export function PageSwitch({ current }: { current: 'model' | 'product' | 'admin' }) {
  const me = useMe();
  const tab = (id: 'model' | 'product' | 'admin', href: string, label: string) => (
    <Link href={href} className={current === id ? 'active' : undefined} aria-current={current === id ? 'page' : undefined}>{label}</Link>
  );
  return <nav className="page-switch" aria-label="เลือกหน้า">
    {tab('model', '/', 'นางแบบ')}{tab('product', '/product', 'สินค้า')}
    {me?.role === 'superadmin' && tab('admin', '/admin', 'แอดมิน')}
  </nav>;
}

// ลูกค้า: แถบโทเคนใช้ไป / ทั้งหมด มุมขวาบนข้างปุ่มออกจากระบบ (โควตาเป็นโทเคนแทนจำนวนรูป 28 ต.ค.)
// อัปเดตเองหลังสร้างรูปทุกครั้ง (USAGE_EVENT) · ใช้ไป ≥ 90% เป็นสีแดง
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }); // 4116 -> 4.1K, 200000 -> 200K
export function TokenUsage() {
  const me = useMe();
  if (me?.role !== 'customer') return null;
  const used = me.tokens ?? 0, max = me.tokenQuota ?? 0;
  const share = max ? Math.min(1, used / max) : 1;
  const exact = `ใช้ไป ${used.toLocaleString('th-TH')} จาก ${max.toLocaleString('th-TH')} โทเคน`;
  return <span className={'token-usage' + (share >= 0.9 ? ' low' : '')} role="meter" aria-label="โทเคนที่ใช้ไป"
    aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(used, max)} aria-valuetext={exact} title={exact}>
    <span className="token-track"><i style={{ width: `${share * 100}%` }} /></span>
    <b>{compact.format(used)} / {compact.format(max)}</b><span className="token-word">โทเคน</span>
  </span>;
}
