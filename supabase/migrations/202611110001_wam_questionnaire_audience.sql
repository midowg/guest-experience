-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- WAM questionnaire: who it is for (11 Nov 2026). "semua" (the default, as before) is every active
-- employee; "pilih" is only the employees in audience_ids, chosen in Admin WAM → Kuesioner →
-- Pengaturan (per person, or a whole department at once). People outside it do not see the
-- questionnaire, its card on Beranda or Kartu rekan, get no reminder, and are not counted in the
-- progress. Answers already given stay. Needs 202611040011 (cq_forms). Server only.
begin;

alter table public.cq_forms
  add column if not exists audience text not null default 'semua' check (audience in ('semua', 'pilih')),
  add column if not exists audience_ids uuid[] not null default '{}' check (cardinality(audience_ids) <= 2000);

commit;
