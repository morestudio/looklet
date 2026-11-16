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
export const isCustomer = (a: Account = me()) => a?.role === 'customer'; // signs in with an invite code
export const isSuperadmin = (a: Account = me()) => !a || a.role === 'superadmin'; // ไม่มีระบบ login (ในเครื่อง) = เปิดหน้า admin ได้

// token quota applies to every signed-in account except superadmin
export const isLimited = (a: Account = me()) => !!a && a.role !== 'superadmin';

// every signed-in account sees only its own images (meta.owner = id); email and code accounts alike (16 Nov)
// owner-less rows (old team library, team/ folder) are hidden from everyone signed in; superadmin can still open them by path (audit)
// no login (local, no Supabase) = owner-less files only
export const visibleTo = (meta: Record<string, unknown> | null | undefined, a: Account = me()) =>
  a ? meta?.owner === a.id : !meta?.owner;
export const ownerMeta = (a: Account = me()) => (a ? { owner: a.id } : {});
