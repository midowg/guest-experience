-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
set local role service_role;
do $$
declare yulia uuid; bas uuid; mrp uuid;
begin
  if (select count(*) from public.pw_events) <> 2 then raise exception 'events not seeded'; end if;
  if (select status from public.pw_events where slug = 'wam-2027') <> 'disiapkan' then raise exception 'WAM should be prepared, not shown'; end if;
  if not (select (modules->>'appraisal')::boolean from public.pw_events where slug = 'pra-wam-2026') then raise exception 'appraisal not on'; end if;
  begin update public.pw_events set end_date = '2026-01-01' where slug = 'pra-wam-2026'; raise exception 'UNEXPECTED: end before start';
  exception when check_violation then null; end;

  insert into public.employees (full_name, nickname) values ('Yulia Uji', 'Yulia') returning id into yulia;
  insert into public.org_units (kind, name, code) values ('departemen', 'Business & Administrative Services', 'BAS') returning id into bas;
  insert into public.org_units (kind, name, code) values ('bu', 'MRP', 'MRP') returning id into mrp;
  begin insert into public.org_units (kind, name) values ('departemen', 'Business & Administrative Services'); raise exception 'UNEXPECTED: unit twice';
  exception when unique_violation then null; end;
  -- One person, two units, leading both.
  insert into public.unit_members (unit_id, employee_id, job_title, is_lead, is_primary) values
    (bas, yulia, 'Senior Manager', true, true), (mrp, yulia, '', true, false);
  if (select count(*) from public.unit_members where employee_id = yulia and is_lead) <> 2 then raise exception 'two leads expected'; end if;
  delete from public.org_units where id = mrp;
  if (select count(*) from public.unit_members where employee_id = yulia) <> 1 then raise exception 'membership not removed with unit'; end if;
  raise notice 'PASS: events seeded, units unique, one person in and leading several units';
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.unit_members; raise exception 'UNEXPECTED: anon read unit members';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.pw_events; raise exception 'UNEXPECTED: anon read events';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: events and units are server only';
end $$;
reset role;

rollback;
