-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Main WAM, fondasi 3 of 3 (docs/main-wam/KONTRAK.md): the data of two modules an admin switches
-- on. Voting Awarding: categories, nominees, one vote per person per category (changeable until it
-- closes), and the BOD's approval of the winner. Silent Meeting: one question per session, open
-- with the session's hours unless panitia overrides, and the feedback, which is anonymous on
-- purpose: no person, no device and no time is stored with it (SPEC T01, B05). Both modules' rules
-- (open windows, no vote for oneself) hold in the database by the server's clock.
-- Server only (service role). Needs 202611200001 and 202611200002.
-- ROLLBACK (by hand): drop table mw_silent_participation, mw_silent_feedback, mw_silent_questions, mw_award_approvals, mw_award_votes, mw_award_nominees, mw_award_categories; drop function mw_award_vote_check, mw_silent_feedback_open.
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
  session_id uuid references public.mw_sessions (id) on delete set null,
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
  photo_id uuid references public.mw_photos (id) on delete cascade,
  -- A team or department by name, or a label beside a person or photo.
  label text not null default '' check (char_length(label) <= 100),
  reason text not null default '' check (char_length(reason) <= 300),
  sort integer not null default 0,
  unique (id, category_id),
  constraint mw_award_nominee_who check (employee_id is not null or photo_id is not null or char_length(btrim(label)) > 0)
);
create unique index mw_award_nominee_person on public.mw_award_nominees (category_id, employee_id) where employee_id is not null;
create unique index mw_award_nominee_photo on public.mw_award_nominees (category_id, photo_id) where photo_id is not null;

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
  approved_by uuid not null references public.employees (id),
  approved_at timestamptz not null default now(),
  foreign key (nominee_id, category_id) references public.mw_award_nominees (id, category_id) on delete cascade
);

create table public.mw_silent_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.mw_sessions (id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 5 and 300),
  topics text[] not null default array['Cara kerja', 'Komunikasi', 'Kesejahteraan', 'Lainnya'] check (cardinality(topics) <= 8),
  -- Panitia's hand on the switch; null = follow the session's hours.
  override text check (override is null or override in ('buka', 'tutup')),
  override_at timestamptz,
  override_by uuid references public.employees (id) on delete set null,
  -- "Tutup otomatis" at the session's end.
  auto_close boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint mw_silent_override check ((override is null) = (override_at is null))
);

create table public.mw_silent_feedback (
  -- Random (v4): ordering by it shuffles the recap, so nobody can tell a sender by when they wrote.
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.mw_silent_questions (id) on delete cascade,
  topic text not null default '' check (char_length(topic) <= 40),
  body text not null check (char_length(btrim(body)) between 1 and 1000)
);
create index mw_silent_feedback_question on public.mw_silent_feedback (question_id, id);

-- Who has sent (to show the recap from 5 different people, and to limit sending), never linked to
-- what they sent: a keyed hash of the person (HMAC with a server secret; a plain hash of ~120 ids
-- is easy to reverse), and how many they sent. No time here either.
create table public.mw_silent_participation (
  question_id uuid not null references public.mw_silent_questions (id) on delete cascade,
  participant_key text not null check (participant_key ~ '^[0-9a-f]{64}$'),
  sent integer not null default 1 check (sent between 1 and 50),
  primary key (question_id, participant_key)
);

-- Feedback only while the Silent Meeting is open, by the server's clock: with its published
-- session's hours (a moment without an end counts 30 minutes), unless panitia opened it ("buka":
-- open until the end when Tutup otomatis, else until closed) or closed it ("tutup").
-- The same rule as silentState in src/lib/main-wam/module-state.ts.
create function public.mw_silent_feedback_open() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  q public.mw_silent_questions%rowtype;
  s public.mw_sessions%rowtype;
  ends timestamptz;
begin
  select * into q from public.mw_silent_questions where id = new.question_id;
  select * into s from public.mw_sessions where id = q.session_id;
  ends := coalesce(s.ends_at, s.starts_at + interval '30 minutes');
  if s.status <> 'terbit' or q.override = 'tutup'
     or (q.override = 'buka' and q.auto_close and now() >= ends)
     or (q.override is null and (now() < s.starts_at or now() >= ends)) then
    raise exception 'silent_closed' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger mw_silent_feedback_open before insert on public.mw_silent_feedback for each row execute function public.mw_silent_feedback_open();

alter table public.mw_award_categories enable row level security;
alter table public.mw_award_nominees enable row level security;
alter table public.mw_award_votes enable row level security;
alter table public.mw_award_approvals enable row level security;
alter table public.mw_silent_questions enable row level security;
alter table public.mw_silent_feedback enable row level security;
alter table public.mw_silent_participation enable row level security;
revoke all on public.mw_award_categories, public.mw_award_nominees, public.mw_award_votes, public.mw_award_approvals,
  public.mw_silent_questions, public.mw_silent_feedback, public.mw_silent_participation from public, anon, authenticated;
grant select, insert, update, delete on public.mw_award_categories, public.mw_award_nominees, public.mw_award_votes, public.mw_award_approvals,
  public.mw_silent_questions, public.mw_silent_feedback, public.mw_silent_participation to service_role;
revoke all on function public.mw_award_vote_check(), public.mw_silent_feedback_open() from public, anon, authenticated;

commit;
