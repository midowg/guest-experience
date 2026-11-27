-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- HR Werkudara pilot (decided 21 Nov 2026):
--   1. Two ways to clock in, one chosen by Admin HR for everyone (pw_hr_settings.clock_method):
--      'gerakan' = selfie with random liveness steps (as before), 'foto' = one selfie compared at
--      once with the reference, like GreatDay. Each clock-in records which (face_method).
--   2. GreatDay base photos are in use as soon as they are processed: an imported reference may be
--      'aktif' without the employee's consent step (the owner's choice for the pilot). Those already
--      processed ('siap') become 'aktif' now.
--   3. Employees ask Admin HR to fix their absensi (pw_attendance_requests): a forgotten masuk or
--      pulang, a wrong time, a wrong reason/place, or cancelling one. Approving applies it.
-- Server only, like every pw_* table. The code works before this runs (one method, no requests).
--
-- ROLLBACK (by hand): drop table if exists public.pw_attendance_requests; drop table if exists public.pw_hr_settings;
--   alter table public.pw_daily_attendance drop column if exists face_method;
--   restore pw_face_profiles_consent from 202611200701 (after setting greatday 'aktif' rows back to 'siap').
begin;

create table if not exists public.pw_hr_settings (
  id boolean primary key default true check (id),
  clock_method text not null default 'gerakan' check (clock_method in ('gerakan', 'foto')),
  updated_label text check (updated_label is null or char_length(updated_label) <= 120),
  updated_at timestamptz not null default now()
);
insert into public.pw_hr_settings (id) values (true) on conflict (id) do nothing;

alter table public.pw_daily_attendance add column if not exists face_method text check (face_method is null or face_method in ('gerakan', 'foto'));

alter table public.pw_face_profiles drop constraint if exists pw_face_profiles_consent;
alter table public.pw_face_profiles add constraint pw_face_profiles_consent
  check (status not in ('aktif', 'menunggu') or consent_at is not null or source = 'greatday');
update public.pw_face_profiles set status = 'aktif', updated_at = now() where source = 'greatday' and status = 'siap';

create table if not exists public.pw_attendance_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  -- tambah: a forgotten masuk/pulang; ubah_jam: a wrong time; ubah_alasan: a wrong reason/place; batal: remove one.
  type text not null check (type in ('tambah', 'ubah_jam', 'ubah_alasan', 'batal')),
  record_id uuid references public.pw_daily_attendance (id) on delete set null,
  work_date date not null,
  kind text not null check (kind in ('masuk', 'pulang')),
  -- The clock time asked for, in its zone (tambah, ubah_jam).
  proposed_time time,
  zone text not null default 'WIB' check (zone in ('WIB', 'WITA', 'WIT')),
  reason_kind text check (reason_kind is null or reason_kind in ('event', 'dinas', 'wfh', 'lainnya')),
  reason_text text check (reason_text is null or char_length(reason_text) <= 300),
  note text not null check (char_length(btrim(note)) between 3 and 300),
  status text not null default 'menunggu' check (status in ('menunggu', 'disetujui', 'ditolak', 'dibatalkan')),
  decided_by uuid references public.employees (id) on delete set null,
  decided_label text check (decided_label is null or char_length(decided_label) <= 120),
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  created_at timestamptz not null default now(),
  constraint pw_attendance_requests_time check (type not in ('tambah', 'ubah_jam') or proposed_time is not null),
  constraint pw_attendance_requests_record check (type = 'tambah' or record_id is not null or status <> 'menunggu')
);
create index if not exists pw_attendance_requests_waiting on public.pw_attendance_requests (created_at) where status = 'menunggu';
create index if not exists pw_attendance_requests_person on public.pw_attendance_requests (employee_id, created_at desc);

alter table public.pw_hr_settings enable row level security;
alter table public.pw_attendance_requests enable row level security;
revoke all on public.pw_hr_settings from public, anon, authenticated;
revoke all on public.pw_attendance_requests from public, anon, authenticated;
grant select, insert, update, delete on public.pw_hr_settings to service_role;
grant select, insert, update, delete on public.pw_attendance_requests to service_role;

commit;
