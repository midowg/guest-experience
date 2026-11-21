-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Main WAM, Kuis live (module "kuis", docs/rancangan-kuis-wam.md §8a, docs/main-wam/KONTRAK.md §13): a
-- multiple-choice game played together during a WAM session, the question on a big screen and on the
-- phones, answered in the app, players anonymous as their tokoh.
--   mw_quizzes          a quiz (title) and its big-screen link (only the sha256 of its key is kept)
--   mw_quiz_hosts       who may run it (pengendali), chosen per quiz in Admin WAM; Admin WAM's role
--                       holders run every quiz (checked in the app). Panitia alone is not enough.
--   mw_quiz_questions   level 1–4 (15/20/30/40 s), text, 4 options, the key; no images in v1
--   mw_quiz_runs        one game: its questions frozen when it is made, the phase and the question in
--                       play, the MC's pauses, cancelled questions, scoreboards shown, the podium, and a
--                       revision number every change bumps (the MC acts on the revision he saw)
--   mw_quiz_players     who joined a game, with the alias the others see (the tokoh of their card, or
--                       "Tokoh misterius #NN", the number fixed for the game)
--   mw_quiz_answers     one per person per question (primary key): the option, the answer time without
--                       pauses, and its points (300–500 right, −100 wrong). Totals are never kept: a
--                       total is the sum of the answers (mw_quiz_board), so it cannot drift.
-- The rules of time (open, close + 2 s, the 1.5 s tap window, pauses) are the server's, by its clock
-- (src/lib/main-wam/kuis/rules.ts); the database holds one answer per person per question, at most one
-- game per quiz that is not over, and the scores' bounds. Server only (service role). Needs 202611200001
-- (Main WAM) and employees.
-- "Kuis dimulai" goes through Main WAM's notes (mw_notes) with a kind of its own, "kuis", on the existing
-- push topic "pengumuman" (notePushTopic): no new topic.
-- ROLLBACK (by hand): drop function mw_quiz_board(uuid, integer, integer), mw_quiz_join(uuid, uuid, text, text, text, text[]);
--   drop table mw_quiz_answers, mw_quiz_players, mw_quiz_runs, mw_quiz_questions, mw_quiz_hosts, mw_quizzes;
--   delete from mw_notes where kind = 'kuis'; then put back the kind check of 202611200001 (without 'kuis').
begin;

