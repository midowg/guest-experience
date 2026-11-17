-- Execute ONLY against the disposable PostgreSQL migration-check container.
-- Migration 202611200501 (agen E, Admin WAM → Main WAM → isi acara): kelompok members are set as a
-- whole (people move from their old kelompok, one koordinator), a paste of kelompok gives each
-- listed kelompok exactly its rows and refuses a person twice, kelompok kegiatan keep one group per
-- person per session, seats are replaced as a list, and only the server may call any of it.
begin;
set local role service_role;
do $$
declare
  rani uuid; sari uuid; dewi uuid; fajar uuid; bima uuid;
  g1 uuid; g2 uuid; team uuid; gala uuid; pos1 uuid; pos2 uuid; kereta uuid;
  n integer;
begin
  insert into public.employees (full_name, nickname) values ('Rani Contoh Admin', 'Rani') returning id into rani;
  insert into public.employees (full_name, nickname) values ('Sari Contoh Admin', 'Sari') returning id into sari;
  insert into public.employees (full_name, nickname) values ('Dewi Contoh Admin', 'Dewi') returning id into dewi;
  insert into public.employees (full_name, nickname) values ('Fajar Contoh Admin', 'Fajar') returning id into fajar;
  insert into public.employees (full_name, nickname) values ('Bima Contoh Admin', 'Bima') returning id into bima;

  -- Kelompok: set members as a whole, with a koordinator among them.
  insert into public.mw_groups (number, name) values (1, 'Bromo') returning id into g1;
  insert into public.mw_groups (number, name) values (2, 'Kawi') returning id into g2;
  n := public.mw_admin_set_group_members(g1, array[rani, sari, fajar], fajar);
  if n <> 3 then raise exception 'three members expected, got %', n; end if;
  if (select employee_id from public.mw_group_members where group_id = g1 and coordinator) <> fajar then raise exception 'Fajar should coordinate Kelompok 1'; end if;
  -- Changing the koordinator inside the same kelompok (the partial unique index never sees two).
  perform public.mw_admin_set_group_members(g1, array[rani, sari, fajar], rani);
  if (select count(*) from public.mw_group_members where group_id = g1 and coordinator) <> 1 or not (select coordinator from public.mw_group_members where employee_id = rani) then
    raise exception 'Rani should be the only koordinator';
  end if;
  -- Moving Rani (the koordinator) to Kelompok 2: she leaves 1 and is not its koordinator any more.
  perform public.mw_admin_set_group_members(g2, array[rani, dewi], null);
  if (select group_id from public.mw_group_members where employee_id = rani) <> g2 then raise exception 'Rani should have moved to Kelompok 2'; end if;
  if (select count(*) from public.mw_group_members where group_id = g1 and coordinator) <> 0 then raise exception 'Kelompok 1 lost its koordinator with Rani'; end if;
  if (select coordinator from public.mw_group_members where employee_id = rani) then raise exception 'Rani is not koordinator of Kelompok 2'; end if;
  -- Dropping people: only the listed stay; duplicates in the list count once.
  perform public.mw_admin_set_group_members(g1, array[sari, sari], sari);
  if (select array_agg(employee_id) from public.mw_group_members where group_id = g1) <> array[sari] then raise exception 'only Sari should be left in Kelompok 1'; end if;
  begin perform public.mw_admin_set_group_members(g1, array[sari], bima); raise exception 'UNEXPECTED: koordinator outside the kelompok';
  exception when raise_exception then if sqlerrm <> 'MW_COORDINATOR_NOT_MEMBER' then raise; end if; end;
  begin perform public.mw_admin_set_group_members(gen_random_uuid(), array[sari], null); raise exception 'UNEXPECTED: an unknown kelompok';
  exception when no_data_found then null; end;

  -- Import: by number; each listed kelompok gets exactly its rows; a new number is added.
  n := public.mw_admin_import_groups(jsonb_build_array(
    jsonb_build_object('number', 1, 'name', 'Bromo Baru', 'employeeIds', jsonb_build_array(rani, bima), 'coordinatorId', bima),
    jsonb_build_object('number', 3, 'name', 'Welirang', 'employeeIds', jsonb_build_array(sari), 'coordinatorId', null)
  ));
  if n <> 2 then raise exception 'two kelompok imported expected, got %', n; end if;
  if (select name from public.mw_groups where id = g1) <> 'Bromo Baru' then raise exception 'Kelompok 1 should be renamed'; end if;
  if (select count(*) from public.mw_groups) <> 3 then raise exception 'Kelompok 3 should be added'; end if;
  if (select group_id from public.mw_group_members where employee_id = rani) <> g1 then raise exception 'Rani should be back in Kelompok 1'; end if;
  if (select g.number from public.mw_group_members m join public.mw_groups g on g.id = m.group_id where m.employee_id = sari) <> 3 then raise exception 'Sari should be in Kelompok 3'; end if;
  if (select array_agg(employee_id) from public.mw_group_members where group_id = g2) <> array[dewi] then raise exception 'Kelompok 2 (not listed) keeps Dewi only'; end if;
  begin
    perform public.mw_admin_import_groups(jsonb_build_array(
      jsonb_build_object('number', 1, 'name', 'Bromo', 'employeeIds', jsonb_build_array(rani)),
      jsonb_build_object('number', 2, 'name', 'Kawi', 'employeeIds', jsonb_build_array(rani))));
    raise exception 'UNEXPECTED: one person in two kelompok';
  exception when raise_exception then if sqlerrm <> 'MW_DUPLICATE_MEMBER' then raise; end if; end;
  -- The refused paste changed nothing (one transaction).
  if (select name from public.mw_groups where id = g1) <> 'Bromo Baru' then raise exception 'a refused import must not rename'; end if;
  begin perform public.mw_admin_import_groups('[]'::jsonb); raise exception 'UNEXPECTED: an empty import';
  exception when raise_exception then if sqlerrm <> 'MW_BAD_INPUT' then raise; end if; end;

  -- Kelompok kegiatan: one per person per session; import by label.
  insert into public.mw_sessions (title, status, starts_at, ends_at) values ('Team building', 'terbit', '2027-01-05 15:00+07', '2027-01-05 17:00+07') returning id into team;
  insert into public.mw_sessions (title, status, starts_at) values ('Gala', 'terbit', '2027-01-06 19:00+07') returning id into gala;
  insert into public.mw_activity_groups (session_id, kind, label) values (team, 'pos', 'Pos 1') returning id into pos1;
  insert into public.mw_activity_groups (session_id, kind, label) values (team, 'pos', 'Pos 2') returning id into pos2;
  perform public.mw_admin_set_activity_members(pos1, array[rani, sari]);
  perform public.mw_admin_set_activity_members(pos2, array[sari, dewi]);
  if (select activity_group_id from public.mw_activity_group_members where employee_id = sari and session_id = team) <> pos2 then raise exception 'Sari should have moved to Pos 2'; end if;
  if (select count(*) from public.mw_activity_group_members where activity_group_id = pos1) <> 1 then raise exception 'Pos 1 keeps Rani only'; end if;
  n := public.mw_admin_import_activity_groups(gala, jsonb_build_array(
    jsonb_build_object('label', 'Meja 7', 'kind', 'meja', 'note', '', 'sort', 7, 'employeeIds', jsonb_build_array(rani, sari))));
  if n <> 1 or (select count(*) from public.mw_activity_group_members where session_id = gala) <> 2 then raise exception 'Meja 7 should hold two people'; end if;
  -- Rani at Meja 7 (Gala) and Pos 1 (Team building): different sessions are fine.
  if (select count(*) from public.mw_activity_group_members where employee_id = rani) <> 2 then raise exception 'Rani has one group in each session'; end if;
  n := public.mw_admin_import_activity_groups(team, jsonb_build_array(
    jsonb_build_object('label', 'Pos 1', 'kind', 'pos', 'note', 'Dekat kolam', 'sort', 1, 'employeeIds', jsonb_build_array(dewi))));
  if (select note from public.mw_activity_groups where id = pos1) <> 'Dekat kolam' then raise exception 'Pos 1 should take the note'; end if;
  if (select array_agg(employee_id) from public.mw_activity_group_members where activity_group_id = pos1) <> array[dewi] then raise exception 'Pos 1 should hold only Dewi now'; end if;
  begin
    perform public.mw_admin_import_activity_groups(team, jsonb_build_array(
      jsonb_build_object('label', 'Pos 1', 'employeeIds', jsonb_build_array(bima)), jsonb_build_object('label', 'Pos 2', 'employeeIds', jsonb_build_array(bima))));
    raise exception 'UNEXPECTED: one person in two groups of a session';
  exception when raise_exception then if sqlerrm <> 'MW_DUPLICATE_MEMBER' then raise; end if; end;
  begin perform public.mw_admin_import_activity_groups(gen_random_uuid(), '[{"label": "Pos 9"}]'::jsonb); raise exception 'UNEXPECTED: an unknown session';
  exception when no_data_found then null; end;

  -- Seats: merged or replaced; an empty seat and vehicle is no seat.
  insert into public.mw_trips (direction, kind, title) values ('berangkat', 'kereta', 'Kereta') returning id into kereta;
  n := public.mw_admin_set_trip_seats(kereta, jsonb_build_array(
    jsonb_build_object('employeeId', rani, 'seat', 'Gerbong 3 · 12A', 'vehicle', ''), jsonb_build_object('employeeId', sari, 'seat', 'Gerbong 3 · 12B', 'vehicle', '')), false);
  if n <> 2 then raise exception 'two seats expected'; end if;
  perform public.mw_admin_set_trip_seats(kereta, jsonb_build_array(jsonb_build_object('employeeId', dewi, 'seat', 'Gerbong 4 · 1A')), false);
  if (select count(*) from public.mw_trip_seats where trip_id = kereta) <> 3 then raise exception 'merging keeps the others'; end if;
  perform public.mw_admin_set_trip_seats(kereta, jsonb_build_array(
    jsonb_build_object('employeeId', rani, 'seat', 'Gerbong 5 · 8C'), jsonb_build_object('employeeId', sari, 'seat', '', 'vehicle', '')), true);
  if (select count(*) from public.mw_trip_seats where trip_id = kereta) <> 1 or (select seat from public.mw_trip_seats where employee_id = rani) <> 'Gerbong 5 · 8C' then
    raise exception 'replacing keeps only Rani with her new seat';
  end if;
  begin perform public.mw_admin_set_trip_seats(gen_random_uuid(), '[]'::jsonb, true); raise exception 'UNEXPECTED: an unknown step';
  exception when no_data_found then null; end;
  raise notice 'PASS: Main WAM admin sets kelompok, kelompok kegiatan and kursi as a whole';
end $$;
reset role;

-- Only the server may call them.
do $$
declare fn text;
begin
  foreach fn in array array['mw_admin_set_group_members(uuid,uuid[],uuid)', 'mw_admin_import_groups(jsonb)', 'mw_admin_set_activity_members(uuid,uuid[])',
    'mw_admin_import_activity_groups(uuid,jsonb)', 'mw_admin_set_trip_seats(uuid,jsonb,boolean)'] loop
    if has_function_privilege('anon', 'public.' || fn, 'execute') or has_function_privilege('authenticated', 'public.' || fn, 'execute') then
      raise exception '% must not be callable by anon or authenticated', fn;
    end if;
    if not has_function_privilege('service_role', 'public.' || fn, 'execute') then raise exception '% must be callable by the server', fn; end if;
  end loop;
  raise notice 'PASS: Main WAM admin functions are server only';
end $$;
rollback;
