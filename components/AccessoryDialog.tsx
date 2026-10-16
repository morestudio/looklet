'use client';
// หน้าต่างของเสริม: เปิดเฉพาะตอน AI ดูรูปไม่ออก (ให้เลือกประเภทเอง) หรือกด "แก้" ใต้การ์ด
// ปกติ AI ดูแล้วเพิ่มให้เลย ไม่ต้องผ่านหน้าต่างนี้ (components/TryOn.tsx addAccessory)
// ต้องรู้ประเภทเพราะโค้ดต้องรู้ว่าของชิ้นไหนอยู่บนหน้า (แว่น/หมวก) เพื่อข้ามการใส่หน้าจริง
import { useEffect, useRef, useState } from 'react';
import { ACCESSORY_TYPES, type AccessoryInfo } from '@/lib/catalog';

// mode: add = ของใหม่ที่ AI ดูไม่ออก, edit = แก้ชิ้นที่เพิ่มไว้แล้ว
// onDone(null) = กดยกเลิก/กด Esc
export default function AccessoryDialog({ mode, preview, initial, onDone }: {
  mode: 'add' | 'edit';
  preview: string;
  initial: { name: string; type: string | null };
  onDone: (info: AccessoryInfo | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const chosen = useRef<AccessoryInfo | null>(null);
  const [name, setName] = useState(initial.name);
  const [type, setType] = useState(initial.type);

  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);

  return (
    <dialog ref={ref} onClose={() => onDone(chosen.current)}>
      <form method="dialog" onSubmit={() => {
        chosen.current = { name: name.trim() || ACCESSORY_TYPES.find((t) => t.id === type)!.name, type: type! };
      }}>
        <h2>{mode === 'add' ? 'เพิ่มของเสริม' : 'แก้ของเสริม'}</h2>
        <img id="accPreview" src={preview} alt="" />
        <label className="field">ชื่อสินค้า
          <input value={name} maxLength={80} placeholder="ไม่ใส่ก็ได้ จะใช้ชื่อประเภทแทน" onChange={(e) => setName(e.target.value)} />
        </label>
        <p className="sub">ประเภท — {mode === 'add' ? 'AI ดูไม่ออกว่าเป็นอะไร เลือกให้หน่อย' : 'บอก AI ว่าต้องใส่ของชิ้นนี้ตรงไหน'}</p>
        <div className="chips">
          {ACCESSORY_TYPES.map((t) => (
            <button key={t.id} type="button" className={'chip' + (type === t.id ? ' active' : '')} onClick={() => setType(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
        <div className="retouch-actions">
          <button type="button" className="btn btn-tertiary" onClick={() => ref.current?.close()}>ยกเลิก</button>
          <button className="btn btn-primary" disabled={!type}>{mode === 'add' ? 'เพิ่ม' : 'บันทึก'}</button>
        </div>
      </form>
    </dialog>
  );
}
