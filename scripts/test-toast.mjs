// Toast store rules (lib/toast.ts) and error wording (lib/errors.ts). No browser, no network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// transpile one lib file to CommonJS; a fresh copy per call, so each case starts with an empty store
function load(file, scope = {}) {
  const code = ts.transpileModule(readFileSync(new URL('../lib/' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  const names = Object.keys(scope);
  new Function('module', 'exports', 'require', ...names, code)(mod, mod.exports, (id) => load(id.replace('./', '') + '.ts', { process: { env: {} } }), ...names.map((n) => scope[n]));
  return mod.exports;
}

// `toast` (callers) + `toastStore` (Toaster) merged so the cases read as one API
const store = () => {
  const t = load('toast.ts');
  const shown = () => t.toastStore.get().filter((x) => !x.leaving).map((x) => `${x.kind}:${x.text}`);
  return { ...t, toast: { ...t.toast, ...t.toastStore }, getToasts: t.toastStore.get, subscribeToasts: t.toastStore.subscribe, shown };
};

// errors stay, the rest leaves after TTL (and only while the timers run)
{
  const { toast, shown, TOAST_TTL, getToasts } = store();
  toast.ok('saved');
  toast.error('failed');
  toast.tick(TOAST_TTL - 1);
  assert.deepEqual(shown(), ['ok:saved', 'error:failed'], 'nothing leaves before its time');
  toast.tick(1);
  assert.deepEqual(shown(), ['error:failed'], 'ok leaves, the error stays');
  assert.equal(getToasts().length, 2, 'the leaving toast is still drawn while it fades');
  toast.remove(getToasts().find((x) => x.leaving).id);
  toast.tick(TOAST_TTL * 100);
  assert.deepEqual(shown(), ['error:failed'], 'an error never times out');
  toast.dismiss(getToasts()[0].id);
  assert.deepEqual(shown(), [], 'the × closes it');
}

// warn ("do X first") looks like an error but leaves by itself, at the same time as ok
{
  const { toast, shown, TOAST_TTL } = store();
  assert.equal(TOAST_TTL, 6000);
  toast.warn('pick something first');
  toast.ok('saved');
  toast.error('generation failed');
  toast.tick(TOAST_TTL - 1);
  assert.deepEqual(shown(), ['warn:pick something first', 'ok:saved', 'error:generation failed']);
  toast.tick(1);
  assert.deepEqual(shown(), ['error:generation failed'], 'warn and ok leave, the error stays');
}

// subscribers hear changes; a tick that removes nothing does not re-render
{
  const { toast, subscribeToasts, TOAST_TTL } = store();
  let calls = 0;
  const off = subscribeToasts(() => calls++);
  toast.info('hello');
  assert.equal(calls, 1);
  toast.tick(100);
  assert.equal(calls, 1, 'counting down is silent');
  toast.tick(TOAST_TTL);
  assert.equal(calls, 2);
  off();
  toast.info('again');
  assert.equal(calls, 2, 'unsubscribed');
}

// the same message twice is one toast, with its timer restarted
{
  const { toast, shown, TOAST_TTL } = store();
  toast.ok('copied');
  toast.tick(TOAST_TTL - 100);
  toast.ok('copied');
  assert.deepEqual(shown(), ['ok:copied']);
  toast.tick(TOAST_TTL - 100);
  assert.deepEqual(shown(), ['ok:copied'], 'restarted');
  toast.tick(100);
  assert.deepEqual(shown(), []);
  toast.error('same'); toast.error('same');
  assert.deepEqual(shown(), ['error:same']);
  toast.ok('  '); toast.error('');
  assert.deepEqual(shown(), ['error:same'], 'empty text shows nothing');
}

// busy: stays until the handle busy() returned closes it; the result is a separate toast
{
  const { toast, shown, TOAST_TTL } = store();
  const done = toast.busy('converting…');
  toast.tick(TOAST_TTL * 10);
  assert.deepEqual(shown(), ['busy:converting…'], 'busy never times out');
  done();
  toast.error('cannot open');
  assert.deepEqual(shown(), ['error:cannot open']);
  done(); // closing twice is harmless
  assert.deepEqual(shown(), ['error:cannot open']);
  // two conversions at once: the first to finish must not close the other's note
  const a = toast.busy('converting…'), b = toast.busy('converting…');
  assert.deepEqual(shown(), ['error:cannot open', 'busy:converting…', 'busy:converting…']);
  a();
  assert.deepEqual(shown(), ['error:cannot open', 'busy:converting…']);
  b();
}

// a busy note never pushes out an unread error, and doesn't count toward TOAST_MAX
{
  const { toast, shown } = store();
  toast.error('e1'); toast.error('e2'); toast.error('e3');
  const done = toast.busy('converting…');
  assert.deepEqual(shown(), ['error:e1', 'error:e2', 'error:e3', 'busy:converting…']);
  toast.ok('saved'); // a 4th counted toast still makes room the usual way: the oldest error goes, the busy note stays
  assert.deepEqual(shown(), ['error:e2', 'error:e3', 'busy:converting…', 'ok:saved']);
  done();
  assert.deepEqual(shown(), ['error:e2', 'error:e3', 'ok:saved']);
}

// offline clicks: every retry fails the same way at once; the box must stay put (same id, never fading), not blink
// or stack. No keys (17 Nov): a later success doesn't clear it, the screen shows the success; × closes it
{
  const { toast, shown, getToasts } = store();
  toast.error('สร้างรูปไม่สำเร็จ: offline');
  const id = getToasts()[0].id;
  for (let i = 0; i < 5; i++) toast.error('สร้างรูปไม่สำเร็จ: offline');
  assert.deepEqual(shown(), ['error:สร้างรูปไม่สำเร็จ: offline']);
  assert.equal(getToasts()[0].id, id, 'the same toast all along');
  assert.ok(getToasts().every((t) => !t.leaving), 'never faded');
  toast.ok('สร้างรูปเสร็จแล้ว');
  assert.deepEqual(shown(), ['error:สร้างรูปไม่สำเร็จ: offline', 'ok:สร้างรูปเสร็จแล้ว'], 'a success does not hide the old error');
}

// at most TOAST_MAX: timed ones make room first, errors last
{
  const { toast, shown, TOAST_MAX } = store();
  assert.equal(TOAST_MAX, 3);
  toast.error('e1'); toast.ok('o1'); toast.error('e2');
  toast.info('i1');
  assert.deepEqual(shown(), ['error:e1', 'error:e2', 'info:i1'], 'the timed one made room');
  toast.error('e3');
  assert.deepEqual(shown(), ['error:e1', 'error:e2', 'error:e3']);
  toast.error('e4');
  assert.deepEqual(shown(), ['error:e2', 'error:e3', 'error:e4'], 'all errors: the oldest goes');
  toast.clear();
  assert.deepEqual(shown(), [], 'page change clears everything');
}

// ---------- server classification (lib/fail-reason.ts, used by lib/route.ts) ----------
const { aiFailReason } = load('fail-reason.ts');
assert.equal(aiFailReason('OpenAI ตอบกลับ 400: Your request was rejected by the safety system', 400), 'safety');
assert.equal(aiFailReason('moderation_blocked'), 'safety', 'safety even without a provider status');
assert.equal(aiFailReason('OpenAI ตอบกลับ 429: Rate limit reached', 429), 'ai_busy');
assert.equal(aiFailReason('OpenAI ตอบกลับ 500: The server had an error', 500), 'ai_busy');
assert.equal(aiFailReason('Gemini ตอบกลับ 503: overloaded', 503), 'ai_busy');
assert.equal(aiFailReason('OpenAI ตอบกลับ 429: You exceeded your current quota (insufficient_quota)', 429), 'ai_unavailable', 'no credit is not busy');
assert.equal(aiFailReason('OpenAI ตอบกลับ 401: Incorrect API key', 401), 'ai_unavailable');
assert.equal(aiFailReason('OpenAI ตอบกลับ 403: no access to model', 403), 'ai_unavailable');
assert.equal(aiFailReason('OpenAI ตอบกลับ 400: Invalid image', 400), 'ai_rejected');
assert.equal(aiFailReason('Gemini ไม่ยอมประมวลผลรูปนี้ (OTHER)'), undefined, 'our own wording: shown as written');
assert.equal(aiFailReason('OpenAI ตอบกลับ 400: billing_hard_limit_reached: Billing hard limit has been reached', 400), 'ai_unavailable', 'no credit as a 400 is not "change the photo"');
// lib/ai.ts post(): no answer from the provider becomes 504 (timeout) / 503 (network), so it reads like an outage
assert.equal(aiFailReason('OpenAI ไม่ตอบ: TimeoutError: The operation was aborted due to timeout', 504), 'ai_busy');
assert.equal(aiFailReason('OpenAI ไม่ตอบ: TypeError: fetch failed', 503), 'ai_busy');

// ---------- error responses (lib/api-error.ts): { error: { code, message } }, the Vercel REST API shape ----------
{
  const { errorBody, errorResponse, failReasonOf } = load('api-error.ts');
  // a route's own error: the status's generic code, the route's text as message
  assert.deepEqual(errorBody(400, 'ข้อมูลไม่ถูกต้อง'), { error: { code: 'bad_request', message: 'ข้อมูลไม่ถูกต้อง' } });
  assert.equal(errorBody(500, 'x').error.code, 'internal_server_error');
  assert.equal(errorBody(418, 'x').error.code, 'error', 'unknown status: a generic code');
  // a reason becomes the code; extra fields ride along but never override code / message
  const body = errorBody(502, 'OpenAI ตอบกลับ 429: Rate limit', { reason: 'ai_busy', extra: { codes: ['A'], code: 'x', message: 'y' } });
  assert.deepEqual(body, { error: { codes: ['A'], code: 'ai_busy', message: 'OpenAI ตอบกลับ 429: Rate limit' } });
  const res = errorResponse(429, 'ใช้โทเคนครบแล้ว');
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error.message, 'ใช้โทเคนครบแล้ว');
  // reading the reason back: only our FailReasons, never a generic code
  assert.equal(failReasonOf(body), 'ai_busy');
  assert.equal(failReasonOf(errorBody(500, 'x', { reason: 'unexpected_error' })), 'unexpected_error');
  const { errorMessageOf, errorOf } = load('api-error.ts');
  assert.equal(errorMessageOf(errorBody(404, 'ไม่พบรูปนี้')), 'ไม่พบรูปนี้');
  assert.deepEqual(errorOf(errorBody(500, 'x', { extra: { codes: ['A'] } })).codes, ['A'], 'extra fields reach the client');
  for (const other of [{ error: 'flat text' }, { error: { message: 5 } }, {}, null, '<html>']) assert.equal(errorMessageOf(other), undefined, JSON.stringify(other));
  for (const other of [errorBody(500, 'บันทึกไม่สำเร็จ'), errorBody(400, 'x'), { error: 'old flat text' }, { error: { code: 'made_up' } }, {}, null, 'text']) {
    assert.equal(failReasonOf(other), undefined, JSON.stringify(other));
  }
}

// ---------- browser wording (lib/errors.ts) ----------
const { friendlyError, failText } = load('errors.ts', { console: { warn() {} } });
// what api() throws: the response's message, its status, and its code as `reason` when that is a FailReason
const err = (message, status, reason) => Object.assign(new Error(message), { status, reason });
const RAW = /OpenAI|Rate limit|TypeError|fetch failed|HTTP \d|Supabase/;

// a reason replaces the raw text; the server answered, so a paid action says it was free
for (const [reason, pattern] of [['ai_busy', /AI ไม่ว่างชั่วคราว/], ['ai_unavailable', /ติดต่อผู้ดูแล/], ['ai_rejected', /เปลี่ยนรูป/], ['unexpected_error', /ระบบขัดข้อง/], ['safety', /AI ปฏิเสธภาพนี้/]]) {
  const e = err(reason === 'unexpected_error' ? 'TypeError: fetch failed' : 'OpenAI ตอบกลับ 429: Rate limit reached', reason === 'unexpected_error' ? 500 : 502, reason);
  const text = friendlyError(e);
  assert.match(text, pattern, reason);
  assert.doesNotMatch(text, RAW, text);
  assert.doesNotMatch(text, /โควตา/, 'no quota note unless the action spends tokens');
  assert.equal((friendlyError(e, true).match(/ไม่เสียโควตา/g) ?? []).length, 1, 'said once, at the end');
}
assert.notEqual(friendlyError(err('x', 502, 'ai_busy')), friendlyError(err('x', 500, 'unexpected_error')), 'AI busy and our own failure read differently');

// no reason: the route wrote the text for the user (quota, upload cap, our own 503s), shown as is
for (const [message, status] of [
  ['ใช้โทเคนครบ 300,000 แล้ว ติดต่อผู้ดูแลเพื่อเพิ่มโควตา', 429],
  ['อัปโหลดได้สูงสุด 100 รูป', 409],
  ['ไฟล์ใหญ่เกินไป', 413],
  ['Gemini ไม่ยอมประมวลผลรูปนี้ (SAFETY)', 502],
  ['AI ยังวางแผนภาพที่ใช้ได้ไม่สำเร็จ กรุณาลองอีกครั้ง (ยังไม่ได้สร้างรูป)', 503],
  ['เลือกรูปที่ต้องการแก้ก่อน', undefined],
]) {
  assert.equal(friendlyError(err(message, status)), message);
  assert.equal(friendlyError(err(message, status), true), message, 'no quota note on our own messages');
}
assert.equal(friendlyError('ข้อความธรรมดา'), 'ข้อความธรรมดา', 'a plain string works too');
// no JSON body: the host's timeout page, or a route that answered without text
assert.match(friendlyError(err('เซิร์ฟเวอร์ใช้เวลานานเกินไป', 504)), /นานเกินไป/);
assert.match(friendlyError(err('HTTP 418', 418)), /รหัส 418/);

// no answer at all (connection lost mid-request): the server may still finish and count the image, so no "free" promise
for (const e of [new TypeError('Failed to fetch'), new TypeError('Load failed')]) {
  assert.match(friendlyError(e), /อินเทอร์เน็ต.*ลองอีกครั้ง$/);
  const paid = friendlyError(e, true);
  assert.doesNotMatch(paid, /โควตา/, paid);
  assert.match(paid, /แถวรูปที่สร้างแล้ว/, 'says where a finished image would be');
}
// browser-side English never reaches the user (offline: loadImg's img.decode() said "The source image cannot be decoded.")
for (const e of [new DOMException('The source image cannot be decoded.', 'EncodingError'), new Error('The source image cannot be decoded.')]) {
  assert.match(friendlyError(e), /^โหลดรูปที่เลือกไม่ได้/);
  assert.doesNotMatch(friendlyError(e, true), /โควตา/);
}
for (const e of [new TypeError("Cannot read properties of undefined (reading 'src')"), new DOMException('The operation is insecure.', 'SecurityError')]) {
  const text = friendlyError(e);
  assert.ok(/[฀-๿]/.test(text) && !/Cannot|insecure/.test(text), text);
}
assert.ok(friendlyError(undefined).length > 0 && friendlyError({}).length > 0, 'never an empty message');

// the design system's line
assert.equal(failText('ดาวน์โหลด', err('ไฟล์ใหญ่เกินไป', 413)), 'ดาวน์โหลดไม่สำเร็จ: ไฟล์ใหญ่เกินไป');
assert.match(failText('สร้างรูป', err('x', 502, 'ai_busy'), true), /^สร้างรูปไม่สำเร็จ: AI ไม่ว่างชั่วคราว.*ไม่เสียโควตา$/);

console.log('toast + error wording: ok');
