-- LOCAL REVIEW ONLY. Run by the owner in the Supabase SQL Editor, after 202611120006.
--
-- TV Announcement in two rows (12 Nov 2026, asked by management): a TV can be laid out as the
-- playlist on top (65 % of the height) and a row of photos below (35 %) that runs from right to
-- left without stopping. Which TV is laid out so is picked per TV in Admin TV.
--
--   * pw_tv_screens.layout: 'penuh' (the whole screen, as before) or 'dua_baris'.
--
-- The photos of the row are the pictures put on the TV from Arsip MoM's gallery
-- (pw_tv_slides.mom_photo_id, migration 202611120006); a picture's row can say otherwise in
-- pw_tv_items.extra ("strip", migration 202611100012). No new column for that.
--
-- Until this runs every TV stays full screen, and Admin TV does not offer the choice.
--
-- ROLLBACK:
--   begin;
--   alter table public.pw_tv_screens drop column if exists layout;
--   commit;

begin;

alter table public.pw_tv_screens add column if not exists layout text not null default 'penuh';
alter table public.pw_tv_screens drop constraint if exists pw_tv_screens_layout_check;
alter table public.pw_tv_screens add constraint pw_tv_screens_layout_check check (layout in ('penuh', 'dua_baris'));

commit;
