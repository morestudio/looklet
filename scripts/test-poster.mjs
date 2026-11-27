// หน้าโปสเตอร์ (ต้นแบบ 20 พ.ย., docs/poster-plan.md): ตัดบรรทัดไทย · ตำแหน่งกราฟิก + พื้นที่ที่บอก AI ให้เว้น · ตรวจพื้นใต้กราฟิก
// · พรอมต์ · /api/poster (ตรวจข้อมูลก่อนเรียก AI, ลำดับรูป ตัวหลัก > รูปฉาก > แผนผังที่เติมขอบ, ตัดกลางกลับเป็นสัดส่วนโปสเตอร์, page: 'poster')
// AI / ที่เก็บ / โควตา เป็นของปลอม ไม่เสียเงิน (sharp ของจริง): node scripts/test-poster.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { appLoader } from './lib/load-app.mjs';

const MODEL = 'openai:gpt-image-2.6-sunburst';

function setup({ blocked = null, customer = false } = {}) {
  const calls = [],
    saved = [],
    usage = [],
    guides = [];
  const app = appLoader({
    env: { OPENAI_API_KEY: 'poster-test-only' },
    overrides: {
      'lib/route.ts': {
        post: (fn, opts = {}) => Object.assign(fn, { opts }),
        json: (status, body) => ({ status, body }),
        errorResponse: (status, message) => ({ status, body: { error: { code: 'error', message } } }),
      },
      'lib/ai.ts': {
        availableModels: () => [{ id: MODEL }],
        generateImage: async (model, images, prompt, opt) => {
          calls.push({ model, images, prompt, opt });
          const [w, h] = opt.size.split('x').map(Number);
          const png = await sharp({ create: { width: w, height: h, channels: 3, background: '#88aacc' } })
            .png()
            .toBuffer();
          return { data: png.toString('base64'), mime: 'image/png', tokens: 4321 };
        },
      },
      'lib/storage.ts': {
        saveImage: async (where, data, mime, meta) => {
          saved.push({ where, data, mime, meta });
          return '/api/files/results/poster-test.jpg';
        },
        saveGuide: async (jpeg) => {
          guides.push(jpeg);
          return `/api/files/guides/team/${guides.length}.jpg`;
        },
      },
      // หน้าโปสเตอร์เฉพาะ superadmin (27 พ.ย.) · ไม่มี login (ทดสอบ/ในเครื่อง) = ใช้ได้
      ...(customer ? { 'lib/account.ts': { canUsePoster: () => false } } : {}),
      'lib/usage.ts': {
        quotaBlock: async () => blocked,
        recordUsage: async (entry) => usage.push(entry),
      },
      'lib/genlog.ts': {
        localTime: () => 'test',
        sentences: (s) => s.split(/(?<=\.) (?=[A-Z])/),
        writeGenerateLog: async (entry) => entry,
      },
    },
  });
  return { app, calls, saved, usage, guides };
}

const jpeg = async (w, h) =>
  (
    await sharp({ create: { width: w, height: h, channels: 3, background: '#cfcfcf' } })
      .jpeg()
      .toBuffer()
  ).toString('base64');
const png = async (w, h) =>
  (
    await sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } })
      .png()
      .toBuffer()
  ).toString('base64');

test('Thai text wraps between words, never inside one', () => {
  const { app } = setup();
  const { wrapText, fitText } = app('lib/poster.ts');
  const measure = (s) => [...s].length * 10;
  const text = 'ข้าวมันไก่ต้มสูตรต้นตำรับจากเยาวราช';
  const lines = wrapText(text, 120, measure);
  assert.ok(lines.length > 1, 'long Thai text breaks into lines');
  assert.equal(lines.join(''), text, 'no characters lost or added');
  for (const line of lines) assert.ok(!/^[ะ-ฺ็-๎]/.test(line), `line starts with a mark: ${line}`);
  assert.deepEqual(wrapText('บรรทัดแรก\nบรรทัดสอง', 1000, measure), ['บรรทัดแรก', 'บรรทัดสอง']);
  const fit = fitText(text, {
    maxWidth: 200,
    maxHeight: 60,
    maxLines: 2,
    size: 40,
    minSize: 8,
    lineHeight: 1.2,
    measure: (s, size) => [...s].length * size * 0.5,
  });
  assert.ok(fit.lines.length <= 2 && fit.size < 40 && fit.width <= 200, 'shrinks until it fits two lines');
});

test('graphic place: start spots, old saved places, layout frame; the area sent to the AI wraps the graphic', () => {
  const { app } = setup();
  const {
    POSTER_ASPECTS,
    ZONE_IDS,
    zoneRect,
    startPlace,
    legacyPlace,
    layoutFrame,
    readPlace,
    reservedArea,
    isArea,
    areaWords,
  } = app('lib/poster.ts');
  for (const { id: aspect } of POSTER_ASPECTS)
    for (const zone of ZONE_IDS) {
      const z = zoneRect(zone, aspect);
      for (const v of [z.x, z.y, z.x + z.w, z.y + z.h]) assert.ok(v >= 0 && v <= 1, `${aspect} ${zone} inside`);
      // a template's start spot = the middle of its first zone, full zone width, size 1
      const s0 = startPlace(zone, aspect);
      assert.deepEqual(s0, {
        x: z.x + z.w / 2,
        y: z.y + z.h / 2,
        w: z.w,
        size: 1,
        align: zone === 'left' ? 'left' : zone === 'right' ? 'right' : 'center',
      });
      // the frame the text is laid out in = the old zone box (same look as before 23 Nov)
      const f = layoutFrame(s0, aspect);
      assert.ok(Math.abs(f.w - z.w) < 1e-9 && Math.abs(f.h - z.h) < 1e-9, `${aspect} ${zone} frame`);
      assert.equal(f.wide, zone === 'top' || zone === 'bottom', `${aspect} ${zone}: band or column layout`);
      // older images stored { zone, dx, dy }: the same box, moved and kept on the poster like the old clampPlace
      for (const [dx, dy] of [
        [0, 0],
        [5, 5],
        [-5, -5],
        [0.1, -0.02],
      ]) {
        const l = legacyPlace(zone, dx, dy, aspect);
        const box = { x: l.x - l.w / 2, y: l.y - z.h / 2, w: l.w, h: z.h };
        assert.ok(
          box.x >= -1e-9 && box.y >= -1e-9 && box.x + box.w <= 1 + 1e-9 && box.y + box.h <= 1 + 1e-9,
          `${aspect} ${zone} ${dx}`,
        );
        assert.deepEqual(
          readPlace({ zone, dx, dy }, aspect),
          legacyPlace(zone, Math.max(-1, Math.min(1, dx)), Math.max(-1, Math.min(1, dy)), aspect),
        );
      }
      const bounds = { x: z.x + 0.1, y: z.y + 0.02, w: z.w * 0.6, h: z.h * 0.5 };
      const a = reservedArea(bounds, aspect);
      assert.ok(a.x < bounds.x && a.y < bounds.y, `${aspect} ${zone}: margin around the graphic`);
      assert.ok(a.x + a.w > bounds.x + bounds.w && a.y + a.h > bounds.y + bounds.h);
      assert.ok(isArea(a), `${aspect} ${zone}: a valid area`);
    }
  // parts moved apart: one area each; parts close together (the template's own stack) merge into one
  const { reservedAreas, isAreas, generationKey } = app('lib/poster.ts');
  const kicker = { x: 0.2, y: 0.05, w: 0.6, h: 0.05 },
    title = { x: 0.25, y: 0.11, w: 0.5, h: 0.12 },
    date = { x: 0.6, y: 0.88, w: 0.3, h: 0.05 };
  const stacked = reservedAreas([kicker, title], '4:5');
  assert.equal(stacked.length, 1, 'a stack = one block');
  assert.deepEqual(stacked[0], {
    ...reservedArea({ x: 0.2, y: 0.05, w: 0.6, h: 0.18 }, '4:5'),
    ...{ x: stacked[0].x, w: stacked[0].w },
  });
  const apart = reservedAreas([date, kicker, title], '4:5');
  assert.equal(apart.length, 2, 'the date moved away = its own block');
  assert.ok(apart[0].y < apart[1].y, 'top to bottom');
  assert.ok(isAreas(apart));
  assert.equal(isAreas([]), false);
  assert.equal(isAreas(Array(7).fill(date)), true, '7 blocks are fine since 26 Nov (promo at 9:16)');
  assert.equal(isAreas(Array(13).fill(date)), false, 'at most MAX_AREAS (12)');
  // no size limit since 26 Nov: large blocks together are allowed
  assert.equal(
    isAreas([
      { x: 0, y: 0, w: 0.7, h: 0.5 },
      { x: 0, y: 0.5, w: 0.7, h: 0.4 },
    ]),
    true,
  );
  const k2 = generationKey('4:5', apart, 's1', 'scene-cafe');
  assert.match(k2, /^[\w:|,.-]+$/, 'the route stores only these characters');
  assert.ok(k2.length <= 260);
  assert.equal(generationKey('4:5', [kicker], 's', 'b'), generationKey('4:5', kicker, 's', 'b'), 'one area = old key');
  // clamped at the poster edge
  const edge = reservedArea({ x: 0, y: 0, w: 0.5, h: 0.2 }, '4:5');
  assert.equal(edge.x, 0);
  assert.equal(edge.y, 0);
  assert.match(
    areaWords({ x: 0.05, y: 0.04, w: 0.9, h: 0.3 }),
    /^a band across the top of the frame \(from 5% to 95% of the width and from 4% to 34% of the height\)$/,
  );
  assert.match(areaWords({ x: 0.04, y: 0.1, w: 0.46, h: 0.8 }), /^a column down the left side/);
  assert.match(areaWords({ x: 0.6, y: 0.7, w: 0.3, h: 0.2 }), /^the bottom right of the frame/);
  assert.equal(isArea({ x: 0, y: 0, w: 1, h: 0.9 }), true, 'no size limit since 26 Nov (promo graphics)');
  assert.equal(isArea({ x: 0.5, y: 0.5, w: 0.6, h: 0.2 }), false, 'outside the frame');
  assert.equal(isArea({ x: 0.1, y: 0.1, w: '0.3', h: 0.2 }), false);
});

test('area check under the graphic: ink colour and busy (no backing card)', () => {
  const { app } = setup();
  const { zoneStats } = app('lib/poster.ts');
  const W = 40,
    H = 40;
  const fill = (f) => {
    const d = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const v = f(x, y);
        d.set([v, v, v, 255], (y * W + x) * 4);
      }
    return d;
  };
  const all = { x: 0, y: 0, w: 1, h: 1 };
  const white = zoneStats(
    fill(() => 245),
    W,
    H,
    all,
  );
  assert.equal(white.ink, 'dark');
  assert.equal(white.busy, false);
  assert.equal('card' in white, false, 'the graphic has no backing (user, 20 Nov)');
  assert.equal(
    zoneStats(
      fill(() => 15),
      W,
      H,
      all,
    ).ink,
    'light',
  );
  const checker = zoneStats(
    fill((x, y) => (((x >> 1) + (y >> 1)) % 2 ? 230 : 30)),
    W,
    H,
    all,
  );
  assert.equal(checker.busy, true);
  // only the rect counts: busy left half, plain right half
  const half = fill((x, y) => (x < W / 2 ? (((x >> 1) + (y >> 1)) % 2 ? 230 : 30) : 240));
  assert.equal(zoneStats(half, W, H, { x: 0.55, y: 0, w: 0.45, h: 1 }).busy, false);
});

