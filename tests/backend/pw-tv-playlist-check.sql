-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
set local role service_role;
do $$
declare picture uuid; screen uuid;
begin
  -- The migration made the two calendars from the settings.
  if (select count(*) from public.pw_tv_items where kind in ('kalender_hari', 'kalender_minggu')) <> 2 then raise exception 'the calendars were not carried over'; end if;

  insert into public.pw_tv_slides (image_key, title) values ('pra-wam/tv/uji.webp', 'Uji') returning id into picture;
  insert into public.pw_tv_items (kind, slide_id, title) values ('gambar', picture, 'Uji');
  begin insert into public.pw_tv_items (kind, slide_id) values ('gambar', picture); raise exception 'UNEXPECTED: one picture twice in the playlist';
  exception when unique_violation then null; end;
  begin insert into public.pw_tv_items (kind) values ('gambar'); raise exception 'UNEXPECTED: a picture row without a picture';
  exception when check_violation then null; end;
  begin insert into public.pw_tv_items (kind, slide_id) values ('teks', picture); raise exception 'UNEXPECTED: a text row with a picture';
  exception when check_violation then null; end;
  begin insert into public.pw_tv_items (kind) values ('video'); raise exception 'UNEXPECTED: an unknown kind';
  exception when check_violation then null; end;
  begin insert into public.pw_tv_items (kind, show_from, show_until) values ('teks', '2026-12-10', '2026-12-01'); raise exception 'UNEXPECTED: shown until a day before it starts';
  exception when check_violation then null; end;

  insert into public.pw_tv_screens (name, slug) values ('Lobi uji', 'lobi-uji') returning id into screen;
  insert into public.pw_tv_items (kind, title, body, show_from, show_until, time_from, time_until, screen_ids)
  values ('teks', 'Selamat datang', 'Isi', '2026-12-01', '2026-12-10', '08:00', '17:00', array[screen]);
  update public.pw_tv_screens set reload_at = now(), last_item = 'Kalender hari ini' where id = screen;

  delete from public.pw_tv_slides where id = picture;
  if exists (select 1 from public.pw_tv_items where slide_id = picture) then raise exception 'a picture''s row outlived its picture'; end if;
  raise notice 'PASS: one row per thing played, a picture once, dated and timed rows, rows per TV, gone with their picture';
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.pw_tv_items; raise exception 'UNEXPECTED: anon read the playlist';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: the playlist is server only';
end $$;
reset role;
rollback;
