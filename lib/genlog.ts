// genlog.ts — บันทึกสิ่งที่ส่งให้ AI ทุกครั้งที่เจนรูป (สำเร็จหรือพังก็บันทึก) ใช้ฝั่ง server เท่านั้น ไม่โชว์ในหน้าเว็บ
// 1 รูป = 1 ไฟล์ใน logs/ (JSON จัดย่อหน้า เปิดใน VS Code แล้วพับ/กางทีละ section ได้)
//   ชื่อไฟล์ = ชื่อรูปผลลัพธ์: results/20261015-152904-f43438.jpg -> logs/20261015-152904-f43438.json
//   สร้างไม่สำเร็จ (ไม่มีรูป) -> logs/<วันเวลา>-<สุ่ม>-error.json
//   ai = โมเดล AI + ค่าที่ส่ง | model = นางแบบ | element = ชุด / ของเสริม / ฉาก | pose = ท่าโพสต์ | set = ชุดภาพหลายมุม | style = แสง / กล้อง / พร็อพ
//   image = ลำดับรูปที่ AI เห็น (Image n ในพรอมต์), file = รูปต้นฉบับ, sent = ขนาดที่ส่งจริงหลังย่อ
//   prompt = ทีละประโยค (ต่อกันด้วยช่องว่าง 1 ตัว = ข้อความที่ส่งจริง), result = รูปผลลัพธ์ (/api/files/results/...)
import 'server-only';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

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
    outfit: LogImage | string; // 'ชุดเดิม' = ไม่ได้เปลี่ยนชุด
    accessories: LogImage[];
    scene: LogImage | { name?: string; text: string } | string; // รูปฉาก / ฉากแบบคำบรรยาย / 'ฉากเดิม'
  };
  pose: { mode: string; moment?: string; plan_th?: string; plan_en?: string } & Partial<LogImage>; // moment = จังหวะที่สุ่มให้ท่าสำเร็จรูป // plan = ท่าที่ AI ตัววางแผนคิด (ท่าสำเร็จรูป)
  set?: { shot: string } & Partial<LogImage>; // ชุดภาพหลายมุม: มุมของรูปนี้ + รูปหลักที่ใช้เป็นต้นแบบ
  style: Record<string, string | string[] | boolean>;
  prompt: string[];
  harmonizePrompt?: string[]; // รอบสอง: ส่งรูปที่ได้จากรอบแรกรูปเดียว + พรอมต์นี้
};

const LOG_DIR = path.join(process.cwd(), 'logs');

// พรอมต์ยาวบรรทัดเดียว -> ทีละประโยค (join(' ') ได้ข้อความเดิมเป๊ะ)
export const sentences = (text: string) => text.split(/(?<=\.) (?=[A-Z])/);
export const localTime = (d = new Date()) => d.toLocaleString('sv-SE'); // "2026-10-15 15:02:11" ตามเวลาเครื่อง

// ชื่อไฟล์ log: ตามชื่อรูปผลลัพธ์ / ไม่มีรูป = วันเวลาเดียวกับรูปแบบชื่อรูป + สุ่ม + "-error"
function logName(entry: GenerateLog) {
  if (entry.result) return path.basename(entry.result).replace(/\.[^.]+$/, '');
  const stamp = entry.time.replace(/[-:]/g, '').replace(' ', '-'); // "2026-10-15 15:30:12" -> "20261015-153012"
  return `${stamp}-${randomUUID().replaceAll('-', '').slice(0, 6)}-error`;
}

export async function writeGenerateLog(entry: GenerateLog) {
  const file = path.join(LOG_DIR, logName(entry) + '.json');
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    await fs.writeFile(file, JSON.stringify(entry, null, 2) + '\n');
  } catch (e) {
    console.error('เขียน log ไม่สำเร็จ', e); // log พังห้ามทำให้การเจนรูปพัง
  }
  console.log(`[generate] ${entry.status} · ${entry.ai.model} · ${entry.duration}`
    + `${entry.error ? ' · ' + entry.error : ''} (log: logs/${path.basename(file)})`);
}
