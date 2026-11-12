-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611120002 (and 0003 if it exists).
--
-- MoM lewat Telegram, tahap 2 (12 Nov 2026, docs/rancangan-mom-telegram.md):
--   * pw_session_minutes: a MoM is a draft until its notetaker presses Kirim MoM (sent_at, sent_by);
--     each save after that is a new version. telegram_off keeps one MoM out of Telegram (a
--     sensitive meeting). A MoM saved before this migration counts as sent, version 1, as before.
--   * pw_telegram_groups / pw_telegram_codes: a group may stand for a team inside a department
--     (employee_jobs.unit: Sales & Marketing's Business Solutions, Commercial, Corporate Marketing
--     Communication), one active group per department and team.
--   * pw_telegram_messages: the message each MoM has in each group (to change it in place, without
--     a sound, when the MoM changes), and whether the last try went through.
-- Read and written only by the server (service role), like the other pw_* tables.
--
-- ROLLBACK (by hand):
--   drop table if exists public.pw_telegram_messages;
--   drop index if exists public.pw_telegram_groups_department;
--   create unique index pw_telegram_groups_department on public.pw_telegram_groups (lower(btrim(department))) where active and scope = 'departemen';
--   alter table public.pw_telegram_groups drop column if exists unit;
--   alter table public.pw_telegram_codes drop column if exists unit;
--   alter table public.pw_session_minutes drop column if exists sent_at, drop column if exists sent_by,
--     drop column if exists version, drop column if exists telegram_off;
begin;

alter table public.pw_session_minutes add column if not exists sent_at timestamptz;
alter table public.pw_session_minutes add column if not exists sent_by uuid references public.employees (id) on delete set null;
alter table public.pw_session_minutes add column if not exists version integer not null default 0 check (version >= 0);
alter table public.pw_session_minutes add column if not exists telegram_off boolean not null default false;
-- What was saved before drafts existed was the MoM itself.
update public.pw_session_minutes set sent_at = submitted_at, sent_by = submitted_by, version = 1 where sent_at is null;

alter table public.pw_telegram_groups add column if not exists unit text;
alter table public.pw_telegram_groups drop constraint if exists pw_telegram_groups_unit;
alter table public.pw_telegram_groups add constraint pw_telegram_groups_unit
  check (unit is null or (scope = 'departemen' and char_length(btrim(unit)) between 1 and 120));
alter table public.pw_telegram_codes add column if not exists unit text;
alter table public.pw_telegram_codes drop constraint if exists pw_telegram_codes_unit;
alter table public.pw_telegram_codes add constraint pw_telegram_codes_unit
  check (unit is null or (scope = 'departemen' and char_length(btrim(unit)) between 1 and 120));
drop index if exists public.pw_telegram_groups_department;
create unique index pw_telegram_groups_department on public.pw_telegram_groups (lower(btrim(department)), lower(btrim(coalesce(unit, ''))))
  where active and scope = 'departemen';

create table if not exists public.pw_telegram_messages (
  session_id uuid not null references public.pw_sessions (id) on delete cascade,
  chat_id bigint not null,
  title text not null default '' check (char_length(title) <= 255),
  message_id integer,
  version integer not null default 0,
  status text not null check (status in ('terkirim', 'gagal')),
  error text check (error is null or char_length(error) <= 500),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (session_id, chat_id)
);

alter table public.pw_telegram_messages enable row level security;
revoke all on public.pw_telegram_messages from anon, authenticated;
grant select, insert, update, delete on public.pw_telegram_messages to service_role;

commit;
