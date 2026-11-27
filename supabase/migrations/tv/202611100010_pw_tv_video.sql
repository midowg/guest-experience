-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- TV Announcement (11 Nov 2026): a YouTube video as a kind of playlist row.
--   'video': title = the admin's name for it, body = the video's id (11 characters). A TV plays it
--            in YouTube's own player, muted, to its end, then moves on; `seconds` is not used.
-- Needs 202611100008 (this replaces its list of kinds). Before this one a video cannot be added.
-- ROLLBACK (by hand): delete from public.pw_tv_items where kind = 'video';
--   alter table public.pw_tv_items drop constraint pw_tv_items_kind_check;
--   alter table public.pw_tv_items add constraint pw_tv_items_kind_check
--     check (kind in ('kalender_hari', 'kalender_minggu', 'timeline', 'pengumuman', 'sambutan', 'tamu', 'teks', 'gambar'));
begin;

alter table public.pw_tv_items drop constraint pw_tv_items_kind_check;
alter table public.pw_tv_items add constraint pw_tv_items_kind_check
  check (kind in ('kalender_hari', 'kalender_minggu', 'timeline', 'pengumuman', 'sambutan', 'tamu', 'teks', 'video', 'gambar'));

commit;
