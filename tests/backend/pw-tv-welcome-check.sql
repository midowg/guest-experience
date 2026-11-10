-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
set local role service_role;
do $$
declare welcome uuid;
begin
  insert into public.pw_tv_items (kind) values ('sambutan') returning id into welcome;
  insert into public.pw_tv_items (kind, title, body) values ('tamu', 'Contoh Satu', 'Selamat datang');
  begin insert into public.pw_tv_items (kind) values ('video'); raise exception 'UNEXPECTED: an unknown kind';
  exception when check_violation then null; end;

  insert into public.pw_tv_settings (id) values (true) on conflict (id) do nothing;
  update public.pw_tv_settings set now_item_id = welcome, now_until = now() + interval '15 minutes' where id;
  if (select now_screen_ids from public.pw_tv_settings where id) <> '{}' then raise exception 'a takeover is for every TV unless TVs are named'; end if;

  -- Removing the row that takes the TVs over stops the takeover.
  delete from public.pw_tv_items where id = welcome;
  if (select now_item_id from public.pw_tv_settings where id) is not null then raise exception 'a takeover outlived its row'; end if;
  raise notice 'PASS: the two welcome kinds, a takeover for every TV by default, gone with its row';
end $$;
rollback;
