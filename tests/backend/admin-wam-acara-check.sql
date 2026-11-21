-- Execute ONLY against the disposable PostgreSQL migration-check container.
-- Two WAM admin doors and the WAM committee (202611200603): Akses admin may give 'wam_acara' (nothing else new);
-- one row per person per event in pw_event_staff, removed with the person; server only.
begin;
set local role service_role;
do $$
declare
  rani uuid; sari uuid; wam uuid; pra uuid;
begin
  insert into public.employees (full_name, nickname) values ('Rani Contoh Staf', 'Rani') returning id into rani;
  insert into public.employees (full_name, nickname) values ('Sari Contoh Staf', 'Sari') returning id into sari;
  select id into wam from public.pw_events where kind = 'wam' limit 1;
  select id into pra from public.pw_events where kind <> 'wam' limit 1;
  if wam is null or pra is null then raise exception 'pw_events should hold the WAM event and the Pra WAM one'; end if;

  insert into public.admin_grants (employee_id, apps) values (rani, array['wam_acara']);
  insert into public.admin_grants (employee_id, apps) values (sari, array['wam', 'kuesioner']);
  begin insert into public.admin_grants (employee_id, apps) values (gen_random_uuid(), array['wam_semua']); raise exception 'UNEXPECTED: an unknown admin app';
  exception when check_violation or foreign_key_violation then null; end;

  insert into public.pw_event_staff (event_id, employee_id, seksi, granted_by) values (wam, rani, 'kamar', 'Super admin');
  insert into public.pw_event_staff (event_id, employee_id) values (pra, rani);
  begin insert into public.pw_event_staff (event_id, employee_id) values (wam, rani); raise exception 'UNEXPECTED: twice on one committee';
  exception when unique_violation then null; end;
  begin insert into public.pw_event_staff (event_id, employee_id, seksi) values (wam, sari, repeat('x', 41)); raise exception 'UNEXPECTED: a seksi of 41 letters';
  exception when check_violation then null; end;

  delete from public.employees where id = rani;
  if exists (select 1 from public.pw_event_staff where employee_id = rani) then raise exception 'committee rows outlived the person'; end if;
  raise notice 'PASS: wam_acara in Akses admin, one committee row per person per event';
end $$;
reset role;

set local role anon;
do $$
begin
  begin perform 1 from public.pw_event_staff limit 1; raise exception 'UNEXPECTED: anon reads the committee';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: pw_event_staff is server only for anon';
end $$;
reset role;
rollback;
