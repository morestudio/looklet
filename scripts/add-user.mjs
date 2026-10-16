// add-user.mjs — เพิ่มบัญชีเข้าเว็บ (ไม่มีหน้าสมัครเอง) สุ่มรหัสผ่านให้ แล้วให้เจ้าของบัญชีเปลี่ยนเองที่ /account
//   node --env-file=.env.local scripts/add-user.mjs someone@morestudio.co.th
// มีบัญชีอยู่แล้ว (เช่นสมัครผ่าน Supabase เอง) -> เปิดสิทธิ์ให้อย่างเดียว ไม่เปลี่ยนรหัส
// ต้องมี SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ได้จาก `vercel env pull`)
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('ใช้: node --env-file=.env.local scripts/add-user.mjs <อีเมล>');
  process.exit(1);
}
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// สิทธิ์เข้าเว็บ = app_metadata.looklet (ดู lib/auth.ts)
const password = randomBytes(12).toString('base64url');
const { error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { looklet: true } });
if (!error) {
  console.log(`เพิ่มบัญชีแล้ว\n  อีเมล: ${email}\n  รหัสผ่าน: ${password}\nส่งให้เจ้าของบัญชี แล้วให้เปลี่ยนรหัสที่หน้า /account`);
} else if (error.code === 'email_exists') {
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const user = data.users.find((u) => u.email === email);
  const { error: err } = await sb.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, looklet: true } });
  console.log(err ? 'เปิดสิทธิ์ไม่สำเร็จ: ' + err.message : `มีบัญชี ${email} อยู่แล้ว เปิดสิทธิ์เข้าเว็บให้แล้ว (รหัสผ่านเดิม)`);
} else {
  console.error('เพิ่มบัญชีไม่สำเร็จ:', error.message);
  process.exit(1);
}
