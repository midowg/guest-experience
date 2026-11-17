-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Main WAM, agen D (modul acara; docs/main-wam/KONTRAK.md §6, §8): the rules of two modules that must
-- hold in the database, by the server's clock, not only in the app (RISET §6, §7):
--   1. Silent Meeting (audit H1, H2, L12):
--      - mw_silent_send writes one feedback and nothing else: no person, no count, no time, and no
--        other row in its transaction. The cap per person lives in the server's memory, never here.
--      - mw_silent_open records, in its own request, that a person opened the form while it was open
--        (an HMAC of the person, once per question), for the threshold "5 different people".
--      - mw_silent_control: panitia's "Buka sekarang" (before the start, once) and "Tutup sekarang"
--        (while open, final). Nothing opens a closed Silent Meeting again.
--      - mw_silent_finalize, once closed for good: rewrites its feedback in a random order in one
--        transaction (one xmin, a random physical order, new ids), keeps the counts on the question
--        and deletes the openers. mw_silent_results finalizes what has closed, then returns the
--        counts of closed questions only: no count leaves the database while one is open.
--      - Expected refusals are answers (a word), not errors, so no failed statement (with its
--        parameters) reaches the database's log.
--   2. Awarding: the BOD approve a winner of a voting category only after it closes; never of a
--      computed (otomatis) category.
-- Server only (service role). Needs 202611200003.
-- Absen QR keeps its window in the server (src/lib/server/main-wam/modul/absen.ts): fondasi's checks
-- record QR check-ins freely, and panitia's manual ones are never limited.
-- ROLLBACK (by hand): drop trigger mw_award_approval_check on mw_award_approvals;
--   drop function mw_silent_send(uuid, text, text), mw_silent_open(uuid, text), mw_silent_control(uuid, text, uuid),
--   mw_silent_results(), mw_silent_finalize(uuid), mw_award_approval_check().
begin;

/* 1. Silent Meeting ---------------------------------------------------------------------------- */

-- One feedback, alone in its transaction; at most 2000 per question (the recap reads up to 2000).
create function public.mw_silent_send(p_question uuid, p_topic text, p_body text)
returns text
language plpgsql set search_path = public, pg_temp as $$
declare
  q public.mw_silent_questions%rowtype;
  s public.mw_sessions%rowtype;
  stored integer;
begin
  -- Shared lock: a close (mw_silent_control, mw_silent_finalize) waits for this send, or this send
  -- sees the close; either way the count and the shuffle hold every feedback.
  select * into q from public.mw_silent_questions where id = p_question for share;
  if not found then return 'unknown'; end if;
  select * into s from public.mw_sessions where id = q.session_id;
  if public.mw_silent_state(q, s) <> 'buka' then return 'closed'; end if;
  if coalesce(p_topic, '') <> '' and not (p_topic = any (q.topics)) then return 'topic'; end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 1000 or char_length(coalesce(p_topic, '')) > 40 then return 'invalid'; end if;
  select count(*) into stored from public.mw_silent_feedback where question_id = p_question;
  if stored >= 2000 then return 'full'; end if;
  insert into public.mw_silent_feedback (question_id, topic, body) values (p_question, coalesce(p_topic, ''), p_body);
  return 'ok';
end $$;

-- T01 loaded while open: this person (an HMAC, KONTRAK §8) opened the form. Once per question.
create function public.mw_silent_open(p_question uuid, p_opener text)
returns text
language plpgsql set search_path = public, pg_temp as $$
declare
  q public.mw_silent_questions%rowtype;
  s public.mw_sessions%rowtype;
begin
  if p_opener is null or p_opener !~ '^[0-9a-f]{64}$' then return 'invalid'; end if;
  select * into q from public.mw_silent_questions where id = p_question for share;
  if not found then return 'unknown'; end if;
  select * into s from public.mw_sessions where id = q.session_id;
  if public.mw_silent_state(q, s) <> 'buka' then return 'closed'; end if;
  insert into public.mw_silent_openers (question_id, opener_key) values (p_question, p_opener) on conflict do nothing;
  return 'ok';
end $$;

-- Closed for good: shuffle the feedback (one transaction: one xmin for all, a random physical
-- order, new random ids), keep the counts on the question, forget who opened it. Once; a question
-- that is not closed, or that closed before it ever opened (a session cancelled in advance), is left.
create function public.mw_silent_finalize(p_question uuid)
returns void
language plpgsql set search_path = public, pg_temp as $$
declare
  q public.mw_silent_questions%rowtype;
  s public.mw_sessions%rowtype;
  feedbacks integer;
  openers integer;
