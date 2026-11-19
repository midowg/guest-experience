-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor.
--
-- The front page's look (26 Nov 2026), picked by the super admin in Super admin → Halaman utama:
-- 'kartu' (fan of 3D cards, the look until now) or 'lampu' (the cursor as a lamp over the joglo).
-- Only adds a column with a default, so nothing changes until the super admin picks another look.
--
-- ROLLBACK (by hand): alter table public.admin_settings drop column home_style;
begin;

alter table public.admin_settings
  add column if not exists home_style text not null default 'kartu' check (home_style in ('kartu', 'lampu'));

commit;
