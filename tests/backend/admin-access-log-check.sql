-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;

set local role service_role;
insert into public.admin_access_log(kind, ip, country, city, user_agent, device_id, new_device)
  values ('login_success', '203.0.113.7', 'ID', 'Jakarta', 'Mozilla/5.0', '0b6f3c1e-8a1d-4c4a-9f00-0d8e2b7a1c11', true);
insert into public.admin_access_log(kind) values ('login_failure'), ('logout');
do $$ begin
  if (select count(*) from public.admin_access_log) <> 3 then raise exception 'service_role should read 3 rows'; end if;
  if (select count(*) from public.admin_access_log where at is null or new_device is null) <> 0 then raise exception 'defaults missing'; end if;
  begin insert into public.admin_access_log(kind) values ('reset'); raise exception 'UNEXPECTED: invalid kind accepted';
  exception when check_violation then null; end;
  begin update public.admin_access_log set ip = null; raise exception 'UNEXPECTED: update allowed';
  exception when insufficient_privilege then null; end;
  begin delete from public.admin_access_log; raise exception 'UNEXPECTED: delete allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.admin_access_log; raise exception 'UNEXPECTED: anon read';
  exception when insufficient_privilege then null; end;
  begin insert into public.admin_access_log(kind) values ('logout'); raise exception 'UNEXPECTED: anon insert';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
do $$ begin
  begin perform 1 from public.admin_access_log; raise exception 'UNEXPECTED: authenticated read';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
