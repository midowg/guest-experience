-- Lemari MoM and meeting photos on the office TV (12 Nov 2026). Run after 202611120005.
--
--   * Meeting photos are kept Full HD: at most 1920 px on the long side and at most 1 MB each (was
--     1280 px, 400 KB), so they also look good on the office TV. The app makes them in the browser;
--     until this runs it keeps making them 1280 px, 400 KB.
--   * A TV picture can come from a meeting photo (Admin WAM → Lemari MoM → Tampilkan di TV): the
--     photo is copied to the TV's own storage, and pw_tv_slides.mom_photo_id remembers which photo
--     it was, so the cabinet shows "Di TV". Removing the meeting photo keeps the TV picture.
--   * TV template "Foto meeting" (kind 'foto_meeting'): the latest meeting photos of sent MoMs, in
--     turn, on the TVs it is set for.
--
-- ROLLBACK (only while no photo is larger than 400 KB and no row is 'foto_meeting'):
--   begin;
--   alter table public.pw_tv_items drop constraint pw_tv_items_kind_check;
--   alter table public.pw_tv_items add constraint pw_tv_items_kind_check
--     check (kind in ('kalender_hari', 'kalender_minggu', 'timeline', 'pengumuman', 'sambutan', 'tamu', 'ultah', 'teks', 'video', 'gambar'));
--   drop index if exists public.pw_tv_slides_mom_photo;
--   alter table public.pw_tv_slides drop column if exists mom_photo_id;
--   alter table public.pw_session_minute_photos drop constraint pw_session_minute_photos_size_check;
--   alter table public.pw_session_minute_photos add constraint pw_session_minute_photos_size_check check (size between 1 and 409600);
--   commit;

begin;

alter table public.pw_session_minute_photos drop constraint if exists pw_session_minute_photos_size_check;
alter table public.pw_session_minute_photos add constraint pw_session_minute_photos_size_check check (size between 1 and 1048576);

alter table public.pw_tv_slides add column if not exists mom_photo_id uuid references public.pw_session_minute_photos (id) on delete set null;
create index if not exists pw_tv_slides_mom_photo on public.pw_tv_slides (mom_photo_id) where mom_photo_id is not null;

alter table public.pw_tv_items drop constraint pw_tv_items_kind_check;
alter table public.pw_tv_items add constraint pw_tv_items_kind_check
  check (kind in ('kalender_hari', 'kalender_minggu', 'timeline', 'pengumuman', 'sambutan', 'tamu', 'ultah', 'foto_meeting', 'teks', 'video', 'gambar'));

commit;
