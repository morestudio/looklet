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

const store = () => {
  const t = load('toast.ts');
  const shown = () => t.getToasts().filter((x) => !x.leaving).map((x) => `${x.kind}:${x.text}`);
  return { ...t, shown };
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

// ---------- error wording ----------
const { friendlyError } = load('errors.ts', { console: { warn() {} } });
const err = (message, status) => Object.assign(new Error(message), { status });
const RAW = /OpenAI|Rate limit|TypeError|fetch failed|HTTP \d|Supabase/;

// raw provider / server text never reaches the user; every replacement says what to do
for (const e of [
  err('OpenAI ตอบกลับ 429: Rate limit reached for gpt-image in organization org-x', 502),
  err('TypeError: fetch failed', 500),
  err('Error: เก็บรูปลง Supabase ไม่สำเร็จ: duplicate key', 500),
  err('เซิร์ฟเวอร์ใช้เวลานานเกินไป', 504),
  err('HTTP 503', 503),
]) {
  const text = friendlyError(e);
  assert.doesNotMatch(text, RAW, text);
  assert.match(text, /ลองอีกครั้ง/, text);
  assert.doesNotMatch(text, /โควตา/, 'no quota note unless the action spends tokens');
  assert.match(friendlyError(e, true), /ไม่เสียโควตา$/, 'the server answered with an error: it counted nothing');
}
// no answer at all (connection lost mid-request): the server may still finish and count the image, so no "free" promise
for (const e of [new TypeError('Failed to fetch'), new TypeError('Load failed')]) {
  assert.match(friendlyError(e), /อินเทอร์เน็ต.*ลองอีกครั้ง$/);
  const paid = friendlyError(e, true);
  assert.doesNotMatch(paid, /โควตา/, paid);
  assert.match(paid, /แถวรูปที่สร้างแล้ว/, 'says where a finished image would be');
}

// AI provider errors: only what passes with time reads "busy"; the rest says who can fix it
const busy = /AI ไม่ว่างชั่วคราว/;
for (const m of ['OpenAI ตอบกลับ 429: Rate limit reached for gpt-image', 'OpenAI ตอบกลับ 500: The server had an error', 'Gemini ตอบกลับ 503: The model is overloaded']) {
  assert.match(friendlyError(err(m, 502)), busy, m);
}
for (const m of [
  'OpenAI ตอบกลับ 401: Incorrect API key provided',
  'OpenAI ตอบกลับ 429: You exceeded your current quota, please check your plan and billing details. (insufficient_quota)',
  'OpenAI ตอบกลับ 403: Project does not have access to model',
]) {
  const text = friendlyError(err(m, 502));
  assert.doesNotMatch(text, busy, m);
  assert.match(text, /ติดต่อผู้ดูแล/, m);
}
assert.match(friendlyError(err('OpenAI ตอบกลับ 400: Invalid image file', 502)), /เปลี่ยนรูป/);
assert.notEqual(friendlyError(err('OpenAI ตอบกลับ 500: x', 502)), friendlyError(err('x', 500)), 'AI busy and our own failure read differently');
assert.match(friendlyError(new TypeError('Failed to fetch')), /อินเทอร์เน็ต/);
assert.match(friendlyError(err('x', 504)), /นานเกินไป/);

// messages we wrote for the user pass through unchanged (4xx, and our own Thai 502s)
for (const [message, status] of [
  ['ใช้โทเคนครบ 300,000 แล้ว ติดต่อผู้ดูแลเพื่อเพิ่มโควตา', 429],
  ['อัปโหลดได้สูงสุด 100 รูป', 409],
  ['ไฟล์ใหญ่เกินไป', 413],
  ['Gemini ไม่ยอมประมวลผลรูปนี้ (SAFETY)', 502],
  ['เลือกรูปที่ต้องการแก้ก่อน', undefined],
]) {
  assert.equal(friendlyError(err(message, status)), message);
  assert.equal(friendlyError(err(message, status), true), message, 'no quota note on our own messages');
}
assert.equal(friendlyError('ข้อความธรรมดา'), 'ข้อความธรรมดา', 'a plain string works too');

// browser-side errors (no HTTP status) in English never reach the user (17 Nov: offline, loadImg's img.decode() said
// "The source image cannot be decoded." under สร้างรูปไม่สำเร็จ)
for (const e of [new DOMException('The source image cannot be decoded.', 'EncodingError'), new Error('The source image cannot be decoded.')]) {
  assert.match(friendlyError(e), /^โหลดรูปที่เลือกไม่ได้/);
  assert.doesNotMatch(friendlyError(e, true), /โควตา/, 'no server answer: no quota promise');
}
for (const e of [new TypeError("Cannot read properties of undefined (reading 'src')"), new DOMException('The operation is insecure.', 'SecurityError')]) {
  const text = friendlyError(e);
  assert.ok(/[฀-๿]/.test(text) && !/Cannot|insecure/.test(text), text);
}
assert.match(friendlyError(err('HTTP 418', 418)), /รหัส 418/);
assert.ok(friendlyError(undefined).length > 0 && friendlyError({}).length > 0, 'never an empty message');

// the AI's safety refusal keeps its own wording, whatever the status
for (const e of [err('OpenAI ตอบกลับ 400: Your request was rejected by the safety system', 502), { id: 'shot-1', message: 'moderation_blocked', status: 502 }]) {
  assert.match(friendlyError(e), /AI ปฏิเสธภาพนี้/);
  assert.equal((friendlyError(e, true).match(/ไม่เสียโควตา/g) ?? []).length, 1, 'said once');
}

console.log('toast + error wording: ok');
