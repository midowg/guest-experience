-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- HR Werkudara (/hr, decided 20 Nov 2026): the employees' own HR app, apart from WAM (absensi first;
-- cuti and lembur DW to come). pw_roles gains 'hr', Admin HR: who checks absensi, faces and office
-- points in /hr/kelola. Given in Admin WAM → Akun dan peran or in /hr/kelola/akses.
-- The tables of 202611200701 (pw_offices, pw_face_profiles, pw_daily_attendance) keep their names.
--
-- ROLLBACK (by hand): delete from public.pw_roles where role = 'hr'; then restore the check without 'hr'.
begin;

alter table public.pw_roles drop constraint if exists pw_roles_role_check;
alter table public.pw_roles add constraint pw_roles_role_check check (role in ('panitia', 'bod', 'admin', 'ga', 'hr'));

commit;
