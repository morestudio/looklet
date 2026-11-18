// รูปย่อ (10 พ.ย. เกินโควตา egress ของ Supabase แผนฟรี): ตาราง/ประวัติรูปขอ /api/files?w=512 -> อ่านรูปย่อที่เก็บไว้ ไม่ดึงรูปเต็ม
// Supabase เป็นของปลอมในหน่วยความจำ นับว่าดาวน์โหลดอะไรไปบ้าง ไม่ต่อเน็ต ไม่เสียเงิน: node scripts/test-thumbs.mjs
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { appLoader } from './lib/load-app.mjs';

const objects = new Map(),
  rows = [],
  downloads = [],
  uploads = [],
  removed = [];
const fakeSupabase = {
  createClient: () => ({
    from: () => {
      let path;
      const q = {
        select: () => q,
        eq: (_c, v) => {
          path = v;
          return q;
        },
        maybeSingle: async () => ({ data: rows.find((r) => r.path === path) ?? null }),
        insert: async (row) => {
          rows.push(row);
          return { error: null };
        },
        delete: () => ({
          eq: async (_c, v) => {
            rows.splice(
              rows.findIndex((r) => r.path === v),
              1,
            );
            return { error: null };
          },
        }),
      };
      return q;
    },
    storage: {
      from: () => ({
        upload: async (key, data) => {
          uploads.push(key);
          objects.set(key, Buffer.from(data));
          return { error: null };
        },
        download: async (key) => {
          downloads.push(key);
          return objects.has(key)
            ? { data: new Blob([objects.get(key)]), error: null }
            : { data: null, error: { message: 'Object not found' } };
        },
        remove: async (keys) => {
          removed.push(...keys);
          keys.forEach((k) => objects.delete(k));
          return { error: null };
        },
      }),
    },
  }),
};
let role = 'customer',
  owner = null; // owner = the calling account (null = owner-less files)
const app = appLoader({
  env: { ...process.env, SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SECRET_KEY: 'test-only' },
  overrides: {
    'lib/account.ts': {
      me: () => ({ role }),
      ownerMeta: () => (owner ? { owner } : {}),
      visibleTo: (meta) => (owner ? meta?.owner === owner : !meta?.owner),
    },
    '@supabase/supabase-js': fakeSupabase,
  },
});
// appLoader ส่ง package npm ให้ require จริง -> แทน @supabase/supabase-js ก่อนโหลด storage
const Module = (await import('node:module')).default;
const realLoad = Module._load;
Module._load = function (id, ...rest) {
  return id === '@supabase/supabase-js' ? fakeSupabase : realLoad.call(this, id, ...rest);
};
const storage = app('lib/storage.ts');

const photo = await sharp({ create: { width: 1664, height: 2080, channels: 3, background: '#c8a080' } })
  .jpeg({ quality: 97 })
  .toBuffer();
const parts = (src) => src.slice('/api/files/'.length).split('/');

// 1) เก็บรูปใหม่ = เก็บรูปย่อ 512 ไปด้วยทันที
const src = await storage.saveImage({ area: 'results' }, photo.toString('base64'), 'image/jpeg', { caption: 'new' });
const key = parts(src).join('/'),
  file = key.split('/').pop();
// link/path stays results/<file>; the file and its thumbnail sit in the owner's folder (owner-less = team/)
const thumb = `team/thumbs/512/results/model/${file}`;
assert.equal(key, `results/${file}`);
assert.deepEqual(uploads, [`team/results/model/${file}`, thumb]);
assert.deepEqual([rows.at(-1).path, rows.at(-1).object], [key, `team/results/model/${file}`]);
const stored = objects.get(thumb);
const meta = await sharp(stored).metadata();
assert.equal(meta.width, 512);
assert(stored.length < 60_000, `thumbnail is small (${stored.length} bytes)`);

// 2) เปิดรูปย่อ = ดาวน์โหลดแค่รูปย่อ ไม่แตะรูปเต็ม
downloads.length = 0;
const t = await storage.readThumb(parts(src));
assert.equal(t.type, 'image/jpeg');
assert.deepEqual(downloads, [thumb], 'A stored thumbnail never downloads the full photo');

// 3) no thumbnail yet (saving it failed): the first view downloads the full photo once and keeps a thumbnail, later views read only that
const oldObject = 'accounts/u-1/uploads/models/old.png',
  oldThumb = 'accounts/u-1/thumbs/512/uploads/models/old.jpg';
