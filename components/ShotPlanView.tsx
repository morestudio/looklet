import { selectedShot, type StoredPosePlan } from '@/lib/photo-director';

export function ShotPlanView({ plan }: { plan: StoredPosePlan }) {
  const shot = plan.director ? selectedShot(plan.director) : null;
  return <div className="shot-plan">
    <p><b>{plan.name}</b> · {plan.th}</p>
    {plan.review && <p role="status" className={plan.review.status === 'passed' ? 'muted-text' : 'note'}>
      <b>{plan.review.status === 'passed' ? 'ผ่านการตรวจด้วย AI' : plan.review.status === 'unavailable' ? 'ยังไม่ได้ตรวจภาพ' : 'ควรตรวจภาพก่อนใช้'}</b>
      {' · '}{plan.review.summaryThai}{plan.repaired ? ' · แก้อัตโนมัติแล้ว 1 ครั้ง' : ''}
    </p>}
    {plan.repairError && <p className="note">{plan.repairError}</p>}
    {shot && <details className="advanced">
      <summary>ดูท่า มุมกล้อง และไอเดียที่เปรียบเทียบ</summary>
      <p><b>ท่าและฉาก:</b> {shot.interaction}</p>
      <p><b>มุมกล้อง:</b> {shot.cameraAngle} · {shot.framing}</p>
      <p><b>รายละเอียดชุด:</b> {shot.outfitDetails}</p>
      <p><b>จุดที่ยังไม่แน่ใจ:</b> {plan.director!.observations.uncertainty}</p>
      {plan.director!.candidates.filter((c) => c.id !== shot.id).map((c) => <p key={c.id}>
        <b>{c.title}</b>{!c.feasible ? ' · ใช้ไม่ได้กับเงื่อนไขนี้' : ''} · {c.reasonThai}
      </p>)}
    </details>}
  </div>;
}
