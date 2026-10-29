'use client';
// AuthForm.tsx — หน้าเข้าสู่ระบบ (โค้ดเชิญ / อีเมล + รหัสผ่าน) และหน้าเปลี่ยนรหัสผ่าน ใช้กรอบเดียวกัน
// ไม่มีสมัครเอง: ลูกค้าใช้โค้ดเชิญที่ superadmin ออกให้ (/admin) ทีมงานใช้อีเมลที่ admin เพิ่มให้ (scripts/add-user.mjs)
// บัญชีที่ไม่มีสิทธิ์ (isMember) เข้าไม่ได้แม้รหัสถูก
import { useState, type FormEvent } from 'react';
import { authEnabled, isMember } from '@/lib/auth';
import { createClient } from '@/lib/supabase/client';
import { IconSignOut } from './icons';

// หลังเข้าสู่ระบบ/เปลี่ยนรหัส: โหลดหน้าใหม่ทั้งหน้า ให้ proxy.ts เห็น cookie ใหม่
const go = (path: string) => window.location.assign(path);

export function LoginForm() {
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // ลูกค้า: พิมพ์แค่โค้ดเชิญ server เข้าระบบให้ (app/api/invite-login)
  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/invite-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
      .catch(() => null);
    if (res?.ok) return go('/welcome'); // ลูกค้าเข้าด้วยโค้ด -> หน้าต้อนรับ (components/Welcome.tsx) ก่อนเข้าสตูดิโอ
    setBusy(false);
    setError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? 'เข้าใช้ไม่สำเร็จ ลองอีกครั้ง');
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
      await supabase.auth.signOut();
      setBusy(false);
      return setError('บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน ติดต่อผู้ดูแล');
    }
    go('/');
  }

  return (
    <div className="auth-card">
      <div className="brand">Looklet <span className="beta">Beta</span></div>
      <form className="auth-form" onSubmit={(e) => void submitCode(e)}>
        <h1>เข้าใช้งาน</h1>
        <label>โค้ดเชิญ<input className="field auth-code" autoComplete="off" autoCapitalize="characters" spellCheck={false} required
          placeholder="ABCD-2345" value={code} onChange={(e) => setCode(e.target.value)} /></label>
        <button className="btn btn-primary" type="submit" disabled={busy || !code.trim()}>{busy ? 'กำลังเข้าใช้...' : 'เข้าใช้งาน'}</button>
      </form>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <details className="auth-team">
        <summary>ทีมงาน: เข้าสู่ระบบด้วยอีเมล</summary>
        <form className="auth-form" onSubmit={(e) => void submit(e)}>
          <label>อีเมล<input className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>รหัสผ่าน<input className="field" type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} /></label>
          <button className="btn btn-secondary" type="submit" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}</button>
        </form>
      </details>
    </div>
  );
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
    if (error) return setMsg({ ok: false, text: 'เปลี่ยนรหัสผ่านไม่สำเร็จ: ' + error.message });
    setPassword('');
    setConfirm('');
    setMsg({ ok: true, text: 'เปลี่ยนรหัสผ่านแล้ว' });
  }

  return (
    <form className="auth-card" onSubmit={(e) => void submit(e)}>
      <div className="brand">Looklet <span className="beta">Beta</span></div>
      <h1>เปลี่ยนรหัสผ่าน</h1>
      <label>รหัสผ่านใหม่<input className="field" type="password" autoComplete="new-password" required value={password}
        onChange={(e) => setPassword(e.target.value)} /></label>
      <label>ยืนยันรหัสผ่านใหม่<input className="field" type="password" autoComplete="new-password" required value={confirm}
        onChange={(e) => setConfirm(e.target.value)} /></label>
      {msg && <p className={msg.ok ? 'auth-ok' : 'auth-error'} role="alert">{msg.text}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}</button>
      <button className="btn btn-tertiary" type="button" onClick={() => go('/')}>← กลับไป Looklet</button>
    </form>
  );
}

// ปุ่มออกจากระบบ (แถบบนของ Looklet)
export async function signOut() {
  await createClient().auth.signOut();
  go('/login');
}

// ปุ่มมุมขวาบนของทุกหน้า · จอมือถือเหลือแค่ไอคอน (.sign-out-text ซ่อนใน globals.css) ให้แถบบนพอดีจอ
export function SignOutButton() {
  if (!authEnabled) return null;
  return <button className="btn btn-tertiary sign-out" aria-label="ออกจากระบบ" title="ออกจากระบบ" onClick={() => void signOut()}>
    <IconSignOut /><span className="sign-out-text">ออกจากระบบ</span>
  </button>;
}
