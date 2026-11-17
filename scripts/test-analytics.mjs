// GA helpers (lib/analytics.ts): off unless the id is set and on the production host, events held until config,
// error reasons from api()'s HTTP status, North Star de-dup, login handed to the next page. No network, no GA.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function load(env, hostname) {
  const code = ts.transpileModule(readFileSync(new URL('../lib/analytics.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const store = new Map();
  const sent = [];
  const win = {
    gtag: (...args) => sent.push(args),
    location: { hostname },
    sessionStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  };
  const mod = { exports: {} };
  new Function('module', 'exports', 'process', 'window', 'location', 'sessionStorage', 'performance', code)(
    mod,
    mod.exports,
    { env },
    win,
    win.location,
    win.sessionStorage,
    performance,
  );
  return { ga: mod.exports, sent };
}

// off: no id, or a host other than production (localhost, Vercel previews)
for (const [env, host] of [
  [{}, 'lolostyleshot.vercel.app'],
  [{ NEXT_PUBLIC_GA_ID: 'G-TEST' }, 'localhost'],
  [{ NEXT_PUBLIC_GA_ID: 'G-TEST' }, 'looklet-git-x.vercel.app'],
]) {
  const { ga, sent } = load(env, host);
  assert.equal(ga.gaEnabled(), false, host);
  ga.track('generate_start', { page: 'model' });
  ga.markConfigured();
  assert.equal(sent.length, 0, 'no event leaves when GA is off');
}

// on: production host, or debug anywhere; events wait for config, then go out in order
{
  const { ga, sent } = load({ NEXT_PUBLIC_GA_ID: 'G-TEST' }, 'lolostyleshot.vercel.app');
  assert.equal(ga.gaEnabled(), true);
  ga.track('step_done', { page: 'model', step: 'model' });
  ga.track('generate_start', { page: 'model' });
  assert.equal(sent.length, 0, 'held until config');
  ga.markConfigured();
  assert.deepEqual(
    sent.map((a) => a[1]),
    ['step_done', 'generate_start'],
  );
  ga.track('image_kept', { page: 'model' });
  assert.equal(sent.length, 3, 'sent directly after config');
}
// debug: anywhere, and every event carries debug_mode (the property ignores it in config)
{
  const { ga, sent } = load({ NEXT_PUBLIC_GA_ID: 'G-TEST', NEXT_PUBLIC_GA_DEBUG: '1' }, 'localhost');
  assert.equal(ga.gaEnabled(), true);
  ga.track('upload', { page: 'model' });
  ga.markConfigured();
  ga.track('step_done', { page: 'model', step: 'model' });
  assert.deepEqual(
    sent.map((a) => a[2].debug_mode),
    [true, true],
  );
}

const { ga } = load({ NEXT_PUBLIC_GA_ID: 'G-TEST' }, 'lolostyleshot.vercel.app');

// error reasons
const err = (message, status) => Object.assign(new Error(message), status ? { status } : {});
assert.equal(ga.errorReason(err('x', 429)), 'quota');
assert.equal(ga.errorReason(err('x', 403)), 'quota');
assert.equal(
  ga.errorReason(Object.assign(err('Your request was rejected by the safety system', 502), { reason: 'safety' })),
  'safety',
); // reason from the server (lib/fail-reason.ts)
assert.equal(ga.errorReason(err('x', 502)), 'provider');
assert.equal(ga.errorReason(err('x', 504)), 'timeout');
assert.equal(ga.errorReason(err('x', 413)), 'too_large');
assert.equal(ga.errorReason(err('x', 400)), 'invalid');
assert.equal(ga.errorReason(err('x', 500)), 'server');
assert.equal(ga.errorReason(err('Failed to fetch')), 'client');
assert.equal(ga.errorReason(undefined), 'client');

// sample vs upload
assert.equal(ga.itemSource('/images/products/a.jpg'), 'sample');
assert.equal(ga.itemSource('/api/files/uploads/models/a.jpg'), 'upload');
assert.equal(ga.itemSource(undefined), 'none');

// North Star de-dup: first download counts, repeats don't; an image already in the gallery isn't a first keep
assert.equal(ga.firstKeep('/api/files/results/a.png'), true);
assert.equal(ga.firstKeep('/api/files/results/a.png'), false);
assert.equal(ga.firstKeep('/api/files/results/b.png', true), false);

// North Star event: a bookmark counts as first even though the image now carries inGallery; a later download doesn't
{
  const { ga: g, sent } = load({ NEXT_PUBLIC_GA_ID: 'G-TEST' }, 'lolostyleshot.vercel.app');
  g.markConfigured();
  g.trackKept('product', { src: '/api/files/results/c.png', inGallery: true }, 'gallery');
  g.trackKept('product', { src: '/api/files/results/c.png', inGallery: true, editedFrom: '/x' }, 'download');
  assert.deepEqual(
    sent.map((a) => a[2]),
    [
      { page: 'product', via: 'gallery', edited: false, first: true },
      { page: 'product', via: 'download', edited: true, first: false },
    ],
  );
}

// funnel step: once per page + step
{
  const { ga: g, sent } = load({ NEXT_PUBLIC_GA_ID: 'G-TEST' }, 'lolostyleshot.vercel.app');
  g.markConfigured();
  g.trackStepDone('model', 'outfit');
  g.trackStepDone('model', 'outfit');
  g.trackStepDone('product', 'outfit');
  g.trackStepDone('model', 'pose');
  assert.deepEqual(
    sent.map((a) => a[2]),
    [
      { page: 'model', step: 'outfit' },
      { page: 'product', step: 'outfit' },
      { page: 'model', step: 'pose' },
    ],
  );
}

// queue is capped while config never comes
{
  const { ga: g, sent } = load({ NEXT_PUBLIC_GA_ID: 'G-TEST' }, 'lolostyleshot.vercel.app');
  for (let i = 0; i < 80; i++) g.track('step_view', { step_index: i });
  g.markConfigured();
  assert.equal(sent.length, 50);
}

// login: noted on /login, taken once on the next page
ga.noteLogin('invite_code');
assert.equal(ga.takeLogin(), 'invite_code');
assert.equal(ga.takeLogin(), null);

console.log(
  'analytics checks passed: off by default, production host only, queue until config, error reasons, sources, de-dup, login hand-off.',
);
