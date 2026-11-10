-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611090003.
--
-- Pekerjaan karyawan, from the org chart of 9-10 Nov 2026 (Bagan Organisasi Werkudara):
--   * GM: a General Manager heads a department like a HOD (Sales & Marketing, Bali Office), and a
--     HOD may sit under them (Commercial's HOD under the GM of Sales & Marketing). For everything
--     the app reads, a GM counts as HOD (pw_leads keeps a 'departemen' row for them).
--   * unit: the team inside a department (Business Solutions, Commercial, Corporate Marketing
--     Communication); empty when the department has none. Struktur groups people by it.
--   * reports_to: a HOD may now be under someone (their GM); a GM and a Lead still are not
--     (a Lead is under the head of their department by rule).
-- Nothing is filled in: GM and teams are set per person in Data karyawan → Ubah karyawan.
-- Before this runs, the app saves a GM as HOD, leaves the team out and keeps a HOD under nobody,
-- and says these wait for this migration; everything else keeps working.
--
-- ROLLBACK (by hand):
--   update public.employee_jobs set post = 'hod' where post = 'gm';
--   update public.employee_jobs set reports_to = null where post <> 'staf';
--   alter table public.employee_jobs drop constraint if exists employee_jobs_reports_to_post;
--   alter table public.employee_jobs add constraint employee_jobs_reports_to_staf check (post = 'staf' or reports_to is null);
--   alter table public.employee_jobs drop constraint if exists employee_jobs_post_check;
--   alter table public.employee_jobs add constraint employee_jobs_post_check check (post in ('hod', 'lead', 'staf'));
--   alter table public.employee_jobs drop column if exists unit;
begin;

alter table public.employee_jobs drop constraint if exists employee_jobs_post_check;
alter table public.employee_jobs add constraint employee_jobs_post_check check (post in ('gm', 'hod', 'lead', 'staf'));

alter table public.employee_jobs add column if not exists unit text not null default '';
alter table public.employee_jobs drop constraint if exists employee_jobs_unit_length;
alter table public.employee_jobs add constraint employee_jobs_unit_length check (char_length(unit) <= 120);

alter table public.employee_jobs drop constraint if exists employee_jobs_reports_to_staf;
alter table public.employee_jobs drop constraint if exists employee_jobs_reports_to_post;
alter table public.employee_jobs add constraint employee_jobs_reports_to_post check (post in ('staf', 'hod') or reports_to is null);

commit;
