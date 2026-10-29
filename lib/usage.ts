// usage.ts — นับการใช้งานและโควตาของลูกค้า (ตาราง usage / invites ใน supabase/schema.sql) ใช้ฝั่ง server เท่านั้น
// route ที่สร้างรูป (generate / packshot / local-edit / refine-skin): quotaBlock() ก่อนเรียก AI, recordUsage() หลังได้ผล (สำเร็จหรือพัง)
import 'server-only';
import { isCustomer, me } from './account';
import { serviceClient, supabaseEnabled } from './storage-supabase';

// ค่า AI โดยประมาณต่อรูป (บาท): GPT Image 2.5 คุณภาพสูง ~฿2 ต่อรูป (ทดสอบจริง 27 ต.ค.) ต่ำกว่านั้นถูกลงตามสัดส่วน
const COST_THB: Record<string, Record<string, number>> = {
  'openai:gpt-image-2.5-sunburst': { high: 2, medium: 1, low: 0.5 },
};
export const estimateCost = (model: string, quality: string, calls = 1) => (COST_THB[model]?.[quality] ?? 2) * calls;

// โควตาลูกค้าเป็นโทเคน (28 ต.ค. แทนจำนวนรูป): นับเฉพาะการสร้างรูป ไม่นับตัววางแผนท่า/พร็อพ/ไอเดีย
// 300,000 (เพิ่มจาก 200,000 ตามที่ขอ 28 ต.ค.) ≈ รูปสินค้า 50–60 รูป หรือรูปนางแบบ ~30 รูป
// รูปสินค้า high 1664×2496 รูปเข้า 1 รูป ~5,000 (วัดจริง 4,116 + prompt สินค้า ~1,000) ส่งรูปเพิ่ม ~1,500/รูป
// หน้านางแบบส่งรูปเข้า 3–6 รูป ~8,000–13,000 ต่อรูป
export const DEFAULT_TOKEN_QUOTA = 300_000;
// แถวที่ไม่รู้โทเคน (รูปก่อนเริ่มนับโทเคน หรือ AI ไม่บอก) นับแบบประมาณ ไม่ให้สร้างฟรี
export const ESTIMATED_TOKENS = 6_000;
export const tokensOf = (r: { status: string; tokens?: number | null }) => (r.status === 'ok' ? r.tokens ?? ESTIMATED_TOKENS : 0);

// quota = จำนวนรูปแบบเดิม ไม่ใช้แล้ว (เก็บคอลัมน์ไว้) · token_quota = โควตาจริง
export type Invite = { code: string; user_id: string; label: string; quota: number; token_quota: number; disabled: boolean; created: string };

export async function inviteOf(userId: string): Promise<Invite | null> {
  const { data, error } = await serviceClient().from('invites').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error('อ่านโค้ดเชิญไม่สำเร็จ: ' + error.message);
  return data;
}

// โทเคนของรูปที่สร้างสำเร็จ (นับโควตา) — รูปที่พังไม่นับ · Supabase ส่งได้ครั้งละ 1,000 แถว พอสำหรับโควตาหลักแสนถึงไม่กี่ล้าน
export async function usedTokens(userId: string) {
  const { data, error } = await serviceClient().from('usage').select('status, tokens').eq('user_id', userId).eq('status', 'ok');
  if (error) throw new Error('อ่านการใช้งานไม่สำเร็จ: ' + error.message);
  return (data ?? []).reduce((sum, r) => sum + tokensOf(r), 0);
}

// ลูกค้าที่ถูกปิด / ใช้ครบโควตา -> ตอบ error ก่อนเสียเงินเรียก AI · ทีมไม่มีโควตา
// รู้โทเคนหลังสร้างเสร็จเท่านั้น: ยังเหลือ = สร้างได้ รูปสุดท้ายอาจเกินนิดหน่อย · ชุดภาพหลายมุมยิงพร้อมกัน อาจเกินได้ไม่กี่รูป
export async function quotaBlock(): Promise<Response | null> {
  const account = me();
  if (!isCustomer(account) || !supabaseEnabled) return null;
  const invite = await inviteOf(account!.id);
  if (!invite || invite.disabled) return Response.json({ error: 'บัญชีนี้ถูกปิดการใช้งาน ติดต่อผู้ดูแล' }, { status: 403 });
  const used = await usedTokens(account!.id);
  if (used >= invite.token_quota) {
    return Response.json({ error: `ใช้โทเคนครบ ${invite.token_quota.toLocaleString('th-TH')} แล้ว ติดต่อผู้ดูแลเพื่อเพิ่มโควตา` }, { status: 429 });
  }
  return null;
}

export type UsageEntry = {
  page: 'model' | 'product'; action: 'generate' | 'packshot' | 'local-edit' | 'refine-skin';
  model: string; quality: string; status: 'ok' | 'error'; calls?: number; // calls = เรียก AI สร้างรูปกี่ครั้ง (harmonize = 2)
  tokens?: number; // โทเคนที่ AI คิดจริงรวมทุกครั้ง (0/ไม่มี = ไม่รู้ -> ESTIMATED_TOKENS)
};

// บันทึกไม่ได้ห้ามทำให้การสร้างรูปพัง (จ่ายเงินไปแล้ว รูปต้องถึงมือผู้ใช้)
export async function recordUsage(entry: UsageEntry) {
  if (!supabaseEnabled) return;
  const account = me();
  try {
    const { error } = await serviceClient().from('usage').insert({
      user_id: account?.id ?? null, email: account?.email ?? 'local', page: entry.page, action: entry.action,
      model: entry.model, quality: entry.quality, status: entry.status, tokens: entry.tokens || null,
      cost_thb: entry.status === 'ok' ? estimateCost(entry.model, entry.quality, entry.calls) : 0,
    });
    if (error) console.error('บันทึกการใช้งานไม่สำเร็จ', error.message);
  } catch (e) {
    console.error('บันทึกการใช้งานไม่สำเร็จ', e);
  }
}
