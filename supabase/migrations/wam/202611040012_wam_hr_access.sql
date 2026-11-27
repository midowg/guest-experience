-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- WAM questionnaire: Data HR opens with each HR person's own WAM account (email and password),
-- not a shared password, so the log shows who opened what. Only the people on the form's HR
-- access list may open it; the super admin keeps the list. Needs 202611040011.
begin;

alter table public.cq_forms
  add column hr_access uuid[] not null default '{}' check (cardinality(hr_access) <= 20);

alter table public.cq_hr_access_log
  add column actor_employee_id uuid references public.employees (id) on delete set null,
  drop constraint cq_hr_access_log_action_check,
  add constraint cq_hr_access_log_action_check check (action in ('buka', 'gagal', 'kunci', 'lihat', 'ekspor', 'ganti_password', 'ubah_akses'));

create index cq_hr_access_log_actor on public.cq_hr_access_log (actor_employee_id, created_at desc);

commit;
