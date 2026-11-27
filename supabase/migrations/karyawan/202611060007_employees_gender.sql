-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611060006.
--
-- Jenis kelamin (decided 6 Nov 2026): only for the sapaan in the WAM app. A BOD, HOD or lead BU is
-- shown to colleagues as "Pak <panggilan>" (L) or "Bu <panggilan>" (P); empty means no sapaan.
-- Filled by the super admin in Data karyawan (Ubah karyawan); not part of HR's import.
--
-- ROLLBACK (by hand): alter table public.employees drop column gender;
begin;

alter table public.employees add column if not exists gender text not null default '';
alter table public.employees drop constraint if exists employees_gender_known;
alter table public.employees add constraint employees_gender_known check (gender in ('', 'L', 'P'));

commit;
