// proxy.ts — ด่านแรกของทุก request: ต่ออายุ session ใน cookie + ยังไม่เข้าสู่ระบบ (หรือไม่ใช่สมาชิก) ห้ามเข้า
// หน้าเว็บ -> ส่งไปหน้า /login, API -> 401 (route ใน app/api เช็กซ้ำอีกชั้นด้วย isSignedInMember)
// ไม่มี Supabase ใน env -> ปล่อยผ่านทั้งหมด (ดู lib/auth.ts)
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { authEnabled, isMember, posterAllowed, roleOf, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/auth';
import { errorBody } from '@/lib/api-error';
import { serviceClient } from '@/lib/storage-supabase';

// code accounts can't change their password: it is derived from the code. accounts.code says how an account signs in
// (null = email); asked only on /account, read failure = blocked
async function codeAccount(userId: string) {
  const { data, error } = await serviceClient().from('accounts').select('code').eq('user_id', userId).maybeSingle();
  return !!error || data?.code != null;
}

export async function proxy(request: NextRequest) {
  if (!authEnabled) return NextResponse.next();

  // ตามแบบของ Supabase: cookie ที่ต่ออายุแล้วต้องไปทั้ง request (ให้ route เห็น) และ response (ให้ browser เก็บ)
  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const member = isMember(data?.claims);
  const { pathname } = request.nextUrl;

  // ตอบอย่างอื่นแทน response: ต้องพก cookie ที่ต่ออายุ + header กัน cache ไปด้วย ไม่งั้นหลุดจากระบบ
  const carry = (res: NextResponse) => {
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    for (const h of ['cache-control', 'expires', 'pragma']) {
      const v = response.headers.get(h);
      if (v) res.headers.set(h, v);
    }
    return res;
  };
  if (pathname === '/login' || pathname === '/signup')
    return member ? carry(NextResponse.redirect(new URL('/', request.url))) : response;
  // เข้าด้วยโค้ดเชิญ / สมัครใช้งาน: คนที่ยังไม่เข้าสู่ระบบต้องเรียกได้
  if (pathname === '/api/invite-login' || pathname === '/api/signup') return response;
  if (member) {
    const role = roleOf(data?.claims);
    // หน้า admin เฉพาะ superadmin · หน้าโปสเตอร์ (ต้นแบบ 27 พ.ย.) superadmin + POSTER_ACCOUNTS (API เช็กซ้ำ, canUsePoster)
    // · บัญชีที่เข้าด้วยโค้ด เปลี่ยนรหัสผ่านไม่ได้ (เปลี่ยนแล้วโค้ดจะใช้ไม่ได้)
    if (
      ((pathname === '/admin' || pathname.startsWith('/admin/')) && role !== 'superadmin') ||
      (pathname === '/poster' && !posterAllowed(role, String(data!.claims!.sub))) ||
      (pathname === '/account' && (await codeAccount(String(data!.claims!.sub))))
    ) {
      return carry(NextResponse.redirect(new URL('/', request.url)));
    }
    return response;
  }
  if (pathname.startsWith('/api/')) return carry(NextResponse.json(errorBody(401, 'ต้องเข้าสู่ระบบก่อน'), { status: 401 }));
  return carry(NextResponse.redirect(new URL('/login', request.url)));
}

export const config = {
  // ทุกอย่างยกเว้นไฟล์ของ Next เอง (รูปตัวอย่างใน public/ และรูปใน /api/files ก็ต้องเข้าสู่ระบบ)
  matcher: ['/((?!_next/static|_next/image|favicon.ico|apple-icon.png).*)'],
};
