// auth.ts — ใครเข้าเว็บได้ (ใช้ได้ทั้ง server และ browser)
// มี Supabase (NEXT_PUBLIC_SUPABASE_URL + publishable key) -> ต้องเข้าสู่ระบบด้วยอีเมล + รหัสผ่านก่อนใช้ทุกหน้า/ทุก API
// ไม่มี -> ไม่ต้องเข้าสู่ระบบ (รันในเครื่อง เปิดได้เฉพาะเครื่องนี้อยู่แล้ว)
import type { JwtPayload } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
// ทดสอบในเครื่องไม่ต้องเข้าสู่ระบบ: NEXT_PUBLIC_LOOKLET_DEV_NO_LOGIN=1 ใน .env.development.local (next โหลดไฟล์นี้เฉพาะตอน npm run dev
// และ vercel env pull ไม่เขียนทับ) — มีผลเฉพาะ NODE_ENV=development บน Vercel (production/preview) ต้องเข้าสู่ระบบเสมอ
// dev server เปิดแค่ 127.0.0.1 คนอื่นในเครือข่ายเข้าไม่ได้ · ยังเก็บรูปบน Supabase ชุดเดียวกับเว็บจริง
const devNoLogin = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_LOOKLET_DEV_NO_LOGIN === '1';
export const authEnabled = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY) && !devNoLogin;

// สมาชิก = บัญชีที่ admin เปิดสิทธิ์ให้ (app_metadata.looklet = true ตั้งด้วย secret key เท่านั้น)
// สมัครเองผ่าน Supabase API ได้บัญชีก็จริง แต่ไม่มีสิทธิ์นี้ เข้าเว็บไม่ได้ — ห้ามใช้ user_metadata (ผู้ใช้แก้เองได้)
export const isMember = (claims: JwtPayload | null | undefined) =>
  (claims?.app_metadata as Record<string, unknown> | undefined)?.looklet === true;

// บทบาท (app_metadata.role ตั้งด้วย secret key เท่านั้น): superadmin = ดูการใช้งาน/ออกโค้ดเชิญที่ /admin,
// customer = ลูกค้าที่เข้าด้วยโค้ดเชิญ (เห็นเฉพาะรูปของตัวเอง มีโควตา), team = บัญชีทีมเดิม (คลังรูปร่วมกัน)
export type Role = 'superadmin' | 'customer' | 'team';
export const roleOf = (claims: JwtPayload | null | undefined): Role => {
  const role = (claims?.app_metadata as Record<string, unknown> | undefined)?.role;
  return role === 'superadmin' || role === 'customer' ? role : 'team';
};
