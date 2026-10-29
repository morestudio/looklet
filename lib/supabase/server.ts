// supabase/server.ts — Supabase ฝั่ง server ที่อ่าน/เขียน session ใน cookie (route handler ใช้เช็กว่าใครเรียก)
import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Account } from '../account';
import { authEnabled, isMember, roleOf, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../auth';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // เรียกจากที่ที่เขียน cookie ไม่ได้ — proxy.ts ต่ออายุ session ให้แล้ว
        }
      },
    },
  });
}

// เช็กซ้ำใน API ทุกตัว (proxy.ts กันไว้ชั้นแรกแล้ว) — getClaims ตรวจลายเซ็น token ไม่เชื่อ cookie เฉยๆ
export async function isSignedInMember() {
  return (await signedInAccount()) !== undefined;
}

// บัญชีที่เรียกอยู่: null = ไม่ต้องเข้าสู่ระบบ (ในเครื่อง) · undefined = ยังไม่เข้าสู่ระบบหรือไม่มีสิทธิ์
export async function signedInAccount(): Promise<Account | undefined> {
  if (!authEnabled) return null;
  const { data } = await (await createClient()).auth.getClaims();
  const claims = data?.claims;
  if (!isMember(claims)) return undefined;
  return { id: String(claims!.sub), email: String(claims!.email ?? ''), role: roleOf(claims) };
}
