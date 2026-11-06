'use client';
// AuditPage.tsx — หน้า /admin/audit (superadmin): ทุกครั้งที่สร้างรูป ใหม่สุดก่อน กดรูปเพื่อดูพรอมต์ รูปที่ส่งให้ AI และค่าที่เลือก — ข้อมูลจาก app/api/admin/audit
// พรอมต์เริ่มเก็บ 2 พ.ย. (usage.log) · รูปก่อนหน้านั้นจับคู่จากเวลาที่สร้าง ไม่มีพรอมต์
import { Fragment, useEffect, useRef, useState } from 'react';
import { SignOutButton } from './AuthForm';
import { IconCopy } from './icons';
import { AdminTabs, PageSwitch } from './ui';

type Row = {
  id: number; created: string; who: string; customer: boolean; page: string; action: string; model: string | null; quality: string | null;
  status: string; tokens: number | null; cost: number; src: string | null; guessed: boolean; hasLog: boolean; error: string | null;
  caption: string | null; plan: { name: string; th: string } | null; from: string | null;
};
type Person = { user?: string; email?: string; label: string };
type Log = Record<string, unknown> & { prompt?: string[]; harmonizePrompt?: string[]; roomPrompt?: string[]; error?: string; duration?: string };
type Input = { image: number; label: string; name?: string; file?: string; sent: string };
type Filters = { who: string; page: string; status: string }; // who: '' = ทุกบัญชี · 'user:<id>' · 'email:<อีเมล>'

const ACTIONS: Record<string, string> = { generate: 'สร้างรูป (นางแบบ)', packshot: 'สร้างรูปสินค้า', 'local-edit': 'แก้เฉพาะจุด', 'refine-skin': 'ปรับผิว' };
// ตำแหน่งใน log -> รูปนี้คืออะไร (lib/genlog.ts GenerateLog / PackshotLog)
const ROLES: Record<string, string> = {
  model: 'นางแบบ', 'element.outfit': 'ชุด', 'element.top': 'เสื้อ', 'element.bottom': 'ท่อนล่าง', 'element.shoes': 'รองเท้า', 'element.accessories': 'ของเสริม', 'element.scene': 'ฉาก', pose: 'ท่าโพสต์', set: 'รูปแรกของชุด',
  product: 'สินค้า', supports: 'สินค้า มุมอื่น', 'element.set': 'ฉาก', 'element.reference': 'ช็อตต้นแบบ', 'element.props.image': 'พร็อพของฉัน',
  angleGuide: 'ไกด์มุม (ตั้งมุมเอง)',
};
const IMAGE_KEYS = new Set(['image', 'name', 'type', 'file', 'sent']); // ฟิลด์ของรูปที่ส่ง (LogImage)
const isImage = (o: Record<string, unknown>) => typeof o.image === 'number' && typeof o.sent === 'string';
const when = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'medium' });
const num = (n: number) => Math.round(n).toLocaleString('th-TH');
// log เก็บชื่อไฟล์แบบอ่านออก (ถอดรหัสแล้ว) -> กลับเป็น URL · รูปใน /api/files ขอรูปย่อได้
const thumb = (src: string) => (src.startsWith('/api/files/') ? `${src}?w=400` : src);

function auditUrl(f: Filters, before?: number) {
  const q = new URLSearchParams();
  if (f.who.startsWith('user:')) q.set('user', f.who.slice(5));
  else if (f.who.startsWith('email:')) q.set('email', f.who.slice(6));
  if (f.page) q.set('page', f.page);
  if (f.status) q.set('status', f.status);
  if (before) q.set('before', String(before));
  return `/api/admin/audit?${q}`;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url).catch(() => null);
  const out = await res?.json().catch(() => ({}));
  if (!res?.ok) throw new Error(out?.error ?? `โหลดไม่สำเร็จ (HTTP ${res?.status ?? 'ไม่มีเน็ต'})`);
  return out as T;
}