objects.set(oldObject, photo);
rows.push({ path: 'uploads/models/old.png', object: oldObject, area: 'uploads', kind: 'models', meta: {} });
downloads.length = 0;
uploads.length = 0;
assert(await storage.readThumb(['uploads', 'models', 'old.png']));
assert.deepEqual(downloads, [oldThumb, oldObject]);
assert.deepEqual(uploads, [oldThumb]);
downloads.length = 0;
assert(await storage.readThumb(['uploads', 'models', 'old.png']));
assert.deepEqual(downloads, [oldThumb], 'Second view reads only the saved thumbnail');

// 4) สิทธิ์: รูปของลูกค้าคนอื่น -> null ก่อนดาวน์โหลดอะไร · superadmin เปิดได้ (หน้าตรวจงาน)
const aliceObject = 'accounts/alice/results/model/alice.jpg';
rows.push({ path: 'results/alice.jpg', object: aliceObject, area: 'results', kind: null, meta: { owner: 'alice' } });
objects.set(aliceObject, photo);
downloads.length = 0;
assert.equal(await storage.readThumb(['results', 'alice.jpg']), null);
assert.deepEqual(downloads, []);
role = 'superadmin';
assert(await storage.readThumb(['results', 'alice.jpg']));
role = 'customer';
// path แปลก / ไฟล์เสีย -> null ไม่พัง
assert.equal(await storage.readThumb(['..', 'etc', 'passwd']), null);
objects.set('team/results/model/broken.jpg', Buffer.from('not an image'));
rows.push({
  path: 'results/broken.jpg',
  object: 'team/results/model/broken.jpg',
  area: 'results',
  kind: null,
  meta: {},
});
assert.equal(await storage.readThumb(['results', 'broken.jpg']), null);

// 5) เก็บรูปย่อไม่ได้ (รูปเสีย) ต้องไม่ทำให้การเก็บรูปพัง
uploads.length = 0;
const odd = await storage.saveImage(
  { area: 'uploads', kind: 'models' },
  Buffer.from('xx').toString('base64'),
  'image/png',
  { name: 'odd' },
);
assert(odd.startsWith('/api/files/uploads/models/'));
assert.equal(uploads.length, 1, 'No thumbnail for an unreadable file, but the file itself is saved');

// 6) ลบรูป = ลบรูปย่อด้วย
await storage.deleteImage(src);
assert.deepEqual(removed, [`team/results/model/${file}`, thumb]);

// 6a) โฟลเดอร์ตามบัญชี: every account -> accounts/<id>/, หน้าสินค้า -> results/product, รูปที่เพิ่มเอง -> uploads/<ประเภท> · เปิดรูปอ่านจาก object
const { objectKey, thumbKey } = app('lib/storage-supabase.ts');
assert.equal(
  thumbKey('accounts/u-1/results/product/a.png'),
  'accounts/u-1/thumbs/512/results/product/a.jpg',
  'A thumbnail sits in the same account folder, always .jpg',
);
assert.equal(thumbKey('accounts/u-1/uploads/poses/b.webp'), 'accounts/u-1/thumbs/512/uploads/poses/b.jpg');
assert.equal(thumbKey('team/results/model/c.jpg'), 'team/thumbs/512/results/model/c.jpg');
assert.equal(objectKey('results/a.png', 'results', null, {}), 'team/results/model/a.png');
assert.equal(
  objectKey('results/a.png', 'results', null, { page: 'product', owner: 'u-1' }),
  'accounts/u-1/results/product/a.png',
);
assert.equal(
  objectKey('uploads/poses/b.jpg', 'uploads', 'poses', { owner: 'u-1' }),
  'accounts/u-1/uploads/poses/b.jpg',
);
assert.equal(
  objectKey('results/c.png', 'results', null, { owner: '../x y' }),
  'accounts/___x_y/results/model/c.png',
  'Odd owner ids cannot escape the folder',
);
owner = 'cust-9';
const mine = await storage.saveImage({ area: 'uploads', kind: 'products' }, photo.toString('base64'), 'image/jpeg', {
  name: 'bag',
  page: 'product',
});
const mineFile = mine.split('/').pop();
assert.equal(mine, `/api/files/uploads/products/${mineFile}`, 'Links keep the old shape');
assert.equal(rows.at(-1).object, `accounts/cust-9/uploads/products/${mineFile}`);
const productResult = await storage.saveImage({ area: 'results' }, photo.toString('base64'), 'image/jpeg', {
  page: 'product',
});
assert.equal(rows.at(-1).object, `accounts/cust-9/results/product/${productResult.split('/').pop()}`);
downloads.length = 0;
assert(await storage.readImage(parts(mine)));
assert.deepEqual(
  downloads,
  [`accounts/cust-9/uploads/products/${mineFile}`],
  'Full photos are read from their new folder',
);
owner = null;
assert.equal(await storage.readImage(parts(mine)), null, 'Team accounts still cannot open a customer photo');

