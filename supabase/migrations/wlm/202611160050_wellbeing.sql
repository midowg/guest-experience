-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611160010.
--
-- Wellbeing (decided 16 Nov 2026, docs/rancangan-wellbeing.md): the office wellbeing programme moves
-- into Journey from welbeing.netlify.app. Employees (the WAM accounts) log activities per dimension
-- and earn points; admins check what came in afterwards and give points to many people at once.
--   * New tables only (wb_*), joined to employees; nothing existing changes except the admin grant
--     list, which may now hold 'wellbeing' (Super admin → Akses admin → Wellbeing).
--   * The activity catalogue is seeded from the old app's point matrix (25 daily activities, steps,
--     and sports at 1 kcal = 1 point); admins edit it in Admin Wellbeing → Pengaturan.
--   * Read and written only by the server (service role): RLS on, no policies.
--   * The old data is moved later by a script (legacy_id keeps the old ids so a re-run skips rows).
--
-- ROLLBACK (by hand): drop function public.wb_totals(date, date);
--   drop table public.wb_point_entries, public.wb_activities, public.wb_activity_types,
--   public.wb_settings, public.wb_dimensions;
--   update public.admin_grants set apps = array_remove(apps, 'wellbeing');
--   then restore the check without 'wellbeing' (see 202611140001).
begin;

create table if not exists public.wb_dimensions (
  id text primary key check (id in ('physical', 'emotional', 'social', 'financial', 'spiritual')),
  name text not null check (char_length(btrim(name)) between 2 and 40),
  sort_order smallint not null
);
insert into public.wb_dimensions (id, name, sort_order) values
  ('physical', 'Fisik', 1), ('emotional', 'Emosional', 2), ('social', 'Sosial', 3),
  ('financial', 'Finansial', 4), ('spiritual', 'Spiritual', 5)
on conflict (id) do nothing;

