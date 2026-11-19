# Google Analytics 4 — วิธีตั้งค่าและอ่านรายงาน

โค้ดอยู่ที่ `lib/analytics.ts` (รายการ event + ตัวช่วย) และ `components/Analytics.tsx` (ตัวโหลด GA ใน root layout)

## ตัวเลขหลัก (North Star)

**รูปที่ใช้ได้** คือรูปที่ถูก **ดาวน์โหลด หรือ เก็บเข้า gallery** (event `image_kept`) ให้ดูทุกสัปดาห์ เฉพาะ `role = customer`

1. จำนวนลูกค้าที่มี `image_kept` อย่างน้อย 1 ครั้งในสัปดาห์นั้น
2. สัดส่วน session ที่มี `generate_success` แล้วตามด้วย `image_kept`

ห้ามนับจำนวน event `image_kept` ตรงๆ เพราะรูปเดียวอาจดาวน์โหลดหลายครั้ง ให้นับเฉพาะ `first = true` หรือนับเป็นจำนวนคน/session

`first = true` คือเบราว์เซอร์นี้ไม่เคยเก็บรูปนี้มาก่อน (จำไว้ใน localStorage ล่าสุด 500 รูป) ถ้าลูกค้าเปิดจากเครื่องอื่นหรือล้างข้อมูลเว็บ จะนับรูปเดิมอีกครั้ง ก่อน 19 พ.ย. ระบบจำได้แค่ภายในการเปิดหน้าครั้งเดียว พอโหลดหน้าใหม่แล้วโหลดรูปเดิมซ้ำก็นับเป็น `first` อีก ตัวเลขช่วงนั้นจึงสูงเกินจริง

## 1. ตั้งค่าครั้งแรก

1. สร้าง GA4 property: timezone **Asia/Bangkok**, สกุลเงิน **THB**
2. Data streams → Web → `https://lolostyleshot.vercel.app` → คัดลอก Measurement ID (`G-…`)
3. ใน Vercel (project `looklet`) → Settings → Environment Variables → เลือก **Production** เท่านั้น:
   - `NEXT_PUBLIC_GA_ID` = `G-…`
   - `ANALYTICS_SALT` = สุ่มสตริงยาวๆ (เช่นจาก `openssl rand -hex 32`) ใช้เป็นกุญแจ hash (HMAC) account id เป็น user_id ถ้าไม่ตั้ง จะไม่ส่ง user_id และห้ามเปลี่ยนค่าทีหลัง เพราะ user_id จะเปลี่ยนตามทั้งหมด
   - แล้ว redeploy
4. Admin → Data collection → **ปิด Google signals** และ**ปิด User-provided data collection** (ถ้าเปิดไว้ GA จะสแกนหาอีเมล/เบอร์โทร/ที่อยู่บนหน้าเว็บเอง ตอนนี้ไม่ถูกส่งเพราะ `ad_user_data` เป็น denied แต่ไม่ควรเปิดไว้)
5. Admin → Data retention → **14 เดือน**
6. Web stream → Enhanced measurement: เปิด "Page changes based on browser history events" (ค่าเริ่มต้นเปิดอยู่แล้ว) และ**ปิด Form interactions** (การกดการ์ดในแผงถูกนับเป็น `form_start`/`form_submit` จนรกรายงาน ปิดแล้ว 19 พ.ย.)
7. Admin → Events → ทำเครื่องหมาย **Key event** ให้ `image_kept` และ `generate_success` (event จะขึ้นในรายการหลังมีคนยิงครั้งแรก ประมาณ 24 ชม.)
8. Admin → Custom definitions:
   - **User-scoped dimension**: `role`
   - **Event-scoped dimensions**: `page`, `step`, `via`, `first`, `reason`, `kind`, `preset`, `aspect`, `quality`, `shot_type`, `pose_mode`, `pose_src`, `scene_src`, `model_src`, `product_src`, `outfit_slots`, `prop_style`, `angle`, `framing`, `hand_pose`, `method`
   - **Custom metric**: `duration_s` (หน่วย: วินาที)
   - ต้องสร้าง dimension ก่อน รายงานถึงจะเห็นค่านั้น (ไม่ย้อนหลัง) จึงควรทำวันเดียวกับที่ deploy

## 2. รายการ event

| event | เมื่อไหร่ | params หลัก |
|---|---|---|
| `login` | หน้าแรกหลังเข้าสู่ระบบ | `method` (invite_code / password) |
| `sign_up` | ส่งคำขอสมัครที่ `/signup` สำเร็จ (ยังรออนุมัติ ไม่มี user_id) | `method` (password) |
| `step_done` | เลือกอะไรจริงใน step ครั้งแรก (ต่อการเปิดหน้า) | `page`, `step` |
| `step_view` | กดเปลี่ยน step | `page`, `step`, `step_index` |
| `upload` | อัปโหลดรูปสำเร็จ | `page`, `kind`, `extra_photo` |
| `generate_start` | กดสร้างรูป (ผ่านการตรวจแล้ว) | `page` + ตัวเลือกที่ใช้ |
| `generate_success` | ได้รูปแล้ว | เหมือน start + `duration_s` (ชุดภาพ: นับเมื่อได้รูปแรก) |
| `generate_error` | สร้างไม่สำเร็จ | เหมือน start + `reason`, `duration_s` |
| `quota_blocked` | server ตอบ 403 (โค้ดถูกปิด) / 429 (token หมด) | `route`, `status` |
| `image_kept` ⭐ | ดาวน์โหลด / แชร์ / บันทึกในแอป / เก็บเข้า gallery | `page`, `via`, `edited`, `first` |
| `gallery_remove` | เอาออกจาก gallery | `page` |
| `local_edit` | แก้เฉพาะจุด | `page`, `painted`, `result`, `reason` |
| `creative_ideas` | ขอ 3 ไอเดียใน Creative Packshot | `result`, `reason`, `retry`, `has_idea`, `has_inspiration` |

