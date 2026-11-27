-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- WAM questionnaire: each answer keeps the read level its question had when it was given, so
-- widening a question's level later (HR only -> Panitia, say) never opens answers people gave under
-- the stricter label. The app reads the stricter of the answer's level and the question's level.
-- Then, by the owner's decision (5 Nov 2026), food needs (14) and allergies and phobias (14b) move
-- from `hr` to `fasil` ("Panitia dan HR"), so the panitia can serve the right plate by name; the
-- answers already given stay `hr`. Needs 202611040011. Server only.
begin;

alter table public.cq_answers add column read_level text
  check (read_level is null or read_level in ('rekan', 'fasil', 'hr', 'hronly', 'pilih', 'anon'));

-- Answers given so far: the level their question has now.
update public.cq_answers answer set read_level = question.visibility
  from public.cq_questions question where question.id = answer.question_id;

-- From now on the database stamps every new or changed answer itself; the same value saved again
-- keeps its old level.
create function public.cq_answers_read_level() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.value is distinct from old.value then
    select visibility into new.read_level from public.cq_questions where id = new.question_id;
  else
    new.read_level := old.read_level;
  end if;
  return new;
end $$;
create trigger cq_answers_read_level before insert or update on public.cq_answers
  for each row execute function public.cq_answers_read_level();
revoke all on function public.cq_answers_read_level() from public, anon, authenticated;

-- 14 and 14b to "Panitia dan HR"; only while they are still HR, so a later change by HR stands.
update public.cq_questions set visibility = 'fasil'
  where key in ('14', '14b') and visibility = 'hr'
    and form_id in (select id from public.cq_forms);

commit;
