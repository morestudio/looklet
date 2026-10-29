import { authEnabled } from '@/lib/auth';
import { invitePassword, normalizeInviteCode } from '@/lib/invites';
import { json } from '@/lib/route';
import { serviceClient, supabaseEnabled } from '@/lib/storage-supabase';
import { createClient } from '@/lib/supabase/server';

// เข้าใช้ด้วยโค้ดเชิญ (หน้า /login) — เปิดให้คนที่ยังไม่เข้าสู่ระบบเรียกได้ (proxy.ts) จึงไม่ใช้ post() ที่ต้อง login ก่อน
// โค้ดถูก + ยังไม่ถูกปิด -> เข้าระบบเป็นบัญชีของโค้ดนั้น (cookie session แบบเดียวกับเข้าด้วยอีเมล)
const WRONG = 'โค้ดไม่ถูกต้อง หรือถูกปิดการใช้งานแล้ว';

export async function POST(req: Request) {
  try {
    if (!authEnabled || !supabaseEnabled) return json(400, { error: 'เว็บนี้ไม่ได้เปิดระบบโค้ดเชิญ' });
    const code = normalizeInviteCode((await req.json().catch(() => ({})))?.code);
    if (!code) return json(400, { error: 'โค้ดเชิญมี 8 ตัว เช่น ABCD-2345' });
    const { data: invite, error } = await serviceClient().from('invites').select('user_id, disabled').eq('code', code).maybeSingle();
    if (error) throw new Error(error.message);
    if (!invite || invite.disabled) return json(401, { error: WRONG });
    const { data: found } = await serviceClient().auth.admin.getUserById(invite.user_id);
    if (!found.user?.email) return json(401, { error: WRONG });
    const { error: signInError } = await (await createClient()).auth.signInWithPassword({ email: found.user.email, password: invitePassword(code) });
    if (signInError) return json(401, { error: WRONG });
    return json(200, { ok: true });
  } catch (e) {
    return json(500, { error: 'เข้าใช้ไม่สำเร็จ: ' + (e as Error).message });
  }
}
