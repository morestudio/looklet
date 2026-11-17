// login-flag.mjs — mark invite-code accounts with app_metadata.login = 'code' and drop their old role 'customer' (16 Nov)
// role now means what an account may do (superadmin or customer = everyone else); login says how it signs in (lib/auth.ts).
// Run before deploying the code that reads login (sessions issued before the run still count role 'customer' as code).
//   node --env-file=.env.local scripts/login-flag.mjs           look only: which accounts would change
//   node --env-file=.env.local scripts/login-flag.mjs --apply   change them
//   node --env-file=.env.local scripts/login-flag.mjs --undo    back to role 'customer', no login flag
// Code accounts = rows in public.accounts with a code. Safe to run again.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');
const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !KEY) { console.error('ไม่มี SUPABASE_URL / secret key (รันด้วย --env-file=.env.local)'); process.exit(1); }
const sb = createClient(URL_, KEY, { auth: { persistSession: false } });
const mode = process.argv[2];

const { data: rows, error } = await sb.from('accounts').select('user_id, code').not('code', 'is', null);
if (error) throw new Error('อ่านตาราง accounts ไม่ได้: ' + error.message);
// Supabase merges app_metadata keys on update; a null value removes the key
const target = mode === '--undo' ? { login: null, role: 'customer' } : { login: 'code', role: null };
const done = (meta) => (mode === '--undo' ? meta.role === 'customer' && meta.login === undefined : meta.login === 'code' && meta.role === undefined);
let todo = 0, changed = 0, missing = 0;
for (const { user_id } of rows) {
  const { data } = await sb.auth.admin.getUserById(user_id);
  if (!data?.user) { missing++; continue; }
  if (done(data.user.app_metadata ?? {})) continue;
  todo++;
  if (mode !== '--apply' && mode !== '--undo') continue;
  const { error: e } = await sb.auth.admin.updateUserById(user_id, { app_metadata: target });
  if (e) console.log('แก้ไม่ได้', user_id, e.message); else changed++;
}
console.log(`บัญชีโค้ด ${rows.length} · ต้องแก้ ${todo} · แก้แล้ว ${changed}${missing ? ` · ไม่พบบัญชี ${missing}` : ''}`);
if (mode !== '--apply' && mode !== '--undo') console.log('ยังไม่ได้แก้อะไร (ดูอย่างเดียว) · แก้จริง: --apply');
