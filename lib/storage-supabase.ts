// storage-supabase.ts — ที่เก็บรูปบน Supabase (ใช้เมื่อมี SUPABASE_URL + key ใน env เช่นตอนขึ้น Vercel) ใช้ฝั่ง server เท่านั้น
// lib/storage.ts เลือกใช้ไฟล์นี้หรือเก็บลงเครื่องให้เอง — route อื่นไม่ต้องรู้
//
// ไฟล์รูป -> Storage bucket "images" (private) จัดโฟลเดอร์ตามบัญชี (objectKey ข้างล่าง) · id ของรูป (คอลัมน์ path) = path ใน URL: results/<ไฟล์> หรือ uploads/<ประเภท>/<ไฟล์>
// ข้อมูลรูป (ชื่อ/คำอธิบาย/ประเภท/ชุดภาพ) -> ตาราง images แทนไฟล์ .json คู่รูป — สร้างตารางด้วย supabase/schema.sql
// ใช้ secret (service role) key: ข้ามสิทธิ์ RLS ได้ หน้าเว็บไม่เคยเห็น key (เปิดรูปผ่าน /api/files เหมือนเดิม)
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const BUCKET = 'images';

export const supabaseEnabled = Boolean(URL && KEY);

let client: SupabaseClient | undefined;
const sb = () => (client ??= createClient(URL!, KEY!, { auth: { persistSession: false, autoRefreshToken: false } }));
// ตัวเดียวกันใช้กับตาราง invites / usage และจัดการบัญชีลูกค้า (lib/usage.ts, app/api/admin)
export const serviceClient = sb;

export type Row = { path: string; meta: Record<string, unknown>; created: string };

// ---------- ที่อยู่ไฟล์ใน bucket (จัดโฟลเดอร์ 10 พ.ย. ผู้ใช้เลือก) ----------
// Everything of one account lives under its own folder (18 Nov: thumbnails and guides moved in too), so an account is one prefix:
//   accounts/<account id>/results/model | results/product   generated images (meta.page)
//                         uploads/<kind>                     uploaded photos
//                         thumbs/512/<same path>.jpg         grid thumbnail of each of the above
//                         guides/<file>.jpg                  red highlight sent to the AI by a local edit (superadmin only)
//   team/…                owner-less files (no login); same layout
// Account id, never the invite code: the code is a password and developers see the Supabase dashboard.
// Links and the path column (results/<file>, uploads/<kind>/<file>) never change (history, product groups, editedFrom, logs use them);
// the real location is the object column.
const ownerId = (owner: unknown) => (typeof owner === 'string' && owner ? owner.replace(/[^\w-]/g, '_') : null);
// guides keep the owner in their link (no images row to look it up): id, or 'team' for owner-less
export const guideOwner = (owner: unknown) => ownerId(owner) ?? 'team';
const ownerFolder = (id: string) => (id === 'team' ? 'team' : `accounts/${id}`);
export const guideObject = (owner: string, file: string) => `${ownerFolder(owner)}/guides/${file}`;

export function objectKey(path: string, area: string, kind: string | null, meta: Record<string, unknown>) {
  const folder = area === 'results' ? `results/${meta.page === 'product' ? 'product' : 'model'}` : `uploads/${kind}`;
  return `${ownerFolder(guideOwner(meta.owner))}/${folder}/${path.slice(path.lastIndexOf('/') + 1)}`;
}

export async function sbSave(
  key: string,
  area: string,
  kind: string | null,
  data: Buffer,
  mime: string,
  meta: Record<string, unknown>,
) {
  const object = objectKey(key, area, kind, meta);
  const up = await sb().storage.from(BUCKET).upload(object, data, { contentType: mime, upsert: false });
  if (up.error) throw new Error('เก็บรูปลง Supabase ไม่สำเร็จ: ' + up.error.message);
  const row = await sb().from('images').insert({ path: key, object, area, kind, meta });
  if (row.error) {
    await sb().storage.from(BUCKET).remove([object]); // ไม่มีแถวในตาราง = รูปไม่ขึ้นในคลัง ลบไฟล์ทิ้งไม่ให้ค้าง
    throw new Error('บันทึกข้อมูลรูปไม่สำเร็จ: ' + row.error.message);
  }
  return object;
}

