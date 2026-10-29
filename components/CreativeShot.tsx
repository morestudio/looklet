'use client';
// ขั้นไอเดียภาพ (Creative Packshot): ใส่ข้อมูลช่วยคิด (ไม่บังคับ ใส่พร้อมกันได้) -> AI คิด 3 ไอเดีย -> เลือก 1 แล้วสร้างรูปจากการ์ดนั้นได้เลย
// เดิมต้องเลือก "วิธีเริ่มต้น" 3 แบบก่อน (AI คิด / ภาพแรงบันดาลใจ / บอกเอง) ผู้ใช้บอกว่าสับสนที่สุด (27 ต.ค.)
// จึงรวมเป็นหน้าเดียว และเรียกว่า "ไอเดีย" อย่างเดียว (ไม่ปน คอนเซปต์ / วางแผน)
import { Fragment, type ReactNode } from 'react';
import type { CreativeConcept } from '@/lib/creative';
import { Section } from './ui';

export default function CreativeShot({ idea, onIdea, facts, onFacts, inspiration, concepts, selected, onSelect, onPlan, planning, canPlan, hasProduct, onGenerate, canGenerate, generating }: {
  idea: string; onIdea: (text: string) => void; facts: string; onFacts: (text: string) => void;
  inspiration: ReactNode; concepts: CreativeConcept[]; selected?: CreativeConcept;
  onSelect: (id: string) => void; onPlan: () => void; planning: boolean; canPlan: boolean; hasProduct: boolean;
  onGenerate: () => void; canGenerate: boolean; generating: boolean;
}) {
  return <>
    <Section title="ช่วย AI คิด" note="ไม่ใส่ก็ได้ · ใส่พร้อมกันได้">
      <label className="shot-field">อยากได้แบบไหน
        <textarea className="text-input" disabled={planning} value={idea} maxLength={1200} onChange={(e) => onIdea(e.target.value)} placeholder="เช่น ถาดเงิน ฉากฟ้าเทา ให้ดูสดชื่นและแปลกตา" />
      </label>
      <p className="shot-field">ภาพแรงบันดาลใจ <span className="muted-text">AI เอาโทนสี วัสดุ และบรรยากาศมาจัดภาพใหม่ ไม่ลอกทั้งภาพ</span></p>
      {inspiration}
      <details className="advanced"><summary>ข้อมูลสินค้า <small>เช่น กลิ่น ส่วนผสม เรื่องราว</small></summary>
        <textarea className="text-input" disabled={planning} value={facts} maxLength={1200} onChange={(e) => onFacts(e.target.value)} placeholder="ข้อมูลที่ถูกต้องที่อยากให้ AI รู้" />
        <p className="muted-text">AI จะไม่เดาส่วนผสมหรือกลิ่นจากสีและรูปทรงของสินค้า</p>
      </details>
    </Section>
    {!hasProduct && <p className="note">เลือกสินค้าในขั้นที่ 1 ก่อน</p>}
    {!concepts.length && <button className="btn btn-primary gen-btn" disabled={!canPlan || planning} onClick={onPlan}>
      {planning ? 'AI กำลังคิด 3 ไอเดีย...' : '✨ ให้ AI คิด 3 ไอเดีย'}
    </button>}
    {planning && <p className="muted-text" role="status">กำลังดูสินค้า แล้วคิดฉาก พร็อพ แสง และองค์ประกอบให้เข้ากัน</p>}
    {concepts.length > 0 && <Section title="เลือก 1 ไอเดีย" note="ยังไม่ได้สร้างรูป">
      <div className="options creative-concepts">{concepts.map((c) => {
        const active = selected?.id === c.id;
        return <Fragment key={c.id}>
          <button type="button" disabled={planning} className={'option' + (active ? ' active' : '')} aria-pressed={active} onClick={() => onSelect(c.id)}>
            <b>{c.title}</b><small>{c.summary}</small>
            <span className="concept-palette" aria-label="โทนสี">{c.palette.map((color, i) => <i key={i} style={{ background: color }} />)}</span>
          </button>
          {/* ไอเดียที่เลือก: โชว์รายละเอียดเลย (เดิมซ่อนในปุ่มพับ) + ปุ่มสร้างรูปติดกับการ์ด */}
          {active && <div className="concept-detail">
            <dl className="preset-parts">{[['ฉาก', c.scene], ['พร็อพ', c.props], ['แสง', c.lighting], ['องค์ประกอบ', c.composition]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            <button className="btn btn-primary gen-btn" disabled={!canGenerate} onClick={onGenerate}>{generating ? 'กำลังสร้าง...' : 'สร้างรูปจากไอเดียนี้'}</button>
          </div>}
        </Fragment>;
      })}</div>
      <button className="btn btn-secondary gen-btn" disabled={!canPlan || planning} onClick={onPlan}>
        {planning ? 'AI กำลังคิด 3 ไอเดีย...' : '↻ คิดใหม่อีก 3 ไอเดีย'}
      </button>
    </Section>}
  </>;
}
