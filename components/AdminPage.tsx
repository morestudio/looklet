'use client';
// AdminPage.tsx — หน้า /admin (superadmin): การใช้งานต่อบัญชี + ออก/แก้โค้ดเชิญลูกค้า — ข้อมูลจาก app/api/admin
import { useEffect, useState } from 'react';
import { api } from '@/lib/browser';
import { SignOutButton } from './AuthForm';
import { PageSwitch } from './ui';

type Tally = { ok: number; error: number; cost: number; tokens: number; measured: number; measuredTokens: number; model: number; product: number; last: string | null };
type InviteRow = Tally & { code: string; label: string; tokenQuota: number; disabled: boolean; created: string };
type Data = {
  total: Tally; invites: InviteRow[]; team: (Tally & { email: string })[];
  recent: { created: string; who: string; page: string; action: string; status: string; cost: number; tokens: number | null }[];
};
const DEFAULT_TOKEN_QUOTA = 300_000; // = DEFAULT_TOKEN_QUOTA ใน lib/usage.ts (ไฟล์นั้นใช้ฝั่ง server เท่านั้น)
const ACTIONS: Record<string, string> = { generate: 'สร้างรูป (นางแบบ)', packshot: 'สร้างรูปสินค้า', 'local-edit': 'แก้เฉพาะจุด', 'refine-skin': 'ปรับผิว' };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const baht = (n: number) => `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
const num = (n: number) => Math.round(n).toLocaleString('th-TH');
async function fetchAdmin(): Promise<{ data?: Data; error?: string }> {
  const res = await fetch('/api/admin').catch(() => null);
  const out = await res?.json().catch(() => ({}));
  return res?.ok ? { data: out } : { error: out?.error ?? `โหลดข้อมูลไม่สำเร็จ (HTTP ${res?.status ?? 'ไม่มีเน็ต'})` };
}

export default function AdminPage() {
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(10);
  const [tokenQuota, setTokenQuota] = useState(DEFAULT_TOKEN_QUOTA);
  const [fresh, setFresh] = useState<string[]>([]); // โค้ดที่เพิ่งสร้าง (ไฮไลต์)

  const show = (r: { data?: Data; error?: string }) => (r.data ? setData(r.data) : setStatus(r.error ?? ''));
  const load = () => fetchAdmin().then(show);
  useEffect(() => {
    let gone = false;
    fetchAdmin().then((r) => { if (!gone) show(r); });
    return () => { gone = true; };
  }, []);

  async function run(body: Record<string, unknown>, done?: (out: { codes?: string[] }) => void) {
    setBusy(true);
    setStatus('');
    try {
      const out = await api<{ codes?: string[] }>('/api/admin', body);
      done?.(out);
      await load();
    } catch (err) { setStatus((err as Error).message); }
    finally { setBusy(false); }
  }
  const copy = (text: string, what: string) => void navigator.clipboard.writeText(text).then(() => setStatus(`คัดลอก${what}แล้ว`), () => setStatus('คัดลอกไม่สำเร็จ'));
  const active = data?.invites.filter((i) => !i.disabled) ?? [];

  return <div className="admin-page">
    <header className="topbar">
      <div className="brand">Looklet <span className="beta">Beta</span></div>
      <PageSwitch current="admin" />
      <div className="status" role="status">{status}</div>
      <div className="top-actions"><SignOutButton /></div>
    </header>
    <main className="admin-main">
      {!data ? <p className="muted-text">{status || 'กำลังโหลด...'}</p> : <>
        <section className="admin-totals">
          <div><span>รูปที่สร้างสำเร็จ</span><b>{data.total.ok.toLocaleString('th-TH')}</b><small>นางแบบ {data.total.model} · สินค้า {data.total.product}</small></div>
          {/* เฉลี่ยต่อรูป = ไว้ตั้งโควตา: อยากให้ได้ N รูป ให้โทเคนประมาณ N × ค่าเฉลี่ย */}
          <div><span>โทเคนที่ใช้</span><b>{num(data.total.tokens)}</b><small>{data.total.measured ? `เฉลี่ย ${num(data.total.measuredTokens / data.total.measured)} ต่อรูป (วัดจริง ${data.total.measured} รูป)` : 'ยังไม่มีรูปที่วัดโทเคนจริง'}</small></div>
          <div><span>ค่า AI โดยประมาณ</span><b>{baht(data.total.cost)}</b><small>คิดจากรูปที่สำเร็จ</small></div>
          <div><span>สร้างไม่สำเร็จ</span><b>{data.total.error.toLocaleString('th-TH')}</b><small>ไม่นับโควตา</small></div>
          <div><span>โค้ดที่เปิดใช้</span><b>{active.length}</b><small>จากทั้งหมด {data.invites.length}</small></div>
        </section>

        <section className="admin-card">
          <div className="admin-card-head">
            <h2>โค้ดเชิญลูกค้า</h2>
            {active.length > 0 && <button className="btn btn-secondary" onClick={() => copy(active.map((i) => `${i.label || 'ลูกค้า'}: ${i.code}`).join('\n'), 'โค้ดที่เปิดใช้ทั้งหมด')}>คัดลอกทุกโค้ด</button>}
          </div>
          <p className="muted-text">ลูกค้าพิมพ์โค้ดที่หน้าเข้าใช้งานได้เลย · 1 โค้ด = 1 บัญชี เห็นเฉพาะรูปของตัวเอง · ปิดโค้ดแล้วสร้างรูปไม่ได้ทันที · โควตานับโทเคนของรูปที่สร้างสำเร็จ (300,000 ≈ รูปสินค้า 50–60 รูป หรือรูปนางแบบ ~30 รูป)</p>
          <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th>โค้ด</th><th>ลูกค้า</th><th>โทเคน ใช้ไป / โควตา</th><th>นางแบบ · สินค้า</th><th>พัง</th><th>ค่า AI</th><th>ใช้ล่าสุด</th><th>สถานะ</th></tr></thead>
            <tbody>{data.invites.map((i) => <tr key={i.code} className={(i.disabled ? 'off' : '') + (fresh.includes(i.code) ? ' fresh' : '')}>
              <td><button className="admin-code" title="คัดลอก" onClick={() => copy(i.code, `โค้ด ${i.code}`)}>{i.code}</button></td>
              <td><input className="text-input" defaultValue={i.label} placeholder="ชื่อลูกค้า" maxLength={80} disabled={busy}
                onBlur={(e) => { if (e.target.value.trim() !== i.label) void run({ action: 'update', code: i.code, label: e.target.value }); }} /></td>
              <td className="admin-quota">{num(i.tokens)} / <input className="text-input" type="number" min={0} max={100000000} step={10000} defaultValue={i.tokenQuota} disabled={busy}
                onBlur={(e) => { if (Number(e.target.value) !== i.tokenQuota) void run({ action: 'update', code: i.code, tokenQuota: Number(e.target.value) }); }} />
                {i.tokens >= i.tokenQuota && <small> ครบแล้ว</small>}</td>
              <td>{i.model} · {i.product}</td>
              <td>{i.error}</td>
              <td>{baht(i.cost)}</td>
              <td>{when(i.last)}</td>
              <td><button className={'btn ' + (i.disabled ? 'btn-secondary' : 'btn-tertiary')} disabled={busy}
                onClick={() => void run({ action: 'update', code: i.code, disabled: !i.disabled })}>{i.disabled ? 'ปิดอยู่ · เปิด' : 'เปิดอยู่ · ปิด'}</button></td>
            </tr>)}</tbody>
          </table></div>
          {!data.invites.length && <p className="note">ยังไม่มีโค้ด สร้างด้านล่างได้เลย</p>}
          <form className="admin-create" onSubmit={(e) => { e.preventDefault(); void run({ action: 'create', count, tokenQuota }, (out) => setFresh(out.codes ?? [])); }}>
            <label>จำนวนโค้ด<input className="text-input" type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
            <label>โควตาต่อโค้ด (โทเคน)<input className="text-input" type="number" min={0} max={100000000} step={10000} value={tokenQuota} onChange={(e) => setTokenQuota(Number(e.target.value))} /></label>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'กำลังทำ...' : `+ สร้าง ${count} โค้ด`}</button>
          </form>
        </section>

        {data.team.length > 0 && <section className="admin-card">
          <h2>บัญชีทีม</h2>
          <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th>บัญชี</th><th>สำเร็จ</th><th>นางแบบ · สินค้า</th><th>พัง</th><th>โทเคน</th><th>ค่า AI</th><th>ใช้ล่าสุด</th></tr></thead>
            <tbody>{data.team.map((t) => <tr key={t.email}><td>{t.email}</td><td>{t.ok}</td><td>{t.model} · {t.product}</td><td>{t.error}</td><td>{num(t.tokens)}</td><td>{baht(t.cost)}</td><td>{when(t.last)}</td></tr>)}</tbody>
          </table></div>
        </section>}

        <section className="admin-card">
          <h2>ล่าสุด</h2>
          {data.recent.length ? <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th>เวลา</th><th>ใคร</th><th>ทำอะไร</th><th>ผล</th><th>โทเคน</th><th>ค่า AI</th></tr></thead>
            <tbody>{data.recent.map((r, n) => <tr key={n}><td>{when(r.created)}</td><td>{r.who}</td><td>{ACTIONS[r.action] ?? r.action}</td>
              <td>{r.status === 'ok' ? 'สำเร็จ' : 'พัง'}</td><td title={r.tokens == null ? 'ก่อนเริ่มนับโทเคน: โควตานับประมาณ 6,000' : undefined}>{r.tokens == null ? '—' : num(r.tokens)}</td><td>{baht(r.cost)}</td></tr>)}</tbody>
          </table></div> : <p className="muted-text">ยังไม่มีการใช้งาน</p>}
        </section>
      </>}
    </main>
  </div>;
}
