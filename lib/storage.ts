// storage.ts — เก็บรูป (refresh แล้วไม่หาย) ใช้ฝั่ง server เท่านั้น — route ทั้งหมดเรียกผ่านไฟล์นี้ (saveImage / listImages / readImage / updateMeta / deleteImage)
// มี SUPABASE_URL + key ใน env (เช่นบน Vercel ที่เขียนไฟล์ลงเครื่องไม่ได้) -> เก็บบน Supabase (lib/storage-supabase.ts)
// ไม่มี -> เก็บลงเครื่องแบบเดิม:
//   รูปที่ AI สร้าง -> results/ , รูปที่กด "+ เพิ่มรูป" -> images/uploads/<ประเภท>/ (ที่เดียวกับเวอร์ชัน Python รูปเก่าใช้ต่อได้)
//   แต่ละรูปมีไฟล์ .json คู่กัน เก็บชื่อ/คำอธิบาย/เวลาที่สร้าง
// หน้าเว็บเปิดรูปผ่าน /api/files/... เพราะ public/ ของ Next ไม่เห็นไฟล์ที่เพิ่มตอนรัน (next start)
import 'server-only';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sbDelete, sbList, sbRead, sbSave, sbUpdateMeta, supabaseEnabled } from './storage-supabase';

const ROOT = process.cwd();
const RESULTS_DIR = path.join(ROOT, 'results');
const UPLOADS_DIR = path.join(ROOT, 'images', 'uploads');

export const KINDS = ['models', 'outfits', 'accessories', 'poses', 'scenes'] as const;
export type Kind = (typeof KINDS)[number];
export const isKind = (k: unknown): k is Kind => KINDS.includes(k as Kind);

// เก็บที่ไหน: results = รูปที่สร้าง, uploads = รูปที่เพิ่มเองแยกตามประเภท
export type Where = { area: 'results' } | { area: 'uploads'; kind: Kind };

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const URL_PREFIX = '/api/files/';

const folderOf = (w: Where) => (w.area === 'results' ? RESULTS_DIR : path.join(UPLOADS_DIR, w.kind));
// key = path ของรูป (ชื่อ object บน Supabase ด้วย): results/<ไฟล์> หรือ uploads/<ประเภท>/<ไฟล์>
const keyOf = (w: Where, file: string) => (w.area === 'results' ? 'results' : `uploads/${w.kind}`) + '/' + file;
const urlOf = (w: Where, file: string) =>
  URL_PREFIX + (w.area === 'results' ? 'results' : `uploads/${w.kind}`) + '/' + encodeURIComponent(file);

