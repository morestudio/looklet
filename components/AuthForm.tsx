'use client';
// AuthForm.tsx — หน้าเข้าสู่ระบบ (โค้ดเชิญ / อีเมล + รหัสผ่าน), หน้าสมัครใช้งาน และหน้าเปลี่ยนรหัสผ่าน ใช้กรอบเดียวกัน
// accounts: invite codes from /admin, emails added with scripts/add-user.mjs, or sign-ups at /signup (17 Nov) that a
// superadmin approves at /admin — two equal login tabs since 16 Nov (same kind of account, only the sign-in differs)
// บัญชีที่ไม่มีสิทธิ์ (isMember) เข้าไม่ได้แม้รหัสถูก
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { noteLogin, track } from '@/lib/analytics';
import { errorMessageOf } from '@/lib/api-error';
import { authEnabled, isMember } from '@/lib/auth';
import { createClient } from '@/lib/supabase/client';
import { IconAccount, IconEye, IconEyeOff, IconKey, IconShield, IconSignOut } from './icons';
import { useMe } from './ui';

// หลังเข้าสู่ระบบ/เปลี่ยนรหัส: โหลดหน้าใหม่ทั้งหน้า ให้ proxy.ts เห็น cookie ใหม่
const go = (path: string) => window.location.assign(path);

export function LoginForm() {
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<'code' | 'email'>('code'); // most sign-ins are invite codes
  const pick = (m: 'code' | 'email') => { setMethod(m); setError(''); };

  // พิมพ์แค่โค้ดเชิญ server เข้าระบบให้ (app/api/invite-login)
  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/invite-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
      .catch(() => null);
    if (res?.ok) { noteLogin('invite_code'); return go('/welcome'); } // หน้าต้อนรับ (components/Welcome.tsx) ก่อนเข้าสตูดิโอ ทั้งเข้าด้วยโค้ดและอีเมล
    setBusy(false);
    setError(errorMessageOf(await res?.json().catch(() => null)) ?? 'เข้าใช้ไม่สำเร็จ ลองอีกครั้ง');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      setBusy(false);
      return setError(err.code === 'invalid_credentials' ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : 'เข้าสู่ระบบไม่สำเร็จ: ' + err.message);
    }
    const { data } = await supabase.auth.getClaims();
    if (!isMember(data?.claims)) {
      // ask before signing out: the check reads this session (app/api/signup GET)
      const status = await fetch('/api/signup').then((r) => r.json() as Promise<{ pending?: boolean }>).catch(() => null);
      await supabase.auth.signOut({ scope: 'local' });
      setBusy(false);
      return setError(status?.pending ? 'บัญชีนี้รอผู้ดูแลอนุมัติ อนุมัติแล้วจะเข้าใช้งานได้ทันที' : 'บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน ติดต่อผู้ดูแล');
    }
    noteLogin('password');
    go('/welcome');
  }

  return (
    <div className="auth-card">
      <div className="brand">Lolo <span className="beta">Beta</span></div>
      <h1>เข้าใช้งาน</h1>
      <div className="page-switch auth-tabs" role="tablist" aria-label="วิธีเข้าใช้งาน">
        {([['code', 'โค้ดเชิญ'], ['email', 'อีเมล']] as const).map(([m, label]) => (
          <button key={m} type="button" role="tab" id={`login-tab-${m}`} aria-controls={`login-${m}`} aria-selected={method === m}
            className={method === m ? 'active' : undefined} onClick={() => pick(m)}>{label}</button>
        ))}
      </div>
      {method === 'code' ? (
        <form className="auth-form" id="login-code" role="tabpanel" aria-labelledby="login-tab-code" onSubmit={(e) => void submitCode(e)}>
          <label>โค้ดเชิญ<input className="field auth-code" autoComplete="off" autoCapitalize="characters" spellCheck={false} required
            placeholder="ABCD-2345" value={code} onChange={(e) => setCode(e.target.value)} /></label>
          <button className="btn btn-primary" type="submit" disabled={busy || !code.trim()}>{busy ? 'กำลังเข้าใช้...' : 'เข้าใช้งาน'}</button>
        </form>
      ) : (
        <form className="auth-form" id="login-email" role="tabpanel" aria-labelledby="login-tab-email" onSubmit={(e) => void submit(e)}>
          <label>อีเมล<input className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <PasswordField label="รหัสผ่าน" autoComplete="current-password" value={password} onChange={setPassword} />
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าใช้งาน'}</button>
        </form>
      )}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <p className="auth-switch">ยังไม่มีบัญชี? <a href="/signup">สมัครใช้งาน</a></p>
    </div>
  );
}

