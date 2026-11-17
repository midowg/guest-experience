-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Main WAM, fondasi 2 of 3 (docs/main-wam/KONTRAK.md): Momen, the photos of the event in the style
-- of Instagram Instants. A photo is sent the moment it is taken and shows to others 5 seconds later
-- (the Batalkan window); it is for everyone (and the Mozaik) or for the sender's kelompok, tagged
-- with a session or none (Umum). Hearts, reports to panitia, what each person has seen in the
-- stack, and the mosaic's tiles. Files live in private storage (R2) under main-wam/momen/.
-- Server only (service role). Needs 202611200001.
-- ROLLBACK (by hand): drop table mw_mosaic_tiles, mw_photo_seen, mw_photo_reports, mw_photo_hearts, mw_photos.
begin;

create table public.mw_photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.employees (id) on delete cascade,
  -- The phone's own id for the photo: a queued photo sent twice (offline, a retry) is kept once.
  client_id uuid not null,
  audience text not null default 'semua' check (audience in ('semua', 'kelompok')),
  -- The sender's kelompok when it is "Untuk: Kelompokku". A kelompok with such photos cannot be deleted.
  group_id uuid references public.mw_groups (id),
  -- The session tag; null = Umum. A deleted session leaves its photos Umum.
  session_id uuid references public.mw_sessions (id) on delete set null,
  file_key text not null unique check (file_key ~ '^main-wam/momen/[0-9a-f-]{36}\.(jpg|webp)$'),
  -- A small copy for the stack and the grid (optional).
  thumb_key text unique check (thumb_key is null or thumb_key ~ '^main-wam/momen/[0-9a-f-]{36}-kecil\.(jpg|webp)$'),
  size bigint not null check (size between 1 and 2097152),
  width integer not null check (width between 1 and 4000),
  height integer not null check (height between 1 and 4000),
  -- On the phone (a queued photo keeps its own time); created_at is when it reached the server.
  taken_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- Others see it from here: the 5 seconds of "Batalkan" first.
  visible_at timestamptz not null default (now() + interval '5 seconds'),
  -- tampil; ditinjau: hidden for now after reports, panitia decides; disembunyikan: hidden by panitia.
  status text not null default 'tampil' check (status in ('tampil', 'ditinjau', 'disembunyikan')),
  hidden_by uuid references public.employees (id) on delete set null,
  hidden_at timestamptz,
  hidden_reason text not null default '' check (char_length(hidden_reason) <= 300),
  unique (owner_id, client_id),
  constraint mw_photos_group check (audience <> 'kelompok' or group_id is not null),
  constraint mw_photos_visible check (visible_at >= created_at)
);
-- Keyset paging (visible_at, id), never OFFSET: a growing feed would repeat or skip photos.
create index mw_photos_feed on public.mw_photos (visible_at desc, id desc) where status = 'tampil';
create index mw_photos_session on public.mw_photos (session_id, visible_at desc, id desc) where status = 'tampil';
create index mw_photos_review on public.mw_photos (status) where status <> 'tampil';
create index mw_photos_owner on public.mw_photos (owner_id, created_at desc);
create index mw_photos_group on public.mw_photos (group_id, visible_at desc) where group_id is not null;

create table public.mw_photo_hearts (
  photo_id uuid not null references public.mw_photos (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, employee_id)
);
create index mw_photo_hearts_person on public.mw_photo_hearts (employee_id);

/* Laporkan foto (M04): only panitia see reports; the reporter no longer sees the photo unless they ask. */
create table public.mw_photo_reports (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.mw_photos (id) on delete cascade,
  reporter_id uuid not null references public.employees (id) on delete cascade,
  reason text not null check (reason in ('tidak_setuju', 'tidak_pantas', 'data_pribadi', 'lainnya')),
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  -- "Tampilkan lagi": the reporter shows it to themself again (the report stays for panitia).
  unhidden_at timestamptz,
  unique (photo_id, reporter_id),
  constraint mw_photo_reports_note check (reason <> 'lainnya' or char_length(btrim(note)) > 0)
);
create index mw_photo_reports_photo on public.mw_photo_reports (photo_id);

/* What each person has seen in the stack: unseen photos come first, "3 dari 24 baru". */
create table public.mw_photo_seen (
  photo_id uuid not null references public.mw_photos (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (employee_id, photo_id)
);

/* Mozaik: which photo fills which tile (row-major index of the grid in module_config.mozaik). */
create table public.mw_mosaic_tiles (
  tile integer primary key check (tile between 0 and 6399),
  photo_id uuid not null unique references public.mw_photos (id) on delete cascade,
  placed_at timestamptz not null default now()
);

alter table public.mw_photos enable row level security;
alter table public.mw_photo_hearts enable row level security;
alter table public.mw_photo_reports enable row level security;
alter table public.mw_photo_seen enable row level security;
alter table public.mw_mosaic_tiles enable row level security;
revoke all on public.mw_photos, public.mw_photo_hearts, public.mw_photo_reports, public.mw_photo_seen, public.mw_mosaic_tiles from public, anon, authenticated;
grant select, insert, update, delete on public.mw_photos, public.mw_photo_hearts, public.mw_photo_reports, public.mw_photo_seen, public.mw_mosaic_tiles to service_role;

commit;