// 6b) red highlight of a local edit: in the account's own guides/ folder, owner in the link, no images row (not in any library),
// only the superadmin opens it, deleteImage refuses it
owner = 'cust-9';
const rowsBefore = rows.length;
const custGuide = await storage.saveGuide(Buffer.from('cust-guide'));
assert.match(custGuide, /^\/api\/files\/guides\/cust-9\/[\w-]+\.jpg$/);
assert(objects.has(`accounts/cust-9/guides/${custGuide.split('/').pop()}`));
assert.equal(await storage.readImage(parts(custGuide)), null, 'Customers cannot open guides, even their own');
owner = null;
const guideSrc = await storage.saveGuide(Buffer.from('red-guide'));
assert.match(guideSrc, /^\/api\/files\/guides\/team\/[\w-]+\.jpg$/);
assert(objects.has(`team/guides/${guideSrc.split('/').pop()}`));
assert.equal(rows.length, rowsBefore, 'A guide is not a library image');
assert.equal(await storage.readImage(parts(guideSrc)), null, 'Team accounts cannot open guides');
assert.equal(await storage.readThumb(parts(guideSrc)), null);
role = 'superadmin';
assert.equal(String((await storage.readImage(parts(guideSrc))).data), 'red-guide');
assert.equal(String((await storage.readImage(parts(custGuide))).data), 'cust-guide');
assert.equal(
  String((await storage.readThumb(parts(guideSrc))).data),
  'red-guide',
  'The audit page thumbnail is the saved guide itself',
);
assert.equal(await storage.deleteImage(guideSrc), false);
role = 'customer';
assert.equal(await storage.readImage(['guides', '..', 'x.jpg']), null);
assert.equal(await storage.readImage(['guides', 'x.jpg']), null, 'Guide links always name the owner');

// 7) route: ?w=512 ใช้ readThumb เท่านั้น (ไม่อ่านรูปเต็ม) · ขนาดอื่นได้รูปเต็ม
const calls = [];
const route = appLoader({
  overrides: {
    'lib/route.ts': { get: (fn) => fn },
    'lib/storage.ts': {
      GRID_THUMB: 512,
      readThumb: async () => {
        calls.push(['thumb']);
        return { data: Buffer.from('t'), type: 'image/jpeg' };
      },
      readImage: async () => {
        calls.push(['full']);
        return { data: Buffer.from('full'), type: 'image/png' };
      },
    },
  },
})('app/api/files/[...path]/route.ts');
const ctx = { params: Promise.resolve({ path: ['results', 'a.png'] }) };
const thumbRes = await route.GET(new Request('http://localhost/api/files/results/a.png?w=512'), ctx);
assert.equal(thumbRes.headers.get('Content-Type'), 'image/jpeg');
assert.match(thumbRes.headers.get('Cache-Control'), /max-age=31536000/);
assert.deepEqual(calls, [['thumb']]);
calls.length = 0;
await route.GET(new Request('http://localhost/api/files/results/a.png?w=400'), {
  params: Promise.resolve({ path: ['results', 'a.png'] }),
});
assert.deepEqual(calls, [['full']]);

Module._load = realLoad;
console.log(
  'Storage passed: new photos filed under team/ or accounts/<id>/ (results/model, results/product, uploads/<type>) with unchanged links; thumbnails and red highlight images in the same account folder, guides readable only by the superadmin; saved with each new image, read without downloading the full photo, old images thumbnailed once then reused, same privacy as full photos, broken files never break saving, deleted with the photo, and the route only reads thumbnails for ?w=.',
);
