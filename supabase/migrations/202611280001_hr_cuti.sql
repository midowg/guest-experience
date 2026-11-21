-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- WG People, cuti and the late rule (decided 21 Nov 2026):
--   1. Employees ask for cuti, sakit, izin or dinas for a span of days in WG People
--      (pw_leave_requests); Admin HR approves or refuses. Approved and waiting ones show in the
--      team calendar in the app and in Admin HR's tables (waiting ones marked as waiting).
--   2. Telat: a masuk after pw_hr_settings.late_after (09:00 by default, the owner's choice) in the
--      office's own zone counts as late in Admin HR's tables. Admin HR can change it.
-- Server only, like every pw_* table. The code works before this runs (no cuti, late after 09:00).
--
-- ROLLBACK (by hand): drop table if exists public.pw_leave_requests;
--   alter table public.pw_hr_settings drop column if exists late_after;
begin;

alter table public.pw_hr_settings add column if not exists late_after time not null default '09:00';

create table if not exists public.pw_leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  type text not null check (type in ('cuti', 'sakit', 'izin', 'dinas')),
  start_date date not null,
  end_date date not null,
  note text not null check (char_length(btrim(note)) between 3 and 300),
  status text not null default 'menunggu' check (status in ('menunggu', 'disetujui', 'ditolak', 'dibatalkan')),
  decided_by uuid references public.employees (id) on delete set null,
  decided_label text check (decided_label is null or char_length(decided_label) <= 120),
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  created_at timestamptz not null default now(),
  constraint pw_leave_requests_span check (end_date >= start_date and end_date - start_date <= 60)
);
create index if not exists pw_leave_requests_waiting on public.pw_leave_requests (created_at) where status = 'menunggu';
create index if not exists pw_leave_requests_person on public.pw_leave_requests (employee_id, start_date desc);
create index if not exists pw_leave_requests_days on public.pw_leave_requests (start_date, end_date) where status in ('menunggu', 'disetujui');

alter table public.pw_leave_requests enable row level security;
revoke all on public.pw_leave_requests from public, anon, authenticated;
grant select, insert, update, delete on public.pw_leave_requests to service_role;

commit;