ค่า `reason`: `quota`, `safety` (AI ปฏิเสธภาพ), `provider` (AI ล่ม/ผิดพลาด), `timeout`, `too_large`, `invalid`, `server`, `client` (เน็ตหลุดหรือย่อรูปในเครื่องไม่สำเร็จ)

ค่า `*_src`: `sample` (รูปตัวอย่างในแอป), `upload` (รูปของลูกค้าเอง), `none`, และค่าเฉพาะ เช่น `preset`, `text`, `pose_photo`

## 3. รายงานที่ต้องสร้าง (Explore)

ทุกรายงานให้ใส่ **User segment: `role` exactly matches `customer`** (ตัด superadmin ที่ใช้ทดสอบหนักออก) ตั้งแต่ 16 พ.ย. `role` มีแค่ 2 ค่า: `superadmin` กับ `customer` (ลูกค้าทุกคน ไม่ว่าเข้าด้วยโค้ดหรืออีเมล ไม่มี `team` แล้ว บัญชีทดสอบก็นับเป็น customer) ข้อมูลก่อน 16 พ.ย. ยังมีค่า `team` ของบัญชีอีเมลเดิมอยู่ ใช้ *segment แบบ user* ไม่ใช่ filter ราย event เพราะ `page_view` แรกของแต่ละหน้าไม่มี role ติดไป (ดูข้อจำกัด) segment แบบ user จะนับทุก event ของลูกค้าคนนั้นรวม page_view ด้วย

1. **Funnel หน้านางแบบ** (Funnel exploration, open funnel):
   `page_view` (page path = `/`) → `step_done` (page = model) → `generate_start` (page = model) → `generate_success` (page = model) → `image_kept` (page = model)
   แล้วทำตาราง `step_done` แยกตาม `step` เพื่อดูว่า step ไหนคนไม่แตะ
2. **Funnel หน้าสินค้า**: `page_view` (`/product`) → `step_done` (step = product) → `step_done` (step = shot) → `generate_start` → `generate_success` → `image_kept` (page = product) breakdown ตาม `shot_type`
3. **ตัวเลือกที่ได้รูปใช้ได้** (Free form): rows = `preset` (หรือ `shot_type`, `scene_src`, `pose_src`), columns = event name (`generate_success`, `image_kept` ที่ `first = true`) → ดูสัดส่วน
4. **ปัญหา**: `generate_error` แยกตาม `reason` + `quota_blocked` + ค่าเฉลี่ย `duration_s` ของ `generate_success` แยกตาม `page`/`quality`
5. **North Star รายสัปดาห์**: Segment overlap หรือ Free form ที่ metric = Total users, filter event = `image_kept`, แยกตามสัปดาห์

## 4. ข้อจำกัดที่ควรรู้

- **`page_view` แรกไม่มี user_id และ role**: tag ของ property นี้ config ตัวเองทันทีที่สคริปต์โหลดและไม่สนพารามิเตอร์ใน `gtag('config')` (เจอ 16 พ.ย.) โค้ดจึงส่ง user_id/role ผ่าน `gtag('set')` แทน ทุก event หลังจากนั้นมีครบ ยกเว้น page_view อัตโนมัติตัวแรกของการโหลดหน้า
- **คนน้อย ตัวเลขอาจถูกซ่อน**: GA ซ่อนแถวที่มีผู้ใช้น้อย (thresholding) การปิด Google signals ช่วยลดปัญหานี้ ถ้าเห็นไอคอนสามเหลี่ยมสีส้มในรายงาน แปลว่าบางแถวถูกซ่อนอยู่
- **Ad blocker** ตัดข้อมูลบางส่วน (มักประมาณ 10–30%) ตัวเลขจำนวนรูปที่สร้างที่แม่นจริงให้ดูจาก `/admin` (ตาราง usage)
- **ไม่มี cookie banner** ตามที่เจ้าของโปรเจกต์ตัดสินใจ (16 พ.ย.) ปิด ads/Google signals และไม่ส่ง PII ไว้แล้ว แต่ยังเป็นความเสี่ยง PDPA ที่รู้แล้วยอมรับ
- เก็บข้อมูลเฉพาะบน `lolostyleshot.vercel.app` ส่วน localhost และ Vercel preview ไม่ส่ง
- ดูรายคนไม่สะดวกและ join กับ ฿/token ไม่ได้ ถ้าต้องการ ให้เปิด BigQuery export (Admin → BigQuery links, ฟรีสำหรับปริมาณนี้) แล้ว join `user_id` กับ hash ของ account id

## 5. ทดสอบในเครื่อง

```
NEXT_PUBLIC_GA_ID=G-… NEXT_PUBLIC_GA_DEBUG=1 npm run dev
```

แล้วเปิด GA → Admin → **DebugView** จากนั้นเดินตามขั้นตอน login → เลือกของ → สร้างรูป (quality ต่ำ) → ดาวน์โหลด → bookmark ใน DevTools Network ให้ดู request ที่ส่งไป `collect?` ต้องไม่มีอีเมล, invite code หรือข้อความที่พิมพ์สั่ง AI (path รูปจะติดไปใน URL เฉพาะตอนกด ✎ จาก gallery ซึ่งเป็น `?image=` เป็น id รูป ไม่ใช่ข้อมูลส่วนตัว)

`node scripts/test-analytics.mjs` ตรวจตัวช่วยโดยไม่ต้องใช้ GA จริง
