// Error text for customers (browser). api() puts the response's `code` as `reason` when it is a FailReason
// (lib/fail-reason.ts), its HTTP `status`, and its `message`; a message without a reason is written for the user.
// Raw text goes to the console only.
import type { FailReason } from './fail-reason';

const WORDING: Record<FailReason, string> = {
  safety: 'AI ปฏิเสธภาพนี้ (ระบบความปลอดภัยของ AI มองว่าอาจไม่เหมาะสม เช่น ท่าบนเตียงกับชุดสั้น) ลองเลือกไอเดียหรือท่าอื่น',
  ai_busy: 'AI ไม่ว่างชั่วคราว รอสักครู่แล้วลองอีกครั้ง',
  ai_rejected: 'AI ไม่รับรูปหรือการตั้งค่านี้ ลองเปลี่ยนรูปที่เลือก ถ้ายังไม่ได้ให้ติดต่อผู้ดูแล',
  ai_unavailable: 'ระบบ AI ใช้งานไม่ได้ตอนนี้ ติดต่อผู้ดูแล',
  unexpected_error: 'ระบบขัดข้อง ลองอีกครั้ง ถ้ายังไม่ได้ให้ติดต่อผู้ดูแล',
};

const NO_BODY = /^HTTP \d{3}$/; // api()'s text when a response had no JSON error
const NETWORK = /failed to fetch|load failed|networkerror|network request failed/i; // fetch() rejected (Chrome / Safari / Firefox)
const IMAGE_LOAD = /cannot be decoded/i; // loadImg(): img.decode() on a picture that won't load
const THAI = /[฀-๿]/; // our own browser-side errors are Thai; browser/runtime ones are English

// no HTTP answer: the failure happened in the browser
function browserWording(message: string, name: string | undefined, paid: boolean) {
  // paid + connection lost: the server may still finish and count the image, so no "free" promise
  if (NETWORK.test(message)) return paid
    ? 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ เช็กสัญญาณแล้วรีเฟรชหน้า ถ้า AI ทำเสร็จก่อนหลุด รูปจะอยู่ในแถวรูปที่สร้างแล้ว'
    : 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ เช็กสัญญาณแล้วลองอีกครั้ง';
  if (name === 'EncodingError' || IMAGE_LOAD.test(message)) return 'โหลดรูปที่เลือกไม่ได้ เช็กอินเทอร์เน็ตแล้วลองอีกครั้ง';
  if (message && !THAI.test(message)) return 'หน้าเว็บขัดข้อง ลองรีเฟรชหน้าแล้วลองอีกครั้ง';
}

// paid: the action spends tokens; a failure the server answered is never counted (lib/usage.ts), so say so
export function friendlyError(err: unknown, paid = false): string {
  const { message = '', status, reason, name } = (typeof err === 'string' ? { message: err } : err ?? {}) as
    { message?: string; status?: number; reason?: FailReason; name?: string };
  const text = reason ? WORDING[reason]
    : !status ? browserWording(message, name, paid)
    : status === 504 ? 'ใช้เวลานานเกินไป ลองอีกครั้ง' // the host's timeout page, not one of our routes
    : NO_BODY.test(message) ? `ทำรายการไม่ได้ (รหัส ${status}) ลองอีกครั้ง`
    : undefined;
  if (!text) return message || 'เกิดข้อผิดพลาด ลองอีกครั้ง';
  console.warn('[error]', status ?? '', reason ?? '', message); // warn: Next's dev overlay counts console.error as an issue
  return paid && status ? text + ' ไม่เสียโควตา' : text;
}

// the design system's error line: "<action>ไม่สำเร็จ: <reason and what to do>"
export const failText = (action: string, err: unknown, paid = false) => `${action}ไม่สำเร็จ: ${friendlyError(err, paid)}`;