// sign-up (app/api/signup): the account waits for a superadmin, no email is sent. "website" is a honeypot (hidden from people)
export function SignupForm() {
  const [f, setF] = useState({ email: '', password: '', confirm: '', shop: '', phone: '', line: '', website: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (f.password.length < 10) return setError('รหัสผ่านต้องยาวอย่างน้อย 10 ตัว');
    if (f.password !== f.confirm) return setError('รหัสผ่านสองช่องไม่ตรงกัน');
    setBusy(true);
    setError('');
    const body = { email: f.email, password: f.password, shop: f.shop, phone: f.phone, line: f.line, website: f.website };
    const res = await fetch('/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .catch(() => null);
    setBusy(false);
    if (res?.ok) { track('sign_up', { method: 'password' }); return setDone(true); }
    setError(errorMessageOf(await res?.json().catch(() => null)) ?? 'สมัครไม่สำเร็จ ลองอีกครั้ง');
  }

  if (done) return <div className="auth-card">
    <div className="brand">Lolo <span className="beta">Beta</span></div>
    <h1>ส่งคำขอแล้ว</h1>
    <p className="auth-text">ผู้ดูแลจะตรวจสอบและอาจติดต่อกลับทางเบอร์ที่ให้ไว้ เมื่ออนุมัติแล้ว เข้าใช้งานด้วยอีเมลและรหัสผ่านที่สมัครไว้ได้ทันที</p>
    <a className="btn btn-primary" href="/login">ไปหน้าเข้าใช้งาน</a>
  </div>;

  return <form className="auth-card" onSubmit={(e) => void submit(e)}>
    <div className="brand">Lolo <span className="beta">Beta</span></div>
    <h1>สมัครใช้งาน</h1>
    <p className="auth-text">สมัครแล้วรอผู้ดูแลอนุมัติก่อนเริ่มใช้งาน</p>
    <label>อีเมล<input className="field" type="email" autoComplete="email" required maxLength={254} value={f.email} onChange={(e) => set('email')(e.target.value)} /></label>
    <PasswordField label="รหัสผ่าน (อย่างน้อย 10 ตัว)" autoComplete="new-password" value={f.password} onChange={set('password')} />
    <PasswordField label="ยืนยันรหัสผ่าน" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} />
    <label>ชื่อร้าน / แบรนด์<input className="field" autoComplete="organization" required maxLength={80} value={f.shop} onChange={(e) => set('shop')(e.target.value)} /></label>
    <label>เบอร์โทร<input className="field" type="tel" autoComplete="tel" required maxLength={30} value={f.phone} onChange={(e) => set('phone')(e.target.value)} /></label>
    <label><span>LINE ID <span className="optional">(ไม่บังคับ)</span></span><input className="field" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={50} value={f.line} onChange={(e) => set('line')(e.target.value)} /></label>
    <label className="hp" aria-hidden="true">เว็บไซต์<input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set('website')(e.target.value)} /></label>
    {error && <p className="auth-error" role="alert">{error}</p>}
    <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'กำลังส่ง...' : 'สมัครใช้งาน'}</button>
    <p className="auth-fine">เราใช้อีเมล ชื่อร้าน และเบอร์ติดต่อเพื่อพิจารณาและติดต่อเรื่องการใช้งาน Lolo เท่านั้น เห็นได้เฉพาะผู้ดูแลระบบ</p>
    <p className="auth-switch">มีบัญชีแล้ว? <a href="/login">เข้าใช้งาน</a></p>
  </form>;
}

