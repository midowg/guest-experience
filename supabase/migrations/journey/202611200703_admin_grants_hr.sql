-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- HR Werkudara's admin in Journey Admin (decided 20 Nov 2026): /admin/hr (Ringkasan, Perlu dicek,
-- Absen harian, Wajah terdaftar, Titik kantor), given per person like every other app in
-- Super admin → Akses admin. admin_grants.apps gains 'hr'. Until this runs only the super admin
-- opens /admin/hr, and saving the HR box answers "menunggu migrasi".
--
-- ROLLBACK (by hand): update public.admin_grants set apps = array_remove(apps, 'hr');
--   then restore the check of 202611200603 without 'hr'.
begin;

alter table public.admin_grants drop constraint if exists admin_grants_apps_check;
alter table public.admin_grants add constraint admin_grants_apps_check
  check (apps <@ array['acara', 'friday_sharing', 'your_visit', 'wam', 'kuesioner', 'tv', 'wellbeing', 'wam_acara', 'hr']::text[]);

commit;
