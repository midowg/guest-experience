-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- WAM questionnaire (11 Nov 2026, owner's decision): question 3 "Posisimu sekarang?" offers Data
-- karyawan's posts, so the app can fill it in from the person's jobs: Staf, Lead, HOD, GM (was
-- Staf / Supervisor / lead / Manajer ke atas). Answers already given move to the nearest post:
-- "Supervisor / lead" becomes Lead, "Manajer ke atas" becomes HOD (the person can change it).
-- Question 31 (only for leads and up) keeps showing for everyone but Staf. Changed only while the
-- options are still the original ones, so a change HR made in Admin WAM stands. Needs 202611040011.
begin;

do $$
declare
  q uuid;
begin
  select question.id into q from public.cq_questions question
    join public.cq_forms form on form.id = question.form_id
    where question.key = '3' and question.options = '["Staf", "Supervisor / lead", "Manajer ke atas"]'::jsonb
    order by form.created_at limit 1;
  if q is null then return; end if;

  update public.cq_questions set options = '["Staf", "Lead", "HOD", "GM"]'::jsonb where id = q;
  update public.cq_answers set value = '"Lead"'::jsonb, updated_at = now() where question_id = q and value = '"Supervisor / lead"'::jsonb;
  update public.cq_answers set value = '"HOD"'::jsonb, updated_at = now() where question_id = q and value = '"Manajer ke atas"'::jsonb;
end $$;

commit;
