import { createHmac } from 'node:crypto';
import { me } from '@/lib/account';
import { get, json } from '@/lib/route';
import { inviteOf, usedTokens } from '@/lib/usage';

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
  if (account?.role !== 'customer') return json(200, { role: account?.role ?? 'team', aid });
  const invite = await inviteOf(account.id);
  return json(200, { role: 'customer', aid, label: invite?.label ?? '', tokenQuota: invite?.token_quota ?? 0, tokens: await usedTokens(account.id) });
});
