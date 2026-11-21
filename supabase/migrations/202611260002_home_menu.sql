-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611260001.
--
-- The front page's app menu (26 Nov 2026), set by the super admin in Super admin → Halaman utama:
-- which apps show, their order, name, line, description and colour. Null means the default menu.
-- Only the five fixed apps (wam, wlm, booking, signage, admin) are read back; their addresses stay
-- in the code, so the menu cannot point anywhere else.
--
-- ROLLBACK (by hand): alter table public.admin_settings drop column home_menu;
begin;

alter table public.admin_settings
  add column if not exists home_menu jsonb check (home_menu is null or (jsonb_typeof(home_menu) = 'array' and jsonb_array_length(home_menu) <= 10));

commit;
