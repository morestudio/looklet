// account.ts — ใครเรียก API อยู่ (ใช้ฝั่ง server) post()/get() ใน lib/route.ts ตั้งค่าให้ทุก request
// storage / usage อ่านจากที่นี่ ไม่ต้องส่งต่อกันทุกฟังก์ชัน (interface ของ lib/storage.ts คงเดิม)
import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from './auth';

// null = ไม่ต้องเข้าสู่ระบบ (ไม่มี Supabase หรือ dev ไม่ต้อง login) = ใช้งานแบบทีม
export type Account = { id: string; email: string; role: Role } | null;

const store = new AsyncLocalStorage<Account>();
export const withAccount = <T>(account: Account, fn: () => T) => store.run(account, fn);
export const me = (): Account => store.getStore() ?? null;
export const isCustomer = (a: Account = me()) => a?.role === 'customer';
export const isSuperadmin = (a: Account = me()) => !a || a.role === 'superadmin'; // ไม่มีระบบ login (ในเครื่อง) = เปิดหน้า admin ได้

// ลูกค้าเห็นเฉพาะรูปที่ตัวเองสร้าง/อัปโหลด (meta.owner = id) · ทีมเห็นคลังเดิมที่ไม่มีเจ้าของ (รูปทั้งหมดก่อน 27 ต.ค. + รูปของทีม)
export const visibleTo = (meta: Record<string, unknown> | null | undefined, a: Account = me()) =>
  isCustomer(a) ? meta?.owner === a!.id : !meta?.owner;
// รูปใหม่ของลูกค้าติดชื่อเจ้าของ · ของทีมไม่ติด (ยังเป็นคลังร่วมแบบเดิม)
export const ownerMeta = (a: Account = me()) => (isCustomer(a) ? { owner: a!.id } : {});
