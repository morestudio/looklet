// test-me.mjs — /api/me is fetched once per page and shared (loadMe in lib/browser.ts); no network
//   node scripts/test-me.mjs
import assert from 'node:assert/strict';
import { appLoader } from './lib/load-app.mjs';
let calls = 0, fail = false;
const listeners = {};
globalThis.window = { addEventListener: (n, f) => { listeners[n] = f; }, dispatchEvent: (e) => listeners[e.type]?.() };
const fetchImpl = async () => { calls++; await new Promise((r) => setTimeout(r, 10)); return fail ? { ok: false } : { ok: true, json: async () => ({ role: 'team', tokens: calls }) }; };
const { loadMe, onMe, USAGE_EVENT } = appLoader({ fetchImpl })('lib/browser.ts');
const heard = [];
onMe((m) => heard.push(m?.tokens));
const [a, b, c] = await Promise.all([loadMe(), loadMe(), loadMe()]);
assert.equal(calls, 1); assert.equal(a, b); assert.equal(b, c);
await loadMe(); assert.equal(calls, 1);
console.log('3 components + later mount -> 1 request');
listeners[USAGE_EVENT](); await new Promise((r) => setTimeout(r, 30));
assert.equal(calls, 2); assert.deepEqual(heard, [1, 2]);
console.log('after a generation -> 1 more request, subscribers updated');
fail = true; listeners[USAGE_EVENT](); await new Promise((r) => setTimeout(r, 30));
fail = false; await loadMe(); assert.equal(calls, 4);
console.log('failed load not cached -> next caller retries');