create table public.mw_quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 80),
  -- The big screen's address holds a random key (kuis_ + 32 bytes); only its sha256 is kept, so a
  -- database leak gives no working address. A new link replaces the old one.
  screen_key_hash text unique check (screen_key_hash is null or screen_key_hash ~ '^[0-9a-f]{64}$'),
  screen_key_hint text check (screen_key_hint is null or char_length(screen_key_hint) <= 8),
  created_by text not null default '' check (char_length(created_by) <= 150),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mw_quiz_hosts (
  quiz_id uuid not null references public.mw_quizzes (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  added_by text not null default '' check (char_length(added_by) <= 150),
  added_at timestamptz not null default now(),
  primary key (quiz_id, employee_id)
);
-- "Kendalikan kuis" on Beranda (a person's quizzes), and deleting a person (audit L1).
create index mw_quiz_hosts_employee on public.mw_quiz_hosts (employee_id);

create table public.mw_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.mw_quizzes (id) on delete cascade,
  level smallint not null check (level between 1 and 4),
  sort integer not null default 0,
  body text not null check (char_length(btrim(body)) between 3 and 200),
  options text[] not null check (array_length(options, 1) = 4 and array_position(options, null) is null),
  correct smallint not null check (correct between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mw_quiz_questions_quiz on public.mw_quiz_questions (quiz_id, level, sort);

create table public.mw_quiz_runs (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.mw_quizzes (id) on delete cascade,
  number integer not null check (number >= 1),
  phase text not null default 'siap' check (phase in ('siap', 'lobi', 'bersiap', 'soal', 'batal', 'skor', 'podium', 'selesai')),
  question_index integer not null default -1 check (question_index >= -1),
  -- [{id, level, body, options[4], correct}] in play order, frozen when the game is made: editing the
  -- quiz never changes a game in progress. The key stays on the server until each answer opens.
  questions jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 1 and 40),
  phase_at timestamptz not null default now(),
  -- The MC's pauses in this phase: [{from, to}] in epoch milliseconds, to = null while it lasts.
  pauses jsonb not null default '[]'::jsonb check (jsonb_typeof(pauses) = 'array'),
  canceled integer[] not null default '{}',
  boards integer[] not null default '{}',
  podium_revealed smallint not null default 0 check (podium_revealed between 0 and 3),
  rev integer not null default 1 check (rev >= 1),
  created_by text not null default '' check (char_length(created_by) <= 150),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (quiz_id, number)
);
-- At most one game of a quiz that is not over: Beranda's card and the phones follow that one.
create unique index mw_quiz_runs_active on public.mw_quiz_runs (quiz_id) where phase <> 'selesai';
-- Beranda: the games on now.
create index mw_quiz_runs_live on public.mw_quiz_runs (phase) where phase <> 'selesai';

create table public.mw_quiz_players (
  run_id uuid not null references public.mw_quiz_runs (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  -- What everyone else sees: the tokoh's name, or "Tokoh misterius #07" (never the person's name).
  alias text not null check (char_length(alias) between 1 and 80),
  figure_key text check (figure_key is null or figure_key ~ '^[a-z0-9-]{1,60}$'),
  persona text not null default '' check (char_length(persona) <= 60),
  colors text[] check (colors is null or (array_length(colors, 1) = 2 and colors[1] ~ '^#[0-9A-Fa-f]{6}$' and colors[2] ~ '^#[0-9A-Fa-f]{6}$')),
  mystery_no smallint check (mystery_no is null or mystery_no >= 1),
  joined_at timestamptz not null default now(),
  primary key (run_id, employee_id),
  constraint mw_quiz_player_alias check ((figure_key is null) = (mystery_no is not null))
);
create unique index mw_quiz_players_mystery on public.mw_quiz_players (run_id, mystery_no) where mystery_no is not null;
create index mw_quiz_players_employee on public.mw_quiz_players (employee_id);

create table public.mw_quiz_answers (
  run_id uuid not null,
  question_index smallint not null check (question_index between 0 and 39),
  employee_id uuid not null,
  choice smallint not null check (choice between 0 and 3),
  -- The answer time without the MC's pauses, 0 … the question's time.
  ms integer not null check (ms between 0 and 40000),
  correct boolean not null,
  points integer not null check ((correct and points between 300 and 500) or (not correct and points = -100)),
  -- The tap the server accepted (the phone's, or arrival − 1.5 s), and when the answer arrived.
  tapped_at timestamptz not null,
  received_at timestamptz not null default now(),
  -- One answer per person per question: a second one is refused.
  primary key (run_id, question_index, employee_id),
  foreign key (run_id, employee_id) references public.mw_quiz_players (run_id, employee_id) on delete cascade
);
-- A player's own answers (their phone), and deleting a player (audit L1).
create index mw_quiz_answers_player on public.mw_quiz_answers (run_id, employee_id);

-- Joining a game: the alias the server chose (a tokoh), or the next "Tokoh misterius #NN" of this game.
-- Expected refusals are answers, not errors: 'ok', 'sudah' (joined before), 'tutup' (not open for
-- joining: before the lobby, on the podium, over), 'unknown'.
create function public.mw_quiz_join(p_run uuid, p_employee uuid, p_figure text, p_alias text, p_persona text, p_colors text[])
returns text
language plpgsql set search_path = public, pg_temp as $$
declare
  v_phase text;
  v_no smallint;
begin
  select phase into v_phase from public.mw_quiz_runs where id = p_run;
  if not found then return 'unknown'; end if;
  if v_phase in ('siap', 'podium', 'selesai') then return 'tutup'; end if;
  -- One at a time per game, so two players never get the same number.
  perform pg_advisory_xact_lock(hashtextextended('mw_quiz_join:' || p_run::text, 0));
  if exists (select 1 from public.mw_quiz_players where run_id = p_run and employee_id = p_employee) then return 'sudah'; end if;
  if p_figure is null then
    select coalesce(max(mystery_no), 0) + 1 into v_no from public.mw_quiz_players where run_id = p_run;
    insert into public.mw_quiz_players (run_id, employee_id, alias, mystery_no)
      values (p_run, p_employee, 'Tokoh misterius #' || lpad(v_no::text, 2, '0'), v_no);
  else
    insert into public.mw_quiz_players (run_id, employee_id, alias, figure_key, persona, colors)
      values (p_run, p_employee, left(p_alias, 80), p_figure, left(coalesce(p_persona, ''), 60), p_colors);
  end if;
  return 'ok';
end $$;

-- Everyone in a game with their totals up to question p_upto, and up to p_prev (for "Naik 3 peringkat"
-- and the scoreboard's swap); cancelled questions left out. A total is the sum of the answers. The tie
-- rules (the total time of right answers, then the last right answer) are the app's, from these sums.
create function public.mw_quiz_board(p_run uuid, p_upto integer, p_prev integer)
returns table (
  employee_id uuid, alias text, figure_key text, persona text, colors text[], mystery_no smallint, joined_at timestamptz,
  total integer, correct integer, correct_ms bigint, last_correct_at timestamptz,
  prev_total integer, prev_correct_ms bigint, prev_last_correct_at timestamptz
)
language sql stable set search_path = public, pg_temp as $$
  select p.employee_id, p.alias, p.figure_key, p.persona, p.colors, p.mystery_no, p.joined_at,
    coalesce(sum(a.points) filter (where a.question_index <= p_upto), 0)::integer,
    (count(*) filter (where a.correct and a.question_index <= p_upto))::integer,
    coalesce(sum(a.ms) filter (where a.correct and a.question_index <= p_upto), 0)::bigint,
    max(a.tapped_at) filter (where a.correct and a.question_index <= p_upto),
    coalesce(sum(a.points) filter (where a.question_index <= p_prev), 0)::integer,
    coalesce(sum(a.ms) filter (where a.correct and a.question_index <= p_prev), 0)::bigint,
    max(a.tapped_at) filter (where a.correct and a.question_index <= p_prev)
  from public.mw_quiz_players p
  join public.mw_quiz_runs r on r.id = p.run_id
  left join public.mw_quiz_answers a on a.run_id = p.run_id and a.employee_id = p.employee_id and not (a.question_index = any (r.canceled))
  where p.run_id = p_run
  group by p.employee_id, p.alias, p.figure_key, p.persona, p.colors, p.mystery_no, p.joined_at
$$;

-- The note's kind (202611200001 listed the kinds of then).
alter table public.mw_notes drop constraint if exists mw_notes_kind_check;
alter table public.mw_notes add constraint mw_notes_kind_check
  check (kind in ('pengumuman', 'jadwal', 'absen', 'momen', 'kamar', 'silent', 'voting', 'survei', 'lain', 'kuis'));

alter table public.mw_quizzes enable row level security;
alter table public.mw_quiz_hosts enable row level security;
alter table public.mw_quiz_questions enable row level security;
alter table public.mw_quiz_runs enable row level security;
alter table public.mw_quiz_players enable row level security;
alter table public.mw_quiz_answers enable row level security;
revoke all on public.mw_quizzes, public.mw_quiz_hosts, public.mw_quiz_questions, public.mw_quiz_runs, public.mw_quiz_players, public.mw_quiz_answers
  from public, anon, authenticated;
grant select, insert, update, delete on public.mw_quizzes, public.mw_quiz_hosts, public.mw_quiz_questions, public.mw_quiz_runs, public.mw_quiz_players, public.mw_quiz_answers
  to service_role;
revoke all on function public.mw_quiz_join(uuid, uuid, text, text, text, text[]), public.mw_quiz_board(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.mw_quiz_join(uuid, uuid, text, text, text, text[]), public.mw_quiz_board(uuid, integer, integer) to service_role;

commit;
