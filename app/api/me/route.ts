import { me } from '@/lib/account';
import { get, json } from '@/lib/route';
import { inviteOf, usedTokens } from '@/lib/usage';

// บัญชีที่เข้าอยู่: หัวเว็บใช้โชว์ปุ่มแอดมิน (superadmin) และแถบโทเคนใช้ไป / ทั้งหมด (ลูกค้า) · หน้าต้อนรับใช้ชื่อลูกค้า (label ที่ admin ตั้ง)
export const GET = get(async () => {
  const account = me();
  if (account?.role !== 'customer') return json(200, { role: account?.role ?? 'team' });
  const invite = await inviteOf(account.id);
  return json(200, { role: 'customer', label: invite?.label ?? '', tokenQuota: invite?.token_quota ?? 0, tokens: await usedTokens(account.id) });
});
