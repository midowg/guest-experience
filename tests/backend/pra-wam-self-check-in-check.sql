-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
set local role service_role;
do $$
declare forum uuid; person uuid; other uuid; panitia uuid; key text;
begin
  select id into forum from public.pw_sessions where title = 'Review data departemen';
  insert into public.employees (full_name) values ('Peserta Kantor') returning id into person;
  insert into public.employees (full_name) values ('Peserta Zoom') returning id into other;
  insert into public.employees (full_name) values ('Panitia Uji') returning id into panitia;

  -- Offline: one tap, no proof, nobody else records it.
  insert into public.pw_attendance (session_id, employee_id, method) values (forum, person, 'offline');
  begin update public.pw_attendance set proof_key = 'pra-wam/absen/' || forum || '/' || person || '/' || gen_random_uuid() || '.webp' where employee_id = person;
    raise exception 'UNEXPECTED: offline with a proof';
  exception when check_violation then null; end;
  begin update public.pw_attendance set recorded_by = panitia where employee_id = person; raise exception 'UNEXPECTED: offline with recorded_by';
  exception when check_violation then null; end;

  -- Online needs its proof, in this person's folder for this session.
  begin insert into public.pw_attendance (session_id, employee_id, method) values (forum, other, 'online'); raise exception 'UNEXPECTED: online without proof';
  exception when check_violation then null; end;
  begin insert into public.pw_attendance (session_id, employee_id, method, proof_key) values (forum, other, 'online', 'pra-wam/absen/' || forum || '/' || person || '/' || gen_random_uuid() || '.webp');
    raise exception 'UNEXPECTED: proof in someone else''s folder';
  exception when check_violation then null; end;
  begin insert into public.pw_attendance (session_id, employee_id, method, proof_key) values (forum, other, 'online', 'pra-wam/foto/' || other || '/' || gen_random_uuid() || '.webp');
    raise exception 'UNEXPECTED: proof outside pra-wam/absen';
  exception when check_violation then null; end;
  key := 'pra-wam/absen/' || forum || '/' || other || '/' || gen_random_uuid() || '.jpg';
  insert into public.pw_attendance (session_id, employee_id, method, proof_key) values (forum, other, 'online', key);
  -- A second "Saya hadir" changes nothing.
  insert into public.pw_attendance (session_id, employee_id, method) values (forum, other, 'offline') on conflict do nothing;
  if (select method from public.pw_attendance where session_id = forum and employee_id = other) <> 'online' then raise exception 'second check-in replaced the first'; end if;

  -- The old kinds still hold: qr without who, manual with who.
  begin insert into public.pw_attendance (session_id, employee_id, method) values (forum, panitia, 'manual'); raise exception 'UNEXPECTED: manual without who';
  exception when check_violation then null; end;
  begin insert into public.pw_attendance (session_id, employee_id, method) values (forum, panitia, 'zoom'); raise exception 'UNEXPECTED: unknown method';
  exception when check_violation then null; end;
  insert into public.pw_attendance (session_id, employee_id, method, recorded_by) values (forum, panitia, 'manual', panitia);
  raise notice 'PASS: offline and online self check-in, proof only for online in its own folder, manual still records who';
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform proof_key from public.pw_attendance; raise exception 'UNEXPECTED: anon read proof';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: proofs are server only';
end $$;
reset role;

rollback;
