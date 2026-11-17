-- ที่เก็บรูปบน Supabase (lib/storage-supabase.ts) — รันครั้งเดียวต่อโปรเจกต์ รันซ้ำได้ไม่พัง
-- รูป: bucket "images" (private), ข้อมูลรูป: ตาราง images (path = path ใน /api/files/... = id ของรูป, object = ที่อยู่ไฟล์ใน bucket)

create table if not exists public.images (
  path text primary key,                                        -- results/<ไฟล์> หรือ uploads/<ประเภท>/<ไฟล์>
  area text not null check (area in ('results', 'uploads')),
  kind text,                                                    -- ประเภทของรูปที่เพิ่มเอง (null = รูปที่ AI สร้าง)
  meta jsonb not null default '{}'::jsonb,                      -- name / caption / type / set
  created timestamptz not null default now()
);
create index if not exists images_area_kind_created on public.images (area, kind, created desc);
-- 16 Nov: lists (sbList) and the upload cap (sbCountUploads) filter by owner
create index if not exists images_owner_area_kind_created on public.images ((meta->>'owner'), area, kind, created desc);
-- 10 พ.ย.: จัดโฟลเดอร์ใน bucket ตามบัญชี (team/... = คลังร่วมของทีม, customers/<id บัญชี>/... = ลูกค้า) — ลิงก์รูปและ path ไม่เปลี่ยน
-- object = ที่อยู่ไฟล์จริง (objectKey ใน lib/storage-supabase.ts) · null = ไฟล์ยังอยู่ที่ path เดิม (scripts/storage-rearrange.mjs ย้ายให้)
alter table public.images add column if not exists object text;

-- เปิด RLS โดยไม่มี policy: เข้าได้เฉพาะ server ที่ใช้ secret key (anon key จากหน้าเว็บอ่านไม่ได้)
alter table public.images enable row level security;

insert into storage.buckets (id, name, public) values ('images', 'images', false) on conflict (id) do nothing;

-- ---------- ลูกค้าทดลองใช้ (27 ต.ค.): โค้ดเชิญ + การใช้งาน ----------
-- โค้ดเชิญ: 1 โค้ด = 1 บัญชีลูกค้าใน auth.users (โค้ดคือรหัสเข้าใช้ ลูกค้าพิมพ์แค่โค้ด) ดูหน้า /admin
-- 16 พ.ย.: invites -> accounts = 1 แถวต่อบัญชี ทั้งบัญชีโค้ดเชิญและบัญชีอีเมล (code ว่าง = เข้าด้วยอีเมล + รหัสผ่าน)
-- ฐานข้อมูลเดิม: เปลี่ยนชื่อตารางและ key (ข้อมูลอยู่ครบ) · ฐานข้อมูลใหม่: สร้าง accounts ด้านล่าง · รันซ้ำได้
do $$
begin
  if to_regclass('public.accounts') is null and exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'invites') then
    alter table public.invites rename to accounts;
    alter table public.accounts drop constraint invites_pkey;
    alter table public.accounts alter column code drop not null;
    alter table public.accounts add constraint accounts_code_key unique (code);
    alter table public.accounts add primary key (user_id);
    alter table public.accounts drop constraint if exists invites_user_id_key;
    -- temporary: the old name as a view so the still-deployed code keeps working between db-apply and the deploy.
    -- made only here (once, at the rename), so dropping it after the deploy sticks: drop view public.invites;
    -- security_invoker: callers' own rights apply; anon/authenticated get none
    create view public.invites with (security_invoker = on) as select * from public.accounts;
    revoke all on public.invites from anon, authenticated;
    grant select, insert, update, delete on public.invites to service_role;
  end if;
end $$;

create table if not exists public.accounts (
  user_id uuid primary key,                                     -- บัญชีใน auth.users
  code text unique,                                             -- โค้ดเชิญ (admin ต้องคัดลอกได้ จึงเก็บตรงๆ อ่านได้เฉพาะ server) · null = บัญชีอีเมล
  label text not null default '',                              -- ชื่อบัญชี (admin ตั้ง · บัญชีอีเมลเริ่มที่อีเมล)
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

-- โควตาเป็นโทเคน (28 ต.ค.): accounts.quota (จำนวนรูป) ไม่ใช้แล้ว · ค่าเริ่มต้นตรงกับ DEFAULT_TOKEN_QUOTA ใน lib/usage.ts
alter table public.accounts add column if not exists token_quota int not null default 300000 check (token_quota >= 0);
alter table public.accounts alter column token_quota set default 300000; -- เพิ่มจาก 200,000 (28 ต.ค.) · แอปส่งค่าเองทุกครั้งที่สร้างโค้ด

-- 17 Nov: sign-up at /signup waits for a superadmin: pending = true and no looklet flag yet (proxy keeps it out).
-- phone / line = how to reach the applicant (personal data: superadmin only, never sent to analytics).
-- approve = looklet flag + pending false; remove = delete the auth user and this row
alter table public.accounts add column if not exists pending boolean not null default false;
alter table public.accounts add column if not exists phone text;
alter table public.accounts add column if not exists line text;

-- 16 Nov: every existing email (team) account gets its row now, so /admin can see it and raise its quota before the deploy
-- (its earlier token use counts); members only, not code accounts or superadmin; accounts added later get a row on first use
insert into public.accounts (user_id, code, label, token_quota)
select u.id, null, left(coalesce(u.email, ''), 80), 300000 from auth.users u
where u.raw_app_meta_data->>'looklet' = 'true' and coalesce(u.raw_app_meta_data->>'role', '') not in ('customer', 'superadmin')
on conflict (user_id) do nothing;
alter table public.usage add column if not exists tokens int;  -- โทเคนที่ AI คิดจริง (null = ไม่รู้ นับแบบประมาณ)

-- เหมือนตาราง images: เปิด RLS ไม่มี policy + ไม่ให้สิทธิ์ anon/authenticated -> เข้าได้เฉพาะ server (secret key)
-- ตารางใหม่ไม่เปิดให้ Data API อัตโนมัติแล้ว (Supabase 2026) จึงให้สิทธิ์ service_role ตรงๆ
alter table public.accounts enable row level security;
alter table public.usage enable row level security;
revoke all on public.accounts, public.usage from anon, authenticated;
grant select, insert, update, delete on public.accounts, public.usage to service_role;
grant usage, select on sequence public.usage_id_seq to service_role;

-- หน้าตรวจงาน /admin/audit (2 พ.ย.): เก็บสิ่งที่ส่งให้ AI ของทุกการสร้างรูปไว้กับแถวการใช้งาน
-- (log เดียวกับไฟล์ logs/ ในเครื่อง ซึ่งบน Vercel หายไปเมื่อ function จบ) · แถวก่อนหน้านี้ไม่มี 2 คอลัมน์นี้
alter table public.usage add column if not exists result text;  -- รูปที่ได้ (/api/files/results/...) null = พัง หรือแถวก่อน 2 พ.ย.
alter table public.usage add column if not exists log jsonb;     -- GenerateLog / PackshotLog (lib/genlog.ts): พรอมต์ทีละประโยค รูปที่ส่ง ค่าที่เลือก แผนของ AI
create index if not exists usage_created on public.usage (created desc);
