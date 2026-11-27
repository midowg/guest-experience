-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- WAM: a profile photo per account (a small WebP in R2 under pra-wam/foto/…; only its key is kept
-- here) and "Lupa password" as a request to the admin, who resets it to the shared first password.
-- Needs 202611040001. Server only (service role).
begin;

alter table public.pw_accounts
  add column photo_key text check (photo_key is null or photo_key ~ '^pra-wam/foto/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$'),
  add column photo_updated_at timestamptz;

create table public.pw_reset_requests (
  id uuid primary key default gen_random_uuid(),
  -- Null when the email matched no account: kept so the admin sees it, never told to the asker.
  employee_id uuid references public.employees (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 200),
  note text not null default '' check (char_length(note) <= 300),
  status text not null default 'menunggu' check (status in ('menunggu', 'selesai', 'ditolak')),
  handled_by text,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

-- One open request per account at a time.
create unique index pw_reset_requests_open on public.pw_reset_requests (employee_id) where status = 'menunggu' and employee_id is not null;
create index pw_reset_requests_status on public.pw_reset_requests (status, created_at desc);

alter table public.pw_reset_requests enable row level security;
revoke all on public.pw_reset_requests from public, anon, authenticated;
grant select, insert, update, delete on public.pw_reset_requests to service_role;

commit;
