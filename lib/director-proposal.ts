import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { DirectorInput, DirectorPlan, ShotProposal } from './photo-director';

// Keep the exact server-created ideas between choosing and rendering, without a database/cache.
// Bind to the caller and reference images so stale or edited plans cannot change AI direction.
const key = () => {
  const value = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
  if (!value) throw new Error('ไม่มี key สำหรับบันทึกไอเดียภาพ');
  return value;
};
const contextHash = (input: DirectorInput, caller: string) => createHash('sha256').update(JSON.stringify({ input, caller })).digest('hex');
const signature = (payload: string) => createHmac('sha256', key()).update('looklet-shot-proposal-v1:' + payload).digest();

export function createShotProposal(plan: DirectorPlan, input: DirectorInput, caller: string, now = Date.now()): ShotProposal {
  const payload = Buffer.from(JSON.stringify({ plan, context: contextHash(input, caller), expires: now + 30 * 60_000 })).toString('base64url');
  return { plan, token: payload + '.' + signature(payload).toString('base64url') };
}

export function readShotProposal(token: unknown, shotId: unknown, input: DirectorInput, caller: string, now = Date.now()): DirectorPlan | null {
  if (typeof token !== 'string' || token.length > 100_000 || typeof shotId !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const expected = signature(parts[0]), actual = Buffer.from(parts[1], 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!Number.isFinite(data.expires) || data.expires <= now || data.context !== contextHash(input, caller)) return null;
    const plan = data.plan as DirectorPlan;
    if (!plan.candidates.some((c) => c.id === shotId && c.feasible)) return null;
    return { ...plan, selectedId: shotId };
  } catch {
    return null;
  }
}
