-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611060005.
--
-- Atasan langsung (decided 6 Nov 2026): who each person reports to, for the Struktur tab of Data
-- karyawan. Empty means the usual place: under the HOD of their department (a HOD under the Chief
-- of Staff, the Chief of Staff under the BOD). Set it where a team has its own branch, such as the
-- people under a Business Solutions Manager in Sales & Marketing.
--
-- ROLLBACK (by hand): alter table public.employees drop column reports_to;
begin;

alter table public.employees add column if not exists reports_to uuid references public.employees (id) on delete set null;
alter table public.employees drop constraint if exists employees_reports_to_self;
alter table public.employees add constraint employees_reports_to_self check (reports_to is null or reports_to <> id);

commit;
