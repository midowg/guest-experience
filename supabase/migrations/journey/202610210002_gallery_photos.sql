-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Event photo gallery stored in Cloudflare R2. The files live in a private bucket; this table holds
-- their keys and review status. Server only: guests see ready photos of published events through
-- short-lived signed addresses made by the app.
begin;

create table public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  status text not null default 'uploading' check (status in ('uploading','pending','ready','hidden')),
  original_key text not null check (char_length(original_key) <= 300),
  original_kind text not null check (original_kind in ('jpeg','png','webp','heic')),
  original_bytes bigint not null check (original_bytes between 1 and 26214400),
  large_key text not null check (char_length(large_key) <= 300),
  large_bytes integer not null check (large_bytes between 1 and 4194304),
  thumb_key text not null check (char_length(thumb_key) <= 300),
  thumb_bytes integer not null check (thumb_bytes between 1 and 524288),
  width integer check (width between 1 and 20000),
  height integer check (height between 1 and 20000),
  caption text not null default '' check (char_length(caption) <= 300),
  alt text not null default '' check (char_length(alt) <= 300),
  sort_order integer not null default 0,
  uploaded_device text check (uploaded_device is null or char_length(uploaded_device) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index gallery_photos_event on public.gallery_photos (event_id, status, sort_order, created_at);

alter table public.gallery_photos enable row level security;
revoke all on public.gallery_photos from public, anon, authenticated;
grant select, insert, update, delete on public.gallery_photos to service_role;

commit;