test('a graphic sticks to its output: stored JSON is read back safely', () => {
  const { app } = setup();
  const { readGraphic, graphicOf, sameLayout, generationKey, legacyPlace, layoutFrame } = app('lib/poster.ts');
  const g = {
    template: 'sale',
    place: { x: 0.31, y: 0.5, w: 0.5, size: 1.4, align: 'left' },
    // each part placed on its own (23 Nov): the badge top right, the title bottom left
    items: {
      badge: { x: 0.8, y: 0.15, w: 0.25, size: 1.1, align: 'center' },
      title: { x: 0.3, y: 0.85, w: 0.5, size: 0.9, align: 'left' },
    },
    palette: 'navy',
    texts: { badge: 'ลด 30%', title: 'วันนี้เท่านั้น' },
  };
  assert.deepEqual(readGraphic(JSON.stringify(g)), g, 'round trip through meta');
  assert.deepEqual(readGraphic(g), g, 'or as an object from the page');
  assert.deepEqual(graphicOf({ ...g, aspect: '4:5', bg: { kind: 'scene', id: 'shape' } }), g, 'only the graphic part');
  assert.equal(readGraphic({ ...g, template: 'gone' }), null, 'unknown template');
  assert.equal(readGraphic({ ...g, palette: 'gone' }), null, 'unknown colours');
  assert.equal(readGraphic({ ...g, place: { y: 0.5 } }), null, 'no place');
  // parts the template has not, old-style zone places and junk are dropped (that part follows the template layout)
  const parts = readGraphic({
    ...g,
    items: { ...g.items, kicker: g.items.title, sub: { zone: 'top', dx: 0, dy: 0 }, rule: 'x' },
  }).items;
  assert.deepEqual(Object.keys(parts).sort(), ['badge', 'title']);
  assert.deepEqual(readGraphic({ ...g, items: undefined }).items, {}, 'saved before parts: one block');
  // saved before 23 Nov: { zone, dx, dy } -> the same box at the image's aspect
  const old = readGraphic({ ...g, place: { zone: 'left', dx: 0.1, dy: -0.05 } }, '9:16');
  assert.deepEqual(old.place, legacyPlace('left', 0.1, -0.05, '9:16'));
  assert.equal(old.place.align, 'left');
  // any template may sit anywhere now (the zone list is only its start spot)
  assert.ok(readGraphic({ ...g, template: 'pill', place: { zone: 'left', dx: 0, dy: 0 } }));
  // narrow frame = column layout, widening it past WIDE_MIN = band layout (replaces the old side / top chips)
  assert.equal(layoutFrame({ ...g.place, w: 0.4, size: 1 }, '4:5').wide, false);
  assert.equal(layoutFrame({ ...g.place, w: 0.8, size: 1 }, '4:5').wide, true);
  assert.equal(layoutFrame({ ...g.place, w: 0.8, size: 2 }, '4:5').wide, false, 'by the frame before scaling');
  assert.equal(readGraphic('{not json'), null);
  assert.equal(readGraphic('x'.repeat(5000)), null, 'too long');
  const odd = readGraphic({
    ...g,
    place: { x: 9, y: -3, w: 'wide', size: 40, align: 'justify' },
    texts: { badge: 'ลด'.repeat(20), price: '99', title: 5 },
  });
  assert.deepEqual(odd.place, { x: 2, y: 0, w: 0.9, size: 3, align: 'center' }, 'clamped, junk = defaults');
  assert.equal([...odd.texts.badge].length <= 8, true, 'cut to the field max');
  assert.equal('price' in odd.texts, false, 'fields the template has not are dropped');
  assert.equal('title' in odd.texts, false, 'non-text dropped');
  // stale = only the graphic area or the size moved (a new subject / scene is fine)
  const a = { x: 0.05, y: 0.62, w: 0.9, h: 0.33 };
  const k = generationKey('4:5', a, 's1', 'scene-cafe');
  assert.equal(sameLayout(k, generationKey('4:5', a, 's2', 'photo-x')), true);
  assert.equal(sameLayout(k, generationKey('4:5', { ...a, y: 0.3 }, 's1', 'scene-cafe')), false);
  assert.equal(sameLayout(k, generationKey('1:1', a, 's1', 'scene-cafe')), false);
  assert.equal(sameLayout('', k), true, 'older images without a key never warn');
});

test('editing the graphic on a generated poster saves it with that image (24 Nov)', async () => {
  const POSTER = '/api/files/results/poster/a.jpg';
  const LAYOUT = '9:16|scene-shape|s1|0.05,0.60,0.90,0.35';
  const metas = {
    [POSTER]: { page: 'poster', posterLayout: LAYOUT, posterGraphic: '{"template":"sale"}' },
    '/api/files/results/model/b.jpg': { caption: 'model page' },
  };
  const writes = [];
  const app = appLoader({
    overrides: {
      'lib/route.ts': {
        post: (fn) => fn,
        json: (status, body) => ({ status, body }),
        errorResponse: (status, message) => ({ status, body: { error: { code: 'error', message } } }),
      },
      'lib/storage.ts': {
        readMeta: async (src) => metas[src] ?? null, // null = missing or another account's
        updateMeta: async (src, meta) => {
          if (!metas[src]) return false;
          writes.push({ src, meta });
          Object.assign(metas[src], meta);
          return true;
        },
      },
    },
  });
  const { POST } = app('app/api/update/route.ts');
  const { readGraphic, legacyPlace } = app('lib/poster.ts');
  // moved to the top, another colour, other words
  const g = {
    template: 'sale',
    place: { x: 0.5, y: 0.2, w: 0.6, size: 1.2, align: 'center' },
    items: { title: { x: 0.5, y: 0.12, w: 0.7, size: 1, align: 'left' } },
    palette: 'navy',
    texts: { title: 'ลดทั้งร้าน' },
  };
  const res = await POST({ src: POSTER, posterGraphic: g });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(metas[POSTER].posterGraphic), readGraphic(g), 'stored as the page reads it back');
  // first edit also keeps the graphic as generated (25 Nov: the page can revert to it); nothing else is written
  assert.deepEqual(Object.keys(writes[0].meta).sort(), ['posterGraphic', 'posterGraphicFirst']);
  assert.equal(metas[POSTER].posterGraphicFirst, '{"template":"sale"}', 'the graphic it was made with');
  assert.equal(metas[POSTER].posterLayout, LAYOUT, 'where the AI left the space stays as generated');
  // an old-style place is read at the image's own aspect (from its layout key)
  await POST({ src: POSTER, posterGraphic: { ...g, place: { zone: 'left', dx: 0.1, dy: -0.05 } } });
  assert.deepEqual(JSON.parse(metas[POSTER].posterGraphic).place, legacyPlace('left', 0.1, -0.05, '9:16'));
  assert.deepEqual(Object.keys(writes[1].meta), ['posterGraphic'], 'later edits never overwrite the original');
  assert.equal(metas[POSTER].posterGraphicFirst, '{"template":"sale"}');
  writes.length = 0;
  for (const [body, status, why] of [
    [{ src: '/api/files/results/model/b.jpg', posterGraphic: g }, 400, 'not a poster'],
    [{ src: '/api/files/uploads/products/x.jpg', posterGraphic: g }, 400, 'an upload'],
    [{ src: '/api/files/results/poster/gone.jpg', posterGraphic: g }, 404, 'missing or not yours'],
    [{ src: POSTER, posterGraphic: { ...g, template: 'gone' } }, 400, 'unknown design'],
    [{ src: POSTER, posterGraphic: { ...g, palette: 'gone' } }, 400, 'unknown colour'],
    [{ src: POSTER, posterGraphic: null }, 400, 'no graphic'],
    [{ src: POSTER, posterGraphic: 'x'.repeat(5000) }, 400, 'too long'],
  ]) {
    const r = await POST(body);
    assert.equal(r.status, status, why);
  }
  assert.equal(writes.length, 0, 'nothing written when refused');
});

test('custom colour (24 Nov): any #rrggbb is a palette; the other colours are worked out from it', () => {
  const { app } = setup();
  const { customPalette, paletteOf, paletteFrom, readGraphic } = app('lib/poster.ts');
  const teal = customPalette('#1A9E8F');
  assert.equal(teal.id, '#1a9e8f', 'stored lower case');
  assert.equal(teal.accent, '#1a9e8f');
  assert.equal(teal.accentInk, '#FFFFFF', 'white letters on a mid-dark colour');
  assert.equal(customPalette('#f7e04a').accentInk, '#111111', 'dark letters on a light yellow');
  // white or dark letters, as the ready-made palettes chose by hand
  const { POSTER_PALETTES } = app('lib/poster.ts');
  for (const p of POSTER_PALETTES)
    assert.equal(customPalette(p.accent).accentInk === '#FFFFFF', p.accentInk.toUpperCase() === '#FFFFFF', p.id);
  assert.match(teal.ink, /^#[0-9a-f]{6}$/);
  assert.match(teal.paper, /^#[0-9a-f]{6}$/);
  const lum = (hex) => [1, 3, 5].reduce((n, i) => n + parseInt(hex.slice(i, i + 2), 16), 0);
  assert.ok(lum(teal.ink) < 150 && lum(teal.paper) > 700, 'ink near black, paper near white');
  assert.deepEqual(paletteOf('#1A9E8F'), teal);
  assert.equal(paletteOf('chili').id, 'chili', 'the ready-made colours are unchanged');
  for (const bad of ['#12345', '#1234567', 'red', 'rgb(1,2,3)', '#ggg000', 5, null])
    assert.equal(paletteFrom(bad), null, bad);
  const g = {
    template: 'sale',
    place: { x: 0.5, y: 0.8, w: 0.6, size: 1, align: 'center' },
    palette: '#1A9E8F',
    texts: {},
  };
  assert.equal(readGraphic(g).palette, '#1a9e8f', 'saved with the image');
  assert.equal(readGraphic({ ...g, palette: '#1a9e8' }), null, 'a broken colour is refused');
});

test('สีของฉัน: picked colours are kept on this device, newest last, no repeats, at most 8', () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
  };
  const { app } = setup();
  const c = app('lib/poster-colors.ts');
  const saved = () => JSON.parse(store.get(c.COLORS_KEY) ?? '[]');
  c.rememberColor('#1A9E8F');
  c.rememberColor('chili'); // a ready-made colour is not a saved one
  c.rememberColor('#ff0000');
  c.rememberColor('#1a9e8f'); // picked again: stays where it was
  assert.deepEqual(saved(), ['#1a9e8f', '#ff0000']);
  for (let i = 0; i < 8; i++) c.rememberColor(`#00000${i}`);
  assert.equal(saved().length, c.COLORS_MAX);
  assert.equal(saved()[0], '#000000', 'the oldest dropped first');
  c.forgetColor('#000007');
  assert.equal(saved().includes('#000007'), false);
  // junk in storage is ignored; storage that throws (private mode) still works for this page
  store.set(c.COLORS_KEY, '["#abcdef","nope",5,"#ABCDEF"]');
  const fresh = setup().app('lib/poster-colors.ts');
  fresh.rememberColor('#123456');
  assert.deepEqual(JSON.parse(store.get(c.COLORS_KEY)), ['#abcdef', '#123456']);
  globalThis.localStorage = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  const blocked = setup().app('lib/poster-colors.ts');
  assert.doesNotThrow(() => blocked.rememberColor('#222222'));
  delete globalThis.localStorage;
});

