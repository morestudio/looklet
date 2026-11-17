import { authEnabled } from '@/lib/auth';
import { errorResponse, json } from '@/lib/route';
import { serviceClient, supabaseEnabled } from '@/lib/storage-supabase';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_TOKEN_QUOTA } from '@/lib/usage';

// sign-up (/signup, 17 Nov): public in proxy.ts, so no post(). Makes an auth user without the looklet flag (the proxy keeps
// it out) plus a pending accounts row; a superadmin approves or removes it at /admin. No email is sent: the user is created
// confirmed with the secret key, so Supabase's own sign-up can stay off. Email confirmation can come later (needs SMTP).
export const MAX_PENDING = 50; // more waiting requests than this = sign-up closed until /admin clears some (bot flood cap)

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    if (!authEnabled || !supabaseEnabled) return errorResponse(400, 'เว็บนี้ไม่ได้เปิดระบบสมัครใช้งาน');
    const body = await req.json().catch(() => ({}));
    // honeypot: a field people never see; bots fill every input. Pretend it worked so they don't retry differently
    if (clean(body?.website, 200)) return json(200, { ok: true });
    const email = clean(body?.email, 254).toLowerCase();
    const password = typeof body?.password === 'string' ? body.password : '';
    const label = clean(body?.shop, 80);
    const phone = clean(body?.phone, 30);
    const line = clean(body?.line, 50);
    if (!EMAIL.test(email)) return errorResponse(400, 'อีเมลไม่ถูกต้อง');
    if (password.length < 10 || password.length > 72) return errorResponse(400, 'รหัสผ่านต้องยาว 10–72 ตัว');
    if (!label) return errorResponse(400, 'กรอกชื่อร้านหรือแบรนด์');
    if (!/^\d{9,15}$/.test(phone.replace(/[\s\-()+.]/g, ''))) return errorResponse(400, 'เบอร์โทรไม่ถูกต้อง');

    const sb = serviceClient();
    const { count, error: countError } = await sb
      .from('accounts')
      .select('user_id', { count: 'exact', head: true })
      .eq('pending', true);
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) >= MAX_PENDING) return errorResponse(503, 'ปิดรับสมัครชั่วคราว ลองใหม่ภายหลัง');

    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
    if (error?.code === 'email_exists') return errorResponse(409, 'อีเมลนี้มีบัญชีอยู่แล้ว ลองเข้าสู่ระบบ หรือติดต่อผู้ดูแล');
    if (error?.code === 'weak_password') return errorResponse(400, 'รหัสผ่านง่ายเกินไป ลองตั้งให้ยากขึ้น');
    if (error || !data.user) throw new Error(error?.message ?? 'no user');
    const row = {
      user_id: data.user.id,
      code: null,
      label,
      token_quota: DEFAULT_TOKEN_QUOTA,
      pending: true,
      phone,
      line: line || null,
    };
    const { error: rowError } = await sb.from('accounts').insert(row);
    if (rowError) {
      await sb.auth.admin.deleteUser(data.user.id); // no row = nobody would ever see this request
      throw new Error(rowError.message);
    }
    return json(200, { ok: true });
  } catch (e) {
    return errorResponse(500, 'สมัครไม่สำเร็จ: ' + (e as Error).message);
  }
}

// the login form asks this after a password sign-in that isn't a member yet: still waiting, or not allowed at all
export async function GET() {
  try {
    if (!authEnabled || !supabaseEnabled) return json(200, { pending: false });
    const { data } = await (await createClient()).auth.getClaims();
    const id = data?.claims?.sub;
    if (!id) return json(200, { pending: false });
    const { data: row } = await serviceClient()
      .from('accounts')
      .select('pending')
      .eq('user_id', String(id))
      .maybeSingle();
    return json(200, { pending: row?.pending === true });
  } catch {
    return json(200, { pending: false });
  }
}
