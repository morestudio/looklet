// auth.ts — ใครเข้าเว็บได้ (ใช้ได้ทั้ง server และ browser)
// มี Supabase (NEXT_PUBLIC_SUPABASE_URL + publishable key) -> ต้องเข้าสู่ระบบด้วยอีเมล + รหัสผ่านก่อนใช้ทุกหน้า/ทุก API
// ไม่มี -> ไม่ต้องเข้าสู่ระบบ (รันในเครื่อง เปิดได้เฉพาะเครื่องนี้อยู่แล้ว)
import type { JwtPayload } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const authEnabled = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

// สมาชิก = บัญชีที่ admin เปิดสิทธิ์ให้ (app_metadata.looklet = true ตั้งด้วย secret key เท่านั้น)
// สมัครเองผ่าน Supabase API ได้บัญชีก็จริง แต่ไม่มีสิทธิ์นี้ เข้าเว็บไม่ได้ — ห้ามใช้ user_metadata (ผู้ใช้แก้เองได้)
export const isMember = (claims: JwtPayload | null | undefined) =>
  (claims?.app_metadata as Record<string, unknown> | undefined)?.looklet === true;
