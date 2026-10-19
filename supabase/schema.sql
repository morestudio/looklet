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
