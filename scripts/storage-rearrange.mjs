// storage-rearrange.mjs — จัดไฟล์ใน bucket images เข้าโฟลเดอร์ตามบัญชี (team/... , accounts/<id บัญชี>/...) ตาม objectKey ใน lib/storage-supabase.ts
// 16 Nov: also moves rows already filed somewhere else (customers/<id>/ -> accounts/<id>/), not only rows with object = null
// ลิงก์รูป (/api/files/...) และคอลัมน์ path ไม่เปลี่ยน: ย้ายแค่ไฟล์ แล้วเขียนที่อยู่ใหม่ในคอลัมน์ object (ต้องรัน scripts/db-apply.mjs ก่อน)
// ทำทีละรูป: copy จากที่อยู่ปัจจุบัน (object หรือ path) ไปที่ใหม่ (ใน Supabase ไม่ดาวน์โหลด = ไม่กิน egress) -> แก้แถว -> ลบที่เดิม  ระหว่างทางรูปเปิดได้ตลอด
//   node --env-file=.env.local scripts/storage-rearrange.mjs                ดูอย่างเดียว: จะย้ายอะไรไปไหน (ไม่แตะอะไร)
//   node --env-file=.env.local scripts/storage-rearrange.mjs --apply        ย้ายจริง เขียน log ทุกไฟล์ที่ logs/storage-rearrange-<เวลา>.jsonl
//   node --env-file=.env.local scripts/storage-rearrange.mjs --undo <log>   ย้ายกลับตาม log (คืน object เป็นค่าเดิม prev · log เก่าไม่มี prev = null)
// รันซ้ำได้: ข้ามแถวที่อยู่ตรงที่แล้ว และต่อจากที่ค้างได้
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { appLoader } from './lib/load-app.mjs';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');
const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !KEY) { console.error('ไม่มี SUPABASE_URL / secret key (รันด้วย --env-file=.env.local)'); process.exit(1); }
const sb = createClient(URL_, KEY, { auth: { persistSession: false } });
const bucket = sb.storage.from('images');
const { objectKey } = appLoader()('lib/storage-supabase.ts');
const [mode, logArg] = process.argv.slice(2);

async function allRows() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('images').select('path, object, area, kind, meta').order('path').range(from, from + 999);
    if (error) throw new Error('อ่านตาราง images ไม่ได้ (รัน scripts/db-apply.mjs เพิ่มคอลัมน์ object แล้วหรือยัง?): ' + error.message);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}
// ทำทีละ n งานพร้อมกัน
async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

if (mode === '--undo') {
  if (!logArg) { console.error('ระบุไฟล์ log: --undo logs/storage-rearrange-....jsonl'); process.exit(1); }
  const moves = fs.readFileSync(logArg, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((m) => m.status === 'moved');
  let ok = 0;
  await pool(moves, 4, async (m) => {
    const back = await bucket.copy(m.to, m.from);
    if (back.error && !/exists/i.test(back.error.message)) { console.log('ย้ายกลับไม่ได้', m.from, back.error.message); return; }
    const { error } = await sb.from('images').update({ object: m.prev ?? null }).eq('path', m.path);
    if (error) { console.log('แก้แถวไม่ได้', m.path, error.message); return; }
    await bucket.remove([m.to]);
    ok++;
  });
  console.log(`ย้ายกลับ ${ok}/${moves.length} ไฟล์`);
  process.exit(0);
}

const rows = await allRows();
const todo = rows
  .map((r) => ({ path: r.path, prev: r.object ?? null, from: r.object || r.path, to: objectKey(r.path, r.area, r.kind, r.meta ?? {}) }))
  .filter((t) => t.from !== t.to);
const folderOf = (k) => k.split('/').slice(0, -1).join('/');
const counts = {};
for (const t of todo) counts[folderOf(t.to)] = (counts[folderOf(t.to)] ?? 0) + 1;
console.log(`แถวทั้งหมด ${rows.length} · ย้ายแล้ว ${rows.length - todo.length} · ต้องย้าย ${todo.length}`);
for (const [f, n] of Object.entries(counts).sort()) console.log(`  ${String(n).padStart(4)}  ${f}/`);
const clash = todo.length - new Set(todo.map((t) => t.to)).size;
if (clash) { console.error(`มีที่อยู่ใหม่ซ้ำกัน ${clash} ไฟล์ — หยุด ไม่ย้าย`); process.exit(1); }
if (mode !== '--apply') {
  console.log('\nตัวอย่าง:');
  for (const t of todo.slice(0, 5)) console.log(`  ${t.from}  ->  ${t.to}`);
  console.log('\nยังไม่ได้ย้ายอะไร (ดูอย่างเดียว) · ย้ายจริง: --apply');
  process.exit(0);
}

fs.mkdirSync('logs', { recursive: true });
const logFile = path.join('logs', `storage-rearrange-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
const log = fs.openSync(logFile, 'a');
const write = (entry) => fs.writeSync(log, JSON.stringify({ ...entry, time: new Date().toISOString() }) + '\n');
const result = { moved: 0, missing: 0, failed: 0 };
await pool(todo, 4, async (t, k) => {
  // 1) copy ไปที่ใหม่ (ค้างจากรอบก่อน = มีอยู่แล้ว ใช้ต่อได้)
  const copy = await bucket.copy(t.from, t.to);
  if (copy.error && !/exists/i.test(copy.error.message)) {
    const missing = /not.?found/i.test(copy.error.message);
    result[missing ? 'missing' : 'failed']++;
    write({ status: missing ? 'missing' : 'copy-failed', path: t.path, prev: t.prev, from: t.from, to: t.to, error: copy.error.message });
    return;
  }
  // 2) แก้แถว (เฉพาะที่ยังอยู่ที่เดิม) -> รูปเปิดจากที่ใหม่ทันที
  const q = sb.from('images').update({ object: t.to }).eq('path', t.path);
  const { error } = await (t.prev ? q.eq('object', t.prev) : q.is('object', null));
  if (error) { result.failed++; write({ status: 'row-failed', path: t.path, prev: t.prev, from: t.from, to: t.to, error: error.message }); return; }
  // 3) ลบที่เดิม
  const rm = await bucket.remove([t.from]);
  write({ status: 'moved', path: t.path, prev: t.prev, from: t.from, to: t.to, ...(rm.error ? { removeError: rm.error.message } : {}) });
  result.moved++;
  if ((k + 1) % 50 === 0) console.log(`  ... ${k + 1}/${todo.length}`);
});
fs.closeSync(log);
console.log(`ย้ายแล้ว ${result.moved} · ไม่มีไฟล์ที่เดิม ${result.missing} · ไม่สำเร็จ ${result.failed} · log: ${logFile}`);
const left = (await allRows()).filter((r) => (r.object || r.path) !== objectKey(r.path, r.area, r.kind, r.meta ?? {})).length;
console.log(`แถวที่ยังไม่ได้ย้าย: ${left}`);
