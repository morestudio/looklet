import { isSuperadmin, me } from '@/lib/account';
import { inviteEmail, invitePassword, newInviteCode } from '@/lib/invites';
import { errorResponse, get, json, post } from '@/lib/route';
import { serviceClient, supabaseEnabled } from '@/lib/storage-supabase';
import { DEFAULT_TOKEN_QUOTA, tokensOf, type AccountRow } from '@/lib/usage';

// หน้า /admin (superadmin เท่านั้น): สรุปการใช้งานต่อบัญชี + ออกโค้ดเชิญ + แก้ชื่อ/โควตา/ปิดบัญชี — ตาราง accounts / usage ใน supabase/schema.sql
// accounts = every account (code or email); pending rows (sign-ups at /signup) are listed apart until approved or removed
type UsageRow = { user_id: string | null; email: string | null; page: string; action: string; status: string; cost_thb: number | string; tokens: number | null; created: string };
// measured / measuredTokens = เฉพาะรูปที่รู้โทเคนจริง (ไว้หาค่าเฉลี่ยต่อรูปโดยไม่ปนค่าประมาณ)
type Tally = { ok: number; error: number; cost: number; tokens: number; measured: number; measuredTokens: number; model: number; product: number; last: string | null };
const tally = (): Tally => ({ ok: 0, error: 0, cost: 0, tokens: 0, measured: 0, measuredTokens: 0, model: 0, product: 0, last: null });
function add(t: Tally, r: UsageRow) {
  if (r.status === 'ok') {
    t.ok++;
    if (r.page === 'product') t.product++; else t.model++;
    if (r.tokens != null) { t.measured++; t.measuredTokens += r.tokens; }
  } else t.error++;
  t.cost += Number(r.cost_thb) || 0;
  t.tokens += tokensOf(r);
  if (!t.last || r.created > t.last) t.last = r.created;
}

// โควตาโทเคนต่อโค้ด (คอลัมน์ int ใน Postgres) ไม่เกิน 100 ล้าน
const validTokenQuota = (n: number) => Number.isInteger(n) && n >= 0 && n <= 100_000_000;
const TOKEN_QUOTA_ERROR = 'โควตาโทเคนต้องเป็นจำนวนเต็ม 0–100,000,000';

const denied = () => (isSuperadmin(me()) ? (supabaseEnabled ? null : errorResponse(400, 'หน้า admin ต้องใช้ Supabase')) : errorResponse(403, 'เฉพาะ superadmin'));

export const GET = get(async () => {
  const no = denied();
  if (no) return no;
  const sb = serviceClient();
  const [usage, invites] = await Promise.all([
    sb.from('usage').select('user_id, email, page, action, status, cost_thb, tokens, created').order('created', { ascending: false }).limit(5000),
    sb.from('accounts').select('*').order('created', { ascending: true }),
  ]);
  if (usage.error || invites.error) throw new Error((usage.error ?? invites.error)!.message);
  const rows = usage.data as UsageRow[];
  const all = invites.data as AccountRow[];
  const list = all.filter((i) => !i.pending);
  // sign-ups waiting (at most MAX_PENDING): their email lives in auth only
  const waiting = await Promise.all(all.filter((i) => i.pending).map(async (i) => {
    const { data } = await sb.auth.admin.getUserById(i.user_id);
    return { userId: i.user_id, label: i.label, email: data.user?.email ?? '', phone: i.phone ?? '', line: i.line ?? '', created: i.created };
  }));
  const byUser = new Map<string, Tally>();
  const team = new Map<string, Tally>();
  const total = tally();
  for (const r of rows) {
    add(total, r);
    const customer = list.some((i) => i.user_id === r.user_id);
    const map = customer ? byUser : team;
    const key = customer ? r.user_id! : r.email ?? 'ไม่ทราบ';
    if (!map.has(key)) map.set(key, tally());
    add(map.get(key)!, r);
  }
  const labelOf = new Map(list.map((i) => [i.user_id, i.label || i.code || '']));
  return json(200, {
    total,
    pending: waiting.reverse(), // newest first
    invites: list.map((i) => ({ userId: i.user_id, code: i.code, label: i.label, tokenQuota: i.token_quota, disabled: i.disabled, created: i.created, ...(byUser.get(i.user_id) ?? tally()) })),
    team: [...team].map(([email, t]) => ({ email, ...t })),
    recent: rows.slice(0, 40).map((r) => ({
      created: r.created, who: (r.user_id && labelOf.get(r.user_id)) || r.email || 'ไม่ทราบ', page: r.page, action: r.action, status: r.status, cost: Number(r.cost_thb) || 0,
      tokens: r.tokens, // null = ไม่รู้ (รูปก่อนเริ่มนับโทเคน)
    })),
  });
});

