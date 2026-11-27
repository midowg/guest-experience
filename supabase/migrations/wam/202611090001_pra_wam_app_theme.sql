-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611040009.
--
-- Tema aplikasi (decided 9 Nov 2026): the WAM app has two themes, each with a light and a dark
-- mode, and an admin picks the one everyone sees in Admin WAM → Tema aplikasi:
--   * 'dream'     Dream Out Loud, the Pra WAM 2026 theme (night sky, lavender, gold). Default.
--   * 'werkudara' the company blue, the look WAM had before.
-- Light or dark stays each person's own choice (Pengaturan → Tampilan, a cookie; dark by default).
-- Before this runs, the app shows Dream Out Loud and the admin page says it is waiting.
--
-- ROLLBACK (by hand): alter table public.pw_app_settings drop column theme;
begin;

alter table public.pw_app_settings
  add column theme text not null default 'dream' check (theme in ('dream', 'werkudara'));

commit;
