// supabase/server.ts — Supabase ฝั่ง server ที่อ่าน/เขียน session ใน cookie (route handler ใช้เช็กว่าใครเรียก)
import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { authEnabled, isMember, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../auth';

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
  if (!authEnabled) return true;
  const { data } = await (await createClient()).auth.getClaims();
  return isMember(data?.claims);
}
