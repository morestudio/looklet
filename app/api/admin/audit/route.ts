import { isSuperadmin, me } from '@/lib/account';
import { get, json } from '@/lib/route';
import { serviceClient, supabaseEnabled } from '@/lib/storage-supabase';

// หน้าตรวจงาน /admin/audit (superadmin เท่านั้น): ทุกการสร้างรูป + สิ่งที่ส่งให้ AI (usage.log เก็บตั้งแต่ 2 พ.ย.)
// GET ?id=<แถว> = log เต็มของรูปนั้น · ไม่ใส่ id = รายการทีละหน้า ใหม่สุดก่อน: ?before=<id สุดท้ายของหน้าก่อน> &user= หรือ &email= &status= &page=
// แถวก่อน 2 พ.ย. ไม่มี result/log: หารูปจากเวลาของบัญชีเดียวกัน (รูปบันทึกก่อนแถวการใช้งานไม่กี่วินาที) แต่ไม่มีพรอมต์
const PAGE = 30;
const URL_PREFIX = '/api/files/';
type Row = {
  id: number; created: string; user_id: string | null; email: string | null; page: string; action: string; model: string | null; quality: string | null;
  status: string; tokens: number | null; cost_thb: number | string; result?: string | null; logged?: string | null; error?: string | null;
};
type ImageRow = { path: string; meta: Record<string, unknown>; created: string };
type Plan = { name?: string; th?: string };

const denied = () => (isSuperadmin(me()) ? (supabaseEnabled ? null : json(400, { error: 'หน้าตรวจงานต้องใช้ Supabase' })) : json(403, { error: 'เฉพาะ superadmin' }));
// ยังไม่ได้รัน db-apply (ไม่มีคอลัมน์ result/log) -> อ่านแบบเดิม หน้ายังเปิดได้ แค่ไม่มีพรอมต์
const missingColumn = (e: { message: string } | null) => Boolean(e && /column.*\b(result|log)\b|\b(result|log)\b.*column/i.test(e.message));
const BASE = 'id, created, user_id, email, page, action, model, quality, status, tokens, cost_thb';
const MATCH_BEFORE = 20_000; // รูปบันทึกก่อนแถวการใช้งานได้ถึงกี่ ms (เขียน log ระหว่างนั้น)
const MATCH_AFTER = 5_000;

