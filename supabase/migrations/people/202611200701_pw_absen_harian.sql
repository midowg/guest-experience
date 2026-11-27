-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- WAM: absen harian kantor (decided 20 Nov 2026). Every active employee clocks in (masuk) and out
-- (pulang) once a day with two proofs: their face matches the reference face, and their phone's
-- location is inside the radius of an office point. The face is compared on the phone (MediaPipe +
-- SFace), but the score against the reference is computed here on the server: the reference
-- embedding never leaves the server. Outside every office point is allowed with a reason (event,
-- dinas, WFH) and waits for an admin ("perlu_cek"). The selfie of each clock-in is proof for the
-- admin and is deleted after 90 days (with its embedding); the face reference stays while the
-- person keeps their consent (UU PDP: face data is specific personal data, explicit consent, the
-- right to withdraw). Reference faces start from the GreatDay HR base photos (source 'greatday'),
-- or the person enrolls themselves ('daftar'). Files live in private R2:
--   pra-wam/wajah/<employee>/<uuid>.(webp|jpg)          reference photo
--   pra-wam/absen-harian/<employee>/<uuid>.(webp|jpg)   clock-in selfie
-- Server only, like every pw_* table. Nothing existing is changed.
--
-- ROLLBACK (by hand): drop table if exists public.pw_daily_attendance;
--   drop table if exists public.pw_face_profiles; drop table if exists public.pw_offices;
begin;

-- Office points: where "di dalam area kantor" is. Set by Admin WAM → Titik kantor.
create table public.pw_offices (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 2 and 60),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius_m integer not null default 100 check (radius_m between 30 and 1000),
  zone text not null default 'WIB' check (zone in ('WIB', 'WITA', 'WIT')),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One reference face per person.
--   impor    : GreatDay photo stored, embedding not computed yet (Admin → Proses foto impor)
--   siap     : embedding computed from the GreatDay photo, waits for the person's consent
--   aktif    : in use; the person agreed
--   menunggu : the person enrolled themselves (consent given), waits for an admin
--   ditolak  : not usable (photo unreadable, or refused by an admin); the person enrolls again
create table public.pw_face_profiles (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  embedding real[] check (embedding is null or cardinality(embedding) between 64 and 1024),
  model_version text check (model_version is null or char_length(model_version) <= 60),
  photo_key text check (
    photo_key is null or (
      photo_key ~ '^pra-wam/wajah/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$'
      and photo_key like 'pra-wam/wajah/' || employee_id || '/%'
    )
  ),
  source text not null check (source in ('greatday', 'daftar')),
  status text not null check (status in ('impor', 'siap', 'aktif', 'menunggu', 'ditolak')),
  note text check (note is null or char_length(note) <= 300),
  consent_at timestamptz,
  consent_version text check (consent_version is null or char_length(consent_version) <= 20),
  approved_by uuid references public.employees (id) on delete set null,
  approved_label text check (approved_label is null or char_length(approved_label) <= 120),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pw_face_profiles_embedding check (status in ('impor', 'ditolak') or (embedding is not null and model_version is not null)),
  constraint pw_face_profiles_consent check (status not in ('aktif', 'menunggu') or consent_at is not null)
);

-- One masuk and one pulang per person per work day (the day in the office's zone, or the
-- person's own zone when outside every office point).
create table public.pw_daily_attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  work_date date not null,
  kind text not null check (kind in ('masuk', 'pulang')),
  at timestamptz not null default now(),
  -- wajah: the person, with face + location; manual: an admin recorded it (no face consent, a
  -- broken phone, a forgotten clock-in).
  method text not null check (method in ('wajah', 'manual')),
  office_id uuid references public.pw_offices (id) on delete set null,
  office_name text check (office_name is null or char_length(office_name) <= 60),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  accuracy_m real check (accuracy_m is null or accuracy_m >= 0),
  distance_m real check (distance_m is null or distance_m >= 0),
  face_score real check (face_score is null or face_score between -1 and 1),
  -- The clock-in's embedding: lets an admin make this selfie the new reference. Deleted with the
  -- selfie after 90 days.
  embedding real[] check (embedding is null or cardinality(embedding) between 64 and 1024),
  liveness_steps text[] not null default '{}' check (cardinality(liveness_steps) <= 6),
  selfie_key text check (
    selfie_key is null or (
      selfie_key ~ '^pra-wam/absen-harian/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$'
      and selfie_key like 'pra-wam/absen-harian/' || employee_id || '/%'
    )
  ),
  reason_kind text check (reason_kind is null or reason_kind in ('event', 'dinas', 'wfh', 'lainnya')),
  reason_text text check (reason_text is null or char_length(reason_text) <= 300),
  status text not null check (status in ('sah', 'perlu_cek', 'ditolak')),
  -- Why the server marked it perlu_cek ("Di luar area kantor", "Skor wajah rendah", …).
  flags text[] not null default '{}' check (cardinality(flags) <= 8),
  nonce text unique check (nonce is null or nonce ~ '^[A-Za-z0-9_-]{16,64}$'),
  -- Who recorded a manual one and who reviewed: the admin's employee row when they sign in with
  -- their own account, and always their name (the super admin has no employee row).
  recorded_by uuid references public.employees (id) on delete set null,
  recorded_label text check (recorded_label is null or char_length(recorded_label) <= 120),
  reviewed_by uuid references public.employees (id) on delete set null,
  reviewed_label text check (reviewed_label is null or char_length(reviewed_label) <= 120),
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 300),
  created_at timestamptz not null default now(),
  unique (employee_id, work_date, kind),
  constraint pw_daily_attendance_manual check ((method = 'manual') = (recorded_label is not null)),
  constraint pw_daily_attendance_face check (method <> 'wajah' or (nonce is not null and face_score is not null and lat is not null and lng is not null)),
  -- Outside every office point always says why.
  constraint pw_daily_attendance_reason check (method <> 'wajah' or office_id is not null or reason_kind is not null)
);

create index pw_daily_attendance_day on public.pw_daily_attendance (work_date);
create index pw_daily_attendance_check on public.pw_daily_attendance (work_date) where status = 'perlu_cek';
-- The 90-day cleanup looks for selfies still kept.
create index pw_daily_attendance_selfie on public.pw_daily_attendance (at) where selfie_key is not null;

alter table public.pw_offices enable row level security;
alter table public.pw_face_profiles enable row level security;
alter table public.pw_daily_attendance enable row level security;
revoke all on public.pw_offices from public, anon, authenticated;
revoke all on public.pw_face_profiles from public, anon, authenticated;
revoke all on public.pw_daily_attendance from public, anon, authenticated;
grant select, insert, update, delete on public.pw_offices to service_role;
grant select, insert, update, delete on public.pw_face_profiles to service_role;
grant select, insert, update, delete on public.pw_daily_attendance to service_role;

commit;
