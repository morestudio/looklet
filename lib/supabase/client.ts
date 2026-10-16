// supabase/client.ts — Supabase ฝั่ง browser (หน้าเข้าสู่ระบบ / ออกจากระบบ / เปลี่ยนรหัสผ่าน) ใช้ publishable key เท่านั้น
import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../auth';

export const createClient = () => createBrowserClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!);
