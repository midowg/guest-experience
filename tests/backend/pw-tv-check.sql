-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
set local role service_role;
do $$
declare screen uuid;
begin
  insert into public.pw_tv_screens (name, key_hash, key_hint) values ('Lobi', repeat('a', 64), 'abcd') returning id into screen;
  begin insert into public.pw_tv_screens (name, key_hash) values ('Pantry', repeat('a', 64)); raise exception 'UNEXPECTED: one key for two TVs';
  exception when unique_violation then null; end;
  begin insert into public.pw_tv_screens (name, key_hash) values ('Pantry', 'bukan-hash'); raise exception 'UNEXPECTED: a key kept as it is';
  exception when check_violation then null; end;
  update public.pw_tv_screens set last_seen_at = now(), last_width = 1920, last_height = 1080 where id = screen;

  insert into public.pw_tv_slides (image_key, title) values ('pra-wam/tv/contoh.webp', 'Contoh');
  begin insert into public.pw_tv_slides (image_key) values ('lain/contoh.webp'); raise exception 'UNEXPECTED: a picture outside pra-wam/tv/';
  exception when check_violation then null; end;
  begin insert into public.pw_tv_slides (image_key, seconds) values ('pra-wam/tv/dua.webp', 1); raise exception 'UNEXPECTED: a one-second slide';
  exception when check_violation then null; end;

  if (select count(*) from public.pw_tv_settings) <> 1 then raise exception 'settings row missing'; end if;
  begin insert into public.pw_tv_settings (id) values (true); raise exception 'UNEXPECTED: two settings rows';
  exception when unique_violation then null; end;
  begin update public.pw_tv_settings set day_seconds = 1; raise exception 'UNEXPECTED: a one-second day calendar';
  exception when check_violation then null; end;
  begin update public.pw_tv_settings set week_seconds = 500; raise exception 'UNEXPECTED: an eight-minute week calendar';
  exception when check_violation then null; end;
  update public.pw_tv_settings set show_week = false, day_seconds = 30;
  raise notice 'PASS: one key per TV kept as a hash, pictures under pra-wam/tv/, one settings row';
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.pw_tv_screens; raise exception 'UNEXPECTED: anon read the TVs';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.pw_tv_slides; raise exception 'UNEXPECTED: anon read the slides';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: TV tables are server only';
end $$;
reset role;

rollback;
