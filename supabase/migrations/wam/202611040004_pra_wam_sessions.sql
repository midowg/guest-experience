-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Pra WAM, tahap 2: forum sessions made by panitia, who takes part, and documents. Rooms are
-- shared by appraisal bookings and sessions, so one table of room holds keeps both apart: a
-- trigger writes a hold for every active booking and every planned session with a room, and the
-- holds may not overlap per room. Needs 202611040001 and 202611040003.
begin;

create table public.pw_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.pw_events (id),
  title text not null check (char_length(btrim(title)) between 2 and 150),
  -- forum: the calendar's meetings; rapat: smaller meetings; acara: e.g. End Year Dinner.
  kind text not null default 'forum' check (kind in ('forum', 'rapat', 'acara')),
  description text not null default '' check (char_length(description) <= 2000),
  -- The calendar's date range while the exact time is not set yet.
  plan_from date,
  plan_to date check (plan_to is null or plan_from is null or plan_to >= plan_from),
  starts_at timestamptz,
  ends_at timestamptz,
  room_id uuid references public.pw_rooms (id),
  -- For a place outside the office rooms (a restaurant for the dinner, say).
  location text not null default '' check (char_length(location) <= 200),
  -- draf: only panitia sees it; terbit: on its participants' agenda; batal: kept for the record.
  status text not null default 'draf' check (status in ('draf', 'terbit', 'batal')),
  created_by uuid references public.employees (id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pw_session_times check ((starts_at is null) = (ends_at is null) and (ends_at is null or ends_at > starts_at)),
  constraint pw_session_publish check (status <> 'terbit' or starts_at is not null)
);
create index pw_sessions_time on public.pw_sessions (event_id, starts_at);

create table public.pw_session_participants (
  session_id uuid not null references public.pw_sessions (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  primary key (session_id, employee_id)
);
create index pw_session_participants_person on public.pw_session_participants (employee_id);

-- The forums of the Pra WAM calendar, as drafts with their date range; panitia sets the times.
insert into public.pw_sessions (event_id, title, kind, plan_from, plan_to)
select e.id, s.title, s.kind, s.plan_from::date, s.plan_to::date
from public.pw_events e,
  (values
    ('Review data departemen', 'forum', '2026-11-09', '2026-11-10'),
    ('Rekonsiliasi ACC', 'forum', '2026-11-11', '2026-11-12'),
    ('Meeting biaya & budget', 'forum', '2026-11-13', '2026-11-13'),
    ('HOD Meeting', 'forum', '2026-11-24', '2026-11-27'),
    ('CSM & prioritas CAPEX', 'forum', '2026-11-24', '2026-11-27'),
    ('Revenue Sync & RSM', 'forum', '2026-11-24', '2026-12-04'),
    ('Pengajuan & arahan BOD', 'forum', '2026-11-30', '2026-12-04'),
    ('Internal Dept Meeting', 'forum', '2026-12-07', '2026-12-09'),
    ('ITEM: antar-departemen', 'forum', '2026-12-10', '2026-12-11'),
    ('ITAM: BOD x departemen', 'forum', '2026-12-14', '2026-12-16'),
    ('End Year Dinner', 'acara', '2026-12-29', '2026-12-29')
  ) as s (title, kind, plan_from, plan_to)
where e.slug = 'pra-wam-2026';

/* One room, one use at a time, whether an appraisal booking or a session. */
create table public.pw_room_holds (
  source text not null check (source in ('booking', 'sesi')),
  source_id uuid not null,
  room_id uuid not null references public.pw_rooms (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  primary key (source, source_id),
  constraint pw_room_holds_no_overlap exclude using gist (room_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
);

create function public.pw_hold_booking() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  delete from pw_room_holds where source = 'booking' and source_id = coalesce(new.id, old.id);
  if tg_op <> 'DELETE' and new.status = 'aktif' then
    insert into pw_room_holds (source, source_id, room_id, starts_at, ends_at) values ('booking', new.id, new.room_id, new.starts_at, new.ends_at);
  end if;
  return coalesce(new, old);
end $$;

create function public.pw_hold_session() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  delete from pw_room_holds where source = 'sesi' and source_id = coalesce(new.id, old.id);
  if tg_op <> 'DELETE' and new.status in ('draf', 'terbit') and new.room_id is not null and new.starts_at is not null then
    insert into pw_room_holds (source, source_id, room_id, starts_at, ends_at) values ('sesi', new.id, new.room_id, new.starts_at, new.ends_at);
  end if;
  return coalesce(new, old);
end $$;

create trigger pw_room_bookings_hold after insert or update or delete on public.pw_room_bookings for each row execute function public.pw_hold_booking();
create trigger pw_sessions_hold after insert or update or delete on public.pw_sessions for each row execute function public.pw_hold_session();

-- Bookings made before this migration.
insert into public.pw_room_holds (source, source_id, room_id, starts_at, ends_at)
select 'booking', id, room_id, starts_at, ends_at from public.pw_room_bookings where status = 'aktif';

create table public.pw_documents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.pw_events (id),
  -- Null: a document for everyone in the event; otherwise only for the session's participants.
  session_id uuid references public.pw_sessions (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 150),
  file_key text not null unique check (file_key like 'pra-wam/dokumen/%'),
  filename text not null check (char_length(filename) between 1 and 200),
  mime text not null,
  size bigint not null check (size between 1 and 26214400),
  uploaded_by uuid not null references public.employees (id),
  created_at timestamptz not null default now()
);
create index pw_documents_session on public.pw_documents (event_id, session_id, created_at desc);

alter table public.pw_sessions enable row level security;
alter table public.pw_session_participants enable row level security;
alter table public.pw_room_holds enable row level security;
alter table public.pw_documents enable row level security;
revoke all on public.pw_sessions, public.pw_session_participants, public.pw_room_holds, public.pw_documents from public, anon, authenticated;
revoke all on function public.pw_hold_booking(), public.pw_hold_session() from public, anon, authenticated;
grant select, insert, update, delete on public.pw_sessions, public.pw_session_participants, public.pw_room_holds, public.pw_documents to service_role;

commit;
