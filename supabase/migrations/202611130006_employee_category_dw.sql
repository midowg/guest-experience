-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611130005.
--
-- Status kerja (decided 13 Nov 2026): "GA" becomes "DW" (Daily Worker). The work statuses are now
-- Karyawan, DW and Intern. Everyone marked GA so far (one person) becomes DW, as the owner chose.
-- Only employees.category changes: its allowed values, and the GA rows to DW.
--
-- ROLLBACK (by hand):
--   alter table public.employees drop constraint if exists employees_category_check;
--   update public.employees set category = 'ga' where category = 'dw';
--   alter table public.employees add constraint employees_category_check check (category in ('karyawan', 'ga', 'intern'));
begin;

alter table public.employees drop constraint if exists employees_category_check;
update public.employees set category = 'dw' where category = 'ga';
alter table public.employees add constraint employees_category_check check (category in ('karyawan', 'dw', 'intern'));

commit;
