-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Pra WAM, tahap 0: akun per orang dan booking ruang appraisal. Appraisal & 1-on-1 runs
-- 28 Okt–20 Nov 2026 and everyone books rooms themselves, so two people can reach for the same
-- room and hour at once. The database decides: one room has no two active bookings that overlap
-- (exclusion constraint), whoever is saved first keeps it. Personal data, server only (service role).
begin;

create extension if not exists btree_gist;

-- One sign-in per person. The password lives in Supabase Auth; this links it to Data karyawan.
create table public.pw_accounts (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  auth_user_id uuid not null unique,
  -- The first password is the same for everyone; changing it can be skipped and done later.
  must_change_password boolean not null default true,
  password_changed_at timestamptz,
  last_login_at timestamptz,
  -- Raised to sign a person out everywhere (password reset, account switched off).
  session_version integer not null default 1 check (session_version > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.pw_rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  kind text not null check (kind in ('utama', 'area')),
  capacity integer check (capacity is null or capacity between 1 and 500),
  facilities text[] not null default '{}',
  -- Which rooms the appraisal form offers; an area waits until it is confirmed bookable.
  bookable boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- The rooms of Werkudara Room Booking. Capacities are not known yet.
insert into public.pw_rooms (slug, name, kind, bookable, sort_order) values
  ('cfc-ananta', 'CFC Ananta Room', 'utama', true, 1),
  ('nagapadma', 'Nagapadma', 'utama', true, 2),
  ('vasuki', 'Vasuki', 'utama', true, 3),
  ('limasan', 'Limasan', 'area', false, 10),
  ('pantry', 'Pantry', 'area', false, 11),
  ('main-office', 'Main Office', 'area', false, 14),
  ('komunal', 'Komunal', 'area', false, 15);

create table public.pw_room_bookings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.pw_rooms (id),
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 500),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  booked_by uuid not null references public.employees (id),
  status text not null default 'aktif' check (status in ('aktif', 'batal')),
  cancelled_by uuid references public.employees (id),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Office hours in WIB: weekdays, 09.00–18.00, half-hour steps, one day, at most 4 hours.
  constraint pw_booking_order check (ends_at > starts_at and ends_at - starts_at <= interval '4 hours'),
  constraint pw_booking_step check (extract(epoch from starts_at)::bigint % 1800 = 0 and extract(epoch from ends_at)::bigint % 1800 = 0),
  constraint pw_booking_hours check (
    (starts_at at time zone 'Asia/Jakarta')::date = (ends_at at time zone 'Asia/Jakarta')::date
    and (starts_at at time zone 'Asia/Jakarta')::time >= time '09:00'
    and (ends_at at time zone 'Asia/Jakarta')::time <= time '18:00'
    and extract(isodow from starts_at at time zone 'Asia/Jakarta') between 1 and 5
  ),
  constraint pw_booking_cancel check ((status = 'batal') = (cancelled_at is not null)),
  -- The tie-breaker when two people book at once: the second insert fails with 23P01.
  constraint pw_booking_no_overlap exclude using gist (room_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where (status = 'aktif')
);
create index pw_room_bookings_day on public.pw_room_bookings (starts_at) where status = 'aktif';
create index pw_room_bookings_booker on public.pw_room_bookings (booked_by, starts_at);

create table public.pw_room_booking_participants (
  booking_id uuid not null references public.pw_room_bookings (id) on delete cascade,
  employee_id uuid not null references public.employees (id),
  primary key (booking_id, employee_id)
);
create index pw_booking_participants_person on public.pw_room_booking_participants (employee_id);

/*
 * Saves a booking with its participants in one step. p_id null = new booking. The daily limit is
 * checked under a lock per person and day, so two quick saves cannot both slip past it. The
 * server has already checked that the caller may change p_id.
 */
create function public.pw_save_booking(
  p_id uuid, p_room uuid, p_title text, p_description text, p_starts timestamptz, p_ends timestamptz,
  p_booked_by uuid, p_participants uuid[], p_max_per_day integer
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  saved uuid;
  day date := (p_starts at time zone 'Asia/Jakarta')::date;
begin
  if not exists (select 1 from pw_rooms where id = p_room and bookable) then raise exception 'ROOM_NOT_BOOKABLE'; end if;
  perform pg_advisory_xact_lock(hashtext('pw_booking:' || p_booked_by::text || ':' || day::text));
  if (select count(*) from pw_room_bookings
      where booked_by = p_booked_by and status = 'aktif' and id is distinct from p_id
        and (starts_at at time zone 'Asia/Jakarta')::date = day) >= p_max_per_day then
    raise exception 'BOOKING_DAILY_LIMIT';
  end if;
  if p_id is null then
    insert into pw_room_bookings (room_id, title, description, starts_at, ends_at, booked_by)
    values (p_room, btrim(p_title), btrim(p_description), p_starts, p_ends, p_booked_by)
    returning id into saved;
  else
    update pw_room_bookings
       set room_id = p_room, title = btrim(p_title), description = btrim(p_description),
           starts_at = p_starts, ends_at = p_ends, updated_at = now()
     where id = p_id and status = 'aktif'
    returning id into saved;
    if saved is null then raise exception 'NOT_FOUND'; end if;
    delete from pw_room_booking_participants where booking_id = saved;
  end if;
  insert into pw_room_booking_participants (booking_id, employee_id)
  select saved, person from unnest(array_append(p_participants, p_booked_by)) as person
  on conflict do nothing;
  return saved;
end $$;

alter table public.pw_accounts enable row level security;
alter table public.pw_rooms enable row level security;
alter table public.pw_room_bookings enable row level security;
alter table public.pw_room_booking_participants enable row level security;
revoke all on public.pw_accounts, public.pw_rooms, public.pw_room_bookings, public.pw_room_booking_participants from public, anon, authenticated;
revoke all on function public.pw_save_booking(uuid, uuid, text, text, timestamptz, timestamptz, uuid, uuid[], integer) from public, anon, authenticated;
grant select, insert, update, delete on public.pw_accounts, public.pw_rooms, public.pw_room_bookings, public.pw_room_booking_participants to service_role;
grant execute on function public.pw_save_booking(uuid, uuid, text, text, timestamptz, timestamptz, uuid, uuid[], integer) to service_role;

commit;
