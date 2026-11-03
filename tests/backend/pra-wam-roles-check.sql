-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
set local role service_role;
do $$
declare person uuid;
begin
  insert into public.employees (full_name, department, nip) values ('Contoh Peran', 'BAS', '2026.001') returning id into person;
  begin insert into public.employees (full_name, nip) values ('Contoh Kembar', '2026.001'); raise exception 'UNEXPECTED: duplicate NIP';
  exception when unique_violation then null; end;
  insert into public.employees (full_name) values ('Tanpa NIP Satu'), ('Tanpa NIP Dua');
  begin insert into public.employees (full_name, nip) values ('NIP Aneh', 'a b'); raise exception 'UNEXPECTED: NIP with a space';
  exception when check_violation then null; end;

  insert into public.pw_roles (employee_id, role) values (person, 'panitia'), (person, 'bod');
  begin insert into public.pw_roles (employee_id, role) values (person, 'raja'); raise exception 'UNEXPECTED: unknown role';
  exception when check_violation then null; end;
  begin insert into public.pw_roles (employee_id, role) values (person, 'panitia'); raise exception 'UNEXPECTED: role twice';
  exception when unique_violation then null; end;
  raise notice 'PASS: NIP optional and unique, roles known and once each';
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.pw_roles; raise exception 'UNEXPECTED: anon read roles';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: roles are server only';
end $$;
reset role;

rollback;
