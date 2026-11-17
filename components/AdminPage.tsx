'use client';
// AdminPage.tsx — หน้า /admin (superadmin): การใช้งานต่อบัญชี + ออกโค้ดเชิญ + แก้ชื่อ/โควตา/ปิดบัญชี (โค้ดและอีเมล) — ข้อมูลจาก app/api/admin
import { useEffect, useState } from 'react';
import { errorMessageOf } from '@/lib/api-error';
import { api, loadMe } from '@/lib/browser';
import { toast } from '@/lib/toast';
import { AccountMenu } from './AuthForm';
import { AdminTabs, GalleryLink, PageSwitch } from './ui';

type Tally = {
  ok: number;
  error: number;
  cost: number;
  tokens: number;
  measured: number;
  measuredTokens: number;
  model: number;
  product: number;
  last: string | null;
};
type InviteRow = Tally & {
  userId: string;
  code: string | null;
  label: string;
  tokenQuota: number;
  disabled: boolean;
  created: string;
};
type PendingRow = { userId: string; label: string; email: string; phone: string; line: string; created: string };
type Data = {
  total: Tally;
  pending: PendingRow[];
  invites: InviteRow[];
  team: (Tally & { email: string })[];
  recent: {
    created: string;
    who: string;
    page: string;
    action: string;
    status: string;
    cost: number;
    tokens: number | null;
  }[];
};
const DEFAULT_TOKEN_QUOTA = 300_000; // = DEFAULT_TOKEN_QUOTA ใน lib/usage.ts (ไฟล์นั้นใช้ฝั่ง server เท่านั้น)
const ACTIONS: Record<string, string> = {
  generate: 'สร้างรูป (นางแบบ)',
  packshot: 'สร้างรูปสินค้า',
  'local-edit': 'แก้เฉพาะจุด',
  'refine-skin': 'ปรับผิว',
};
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const baht = (n: number) => `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
const num = (n: number) => Math.round(n).toLocaleString('th-TH');
async function fetchAdmin(): Promise<{ data?: Data; error?: string }> {
  const res = await fetch('/api/admin').catch(() => null);
  const out = await res?.json().catch(() => ({}));
  return res?.ok
    ? { data: out }
    : { error: errorMessageOf(out) ?? `โหลดข้อมูลไม่สำเร็จ (HTTP ${res?.status ?? 'ไม่มีเน็ต'})` };
}

// sign-ups from /signup (app/api/signup): approve with a token quota, or remove (deletes the user and their details)
function PendingSignups({
  rows,
  busy,
  run,
}: {
  rows: PendingRow[];
  busy: boolean;
  run: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [quota, setQuota] = useState<Record<string, number>>({});
  return (
    <section className="admin-card admin-pending">
      <h2>รออนุมัติ ({rows.length})</h2>
      <p className="muted-text">
        สมัครเองที่หน้าสมัครใช้งาน ยังเข้าเว็บไม่ได้จนกว่าจะอนุมัติ ไม่แน่ใจให้โทรหรือทักไปถามก่อน · ลบทิ้ง = ลบบัญชีและข้อมูลติดต่อทั้งหมด
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ชื่อร้าน</th>
              <th>อีเมล</th>
              <th>เบอร์โทร</th>
              <th>LINE</th>
              <th>สมัครเมื่อ</th>
              <th>โควตา (โทเคน)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId}>
                <td>{r.label}</td>
                <td>{r.email}</td>
                <td>
                  <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>{r.phone}</a>
                </td>
                <td>{r.line || '—'}</td>
                <td>{when(r.created)}</td>
                <td>
                  <input
                    className="text-input"
                    type="number"
                    min={0}
                    max={100000000}
                    step={10000}
                    aria-label={`โควตาของ ${r.label}`}
                    disabled={busy}
                    value={quota[r.userId] ?? DEFAULT_TOKEN_QUOTA}
                    onChange={(e) => setQuota((q) => ({ ...q, [r.userId]: Number(e.target.value) }))}
                  />
                </td>
                <td className="admin-pending-actions">
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() =>
                      void run({
                        action: 'approve',
                        userId: r.userId,
                        tokenQuota: quota[r.userId] ?? DEFAULT_TOKEN_QUOTA,
                      })
                    }
                  >
                    อนุมัติ
                  </button>
                  <button
                    className="btn btn-tertiary"
                    disabled={busy}
                    onClick={() => {
                      if (confirm(`ลบคำขอของ ${r.label} (${r.email})? บัญชีและข้อมูลติดต่อจะถูกลบทั้งหมด`))
                        void run({ action: 'remove', userId: r.userId });
                    }}
                  >
                    ลบทิ้ง
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AdminPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState(''); // first load failed: shown in place of the tables
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(10);
  const [tokenQuota, setTokenQuota] = useState(DEFAULT_TOKEN_QUOTA);
  const [fresh, setFresh] = useState<string[]>([]); // โค้ดที่เพิ่งสร้าง (ไฮไลต์)

  // superadmin page: errors are shown as the server wrote them (no friendlyError)
  // reload after an action: on failure the tables stay and a toast says why
  const load = () => fetchAdmin().then((r) => (r.data ? setData(r.data) : toast.error(r.error ?? 'โหลดข้อมูลไม่สำเร็จ')));
  useEffect(() => {
    let gone = false;
    fetchAdmin().then((r) => {
      if (gone) return;
      if (r.data) setData(r.data);
      else setLoadError(r.error ?? 'โหลดข้อมูลไม่สำเร็จ');
    });
    return () => {
      gone = true;
    };
  }, []);

  async function run(body: Record<string, unknown>, done?: (out: { codes?: string[] }) => void) {
    setBusy(true);
    try {
      const out = await api<{ codes?: string[] }>('/api/admin', body);
      done?.(out);
      await load();
      void loadMe(true); // AccountMenu's waiting count
    } catch (err) {
      toast.error((err as Error).message);
      // create stopped part-way: highlight the codes it did make
      const made = (err as { details?: { codes?: unknown } }).details?.codes;
      if (Array.isArray(made) && made.length) {
        done?.({ codes: made as string[] });
        await load();
      }
    } finally {
      setBusy(false);
    }
  }
  const copy = (text: string, what: string) => {
    void navigator.clipboard.writeText(text).then(
      () => toast.ok(`คัดลอก${what}แล้ว`),
      () => toast.error('คัดลอกไม่สำเร็จ'),
    );
  };
  const active = data?.invites.filter((i) => !i.disabled) ?? [];

  return (
    <div className="admin-page">
      <header className="topbar">
        <div className="brand">
          Lolo <span className="beta">Beta</span>
        </div>
        <PageSwitch current="admin" />
        <div className="top-actions">
          <GalleryLink />
          <AccountMenu />
        </div>
      </header>
      <main className="admin-main">
        <AdminTabs current="overview" />
        {!data ? (
          <p className="muted-text">{loadError || 'กำลังโหลด...'}</p>
        ) : (
          <>
            {data.pending.length > 0 && <PendingSignups rows={data.pending} busy={busy} run={run} />}
            <section className="admin-totals">
              <div>
                <span>รูปที่สร้างสำเร็จ</span>
                <b>{data.total.ok.toLocaleString('th-TH')}</b>
                <small>
                  นางแบบ {data.total.model} · สินค้า {data.total.product}
                </small>
              </div>
              {/* เฉลี่ยต่อรูป = ไว้ตั้งโควตา: อยากให้ได้ N รูป ให้โทเคนประมาณ N × ค่าเฉลี่ย */}
              <div>
                <span>โทเคนที่ใช้</span>
                <b>{num(data.total.tokens)}</b>
                <small>
                  {data.total.measured
                    ? `เฉลี่ย ${num(data.total.measuredTokens / data.total.measured)} ต่อรูป (วัดจริง ${data.total.measured} รูป)`
                    : 'ยังไม่มีรูปที่วัดโทเคนจริง'}
                </small>
              </div>
              <div>
                <span>ค่า AI โดยประมาณ</span>
                <b>{baht(data.total.cost)}</b>
                <small>คิดจากรูปที่สำเร็จ</small>
              </div>
              <div>
                <span>สร้างไม่สำเร็จ</span>
                <b>{data.total.error.toLocaleString('th-TH')}</b>
                <small>ไม่นับโควตา</small>
              </div>
              <div>
                <span>บัญชีที่เปิดใช้</span>
                <b>{active.length}</b>
                <small>จากทั้งหมด {data.invites.length}</small>
              </div>
            </section>

            <section className="admin-card">
              <div className="admin-card-head">
                <h2>บัญชี</h2>
                {active.some((i) => i.code) && (
                  <button
                    className="btn btn-secondary"
                    onClick={() =>
                      copy(
                        active
                          .filter((i) => i.code)
                          .map((i) => `${i.label || 'ลูกค้า'}: ${i.code}`)
                          .join('\n'),
                        'โค้ดที่เปิดใช้ทั้งหมด',
                      )
                    }
                  >
                    คัดลอกทุกโค้ด
                  </button>
                )}
              </div>
              <p className="muted-text">
                ทุกบัญชีเห็นเฉพาะรูปของตัวเอง เข้าได้ 2 แบบ: พิมพ์โค้ดที่หน้าเข้าใช้งาน (1 โค้ด = 1 บัญชี) หรืออีเมล + รหัสผ่าน
                (สมัครเองที่หน้าสมัครใช้งานแล้วรออนุมัติด้านบน หรือเพิ่มด้วย scripts/add-user.mjs) · ปิดบัญชีแล้วสร้างรูปไม่ได้ทันที ·
                โควตานับโทเคนของรูปที่สร้างสำเร็จ (300,000 ≈ รูปสินค้า 50–60 รูป หรือรูปนางแบบ ~30 รูป)
              </p>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>เข้าด้วย</th>
                      <th>ชื่อ</th>
                      <th>โทเคน ใช้ไป / โควตา</th>
                      <th>นางแบบ · สินค้า</th>
                      <th>พัง</th>
                      <th>ค่า AI</th>
                      <th>ใช้ล่าสุด</th>
                      <th>สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invites.map((i) => (
                      <tr
                        key={i.userId}
                        className={(i.disabled ? 'off' : '') + (i.code && fresh.includes(i.code) ? ' fresh' : '')}
                      >
                        <td>
                          {i.code ? (
                            <button className="admin-code" title="คัดลอก" onClick={() => copy(i.code!, `โค้ด ${i.code}`)}>
                              {i.code}
                            </button>
                          ) : (
                            'อีเมล'
                          )}
                        </td>
                        <td>
                          <input
                            className="text-input"
                            defaultValue={i.label}
                            placeholder="ชื่อบัญชี"
                            maxLength={80}
                            disabled={busy}
                            onBlur={(e) => {
                              if (e.target.value.trim() !== i.label)
                                void run({ action: 'update', userId: i.userId, label: e.target.value });
                            }}
                          />
                        </td>
                        <td className="admin-quota">
                          {num(i.tokens)} /{' '}
                          <input
                            className="text-input"
                            type="number"
                            min={0}
                            max={100000000}
                            step={10000}
                            defaultValue={i.tokenQuota}
                            disabled={busy}
                            onBlur={(e) => {
                              if (Number(e.target.value) !== i.tokenQuota)
                                void run({ action: 'update', userId: i.userId, tokenQuota: Number(e.target.value) });
                            }}
                          />
                          {i.tokens >= i.tokenQuota && <small> ครบแล้ว</small>}
                        </td>
                        <td>
                          {i.model} · {i.product}
                        </td>
                        <td>{i.error}</td>
                        <td>{baht(i.cost)}</td>
                        <td>{when(i.last)}</td>
                        <td>
                          <button
                            className={'btn ' + (i.disabled ? 'btn-secondary' : 'btn-tertiary')}
                            disabled={busy}
                            onClick={() => void run({ action: 'update', userId: i.userId, disabled: !i.disabled })}
                          >
                            {i.disabled ? 'ปิดอยู่ · เปิด' : 'เปิดอยู่ · ปิด'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.invites.length && <p className="note">ยังไม่มีบัญชี สร้างโค้ดด้านล่างได้เลย</p>}
              <form
                className="admin-create"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run({ action: 'create', count, tokenQuota }, (out) => setFresh(out.codes ?? []));
                }}
              >
                <label>
                  จำนวนโค้ด
                  <input
                    className="text-input"
                    type="number"
                    min={1}
                    max={20}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                  />
                </label>
                <label>
                  โควตาต่อโค้ด (โทเคน)
                  <input
                    className="text-input"
                    type="number"
                    min={0}
                    max={100000000}
                    step={10000}
                    value={tokenQuota}
                    onChange={(e) => setTokenQuota(Number(e.target.value))}
                  />
                </label>
                <button className="btn btn-primary" type="submit" disabled={busy}>
                  {busy ? 'กำลังทำ...' : `+ สร้าง ${count} โค้ด`}
                </button>
              </form>
            </section>

            {data.team.length > 0 && (
              <section className="admin-card">
                <h2>บัญชีที่ไม่มีโควตา (superadmin)</h2>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>บัญชี</th>
                        <th>สำเร็จ</th>
                        <th>นางแบบ · สินค้า</th>
                        <th>พัง</th>
                        <th>โทเคน</th>
                        <th>ค่า AI</th>
                        <th>ใช้ล่าสุด</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.team.map((t) => (
                        <tr key={t.email}>
                          <td>{t.email}</td>
                          <td>{t.ok}</td>
                          <td>
                            {t.model} · {t.product}
                          </td>
                          <td>{t.error}</td>
                          <td>{num(t.tokens)}</td>
                          <td>{baht(t.cost)}</td>
                          <td>{when(t.last)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="admin-card">
              <h2>ล่าสุด</h2>
              {data.recent.length ? (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>เวลา</th>
                        <th>ใคร</th>
                        <th>ทำอะไร</th>
                        <th>ผล</th>
                        <th>โทเคน</th>
                        <th>ค่า AI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((r, n) => (
                        <tr key={n}>
                          <td>{when(r.created)}</td>
                          <td>{r.who}</td>
                          <td>{ACTIONS[r.action] ?? r.action}</td>
                          <td>{r.status === 'ok' ? 'สำเร็จ' : 'พัง'}</td>
                          <td title={r.tokens == null ? 'ก่อนเริ่มนับโทเคน: โควตานับประมาณ 6,000' : undefined}>
                            {r.tokens == null ? '—' : num(r.tokens)}
                          </td>
                          <td>{baht(r.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted-text">ยังไม่มีการใช้งาน</p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
