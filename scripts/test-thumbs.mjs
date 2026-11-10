// รูปย่อ (10 พ.ย. เกินโควตา egress ของ Supabase แผนฟรี): ตาราง/ประวัติรูปขอ /api/files?w=512 -> อ่านรูปย่อที่เก็บไว้ ไม่ดึงรูปเต็ม
// Supabase เป็นของปลอมในหน่วยความจำ นับว่าดาวน์โหลดอะไรไปบ้าง ไม่ต่อเน็ต ไม่เสียเงิน: node scripts/test-thumbs.mjs
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { appLoader } from './lib/load-app.mjs';

const objects = new Map(), rows = [], downloads = [], uploads = [], removed = [];
const fakeSupabase = {
  createClient: () => ({
    from: () => {
      let path;
      const q = {
        select: () => q, eq: (_c, v) => { path = v; return q; },
        maybeSingle: async () => ({ data: rows.find((r) => r.path === path) ?? null }),
        insert: async (row) => { rows.push(row); return { error: null }; },
        delete: () => ({ eq: async (_c, v) => { rows.splice(rows.findIndex((r) => r.path === v), 1); return { error: null }; } }),
      };
      return q;
    },
    storage: { from: () => ({
      upload: async (key, data) => { uploads.push(key); objects.set(key, Buffer.from(data)); return { error: null }; },
      download: async (key) => {
        downloads.push(key);
        return objects.has(key) ? { data: new Blob([objects.get(key)]), error: null } : { data: null, error: { message: 'Object not found' } };
      },
      remove: async (keys) => { removed.push(...keys); keys.forEach((k) => objects.delete(k)); return { error: null }; },
    }) },
  }),
};
let role = 'team';
const app = appLoader({ env: { ...process.env, SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SECRET_KEY: 'test-only' }, overrides: {
  'lib/account.ts': { me: () => ({ role }), ownerMeta: () => ({}), visibleTo: (meta) => !meta?.owner },
  '@supabase/supabase-js': fakeSupabase,
} });
// appLoader ส่ง package npm ให้ require จริง -> แทน @supabase/supabase-js ก่อนโหลด storage
const Module = (await import('node:module')).default;
const realLoad = Module._load;
Module._load = function (id, ...rest) { return id === '@supabase/supabase-js' ? fakeSupabase : realLoad.call(this, id, ...rest); };
const storage = app('lib/storage.ts');

const photo = await sharp({ create: { width: 1664, height: 2080, channels: 3, background: '#c8a080' } }).jpeg({ quality: 97 }).toBuffer();
const parts = (src) => src.slice('/api/files/'.length).split('/');

// 1) เก็บรูปใหม่ = เก็บรูปย่อ 512 ไปด้วยทันที
const src = await storage.saveImage({ area: 'results' }, photo.toString('base64'), 'image/jpeg', { caption: 'new' });
const key = parts(src).join('/');
assert.deepEqual(uploads, [key, `thumbs/512/${key}.jpg`]);
const stored = objects.get(`thumbs/512/${key}.jpg`);
const meta = await sharp(stored).metadata();
assert.equal(meta.width, 512);
assert(stored.length < 60_000, `thumbnail is small (${stored.length} bytes)`);

// 2) เปิดรูปย่อ = ดาวน์โหลดแค่รูปย่อ ไม่แตะรูปเต็ม
downloads.length = 0;
const t = await storage.readThumb(parts(src), 512);
assert.equal(t.type, 'image/jpeg');
assert.deepEqual(downloads, [`thumbs/512/${key}.jpg`], 'A stored thumbnail never downloads the full photo');

