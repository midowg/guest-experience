-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor.
--
-- HOD (decided 6 Nov 2026):
--   * HOD becomes a role Admin WAM can tick (pw_roles 'hod'), besides the department leads from the
--     unit import, who stay HOD on their own. A BOD is never HOD (enforced in the app, as before).
--   * Meeting HOD: a HOD asks the HODs of the departments they pick to a meeting (title, agenda,
--     date, hours, place). Each invited HOD accepts or declines; the meeting is scheduled once all
--     accept, and declined when one declines. Every HOD sees the list; only the invited take part.
--
-- ROLLBACK (by hand): drop table pw_hod_meeting_invites, pw_hod_meetings; delete from pw_roles
-- where role = 'hod'; restore pw_roles_role_check to ('panitia', 'bod', 'admin').
begin;

alter table public.pw_roles drop constraint if exists pw_roles_role_check;
alter table public.pw_roles add constraint pw_roles_role_check check (role in ('panitia', 'bod', 'admin', 'hod'));

create table if not exists public.pw_hod_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 120),
  agenda text not null default '' check (char_length(agenda) <= 1000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  place text not null default '' check (char_length(place) <= 120),
  requested_by uuid not null references public.employees (id),
  status text not null default 'menunggu' check (status in ('menunggu', 'terjadwal', 'ditolak', 'batal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One WIB day, at most 8 hours.
  constraint pw_hod_meeting_order check (
    ends_at > starts_at and ends_at - starts_at <= interval '8 hours'
    and (starts_at at time zone 'Asia/Jakarta')::date = (ends_at at time zone 'Asia/Jakarta')::date
  )
);
create index if not exists pw_hod_meetings_starts on public.pw_hod_meetings (starts_at);

-- One row per invited HOD, with the department they were asked for and their answer.
create table if not exists public.pw_hod_meeting_invites (
  meeting_id uuid not null references public.pw_hod_meetings (id) on delete cascade,
  employee_id uuid not null references public.employees (id),
  unit_id uuid references public.org_units (id) on delete set null,
  response text not null default 'menunggu' check (response in ('menunggu', 'terima', 'tolak')),
  note text not null default '' check (char_length(note) <= 300),
  responded_at timestamptz,
  primary key (meeting_id, employee_id)
);
create index if not exists pw_hod_meeting_invites_employee on public.pw_hod_meeting_invites (employee_id);

alter table public.pw_hod_meetings enable row level security;
alter table public.pw_hod_meeting_invites enable row level security;
revoke all on public.pw_hod_meetings, public.pw_hod_meeting_invites from public, anon, authenticated;
grant select, insert, update, delete on public.pw_hod_meetings, public.pw_hod_meeting_invites to service_role;

commit;
