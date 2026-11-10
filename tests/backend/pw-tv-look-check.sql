-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
set local role service_role;
do $$
begin
  if (select mode from public.pw_tv_settings) <> 'dark' then raise exception 'the board does not start dark'; end if;
  if (select qr_show from public.pw_tv_settings) then raise exception 'the QR code is on before anyone asked'; end if;
  update public.pw_tv_settings set mode = 'light', qr_show = true, qr_url = 'https://contoh.test/book', qr_label = 'Book ruang', qr_position = 'kiri-atas';
  begin update public.pw_tv_settings set mode = 'biru'; raise exception 'UNEXPECTED: an unknown mode';
  exception when check_violation then null; end;
  begin update public.pw_tv_settings set qr_url = 'javascript:alert(1)'; raise exception 'UNEXPECTED: a QR code that is not a web address';
  exception when check_violation then null; end;
  begin update public.pw_tv_settings set qr_position = 'tengah'; raise exception 'UNEXPECTED: an unknown corner';
  exception when check_violation then null; end;
  update public.pw_tv_settings set qr_url = '';
  raise notice 'PASS: dark or light, a QR code to a web address or the TV''s own, in one of four corners';
end $$;
reset role;
rollback;
