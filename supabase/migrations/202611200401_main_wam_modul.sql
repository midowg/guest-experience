-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Main WAM, agen D (modul acara; docs/main-wam/KONTRAK.md §6): the rules of two modules that must
-- hold in the database, by the server's clock, not only in the app (RISET §6, §7):
--   1. Silent Meeting: one send = one anonymous feedback + the sender's count, in one statement,
--      with a cap per person (mw_silent_send). The feedback row still stores no person and no time;
--      the count is keyed by an HMAC of the person (mw_silent_participation, fondasi 0003).
--   2. Awarding: the BOD approve a winner of a voting category only after it closes; never of a
--      computed (otomatis) category.
-- Server only (service role). Needs 202611200003.
-- Absen QR keeps its window in the server (src/lib/server/main-wam/modul/absen.ts): fondasi's checks
-- record QR check-ins freely, and panitia's manual ones are never limited.
-- ROLLBACK (by hand): drop trigger mw_award_approval_check on mw_award_approvals;
--   drop function mw_silent_send(uuid, text, text, text, integer), mw_award_approval_check().
begin;

/* 1. Silent Meeting ---------------------------------------------------------------------------- */
create function public.mw_silent_send(p_question uuid, p_participant text, p_topic text, p_body text, p_max integer)
returns integer
language plpgsql set search_path = public, pg_temp as $$
declare
  q public.mw_silent_questions%rowtype;
  sent_now integer;
begin
  if p_max is null or p_max not between 1 and 50 then raise exception 'silent_invalid' using errcode = 'P0001'; end if;
  select * into q from public.mw_silent_questions where id = p_question;
  if not found then raise exception 'silent_unknown' using errcode = 'P0001'; end if;
  if coalesce(p_topic, '') <> '' and not (p_topic = any (q.topics)) then raise exception 'silent_topic' using errcode = 'P0001'; end if;
  -- The person's count, locked, so two sends at the same moment cannot pass the cap.
  select sent into sent_now from public.mw_silent_participation where question_id = p_question and participant_key = p_participant for update;
  if coalesce(sent_now, 0) >= p_max then raise exception 'silent_limit' using errcode = 'P0001'; end if;
  -- mw_silent_feedback_open (fondasi) refuses it while the Silent Meeting is not open.
  insert into public.mw_silent_feedback (question_id, topic, body) values (p_question, coalesce(p_topic, ''), p_body);
  insert into public.mw_silent_participation (question_id, participant_key, sent) values (p_question, p_participant, 1)
    on conflict (question_id, participant_key) do update set sent = public.mw_silent_participation.sent + 1
    returning sent into sent_now;
  return sent_now;
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

revoke all on function public.mw_silent_send(uuid, text, text, text, integer), public.mw_award_approval_check()
  from public, anon, authenticated;
grant execute on function public.mw_silent_send(uuid, text, text, text, integer) to service_role;

commit;
