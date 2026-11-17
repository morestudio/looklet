// route.ts — ตัวช่วยของ API route: อ่าน JSON แล้วแปลง error เป็นข้อความให้หน้าเว็บแสดง
import 'server-only';
import { withAccount, type Account } from './account';
import { ApiError } from './ai';
import { DEFAULT_AI_MODEL } from './catalog';
import { aiFailReason } from './fail-reason';
import { errorResponse } from './api-error';
import { isSignedInMember, signedInAccount } from './supabase/server';

export const json = (status: number, obj: unknown) => Response.json(obj, { status });
export { errorResponse }; // every error response: { error: { code, message } } (lib/api-error.ts)

// ทุก API: ยังไม่เข้าสู่ระบบ = 401 (proxy.ts กันไว้แล้ว เช็กซ้ำเผื่อ proxy ถูกข้าม)
export const signedIn = async () => ((await isSignedInMember()) ? null : errorResponse(401, 'ต้องเข้าสู่ระบบก่อน'));

// `message` keeps the raw text (logs, audit page, superadmin pages); the reason (`code`) is what customers see worded
const failed = (e: unknown) => {
  if (e instanceof ApiError)
    return errorResponse(502, e.message, { reason: aiFailReason(e.message, e.providerStatus) });
  const err = e as Error;
  return errorResponse(500, `${err.name}: ${err.message}`, { reason: 'unexpected_error' });
};

// เช็กสิทธิ์แล้วจำว่าใครเรียก (lib/account.ts me()) ตลอด request — storage ใช้กรองรูปของแต่ละบัญชี
async function asCaller(run: (account: Account) => Promise<Response>) {
  try {
    const account = await signedInAccount();
    if (account === undefined) return errorResponse(401, 'ต้องเข้าสู่ระบบก่อน');
    return await withAccount(account, () => run(account));
  } catch (e) {
    return failed(e);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- body มาจากหน้าเว็บ แต่ละ route เช็กเอง
export function post(handler: (body: any) => Promise<Response>, opts: { model?: string } = {}) {
  return (req: Request) =>
    asCaller(async () => {
      const body = await req.json();
      // ผู้ใช้เลือกโมเดลไม่ได้แล้ว (27 ต.ค. เปิดให้ลูกค้าทดลอง): ทุก request ที่ส่งโมเดลมาใช้โมเดลของ route นั้นเสมอ
      // (opts.model เช่น หน้าสินค้า = PRODUCT_AI_MODEL) ไม่บอก = DEFAULT_AI_MODEL
      if (body && typeof body === 'object' && 'model' in body) body.model = opts.model ?? DEFAULT_AI_MODEL;
      return handler(body);
    });
}

export function get<C>(handler: (req: Request, ctx: C) => Promise<Response>) {
  return (req: Request, ctx: C) => asCaller(() => handler(req, ctx));
}