// 3) รูปเก่า (ก่อนมีรูปย่อ): ครั้งแรกดึงรูปเต็มครั้งเดียวแล้วเก็บรูปย่อ ครั้งต่อไปอ่านแค่รูปย่อ
objects.set('results/old.jpg', photo);
rows.push({ path: 'results/old.jpg', area: 'results', kind: null, meta: {} });
downloads.length = 0; uploads.length = 0;
assert(await storage.readThumb(['results', 'old.jpg'], 512));
assert.deepEqual(downloads, ['thumbs/512/results/old.jpg.jpg', 'results/old.jpg']);
assert.deepEqual(uploads, ['thumbs/512/results/old.jpg.jpg']);
downloads.length = 0;
assert(await storage.readThumb(['results', 'old.jpg'], 512));
assert.deepEqual(downloads, ['thumbs/512/results/old.jpg.jpg'], 'Second view reads only the saved thumbnail');

// 4) สิทธิ์: รูปของลูกค้าคนอื่น -> null ก่อนดาวน์โหลดอะไร · superadmin เปิดได้ (หน้าตรวจงาน)
rows.push({ path: 'results/alice.jpg', area: 'results', kind: null, meta: { owner: 'alice' } });
objects.set('results/alice.jpg', photo);
downloads.length = 0;
assert.equal(await storage.readThumb(['results', 'alice.jpg'], 512), null);
assert.deepEqual(downloads, []);
role = 'superadmin';
assert(await storage.readThumb(['results', 'alice.jpg'], 400));
role = 'team';
// path แปลก / ไฟล์เสีย -> null ไม่พัง
assert.equal(await storage.readThumb(['..', 'etc', 'passwd'], 512), null);
objects.set('results/broken.jpg', Buffer.from('not an image'));
rows.push({ path: 'results/broken.jpg', area: 'results', kind: null, meta: {} });
assert.equal(await storage.readThumb(['results', 'broken.jpg'], 512), null);

// 5) เก็บรูปย่อไม่ได้ (รูปเสีย) ต้องไม่ทำให้การเก็บรูปพัง
uploads.length = 0;
const odd = await storage.saveImage({ area: 'uploads', kind: 'models' }, Buffer.from('xx').toString('base64'), 'image/png', { name: 'odd' });
assert(odd.startsWith('/api/files/uploads/models/'));
assert.equal(uploads.length, 1, 'No thumbnail for an unreadable file, but the file itself is saved');

// 6) ลบรูป = ลบรูปย่อทุกขนาดด้วย
await storage.deleteImage(src);
assert.deepEqual(removed, [key, `thumbs/400/${key}.jpg`, `thumbs/512/${key}.jpg`]);

// 7) route: ?w=512 ใช้ readThumb เท่านั้น (ไม่อ่านรูปเต็ม) · ขนาดอื่นได้รูปเต็ม
const calls = [];
const route = appLoader({ overrides: {
  'lib/route.ts': { get: (fn) => fn },
  'lib/storage.ts': {
    THUMB_WIDTHS: [400, 512],
    readThumb: async (p, w) => { calls.push(['thumb', w]); return { data: Buffer.from('t'), type: 'image/jpeg' }; },
    readImage: async () => { calls.push(['full']); return { data: Buffer.from('full'), type: 'image/png' }; },
  },
} })('app/api/files/[...path]/route.ts');
const ctx = { params: Promise.resolve({ path: ['results', 'a.png'] }) };
const thumbRes = await route.GET(new Request('http://localhost/api/files/results/a.png?w=512'), ctx);
assert.equal(thumbRes.headers.get('Content-Type'), 'image/jpeg');
assert.match(thumbRes.headers.get('Cache-Control'), /max-age=31536000/);
assert.deepEqual(calls, [['thumb', 512]]);
calls.length = 0;
await route.GET(new Request('http://localhost/api/files/results/a.png?w=999'), { params: Promise.resolve({ path: ['results', 'a.png'] }) });
assert.deepEqual(calls, [['full']]);

Module._load = realLoad;
console.log('Thumbnails passed: saved with each new image, read without downloading the full photo, old images thumbnailed once then reused, same privacy as full photos, broken files never break saving, deleted with the photo, and the route only reads thumbnails for ?w=.');
