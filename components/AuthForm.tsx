'use client';
// AuthForm.tsx — หน้าเข้าสู่ระบบ (อีเมล + รหัสผ่าน) และหน้าเปลี่ยนรหัสผ่าน ใช้กรอบเดียวกัน
// ไม่มีสมัครเอง: admin เพิ่มบัญชีให้ (ดู README) บัญชีที่ไม่มีสิทธิ์ (isMember) เข้าไม่ได้แม้รหัสถูก
import { useState, type FormEvent } from 'react';
import { isMember } from '@/lib/auth';
import { createClient } from '@/lib/supabase/client';

// หลังเข้าสู่ระบบ/เปลี่ยนรหัส: โหลดหน้าใหม่ทั้งหน้า ให้ proxy.ts เห็น cookie ใหม่
const go = (path: string) => window.location.assign(path);

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
    <form className="auth-card" onSubmit={(e) => void submit(e)}>
      <div className="brand">Looklet <span className="beta">Beta</span></div>
      <h1>เข้าสู่ระบบ</h1>
      <label>อีเมล<input className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>รหัสผ่าน<input className="field" type="password" autoComplete="current-password" required value={password}
        onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}</button>
    </form>
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
