// route.ts — ตัวช่วยของ API route: อ่าน JSON แล้วแปลง error เป็นข้อความให้หน้าเว็บแสดง
import 'server-only';
import { ApiError } from './ai';

export const json = (status: number, obj: unknown) => Response.json(obj, { status });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- body มาจากหน้าเว็บ แต่ละ route เช็กเอง
export function post(handler: (body: any) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await handler(await req.json());
    } catch (e) {
      if (e instanceof ApiError) return json(502, { error: e.message }); // AI ตอบ error
      const err = e as Error;
      return json(500, { error: `${err.name}: ${err.message}` });
    }
  };
}
