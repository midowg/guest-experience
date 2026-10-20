-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;

set local role service_role;
do $$ begin
  if (select disabled_modules from public.admin_settings) <> '{}' then raise exception 'should start with nothing disabled'; end if;
  update public.admin_settings set disabled_modules = array['team','review'], updated_at = clock_timestamp();
  if (select disabled_modules from public.admin_settings) <> array['team','review'] then raise exception 'update failed'; end if;
  begin update public.admin_settings set disabled_modules = array['tiket']; raise exception 'UNEXPECTED: unknown module';
  exception when check_violation then null; end;
  begin insert into public.admin_settings (id) values (false); raise exception 'UNEXPECTED: second row';
  exception when insufficient_privilege or check_violation then null; end;
  raise notice 'PASS: single row, known modules only';
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.admin_settings; raise exception 'UNEXPECTED: anon read';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
