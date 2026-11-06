// genlog.ts — บันทึกสิ่งที่ส่งให้ AI ทุกครั้งที่เจนรูป (สำเร็จหรือพังก็บันทึก) ใช้ฝั่ง server เท่านั้น ไม่โชว์ในหน้าเว็บของลูกค้า
// (เก็บซ้ำในตาราง usage ด้วย recordUsage: superadmin ดูได้ที่หน้าตรวจงาน /admin/audit เพราะไฟล์ logs/ บน Vercel หาย)
// 1 รูป = 1 ไฟล์ใน logs/ (JSON จัดย่อหน้า เปิดใน VS Code แล้วพับ/กางทีละ section ได้)
//   ชื่อไฟล์ = ชื่อรูปผลลัพธ์: results/20261015-152904-f43438.jpg -> logs/20261015-152904-f43438.json
//   สร้างไม่สำเร็จ (ไม่มีรูป) -> logs/<วันเวลา>-<สุ่ม>-error.json
//   (หน้าสินค้าใช้ PackshotLog ข้างล่าง ชื่อไฟล์แบบเดียวกัน)
//   ai = โมเดล AI + ค่าที่ส่ง | model = นางแบบ | element = ชุด / ของเสริม / ฉาก | pose = ท่าโพสต์ | set = ชุดภาพหลายมุม | style = แสง / กล้อง / พร็อพ
//   image = ลำดับรูปที่ AI เห็น (Image n ในพรอมต์), file = รูปต้นฉบับ, sent = ขนาดที่ส่งจริงหลังย่อ
//   prompt = ทีละประโยค (ต่อกันด้วยช่องว่าง 1 ตัว = ข้อความที่ส่งจริง), result = รูปผลลัพธ์ (/api/files/results/...)
import 'server-only';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { DirectorPlan, StoredPosePlan } from './photo-director';

export type LogImage = { image: number; name?: string; type?: string; file?: string; sent: string };
export type GenerateLog = {
  time: string;
  status: 'สำเร็จ' | 'พัง';
  duration: string;
  result?: string;
  error?: string;
  ai: { model: string; params: Record<string, string> };
  model: LogImage;
  element: {
    outfit: LogImage | string; // 'ชุดเดิม' = ไม่ได้เปลี่ยนชุด · 'เปลี่ยนแยกชิ้น' = ดู top / bottom / shoes
    top?: LogImage; bottom?: LogImage; shoes?: LogImage; // เสื้อผ้าแยกชิ้น (ขั้นเสื้อผ้า 29 ต.ค.)
    accessories: LogImage[];
    scene: LogImage | { name?: string; text: string } | string; // รูปฉาก / ฉากแบบคำบรรยาย / 'ฉากเดิม'
  };
  pose: { mode: string; moment?: string; headGaze?: string; plan_th?: string; plan_en?: string; director?: DirectorPlan } & Partial<LogImage>; // headGaze = ทิศหน้า/สายตาที่สุ่ม (HEAD_GAZES)
  delivery?: StoredPosePlan | null;
  set?: { shot: string } & Partial<LogImage>; // ชุดภาพหลายมุม: มุมของรูปนี้ + รูปหลักที่ใช้เป็นต้นแบบ
  style: Record<string, string | string[] | boolean>;
  prompt: string[];
  harmonizePrompt?: string[]; // รอบสอง: ส่งรูปที่ได้จากรอบแรกรูปเดียว + พรอมต์นี้
  roomPrompt?: string[]; // ห้องของฉัน ขั้น 1: ส่งรูปห้อง (Image 1) + รูปท่าที่ตัดแล้ว (Image 2) + พรอมต์นี้ -> ฉากใหม่ (ส่งต่อเป็นรูปฉากของพรอมต์หลัก)
};

// หน้าสินค้า (app/api/packshot): product = รูปสินค้า | element = ฉาก / ช็อตต้นแบบ / พร็อพ | set = ชุดภาพสินค้า | style = สไตล์ แสง กล้อง ระยะ
export type PackshotLog = {
  time: string;
  status: 'สำเร็จ' | 'พัง';
  duration: string;
  result?: string;
  error?: string;
  page: 'สินค้า';
  ai: { model: string; params: Record<string, string> };
  product: LogImage;
  element: {
    set: LogImage | { name?: string; text: string } | string; // รูปฉาก / ฉากแบบคำบรรยาย / 'ตามช็อตต้นแบบ'
    reference?: { mode: string } & Partial<LogImage>; // ช็อตต้นแบบ + เอาอะไรจากรูปนั้น
    props: { style: string; moment?: string; plan_th?: string; plan_en?: string; own?: string; image?: LogImage }; // own/image = พร็อพของฉัน
  };
  set?: { shot: string } & Partial<LogImage>;
  supports?: LogImage[]; // รูปสินค้าเพิ่มเติม (มุมอื่น) ที่ส่งไปต่อท้าย
  angleGuide?: LogImage; // ตั้งมุมเอง: ภาพไกด์มุม (ตัวแทนสามมิติ) ที่ server วาดเอง ไม่ได้เก็บไฟล์
  style: Record<string, string | string[] | boolean>;
  prompt: string[];
};

const LOG_DIR = path.join(process.cwd(), 'logs');

// พรอมต์ยาวบรรทัดเดียว -> ทีละประโยค (join(' ') ได้ข้อความเดิมเป๊ะ)
export const sentences = (text: string) => text.split(/(?<=\.) (?=[A-Z])/);
export const localTime = (d = new Date()) => d.toLocaleString('sv-SE'); // "2026-10-15 15:02:11" ตามเวลาเครื่อง

// ชื่อไฟล์ log: ตามชื่อรูปผลลัพธ์ / ไม่มีรูป = วันเวลาเดียวกับรูปแบบชื่อรูป + สุ่ม + "-error"
function logName(entry: GenerateLog | PackshotLog) {
  if (entry.result) return path.basename(entry.result).replace(/\.[^.]+$/, '');
  const stamp = entry.time.replace(/[-:]/g, '').replace(' ', '-'); // "2026-10-15 15:30:12" -> "20261015-153012"
  return `${stamp}-${randomUUID().replaceAll('-', '').slice(0, 6)}-error`;
}

// คืน entry เดิม ให้ route ส่งต่อไปเก็บกับแถวการใช้งาน (recordUsage -> หน้าตรวจงาน /admin/audit)
export async function writeGenerateLog<T extends GenerateLog | PackshotLog>(entry: T): Promise<T> {
  const file = path.join(LOG_DIR, logName(entry) + '.json');
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    await fs.writeFile(file, JSON.stringify(entry, null, 2) + '\n');
  } catch (e) {
    console.error('เขียน log ไม่สำเร็จ', e); // log พังห้ามทำให้การเจนรูปพัง
  }
  console.log(`[generate] ${entry.status} · ${entry.ai.model} · ${entry.duration}`
    + `${entry.error ? ' · ' + entry.error : ''} (log: logs/${path.basename(file)})`);
  return entry;
}