-- What can be logged and how it earns points: a fixed number, steps / 10, or 1 point per kcal.
create table if not exists public.wb_activity_types (
  code text primary key check (code ~ '^[a-z]+\.[a-z0-9_]{2,60}$'),
  dimension_id text not null references public.wb_dimensions (id),
  kind text not null check (kind in ('daily', 'sport')),
  name text not null check (char_length(btrim(name)) between 2 and 200),
  points_mode text not null default 'fixed' check (points_mode in ('fixed', 'steps', 'kcal')),
  points integer not null default 0 check (points between 0 and 10000),
  limit_per text check (limit_per in ('day', 'month')),
  proof_hint text not null default '' check (char_length(proof_hint) <= 200),
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wb_activity_types_sport_is_physical check (kind = 'daily' or dimension_id = 'physical'),
  constraint wb_activity_types_fixed_has_points check (points_mode <> 'fixed' or points > 0)
);
insert into public.wb_activity_types (code, dimension_id, kind, name, points_mode, points, limit_per, proof_hint, sort_order) values
  ('physical.steps', 'physical', 'daily', 'Langkah harian', 'steps', 0, 'day', 'Screenshot jumlah langkah dari aplikasi ponsel', 10),
  ('emotional.konsultasi_coaching', 'emotional', 'daily', 'Konsultasi / Coaching / Mentoring', 'fixed', 150, null, 'Foto, screenshot, atau bukti partisipasi', 110),
  ('emotional.nonton_film_dokumenter', 'emotional', 'daily', 'Menonton Film / Dokumenter (1,5-2,5 Jam)', 'fixed', 100, null, 'Foto, screenshot, atau bukti partisipasi', 120),
  ('emotional.sharing_session', 'emotional', 'daily', 'Sharing Session', 'fixed', 80, null, 'Foto, screenshot, atau bukti partisipasi', 130),
  ('emotional.seminar_mental_health', 'emotional', 'daily', 'Seminar Mengenai Mental Health', 'fixed', 120, null, 'Foto, screenshot, atau bukti partisipasi', 140),
  ('emotional.meditasi', 'emotional', 'daily', 'Meditasi', 'fixed', 70, null, 'Foto, screenshot, atau bukti partisipasi', 150),
  ('emotional.baca_buku_fisik', 'emotional', 'daily', 'Membaca 1 Buku Fisik (Novel, Fiction, Action, Thriller, Biography, Komik)', 'fixed', 300, null, 'Foto, screenshot, atau bukti partisipasi dan rangkuman', 160),
  ('emotional.baca_ebook', 'emotional', 'daily', 'Membaca 1 Buku E-Book (Novel, Fiction, Action, Thriller, Biography, Komik)', 'fixed', 300, null, 'Foto, screenshot, atau bukti partisipasi dan rangkuman', 170),
  ('emotional.podcast', 'emotional', 'daily', 'Mendengarkan Podcast', 'fixed', 80, null, 'Foto, screenshot, atau bukti partisipasi dan rangkuman', 180),
  ('social.hobi', 'social', 'daily', 'Penyaluran Hobi / Minat Non Physical, Non Spiritual', 'fixed', 150, null, 'Foto, screenshot, atau bukti partisipasi', 110),
  ('social.donor_darah', 'social', 'daily', 'Donor Darah', 'fixed', 200, null, 'Kartu donor atau sertifikat', 120),
  ('social.buddy_program', 'social', 'daily', 'Buddy Program', 'fixed', 80, null, 'Foto, screenshot, atau bukti partisipasi', 130),
  ('social.training_skills', 'social', 'daily', 'Mengikuti Training Berkaitan dengan Hard Skills & Soft Skills', 'fixed', 120, null, 'Sertifikat atau foto kegiatan dan rangkuman', 140),
  ('financial.tabungan_emas', 'financial', 'daily', 'Membuka Tabungan Emas', 'fixed', 150, null, 'Screenshot/bukti transaksi', 110),
  ('financial.tabungan_deposito', 'financial', 'daily', 'Membuka Tabungan Deposito', 'fixed', 300, null, 'Screenshot/bukti transaksi', 120),
  ('financial.tabungan_saham', 'financial', 'daily', 'Membuka Tabungan Saham / Reksadana', 'fixed', 300, null, 'Screenshot/bukti transaksi', 130),
  ('financial.tabungan_crypto', 'financial', 'daily', 'Membuka Tabungan Crypto', 'fixed', 300, null, 'Screenshot/bukti transaksi', 140),
  ('financial.program_tabungan', 'financial', 'daily', 'Membuat Program Tabungan Tertentu', 'fixed', 300, null, 'Foto, screenshot, atau bukti partisipasi', 150),
  ('financial.asuransi', 'financial', 'daily', 'Membeli Asuransi (di Luar BPJS Kes / Ketenagakerjaan)', 'fixed', 300, null, 'Screenshot/bukti transaksi', 160),
  ('financial.koperasi', 'financial', 'daily', 'Mengikuti Koperasi (Membuka Tabungan / Mengikuti Kegiatan)', 'fixed', 300, null, 'Foto, screenshot, atau bukti partisipasi', 170),
  ('spiritual.kajian_rohani', 'spiritual', 'daily', 'Mengikuti Kajian Rohani', 'fixed', 80, null, 'Foto, screenshot, atau bukti partisipasi', 110),
  ('spiritual.pelayanan', 'spiritual', 'daily', 'Pelayanan', 'fixed', 100, null, 'Foto, screenshot, atau bukti partisipasi', 120),
  ('spiritual.bakti_sosial', 'spiritual', 'daily', 'Bakti Sosial', 'fixed', 100, null, 'Foto, screenshot, atau bukti partisipasi', 130),
  ('spiritual.hari_besar', 'spiritual', 'daily', 'Perayaan Hari Besar Keagamaan', 'fixed', 80, null, 'Foto, screenshot, atau bukti partisipasi', 140),
  ('spiritual.donasi', 'spiritual', 'daily', 'Donasi', 'fixed', 100, null, 'Foto, screenshot, atau bukti partisipasi', 150),
  ('spiritual.csr', 'spiritual', 'daily', 'CSR', 'fixed', 100, null, 'Foto, screenshot, atau bukti partisipasi', 160),
  ('sport.running', 'physical', 'sport', 'Lari', 'kcal', 0, null, 'Foto layar jam atau aplikasi yang menunjukkan kalori', 210),
  ('sport.cycling', 'physical', 'sport', 'Bersepeda', 'kcal', 0, null, 'Foto layar jam atau aplikasi yang menunjukkan kalori', 220),
  ('sport.swimming', 'physical', 'sport', 'Renang', 'kcal', 0, null, 'Foto layar jam atau aplikasi yang menunjukkan kalori', 230),
  ('sport.workout', 'physical', 'sport', 'Workout / Gym', 'kcal', 0, null, 'Foto layar jam atau aplikasi yang menunjukkan kalori', 240),
  ('sport.badminton', 'physical', 'sport', 'Badminton', 'kcal', 0, null, 'Foto layar jam atau aplikasi yang menunjukkan kalori', 250),
  ('sport.futsal', 'physical', 'sport', 'Futsal', 'kcal', 0, null, 'Foto layar jam atau aplikasi yang menunjukkan kalori', 260),
  ('sport.walking', 'physical', 'sport', 'Jalan kaki', 'kcal', 0, null, 'Foto layar jam atau aplikasi yang menunjukkan kalori', 270),
  ('sport.other', 'physical', 'sport', 'Olahraga lain', 'kcal', 0, null, 'Foto layar jam atau aplikasi yang menunjukkan kalori', 280)
on conflict (code) do nothing;

