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

const appMeta = (claims: JwtPayload | null | undefined) => claims?.app_metadata as Record<string, unknown> | undefined;

// สมาชิก = บัญชีที่ admin เปิดสิทธิ์ให้ (app_metadata.looklet = true ตั้งด้วย secret key เท่านั้น)
// สมัครเองผ่าน Supabase API ได้บัญชีก็จริง แต่ไม่มีสิทธิ์นี้ เข้าเว็บไม่ได้ — ห้ามใช้ user_metadata (ผู้ใช้แก้เองได้)
export const isMember = (claims: JwtPayload | null | undefined) => appMeta(claims)?.looklet === true;

// role = what the account may do (app_metadata.role, set with the secret key only), 16 Nov: no "team" any more
// superadmin = /admin, audit, no quota · customer = everyone else, whichever way they sign in
export type Role = 'superadmin' | 'customer';
export const roleOf = (claims: JwtPayload | null | undefined): Role =>
  appMeta(claims)?.role === 'superadmin' ? 'superadmin' : 'customer';
// หน้าโปสเตอร์ (ต้นแบบ): superadmin + บัญชีในรายการนี้ (ผู้ใช้ 27 พ.ย.: เพิ่ม Tae Morestudio) · ใช้ใน proxy.ts, canUsePoster, /api/me
export const POSTER_ACCOUNTS = ['23c15a27-89f5-4309-9d97-a089c76fc898']; // Tae Morestudio (บัญชีโค้ดเชิญ)
export const posterAllowed = (role: Role, id: string | undefined) =>
  role === 'superadmin' || (!!id && POSTER_ACCOUNTS.includes(id));
// how an account signs in (code or email) is not stored here: accounts.code says it (null = email + password)
