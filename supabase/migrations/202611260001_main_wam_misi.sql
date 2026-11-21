-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Main WAM, S2 Misi + poin + Peringkat (docs/main-wam/KONTRAK.md, keputusan pemilik 21 Nov 2026).
-- Every participant has missions with points. Three kinds: foto (a photo straight from the camera,
-- location on, kept apart from Momen), checkin (a place and a radius, checked on the server against the
-- phone's coordinates) and sesi (done at a session, credited by panitia or automatically from absen).
--   mw_mission_settings    one row: the default radius, the worst GPS accuracy accepted, and whether the
--                          Peringkat is open to participants. Example values; Admin WAM changes them.
--   mw_missions            the missions (title, kind, points, place and radius, session, window, order, active).
--   mw_mission_completions one per person per mission: the proof (photo, coordinates, distance) and its
--                          status (menunggu / disetujui / ditolak); a rejected one may be sent again.
--   mw_point_entries       the points as a ledger (the balance is the sum of the rows, never a column):
--                          one row per approved completion (kept in step by a trigger) and manual rows.
--   mw_point_totals        view: points and missions done per person, for the Peringkat.
-- Server only (service role): closed to anon and authenticated. Needs 202611200001 (mw_sessions).
-- ROLLBACK (by hand): drop view mw_point_totals; drop table mw_point_entries, mw_mission_completions, mw_missions, mw_mission_settings;
--   drop function mw_completion_points().
begin;

create table public.mw_mission_settings (
  id boolean primary key default true check (id),
  default_radius_m integer not null default 50 check (default_radius_m between 10 and 1000),
  max_accuracy_m integer not null default 100 check (max_accuracy_m between 10 and 1000),
  leaderboard_open boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.mw_mission_settings (id) values (true) on conflict do nothing;

create table public.mw_missions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 100),
  description text not null default '' check (char_length(description) <= 500),
  kind text not null check (kind in ('foto', 'checkin', 'sesi')),
  points integer not null default 10 check (points between 0 and 1000),
  -- The place (foto: optional, a photo must then be taken inside it; checkin: required).
  place_name text not null default '' check (char_length(place_name) <= 100),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  -- null = the default radius of mw_mission_settings.
  radius_m integer check (radius_m between 10 and 5000),
  -- sesi: the session, and who credits it (panitia by hand, or automatically from its absen).
  session_id uuid references public.mw_sessions (id) on delete set null,
  credit text not null default 'panitia' check (credit in ('panitia', 'absen')),
  -- true: a proof waits for an admin's approval before its points count.
  review boolean not null default false,
  opens_at timestamptz,
  closes_at timestamptz,
  sort integer not null default 0,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mw_missions_point check ((latitude is null) = (longitude is null)),
  constraint mw_missions_checkin check (kind <> 'checkin' or latitude is not null),
  constraint mw_missions_window check (opens_at is null or closes_at is null or closes_at > opens_at)
);
create index mw_missions_session on public.mw_missions (session_id);
create index mw_missions_order on public.mw_missions (sort, created_at);

create table public.mw_mission_completions (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.mw_missions (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  source text not null check (source in ('foto', 'lokasi', 'absen', 'panitia')),
  status text not null default 'disetujui' check (status in ('menunggu', 'disetujui', 'ditolak')),
  proof_key text,
  proof_thumb_key text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  accuracy_m integer check (accuracy_m >= 0),
  distance_m integer check (distance_m >= 0),
  taken_at timestamptz,
  note text not null default '' check (char_length(note) <= 300),
  reviewed_by uuid references public.employees (id) on delete set null,
  reviewed_at timestamptz,
  review_note text not null default '' check (char_length(review_note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mission_id, employee_id)
);
create index mw_mission_completions_employee on public.mw_mission_completions (employee_id);
create index mw_mission_completions_reviewer on public.mw_mission_completions (reviewed_by);
create index mw_mission_completions_status on public.mw_mission_completions (status, created_at);

create table public.mw_point_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  points integer not null check (points between -1000 and 1000 and points <> 0),
  kind text not null check (kind in ('misi', 'manual')),
  mission_id uuid references public.mw_missions (id) on delete set null,
  completion_id uuid unique references public.mw_mission_completions (id) on delete cascade,
  note text not null default '' check (char_length(note) <= 200),
  created_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint mw_point_entries_kind check ((kind = 'misi') = (completion_id is not null))
);
create index mw_point_entries_employee on public.mw_point_entries (employee_id);
create index mw_point_entries_mission on public.mw_point_entries (mission_id);
create index mw_point_entries_creator on public.mw_point_entries (created_by);

-- An approved completion holds one ledger row (the mission's points as they are at that moment); any
-- other status holds none. A rejected completion therefore takes its points back, and an approved one
-- sent again gives them once, never twice (completion_id is unique).
create function public.mw_completion_points() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  worth integer;
begin
  if new.status = 'disetujui' then
    select points into worth from public.mw_missions where id = new.mission_id;
    if coalesce(worth, 0) <> 0 then
      insert into public.mw_point_entries (employee_id, points, kind, mission_id, completion_id)
        values (new.employee_id, worth, 'misi', new.mission_id, new.id)
        on conflict (completion_id) do nothing;
    end if;
  else
    delete from public.mw_point_entries where completion_id = new.id;
  end if;
  return new;
end $$;
create trigger mw_mission_completions_points after insert or update of status on public.mw_mission_completions
  for each row execute function public.mw_completion_points();

create view public.mw_point_totals with (security_invoker = true) as
  select employee_id, sum(points)::integer as points, (count(*) filter (where kind = 'misi'))::integer as missions
  from public.mw_point_entries group by employee_id;

alter table public.mw_mission_settings enable row level security;
alter table public.mw_missions enable row level security;
alter table public.mw_mission_completions enable row level security;
alter table public.mw_point_entries enable row level security;
revoke all on public.mw_mission_settings, public.mw_missions, public.mw_mission_completions, public.mw_point_entries, public.mw_point_totals from public, anon, authenticated;
grant select, insert, update, delete on public.mw_mission_settings, public.mw_missions, public.mw_mission_completions, public.mw_point_entries to service_role;
grant select on public.mw_point_totals to service_role;
revoke all on function public.mw_completion_points() from public, anon, authenticated;

commit;