begin
  select * into q from public.mw_silent_questions where id = p_question for update;
  if not found or q.finalized_at is not null then return; end if;
  select * into s from public.mw_sessions where id = q.session_id;
  if public.mw_silent_state(q, s) <> 'tutup' then return; end if;
  if q.closed_at is null and q.opened_at is null and now() < s.starts_at then return; end if;
  perform set_config('mw.silent_rewrite', p_question::text, true);
  with gone as (delete from public.mw_silent_feedback where question_id = p_question returning topic, body)
  insert into public.mw_silent_feedback (question_id, topic, body) select p_question, topic, body from gone order by random();
  perform set_config('mw.silent_rewrite', '', true);
  select count(*) into feedbacks from public.mw_silent_feedback where question_id = p_question;
  select count(*) into openers from public.mw_silent_openers where question_id = p_question;
  delete from public.mw_silent_openers where question_id = p_question;
  update public.mw_silent_questions
    set closed_at = coalesce(q.closed_at, least(now(), coalesce(s.ends_at, s.starts_at + interval '30 minutes'))),
        finalized_at = now(), feedback_count = feedbacks, opener_count = openers, updated_at = now()
    where id = p_question;
end $$;

-- Panitia's hand (K02): 'buka' before it opens by itself (once), 'tutup' while it is open (final,
-- then finalized). Answers what happened: opened, closed, or why not.
create function public.mw_silent_control(p_question uuid, p_action text, p_by uuid)
returns text
language plpgsql set search_path = public, pg_temp as $$
declare
  q public.mw_silent_questions%rowtype;
  s public.mw_sessions%rowtype;
  state text;
begin
  select * into q from public.mw_silent_questions where id = p_question for update;
  if not found then return 'unknown'; end if;
  select * into s from public.mw_sessions where id = q.session_id;
  state := public.mw_silent_state(q, s);
  if p_action = 'buka' then
    if state = 'tutup' then return 'final'; end if;
    if state = 'buka' then return 'already_open'; end if;
    if s.status is distinct from 'terbit' then return 'unknown'; end if;
    update public.mw_silent_questions set opened_at = now(), opened_by = p_by, updated_at = now() where id = p_question;
    return 'opened';
  elsif p_action = 'tutup' then
    if state = 'tutup' then return 'final'; end if;
    if state = 'belum' then return 'not_open'; end if;
    update public.mw_silent_questions set closed_at = now(), closed_by = p_by, updated_at = now() where id = p_question;
    perform public.mw_silent_finalize(p_question);
    return 'closed';
  end if;
  return 'invalid';
end $$;

-- The counts, of closed questions only (finalizing any that closed since the last read). Nothing of
-- an open one: not its feedbacks, not its openers.
create function public.mw_silent_results()
returns table (question_id uuid, feedback_count integer, opener_count integer)
language plpgsql set search_path = public, pg_temp as $$
declare
  waiting uuid;
begin
  for waiting in
    select q.id from public.mw_silent_questions q join public.mw_sessions s on s.id = q.session_id
    where q.finalized_at is null and public.mw_silent_state(q, s) = 'tutup'
  loop
    perform public.mw_silent_finalize(waiting);
  end loop;
  return query select q.id, q.feedback_count, q.opener_count from public.mw_silent_questions q where q.finalized_at is not null;
end $$;

/* 2. Awarding --------------------------------------------------------------------------------- */
create function public.mw_award_approval_check() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  category public.mw_award_categories%rowtype;
begin
  select * into category from public.mw_award_categories where id = new.category_id;
  if not found or category.method = 'otomatis' then raise exception 'approval_auto' using errcode = 'P0001'; end if;
  if category.method = 'voting' and (category.closes_at is null or now() < category.closes_at) then
    raise exception 'approval_open' using errcode = 'P0001';
  end if;
  new.approved_at := now();
  return new;
end $$;
create trigger mw_award_approval_check before insert or update on public.mw_award_approvals for each row execute function public.mw_award_approval_check();

revoke all on function public.mw_silent_send(uuid, text, text), public.mw_silent_open(uuid, text), public.mw_silent_finalize(uuid),
  public.mw_silent_control(uuid, text, uuid), public.mw_silent_results(), public.mw_award_approval_check()
  from public, anon, authenticated;
grant execute on function public.mw_silent_send(uuid, text, text), public.mw_silent_open(uuid, text), public.mw_silent_finalize(uuid),
  public.mw_silent_control(uuid, text, uuid), public.mw_silent_results() to service_role;

commit;
