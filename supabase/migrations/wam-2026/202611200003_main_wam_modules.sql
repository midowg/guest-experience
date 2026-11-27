-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Main WAM, fondasi 3 of 3 (docs/main-wam/KONTRAK.md): the data of two modules an admin switches
-- on. Voting Awarding: categories, nominees, one vote per person per category (changeable until it
-- closes), and the BOD's approval of the winner. Silent Meeting: one question per session, open
-- at the session's start and closed at its end (panitia may open it earlier or close it earlier,
-- each once; closed is final), and the feedback, which is anonymous on purpose: no person, no device
-- and no time is stored with it, and no row naming a person is written in its transaction (SPEC
-- T01, B05; audit H1, H2). Both modules' rules (open windows, no vote for oneself, no reopening)
-- hold in the database by the server's clock.
-- Server only (service role). Needs 202611200001 and 202611200002.
-- ROLLBACK (by hand): drop trigger mw_silent_session_moved on mw_sessions; drop table mw_silent_openers, mw_silent_feedback, mw_silent_questions, mw_award_approvals, mw_award_votes, mw_award_nominees, mw_award_categories;
--   drop function mw_award_vote_check, mw_silent_feedback_open, mw_silent_opener_open, mw_silent_question_guard, mw_silent_session_moved, mw_silent_state.
begin;

create table public.mw_award_categories (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 100),
  description text not null default '' check (char_length(description) <= 300),
  -- voting: participants vote; juri: BOD decides; otomatis: computed (shown, not voted).
  method text not null default 'voting' check (method in ('voting', 'juri', 'otomatis')),
  nominee_kind text not null default 'orang' check (nominee_kind in ('orang', 'foto', 'tim', 'departemen')),
  opens_at timestamptz,
  closes_at timestamptz check (closes_at is null or opens_at is null or closes_at > opens_at),
  announce_at timestamptz,
  -- A session with a category (or Silent Meeting feedback, or check-ins) is cancelled, never deleted (audit M4).
  session_id uuid references public.mw_sessions (id) on delete restrict,
  sort integer not null default 0,
  published boolean not null default false,
  updated_at timestamptz not null default now(),
  -- A published voting category has its window.
  constraint mw_award_voting_window check (method <> 'voting' or not published or (opens_at is not null and closes_at is not null))
);

create table public.mw_award_nominees (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.mw_award_categories (id) on delete cascade,
  employee_id uuid references public.employees (id) on delete cascade,
  -- A nominated photo cannot be deleted: its votes and the BOD's approval would go with it (audit M3).
  photo_id uuid references public.mw_photos (id) on delete restrict,
  -- A team or department by name, or a label beside a person or photo.
  label text not null default '' check (char_length(label) <= 100),
  reason text not null default '' check (char_length(reason) <= 300),
  sort integer not null default 0,
  unique (id, category_id),
  constraint mw_award_nominee_who check (employee_id is not null or photo_id is not null or char_length(btrim(label)) > 0)
);
create unique index mw_award_nominee_person on public.mw_award_nominees (category_id, employee_id) where employee_id is not null;
create unique index mw_award_nominee_photo on public.mw_award_nominees (category_id, photo_id) where photo_id is not null;
-- Deleting a person or a photo, or a session, looks these up (audit L1).
create index mw_award_nominees_employee on public.mw_award_nominees (employee_id) where employee_id is not null;
create index mw_award_nominees_photo on public.mw_award_nominees (photo_id) where photo_id is not null;
create index mw_award_categories_session on public.mw_award_categories (session_id) where session_id is not null;

-- The vote's nominee must belong to its category (composite key).
create table public.mw_award_votes (
  category_id uuid not null,
  voter_id uuid not null references public.employees (id) on delete cascade,
  nominee_id uuid not null,
  voted_at timestamptz not null default now(),
  primary key (category_id, voter_id),
  foreign key (nominee_id, category_id) references public.mw_award_nominees (id, category_id) on delete cascade
);
create index mw_award_votes_nominee on public.mw_award_votes (nominee_id);
-- One person's own votes ("Terkirim · Ubah"), and deleting a person (audit L1).
create index mw_award_votes_voter on public.mw_award_votes (voter_id);

-- The rules hold in the database, by the server's clock, not only in the app (RISET §6): a vote
-- only in a published voting category while it is open, and never for oneself (a person, or the
-- owner of a nominated photo). A vote is secret, not anonymous: only aggregates leave the server.
create function public.mw_award_vote_check() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  category public.mw_award_categories%rowtype;
  nominated uuid;
