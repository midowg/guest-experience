-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
set local role service_role;
do $$
declare person uuid; key text;
begin
  select employee_id into person from public.pw_accounts limit 1;
  if person is null then raise notice 'SKIP: no account to test with'; return; end if;
  key := 'pra-wam/foto/' || person || '/' || gen_random_uuid() || '.webp';
  update public.pw_accounts set photo_key = key, photo_updated_at = now() where employee_id = person;
  begin update public.pw_accounts set photo_key = 'other/place.png' where employee_id = person; raise exception 'UNEXPECTED: photo outside pra-wam/foto';
  exception when check_violation then null; end;
  insert into public.pw_reset_requests (employee_id, email) values (person, 'orang@werkudara.com');
  begin insert into public.pw_reset_requests (employee_id, email) values (person, 'orang@werkudara.com'); raise exception 'UNEXPECTED: two open requests';
  exception when unique_violation then null; end;
  update public.pw_reset_requests set status = 'selesai', handled_at = now(), handled_by = 'super admin' where employee_id = person;
  insert into public.pw_reset_requests (employee_id, email) values (person, 'orang@werkudara.com');
  insert into public.pw_reset_requests (email) values ('tidak-dikenal@contoh.com');
  begin insert into public.pw_reset_requests (email, status) values ('x@contoh.com', 'aneh'); raise exception 'UNEXPECTED: bad status';
  exception when check_violation then null; end;
  raise notice 'PASS: photo key shape, one open reset request per account';
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.pw_reset_requests; raise exception 'UNEXPECTED: anon read reset requests';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