// รูปที่ส่งให้ AI ทุกจุดใน log (วัตถุที่มีเลขรูป + ขนาดที่ส่ง) เรียงตามเลขรูปในพรอมต์ (Image n)
function inputsOf(log: Log): Input[] {
  const edit = typeof (log.style as Record<string, unknown> | undefined)?.operation === 'string'; // แก้เฉพาะจุด / ปรับผิว: model = รูปต้นฉบับ
  const out: Input[] = [];
  const walk = (v: unknown, at: string) => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x, at));
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (isImage(o)) {
      out.push({ image: o.image as number, sent: o.sent as string, name: o.name as string | undefined, file: o.file as string | undefined,
        label: edit && at === 'model' ? 'รูปต้นฉบับ' : ROLES[at] ?? at });
    }
    for (const [k, x] of Object.entries(o)) if (k !== 'prompt' && k !== 'harmonizePrompt' && k !== 'roomPrompt') walk(x, at ? `${at}.${k}` : k);
  };
  walk(log, '');
  return out.sort((a, b) => a.image - b.image);
}

// ค่าอื่นทั้งหมดใน log เป็นบรรทัด "ที่อยู่: ค่า" (รูปที่ส่งกับพรอมต์แสดงแยกแล้ว)
function detailsOf(log: Log) {
  const out: [string, string][] = [];
  const walk = (v: unknown, at: string) => {
    if (v == null || v === '') return;
    if (Array.isArray(v)) {
      if (v.every((x) => typeof x !== 'object')) out.push([at, v.join(', ')]);
      else v.forEach((x, i) => walk(x, `${at}[${i + 1}]`));
    } else if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      for (const [k, x] of Object.entries(o)) if (!(isImage(o) && IMAGE_KEYS.has(k))) walk(x, `${at}.${k}`);
    } else out.push([at, String(v)]);
  };
  for (const [k, v] of Object.entries(log)) if (!['prompt', 'harmonizePrompt', 'roomPrompt', 'time', 'status', 'result', 'error', 'duration'].includes(k)) walk(v, k);
  return out;
}