// ใหม่สุดก่อน — kind = null คือรูปที่สร้าง (results)
// owner filtered in the query (16 Nov): the 1,000 cap (PostgREST's max rows per request) now counts per account,
// so other accounts' newer rows can't push someone's older images out of their list; owner null = owner-less rows (no login)
export async function sbList(area: string, kind: string | null, owner: string | null): Promise<Row[]> {
  let q = sb().from('images').select('path, meta, created').eq('area', area);
  q = kind === null ? q.is('kind', null) : q.eq('kind', kind);
  q = owner === null ? q.is('meta->>owner', null) : q.eq('meta->>owner', owner);
  const { data, error } = await q.order('created', { ascending: false }).limit(1000);
  if (error) throw new Error('อ่านคลังรูปจาก Supabase ไม่สำเร็จ: ' + error.message);
  return data as Row[];
}

// uploads owned by one account, every kind (MAX_UPLOADS in lib/usage.ts); thumbs/guides have no row so they don't count
export async function sbCountUploads(owner: string) {
  const { count, error } = await sb()
    .from('images')
    .select('path', { count: 'exact', head: true })
    .eq('area', 'uploads')
    .eq('meta->>owner', owner);
  if (error) throw new Error('นับรูปที่อัปโหลดไม่สำเร็จ: ' + error.message);
  return count ?? 0;
}

// เช็กแถวในตารางก่อน: CDN ของ Supabase เก็บไฟล์ไว้ 1 ชม. ลบแล้วยังโหลดได้ (แผนฟรีไม่ล้าง cache ตอนลบ) — ไม่มีแถว = ลบแล้ว
// คืน meta ด้วย ให้ lib/storage.ts เช็กว่าบัญชีที่เรียกเห็นรูปนี้ได้ไหม (meta.owner)
export async function sbRead(key: string, allowed: (meta: Record<string, unknown>) => boolean) {
  const row = await sb().from('images').select('meta, object').eq('path', key).maybeSingle();
  if (!row.data || !allowed(row.data.meta)) return null;
  const { data, error } = await sb().storage.from(BUCKET).download(row.data.object);
  return error || !data ? null : Buffer.from(await data.arrayBuffer());
}

export async function sbMeta(key: string): Promise<Record<string, unknown> | null> {
  const { data } = await sb().from('images').select('meta').eq('path', key).maybeSingle();
  return data ? data.meta : null;
}

export async function sbUpdateMeta(
  key: string,
  meta: Record<string, string | boolean | number>,
  allowed: (meta: Record<string, unknown>) => boolean,
) {
  const { data } = await sb().from('images').select('meta').eq('path', key).maybeSingle();
  if (!data || !allowed(data.meta)) return false;
  const { error } = await sb()
    .from('images')
    .update({ meta: { ...data.meta, ...meta } })
    .eq('path', key);
  if (error) throw new Error('แก้ข้อมูลรูปไม่สำเร็จ: ' + error.message);
  return true;
}

// ลบจริง (บน Supabase ไม่มีถังขยะ) — รูปย่อของรูปนั้นด้วย
export async function sbDelete(key: string) {
  const { data: row } = await sb().from('images').select('object').eq('path', key).maybeSingle();
  const { error } = await sb().from('images').delete().eq('path', key);
  if (error) throw new Error('ลบข้อมูลรูปไม่สำเร็จ: ' + error.message);
  if (row)
    await sb()
      .storage.from(BUCKET)
      .remove([row.object, thumbKey(row.object)]);
  return true;
}

