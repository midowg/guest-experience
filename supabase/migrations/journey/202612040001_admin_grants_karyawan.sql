-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Data karyawan as its own admin app (decided 27 Nov 2026): /admin/karyawan (Daftar karyawan,
-- Struktur, Impor Excel), moved out of Super admin and given per person in Super admin → Akses
-- admin like every other app. admin_grants.apps gains 'karyawan'. Until this runs only the super
-- admin opens /admin/karyawan, and saving the Data karyawan box answers "menunggu migrasi".
--
-- ROLLBACK (by hand): update public.admin_grants set apps = array_remove(apps, 'karyawan');
--   then restore the check of 202612010001 without 'karyawan'.
begin;

alter table public.admin_grants drop constraint if exists admin_grants_apps_check;
alter table public.admin_grants add constraint admin_grants_apps_check
  check (apps <@ array['acara', 'friday_sharing', 'your_visit', 'wam', 'kuesioner', 'tv', 'wellbeing', 'wam_acara', 'hr', 'coffee', 'karyawan']::text[]);

commit;