export const POST = post(async (req) => {
  const no = denied();
  if (no) return no;
  const sb = serviceClient();
  if (req.action === 'create') {
    const count = Number(req.count);
    const tokenQuota = req.tokenQuota == null ? DEFAULT_TOKEN_QUOTA : Number(req.tokenQuota);
    if (!Number.isInteger(count) || count < 1 || count > 20) return errorResponse(400, 'สร้างได้ครั้งละ 1–20 โค้ด');
    if (!validTokenQuota(tokenQuota)) return errorResponse(400, TOKEN_QUOTA_ERROR);
    const codes: string[] = [];
    for (let n = 0; n < count; n++) {
      const code = newInviteCode();
      const created = await sb.auth.admin.createUser({
        email: inviteEmail(), password: invitePassword(code), email_confirm: true, app_metadata: { looklet: true },
      });
      if (created.error || !created.data.user) return errorResponse(500, 'สร้างบัญชีไม่สำเร็จ: ' + created.error?.message, { extra: { codes } });
      const row = await sb.from('accounts').insert({ code, user_id: created.data.user.id, token_quota: tokenQuota, label: typeof req.label === 'string' ? req.label.trim().slice(0, 80) : '' });
      if (row.error) {
        await sb.auth.admin.deleteUser(created.data.user.id); // ไม่มีแถวโค้ด = บัญชีนี้ใช้ไม่ได้ ลบทิ้งไม่ให้ค้าง
        return errorResponse(500, 'บันทึกโค้ดไม่สำเร็จ: ' + row.error.message, { extra: { codes } });
      }
      codes.push(code);
    }
    return json(200, { codes });
  }
  if (req.action === 'update') {
    const { data: invite } = await sb.from('accounts').select('*').eq('user_id', String(req.userId)).maybeSingle();
    if (!invite) return errorResponse(404, 'ไม่พบบัญชีนี้');
    const patch: Partial<AccountRow> = {};
    if (typeof req.label === 'string') patch.label = req.label.trim().slice(0, 80);
    if (req.tokenQuota != null) {
      const tokenQuota = Number(req.tokenQuota);
      if (!validTokenQuota(tokenQuota)) return errorResponse(400, TOKEN_QUOTA_ERROR);
      patch.token_quota = tokenQuota;
    }
    if (typeof req.disabled === 'boolean' && req.disabled !== invite.disabled) {
      patch.disabled = req.disabled;
      // ปิด = ถอดสิทธิ์ + แบนไม่ให้ต่ออายุ session (token เดิมยังใช้ได้จนหมดอายุ ~1 ชม. แต่สร้างรูปไม่ได้ทันที: quotaBlock เช็ก disabled)
      // only looklet: Supabase merges app_metadata keys, so the stored role stays (checked on local Supabase 16 Nov)
      const { error } = await sb.auth.admin.updateUserById(invite.user_id, {
        app_metadata: { looklet: !req.disabled }, ban_duration: req.disabled ? '876000h' : 'none',
      });
      if (error) return errorResponse(500, 'เปลี่ยนสถานะบัญชีไม่สำเร็จ: ' + error.message);
    }
    const { error } = await sb.from('accounts').update(patch).eq('user_id', invite.user_id);
    if (error) return errorResponse(500, 'แก้บัญชีไม่สำเร็จ: ' + error.message);
    return json(200, { ok: true });
  }
  // sign-ups (/signup): only pending rows, so these two can never touch a live account
  if (req.action === 'approve' || req.action === 'remove') {
    const { data: row } = await sb.from('accounts').select('*').eq('user_id', String(req.userId)).maybeSingle();
    if (!row?.pending) return errorResponse(404, 'ไม่พบคำขอนี้ (อาจอนุมัติหรือลบไปแล้ว)');
    if (req.action === 'approve') {
      const tokenQuota = req.tokenQuota == null ? DEFAULT_TOKEN_QUOTA : Number(req.tokenQuota);
      if (!validTokenQuota(tokenQuota)) return errorResponse(400, TOKEN_QUOTA_ERROR);
      // member flag first: if the row update then fails the row stays pending (quotaBlock still blocks) and approve can be retried
      const { error } = await sb.auth.admin.updateUserById(row.user_id, { app_metadata: { looklet: true } });
      if (error) return errorResponse(500, 'อนุมัติไม่สำเร็จ: ' + error.message);
      const { error: rowError } = await sb.from('accounts').update({ pending: false, token_quota: tokenQuota }).eq('user_id', row.user_id);
      if (rowError) return errorResponse(500, 'อนุมัติไม่สำเร็จ: ' + rowError.message);
      return json(200, { ok: true });
    }
    // remove: the person's data goes too (PDPA: nothing kept about someone we don't serve)
    const { error } = await sb.auth.admin.deleteUser(row.user_id);
    if (error && error.status !== 404) return errorResponse(500, 'ลบไม่สำเร็จ: ' + error.message);
    const { error: rowError } = await sb.from('accounts').delete().eq('user_id', row.user_id);
    if (rowError) return errorResponse(500, 'ลบไม่สำเร็จ: ' + rowError.message);
    return json(200, { ok: true });
  }
  return errorResponse(400, 'ไม่มีคำสั่งนี้');
});