export default function AuditPage() {
  const [filters, setFilters] = useState<Filters>({ who: '', page: '', status: '' });
  const [data, setData] = useState<{ key: string; rows: Row[]; next: number | null } | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Row | null>(null);
  const key = auditUrl(filters);
  const loading = data?.key !== key;

  useEffect(() => {
    let gone = false;
    getJson<{ rows: Row[]; next: number | null; people?: Person[] }>(key).then((out) => {
      if (gone) return;
      setData({ key, rows: out.rows, next: out.next });
      if (out.people) setPeople(out.people);
      setMessage('');
    }, (err: Error) => { if (!gone) setMessage(err.message); });
    return () => { gone = true; };
  }, [key]);

  async function more() {
    if (!data?.next || busy) return;
    setBusy(true);
    try {
      const out = await getJson<{ rows: Row[]; next: number | null }>(auditUrl(filters, data.next));
      setData((d) => (d && d.key === key ? { key, rows: [...d.rows, ...out.rows], next: out.next } : d));
    } catch (err) { setMessage((err as Error).message); }
    finally { setBusy(false); }
  }
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const chip = (field: 'page' | 'status', value: string, label: string) => (
    <button className={'chip' + (filters[field] === value ? ' active' : '')} onClick={() => set({ [field]: value })}>{label}</button>
  );

  return <div className="admin-page">
    <header className="topbar">
      <div className="brand">SnapAds <span className="beta">Beta</span></div>
      <PageSwitch current="admin" />
      <div className="status" role="status">{message}</div>
      <div className="top-actions"><SignOutButton /></div>
    </header>
    <main className="admin-main">
      <AdminTabs current="audit" />
      <section className="admin-card">
        <h2>ตรวจงาน</h2>
        <p className="muted-text">ทุกครั้งที่สร้างรูป ใหม่สุดก่อน · กดรูปเพื่อดูพรอมต์ รูปที่ส่งให้ AI และค่าที่เลือก · เริ่มเก็บพรอมต์ 2 พ.ย. รูปก่อนหน้านั้นมีแต่รูปผลลัพธ์</p>
        <div className="audit-filters">
          <select value={filters.who} onChange={(e) => set({ who: e.target.value })} aria-label="บัญชี">
            <option value="">ทุกบัญชี</option>
            {people.map((p) => <option key={p.user ?? p.email} value={p.user ? `user:${p.user}` : `email:${p.email}`}>{p.label}</option>)}
          </select>
          <div className="chips">{chip('page', '', 'ทุกหน้า')}{chip('page', 'model', 'นางแบบ')}{chip('page', 'product', 'สินค้า')}</div>
          <div className="chips">{chip('status', '', 'ทุกผล')}{chip('status', 'ok', 'สำเร็จ')}{chip('status', 'error', 'พัง')}</div>
        </div>
        {loading ? <p className="muted-text">{message || 'กำลังโหลด...'}</p> : !data.rows.length ? <p className="muted-text">ไม่มีรูปตามที่กรอง</p> : <>
          <div className="audit-grid">{data.rows.map((r) => <button key={r.id} className="audit-card" onClick={() => setOpen(r)}>
            {r.src ? <div className="audit-thumb"><img src={thumb(r.src)} alt={r.caption ?? ''} loading="lazy" /></div>
              : <div className="audit-thumb failed">{r.status === 'error' ? `พัง${r.error ? ': ' + r.error.slice(0, 120) : ''}` : 'ไม่พบรูป'}</div>}
            <span className="audit-info">
              <b>{r.who}</b>
              <span>{ACTIONS[r.action] ?? r.action}</span>
              <span>{when(r.created)}{r.tokens != null ? ` · ${num(r.tokens)} โทเคน` : ''}</span>
              {!r.hasLog && <span className="audit-tag">ไม่มีพรอมต์</span>}
            </span>
          </button>)}</div>
          {data.next && <button className="btn btn-secondary audit-more" disabled={busy} onClick={() => void more()}>{busy ? 'กำลังโหลด...' : 'โหลดเพิ่ม'}</button>}
        </>}
      </section>
    </main>
    {open && <AuditDetail key={open.id} row={open} onClose={() => setOpen(null)} />}
  </div>;
}

