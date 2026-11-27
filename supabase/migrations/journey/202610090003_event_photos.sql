-- Penyimpanan foto acara. Dibaca publik karena foto memang ditampilkan di undangan;
-- yang ditulis hanya admin terdaftar.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-photos', 'event-photos', true, 8388608,
        array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Baca: siapa pun, karena URL-nya memang disematkan di halaman undangan publik.
drop policy if exists event_photos_read on storage.objects;
create policy event_photos_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'event-photos');

-- Tulis, ubah, hapus: hanya admin acara. Peran dari metadata akun tidak dipakai.
drop policy if exists event_photos_insert on storage.objects;
create policy event_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-photos' and public.is_event_admin());

drop policy if exists event_photos_update on storage.objects;
create policy event_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'event-photos' and public.is_event_admin())
  with check (bucket_id = 'event-photos' and public.is_event_admin());

drop policy if exists event_photos_delete on storage.objects;
create policy event_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-photos' and public.is_event_admin());

commit;
