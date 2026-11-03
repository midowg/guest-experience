-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Pra WAM, tahap 4b: a participant asks panitia to move a session. Asking changes nothing; only
-- panitia approving moves the session, and only if it is still where it was when asked (the
-- request keeps that time), so two answers cannot overwrite each other. Needs 202611040004.
begin;

create table public.pw_schedule_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.pw_sessions (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  -- Where the session was when asked.
  from_starts_at timestamptz not null,
  from_ends_at timestamptz not null,
  -- Where the person would like it.
  to_starts_at timestamptz not null,
  to_ends_at timestamptz not null check (to_ends_at > to_starts_at),
  to_room_id uuid references public.pw_rooms (id),
  reason text not null check (char_length(btrim(reason)) between 5 and 1000),
  status text not null default 'diajukan' check (status in ('diajukan', 'disetujui', 'ditolak', 'ditarik')),
  reviewed_by uuid references public.employees (id),
  reviewed_at timestamptz,
  review_note text not null default '' check (char_length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  constraint pw_request_reviewed check ((status in ('disetujui', 'ditolak')) = (reviewed_at is not null))
);
-- One open request per person per session.
create unique index pw_schedule_requests_open on public.pw_schedule_requests (session_id, employee_id) where status = 'diajukan';
create index pw_schedule_requests_status on public.pw_schedule_requests (status, created_at desc);

alter table public.pw_schedule_requests enable row level security;
revoke all on public.pw_schedule_requests from public, anon, authenticated;
grant select, insert, update, delete on public.pw_schedule_requests to service_role;

commit;
