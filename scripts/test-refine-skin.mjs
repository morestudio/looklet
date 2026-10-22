import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

// ทดสอบ route จริงและตัวเรียก OpenAI จริง แต่แทน auth/storage/network เพื่อไม่เสียค่า AI
function app({ member = true, key = true, missing = false, providerFails = false, saveFails = false, jpegFails = false } = {}) {
  const reads = [], saves = [], calls = [], logs = [], jpegCalls = [];
  // import sharp from 'sharp' แปลงแบบไม่มี esModuleInterop -> ใช้ .default ของโมดูล
  const sharpStub = (buf) => ({ jpeg: (o) => ({ toBuffer: async () => {
    jpegCalls.push(o);
    if (jpegFails) throw new Error('sharp unavailable');
    return Buffer.concat([Buffer.from('jpeg:'), buf]);
  } }) });
  sharpStub.default = sharpStub;
  const source = Buffer.from('stored-original-image');
  const cache = new Map();
  const stubs = {
    'server-only': {},
    '@/lib/storage': {
      readImage: async (parts) => { reads.push(parts); return missing ? null : { data: source, type: 'image/png' }; },
      saveImage: async (...args) => { if (saveFails) throw new Error('Storage unavailable'); saves.push(args); return '/api/files/results/refined.png'; },
    },
    '@/lib/genlog': {
      localTime: () => '2026-10-22 12:00:00', sentences: (p) => [p], writeGenerateLog: async (l) => logs.push(l),
    },
    './supabase/server': { isSignedInMember: async () => member },
    // แปลง PNG -> JPEG: ทดสอบแค่ว่าเรียกด้วย quality 97 แล้วเก็บผลที่ได้
    sharp: sharpStub,
  };
  const context = vm.createContext({ Buffer, Request, Response, FormData, Blob, AbortSignal, Date,
    console: { log() {}, error() {} }, process: { env: key ? { OPENAI_API_KEY: 'test-only' } : {} },
    fetch: async (url, init) => {
      calls.push({ url, init });
      return providerFails
        ? Response.json({ error: { message: 'Provider unavailable' } }, { status: 503 })
        : Response.json({ data: [{ b64_json: Buffer.from('new-refined-image').toString('base64') }] });
    },
  });
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const require = (id) => {
      if (Object.hasOwn(stubs, id)) return stubs[id];
      return load(id.startsWith('@/') ? `${id.slice(2)}.ts` : path.join(path.dirname(file), `${id}.ts`));
    };
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename: file })(require, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  const route = load('app/api/refine-skin/route.ts');
  return { reads, saves, calls, logs, jpegCalls, source,
    post: (body) => route.POST(new Request('http://localhost/api/refine-skin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })),
  };
}
const original = '/api/files/results/original.png';
const input = { src: original, size: '1024x1536', caption: 'Original caption' };

test('authentication is checked before reading images or spending on AI', async () => {
  const a = app({ member: false });
  assert.equal((await a.post(input)).status, 401);
  assert.equal(a.reads.length + a.calls.length + a.saves.length, 0);
});

test('only generated images in our library can be refined', async () => {
  for (const src of [null, '', 'https://example.com/private.png', '/api/files/uploads/models/person.png', '/api/files/results/../secret.png', '/api/files/results/%2e%2e.png']) {
    const a = app();
    assert.equal((await a.post({ ...input, src })).status, 400, String(src));
    assert.equal(a.reads.length + a.calls.length, 0);
  }
  assert.equal((await app().post(null)).status, 400);
});

test('invalid dimensions and an unconfigured provider cannot start a paid request', async () => {
  const a = app();
  assert.equal((await a.post({ ...input, size: '9000x9000' })).status, 400);
  assert.equal(a.calls.length, 0);
  const b = app({ key: false });
  assert.equal((await b.post(input)).status, 400);
  assert.equal(b.calls.length, 0);
});

test('a deleted source returns 404 without invoking AI', async () => {
  const a = app({ missing: true });
  assert.equal((await a.post(input)).status, 404);
  assert.equal(a.calls.length + a.saves.length, 0);
});

test('refines the stored original with Sunburst high, saves separately and records lineage', async () => {
  const a = app();
  const before = Buffer.from(a.source);
  const response = await a.post({ ...input, size: '1536x1024' });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.src, '/api/files/results/refined.png');
  assert.equal(result.refinedFrom, original);
  assert.equal(result.finish, 'off');
  assert.equal(result.caption, 'Original caption · ผิวสมจริง');
  assert.equal(a.calls.length, 1);
  const { url, init } = a.calls[0];
  assert.equal(url, 'https://api.openai.com/v1/images/edits');
  assert.equal(init.body.get('model'), 'gpt-image-2.5-sunburst');
  assert.equal(init.body.get('quality'), 'high');
  assert.equal(init.body.get('size'), '2496x1664'); // ขยายจากขนาดรูปเดิม (SKIN_SIZES)
  assert.equal(init.body.getAll('image[]').length, 1);
  assert.deepEqual(Buffer.from(await init.body.get('image[]').arrayBuffer()), before);
  assert.deepEqual(a.source, before);
  assert.equal(a.saves.length, 1);
  assert.equal(a.saves[0][0].area, 'results');
  assert.equal(a.saves[0][3].refinedFrom, original);
  assert.equal(a.saves[0][2], 'image/jpeg');
  assert.equal(a.jpegCalls.length, 1);
  assert.equal(a.jpegCalls[0].quality, 97); // ตัวแปลงอยู่คนละ vm context เทียบทีละค่า
  assert.equal(Buffer.from(a.saves[0][1], 'base64').toString(), 'jpeg:new-refined-image');
  assert.equal(a.logs[0].result, result.src);
  assert.equal(a.logs[0].style.operation, 'refine-skin');
});

test('provider failure preserves the source and records failure, without a false result', async () => {
  const a = app({ providerFails: true });
  assert.equal((await a.post(input)).status, 502);
  assert.equal(a.saves.length, 0);
  assert.equal(a.logs[0].status, 'พัง');
  assert.equal(a.logs[0].result, undefined);
});

test('if JPEG conversion fails the paid result is still saved as the original PNG', async () => {
  const a = app({ jpegFails: true });
  const response = await a.post(input);
  assert.equal(response.status, 200);
  assert.equal(a.saves.length, 1);
  assert.equal(a.saves[0][2], 'image/png');
  assert.equal(Buffer.from(a.saves[0][1], 'base64').toString(), 'new-refined-image');
});

test('storage failure is reported without claiming that a refined image was saved', async () => {
  const a = app({ saveFails: true });
  assert.equal((await a.post(input)).status, 500);
  assert.equal(a.logs[0].status, 'พัง');
});