// password input with a show/hide eye; the button sits outside the <label> so the input's name stays just the label
function PasswordField({ label, autoComplete, value, onChange }: {
  label: string; autoComplete: string; value: string; onChange: (v: string) => void;
}) {
  const [shown, setShown] = useState(false);
  return <div className="password-field">
    <label>{label}<input className="field" type={shown ? 'text' : 'password'} autoComplete={autoComplete} required value={value}
      autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => onChange(e.target.value)} /></label>
    <button type="button" className="password-eye" aria-label={shown ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} aria-pressed={shown}
      title={shown ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} onMouseDown={(e) => e.preventDefault()} onClick={() => setShown((s) => !s)}>
      {shown ? <IconEyeOff /> : <IconEye />}
    </button>
  </div>;
}

export function ChangePasswordForm() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 10) return setMsg({ ok: false, text: 'รหัสผ่านต้องยาวอย่างน้อย 10 ตัว' });
    if (password !== confirm) return setMsg({ ok: false, text: 'รหัสผ่านสองช่องไม่ตรงกัน' });
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error?.name === 'AuthSessionMissingError') return void signOut(); // session ended elsewhere: clear the cookie, sign in again
    if (error) return setMsg({ ok: false, text: 'เปลี่ยนรหัสผ่านไม่สำเร็จ: ' + error.message });
    setPassword('');
    setConfirm('');
    setMsg({ ok: true, text: 'เปลี่ยนรหัสผ่านแล้ว' });
  }

  return (
    <form className="auth-card" onSubmit={(e) => void submit(e)}>
      <div className="brand">Lolo <span className="beta">Beta</span></div>
      <h1>เปลี่ยนรหัสผ่าน</h1>
      <PasswordField label="รหัสผ่านใหม่" autoComplete="new-password" value={password} onChange={setPassword} />
      <PasswordField label="ยืนยันรหัสผ่านใหม่" autoComplete="new-password" value={confirm} onChange={setConfirm} />
      {msg && <p className={msg.ok ? 'auth-ok' : 'auth-error'} role="alert">{msg.text}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}</button>
      <button className="btn btn-tertiary" type="button" onClick={() => go('/')}>← กลับไป Lolo</button>
    </form>
  );
}

// ปุ่มออกจากระบบ (แถบบนของ Lolo) · this browser only: the default ('global') ends the account's sessions everywhere,
// so one person signing out of a shared invite code would sign out everyone using it
export async function signOut() {
  await createClient().auth.signOut({ scope: 'local' });
  go('/login');
}

// top-right account menu on every page: name, แอดมิน (superadmin, with the number of sign-ups waiting, also shown on the
// button), change password (email accounts only: a code account's password is derived from its code) and sign out.
// Phones show only the icon (.account-name hidden in globals.css)
export function AccountMenu() {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (!authEnabled) return null;
  const name = me?.label?.trim() || me?.email || 'บัญชีของฉัน';
  const sub = me?.login === 'code' ? 'เข้าด้วยโค้ดเชิญ' : me?.email && me.email !== name ? me.email : '';
  return <div className="account-menu" ref={box}>
    <button className="btn btn-tertiary account-button" aria-haspopup="menu" aria-expanded={open} title={name}
      onClick={() => setOpen((o) => !o)}>
      <IconAccount /><span className="account-name">{name}</span>
      {!!me?.pending && <span className="tab-count" aria-label={`รออนุมัติ ${me.pending} คำขอ`}>{me.pending}</span>}
    </button>
    {open && <div className="account-pop" role="menu" aria-label="บัญชี">
      <div className="account-who"><b>{name}</b>{sub && <span>{sub}</span>}</div>
      {me?.role === 'superadmin' && <button role="menuitem" onClick={() => go('/admin')}>
        <IconShield />แอดมิน{!!me.pending && <span className="tab-count" title={`รออนุมัติ ${me.pending} คำขอ`}>{me.pending}</span>}
      </button>}
      {me?.login === 'email' && <button role="menuitem" onClick={() => go('/account')}><IconKey />เปลี่ยนรหัสผ่าน</button>}
      <button role="menuitem" onClick={() => void signOut()}><IconSignOut />ออกจากระบบ</button>
    </div>}
  </div>;
}