test('/api/poster AI-designed background with a custom colour: the prompt names that colour', async () => {
  const { app, calls } = setup();
  const { POST } = app('app/api/poster/route.ts');
  const g = {
    template: 'sale',
    place: { x: 0.5, y: 0.8, w: 0.6, size: 1, align: 'center' },
    palette: '#1a9e8f',
    texts: { title: 'ชาไทยเย็น' },
  };
  const res = await POST({
    model: MODEL,
    aspect: '4:5',
    scene: 'ai-design',
    subject: await jpeg(600, 800),
    plan: await png(819, 1024),
    area: AREA,
    graphic: g,
  });
  assert.equal(res.status, 200);
  assert.match(calls[0].prompt, /main color #1a9e8f/);
});

test('catalog: templates, scenes and palettes are well formed', () => {
  const { app } = setup();
  const p = app('lib/poster.ts');
  const ids = (list) => new Set(list.map((x) => x.id)).size === list.length;
  assert.ok(ids(p.POSTER_TEMPLATES) && ids(p.POSTER_SCENES) && ids(p.POSTER_PALETTES));
  for (const t of p.POSTER_TEMPLATES) {
    assert.ok(t.zones.length > 0 && t.zones.every(p.isZone), t.id);
    assert.ok(ids(t.fields), `${t.id} fields`);
    for (const f of t.fields) assert.ok([...f.sample].length <= f.max, `${t.id}.${f.id} sample longer than max`);
  }
  for (const s of p.POSTER_SCENES) {
    assert.ok(!/[฀-๿]/.test(s.prompt), `${s.id}: prompts are English`);
    // the place only, no fixed surface (23 Nov): a steel counter put a counter with food in front of two people
    assert.doesNotMatch(s.prompt, /\b(counter|table|surface)\b/, `${s.id}: no fixed surface`);
    assert.equal('surface' in s, false);
  }
  const a = { x: 0.05, y: 0.04, w: 0.9, h: 0.3 };
  const k = p.generationKey('4:5', a, 's1', 'scene-cafe');
  assert.equal(p.keyAspect(k), '4:5');
  assert.equal(p.generationKey('4:5', { ...a, h: 0.31 }, 's1', 'scene-cafe'), k, 'a tiny text change keeps the key');
  assert.notEqual(p.generationKey('4:5', { ...a, y: 0.6 }, 's1', 'scene-cafe'), k, 'moving the graphic changes it');
  assert.notEqual(p.generationKey('4:5', a, 's2', 'scene-cafe'), k, 'another subject photo changes it');
  assert.match(k, /^[\w:|,.-]+$/, 'the route stores only these characters');
});

test('prompt: subject first, plan never drawn, text may overlap the subject but not faces, no text', () => {
  const { app } = setup();
  const { buildPosterPrompt } = app('lib/poster-prompts.ts');
  const { POSTER_SCENES, areaWords } = app('lib/poster.ts');
  const area = { x: 0.05, y: 0.04, w: 0.9, h: 0.3 };
  const prompt = buildPosterPrompt({ scene: POSTER_SCENES[0], areas: [area], padded: 'top-bottom' });
  const sentences = prompt.split(/(?<=\.) (?=[A-Z])/);
  // ready-made scenes are graphic backgrounds (23 Nov): the subject stays a real photo on the design
  assert.match(
    sentences[0],
    /the subject from Image 1 as a real photograph on a designed graphic background: a flat solid color with one large soft circle/,
  );
  assert.match(prompt, /it stands on a simple ground shape or line that belongs to the design/);
  assert.match(prompt, /The background is a flat, clean illustration, not a photo of a real place/);
  assert.doesNotMatch(prompt, /match the setting's light direction/);
  assert.match(sentences[1], /^Most important: the subject stays exactly as in Image 1/);
  // an imperfect photo comes out like a perfect product photo, design unchanged (user, 23 Nov)
  assert.match(
    sentences[2],
    /^The photo in Image 1 may be imperfect \(small, blurry, .*mockup render.*\): show the subject as it would look in a perfect professional photograph, .*; its design stays exactly the same \(shape, proportions, colors, and every logo and letter\), and people keep their own faces and skin tone\.$/,
  );
  // the plan is the real text graphic (23 Nov): a guide only, never drawn
  assert.match(
    prompt,
    /Image 2 is a layout plan of the final poster: it shows the poster's text graphic exactly where and how large it will be laid over the photo later, /,
  );
  assert.match(prompt, /never draw any of its letters, words, numbers or colors, and never draw its white background/);
  assert.match(prompt, /the text in Image 2 is added later by the designer/);
  assert.doesNotMatch(prompt, /cyan/, 'no cyan blocks any more');
  assert.ok(prompt.includes(areaWords(area)), 'the area in words too');
  assert.match(prompt, /it may continue behind the text, which will sit on top of it/);
  assert.match(prompt, /faces, heads, hair, hands and any printed label or logo stay completely clear of the text/);
  assert.doesNotMatch(prompt, /no part of the subject|away from the cyan block/, 'the old keep-out rule is gone');
  assert.match(prompt, /No text anywhere in the image/);
  assert.match(
    prompt,
    /captions, prices, stickers or any text laid over the photo in Image 1/,
    'overlay text on the photo is never copied',
  );
  assert.match(prompt, /top and bottom margins of the layout plan/);
  const own = buildPosterPrompt({ scene: null, areas: [area], padded: null });
  assert.match(own, /in the place shown in Image 2/);
  assert.match(own, /Image 2 is the setting/);
  assert.match(own, /Image 3 is a layout plan/);
  // own place photo: no fixed surface (23 Nov), the AI picks one for products / food, people get nothing in front
  assert.match(
    own,
    /If the subject is a product or food, it rests on a surface that belongs in this place and suits the subject; if the subject is a person or people, they stand or sit naturally in the setting with nothing in front of them\./,
  );
  assert.match(own, /match the setting's light direction/, 'a real place: lit like the place');
  // the user's own place keeps its signs (23 Nov: the bar's "Repeat" sign was removed); ready-made scenes stay text-free
  assert.match(own, /the place's own signs and lettering exactly as they are/);
  assert.match(own, /No new text anywhere in the image: .*only the place's own signs from Image 2 stay as they are/);
  assert.doesNotMatch(prompt, /own signs/);
  assert.doesNotMatch(own, /cropped away/);
  assert.doesNotMatch(prompt + own, /\b(she|her|woman)\b/i);
  // parts moved apart = every place named in words
  const top = { x: 0.1, y: 0.04, w: 0.8, h: 0.12 },
    corner = { x: 0.6, y: 0.82, w: 0.32, h: 0.12 };
  const two = buildPosterPrompt({ scene: POSTER_SCENES[0], areas: [top, corner], padded: null });
  assert.match(two, /how large it will be laid over the photo later: /);
  assert.ok(two.includes(`${areaWords(top)} and ${areaWords(corner)}. It is a guide only`));
  const one = buildPosterPrompt({ scene: POSTER_SCENES[0], areas: [top], padded: null });
  assert.match(one, /how large it will be laid over the photo later, a band/);
});

const AREA = { x: 0.05, y: 0.62, w: 0.9, h: 0.33 };

test('/api/poster checks everything before any AI call', async () => {
  const { app, calls } = setup();
  const { POST } = app('app/api/poster/route.ts');
  assert.equal(POST.opts.model, MODEL, 'GPT Image 2.6 like the product page');
  const subject = await jpeg(600, 800),
    plan = await png(819, 1024);
  const ok = { model: MODEL, aspect: '4:5', scene: 'shape', subject, plan, area: AREA };
  for (const [patch, why] of [
    [{ aspect: '7:3' }, 'aspect'],
    [{ subject: undefined }, 'no subject'],
    [{ subject: 'not base64!' }, 'bad subject'],
    [{ scene: 'moon' }, 'scene'],
    [{ scene: null, background: 'not base64!' }, 'bad background'],
    [{ area: { x: 0.5, y: 0.5, w: 0.7, h: 0.2 } }, 'area outside the frame'],
    [{ area: undefined, areas: [] }, 'no areas'],
    [{ area: undefined, areas: [AREA, { x: 0.5, y: 0.5, w: 0.7, h: 0.2 }] }, 'one area outside the frame'],
    [{ area: undefined, areas: 'top' }, 'areas not a list'],
    [{ model: 'openai:unknown' }, 'model'],
    [{ graphic: { template: 'gone' } }, 'bad graphic'],
    [{ plan: await png(1024, 1024) }, 'plan aspect'],
    [
      {
        subject: (
          await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } })
            .webp()
            .toBuffer()
        ).toString('base64'),
      },
      'webp subject',
    ],
  ]) {
    const res = await POST({ ...ok, ...patch });
    assert.equal(res.status, 400, why);
  }
  assert.equal(calls.length, 0);
  // no size limit since 26 Nov (promo graphics like the user's Canva design cover most of the poster on purpose)
  const { isAreas } = app('lib/poster.ts');
  assert.equal(isAreas([{ x: 0, y: 0, w: 1, h: 0.95 }]), true, 'a near-full area is allowed');
  assert.equal(
    isAreas([
      { x: 0, y: 0, w: 1, h: 0.5 },
      { x: 0, y: 0.5, w: 1, h: 0.45 },
    ]),
    true,
    'and large areas together',
  );
  const quota = setup({ blocked: { status: 429, body: { error: { code: 'quota', message: 'หมดโควตา' } } } });
  const blockedRes = await quota.app('app/api/poster/route.ts').POST(ok);
  assert.equal(blockedRes.status, 429);
  assert.equal(quota.calls.length, 0, 'no AI call over quota');
});

test('/api/poster with a ready-made scene: subject then padded plan, cropped back, stored as a poster', async () => {
  const { app, calls, saved, usage, guides } = setup();
  const { POST } = app('app/api/poster/route.ts');
  const subject = await jpeg(600, 800);
  const key = '4:5|scene-riverside|s1|0.05,0.60,0.90,0.35';
  const graphic = {
    template: 'pill',
    place: { x: 0.5, y: 0.81, w: 0.9, size: 1.2, align: 'center' },
    items: {},
    palette: 'sun',
    texts: { title: 'เมนูใหม่!' },
  };
  const res = await POST({
    model: MODEL,
    aspect: '4:5',
    scene: 'riverside',
    subject,
    plan: await png(819, 1024),
    area: AREA,
    key,
    graphic,
  });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1, 'one AI call');
  const [call] = calls;
  assert.equal(call.opt.size, '1664x2496');
  assert.equal(call.images.length, 2, 'subject + plan');
  assert.equal(call.images[0].data, subject, 'Image 1 = the subject photo as sent');
  const m = await sharp(Buffer.from(call.images[1].data, 'base64')).metadata();
  assert.ok(Math.abs(m.width / m.height - 2 / 3) < 0.01, 'plan padded to the 2:3 the AI makes');
  assert.equal(m.width, 819, '4:5 is padded top and bottom, not stretched');
  assert.match(call.prompt, /watercolor painting of a wide river/);
  assert.match(call.prompt, /Image 2 is a layout plan/);
  assert.match(call.prompt, /a band across the bottom of the frame/);
  assert.equal(saved.length, 1);
  const out = await sharp(Buffer.from(saved[0].data, 'base64')).metadata();
  assert.ok(Math.abs(out.width / out.height - 0.8) < 0.01, `cropped back to 4:5, got ${out.width}×${out.height}`);
  assert.equal(out.width, 1664, 'full resolution');
  assert.equal(saved[0].meta.page, 'poster');
  assert.equal(saved[0].meta.posterScene, 'riverside');
  assert.equal(saved[0].meta.posterLayout, key);
  assert.deepEqual(JSON.parse(saved[0].meta.posterGraphic), graphic, 'the graphic is stored with the output');
  assert.equal(saved[0].where.area, 'results');
  assert.equal(guides.length, 2, 'subject + plan kept for the audit page');
  assert.equal(usage.length, 1);
  assert.equal(usage[0].page, 'poster');
  assert.equal(usage[0].status, 'ok');
  assert.equal(usage[0].tokens, 4321);
  assert.equal(usage[0].log.model.image, 1);
  assert.equal(usage[0].log.guide.image, 2);
  assert.equal(usage[0].log.element.scene.name, 'ริมน้ำสีน้ำ');
  assert.equal(res.body.src, '/api/files/results/poster-test.jpg');
});

test('/api/poster with parts moved apart: every place named in the prompt and the log', async () => {
  const { app, calls, usage } = setup();
  const { POST } = app('app/api/poster/route.ts');
  const areas = [
    { x: 0.1, y: 0.04, w: 0.8, h: 0.14 },
    { x: 0.55, y: 0.84, w: 0.4, h: 0.1 },
  ];
  const res = await POST({
    model: MODEL,
    aspect: '4:5',
    scene: 'shape',
    subject: await jpeg(600, 800),
    plan: await png(819, 1024),
    areas,
  });
  assert.equal(res.status, 200);
  assert.match(calls[0].prompt, /how large it will be laid over the photo later: /);
  assert.match(calls[0].prompt, /a band across the top of the frame .* and the bottom right of the frame/);
  assert.deepEqual(JSON.parse(usage[0].log.style.area), areas, 'every block in the log');
});

test('สั่งเพิ่มเติม: the instruction goes in before the no-text rule, in both requests', async () => {
  const { app, calls, usage } = setup();
  const { buildPosterPrompt } = app('lib/poster-prompts.ts');
  const { sceneOf, POSTER_EXTRA_MAX } = app('lib/poster.ts');
  const areas = [{ x: 0.1, y: 0.05, w: 0.8, h: 0.25 }];
  for (const layout of [false, true]) {
    const prompt = buildPosterPrompt({ scene: sceneOf('shape'), areas, padded: null, layout, extra: '  ให้ยิ้มกว้างขึ้น  ' });
    const at = prompt.indexOf('Additional instruction from the user: ให้ยิ้มกว้างขึ้น.');
    assert.ok(at > 0, `${layout}: the instruction is in`);
    assert.ok(at < prompt.indexOf('No text anywhere'), `${layout}: before the no-text rule, so that rule still wins`);
    assert.doesNotMatch(
      buildPosterPrompt({ scene: sceneOf('shape'), areas, padded: null, layout, extra: '   ' }),
      /Additional instruction/,
      `${layout}: empty = nothing`,
    );
  }
  const { POST } = app('app/api/poster/route.ts');
  const res = await POST({
    model: MODEL,
    aspect: '4:5',
    scene: 'shape',
    subject: await jpeg(600, 800),
    plan: await png(819, 1024),
    area: AREA,
    extra: 'ก'.repeat(POSTER_EXTRA_MAX + 50),
  });
  assert.equal(res.status, 200);
  assert.ok(calls[0].prompt.includes(`Additional instruction from the user: ${'ก'.repeat(POSTER_EXTRA_MAX)}.`));
  assert.ok(!calls[0].prompt.includes('ก'.repeat(POSTER_EXTRA_MAX + 1)), 'cut to the max');
  assert.equal(usage[0].log.style.extra.length, POSTER_EXTRA_MAX, 'logged for the audit page');
});

test('cut-out cleanup: small scattered pieces dropped, two people kept', () => {
  const { app } = setup();
  const { cleanMask } = app('lib/cutout-mask.ts');
  const W = 40,
    H = 30;
  const m = new Float32Array(W * H);
  const fill = (x0, y0, x1, y1, v = 1) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * W + x] = v;
  };
  fill(2, 2, 14, 25); // person 1
  fill(18, 3, 28, 26); // person 2 (a bit smaller, separate)
  fill(32, 26, 34, 28); // blocky fragment under them
  fill(36, 2, 37, 3, 0.6); // speck
  fill(14, 10, 18, 11, 0.05); // faint haze between them (below 0.1)
  const out = cleanMask(m, W, H);
  assert.equal(out[5 * W + 5], 1, 'person 1 kept');
  assert.equal(out[10 * W + 20], 1, 'person 2 kept');
  assert.equal(out[27 * W + 33], 0, 'fragment dropped');
  assert.equal(out[2 * W + 36], 0, 'speck dropped');
  assert.equal(out[10 * W + 15], 0, 'faint haze dropped');
  const one = new Float32Array(W * H).fill(0);
  one[0] = 1;
  assert.equal(cleanMask(one, W, H), one, 'a single piece is left as it is');
});

