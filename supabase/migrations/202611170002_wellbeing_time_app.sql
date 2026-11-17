-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611160050_wellbeing.sql.
--
-- Wellbeing (17 Nov 2026), two additions:
--
-- 1. The time of an activity, optional. Catat has a Jam field next to Tanggal, and a proof photo read
--    on the phone fills it when the screen shows one ("17 Nov 2026 at 6:05 AM", "16/11/2026 07.10").
--    Wall-clock time in WIB without a date (the date stays happened_on).
-- 2. Controls for the employee app, set in Admin Wellbeing → Pengaturan → Aplikasi karyawan: an
--    announcement on Beranda, this month's prize, reading proof photos on/off, and pausing Catat with a
--    message. One jsonb value on the settings row; the app fills in defaults for anything missing.
--
-- The app keeps working before this runs: it reads and saves without the time, and the employee app
-- runs with the default controls (no announcement, photo reading on, Catat open).
--
-- ROLLBACK (by hand):
--   alter table public.wb_activities drop column happened_time;
--   alter table public.wb_settings drop column app;
begin;

alter table public.wb_activities add column if not exists happened_time time;
comment on column public.wb_activities.happened_time is 'Jam kegiatan (WIB), opsional.';

alter table public.wb_settings add column if not exists app jsonb not null default '{}'::jsonb;
comment on column public.wb_settings.app is 'Kontrol aplikasi karyawan dari Admin Wellbeing: pengumuman, hadiah, baca foto, jeda pencatatan.';

commit;
