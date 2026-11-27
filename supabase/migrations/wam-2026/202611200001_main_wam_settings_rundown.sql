-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Main WAM, fondasi 1 of 3 (docs/main-wam/KONTRAK.md): the app during WAM itself (4–7 Jan 2027),
-- inside /wam with the same accounts. Settings (mode acara, penguji, modules, theme, the event's
-- facts), the rundown with its change log and attendance, kelompok and kelompok kegiatan, the room
-- details on top of HR's room pairing (cq_stay_rooms), the way there and back, the guides, and Main
-- WAM's metadata on WAM's one inbox (pw_announcements). Every table is server only (service role).
-- Needs 202611030001 (employees), 202611040006 (pw_announcements), 202611050001 (cq_stay_rooms).
-- ROLLBACK (by hand): drop the tables below in reverse order, then function mw_attendance_recorder().
begin;

/* Settings: one row. Mode pra (the default) keeps Main WAM hidden; see src/lib/main-wam/access.ts. */
create table public.mw_settings (
  id boolean primary key default true check (id),
  mode text not null default 'pra' check (mode in ('pra', 'uji', 'semua')),
  -- {"absen": true, "voting": false, ...}; a key that is not true is off.
  modules jsonb not null default '{}'::jsonb check (jsonb_typeof(modules) = 'object'),
  -- {"survei": {"formSlug": "..."}, "mozaik": {"columns": 40, "rows": 15}}
  module_config jsonb not null default '{}'::jsonb check (jsonb_typeof(module_config) = 'object'),
  -- {"colors": {"accent": "#1E3A5F"}, "displayFont": null, "images": {"splash": {"key", "version", "mime"}}}
  theme jsonb not null default '{}'::jsonb check (jsonb_typeof(theme) = 'object'),
  event_name text not null default 'WAM 2026' check (char_length(btrim(event_name)) between 2 and 80),
  venue text not null default '' check (char_length(venue) <= 150),
  hotel text not null default '' check (char_length(hotel) <= 150),
  -- Info acara: the hotel's street address (L03/Info acara).
  hotel_address text not null default '' check (char_length(hotel_address) <= 300),
  check_in_at timestamptz,
  check_out_at timestamptz,
  -- {"kamar": employee id, "perjalanan": ..., "umum": ...}: who "Hubungi" calls.
  contacts jsonb not null default '{}'::jsonb check (jsonb_typeof(contacts) = 'object'),
  -- Kelompok are shown to participants from this moment; null = "Kelompok belum diterbitkan".
  groups_published_at timestamptz,
  -- Jejak karbon: the hotel's bills after the event {"listrikKwh", "airM3", "lpgKg", "sampahKg", "final"}.
  carbon jsonb not null default '{}'::jsonb check (jsonb_typeof(carbon) = 'object'),
  updated_at timestamptz not null default now(),
  constraint mw_settings_stay check (check_out_at is null or check_in_at is null or check_out_at > check_in_at)
);
insert into public.mw_settings (id) values (true);

/* Penguji: who sees Main WAM in mode uji (and by its address in mode pra), besides panitia and admin. */
create table public.mw_testers (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  -- The admin who added them, by name (an admin is a console sign-in, not always an employee).
  added_by text not null default '' check (char_length(added_by) <= 150),
  added_at timestamptz not null default now()
);

/* Panduan (L04): Denah, Hotel & fasilitas, Dress code, Tata tertib; text and an optional file. */
create table public.mw_guides (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  kind text not null default 'lain' check (kind in ('denah', 'hotel', 'dresscode', 'tata_tertib', 'lain')),
  title text not null check (char_length(btrim(title)) between 2 and 100),
  body text not null default '' check (char_length(body) <= 8000),
  file_key text unique check (file_key is null or file_key ~ '^main-wam/panduan/[0-9a-f-]{36}\.(webp|jpg|png|pdf)$'),
  file_mime text check (file_mime is null or file_mime in ('image/webp', 'image/jpeg', 'image/png', 'application/pdf')),
  file_size bigint check (file_size is null or file_size between 1 and 26214400),
  sort integer not null default 0,
  published boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint mw_guides_file check ((file_key is null) = (file_mime is null) and (file_key is null) = (file_size is null))
);

