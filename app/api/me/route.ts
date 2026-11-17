import { createHmac } from 'node:crypto';
import { get, json } from '@/lib/route';
import { isLimited, me } from '@/lib/account';
import { supabaseEnabled } from '@/lib/storage-supabase';
import { accountOf, usedTokens } from '@/lib/usage';

// GA user_id (components/Analytics.tsx): keyed hash (HMAC) of the account id, never the id, email or invite code
// no ANALYTICS_SALT -> no aid (an unkeyed hash of a known id is reversible by anyone holding the id list)
const analyticsId = (id: string | undefined) => {
  const salt = process.env.ANALYTICS_SALT;
  return id && salt ? createHmac('sha256', salt).update(id).digest('hex').slice(0, 32) : undefined;
};

// บัญชีที่เข้าอยู่: หัวเว็บใช้โชว์ปุ่มแอดมิน (superadmin) และแถบโทเคนใช้ไป / ทั้งหมด (ลูกค้า) · หน้าต้อนรับใช้ชื่อลูกค้า (label ที่ admin ตั้ง)
export const GET = get(async () => {
  const account = me();
  const aid = analyticsId(account?.id);
  // account menu: login (code accounts get no change-password item) and the email, never a code account's internal email
  if (!isLimited(account) || !supabaseEnabled) {
    return json(200, { role: account?.role ?? 'customer', aid, ...(account && { login: 'email', email: account.email }) });
  }
  // every limited account (email or code) gets its token bar; first call makes an email account's row
  const row = await accountOf(account!);
  const login = row?.code ? 'code' : 'email';
  return json(200, {
    role: account!.role, aid, login, ...(login === 'email' && { email: account!.email }),
    label: row?.label ?? '', tokenQuota: row?.token_quota ?? 0, tokens: await usedTokens(account!.id),
  });
});
