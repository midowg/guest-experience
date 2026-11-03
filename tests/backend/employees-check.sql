-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;

set local role service_role;
do $$ declare first uuid; begin
  insert into public.employees (full_name, nickname, department, position, office) values ('Contoh  Satu', 'Satu', 'Sales & Marketing', 'Business Solutions Manager', 'WNS') returning id into first;
  if (select name_key from public.employees where id = first) <> 'CONTOH SATU' then raise exception 'name_key should be upper case with single spaces'; end if;
  if (select category from public.employees where id = first) <> 'karyawan' then raise exception 'category should default to karyawan'; end if;
  begin insert into public.employees (full_name) values ('contoh satu'); raise exception 'UNEXPECTED: the same name twice';
  exception when unique_violation then null; end;
  begin insert into public.employees (full_name, category) values ('Contoh Dua', 'direksi'); raise exception 'UNEXPECTED: unknown category';
  exception when check_violation then null; end;
  begin insert into public.employees (full_name) values (' '); raise exception 'UNEXPECTED: empty name';
  exception when check_violation then null; end;
  raise notice 'PASS: one row per name, known categories only, karyawan by default';
end $$;
reset role;

-- Personal data: nobody but the service role reads it.
set local role anon;
do $$ begin
  perform 1 from public.employees limit 1; raise exception 'UNEXPECTED: anon can read employees';
exception when insufficient_privilege then raise notice 'PASS: anon cannot read employees'; end $$;
reset role;
set local role authenticated;
do $$ begin
  perform 1 from public.employees limit 1; raise exception 'UNEXPECTED: authenticated can read employees';
exception when insufficient_privilege then raise notice 'PASS: authenticated cannot read employees'; end $$;
reset role;

rollback;
