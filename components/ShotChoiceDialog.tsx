'use client';
import { useEffect, useRef, useState } from 'react';
import { thumbSrc } from '@/lib/browser';
import type { ShotProposal } from '@/lib/photo-director';

export function ShotChoiceDialog({ proposal, references, onChoose }: {
  proposal: ShotProposal;
  references: { src: string; name: string }[];
  onChoose: (ids: string[]) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState([proposal.plan.selectedId]);
  const feasible = proposal.plan.candidates.filter((c) => c.feasible);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="shot-choice-dialog" aria-labelledby="shot-choice-title"
    onCancel={(e) => { e.preventDefault(); onChoose([]); }} onClose={() => onChoose([])}>
    <h2 id="shot-choice-title">เลือกไอเดียภาพ</h2>
    <p className="muted-text">เลือกได้ 1–3 ไอเดีย AI จะจัดท่าและมุมกล้องตามไอเดียที่เลือก · ยังไม่ได้สร้างรูป</p>
    <div className="shot-choice-refs">{references.map((r, i) => <figure key={i}><img src={thumbSrc(r.src)} alt={r.name} /><figcaption>{r.name}</figcaption></figure>)}</div>
    <div className="shot-choice-grid">{proposal.plan.candidates.map((shot) => <article key={shot.id} className={'shot-choice-card' + (selected.includes(shot.id) ? ' selected' : '')}>
      <label>
        <input type="checkbox" checked={selected.includes(shot.id)} disabled={!shot.feasible}
          onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, shot.id] : ids.filter((id) => id !== shot.id))} />
        <b>{shot.title}</b>
      </label>
      {shot.id === proposal.plan.selectedId && <span className="shot-recommended">AI แนะนำ</span>}
      {!shot.feasible && <p className="note">ท่านี้ไม่เหมาะกับรูปหรือเงื่อนไขที่เลือก</p>}
      <p>{shot.reasonThai}</p>
      <details><summary>ดูท่าและมุมกล้อง</summary><p>{shot.interaction}</p><p>{shot.cameraAngle}</p><p>{shot.framing}</p></details>
    </article>)}</div>
    <p className="muted-text">แต่ละไอเดียสร้างเป็นรูปแยกและใช้โควตาเพิ่มตามจำนวนที่เลือก หากเปิดแก้อัตโนมัติ แต่ละรูปอาจใช้เพิ่มได้อีก 1 ครั้ง</p>
    <div className="shot-choice-actions">
      <button type="button" className="btn btn-secondary" onClick={() => onChoose([])}>ยกเลิก</button>
      <button type="button" className="btn btn-secondary" onClick={() => setSelected(feasible.map((c) => c.id))}>เลือกทุกไอเดียที่ใช้ได้</button>
      <button type="button" className="btn btn-primary" disabled={!selected.length} onClick={() => onChoose(proposal.plan.candidates.filter((c) => c.feasible && selected.includes(c.id)).map((c) => c.id))}>
        สร้าง {selected.length} รูปที่เลือก
      </button>
    </div>
  </dialog>;
}
