-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- TV Announcement, stage 1 (10 Nov 2026): welcoming guests, and "Tayangkan sekarang".
-- Two new kinds of playlist row:
--   'sambutan': a template fed by Journey's Kunjungan Kantor: every published visit that is on
--               today gets a slide (its name, greeting, cover photo, hours and place); one row at most.
--   'tamu':     a welcome typed in Admin TV, for a guest without a visit page (title = the guest's
--               name, body = the greeting).
-- And one row may take the TVs over for a while (pw_tv_settings.now_*): the TVs it is for play that
-- row alone until now_until (null = until stopped), then go back to the playlist by themselves.
-- Needs 202611100007. Before this one the playlist works as it did; the new kinds cannot be added.
-- ROLLBACK (by hand): delete from public.pw_tv_items where kind in ('sambutan', 'tamu');
--   alter table public.pw_tv_items drop constraint pw_tv_items_kind_check;
--   alter table public.pw_tv_items add constraint pw_tv_items_kind_check
--     check (kind in ('kalender_hari', 'kalender_minggu', 'timeline', 'pengumuman', 'teks', 'gambar'));
--   alter table public.pw_tv_settings drop column now_item_id, drop column now_until, drop column now_screen_ids;
begin;

alter table public.pw_tv_items drop constraint pw_tv_items_kind_check;
alter table public.pw_tv_items add constraint pw_tv_items_kind_check
  check (kind in ('kalender_hari', 'kalender_minggu', 'timeline', 'pengumuman', 'sambutan', 'tamu', 'teks', 'gambar'));

alter table public.pw_tv_settings
  -- The row that takes the TVs over; it stops by itself when the row is removed.
  add column now_item_id uuid references public.pw_tv_items (id) on delete set null,
  -- Until when; null with a row set = until an admin stops it.
  add column now_until timestamptz,
  -- The TVs it takes over; empty = every TV, and the one address for all (/tv).
  add column now_screen_ids uuid[] not null default '{}';

commit;
