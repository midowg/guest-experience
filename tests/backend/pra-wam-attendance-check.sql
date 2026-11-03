-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
set local role service_role;
do $$
declare forum uuid; person uuid; panitia uuid;
begin
  select id into forum from public.pw_sessions where title = 'Review data departemen';
  insert into public.employees (full_name) values ('Peserta Uji') returning id into person;
  insert into public.employees (full_name) values ('Panitia Uji') returning id into panitia;

  update public.pw_sessions set qr_token = 'Abc_def-0123456789xyzQ' where id = forum;
  begin update public.pw_sessions set qr_token = 'pendek' where id = forum; raise exception 'UNEXPECTED: short token';
  exception when check_violation then null; end;

  insert into public.pw_attendance (session_id, employee_id, method) values (forum, person, 'qr');
  -- A second scan is ignored, not doubled.
  insert into public.pw_attendance (session_id, employee_id, method) values (forum, person, 'qr') on conflict do nothing;
  if (select count(*) from public.pw_attendance where session_id = forum) <> 1 then raise exception 'check-in doubled'; end if;
  begin insert into public.pw_attendance (session_id, employee_id, method) values (forum, panitia, 'manual'); raise exception 'UNEXPECTED: manual without who';
  exception when check_violation then null; end;
  insert into public.pw_attendance (session_id, employee_id, method, recorded_by) values (forum, panitia, 'manual', panitia);
  raise notice 'PASS: QR token shape, one check-in per person, manual records who';
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.pw_attendance; raise exception 'UNEXPECTED: anon read attendance';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: attendance is server only';
end $$;
reset role;

rollback;
