-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611110001.
--
-- Notulen (MoM) per meeting (decided 11 Nov 2026). Every published meeting except a one-on-one
-- (two people) and an Acara needs its Minutes of Meeting once it is over. Anyone who took part
-- writes it in the app (whoever saves it is its notetaker); panitia, BOD and the HOD/Lead of the
-- booker's department read it.
--   * pw_session_minutes: one per session: a summary and the decisions, who saved it first and
--     last, and when.
--   * pw_session_minute_actions: the follow-ups (tindak lanjut): a task, its PIC, a due date, and
--     whether it is done. Rewritten as a whole when the MoM is saved; "done" can be ticked on its own.
-- Both are read and written only by the server (service role), like the other pw_* tables.
-- Before this runs, Detail sesi says the MoM waits for this migration, and nothing counts as missing.
--
-- ROLLBACK (by hand): drop table public.pw_session_minute_actions, public.pw_session_minutes;
begin;

create table if not exists public.pw_session_minutes (
  session_id uuid primary key references public.pw_sessions (id) on delete cascade,
  summary text not null default '' check (char_length(summary) <= 4000),
  decisions text not null default '' check (char_length(decisions) <= 4000),
  submitted_by uuid references public.employees (id) on delete set null,
  submitted_at timestamptz not null default now(),
  updated_by uuid references public.employees (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (char_length(btrim(summary)) >= 2 or char_length(btrim(decisions)) >= 2)
);

create table if not exists public.pw_session_minute_actions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.pw_session_minutes (session_id) on delete cascade,
  sort_order integer not null default 0,
  task text not null check (char_length(btrim(task)) between 2 and 300),
  pic_id uuid references public.employees (id) on delete set null,
  due_date date,
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references public.employees (id) on delete set null
);
create index if not exists pw_session_minute_actions_session on public.pw_session_minute_actions (session_id, sort_order);
create index if not exists pw_session_minute_actions_pic on public.pw_session_minute_actions (pic_id) where not done;

alter table public.pw_session_minutes enable row level security;
alter table public.pw_session_minute_actions enable row level security;
revoke all on public.pw_session_minutes, public.pw_session_minute_actions from anon, authenticated;

commit;
