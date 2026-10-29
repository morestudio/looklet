// invites.ts — โค้ดเชิญลูกค้า: 1 โค้ด = 1 บัญชี (ลูกค้าพิมพ์แค่โค้ดก็เข้าใช้ได้ ไม่มีอีเมล/รหัสผ่านให้จำ)
// บัญชีจริงอยู่ใน Supabase auth: อีเมลภายใน (ไม่มีใครส่งเมลไปจริง) + รหัสผ่านที่ได้จากโค้ด server จึงเข้าระบบแทนลูกค้าได้
import 'server-only';
import { randomInt } from 'node:crypto';

// ไม่มีตัวที่อ่านสับสน (0/O, 1/I/L) · 8 ตัว = 31^8 ≈ 8.5 แสนล้านแบบ เดาไม่ได้
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newInviteCode = () => {
  const s = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `${s.slice(0, 4)}-${s.slice(4)}`;
};
// ลูกค้าพิมพ์ตัวเล็ก/เว้นวรรค/ไม่ใส่ขีดก็ได้ -> "ABCD-EFGH" · ไม่ใช่รูปแบบโค้ด = null
export function normalizeInviteCode(input: unknown) {
  const s = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === 8 && [...s].every((c) => ALPHABET.includes(c)) ? `${s.slice(0, 4)}-${s.slice(4)}` : null;
}
// รหัสผ่านของบัญชีโค้ดเชิญ: มีตัวใหญ่ ตัวเล็ก ตัวเลข สัญลักษณ์ ผ่านกฎรหัสผ่านของ Supabase · ความลับจริงคือตัวโค้ด
export const invitePassword = (code: string) => `Looklet!${code}#9`;
// อีเมลภายในของบัญชีลูกค้า (ไม่เกี่ยวกับโค้ด ดูรายชื่อบัญชีแล้วเดาโค้ดไม่ได้)
export const inviteEmail = () => `looklet+guest-${randomInt(36 ** 6).toString(36).padStart(6, '0')}@morestudio.co.th`;
