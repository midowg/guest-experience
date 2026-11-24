-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization (the owner runs it).
-- Main WAM, Misi: a regular Momen photo that happens to meet a photo mission is recognised and offered for it
-- (docs/main-wam/KONTRAK.md §13, "Deteksi otomatis dari Momen", keputusan pemilik 25 Nov 2026).
--   mw_missions.auto_detect      per mission: 'mati' (never from Momen), 'cocok' (only a sure match is sent by
--                                itself), 'mungkin' (a doubtful one too, it waits for a person). null = by default
--                                (on when the rules give evidence: a place or a required tag; else off).
--   mw_photo_signals             one row per Momen photo that carries a signal: whether it came from the app's
--                                camera, and, only when the person switched "Tandai lokasi" on, a coarse position
--                                (lat, lng, accuracy) used by the server only to match missions. It is never in
--                                any feed or API for other people, and goes with the photo (on delete cascade).
--                                checked_at says the photo has been looked at ("Periksa fotoku" skips it).
--   mw_photo_detections          what detection did for a photo and a mission: sent by itself (diajukan), only
--                                offered (saran), taken back by the person (ditarik) or waved off (diabaikan).
--                                A taken-back or waved-off pair is never sent again.
--   mw_misi_prefs                the person's own switch "Deteksi misi otomatis" (default on). Off: the app only
--                                offers a suggestion, never sends by itself.
-- Server only (service role). Needs 202611300001 (Misi foto) and 202611200002 (Momen).
-- ROLLBACK (by hand): drop table public.mw_misi_prefs, public.mw_photo_detections, public.mw_photo_signals;
--   alter table public.mw_missions drop column auto_detect;
begin;

alter table public.mw_missions
  add column auto_detect text check (auto_detect is null or auto_detect in ('mati', 'cocok', 'mungkin'));

create table public.mw_photo_signals (
  photo_id uuid primary key references public.mw_photos (id) on delete cascade,
  owner_id uuid not null references public.employees (id) on delete cascade,
  -- Taken with the app's camera (false: picked from the gallery, so never "foto langsung").
  live boolean not null default true,
  geo_lat double precision check (geo_lat between -90 and 90),
  geo_lng double precision check (geo_lng between -180 and 180),
  geo_acc integer check (geo_acc between 0 and 100000),
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mw_photo_signals_geo check ((geo_lat is null) = (geo_lng is null))
);
create index mw_photo_signals_owner on public.mw_photo_signals (owner_id, created_at desc);

create table public.mw_photo_detections (
  photo_id uuid not null references public.mw_photos (id) on delete cascade,
  mission_id uuid not null references public.mw_missions (id) on delete cascade,
  status text not null check (status in ('cocok', 'mungkin')),
  outcome text not null check (outcome in ('diajukan', 'saran', 'ditarik', 'diabaikan')),
  completion_id uuid references public.mw_mission_completions (id) on delete set null,
  reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(reasons) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (photo_id, mission_id)
);
create index mw_photo_detections_mission on public.mw_photo_detections (mission_id);
create index mw_photo_detections_completion on public.mw_photo_detections (completion_id) where completion_id is not null;

create table public.mw_misi_prefs (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  auto_detect boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.mw_photo_signals enable row level security;
alter table public.mw_photo_detections enable row level security;
alter table public.mw_misi_prefs enable row level security;
revoke all on public.mw_photo_signals, public.mw_photo_detections, public.mw_misi_prefs from public, anon, authenticated;
grant select, insert, update, delete on public.mw_photo_signals, public.mw_photo_detections, public.mw_misi_prefs to service_role;

commit;