// ไฟล์ที่ไม่มีแถวในตาราง images (ไม่ขึ้นในคลังของใคร) เช่นภาพไฮไลต์สีแดงของแก้เฉพาะจุด (guides/) — สิทธิ์เปิดเช็กใน lib/storage.ts
export async function sbPutObject(key: string, data: Buffer, mime: string) {
  const { error } = await sb().storage.from(BUCKET).upload(key, data, { contentType: mime, upsert: false });
  if (error) throw new Error('เก็บไฟล์ลง Supabase ไม่สำเร็จ: ' + error.message);
}
export async function sbGetObject(key: string) {
  const { data, error } = await sb().storage.from(BUCKET).download(key);
  return error || !data ? null : Buffer.from(await data.arrayBuffer());
}

// ---------- รูปย่อ (ตาราง/ประวัติรูปในหน้าเว็บ, /api/files?w=) ----------
// 10 พ.ย.: Supabase แจ้งเกินโควตาแผนฟรี Cached Egress 7.1/5 GB (รอบ 16 ต.ค.–16 พ.ย.) จำกัดการใช้งานตั้งแต่ 30 พ.ย. ถ้ายังเกิน
// สาเหตุ: หน้าเว็บโหลดรูปเต็ม (ผลลัพธ์เฉลี่ย 1.7 MB, PNG แก้เฉพาะจุด ~3.6 MB) ทุกรูปในประวัติ/คลังทันทีที่เปิดหน้า บัญชีทีม 1 ครั้ง ~250 MB
// และรูปย่อเดิมก็ดึงรูปเต็มจาก Supabase มาย่อทุกครั้ง -> เก็บรูปย่อเป็น object แยก (~40 KB) ข้างรูปเต็มในโฟลเดอร์ของบัญชี (thumbKey)
// ไม่มีแถวในตาราง images (ไม่ขึ้นในคลัง) สิทธิ์เปิดเช็กจากแถวของรูปเต็มเหมือน sbRead
export const GRID_THUMB = 512; // ตรงกับ thumbSrc ใน lib/browser.ts — การ์ดนางแบบซูมหน้า 1.8 เท่าบนจอ retina ยังคม
// accounts/<id>/results/model/x.jpg -> accounts/<id>/thumbs/512/results/model/x.jpg (always JPEG, so the photo's extension is dropped)
export function thumbKey(object: string) {
  const root = object.startsWith('accounts/') ? object.split('/', 2).join('/') : object.split('/', 1)[0];
  return `${root}/thumbs/${GRID_THUMB}/${object.slice(root.length + 1).replace(/\.\w+$/, '')}.jpg`;
}

export async function sbSaveThumb(object: string, data: Buffer) {
  const { error } = await sb()
    .storage.from(BUCKET)
    .upload(thumbKey(object), data, { contentType: 'image/jpeg', upsert: true });
  if (error) console.error('เก็บรูปย่อไม่สำเร็จ', object, error.message); // ไม่เป็นไร เปิดครั้งหน้าทำใหม่
}

// มีรูปย่อแล้ว = ส่งรูปย่อ · ยังไม่มี (เก็บรูปย่อไม่สำเร็จตอนบันทึก) = ดึงรูปเต็มครั้งเดียว ย่อ แล้วเก็บไว้
export async function sbReadThumb(
  key: string,
  allowed: (meta: Record<string, unknown>) => boolean,
  make: (full: Buffer) => Promise<Buffer>,
) {
  const row = await sb().from('images').select('meta, object').eq('path', key).maybeSingle();
  if (!row.data || !allowed(row.data.meta)) return null;
  const saved = await sb().storage.from(BUCKET).download(thumbKey(row.data.object));
  if (!saved.error && saved.data) return Buffer.from(await saved.data.arrayBuffer());
  const full = await sb().storage.from(BUCKET).download(row.data.object);
  if (full.error || !full.data) return null;
  const thumb = await make(Buffer.from(await full.data.arrayBuffer())).catch(() => null); // ไฟล์เสีย = ไม่มีรูปย่อ
  if (thumb) await sbSaveThumb(row.data.object, thumb);
  return thumb;
}