/*
 * The rundown. Main WAM's own table, not pw_sessions: Pra WAM reads pw_sessions without an event
 * filter in many places (Jadwal sesi, Timeline, TV, MoM, exports), so a WAM session there would leak
 * into Pra WAM. Every published session is also a photo tag (mw_photos.session_id).
 */
create table public.mw_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 150),
  -- sesi; makan (no check-in, not picked for Sekarang over a real session); perjalanan (kumpul, kereta).
  kind text not null default 'sesi' check (kind in ('sesi', 'makan', 'perjalanan')),
  -- draf: admin only; terbit: in the app; batal: kept and shown struck through.
  status text not null default 'draf' check (status in ('draf', 'terbit', 'batal')),
  starts_at timestamptz not null,
  -- Null: a moment without an end ("14.30 Shuttle ke hotel"); the app gives it 30 minutes.
  ends_at timestamptz check (ends_at is null or ends_at > starts_at),
  place text not null default '' check (char_length(place) <= 200),
  map_guide_id uuid references public.mw_guides (id) on delete set null,
  dresscode text not null default '' check (char_length(dresscode) <= 200),
  -- "Yang perlu dibawa": short text, no checklist.
  bring text not null default '' check (char_length(bring) <= 500),
  -- Urutan tampil: [{"time": "08.00", "label": "Sales & Marketing"}].
  lineup jsonb not null default '[]'::jsonb check (jsonb_typeof(lineup) = 'array' and jsonb_array_length(lineup) <= 40),
  -- Konsumsi: "10.00 Rehat · tenongan, kopi, teh".
  meal text not null default '' check (char_length(meal) <= 300),
  contact_id uuid references public.employees (id) on delete set null,
  -- Absen QR (module): only sessions marked so take check-ins.
  uses_attendance boolean not null default false,
  -- Wajib: panitia sees who has not checked in yet.
  required boolean not null default false,
  optional boolean not null default false,
  -- The module this session hosts: its action in Detail sesi and its timing (Silent Meeting opens with it).
  module text check (module is null or module in ('silent', 'voting', 'survei')),
  description text not null default '' check (char_length(description) <= 2000),
  sort integer not null default 0,
  -- What the printed QR holds; kept as is so the same QR prints again ("Buat QR baru" replaces it).
  qr_token text unique check (qr_token is null or qr_token ~ '^[A-Za-z0-9_-]{20,64}$'),
  -- "diubah Dimas · 08.05": the last change in Rundown live.
  changed_at timestamptz,
  changed_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mw_sessions_meal_no_attendance check (not (kind = 'makan' and uses_attendance)),
  constraint mw_sessions_required_attendance check (not required or uses_attendance)
);
create index mw_sessions_time on public.mw_sessions (starts_at, sort);
-- Every foreign key has an index led by it (audit L1): removing a person or a guide never scans the table.
create index mw_sessions_map_guide on public.mw_sessions (map_guide_id) where map_guide_id is not null;
create index mw_sessions_contact on public.mw_sessions (contact_id) where contact_id is not null;
create index mw_sessions_changed_by on public.mw_sessions (changed_by) where changed_by is not null;