begin
  select * into category from public.mw_award_categories where id = new.category_id;
  if not found or not category.published or category.method <> 'voting'
     or category.opens_at is null or category.closes_at is null or now() < category.opens_at or now() >= category.closes_at then
    raise exception 'vote_closed' using errcode = 'P0001';
  end if;
  select coalesce(n.employee_id, p.owner_id) into nominated
    from public.mw_award_nominees n left join public.mw_photos p on p.id = n.photo_id where n.id = new.nominee_id;
  if nominated = new.voter_id then
    raise exception 'vote_self' using errcode = 'P0001';
  end if;
  new.voted_at := now();
  return new;
end $$;
create trigger mw_award_votes_check before insert or update on public.mw_award_votes for each row execute function public.mw_award_vote_check();

create table public.mw_award_approvals (
  category_id uuid primary key references public.mw_award_categories (id) on delete cascade,
  nominee_id uuid not null,
  -- Who approved; kept empty when that person is removed (audit L1), the approval stays.
  approved_by uuid references public.employees (id) on delete set null,
  approved_at timestamptz not null default now(),
  foreign key (nominee_id, category_id) references public.mw_award_nominees (id, category_id) on delete cascade
);

create table public.mw_silent_questions (
  id uuid primary key default gen_random_uuid(),
  -- Never deleted with its session (its feedback would go too): the session is cancelled instead (audit M4).
  session_id uuid not null unique references public.mw_sessions (id) on delete restrict,
  question text not null check (char_length(btrim(question)) between 5 and 300),
  topics text[] not null default array['Cara kerja', 'Komunikasi', 'Kesejahteraan', 'Lainnya'] check (cardinality(topics) <= 8),
  -- Panitia's hand, each at most once and never undone (mw_silent_question_guard): "Buka sekarang"
  -- before the session's start, "Tutup sekarang" before its end. Without them it opens at the start
  -- and closes at the end. Closed is final: nothing opens it again (KONTRAK §8, audit H2).
  opened_at timestamptz,
  opened_by uuid references public.employees (id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references public.employees (id) on delete set null,
  -- Once closed for good (mw_silent_finalize): how many feedbacks and how many people opened the
  -- form. Only then does any count leave the database (mw_silent_results).
  finalized_at timestamptz,
  feedback_count integer check (feedback_count >= 0),
  opener_count integer check (opener_count >= 0),
  updated_at timestamptz not null default now(),
  constraint mw_silent_opened_by check (opened_by is null or opened_at is not null),
  constraint mw_silent_closed_by check (closed_by is null or closed_at is not null),
  constraint mw_silent_final check (
    (finalized_at is null) = (feedback_count is null) and (finalized_at is null) = (opener_count is null)
    and (finalized_at is null or closed_at is not null))
);

create table public.mw_silent_feedback (
  -- Random (v4), no person, no device, no time. Each feedback is written alone in its own
  -- transaction (mw_silent_send): no other row names the sender in it (audit H1).
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.mw_silent_questions (id) on delete cascade,
  topic text not null default '' check (char_length(topic) <= 40),
  body text not null check (char_length(btrim(body)) between 1 and 1000)
);
create index mw_silent_feedback_question on public.mw_silent_feedback (question_id, id);

-- Who opened the form while it was open (for the threshold "5 different people"), never what they
-- sent and never in the same transaction as a feedback: recorded by a separate request when T01
-- loads (mw_silent_open), once per person per question, under an HMAC of the person with a key of
-- its own. No time. Deleted once the Silent Meeting closes for good (its count stays on the question).
create table public.mw_silent_openers (
  question_id uuid not null references public.mw_silent_questions (id) on delete cascade,
  opener_key text not null check (opener_key ~ '^[0-9a-f]{64}$'),
  primary key (question_id, opener_key)
);

-- The state of a Silent Meeting, by the server's clock: the same rule as silentState in
-- src/lib/main-wam/module-state.ts. Closed (by panitia, or stamped once its hours passed) or a
-- cancelled session: tutup. A draft session: belum. Past the end (a moment without one counts 30
-- minutes): tutup. Opened early by panitia, or past the start: buka.
create function public.mw_silent_state(q public.mw_silent_questions, s public.mw_sessions, at timestamptz default now())
returns text
language sql stable set search_path = public, pg_temp as $$
  select case
    when q.closed_at is not null or s.status = 'batal' then 'tutup'
    when s.status is distinct from 'terbit' then 'belum'
    when at >= coalesce(s.ends_at, s.starts_at + interval '30 minutes') then 'tutup'
    when q.opened_at is not null or at >= s.starts_at then 'buka'
    else 'belum'
  end
$$;

-- Feedback only while it is open (mw_silent_send checks first and answers without an error; this is
-- the net under any other writer). The shuffle of mw_silent_finalize rewrites a closed question's
-- rows, flagged for that one question in its own transaction.
create function public.mw_silent_feedback_open() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  q public.mw_silent_questions%rowtype;
  s public.mw_sessions%rowtype;
begin
  if current_setting('mw.silent_rewrite', true) = new.question_id::text then return new; end if;
  select * into q from public.mw_silent_questions where id = new.question_id;
  select * into s from public.mw_sessions where id = q.session_id;
  if q.id is null or public.mw_silent_state(q, s) <> 'buka' then
    raise exception 'silent_closed' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger mw_silent_feedback_open before insert on public.mw_silent_feedback for each row execute function public.mw_silent_feedback_open();

-- An opener only while it is open.
create function public.mw_silent_opener_open() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  q public.mw_silent_questions%rowtype;
  s public.mw_sessions%rowtype;
begin
  select * into q from public.mw_silent_questions where id = new.question_id;
  select * into s from public.mw_sessions where id = q.session_id;
  if q.id is null or public.mw_silent_state(q, s) <> 'buka' then
    raise exception 'silent_closed' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger mw_silent_opener_open before insert on public.mw_silent_openers for each row execute function public.mw_silent_opener_open();

-- Closed is final, opened is once: a close or an early opening is never changed or undone; an early
-- opening only before it opened by itself; once it opened, its session, question and topics stay
-- (moving it to another session could open it again); its counts are written once.
create function public.mw_silent_question_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  s public.mw_sessions%rowtype;
  was text;
begin
  select * into s from public.mw_sessions where id = old.session_id;
  was := public.mw_silent_state(old, s);
  if old.closed_at is not null and (new.closed_at is distinct from old.closed_at or new.closed_by is distinct from old.closed_by) then
    raise exception 'silent_final' using errcode = 'P0001';
  end if;
  if old.opened_at is not null and (new.opened_at is distinct from old.opened_at or new.opened_by is distinct from old.opened_by) then
    raise exception 'silent_final' using errcode = 'P0001';
  end if;
  if old.opened_at is null and new.opened_at is not null and was <> 'belum' then
    raise exception 'silent_final' using errcode = 'P0001';
  end if;
  if was <> 'belum' and (new.session_id, new.question, new.topics) is distinct from (old.session_id, old.question, old.topics) then
    raise exception 'silent_locked' using errcode = 'P0001';
  end if;
  if old.finalized_at is not null and (new.finalized_at, new.feedback_count, new.opener_count) is distinct from (old.finalized_at, old.feedback_count, old.opener_count) then
    raise exception 'silent_final' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger mw_silent_question_guard before update on public.mw_silent_questions for each row execute function public.mw_silent_question_guard();

-- A session whose hours or status change after its Silent Meeting closed (by its end, or with the
-- session cancelled after it started) does not open it again: the close is stamped on the question
-- first. Cancelled before it ever opened, it may still open when the session is put back.
create function public.mw_silent_session_moved() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  q public.mw_silent_questions%rowtype;
begin
  select * into q from public.mw_silent_questions where session_id = new.id;
  if found and q.closed_at is null and public.mw_silent_state(q, old) = 'tutup' and (q.opened_at is not null or now() >= old.starts_at) then
    update public.mw_silent_questions
      set closed_at = least(now(), coalesce(old.ends_at, old.starts_at + interval '30 minutes')), updated_at = now()
      where id = q.id;
  end if;
  return null;
end $$;
create trigger mw_silent_session_moved after update of starts_at, ends_at, status on public.mw_sessions
  for each row when ((old.starts_at, old.ends_at, old.status) is distinct from (new.starts_at, new.ends_at, new.status))
  execute function public.mw_silent_session_moved();

alter table public.mw_award_categories enable row level security;
alter table public.mw_award_nominees enable row level security;
alter table public.mw_award_votes enable row level security;
alter table public.mw_award_approvals enable row level security;
alter table public.mw_silent_questions enable row level security;
alter table public.mw_silent_feedback enable row level security;
alter table public.mw_silent_openers enable row level security;
revoke all on public.mw_award_categories, public.mw_award_nominees, public.mw_award_votes, public.mw_award_approvals,
  public.mw_silent_questions, public.mw_silent_feedback, public.mw_silent_openers from public, anon, authenticated;
grant select, insert, update, delete on public.mw_award_categories, public.mw_award_nominees, public.mw_award_votes, public.mw_award_approvals,
  public.mw_silent_questions, public.mw_silent_feedback, public.mw_silent_openers to service_role;
revoke all on function public.mw_award_vote_check(), public.mw_silent_feedback_open(), public.mw_silent_opener_open(), public.mw_silent_question_guard(),
  public.mw_silent_session_moved(), public.mw_silent_state(public.mw_silent_questions, public.mw_sessions, timestamptz) from public, anon, authenticated;
-- The triggers and the server's functions (202611200401) read the state as the service role.
grant execute on function public.mw_silent_state(public.mw_silent_questions, public.mw_sessions, timestamptz) to service_role;

commit;
