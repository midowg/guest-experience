-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Pra WAM, tahap 3: attendance by a static QR per session, printed by panitia and stuck at the
-- door. The QR holds an address with the session's token; scanning it signs the person in for
-- that session from 30 minutes before the start to 30 minutes after the end. The token is kept as
-- it is (not hashed) so panitia can print the same QR again; it is only readable by the server,
-- and "Buat QR baru" replaces it when a printed sheet goes astray. Needs 202611040004.
begin;

alter table public.pw_sessions add column qr_token text unique check (qr_token is null or qr_token ~ '^[A-Za-z0-9_-]{20,64}$');

create table public.pw_attendance (
  session_id uuid not null references public.pw_sessions (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  -- qr: the person scanned; manual: panitia marked them present.
  method text not null check (method in ('qr', 'manual')),
  recorded_by uuid references public.employees (id),
  -- One check-in per person per session: scanning again changes nothing.
  primary key (session_id, employee_id),
  constraint pw_attendance_manual check ((method = 'manual') = (recorded_by is not null))
);

alter table public.pw_attendance enable row level security;
revoke all on public.pw_attendance from public, anon, authenticated;
grant select, insert, update, delete on public.pw_attendance to service_role;

commit;
