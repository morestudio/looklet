// db-apply.mjs — ใช้ supabase/schema.sql กับฐานข้อมูล Supabase ของโปรเจกต์ (เว็บจริงกับในเครื่องใช้ชุดเดียวกัน)
// รันซ้ำได้ไม่พัง (create if not exists / grant / on conflict do nothing) — ต้องมี psql ในเครื่อง
//   node --env-file=.env.local scripts/db-apply.mjs
import { execFileSync } from 'node:child_process';

if (!process.env.POSTGRES_URL_NON_POOLING) {
  console.error('ไม่มี POSTGRES_URL_NON_POOLING (ได้จาก `vercel env pull .env.local`)');
  process.exit(1);
}
// psql ไม่รู้จัก query param บางตัวที่ Supabase ใส่มา เก็บไว้แค่ sslmode
const url = new URL(process.env.POSTGRES_URL_NON_POOLING);
for (const key of [...url.searchParams.keys()]) if (key !== 'sslmode') url.searchParams.delete(key);
if (!url.searchParams.get('sslmode')) url.searchParams.set('sslmode', 'require');
execFileSync('psql', [url.toString(), '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-f', new URL('../supabase/schema.sql', import.meta.url).pathname], { stdio: 'inherit' });
console.log('ใช้ supabase/schema.sql กับฐานข้อมูลแล้ว');
