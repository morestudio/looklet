'use client';
// Paper doll: stage before the first image. Croquis + one card per pick, placed by body row.
import type { ReactNode } from 'react';
import type { Item } from '@/lib/catalog';

// item.src -> photo; item without src -> its name as text; keep -> "keep as is" text; neither -> dashed "+"
// changed: differs from the past image this draft started from (Go list item 4)
export type DollSlot = { id: string; label: string; item?: Item | null; keep?: string; fit?: 'cover' | 'contain'; changed?: boolean; onClick: () => void };
export type DollChip = { id: string; label: string; value: string; changed?: boolean; onClick: () => void };
// rows: 0 head, 1 torso, 2 legs, 3 feet
type Rows = [DollSlot[], DollSlot[], DollSlot[], DollSlot[]];

function DollCard({ slot, bare = false }: { slot: DollSlot; bare?: boolean }) {
  const { item, keep, label } = slot;
  const empty = !item && !keep;
  const text = item?.name ?? keep;
  return (
    <button type="button" className={'doll-card' + (empty ? ' empty' : '') + (bare ? ' bare' : '') + (slot.changed ? ' changed' : '')} onClick={slot.onClick}
      title={empty ? `เลือก${label}` : `${label}: ${text}`} aria-label={empty ? `เลือก${label}` : `${label}: ${text}`}>
      <span className={'doll-pic' + (slot.fit === 'contain' ? ' contain' : '')}>
        {item?.src ? <img src={item.src} alt="" /> : <span className="doll-text">{empty ? '+' : text}</span>}
      </span>
      {!bare && <b>{label}</b>}
    </button>
  );
}

// >1 slot in a row (accessories): cards without labels, one shared label under the group
function DollRow({ slots, row }: { slots: DollSlot[]; row: number }) {
  if (!slots.length) return <div className="doll-row" style={{ gridRow: row + 1 }} />;
  if (slots.length === 1) return <div className="doll-row" style={{ gridRow: row + 1 }}><DollCard slot={slots[0]} /></div>;
  return (
    <div className="doll-row" style={{ gridRow: row + 1 }}>
      <div className="doll-group">
        <div className="doll-group-cards">{slots.map((s) => <DollCard key={s.id} slot={s} bare />)}</div>
        <b className={slots.some((s) => s.changed) ? 'changed' : undefined}>{slots[0].label}</b>
      </div>
    </div>
  );
}

export function PaperDoll({ left, right, scene, chips, label, action }: {
  left: Rows; right: Rows; scene: DollSlot; chips: DollChip[]; label: string; action?: ReactNode; // action: shown on its own line under the label
}) {
  return (
    <div className="doll">
      <div className="doll-head">
        <div className="doll-label">{label}</div>
        {action}
      </div>
      <div className="doll-side left">
        {left.map((slots, i) => <DollRow key={i} slots={slots} row={i} />)}
        <div className="doll-scene"><DollCard slot={scene} /></div>
      </div>
      <div className="doll-figure"><img src="/images/paper-doll.png" alt="" /></div>
      <div className="doll-side right">
        {right.map((slots, i) => <DollRow key={i} slots={slots} row={i} />)}
      </div>
      <div className="doll-chips">
        {chips.map((c) => (
          <button type="button" key={c.id} className={'doll-chip' + (c.changed ? ' changed' : '')} onClick={c.onClick}>{c.label} <b>{c.value}</b></button>
        ))}
      </div>
    </div>
  );
}