// ชื่อไฟล์แบบเดิม: 20261006-162628-84c86b (วันเวลาในเครื่อง + สุ่ม)
function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${date}-${randomUUID().replaceAll('-', '').slice(0, 6)}`;
}

export async function saveImage(where: Where, dataB64: string, mime: string, meta: Record<string, unknown>) {
  const name = stamp();
  const file = `${name}.${EXT[mime] ?? 'png'}`;
  if (supabaseEnabled) {
    await sbSave(keyOf(where, file), where.area, where.area === 'uploads' ? where.kind : null, Buffer.from(dataB64, 'base64'), mime, meta);
    return urlOf(where, file);
  }
  const folder = folderOf(where);
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, file), Buffer.from(dataB64, 'base64'));
  await fs.writeFile(path.join(folder, name + '.json'), JSON.stringify({ ...meta, file, created: Date.now() / 1000 }));
  return urlOf(where, file);
}

// set = ชุดภาพหลายมุม: id เดียวกันทั้งชุด + ลำดับในชุด (SET_SHOTS) ไว้จัดกลุ่มในประวัติรูป
export type SetTag = { id: string; index: number };
export type Stored = { src: string; created: number; file: string; name?: string; caption?: string; type?: string; set?: SetTag };

// ใหม่สุดก่อน — ข้ามไฟล์ .json ที่อ่านไม่ได้หรือรูปหายไปแล้ว
export async function listImages(where: Where): Promise<Stored[]> {
  if (supabaseEnabled) {
    const rows = await sbList(where.area, where.area === 'uploads' ? where.kind : null);
    return rows.map((r) => {
      const file = r.path.slice(r.path.lastIndexOf('/') + 1);
      return { ...r.meta, file, created: Date.parse(r.created) / 1000, src: urlOf(where, file) } as Stored;
    });
  }
  const folder = folderOf(where);
  const names = await fs.readdir(folder).catch(() => [] as string[]);
  const items = await Promise.all(names.filter((n) => n.endsWith('.json')).map(async (n) => {
    try {
      const meta = JSON.parse(await fs.readFile(path.join(folder, n), 'utf8'));
      await fs.access(path.join(folder, meta.file));
      return { ...meta, src: urlOf(where, meta.file) } as Stored;
    } catch {
      return null;
    }
  }));
  return items.filter((i): i is Stored => i !== null).sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
}

// path ใน URL (/api/files/<results|uploads/ประเภท>/<ไฟล์>) -> ไฟล์ในเครื่อง; ไม่ใช่รูปของเรา = null
function resolveFile(parts: string[]) {
  let folder: string, file: string | undefined;
  if (parts[0] === 'results' && parts.length === 2) [folder, file] = [RESULTS_DIR, parts[1]];
  else if (parts[0] === 'uploads' && parts.length === 3 && isKind(parts[1])) [folder, file] = [path.join(UPLOADS_DIR, parts[1]), parts[2]];
  else return null;
  if (!file || file.startsWith('.') || /[\\/]/.test(file)) return null;
  const type = MIME[path.extname(file).slice(1).toLowerCase()];
  // turbopackIgnore: รูปเป็นข้อมูลตอนรัน ไม่ใช่ไฟล์ที่ต้องแพ็กตอน build (ไม่ใส่ จะแพ็กทั้งโปรเจกต์ติดไปกับ server)
  return type ? { full: path.join(/*turbopackIgnore: true*/ folder, file), key: [...parts.slice(0, -1), file].join('/'), type } : null;
}

export async function readImage(parts: string[]) {
  const f = resolveFile(parts);
  if (!f) return null;
  const data = supabaseEnabled ? await sbRead(f.key) : await fs.readFile(f.full).catch(() => null);
  return data && { data, type: f.type };
}

// แก้ชื่อ/ประเภทของรูปที่เพิ่มเอง (เขียนทับใน .json คู่กัน) แก้ได้เฉพาะรูปใน images/uploads/ ที่มี .json อยู่แล้ว
export async function updateMeta(src: string, meta: Record<string, string>) {
  if (!src.startsWith(URL_PREFIX + 'uploads/')) return false;
  const f = resolveFile(src.slice(URL_PREFIX.length).split('/').map(decodeURIComponent));
  if (!f) return false;
  if (supabaseEnabled) return sbUpdateMeta(f.key, meta);
  const file = f.full.slice(0, -path.extname(f.full).length) + '.json';
  const old = await fs.readFile(file, 'utf8').then(JSON.parse, () => null);
  if (!old) return false;
  await fs.writeFile(file, JSON.stringify({ ...old, ...meta }));
  return true;
}

// ลบ = ย้ายไปถังขยะ (กู้คืนได้) ลบได้เฉพาะรูปใน results/ กับ images/uploads/ — บน Supabase ลบจริง
export async function deleteImage(src: string) {
  if (!src.startsWith(URL_PREFIX)) return false;
  const f = resolveFile(src.slice(URL_PREFIX.length).split('/').map(decodeURIComponent));
  if (!f) return false;
  if (supabaseEnabled) return sbDelete(f.key);
  const trash = path.join(os.homedir(), '.Trash');
  const hasTrash = await fs.stat(trash).then((s) => s.isDirectory(), () => false);
  for (const p of [f.full, f.full.slice(0, -path.extname(f.full).length) + '.json']) {
    if (!(await fs.access(p).then(() => true, () => false))) continue;
    if (!hasTrash) {
      await fs.unlink(p);
      continue;
    }
    let dest = path.join(trash, path.basename(p));
    if (await fs.access(dest).then(() => true, () => false)) dest = path.join(trash, `${Math.round(Date.now() / 1000)}-${path.basename(p)}`);
    await fs.rename(p, dest).catch(async () => { // คนละ disk -> rename ไม่ได้ ใช้ copy แล้วลบแทน
      await fs.copyFile(p, dest);
      await fs.unlink(p);
    });
  }
  return true;
}
