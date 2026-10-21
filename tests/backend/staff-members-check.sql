-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
set local role service_role;
do $$
declare person uuid;
begin
  insert into public.staff_members (name, role, phone) values ('Raka Pratama', 'Hospitality', '081234567890') returning id into person;
  if (select photo->>'url' from public.staff_members where id = person) <> '' or not (select active from public.staff_members where id = person) then raise exception 'defaults wrong'; end if;
  begin insert into public.staff_members (name) values (' A '); raise exception 'UNEXPECTED: one-letter name';
  exception when check_violation then null; end;
  begin insert into public.staff_members (name, photo) values ('Sari', '"x"'::jsonb); raise exception 'UNEXPECTED: photo not an object';
  exception when check_violation then null; end;
  update public.staff_members set active = false where id = person;
  raise notice 'PASS: staff defaults, name length, photo object';
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.staff_members; raise exception 'UNEXPECTED: anon read staff';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: staff list is server only';
end $$;
reset role;

rollback;