export const GET = get(async (req: Request) => {
  const no = denied();
  if (no) return no;
  const sb = serviceClient();
  const q = new URL(req.url).searchParams;

  const id = Number(q.get('id'));
  if (id) {
    const { data, error } = await sb.from('usage').select('id, log').eq('id', id).maybeSingle();
    if (error && !missingColumn(error)) throw new Error(error.message);
    return json(200, { log: (data as { log?: unknown } | null)?.log ?? null });
  }

  const before = Number(q.get('before'));
  const list = (cols: string) => {
    let query = sb.from('usage').select(cols).order('id', { ascending: false }).limit(PAGE);
    if (before) query = query.lt('id', before);
    if (q.get('user')) query = query.eq('user_id', q.get('user')!);
    else if (q.get('email')) query = query.eq('email', q.get('email')!);
    if (q.get('status') === 'ok' || q.get('status') === 'error') query = query.eq('status', q.get('status')!);
    if (q.get('page') === 'model' || q.get('page') === 'product') query = query.eq('page', q.get('page')!);
    return query;
  };
  let res = await list(`${BASE}, result, logged:log->>time, error:log->>error`);
  if (missingColumn(res.error)) res = await list(BASE);
  if (res.error) throw new Error(res.error.message);
  const rows = (res.data ?? []) as unknown as Row[];

  const invites = await sb.from('invites').select('user_id, code, label');
  if (invites.error) throw new Error(invites.error.message);
  const labelOf = new Map((invites.data as { user_id: string; code: string; label: string }[]).map((i) => [i.user_id, i.label || i.code]));

  // รูปผลลัพธ์ + caption/แผนของ AI จากตาราง images: แถวใหม่ตาม path ที่เก็บไว้ · แถวเก่าตามเวลาที่ใกล้กัน
  const paths = rows.flatMap((r) => (r.result?.startsWith(URL_PREFIX) ? [r.result.slice(URL_PREFIX.length)] : []));
  const old = rows.filter((r) => !r.result && !r.logged && r.status === 'ok');
  const times = old.map((r) => Date.parse(r.created));
  const [byPath, nearby] = await Promise.all([
    paths.length ? sb.from('images').select('path, meta, created').in('path', paths) : null,
    old.length ? sb.from('images').select('path, meta, created').eq('area', 'results')
      .gte('created', new Date(Math.min(...times) - MATCH_BEFORE).toISOString()).lte('created', new Date(Math.max(...times) + MATCH_AFTER).toISOString())
      .order('created', { ascending: false }).limit(1000) : null,
  ]);
  if (byPath?.error || nearby?.error) throw new Error((byPath?.error ?? nearby?.error)!.message);
  const images = new Map(((byPath?.data ?? []) as ImageRow[]).map((i) => [i.path, i]));
  const free = [...((nearby?.data ?? []) as ImageRow[])];
  const matched = new Map<number, ImageRow>();
  for (const r of old) {
    const t = Date.parse(r.created);
    // รูปของลูกค้าติด owner · รูปของทีมไม่ติด
    const mine = (i: ImageRow) => (i.meta?.owner ? i.meta.owner === r.user_id : !labelOf.has(r.user_id ?? ''));
    const near = free.filter((i) => mine(i) && Date.parse(i.created) >= t - MATCH_BEFORE && Date.parse(i.created) <= t + MATCH_AFTER)
      .sort((a, b) => Math.abs(Date.parse(a.created) - t) - Math.abs(Date.parse(b.created) - t))[0];
    if (near) {
      matched.set(r.id, near);
      free.splice(free.indexOf(near), 1);
    }
  }

  const out = rows.map((r) => {
    const image = (r.result ? images.get(r.result.slice(URL_PREFIX.length)) : undefined) ?? matched.get(r.id);
    const meta = image?.meta ?? {};
    const plan = (meta.stylePlan ?? meta.posePlan ?? null) as Plan | null;
    return {
      id: r.id, created: r.created, who: (r.user_id && labelOf.get(r.user_id)) || r.email || 'ไม่ทราบ', customer: Boolean(r.user_id && labelOf.has(r.user_id)),
      page: r.page, action: r.action, model: r.model, quality: r.quality, status: r.status, tokens: r.tokens, cost: Number(r.cost_thb) || 0,
      src: r.result ?? (image ? URL_PREFIX + image.path : null),
      guessed: !r.result && Boolean(image), // จับคู่รูปจากเวลา (แถวก่อนเริ่มเก็บ)
      hasLog: Boolean(r.logged), error: r.error ?? null,
      caption: typeof meta.caption === 'string' ? meta.caption : null,
      plan: plan?.name || plan?.th ? { name: plan.name ?? '', th: plan.th ?? '' } : null,
      from: typeof meta.editedFrom === 'string' ? meta.editedFrom : typeof meta.refinedFrom === 'string' ? meta.refinedFrom : null,
    };
  });

  // ตัวกรองบัญชี (หน้าแรกเท่านั้น): ลูกค้าตามโค้ดเชิญ + อีเมลทีมที่เคยสร้างรูป
  let people: { user?: string; email?: string; label: string }[] | undefined;
  if (!before) {
    const emails = await sb.from('usage').select('user_id, email').order('id', { ascending: false }).limit(5000);
    if (emails.error) throw new Error(emails.error.message);
    const team = new Set((emails.data as { user_id: string | null; email: string | null }[])
      .filter((r) => r.email && !labelOf.has(r.user_id ?? '')).map((r) => r.email!));
    people = [...[...labelOf].map(([user, label]) => ({ user, label })), ...[...team].map((email) => ({ email, label: email }))];
  }
  return json(200, { rows: out, next: rows.length === PAGE ? rows.at(-1)!.id : null, ...(people ? { people } : {}) });
});