-- One logged activity. It counts the moment it is logged (status approved); an admin may check it
-- (checked), change its points (adjusted) or reject it (counts 0), always with a reason.
create table if not exists public.wb_activities (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  type_code text not null references public.wb_activity_types (code) on update cascade,
  dimension_id text not null references public.wb_dimensions (id),
  happened_on date not null,
  source text not null default 'manual' check (source in ('manual', 'strava', 'import')),
  title text not null default '' check (char_length(title) <= 200),
  steps integer check (steps between 0 and 200000),
  kcal integer check (kcal between 0 and 20000),
  minutes integer check (minutes between 0 and 1440),
  distance_m integer check (distance_m between 0 and 1000000),
  note text not null default '' check (char_length(note) <= 500),
  photos text[] not null default '{}' check (cardinality(photos) <= 5),
  points_claimed integer not null check (points_claimed between 0 and 100000),
  points integer not null check (points between 0 and 100000),
  status text not null default 'approved' check (status in ('approved', 'adjusted', 'rejected')),
  review_reason text check (char_length(review_reason) <= 300),
  checked boolean not null default false,
  reviewed_by uuid references public.employees (id) on delete set null,
  reviewed_by_name text check (char_length(reviewed_by_name) <= 150),
  reviewed_at timestamptz,
  external_id text check (char_length(external_id) <= 64),
  legacy_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wb_activities_reason check (status = 'approved' or review_reason is not null)
);
create unique index if not exists wb_activities_external on public.wb_activities (source, external_id) where external_id is not null;
create unique index if not exists wb_activities_legacy on public.wb_activities (legacy_id) where legacy_id is not null;
create index if not exists wb_activities_employee on public.wb_activities (employee_id, happened_on desc);
create index if not exists wb_activities_recent on public.wb_activities (created_at desc);
create index if not exists wb_activities_unchecked on public.wb_activities (created_at desc) where not checked;

-- Points given or taken by an admin (one batch = one "Tambah poin" to many people), and the
-- opening balances moved from the old app. A voided entry no longer counts (undo).
create table if not exists public.wb_point_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  points integer not null check (points <> 0 and points between -100000 and 100000),
  dimension_id text references public.wb_dimensions (id),
  reason text not null check (char_length(btrim(reason)) between 2 and 200),
  happened_on date not null,
  kind text not null default 'admin' check (kind in ('admin', 'import')),
  batch_id uuid not null,
  created_by uuid references public.employees (id) on delete set null,
  created_by_name text not null default '' check (char_length(created_by_name) <= 150),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by_name text check (char_length(voided_by_name) <= 150),
  legacy_id text check (char_length(legacy_id) <= 64)
);
create index if not exists wb_point_entries_employee on public.wb_point_entries (employee_id, happened_on desc);
create index if not exists wb_point_entries_batch on public.wb_point_entries (batch_id);
create unique index if not exists wb_point_entries_legacy on public.wb_point_entries (legacy_id) where legacy_id is not null;

-- The programme's rules, one row.
create table if not exists public.wb_settings (
  id smallint primary key default 1 check (id = 1),
  backdate_days integer not null default 7 check (backdate_days between 0 and 60),
  max_kcal integer not null default 3000 check (max_kcal between 100 and 20000),
  max_steps integer not null default 60000 check (max_steps between 1000 and 200000),
  program_start date not null default '2026-05-22',
  updated_at timestamptz not null default now(),
  updated_by_name text check (char_length(updated_by_name) <= 150)
);
insert into public.wb_settings (id) values (1) on conflict (id) do nothing;

-- Points per person and dimension within dates (both optional): activities that are not rejected,
-- plus admin entries that are not voided. One query for Hari ini, Karyawan and Peringkat.
create or replace function public.wb_totals(p_from date default null, p_to date default null)
returns table (employee_id uuid, dimension_id text, points bigint, activities bigint)
language sql stable security invoker set search_path = public as $$
  select t.employee_id, t.dimension_id, sum(t.points)::bigint, count(*) filter (where t.is_activity)::bigint
  from (
    select a.employee_id, a.dimension_id, a.points, true as is_activity
      from public.wb_activities a
     where a.status <> 'rejected'
       and (p_from is null or a.happened_on >= p_from) and (p_to is null or a.happened_on <= p_to)
    union all
    select e.employee_id, e.dimension_id, e.points, false
      from public.wb_point_entries e
     where e.voided_at is null
       and (p_from is null or e.happened_on >= p_from) and (p_to is null or e.happened_on <= p_to)
  ) t
  group by t.employee_id, t.dimension_id
$$;

alter table public.wb_dimensions enable row level security;
alter table public.wb_activity_types enable row level security;
alter table public.wb_activities enable row level security;
alter table public.wb_point_entries enable row level security;
alter table public.wb_settings enable row level security;
revoke all on public.wb_dimensions, public.wb_activity_types, public.wb_activities, public.wb_point_entries, public.wb_settings from public, anon, authenticated;
grant select, insert, update, delete on public.wb_dimensions, public.wb_activity_types, public.wb_activities, public.wb_point_entries, public.wb_settings to service_role;
revoke all on function public.wb_totals(date, date) from public, anon, authenticated;
grant execute on function public.wb_totals(date, date) to service_role;

-- Super admin → Akses admin may now give "Wellbeing".
alter table public.admin_grants drop constraint if exists admin_grants_apps_check;
alter table public.admin_grants add constraint admin_grants_apps_check
  check (apps <@ array['acara', 'friday_sharing', 'your_visit', 'wam', 'kuesioner', 'tv', 'wellbeing']::text[]);

commit;
