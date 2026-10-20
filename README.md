# Looklet

Looklet ห้องลองชุด AI — เลือกนางแบบ + ชุด + ของเสริม + ฉาก ให้ AI สร้างรูป แล้วแต่งหน้า/สีผิวต่อได้ในเครื่อง ไม่เสียเงิน

## รันในเครื่อง

ต้องมี [Node.js](https://nodejs.org) 20.9 ขึ้นไป

```
npm install
npm run dev
```

แล้วเปิด http://localhost:3001 (เปิดได้เฉพาะเครื่องนี้ เครื่องอื่นใน wifi เดียวกันเข้าไม่ได้ จะได้ไม่มีใครใช้ API key ของเรา)
ใช้ port 3001 ไม่ใช่ 3000 จะได้ไม่ชนกับโปรเจกต์ Next.js อื่นที่เปิดค้างไว้

API key ใส่ในไฟล์ `.env` (ไม่ขึ้น GitHub) มีอันเดียวก็ได้ แก้แล้วต้องรีสตาร์ท `npm run dev`

```
GEMINI_API_KEY=...
OPENAI_API_KEY=...
```

## Supabase + เข้าสู่ระบบ

ถ้ามีค่า Supabase ใน env (ดึงด้วย `vercel env pull` ได้ไฟล์ `.env.local`) เว็บจะ
- เก็บรูปบน Supabase แทนโฟลเดอร์ในเครื่อง (`lib/storage-supabase.ts`) — ตาราง/bucket สร้างด้วย `supabase/schema.sql`
- ต้องเข้าสู่ระบบด้วยอีเมล + รหัสผ่านก่อนใช้ทุกหน้า (`proxy.ts`, `lib/auth.ts`) ไม่มีหน้าสมัครเอง

ไม่มีค่า Supabase = ทำงานแบบเดิม เก็บรูปในเครื่อง ไม่ต้องเข้าสู่ระบบ

**ทดสอบในเครื่องไม่ต้องเข้าสู่ระบบ:** ใส่ `NEXT_PUBLIC_LOOKLET_DEV_NO_LOGIN=1` ในไฟล์ `.env.development.local` (มีผลเฉพาะ `npm run dev` บน Vercel ต้องเข้าสู่ระบบเสมอ) — ยังเก็บรูปบน Supabase ชุดเดียวกับเว็บจริง

**เพิ่มคนเข้าเว็บ:** `node --env-file=.env.local scripts/add-user.mjs someone@morestudio.co.th`
(สุ่มรหัสผ่านให้ เจ้าของบัญชีเปลี่ยนเองได้ที่หน้า `/account`)

## โครงสร้าง

| ที่ | คืออะไร |
| --- | --- |
| `components/TryOn.tsx` | หน้าหลัก: เลือก → สร้างรูป → ประวัติรูป (ขั้นใส่หน้าจริงปิดอยู่ เปิดที่ `REAL_FACE`) |
| `components/useRetouchCanvas.ts` | แสดงรูปบน canvas + แต่งรูปตามสไลเดอร์ |
| `lib/catalog.ts` | รายการนางแบบ/ชุด/ของเสริม/ฉาก/แสงสี (เพิ่มรูปใน `public/images` แล้วเพิ่มบรรทัดที่นี่) |
| `lib/prompts.ts` | คำสั่งที่ส่งให้ AI |
| `lib/ai.ts` | เรียก Gemini / OpenAI (ฝั่ง server ถือ key) |
| `lib/storage.ts` | เก็บรูป: มี Supabase ใน env -> `lib/storage-supabase.ts`, ไม่มี -> เก็บลงเครื่อง |
| `lib/genlog.ts` | บันทึกสิ่งที่ส่งให้ AI ทุกครั้งที่เจนรูป ลง `logs/` (1 รูป = 1 ไฟล์) |
| `lib/vision.js`, `lib/beauty.js` | แต่งหน้า/ใส่หน้าจริง ด้วย MediaPipe ทำใน browser |
| `app/api/*` | API: สร้างรูป, อัปโหลด, ลบ, คลังรูป, เปิดไฟล์รูป |

รูปที่ AI สร้างเก็บใน `results/` รูปที่กด "+ เพิ่มรูป" เก็บใน `images/uploads/` (ไม่ขึ้น GitHub ทั้งคู่)

**ดูว่าส่งอะไรให้ AI:** เปิดไฟล์ใน `logs/` ชื่อเดียวกับรูป เช่น `results/20261015-152904-f43438.jpg` → `logs/20261015-152904-f43438.json`
(สร้างไม่สำเร็จ = `logs/<วันเวลา>-<สุ่ม>-error.json`) แต่ละไฟล์แบ่งเป็น
`ai` (โมเดล + ค่าที่ส่ง) / `model` (นางแบบ) / `element` (ชุด ของเสริม ฉาก) / `pose` (ท่าโพสต์) / `style` (แสง กล้อง พร็อพ) / `prompt` (ทีละประโยค)
— `image` = ลำดับรูปที่ AI เห็น (Image n ในพรอมต์), `result` = รูปที่ได้

## ขึ้นใช้งานจริง

```
npm run build
npm start
```

ขึ้น Vercel แล้ว (โปรเจกต์ `looklet`) ใช้ Supabase เก็บรูปและเข้าสู่ระบบ — deploy ด้วย `vercel deploy --prod` (key อยู่ใน Vercel env ไม่ได้อัปขึ้นไปกับโค้ด ดู `.vercelignore`)
