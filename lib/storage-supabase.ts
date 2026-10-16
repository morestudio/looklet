// storage-supabase.ts — ที่เก็บรูปบน Supabase (ใช้เมื่อมี SUPABASE_URL + key ใน env เช่นตอนขึ้น Vercel) ใช้ฝั่ง server เท่านั้น
// lib/storage.ts เลือกใช้ไฟล์นี้หรือเก็บลงเครื่องให้เอง — route อื่นไม่ต้องรู้
//
// ไฟล์รูป -> Storage bucket "images" (private) ชื่อ object = path เดียวกับ URL: results/<ไฟล์> หรือ uploads/<ประเภท>/<ไฟล์>
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

export type Row = { path: string; meta: Record<string, unknown>; created: string };

export async function sbSave(key: string, area: string, kind: string | null, data: Buffer, mime: string, meta: Record<string, unknown>) {
  const up = await sb().storage.from(BUCKET).upload(key, data, { contentType: mime, upsert: false });
  if (up.error) throw new Error('เก็บรูปลง Supabase ไม่สำเร็จ: ' + up.error.message);
  const row = await sb().from('images').insert({ path: key, area, kind, meta });
  if (row.error) {
    await sb().storage.from(BUCKET).remove([key]); // ไม่มีแถวในตาราง = รูปไม่ขึ้นในคลัง ลบไฟล์ทิ้งไม่ให้ค้าง
    throw new Error('บันทึกข้อมูลรูปไม่สำเร็จ: ' + row.error.message);
  }
}

// ใหม่สุดก่อน — kind = null คือรูปที่สร้าง (results)
export async function sbList(area: string, kind: string | null): Promise<Row[]> {
  let q = sb().from('images').select('path, meta, created').eq('area', area);
  q = kind === null ? q.is('kind', null) : q.eq('kind', kind);
  const { data, error } = await q.order('created', { ascending: false }).limit(1000);
  if (error) throw new Error('อ่านคลังรูปจาก Supabase ไม่สำเร็จ: ' + error.message);
  return data as Row[];
}

export async function sbRead(key: string) {
  const { data, error } = await sb().storage.from(BUCKET).download(key);
  return error || !data ? null : Buffer.from(await data.arrayBuffer());
}

export async function sbUpdateMeta(key: string, meta: Record<string, string>) {
  const { data } = await sb().from('images').select('meta').eq('path', key).maybeSingle();
  if (!data) return false;
  const { error } = await sb().from('images').update({ meta: { ...data.meta, ...meta } }).eq('path', key);
  if (error) throw new Error('แก้ข้อมูลรูปไม่สำเร็จ: ' + error.message);
  return true;
}

// ลบจริง (บน Supabase ไม่มีถังขยะ)
export async function sbDelete(key: string) {
  const { error } = await sb().from('images').delete().eq('path', key);
  if (error) throw new Error('ลบข้อมูลรูปไม่สำเร็จ: ' + error.message);
  await sb().storage.from(BUCKET).remove([key]);
  return true;
}
