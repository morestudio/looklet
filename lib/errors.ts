// Error wording for the user (browser). api() in lib/browser.ts attaches the HTTP status to what it throws.
// Raw provider / server text ("OpenAI ตอบกลับ 429: Rate limit…", "TypeError: fetch failed") is never shown: it goes to
// the console, and generation failures keep it in the log on the audit page (/admin/audit).
// Design system: an error reads "<action>ไม่สำเร็จ: <reason>" and says what to do next; callers add the action.
import { SAFETY_BLOCK } from './analytics';

const NETWORK = /failed to fetch|load failed|networkerror|network request failed/i; // fetch() itself failed (Chrome / Safari / Firefox wording)
const PROVIDER_RAW = /ตอบกลับ (\d{3})/; // lib/ai.ts: "<provider> ตอบกลับ <status>: <provider's own message>"
const OUT_OF_CREDIT = /insufficient_quota|current quota|billing/i; // OpenAI 429 when the account has no credit: not "busy"
const NO_BODY = /^HTTP \d{3}$/; // api(): an error with no message from our routes
const IMAGE_LOAD = /cannot be decoded/i; // loadImg(): img.decode() when a picture won't load (offline, deleted, broken file)
const THAI = /[\u0E00-\u0E7F]/;

// paid: the action spends tokens. "ไม่เสียโควตา" only when our server answered with the error: it never counts a request it
// failed (lib/usage.ts). With no answer (connection lost mid-request) the server may still finish, save and count the image,
// so no such promise: say where the image would be instead.
export function friendlyError(err: unknown, paid = false): string {
  const { message = '', status, name } = (typeof err === 'string' ? { message: err } : err ?? {}) as { message?: string; status?: number; name?: string };
  const free = paid && status ? ' ไม่เสียโควตา' : '';
  // 2 Nov: a kneeling-on-bed pose with short sleepwear was refused as sexual
  if (SAFETY_BLOCK.test(message)) return 'AI ปฏิเสธภาพนี้ (ระบบความปลอดภัยของ AI มองว่าอาจไม่เหมาะสม เช่น ท่าบนเตียงกับชุดสั้น) ลองเลือกไอเดียหรือท่าอื่น ไม่เสียโควตา';
  const hide = (text: string) => { console.warn('[error]', status ?? '', message); return text + free; }; // warn, not error: Next's dev overlay counts console.error as an issue
  if (!status && NETWORK.test(message)) return hide(paid
    ? 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ เช็กสัญญาณแล้วรีเฟรชหน้า ถ้า AI ทำเสร็จก่อนหลุด รูปจะอยู่ในแถวรูปที่สร้างแล้ว'
    : 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ เช็กสัญญาณแล้วลองอีกครั้ง');
  if (status === 504) return hide('ใช้เวลานานเกินไป ลองอีกครั้ง');
  const provider = Number(PROVIDER_RAW.exec(message)?.[1] ?? 0);
  if (status === 502 && provider) {
    // only rate limits and the provider's own outages pass with time; a bad key, no credit or a refused input never do
    if (provider >= 500 || (provider === 429 && !OUT_OF_CREDIT.test(message))) return hide('AI ไม่ว่างชั่วคราว รอสักครู่แล้วลองอีกครั้ง');
    if (provider === 400) return hide('AI ไม่รับรูปหรือการตั้งค่านี้ ลองเปลี่ยนรูปที่เลือก ถ้ายังไม่ได้ให้ติดต่อผู้ดูแล');
    return hide('ระบบ AI ใช้งานไม่ได้ตอนนี้ ติดต่อผู้ดูแล');
  }
  if (status && status >= 500 && status !== 502) return hide('ระบบขัดข้อง ลองอีกครั้ง ถ้ายังไม่ได้ให้ติดต่อผู้ดูแล');
  if (NO_BODY.test(message)) return hide(`ทำรายการไม่ได้ (รหัส ${status ?? message.slice(5)}) ลองอีกครั้ง`);
  if (!status && (name === 'EncodingError' || IMAGE_LOAD.test(message))) return hide('โหลดรูปที่เลือกไม่ได้ เช็กอินเทอร์เน็ตแล้วลองอีกครั้ง');
  // any other browser / runtime message (no HTTP status, not written by us in Thai) is never shown raw
  if (!status && message && !THAI.test(message)) return hide('หน้าเว็บขัดข้อง ลองรีเฟรชหน้าแล้วลองอีกครั้ง');
  return message || 'เกิดข้อผิดพลาด ลองอีกครั้ง'; // 4xx and our own Thai messages: already written for the user
}