test('prompt with the subject cut out and placed by the user: keep its spot and size, rebuild the background', () => {
  const { app } = setup();
  const { buildPosterPrompt } = app('lib/poster-prompts.ts');
  const { sceneOf, areaWords } = app('lib/poster.ts');
  const area = { x: 0.1, y: 0.05, w: 0.8, h: 0.25 };
  const prompt = buildPosterPrompt({ scene: sceneOf('halftone'), areas: [area], padded: 'top-bottom', layout: true });
  const sentences = prompt.split(/(?<=\.) (?=[A-Z])/);
  assert.match(
    sentences[0],
    /from the layout in Image 1: the subject is already placed where it belongs and at the size/,
  );
  assert.match(sentences[1], /^Most important: the subject stays exactly as in Image 2/);
  assert.match(
    prompt,
    /keeps its position and scale from Image 1 \(where its head or top is and how big it is\): do not move, enlarge or shrink it\./,
  );
  assert.match(sentences[2], /^The subject photo may be imperfect .*: show the subject as it would look in a perfect/);
  // a dish photographed from above is shown from the shot's angle, not stood up like a wheel (user's pizza, 23 Nov)
  assert.match(
    sentences[3],
    /^If it is a product or food photographed from another angle than this shot \(for example a dish seen from straight above\), show it from this shot's camera angle, resting naturally in the same place and at the same size; a person keeps their pose\.$/,
  );
  // a rough cut-out (23 Nov: legs lost under the poster's title) is completed, not drawn half
  assert.match(
    sentences[4],
    /^The cut-out may be rough: .*complete them naturally, continuing past the frame edge if needed/,
  );
  // background left inside the cut-out (24 Nov: the bottle's carry loops kept the old room, drawn dark) is not the subject
  assert.equal(
    sentences[5],
    "The cut-out may also still hold bits of the original photo's background: seen through holes and loops (a bottle's carry loop, a bag or cup handle, the gap between an arm and the body) or as patches and stray fragments along the edges, plus any watermark or code stamped on the photo; none of these are part of the subject: show the new background through every hole and loop, and leave the rest out.",
  );
  assert.match(prompt, /No text anywhere in the image/);
  assert.match(
    prompt,
    /only a plain placeholder: replace it completely with a designed graphic background: bold pop art/,
  );
  assert.match(
    prompt,
    /not a photo of a real place; .*with a soft shadow on the design so it sits in it, and no cut-out edge shows/,
  );
  assert.match(prompt, /Image 3 is a layout plan of the final poster/);
  assert.ok(prompt.includes(areaWords(area)));
  assert.match(prompt, /the text in Image 3 is added later by the designer/);
  assert.match(prompt, /no cut-out edge shows/);
  assert.match(prompt, /margins of Image 1 and Image 3 will be cropped away/);
  assert.doesNotMatch(prompt, /hero|filling the frame/, 'the user chose the size');
  const own = buildPosterPrompt({ scene: null, areas: [area], padded: null, layout: true });
  assert.match(own, /The background in Image 1 is the real place/);
  assert.match(own, /the place's own signs and lettering exactly as they are/);
  assert.match(own, /apart from the subject leave out any other people/);
  assert.match(own, /only the place's own signs in Image 1 stay as they are/);
  assert.doesNotMatch(own, /placeholder|cropped away/);
  assert.doesNotMatch(prompt + own, /\b(she|her|woman)\b/i);
});

test('/api/poster with a placed cut-out: composite, cut-out, text guide; own photo stays inside the composite', async () => {
  const { app, calls, usage, guides } = setup();
  const { POST } = app('app/api/poster/route.ts');
  const subject = await jpeg(400, 600);
  const base = { model: MODEL, aspect: '4:5', subject, plan: await png(819, 1024), area: AREA };
  const res = await POST({ ...base, scene: 'shape', layout: await png(819, 1024) });
  assert.equal(res.status, 200);
  const [call] = calls;
  assert.equal(call.images.length, 3, 'composite + cut-out + text guide');
  const m0 = await sharp(Buffer.from(call.images[0].data, 'base64')).metadata();
  assert.ok(Math.abs(m0.width / m0.height - 2 / 3) < 0.01, 'the composite is padded like the plan');
  assert.equal(call.images[1].data, subject, 'Image 2 = the cut-out as sent');
  assert.match(call.prompt, /from the layout in Image 1/);
  assert.match(call.prompt, /replace it completely with a designed graphic background: a flat solid color/);
  assert.equal(usage[0].log.pose.image, 1);
  assert.equal(usage[0].log.model.image, 2);
  assert.equal(usage[0].log.guide.image, 3);
  assert.equal(guides.length, 3, 'composite, cut-out and guide kept for the audit page');
  // own photo of the place: it is inside the composite, never sent on its own
  const own = await POST({ ...base, scene: null, background: await jpeg(600, 800), layout: await png(819, 1024) });
  assert.equal(own.status, 200);
  assert.equal(calls[1].images.length, 3);
  assert.match(calls[1].prompt, /The background in Image 1 is the real place/);
  assert.equal(typeof usage[1].log.element.scene, 'string');
  // the composite and the guide are padded by the same amount: they must be the same size
  const bad = await POST({ ...base, scene: 'shape', layout: await png(800, 1000) });
  assert.equal(bad.status, 400);
  const junk = await POST({ ...base, scene: 'shape', layout: 'not base64!' });
  assert.equal(junk.status, 400);
  assert.equal(calls.length, 2);
});

test("/api/poster with the user's own background photo: subject, background, plan", async () => {
  const { app, calls, saved, usage, guides } = setup();
  const { POST } = app('app/api/poster/route.ts');
  const subject = await jpeg(600, 800),
    background = await jpeg(1024, 768);
  const res = await POST({
    model: MODEL,
    aspect: '1:1',
    scene: 'shape',
    subject,
    background,
    plan: await png(1024, 1024),
    area: { x: 0.04, y: 0.1, w: 0.46, h: 0.8 },
    key: '<script>',
  });
  assert.equal(res.status, 200);
  const [call] = calls;
  assert.equal(call.opt.size, '2048x2048');
  assert.equal(call.images.length, 3);
  assert.equal(call.images[0].data, subject);
  assert.equal(call.images[1].data, background);
  assert.match(call.prompt, /in the place shown in Image 2/);
  assert.match(call.prompt, /Image 3 is a layout plan/);
  assert.match(call.prompt, /a column down the left side/);
  assert.doesNotMatch(call.prompt, /flat solid color/, 'the own photo wins over a scene id');
  assert.doesNotMatch(call.prompt, /cropped away/, '1:1 needs no padding');
  assert.equal(saved[0].meta.posterScene, undefined);
  assert.equal(saved[0].meta.posterLayout, undefined, 'a bad key is not stored');
  assert.equal(saved[0].meta.caption, 'โปสเตอร์ · ฉากของฉัน');
  assert.equal(guides.length, 3);
  assert.equal(usage[0].log.element.scene.image, 2);
  assert.equal(usage[0].log.guide.image, 3);
});

test('commercial food & e-commerce stages, templates, palettes, and zone subject auto-placement', async () => {
  const { app, calls, saved } = setup();
  const p = app('lib/poster.ts');
  const { buildPosterPrompt } = app('lib/poster-prompts.ts');
  const { POST } = app('app/api/poster/route.ts');

  const stageIds = ['dark-wood', 'cafe-wood', 'food-splash', 'studio-podium', 'dark-spotlight', 'pastel-ecom'];
  for (const id of stageIds) {
    const s = p.sceneOf(id);
    assert.ok(s, `missing stage scene ${id}`);
    assert.equal(s.kind, 'stage');
  }
  for (const s of p.POSTER_SCENES) {
    assert.ok(s.kind === 'graphic' || s.kind === 'stage', `${s.id} has valid kind`);
  }

  for (const tplId of [
    'bogo',
    'launch',
    'compare',
    'spec',
    'tiers',
    'paired',
    'shipping',
    'pack',
    'orbit',
    'hook',
    'gift',
    'bundle',
    'callout',
    'marketplace',
    'priceburst',
    'menulist',
    'delivery',
    'flash',
    'coupon',
    'review',
  ]) {
    const tpl = p.POSTER_TEMPLATES.find((t) => t.id === tplId);
    assert.ok(tpl, `missing template ${tplId}`);
    assert.ok(tpl.sections.length <= p.MAX_AREAS, `${tplId} sections within MAX_AREAS`);
    const pal = tplId === 'marketplace' ? 'shopee' : tplId === 'review' || tplId === 'coupon' ? 'berry' : 'gold';
    const place = p.startPlace(tpl.zones[0], '1:1');
    const g = {
      template: tpl.id,
      place: { ...place, x: Math.round(place.x * 1e4) / 1e4, y: Math.round(place.y * 1e4) / 1e4 },
      items: {},
      palette: pal,
      texts: p.sampleTexts(tpl),
    };
    const jsonStr = JSON.stringify(g);
    assert.ok(jsonStr.length <= p.GRAPHIC_MAX, `${tplId} within GRAPHIC_MAX`);
    assert.deepEqual(p.readGraphic(jsonStr, '1:1'), g, `${tplId} round-trips`);
  }

  // startSubjectForZone shifts subjects clear of graphic zones
  const top = p.startSubjectForZone(1, '1:1', 'top');
  const left = p.startSubjectForZone(1, '1:1', 'left');
  const right = p.startSubjectForZone(1, '1:1', 'right');
  const bottom = p.startSubjectForZone(1, '1:1', 'bottom');
  assert.deepEqual(top, p.startSubject(1, '1:1'));
  assert.ok(left.x > 0.6, 'left graphic moves subject right');
  assert.ok(right.x < 0.4, 'right graphic moves subject left');
  assert.ok(bottom.y < 0.5, 'bottom graphic moves subject upward');

  // stage prompt uses photographic lighting + real ground + strict no-text in both layout modes
  const area = { x: 0.04, y: 0.1, w: 0.46, h: 0.8 };
  for (const layout of [false, true]) {
    const prompt = buildPosterPrompt({ scene: p.sceneOf('dark-wood'), areas: [area], padded: null, layout });
    assert.match(prompt, /commercial social media photograph/);
    assert.match(prompt, /rests on a surface that belongs in this place/);
    assert.match(prompt, /real contact shadow/);
    assert.match(prompt, /No text anywhere in the image/);
    assert.doesNotMatch(prompt, /flat, clean illustration/);
  }

  const res = await POST({
    model: MODEL,
    aspect: '1:1',
    scene: 'dark-wood',
    subject: await jpeg(600, 600),
    plan: await png(1024, 1024),
    areas: [area],
    graphic: {
      template: 'callout',
      place: p.startPlace('left', '1:1'),
      items: {},
      palette: 'gold',
      texts: p.sampleTexts(p.templateOf('callout')),
    },
  });
  assert.equal(res.status, 200);
  assert.equal(saved[0].meta.posterScene, 'dark-wood');
  assert.match(calls[0].prompt, /charred-wood dining backdrop/);
});

// ตัวหลักหลายรูป (ผู้ใช้ 23 พ.ย.): เรียงกันในที่ที่ชิ้นเดียวจะได้ · พรอมต์รูปละชิ้น · route ส่งทุกชิ้นตามลำดับ
test('several subjects: placed side by side where one would go, same height, inside the poster', () => {
  const { app } = setup();
  const p = app('lib/poster.ts');
  assert.deepEqual(
    p.arrangeSubjects([0.6], '4:5', 'top'),
    [p.startSubjectForZone(0.6, '4:5', 'top')],
    'one = as before',
  );
  for (const zone of ['top', 'bottom', 'left', 'right'])
    for (const aspects of [
      [0.5, 1.2],
      [0.4, 0.8, 1.5],
    ]) {
      const places = p.arrangeSubjects(aspects, '4:5', zone);
      const rects = places.map((pl, i) => p.subjectRect(pl, aspects[i], '4:5'));
      assert.equal(new Set(places.map((pl) => pl.h)).size, 1, 'same height');
      assert.equal(new Set(places.map((pl) => pl.y)).size, 1, 'same baseline');
      for (let i = 1; i < rects.length; i++) {
        assert.ok(rects[i].x > rects[i - 1].x, 'left to right in the order added');
        assert.ok(Math.abs(rects[i - 1].x + rects[i - 1].w - rects[i].x) < 1e-9, 'touching, not overlapping');
      }
      assert.ok(rects[0].x >= -1e-9 && rects.at(-1).x + rects.at(-1).w <= 1 + 1e-9, `${zone}: the row fits the width`);
      const one = p.startSubjectForZone(
        aspects.reduce((s, a) => s + a, 0),
        '4:5',
        zone,
      );
      const row = (rects[0].x + rects.at(-1).x + rects.at(-1).w) / 2;
      assert.ok(Math.abs(row - one.x) < 1e-9, `${zone}: the row sits where one subject of that width would`);
    }
  assert.equal(p.POSTER_SUBJECTS_MAX, 3);
});

test('prompt with several placed subjects: one detail image each, kept separate, plan after them', () => {
  const { app } = setup();
  const { buildPosterPrompt } = app('lib/poster-prompts.ts');
  const { sceneOf } = app('lib/poster.ts');
  const areas = [{ x: 0.1, y: 0.05, w: 0.8, h: 0.25 }];
  const two = buildPosterPrompt({ scene: sceneOf('shape'), areas, padded: 'top-bottom', layout: true, subjects: 2 });
  const sentences = two.split(/(?<=\.) (?=[A-Z])/);
  // several subjects (user's pizza + salad, 23 Nov): the layout is a rough guide, the AI styles one shot
  assert.match(
    sentences[0],
    /from the layout in Image 1: it shows roughly where the two subjects go and how much of the frame they fill together\.$/,
  );
  assert.match(
    sentences[1],
    /^Most important: every subject stays exactly as in its own detail image: Images 2 and 3 show the subjects of Image 1 one by one in full detail, from left to right/,
  );
  assert.doesNotMatch(two, /do not move|already placed|where they overlap in Image 1/);
  assert.match(
    sentences[2],
    /^The subject photos may be imperfect .*: show every subject as it would look in a perfect professional photograph.*each subject's design stays exactly the same/,
  );
  assert.match(
    sentences[3],
    /^Arrange the subjects in that space into one natural, well-styled shot, .*one shared camera angle and perspective for all of them \(.*a dish seen from straight above lies flat on the table.*\), each at its real-life size next to the others, resting on the same surface, grouped closely and overlapping where that looks natural; people keep the position, scale and pose shown in Image 1\.$/,
  );
  assert.match(
    sentences[4],
    /^Keep the two subjects separate: never merge them, make them look alike, duplicate one or leave one out\.$/,
  );
  assert.match(
    sentences[6],
    /^The cut-outs may also still hold bits of the original photo's background: .*none of these are part of any subject/,
  );
  assert.match(two, /Image 4 is a layout plan of the final poster/);
  assert.match(two, /the text in Image 4 is added later by the designer/);
  assert.match(two, /margins of Image 1 and Image 4 will be cropped away/);
  assert.match(two, /the subjects stay real photographs on top of it/);
  assert.match(two, /with the same light on all of them/);
  assert.doesNotMatch(two, /Image 3 is a layout plan|the subject stays exactly/);
  const three = buildPosterPrompt({ scene: null, areas, padded: null, layout: true, subjects: 3, extra: 'add steam' });
  assert.match(three, /the three subjects/);
  assert.match(three, /Images 2, 3 and 4 show the subjects/);
  assert.match(three, /Image 5 is a layout plan/);
  assert.match(three, /apart from the subjects leave out any other people/);
  assert.match(three, /Relight the subjects together/);
  assert.match(three, /Each subject that is a product or food rests on a surface/);
  assert.ok(three.indexOf('Additional instruction from the user: add steam.') < three.indexOf('No new text'));
  // one subject = the single-subject prompt, word for word
  assert.equal(
    buildPosterPrompt({ scene: sceneOf('shape'), areas, padded: null, layout: true, subjects: 1 }),
    buildPosterPrompt({ scene: sceneOf('shape'), areas, padded: null, layout: true }),
  );
  assert.doesNotMatch(two + three, /\b(she|her|woman)\b/i);
});

test('/api/poster with several cut-outs: composite, each cut-out in order, then the text guide', async () => {
  const { app, calls, usage, guides } = setup();
  const { POST } = app('app/api/poster/route.ts');
  const [a, b, c, d] = await Promise.all([jpeg(400, 600), jpeg(500, 300), jpeg(300, 300), jpeg(200, 200)]);
  const base = { model: MODEL, aspect: '4:5', scene: 'shape', plan: await png(819, 1024), areas: [AREA] };
  const res = await POST({ ...base, subjects: [a, b], layout: await png(819, 1024) });
  assert.equal(res.status, 200);
  const [call] = calls;
  assert.equal(call.images.length, 4, 'composite + 2 cut-outs + text guide');
  assert.equal(call.images[1].data, a, 'Image 2 = first cut-out (left)');
  assert.equal(call.images[2].data, b, 'Image 3 = second cut-out');
  assert.match(call.prompt, /Images 2 and 3 show the subjects/);
  assert.match(call.prompt, /Image 4 is a layout plan/);
  const log = usage[0].log;
  assert.equal(log.pose.image, 1);
  assert.equal(log.model.image, 2);
  assert.equal(log.model.name, 'ตัวหลัก 1 (ตัดพื้นหลังแล้ว)');
  assert.deepEqual(
    log.element.accessories.map((x) => [x.image, x.name]),
    [[3, 'ตัวหลัก 2 (ตัดพื้นหลังแล้ว)']],
  );
  assert.equal(log.guide.image, 4);
  assert.equal(log.style.subjects, '2');
  assert.equal(guides.length, 4, 'composite, both cut-outs and the guide kept for the audit page');
  // one cut-out sent as a list = the single-subject request
  const one = await POST({ ...base, subjects: [a], layout: await png(819, 1024) });
  assert.equal(one.status, 200);
  assert.equal(calls[1].images.length, 3);
  assert.equal(usage[1].log.model.name, 'ตัวหลัก (ตัดพื้นหลังแล้ว)');
  assert.deepEqual(usage[1].log.element.accessories, []);
  assert.equal(usage[1].log.style.subjects, undefined);
  // refused before any AI call
  for (const [patch, why] of [
    [{ subjects: [a, b] }, 'several subjects need the placed layout'],
    [{ subjects: [a, b, c, d], layout: await png(819, 1024) }, 'more than 3'],
    [{ subjects: [], layout: await png(819, 1024) }, 'empty list'],
    [{ subjects: [a, 'not base64!'], layout: await png(819, 1024) }, 'a bad cut-out'],
  ]) {
    const bad = await POST({ ...base, ...patch });
    assert.equal(bad.status, 400, why);
  }
  assert.equal(calls.length, 2);
});

// อาร์ตไดเรกเตอร์ (ผู้ใช้ 23 พ.ย.): ไม่ส่งภาพวางผัง AI จัดที่วาง/ขนาด/มุมกล้องเอง รายละเอียดเหมือนเดิม · ที่วางบนเวที = ไอเดียคร่าวๆ
test('art-director prompt: the AI places, turns and sizes the subjects itself, details kept, the user placement only a hint', () => {
  const { app } = setup();
  const { buildPosterPrompt } = app('lib/poster-prompts.ts');
  const { sceneOf, areaWords } = app('lib/poster.ts');
  const areas = [{ x: 0.15, y: 0.04, w: 0.7, h: 0.29 }];
  const hint = { x: 0.03, y: 0.55, w: 0.95, h: 0.4 };
  const split = (s) => s.split(/(?<=\.) (?=[A-Z])/);
  // one cut-out on a stage scene
  const one = buildPosterPrompt({ scene: sceneOf('dark-wood'), areas, padded: null, subjects: 1, cut: true, hint });
  const s1 = split(one);
  assert.match(
    s1[0],
    /^Act as an experienced art director and photographer: create a commercial social media photograph of the subject from Image 1 photographed in a moody dark charred-wood/,
  );
  assert.match(s1[1], /^Most important: the subject stays exactly as in Image 1: /);
  assert.match(s1[2], /^The subject photo may be imperfect/);
  assert.match(
    s1[3],
    /^As the art director, decide where the subject goes, how large it is and from which camera angle it is seen.*may be moved, turned, re-angled and resized \(a dish photographed from straight above can lie flat on the table.*every detail stays as in its photo, and a person keeps their pose\.$/,
  );
  assert.equal(
    s1[4],
    `The user's rough idea for where the subject goes: ${areaWords(hint)}; follow it loosely where it works, or improve it.`.replace(
      'subject goes',
      'subject go',
    ),
  );
  assert.match(one, /The subject is cut out of its photo onto white.*the white is not part of the subject/);
  assert.match(one, /show the new background through every hole and loop/);
  assert.match(one, /Image 2 is a layout plan of the final poster/);
  assert.match(one, /no cut-out edge shows/);
  assert.doesNotMatch(one, /Image 1 is|layout in Image 1|do not move/);
  // two cut-outs + own place photo: Images 1 and 2 = subjects, Image 3 = the place, Image 4 = text guide
  const own = buildPosterPrompt({
    scene: null,
    areas,
    padded: 'top-bottom',
    subjects: 2,
    cut: true,
    extra: 'on a picnic',
  });
  const s2 = split(own);
  assert.match(
    s2[0],
    /create a photograph for a social media poster showing the two subjects from Images 1 and 2 in the place shown in Image 3\.$/,
  );
  assert.match(
    s2[1],
    /^Most important: every subject stays exactly as in its own photo \(Images 1 and 2, one subject each\)/,
  );
  assert.match(
    own,
    /As the art director, arrange the two subjects into one natural, well-styled shot.*a dish seen from straight above lies flat on the table/,
  );
  assert.match(own, /Keep the two subjects separate/);
  assert.match(own, /Image 3 is the setting: keep its surfaces/);
  assert.match(own, /Image 4 is a layout plan/);
  assert.match(own, /only the place's own signs from Image 3 stay as they are; the text in Image 4 is added later/);
  assert.match(own, /Light the subjects together to match the setting's light/);
  assert.match(own, /margins of the layout plan will be cropped away/);
  assert.ok(own.indexOf('Additional instruction from the user: on a picnic.') < own.indexOf('No new text'));
  assert.doesNotMatch(own, /rough idea/, 'no hint sent = no hint line');
  // whole photo (ไม่ตัดพื้นหลัง): the earlier whole-photo prompt, not the art director (user, 23 Nov: that version is best for now)
  const whole = buildPosterPrompt({ scene: sceneOf('shape'), areas, padded: null });
  assert.match(
    whole,
    /^Create a social media poster image: the subject from Image 1 as a real photograph on a designed graphic background/,
  );
  assert.match(
    whole,
    /only its placement may change \(where it stands in the scene, how it is turned and how it rests\)/,
  );
  assert.match(whole, /The photo in Image 1 may be imperfect/);
  assert.doesNotMatch(whole, /art director|cut out of its photo|no cut-out edge shows|every hole and loop/);
  assert.doesNotMatch(one + own + whole, /\b(she|her|woman)\b/i);
});

test('/api/poster art-director request: cut-outs, own place photo, text guide in that order; the hint is checked and logged', async () => {
  const { app, calls, usage } = setup();
  const { POST } = app('app/api/poster/route.ts');
  const [a, b, bg] = await Promise.all([jpeg(400, 600), jpeg(500, 300), jpeg(1024, 768)]);
  const hint = { x: 0.03, y: 0.55, w: 0.95, h: 0.4 };
  const base = { model: MODEL, aspect: '4:5', plan: await png(819, 1024), areas: [AREA] };
  const res = await POST({ ...base, scene: 'dark-wood', subjects: [a, b], cut: true, hint });
  assert.equal(res.status, 200);
  assert.deepEqual(
    calls[0].images.slice(0, 2).map((i) => i.data),
    [a, b],
  );
  assert.equal(calls[0].images.length, 3, 'two cut-outs + text guide, no composite');
  assert.match(calls[0].prompt, /^Act as an experienced art director/);
  assert.match(calls[0].prompt, /The user's rough idea for where the subjects go: /);
  let log = usage[0].log;
  assert.equal(log.model.image, 1);
  assert.equal(log.element.accessories[0].image, 2);
  assert.equal(log.guide.image, 3);
  assert.equal(log.pose.mode, 'โปสเตอร์ · AI จัดวาง (อาร์ตไดเรกเตอร์)');
  assert.equal(log.style.hint, JSON.stringify(hint));
  // own place photo: after the cut-outs, before the guide
  const own = await POST({ ...base, scene: null, background: bg, subjects: [a, b], cut: true });
  assert.equal(own.status, 200);
  assert.equal(calls[1].images.length, 4);
  assert.equal(calls[1].images[2].data, bg);
  log = usage[1].log;
  assert.equal(log.element.scene.image, 3);
  assert.equal(log.guide.image, 4);
  assert.match(calls[1].prompt, /Image 3 is the setting/);
  // refused before any AI call
  for (const [patch, why] of [
    [{ scene: 'dark-wood', subjects: [a, b] }, 'several subjects must be cut out'],
    [{ scene: 'dark-wood', subjects: [a], cut: true, hint: { x: 0.5, y: 0.5, w: 0.9, h: 0.2 } }, 'hint past the edge'],
    [{ scene: 'dark-wood', subjects: [a], cut: true, hint: 'bottom' }, 'hint not a rect'],
  ]) {
    const bad = await POST({ ...base, ...patch });
    assert.equal(bad.status, 400, why);
  }
  assert.equal(calls.length, 2);
});

// ภาพวางผัง + รูปเดิมของผู้ใช้ (ไอเดียผู้ใช้ 24 พ.ย.: ขวดน้ำ ห่วงหิ้วที่ตัดไม่ออกได้ฉากใหม่ทะลุเมื่อ AI เห็นรูปเดิม)
test('layout with the original photos: Image 1 says where and which part, Image 2.. how it really looks; leftovers are background', async () => {
  const { app, calls, usage } = setup();
  const { buildPosterPrompt } = app('lib/poster-prompts.ts');
  const { sceneOf } = app('lib/poster.ts');
  const areas = [{ x: 0.42, y: 0.02, w: 0.57, h: 0.13 }];
  const split = (s) => s.split(/(?<=\.) (?=[A-Z])/);
  const one = split(
    buildPosterPrompt({ scene: sceneOf('pastel-ecom'), areas, padded: null, layout: true, original: true }),
  );
  assert.match(
    one[1],
    /^Most important: the subject stays exactly as in Image 2, the original photo it was cut out of: /,
  );
  assert.match(one[1], /do not move, enlarge or shrink it\.$/);
  assert.equal(
    one[4],
    'Image 2 shows the subject in its original surroundings: Image 1 shows which part of that photo is the subject; use Image 2 for how it really looks, and never take its background, other objects, people, text or watermark.',
  );
  assert.match(
    one[5],
    /^The cut-out in Image 1 may be rough: .*complete them as Image 2 shows them.*Image 2 shows they are background: show the new background through every hole and loop and leave the fragments out\.$/,
  );
  assert.ok(
    !one.some((s) => s.startsWith('The cut-out may also still hold')),
    'the cut-out-only leftover line is replaced',
  );
  assert.ok(one.some((s) => s.startsWith('Image 3 is a layout plan')));
  const two = buildPosterPrompt({ scene: null, areas, padded: null, layout: true, original: true, subjects: 2 });
  assert.match(
    two,
    /Images 2 and 3 are the original photos the subjects of Image 1 were cut out of, one each, from left to right/,
  );
  assert.match(
    two,
    /Images 2 and 3 show the subjects in their original surroundings: Image 1 shows which part of each photo is the subject/,
  );
  assert.match(two, /Image 4 is a layout plan/);
  // without the flag: the cut-out prompt as before
  assert.doesNotMatch(
    buildPosterPrompt({ scene: sceneOf('pastel-ecom'), areas, padded: null, layout: true }),
    /original surroundings/,
  );
  // route: the flag only counts with a layout, and the log names the photo
  const { POST } = app('app/api/poster/route.ts');
  const photo = await jpeg(800, 800);
  const base = { model: MODEL, aspect: '4:5', scene: 'pastel-ecom', plan: await png(819, 1024), areas: [AREA] };
  const res = await POST({ ...base, subjects: [photo], original: true, layout: await png(819, 1024) });
  assert.equal(res.status, 200);
  assert.equal(calls[0].images[1].data, photo, 'Image 2 = the original photo as sent');
  assert.match(calls[0].prompt, /Image 2 shows the subject in its original surroundings/);
  assert.equal(usage[0].log.model.name, 'ตัวหลัก (รูปเดิม ไม่ตัด)');
  assert.equal(usage[0].log.style.subjectImage, 'รูปเดิม (ไม่ตัด)');
  const noLayout = await POST({ ...base, subject: photo, original: true });
  assert.equal(noLayout.status, 200);
  assert.doesNotMatch(calls[1].prompt, /original surroundings/, 'no layout = the flag is ignored');
});

// AI ออกแบบพื้นหลังเอง (ผู้ใช้ 24 พ.ย.: "that's a lot better" หลังทดสอบขวดน้ำ 2 ภาพ): จากสินค้า คำบนกราฟิก สีหลัก
test('AI-designed background: built from the product, the graphic words (never written) and the main color', async () => {
  const { app, calls, usage } = setup();
  const { buildPosterPrompt } = app('lib/poster-prompts.ts');
  const p = app('lib/poster.ts');
  const scene = p.sceneOf('ai-design');
  assert.equal(scene.kind, 'design');
  assert.ok(!p.POSTER_SCENES.some((s) => s.id === 'ai-design'), 'its own card, not in the ready-made lists');
  const design = { words: ['ลด 30%', 'พร้อมส่ง ของแท้ 100%'], color: '#F7C843' };
  const areas = [{ x: 0.42, y: 0.02, w: 0.57, h: 0.13 }];
  const layout = buildPosterPrompt({ scene, areas, padded: null, layout: true, original: true, design });
  assert.match(
    layout,
    /The background in Image 1 is only a plain placeholder: replace it completely with an eye-catching advertising background that an art director designs for this exact product and message, like a professional Thai social media ad: base it on what the subject is \(for a drink, its own ingredients/,
  );
  assert.match(
    layout,
    /on what the poster says \("ลด 30%", "พร้อมส่ง ของแท้ 100%": use the meaning only for the mood and theme, never write these words\)/,
  );
  assert.match(layout, /and on its main color #F7C843 with one or two colors that go well with it/);
  assert.match(
    layout,
    /use a clearly lighter or deeper shade than its own colored shapes \(badges, bands, frames\), so they still stand out; the subject stays a real photograph on top of it\./,
  );
  assert.match(layout, /The background is a designed advertising scene, not a real place; .*no cut-out edge shows\./);
  assert.doesNotMatch(layout, /flat, clean illustration/);
  assert.match(layout, /No text anywhere in the image/, 'the words are never drawn');
  // whole photo (ไม่ตัดพื้นหลัง): same brief, no cut-out words in the light line
  const whole = buildPosterPrompt({ scene, areas, padded: null, design });
  assert.match(
    whole,
    /^Create a social media poster image: the subject from Image 1 as a real photograph on an eye-catching advertising background/,
  );
  assert.match(
    whole,
    /The background is a designed advertising scene, not a real place; the subject keeps its photographic look, lit to match the design's main light and colors, with a soft shadow so it sits in it\./,
  );
  // route: words and color come from the graphic sent with the request
  const { POST } = app('app/api/poster/route.ts');
  const graphic = {
    template: 'pill',
    place: p.startPlace('top', '4:5'),
    items: {},
    palette: 'chili',
    texts: { title: 'เมนูใหม่!', sub: 'ชานมไข่มุก' },
  };
  const res = await POST({
    model: MODEL,
    aspect: '4:5',
    scene: 'ai-design',
    subjects: [await jpeg(400, 600)],
    original: true,
    layout: await png(819, 1024),
    plan: await png(819, 1024),
    areas: [AREA],
    graphic,
  });
  assert.equal(res.status, 200);
  assert.match(calls[0].prompt, /\("เมนูใหม่!", "ชานมไข่มุก": use the meaning only/);
  assert.match(calls[0].prompt, new RegExp(`main color ${p.paletteOf('chili').accent}`));
  assert.equal(usage[0].log.element.scene.name, 'AI ออกแบบให้');
  assert.match(usage[0].log.element.scene.text, /^ออกแบบจาก: เมนูใหม่! \/ ชานมไข่มุก · สี #/);
});

test('สไตล์ภาพ (25 Nov): black-and-white and print looks get their own prompt; photo stays word for word', async () => {
  const { app, calls, usage } = setup();
  const { buildPosterPrompt } = app('lib/poster-prompts.ts');
  const { sceneOf } = app('lib/poster.ts');
  const design = sceneOf('ai-design');
  const base = { scene: design, areas: [AREA], padded: 'top-bottom', layout: true, subjects: 1, original: true };
  const d = { words: ['Soul After Six', 'Live Music'], color: '#e8823a' };
  assert.equal(
    buildPosterPrompt({ ...base, design: d, look: 'photo' }),
    buildPosterPrompt({ ...base, design: d }),
    'photo = the prompt as before',
  );
  const bw = buildPosterPrompt({ ...base, design: d, look: 'bw' });
  assert.match(bw, /^Create a vintage black-and-white poster image from the layout in Image 1/);
  assert.match(bw, /Most important: the subject stays exactly as in Image 2, the original photo/);
  assert.match(bw, /Only its colors change: the whole image is black and white/);
  assert.match(bw, /club stage at night/, 'a music poster gets a club');
  assert.match(bw, /"Soul After Six \/ Live Music": use the meaning only/);
  assert.match(bw, /Image 3 is a layout plan/);
  assert.doesNotMatch(bw, /photorealistic, with natural colors/);
  const print = buildPosterPrompt({ ...base, design: d, look: 'print', lookColor: '#e8823a' });
  assert.match(print, /^Create a vintage screen-printed poster illustration/);
  assert.match(print, /redrawn as an illustration but stays clearly the same as in Image 2/);
  assert.match(print, /limited palette of #e8823a with black and warm cream/);
  assert.match(print, /Symbols such as music notes and stars are not text/);
  assert.doesNotMatch(print, /perfect professional photograph/, 'no photo polish for a drawing');
  // three subjects: their own photos are Image 2..4, the text guide Image 5
  const many = buildPosterPrompt({ ...base, subjects: 3, design: d, look: 'print' });
  assert.match(many, /Images 2, 3 and 4|Images 2 to 4|Image 2, 3 and 4/);
  assert.match(many, /Image 5 is a layout plan/);
  assert.match(many, /Keep the three subjects separate/);
  // own place photo, whole photo (no cut-out): Image 2 is the place, redrawn in the look
  const whole = buildPosterPrompt({ scene: null, areas: [AREA], padded: null, look: 'print', lookColor: '#111111' });
  assert.match(whole, /^Create a vintage screen-printed poster illustration showing the subject from Image 1/);
  assert.match(whole, /Image 2 is the setting: .*redraw it in the same print style/);
  assert.match(whole, /Image 3 is a layout plan/);
  // the route: unknown look refused before any AI call; the graphic's colour goes into the print prompt; logged
  const { POST } = app('app/api/poster/route.ts');
  const ok = {
    model: MODEL,
    aspect: '4:5',
    scene: 'ai-design',
    subject: await jpeg(600, 800),
    plan: await png(819, 1024),
    area: AREA,
    graphic: {
      template: 'concert',
      place: { x: 0.5, y: 0.8, w: 0.9, size: 1, align: 'center' },
      palette: '#e8823a',
      texts: { title: 'Soul' },
    },
  };
  assert.equal((await POST({ ...ok, look: 'neon' })).status, 400);
  assert.equal(calls.length, 0);
  const res = await POST({ ...ok, look: 'print' });
  assert.equal(res.status, 200);
  assert.match(calls[0].prompt, /limited palette of #e8823a/);
  assert.equal(usage[0].log.style.look, 'ภาพวาดย้อนยุค');
  await POST(ok);
  assert.doesNotMatch(calls[1].prompt, /screen-printed|black-and-white/, 'no look sent = photo');
});

test('style presets (25 Nov): each look card names a real graphic and colour', () => {
  const { app } = setup();
  const { POSTER_LOOKS, templateOf, paletteFrom, isLook } = app('lib/poster.ts');
  assert.deepEqual(
    POSTER_LOOKS.map((l) => l.id),
    ['photo', 'bw', 'print'],
  );
  assert.equal(POSTER_LOOKS[0].graphic, undefined, 'ภาพถ่าย leaves the chosen graphic alone');
  for (const l of POSTER_LOOKS.filter((x) => x.graphic)) {
    assert.equal(templateOf(l.graphic.template).id, l.graphic.template, l.id);
    assert.ok(paletteFrom(l.graphic.palette), l.id);
  }
  assert.equal(isLook('bw'), true);
  assert.equal(isLook('neon'), false);
});

test("deleted graphic parts (25 Nov): stored with the image, only the template's own parts, words left out of the AI brief", async () => {
  const { app, calls } = setup();
  const { readGraphic, graphicOf } = app('lib/poster.ts');
  const g = {
    template: 'concert',
    place: { x: 0.5, y: 0.8, w: 0.9, size: 1, align: 'center' },
    items: {},
    palette: 'gold',
    texts: { title: 'Soul After Six', footer: 'เข้าชมฟรี', kicker: 'Live Music' },
  };
  assert.equal('hidden' in readGraphic(g), false, 'nothing deleted = no key (older graphics read back the same)');
  const read = readGraphic({ ...g, hidden: ['footer', 'rule', 'price', 'footer', 5] });
  assert.deepEqual(read.hidden, ['rule', 'footer'], "template order, no repeats, only this template's parts");
  assert.equal(read.texts.footer, 'เข้าชมฟรี', 'the words stay so the part can come back');
  assert.deepEqual(graphicOf({ ...g, aspect: '4:5', hidden: [] }), g, 'an empty list is not stored');
  // AI-designed background: a deleted part's words are not used for the design
  const { POST } = app('app/api/poster/route.ts');
  const res = await POST({
    model: MODEL,
    aspect: '4:5',
    scene: 'ai-design',
    subject: await jpeg(600, 800),
    plan: await png(819, 1024),
    area: AREA,
    graphic: { ...g, hidden: ['footer'] },
  });
  assert.equal(res.status, 200);
  assert.match(calls[0].prompt, /Soul After Six/);
  assert.doesNotMatch(calls[0].prompt, /เข้าชมฟรี/);
});

test('deleting parts on a generated poster is not a moved graphic; moving outside the kept space is (25 Nov)', () => {
  const { app } = setup();
  const { layoutFits, generationKey } = app('lib/poster.ts');
  const top = { x: 0.1, y: 0.02, w: 0.8, h: 0.12 },
    bottom = { x: 0.05, y: 0.62, w: 0.9, h: 0.35 };
  const made = generationKey('4:5', [top, bottom], 's', 'scene-ai-design');
  assert.equal(layoutFits(made, generationKey('4:5', [top, bottom], 's', 'x')), true, 'unchanged');
  assert.equal(layoutFits(made, generationKey('4:5', [bottom], 's', 'x')), true, 'top part deleted');
  assert.equal(
    layoutFits(made, generationKey('4:5', [top, { ...bottom, y: 0.8, h: 0.17 }], 's', 'x')),
    true,
    'some bottom parts deleted',
  );
  assert.equal(
    layoutFits(made, generationKey('4:5', [top, { ...bottom, y: 0.3 }], 's', 'x')),
    false,
    'moved up into the picture',
  );
  assert.equal(layoutFits(made, generationKey('1:1', [top, bottom], 's', 'x')), false, 'other aspect');
  assert.equal(layoutFits('', made), true, 'older images without a key never warn');
  assert.equal(layoutFits(made, null), true, 'every part deleted');
});

test('20 new Food & E-Commerce graphic templates: valid metadata, MAX_AREAS, round-trip, and hidden parts', () => {
  const { app } = setup();
  const p = app('lib/poster.ts');
  const NEW_20 = [
    'izakaya',
    'steakhouse',
    'bakery',
    'boba',
    'buffet',
    'setmeal',
    'grandopen',
    'catering',
    'nutrition',
    'halal',
    'payday',
    'doublecover',
    'beforeafter',
    'steps3',
    'specsgrid',
    'hangtag',
    'guarantee',
    'speech',
    'countdown',
    'editorial',
  ];
  assert.equal(NEW_20.length, 20);
  for (const id of NEW_20) {
    const tpl = p.POSTER_TEMPLATES.find((t) => t.id === id);
    assert.ok(tpl, `missing template ${id}`);
    assert.ok(tpl.sections.length <= p.MAX_AREAS, `${id} sections <= MAX_AREAS`);
    assert.ok(tpl.zones.length > 0 && tpl.zones.every(p.isZone), `${id} valid zones`);
    for (const f of tpl.fields) assert.ok([...f.sample].length <= f.max, `${id}.${f.id} sample <= max`);
    const place = p.startPlace(tpl.zones[0], '4:5');
    const g = {
      template: tpl.id,
      place: { ...place, x: Math.round(place.x * 1e4) / 1e4, y: Math.round(place.y * 1e4) / 1e4 },
      items: {},
      palette: 'chili',
      texts: p.sampleTexts(tpl),
    };
    const json = JSON.stringify(g);
    assert.ok(json.length <= p.GRAPHIC_MAX, `${id} fits GRAPHIC_MAX`);
    assert.deepEqual(p.readGraphic(json, '4:5'), g, `${id} round-trips`);
    const firstPart = tpl.sections[0];
    const pruned = p.readGraphic({ ...g, hidden: [firstPart, 'nonexistent', firstPart] }, '4:5');
    assert.deepEqual(pruned.hidden, [firstPart], `${id} hidden parts pruned cleanly`);
  }
});

test('poster fonts: curated styles are assigned across templates and preserved cleanly in readGraphic', () => {
  const { app } = setup();
  const p = app('lib/poster.ts');
  const styledTemplates = [
    'izakaya',
    'steakhouse',
    'bakery',
    'boba',
    'buffet',
    'setmeal',
    'grandopen',
    'catering',
    'nutrition',
    'halal',
    'payday',
    'doublecover',
    'beforeafter',
    'steps3',
    'specsgrid',
    'hangtag',
    'guarantee',
    'speech',
    'countdown',
    'editorial',
    'market-print',
  ];
  const used = new Set(styledTemplates.map((id) => p.resolvedFontId({ template: id })));
  for (const f of p.POSTER_FONTS) {
    assert.ok(used.has(f.id), `font ${f.id} is a template default`);
  }
  assert.equal(p.resolvedFontId({ template: 'market-print' }), 'pridi');
  assert.equal(p.resolvedFontId({ template: 'izakaya' }), 'serif');
  assert.equal(p.resolvedFontId({ template: 'izakaya', font: 'mali' }), 'mali');

  const place = { x: 0.5, y: 0.2, w: 0.9, size: 1, align: 'center' };
  const base = { template: 'izakaya', place, items: {}, palette: 'chili', texts: { title: 'แซลมอน' } };
  assert.equal('font' in p.readGraphic(base, '4:5'), false, 'unset font omitted');
  assert.equal(p.readGraphic({ ...base, font: 'serif' }, '4:5').font, 'serif', 'valid font round-trips');
  assert.equal(p.readGraphic({ ...base, template: 'market-print', font: 'pridi' }, '4:5').font, 'pridi');
  assert.equal('font' in p.readGraphic({ ...base, font: 'unknown-font' }, '4:5'), false, 'invalid font dropped');
  assert.equal(p.graphicOf({ ...base, aspect: '4:5', font: 'chakra' }).font, 'chakra');
});

test('poster text effects: 6 Photoshop-style presets assigned across templates and preserved cleanly', () => {
  const { app } = setup();
  const p = app('lib/poster.ts');
  assert.equal(p.POSTER_EFFECTS.length, 6);
  assert.equal(p.resolvedEffectId({ template: 'buffet' }), 'pop3d');
  assert.equal(p.resolvedEffectId({ template: 'steakhouse' }), 'metallic');
  assert.equal(p.resolvedEffectId({ template: 'bakery' }), 'sticker');
  assert.equal(p.resolvedEffectId({ template: 'specsgrid' }), 'glow');
  assert.equal(p.resolvedEffectId({ template: 'editorial' }), 'clean');
  assert.equal(p.resolvedEffectId({ template: 'editorial', effect: 'tilt' }), 'tilt');

  const place = { x: 0.5, y: 0.2, w: 0.9, size: 1, align: 'center' };
  const base = { template: 'buffet', place, items: {}, palette: 'chili', texts: { price: '฿299' } };
  assert.equal('effect' in p.readGraphic(base, '4:5'), false, 'unset effect omitted');
  assert.equal(p.readGraphic({ ...base, effect: 'pop3d' }, '4:5').effect, 'pop3d');
  assert.equal('effect' in p.readGraphic({ ...base, effect: 'neon-unknown' }, '4:5'), false, 'invalid effect dropped');
  assert.equal(p.graphicOf({ ...base, aspect: '4:5', effect: 'metallic' }).effect, 'metallic');
});

test('artist graphic (27 Nov): the giant name sits behind the subject; its place goes to the AI as "behind", other prompts unchanged', async () => {
  const { app, calls, usage } = setup();
  const p = app('lib/poster.ts');
  const { buildPosterPrompt } = app('lib/poster-prompts.ts');
  const tpl = p.templateOf('artist');
  assert.equal(tpl.id, 'artist');
  assert.deepEqual([...tpl.behind], ['title'], 'only the giant name is behind');
  for (const id of tpl.behind) assert.ok(tpl.sections.includes(id), 'behind parts are real parts');
  for (const t of p.POSTER_TEMPLATES)
    if (t.id !== 'artist') assert.equal(t.behind, undefined, `${t.id}: no part behind the subject`);
  const g = {
    template: 'artist',
    place: { x: 0.5, y: 0.8, w: 0.9, size: 1, align: 'left' },
    items: {},
    palette: 'mono',
    texts: p.sampleTexts(tpl),
  };
  assert.deepEqual(p.readGraphic(g, '2:3').texts, g.texts, 'every sample field round-trips');

  const name = { x: 0.02, y: 0.05, w: 0.96, h: 0.4 };
  const bottom = { x: 0.02, y: 0.74, w: 0.96, h: 0.24 };
  for (const layout of [false, true]) {
    for (const look of ['photo', 'bw', 'print']) {
      const base = { scene: p.sceneOf('pastel-ecom'), areas: [bottom], padded: null, layout, look };
      const without = buildPosterPrompt(base);
      const withBehind = buildPosterPrompt({ ...base, behind: [name] });
      assert.equal(buildPosterPrompt({ ...base, behind: [] }), without, 'no behind parts = the same words as before');
      assert.doesNotMatch(without, /behind the subject: the subject stands in front/);
      assert.match(
        withBehind,
        /The big word of the layout plan .* will be printed on the backdrop behind the subject: the subject stands in front of it and may overlap it, head and face included; keep the backdrop there plain and even/,
      );
      assert.ok(withBehind.indexOf('is a layout plan') < withBehind.indexOf('The big word'), 'right after the plan');
    }
  }

  const { POST } = app('app/api/poster/route.ts');
  const req = {
    model: MODEL,
    aspect: '4:5',
    scene: 'shape',
    subject: await jpeg(600, 800),
    plan: await png(819, 1024),
  };
  const bad = await POST({ ...req, areas: [bottom], behind: [{ x: 0.5, y: 0.5, w: 2, h: 0.1 }] });
  assert.equal(bad.status, 400, 'a broken behind area is refused before any AI call');
  assert.equal(calls.length, 0);
  const res = await POST({ ...req, areas: [bottom], behind: [name] });
  assert.equal(res.status, 200);
  assert.match(calls[0].prompt, /printed on the backdrop behind the subject/);
  assert.deepEqual(JSON.parse(usage[0].log.style.behind), [name], 'logged');
  const plain = await POST({ ...req, areas: [bottom] });
  assert.equal(plain.status, 200);
  assert.doesNotMatch(calls[1].prompt, /printed on the backdrop behind the subject/);
  assert.equal('behind' in usage[1].log.style, false);
});

test('poster page is superadmin-only for now (27 Nov): a customer is refused before any AI call or save', async () => {
  const { app, calls, saved } = setup({ customer: true });
  const { POST } = app('app/api/poster/route.ts');
  const res = await POST({
    model: MODEL,
    aspect: '4:5',
    scene: 'shape',
    subject: await jpeg(600, 800),
    plan: await png(819, 1024),
    area: AREA,
  });
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
  assert.equal(saved.length, 0);
  const update = app('app/api/update/route.ts');
  const edit = await update.POST({ src: '/api/files/results/x.jpg', posterGraphic: {} });
  assert.equal(edit.status, 403, 'graphic edits too');
});

test('poster access (27 Nov): superadmin and Tae Morestudio only', () => {
  const { app } = setup();
  const { canUsePoster } = app('lib/account.ts');
  const { posterAllowed, POSTER_ACCOUNTS } = app('lib/auth.ts');
  const tae = '23c15a27-89f5-4309-9d97-a089c76fc898';
  assert.deepEqual(POSTER_ACCOUNTS, [tae], 'only Tae Morestudio is added');
  assert.equal(posterAllowed('customer', tae), true);
  assert.equal(posterAllowed('customer', 'someone-else'), false);
  assert.equal(posterAllowed('superadmin', 'admin'), true);
  assert.equal(posterAllowed('customer', undefined), false);
  // the account read at sign-in carries the answer (lib/supabase/server.ts)
  assert.equal(canUsePoster({ id: tae, email: 'x', role: 'customer', poster: true }), true);
  assert.equal(canUsePoster({ id: 'someone-else', email: 'x', role: 'customer', poster: false }), false);
  assert.equal(canUsePoster({ id: 'admin', email: 'x', role: 'superadmin' }), true);
  assert.equal(canUsePoster(null), true, 'no login (local) = open');
});
