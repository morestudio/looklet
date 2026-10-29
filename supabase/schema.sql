-- ที่เก็บรูปบน Supabase (lib/storage-supabase.ts) — รันครั้งเดียวต่อโปรเจกต์ รันซ้ำได้ไม่พัง
-- รูป: bucket "images" (private), ข้อมูลรูป: ตาราง images (path = ชื่อ object ใน bucket = path ใน /api/files/...)

create table if not exists public.images (
  path text primary key,                                        -- results/<ไฟล์> หรือ uploads/<ประเภท>/<ไฟล์>
  area text not null check (area in ('results', 'uploads')),
  kind text,                                                    -- ประเภทของรูปที่เพิ่มเอง (null = รูปที่ AI สร้าง)
  meta jsonb not null default '{}'::jsonb,                      -- name / caption / type / set
  created timestamptz not null default now()
);
create index if not exists images_area_kind_created on public.images (area, kind, created desc);

-- เปิด RLS โดยไม่มี policy: เข้าได้เฉพาะ server ที่ใช้ secret key (anon key จากหน้าเว็บอ่านไม่ได้)
alter table public.images enable row level security;

insert into storage.buckets (id, name, public) values ('images', 'images', false) on conflict (id) do nothing;

-- ---------- ลูกค้าทดลองใช้ (27 ต.ค.): โค้ดเชิญ + การใช้งาน ----------
-- โค้ดเชิญ: 1 โค้ด = 1 บัญชีลูกค้าใน auth.users (โค้ดคือรหัสเข้าใช้ ลูกค้าพิมพ์แค่โค้ด) ดูหน้า /admin
create table if not exists public.invites (
  code text primary key,                                        -- โค้ดที่ส่งให้ลูกค้า (admin ต้องคัดลอกได้ จึงเก็บตรงๆ อ่านได้เฉพาะ server)
  user_id uuid not null unique,                                 -- บัญชีที่ผูกกับโค้ด
  label text not null default '',                              -- ชื่อลูกค้า (admin ตั้ง)
  quota int not null default 50 check (quota >= 0),             -- จำนวนรูปแบบเดิม ไม่ใช้แล้ว (ดู token_quota ด้านล่าง)
  disabled boolean not null default false,
  created timestamptz not null default now()
);

-- การใช้งาน: 1 แถว = สร้างรูป 1 ครั้ง (สำเร็จหรือพัง) — หน้า /admin สรุปจากตารางนี้ และนับโควตาจากแถวที่สำเร็จ
create table if not exists public.usage (
  id bigint generated always as identity primary key,
  user_id uuid,                                                 -- null = รันในเครื่องแบบไม่ต้องเข้าสู่ระบบ
  email text,
  page text not null,                                           -- model | product
  action text not null,                                         -- generate | packshot | local-edit | refine-skin
  model text,
  quality text,
  status text not null check (status in ('ok', 'error')),
  cost_thb numeric(10, 2) not null default 0,                   -- ค่า AI โดยประมาณ (lib/usage.ts)
  created timestamptz not null default now()
);
create index if not exists usage_user_created on public.usage (user_id, created desc);

-- โควตาเป็นโทเคน (28 ต.ค.): invites.quota (จำนวนรูป) ไม่ใช้แล้ว · ค่าเริ่มต้นตรงกับ DEFAULT_TOKEN_QUOTA ใน lib/usage.ts
alter table public.invites add column if not exists token_quota int not null default 300000 check (token_quota >= 0);
alter table public.invites alter column token_quota set default 300000; -- เพิ่มจาก 200,000 (28 ต.ค.) · แอปส่งค่าเองทุกครั้งที่สร้างโค้ด
alter table public.usage add column if not exists tokens int;  -- โทเคนที่ AI คิดจริง (null = ไม่รู้ นับแบบประมาณ)

-- เหมือนตาราง images: เปิด RLS ไม่มี policy + ไม่ให้สิทธิ์ anon/authenticated -> เข้าได้เฉพาะ server (secret key)
-- ตารางใหม่ไม่เปิดให้ Data API อัตโนมัติแล้ว (Supabase 2026) จึงให้สิทธิ์ service_role ตรงๆ
alter table public.invites enable row level security;
alter table public.usage enable row level security;
revoke all on public.invites, public.usage from anon, authenticated;
grant select, insert, update, delete on public.invites, public.usage to service_role;
grant usage, select on sequence public.usage_id_seq to service_role;
