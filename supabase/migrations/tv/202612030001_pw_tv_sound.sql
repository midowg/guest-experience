-- LOCAL REVIEW ONLY. Run by the owner in the Supabase SQL Editor, after 202611120007.
--
-- TV Announcement: video with sound (26 Nov 2026, asked by the owner). A video row can be played
-- with its sound, and a TV can be kept silent whatever the rows say (a TV in a work room).
--
--   * pw_tv_screens.sound: whether this TV may play sound. True for every TV at first, so a video
--     set to play with sound is heard everywhere until a TV is set silent in Admin TV.
--
-- Whether a video plays with sound, and a file's length for the board for old TVs, are kept in
-- pw_tv_items.extra ("sound", "length"; migration 202611100012). No new column for those.
--
-- Until this runs no TV can be kept silent, and Admin TV does not offer that choice.
--
-- ROLLBACK:
--   begin;
--   alter table public.pw_tv_screens drop column if exists sound;
--   commit;

begin;

alter table public.pw_tv_screens add column if not exists sound boolean not null default true;

commit;
