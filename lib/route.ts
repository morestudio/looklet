// route.ts — ตัวช่วยของ API route: อ่าน JSON แล้วแปลง error เป็นข้อความให้หน้าเว็บแสดง
import 'server-only';
import { withAccount, type Account } from './account';
import { ApiError } from './ai';
import { DEFAULT_AI_MODEL } from './catalog';
import { isSignedInMember, signedInAccount } from './supabase/server';

export const json = (status: number, obj: unknown) => Response.json(obj, { status });

// ทุก API: ยังไม่เข้าสู่ระบบ = 401 (proxy.ts กันไว้แล้ว เช็กซ้ำเผื่อ proxy ถูกข้าม)
export const signedIn = async () => (await isSignedInMember() ? null : json(401, { error: 'ต้องเข้าสู่ระบบก่อน' }));

const failed = (e: unknown) => {
  if (e instanceof ApiError) return json(502, { error: e.message }); // AI ตอบ error
  const err = e as Error;
  return json(500, { error: `${err.name}: ${err.message}` });
};

// เช็กสิทธิ์แล้วจำว่าใครเรียก (lib/account.ts me()) ตลอด request — storage ใช้กรองรูปของแต่ละบัญชี
async function asCaller(run: (account: Account) => Promise<Response>) {
  try {
    const account = await signedInAccount();
    if (account === undefined) return json(401, { error: 'ต้องเข้าสู่ระบบก่อน' });
    return await withAccount(account, () => run(account));
  } catch (e) {
    return failed(e);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- body มาจากหน้าเว็บ แต่ละ route เช็กเอง
export function post(handler: (body: any) => Promise<Response>) {
  return (req: Request) => asCaller(async () => {
    const body = await req.json();
    // ผู้ใช้เลือกโมเดลไม่ได้แล้ว (27 ต.ค. เปิดให้ลูกค้าทดลอง): ทุก request ที่ส่งโมเดลมาใช้ DEFAULT_AI_MODEL เสมอ
    if (body && typeof body === 'object' && 'model' in body) body.model = DEFAULT_AI_MODEL;
    return handler(body);
  });
}

export function get<C>(handler: (req: Request, ctx: C) => Promise<Response>) {
  return (req: Request, ctx: C) => asCaller(() => handler(req, ctx));
}