function AuditDetail({ row, onClose }: { row: Row; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [log, setLog] = useState<Log | null | undefined>(row.hasLog ? undefined : null); // undefined = กำลังโหลด
  const [copied, setCopied] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => {
    if (!row.hasLog) return;
    let gone = false;
    getJson<{ log: Log | null }>(`/api/admin/audit?id=${row.id}`).then((out) => { if (!gone) setLog(out.log); }, () => { if (!gone) setLog(null); });
    return () => { gone = true; };
  }, [row]);
  const inputs = log ? inputsOf(log) : [];
  const error = log?.error ?? row.error;
  const copy = () => void navigator.clipboard.writeText(log?.prompt?.join(' ') ?? '').then(() => setCopied(true), () => setCopied(false));

  return <dialog ref={ref} className="audit-dialog" aria-labelledby="audit-title" onClose={onClose}
    onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
    <div className="audit-dialog-head">
      <h2 id="audit-title">{ACTIONS[row.action] ?? row.action} · {when(row.created)}</h2>
      <button className="btn btn-secondary" onClick={() => ref.current?.close()}>ปิด</button>
    </div>
    <div className="audit-detail">
      <div>
        {row.src ? <a href={row.src} target="_blank" rel="noreferrer" title="เปิดรูปเต็มในแท็บใหม่"><img className="audit-result" src={row.src} alt={row.caption ?? 'รูปที่สร้าง'} /></a>
          : <div className="audit-thumb failed">{row.status === 'error' ? 'สร้างไม่สำเร็จ' : 'ไม่พบรูป'}</div>}
        <dl className="audit-facts">
          <dt>บัญชี</dt><dd>{row.who}{row.customer ? ' (ลูกค้า)' : ''}</dd>
          <dt>ผล</dt><dd>{row.status === 'ok' ? 'สำเร็จ' : 'พัง'}{log?.duration ? ` · ใช้เวลา ${log.duration}` : ''}</dd>
          <dt>โมเดล</dt><dd>{row.model ?? '—'}{row.quality ? ` (${row.quality})` : ''}</dd>
          <dt>โทเคน</dt><dd>{row.tokens == null ? '—' : num(row.tokens)} · ฿{row.cost}</dd>
          {row.caption && <><dt>คำอธิบาย</dt><dd>{row.caption}</dd></>}
          {row.plan && <><dt>แผนของ AI</dt><dd>{row.plan.name ? `${row.plan.name}: ` : ''}{row.plan.th}</dd></>}
          {row.from && <><dt>แก้จากรูป</dt><dd><a href={row.from} target="_blank" rel="noreferrer">เปิดรูปต้นฉบับ</a></dd></>}
          {error && <><dt>error</dt><dd className="audit-error">{error}</dd></>}
        </dl>
      </div>
      <div>
        {log === undefined ? <p className="muted-text">กำลังโหลดพรอมต์...</p>
          : !log ? <p className="note">ไม่มีพรอมต์ของรูปนี้: เริ่มเก็บพรอมต์ตั้งแต่ 2 พ.ย.{row.guessed ? ' (รูปนี้จับคู่จากเวลาที่สร้าง)' : ''}</p>
          : <>
            {inputs.length > 0 && <section className="audit-section">
              <h3>รูปที่ส่งให้ AI</h3>
              <div className="audit-inputs">{inputs.map((i) => <figure key={i.image}>
                {i.file ? <a href={encodeURI(i.file)} target="_blank" rel="noreferrer"><img src={thumb(encodeURI(i.file))} alt={i.label} loading="lazy" /></a>
                  : <div className="audit-noimg">ไม่มีไฟล์</div>}
                <figcaption><b>Image {i.image}</b> · {i.label}{i.name ? ` · ${i.name}` : ''}<br />{i.sent}</figcaption>
              </figure>)}</div>
            </section>}
            {log.roomPrompt && <section className="audit-section">
              <h3>พรอมต์ขั้น 1 (ถ่ายฉากที่เลือกใหม่ตามรูปท่า)</h3>
              <p className="muted-text">ส่ง Image 1 = รูปฉากที่เลือก (รูปฉากด้านบน) · Image 2 = รูปท่า ตัดเป็นสัดส่วนของรูปสุดท้ายแล้ว · ฉากที่ได้ส่งต่อแทนรูปฉากในพรอมต์หลักด้านล่าง</p>
              <ol className="audit-prompt">{log.roomPrompt.map((s, n) => <li key={n}>{s}</li>)}</ol>
            </section>}
            <section className="audit-section">
              <h3>พรอมต์ <button className="btn btn-secondary" onClick={copy}><IconCopy /> {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}</button></h3>
              <ol className="audit-prompt">{(log.prompt ?? []).map((s, n) => <li key={n}>{s}</li>)}</ol>
            </section>
            {log.harmonizePrompt && <section className="audit-section">
              <h3>พรอมต์รอบสอง (ปรับแสงให้กลมกลืน)</h3>
              <ol className="audit-prompt">{log.harmonizePrompt.map((s, n) => <li key={n}>{s}</li>)}</ol>
            </section>}
            <section className="audit-section">
              <h3>ค่าที่เลือก และแผนของ AI</h3>
              <dl className="audit-facts">{detailsOf(log).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
            </section>
            <details className="audit-raw"><summary>ข้อมูลทั้งหมด (JSON)</summary><pre>{JSON.stringify(log, null, 2)}</pre></details>
          </>}
      </div>
    </div>
  </dialog>;
}
