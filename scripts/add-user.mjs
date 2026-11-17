// add-user.mjs — เพิ่มบัญชีอีเมลเข้าเว็บ (ไม่มีหน้าสมัครเอง) สุ่มรหัสผ่านให้ แล้วให้เจ้าของบัญชีเปลี่ยนเองที่ /account
//   node --env-file=.env.local scripts/add-user.mjs someone@shop.com --label "ร้านสมชาย"   (label ไม่ใส่ = ใช้อีเมล)
//   node --env-file=.env.local scripts/add-user.mjs boss@morestudio.co.th --superadmin   (ดูการใช้งาน/ออกโค้ดเชิญที่ /admin)
// writes both places: Supabase Auth (sign-in) + an accounts row (quota, label; shows in /admin at once). superadmin gets no row
// บัญชีโค้ดเชิญไม่ใช้สคริปต์นี้: superadmin ออกโค้ดที่หน้า /admin
// มีบัญชีอยู่แล้ว (เช่นสมัครผ่าน Supabase เอง) -> เปิดสิทธิ์ให้อย่างเดียว ไม่เปลี่ยนรหัส (+ เพิ่มแถวถ้ายังไม่มี, --label = เปลี่ยนชื่อ)
// ต้องมี SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ได้จาก `vercel env pull`)
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const labelAt = args.indexOf('--label');
const labelArg = labelAt >= 0 ? args[labelAt + 1]?.trim().slice(0, 80) : undefined;
const email = args
  .find((a, i) => !a.startsWith('--') && (labelAt < 0 || i !== labelAt + 1))
  ?.trim()
  .toLowerCase();
const superadmin = args.includes('--superadmin');
const role = superadmin ? { role: 'superadmin' } : {};
if (!email || (labelAt >= 0 && !labelArg)) {
  console.error('ใช้: node --env-file=.env.local scripts/add-user.mjs <อีเมล> [--label "ชื่อร้าน"] [--superadmin]');
  process.exit(1);
}
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const sb = createClient(process.env.SUPABASE_URL, KEY, { auth: { persistSession: false } });
const DEFAULT_TOKEN_QUOTA = 300_000; // same as DEFAULT_TOKEN_QUOTA in lib/usage.ts

// accounts row: new one with label (or the email), an existing one only gets a new label when --label is given
async function accountRow(userId) {
  if (superadmin) return '';
  const { data: row, error } = await sb.from('accounts').select('label').eq('user_id', userId).maybeSingle();
  if (error) return `\n  ตาราง accounts อ่านไม่ได้ (${error.message}) จะสร้างแถวให้ตอนเข้าใช้ครั้งแรก`;
  if (row) {
    if (!labelArg || labelArg === row.label) return `\n  ชื่อใน /admin: ${row.label}`;
    const { error: err } = await sb.from('accounts').update({ label: labelArg }).eq('user_id', userId);
    return err ? `\n  เปลี่ยนชื่อไม่สำเร็จ: ${err.message}` : `\n  ชื่อใน /admin: ${labelArg}`;
  }
  const label = labelArg ?? email.slice(0, 80);
  const { error: err } = await sb
    .from('accounts')
    .insert({ user_id: userId, code: null, label, token_quota: DEFAULT_TOKEN_QUOTA });
  if (err && err.code !== '23505') return `\n  เพิ่มแถวใน accounts ไม่สำเร็จ (${err.message}) จะสร้างให้ตอนเข้าใช้ครั้งแรก`;
  return `\n  ชื่อใน /admin: ${label} · โควตา ${DEFAULT_TOKEN_QUOTA.toLocaleString('en-US')} โทเคน`;
}

// สิทธิ์เข้าเว็บ = app_metadata.looklet (ดู lib/auth.ts)
const password = randomBytes(12).toString('base64url');
const { data: made, error } = await sb.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { looklet: true, ...role },
});
if (!error) {
  console.log(
    `เพิ่มบัญชีแล้ว\n  อีเมล: ${email}\n  รหัสผ่าน: ${password}${await accountRow(made.user.id)}\nส่งให้เจ้าของบัญชี แล้วให้เปลี่ยนรหัสที่หน้า /account`,
  );
} else if (error.code === 'email_exists') {
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const user = data.users.find((u) => u.email === email);
  const { error: err } = await sb.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, looklet: true, ...role },
  });
  if (err) {
    console.error('เปิดสิทธิ์ไม่สำเร็จ: ' + err.message);
    process.exit(1);
  }
  console.log(`มีบัญชี ${email} อยู่แล้ว เปิดสิทธิ์เข้าเว็บให้แล้ว (รหัสผ่านเดิม)${await accountRow(user.id)}`);
} else {
  console.error('เพิ่มบัญชีไม่สำเร็จ:', error.message);
  process.exit(1);
}