/* Riwayat perubahan of Rundown live: what changed, whether people were told, by whom. */
create table public.mw_rundown_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.mw_sessions (id) on delete cascade,
  -- [{"field": "startsAt", "from": "...", "to": "..."}]
  changes jsonb not null check (jsonb_typeof(changes) = 'array' and jsonb_array_length(changes) between 1 and 10),
  notified boolean not null default false,
  recipients integer not null default 0 check (recipients >= 0),
  changed_by uuid references public.employees (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index mw_rundown_log_session on public.mw_rundown_log (session_id, changed_at desc);
create index mw_rundown_log_time on public.mw_rundown_log (changed_at desc);
create index mw_rundown_log_changed_by on public.mw_rundown_log (changed_by) where changed_by is not null;

/* Absen: one check-in per person per session, by QR or recorded by panitia (K05). */
create table public.mw_attendance (
  session_id uuid not null references public.mw_sessions (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  method text not null check (method in ('qr', 'manual')),
  -- Who recorded a manual check-in; kept as null when that person leaves Data karyawan (audit L1:
  -- removing a panitia who recorded one never fails), so a manual one may have none.
  recorded_by uuid references public.employees (id) on delete set null,
  primary key (session_id, employee_id),
  constraint mw_attendance_manual check (method = 'manual' or recorded_by is null)
);
create index mw_attendance_person on public.mw_attendance (employee_id);
create index mw_attendance_recorded_by on public.mw_attendance (recorded_by) where recorded_by is not null;
-- A new manual check-in names who recorded it; only a later removal of that person empties it.
create function public.mw_attendance_recorder() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.method = 'manual' and new.recorded_by is null then
    raise exception 'mw_attendance_manual: a manual check-in names who recorded it' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger mw_attendance_recorder before insert or update of method on public.mw_attendance
  for each row execute function public.mw_attendance_recorder();
revoke all on function public.mw_attendance_recorder() from public, anon, authenticated;

/* Kelompok: "Kelompok 4 · Arjuno", one per person, at most one koordinator. */
create table public.mw_groups (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique check (number between 1 and 99),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create table public.mw_group_members (
  group_id uuid not null references public.mw_groups (id) on delete cascade,
  employee_id uuid not null unique references public.employees (id) on delete cascade,
  coordinator boolean not null default false,
  primary key (group_id, employee_id)
);
create unique index mw_group_one_coordinator on public.mw_group_members (group_id) where coordinator;

/* Kelompok kegiatan: per session a post, a minibus, a table; one per person per session. */
create table public.mw_activity_groups (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.mw_sessions (id) on delete cascade,
  kind text not null default 'pos' check (kind in ('pos', 'angkot', 'meja', 'lain')),
  label text not null check (char_length(btrim(label)) between 1 and 40),
  note text not null default '' check (char_length(note) <= 200),
  sort integer not null default 0,
  unique (session_id, label),
  unique (id, session_id)
);
create table public.mw_activity_group_members (
  activity_group_id uuid not null,
  session_id uuid not null,
  employee_id uuid not null references public.employees (id) on delete cascade,
  primary key (activity_group_id, employee_id),
  unique (session_id, employee_id),
  foreign key (activity_group_id, session_id) references public.mw_activity_groups (id, session_id) on update cascade on delete cascade
);

/*
 * Kamar: HR's room pairing is the rooming list (cq_stay_rooms, cq_stay_members; Admin WAM →
 * Kuesioner → Kamar, under the Data HR lock; any number of people per room up to its capacity).
 * Main WAM only adds what the handbook shows besides: the floor and a note.
 */
create table public.mw_stay_room_details (
  room_id uuid primary key references public.cq_stay_rooms (id) on delete cascade,
  floor text not null default '' check (char_length(floor) <= 40),
  note text not null default '' check (char_length(note) <= 200),
  updated_at timestamptz not null default now()
);

/* Perjalanan (L03): the steps there and back, and each person's seat or vehicle. */
create table public.mw_trips (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('berangkat', 'pulang')),
  kind text not null default 'lain' check (kind in ('kumpul', 'kereta', 'bus', 'tiba', 'lain')),
  title text not null check (char_length(btrim(title)) between 2 and 100),
  place text not null default '' check (char_length(place) <= 200),
  starts_at timestamptz,
  ends_at timestamptz check (ends_at is null or starts_at is null or ends_at > starts_at),
  detail text not null default '' check (char_length(detail) <= 300),
  note text not null default '' check (char_length(note) <= 300),
  map_url text not null default '' check (map_url = '' or map_url ~ '^https://'),
  coordinator_id uuid references public.employees (id) on delete set null,
  session_id uuid references public.mw_sessions (id) on delete set null,
  -- For Jejak karbon (computed, nobody types emissions): km of the leg, buses on it.
  distance_km numeric(8, 1) check (distance_km is null or distance_km >= 0),
  vehicles integer check (vehicles is null or vehicles between 0 and 200),
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);
create index mw_trips_order on public.mw_trips (direction, sort, starts_at);
create index mw_trips_coordinator on public.mw_trips (coordinator_id) where coordinator_id is not null;
create index mw_trips_session on public.mw_trips (session_id) where session_id is not null;
create table public.mw_trip_seats (
  trip_id uuid not null references public.mw_trips (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  seat text not null default '' check (char_length(seat) <= 60),
  vehicle text not null default '' check (char_length(vehicle) <= 60),
  primary key (trip_id, employee_id)
);
create index mw_trip_seats_person on public.mw_trip_seats (employee_id);

/*
 * Main WAM's notes ride on WAM's one inbox (pw_announcements + pw_notification_receipts: the bell,
 * read receipts, push). This adds what Main WAM needs: its kind (icon, push topic), where a tap
 * goes, the pin on Beranda (pengumuman penting), and who the announcement was for.
 */
create table public.mw_notes (
  announcement_id uuid primary key references public.pw_announcements (id) on delete cascade,
  kind text not null default 'lain' check (kind in ('pengumuman', 'jadwal', 'absen', 'momen', 'kamar', 'silent', 'voting', 'survei', 'lain')),
  link text not null default '' check (link = '' or link ~ '^/wam/acara($|[/?#])'),
  pinned_until timestamptz,
  -- Beranda's banner: 'warning' for a change to act on, 'info' otherwise; null = the app decides
  -- (noteTone: kind jadwal or a title saying something changed is a warning).
  tone text check (tone in ('info', 'warning')),
  -- {"type": "semua"} | {"type": "kelompok", "groupIds": []} | {"type": "departemen", "departments": []} | {"type": "panitia"}
  audience jsonb not null default '{"type": "semua"}'::jsonb check (jsonb_typeof(audience) = 'object' and audience ? 'type'),
  updated_by uuid references public.employees (id) on delete set null,
  updated_at timestamptz
);
create index mw_notes_pinned on public.mw_notes (pinned_until) where pinned_until is not null;
create index mw_notes_updated_by on public.mw_notes (updated_by) where updated_by is not null;

alter table public.mw_settings enable row level security;
alter table public.mw_testers enable row level security;
alter table public.mw_guides enable row level security;
alter table public.mw_sessions enable row level security;
alter table public.mw_rundown_log enable row level security;
alter table public.mw_attendance enable row level security;
alter table public.mw_groups enable row level security;
alter table public.mw_group_members enable row level security;
alter table public.mw_activity_groups enable row level security;
alter table public.mw_activity_group_members enable row level security;
alter table public.mw_stay_room_details enable row level security;
alter table public.mw_trips enable row level security;
alter table public.mw_trip_seats enable row level security;
alter table public.mw_notes enable row level security;
revoke all on public.mw_settings, public.mw_testers, public.mw_guides, public.mw_sessions, public.mw_rundown_log, public.mw_attendance,
  public.mw_groups, public.mw_group_members, public.mw_activity_groups, public.mw_activity_group_members, public.mw_stay_room_details,
  public.mw_trips, public.mw_trip_seats, public.mw_notes from public, anon, authenticated;
grant select, insert, update, delete on public.mw_settings, public.mw_testers, public.mw_guides, public.mw_sessions, public.mw_rundown_log, public.mw_attendance,
  public.mw_groups, public.mw_group_members, public.mw_activity_groups, public.mw_activity_group_members, public.mw_stay_room_details,
  public.mw_trips, public.mw_trip_seats, public.mw_notes to service_role;

commit;
