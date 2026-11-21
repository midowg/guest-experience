-- Execute ONLY against the disposable PostgreSQL migration-check container.
-- Main WAM, Misi + poin + Peringkat (migration 202611260001): points are a ledger, never a balance
-- column. An approved completion holds exactly one ledger row, worth the mission's points at that
-- moment; any other status holds none (so rejecting takes the points back, approving again gives them
-- once). A person does a mission once. A check-in mission needs a point, a point needs both
-- coordinates, a window cannot end before it starts, the ledger's manual rows need a reason and a
-- value, and the totals view sums the rows. Nothing is readable but by the server.
begin;
set local role service_role;
do $$
declare
  rani uuid; sari uuid; dimas uuid;
  foto uuid; taman uuid; sesi uuid; gratis uuid;
  c_rani uuid; c_sari uuid; c_free uuid;
  total integer;
begin
  insert into public.employees (full_name, nickname) values ('Rani Contoh Misi', 'Rani') returning id into rani;
  insert into public.employees (full_name, nickname) values ('Sari Contoh Misi', 'Sari') returning id into sari;
  insert into public.employees (full_name, nickname) values ('Dimas Contoh Misi', 'Dimas') returning id into dimas;

  -- Settings: one row with the example values.
  if (select count(*) from public.mw_mission_settings) <> 1 then raise exception 'mission settings should start as one row'; end if;
  if (select default_radius_m from public.mw_mission_settings) <> 50 or (select max_accuracy_m from public.mw_mission_settings) <> 100 or not (select leaderboard_open from public.mw_mission_settings) then
    raise exception 'mission settings should start at 50 m, 100 m and open';
  end if;
  begin insert into public.mw_mission_settings (id) values (true); raise exception 'UNEXPECTED: a second settings row';
  exception when unique_violation then null; end;
  begin insert into public.mw_mission_settings (id) values (false); raise exception 'UNEXPECTED: a settings row other than the one';
  exception when check_violation then null; end;
  begin update public.mw_mission_settings set default_radius_m = 5; raise exception 'UNEXPECTED: a radius under 10 m';
  exception when check_violation then null; end;

  -- Missions: the rules of each kind.
  insert into public.mw_missions (title, kind, points, active) values ('Foto bareng tim', 'foto', 20, true) returning id into foto;
  insert into public.mw_missions (title, kind, points, latitude, longitude, radius_m, active) values ('Jelajah Taman Kota', 'checkin', 30, -7.8742, 112.5271, 50, true) returning id into taman;
  insert into public.mw_missions (title, kind, points, credit, active) values ('Cerita di sesi', 'sesi', 50, 'absen', true) returning id into sesi;
  insert into public.mw_missions (title, kind, points, active) values ('Tanpa poin', 'foto', 0, true) returning id into gratis;
  begin insert into public.mw_missions (title, kind, points) values ('Check-in tanpa titik', 'checkin', 10); raise exception 'UNEXPECTED: a check-in without a point';
  exception when check_violation then null; end;
  begin insert into public.mw_missions (title, kind, points, latitude) values ('Setengah titik', 'foto', 10, -7.8); raise exception 'UNEXPECTED: a latitude without a longitude';
  exception when check_violation then null; end;
  begin insert into public.mw_missions (title, kind, points, latitude, longitude) values ('Titik di luar bumi', 'foto', 10, 95, 0); raise exception 'UNEXPECTED: a latitude of 95';
  exception when check_violation then null; end;
  begin insert into public.mw_missions (title, kind, points) values ('Jenis aneh', 'kuis', 10); raise exception 'UNEXPECTED: an unknown kind';
  exception when check_violation then null; end;
  begin insert into public.mw_missions (title, kind, points) values ('Poin negatif', 'foto', -1); raise exception 'UNEXPECTED: negative mission points';
  exception when check_violation then null; end;
  begin insert into public.mw_missions (title, kind, points, radius_m) values ('Radius kecil', 'foto', 10, 5); raise exception 'UNEXPECTED: a radius under 10 m';
  exception when check_violation then null; end;
  begin insert into public.mw_missions (title, kind, points, opens_at, closes_at) values ('Jendela terbalik', 'foto', 10, now(), now() - interval '1 hour'); raise exception 'UNEXPECTED: a window that ends before it starts';
  exception when check_violation then null; end;

  -- An approved completion gives the mission's points, once.
  insert into public.mw_mission_completions (mission_id, employee_id, source, status) values (foto, rani, 'foto', 'disetujui') returning id into c_rani;
  select coalesce(sum(points), 0) into total from public.mw_point_entries where employee_id = rani;
  if total <> 20 then raise exception 'an approved photo mission should give 20 points, got %', total; end if;
  if (select kind from public.mw_point_entries where completion_id = c_rani) <> 'misi' then raise exception 'a mission entry should be kind misi'; end if;
  insert into public.mw_mission_completions (mission_id, employee_id, source, status) values (taman, rani, 'lokasi', 'disetujui');
  insert into public.mw_mission_completions (mission_id, employee_id, source, status) values (sesi, rani, 'absen', 'disetujui');
  select coalesce(sum(points), 0) into total from public.mw_point_entries where employee_id = rani;
  if total <> 100 then raise exception 'three approved missions should give 100 points, got %', total; end if;

  -- A person does a mission once.
  begin insert into public.mw_mission_completions (mission_id, employee_id, source, status) values (foto, rani, 'foto', 'disetujui'); raise exception 'UNEXPECTED: the same mission done twice by one person';
  exception when unique_violation then null; end;
  begin insert into public.mw_mission_completions (mission_id, employee_id, source, status) values (taman, sari, 'bukti', 'disetujui'); raise exception 'UNEXPECTED: an unknown source';
  exception when check_violation then null; end;
  begin insert into public.mw_mission_completions (mission_id, employee_id, source, status) values (taman, sari, 'lokasi', 'selesai'); raise exception 'UNEXPECTED: an unknown status';
  exception when check_violation then null; end;

  -- Waiting for review gives nothing; approving gives the points; rejecting takes them back; approving again gives them once.
  insert into public.mw_mission_completions (mission_id, employee_id, source, status) values (foto, sari, 'foto', 'menunggu') returning id into c_sari;
  if exists (select 1 from public.mw_point_entries where employee_id = sari) then raise exception 'a completion that waits should give no points'; end if;
  update public.mw_mission_completions set status = 'disetujui', reviewed_at = now() where id = c_sari;
  if (select coalesce(sum(points), 0) from public.mw_point_entries where employee_id = sari) <> 20 then raise exception 'approving should give 20 points'; end if;
  update public.mw_mission_completions set status = 'disetujui', note = 'dicek ulang' where id = c_sari;
  if (select count(*) from public.mw_point_entries where employee_id = sari) <> 1 then raise exception 'approving twice should still give one ledger row'; end if;
  update public.mw_mission_completions set status = 'ditolak', review_note = 'Bukan di tugu' where id = c_sari;
  if exists (select 1 from public.mw_point_entries where employee_id = sari) then raise exception 'rejecting should take the points back'; end if;
  update public.mw_mission_completions set status = 'disetujui' where id = c_sari;
  if (select coalesce(sum(points), 0) from public.mw_point_entries where employee_id = sari) <> 20 then raise exception 'approving after a rejection should give the points again, once'; end if;

  -- The points are what the mission was worth when it was approved; changing the mission later does not move them.
  update public.mw_missions set points = 99 where id = foto;
  if (select coalesce(sum(points), 0) from public.mw_point_entries where employee_id = rani) <> 100 then raise exception 'changing a mission should not change points already given'; end if;
  update public.mw_missions set points = 20 where id = foto;

  -- A mission worth nothing gives no ledger row (a row of zero is refused).
  insert into public.mw_mission_completions (mission_id, employee_id, source, status) values (gratis, dimas, 'foto', 'disetujui') returning id into c_free;
  if exists (select 1 from public.mw_point_entries where completion_id = c_free) then raise exception 'a mission worth 0 should leave no ledger row'; end if;

  -- Points by hand: a reason, a value other than zero, and the ledger sums them with the rest.
  insert into public.mw_point_entries (employee_id, points, kind, note, created_by) values (rani, 15, 'manual', 'Bantu panitia', dimas);
  insert into public.mw_point_entries (employee_id, points, kind, note) values (rani, -5, 'manual', 'Koreksi');
  begin insert into public.mw_point_entries (employee_id, points, kind, note) values (rani, 0, 'manual', 'Nol'); raise exception 'UNEXPECTED: a ledger row of 0 points';
  exception when check_violation then null; end;
  begin insert into public.mw_point_entries (employee_id, points, kind, note) values (rani, 5000, 'manual', 'Terlalu besar'); raise exception 'UNEXPECTED: a ledger row over 1000 points';
  exception when check_violation then null; end;
  begin insert into public.mw_point_entries (employee_id, points, kind) values (rani, 10, 'misi'); raise exception 'UNEXPECTED: a mission entry without its completion';
  exception when check_violation then null; end;
  begin insert into public.mw_point_entries (employee_id, points, kind, completion_id) values (rani, 10, 'manual', c_rani); raise exception 'UNEXPECTED: a manual entry tied to a completion';
  exception when check_violation then null; end;
  begin insert into public.mw_point_entries (employee_id, points, kind, completion_id) values (rani, 20, 'misi', c_rani); raise exception 'UNEXPECTED: two ledger rows for one completion';
  exception when unique_violation then null; end;

  -- The totals view: the sum of the ledger and the number of missions done, per person.
  select points into total from public.mw_point_totals where employee_id = rani;
  if total <> 110 then raise exception 'Rani should total 110 points (100 from missions, +15, -5), got %', total; end if;
  if (select missions from public.mw_point_totals where employee_id = rani) <> 3 then raise exception 'Rani should have 3 missions in the totals'; end if;
  if (select points from public.mw_point_totals where employee_id = sari) <> 20 then raise exception 'Sari should total 20 points'; end if;
  if exists (select 1 from public.mw_point_totals where employee_id = dimas) then raise exception 'Dimas has no points: not in the totals'; end if;

  -- Taking a completion back takes its points with it. Deleting a mission takes its completions and their points too, which is why the app only turns a mission off once people have done it.
  delete from public.mw_mission_completions where id = c_sari;
  if exists (select 1 from public.mw_point_entries where employee_id = sari) then raise exception 'deleting a completion should delete its ledger row'; end if;
  delete from public.mw_missions where id = sesi;
  select points into total from public.mw_point_totals where employee_id = rani;
  if total <> 60 then raise exception 'deleting a mission removes its completions and their points (110 - 50 = 60), got %', total; end if;

  -- A person who leaves Data karyawan takes their completions with them; a manual entry they wrote stays, without the author.
  delete from public.employees where id = dimas;
  if exists (select 1 from public.mw_mission_completions where employee_id = dimas) then raise exception 'deleting a person should delete their completions'; end if;
  if not exists (select 1 from public.mw_point_entries where employee_id = rani and note = 'Bantu panitia' and created_by is null) then raise exception 'a manual entry should outlive its author, without the author'; end if;
  raise notice 'PASS: Main WAM Misi rules hold in the database';
end $$;
reset role;

set local role anon;
do $$
begin
  begin perform 1 from public.mw_missions limit 1; raise exception 'UNEXPECTED: anon reads missions';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.mw_point_totals limit 1; raise exception 'UNEXPECTED: anon reads the points';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: Main WAM Misi is server only for anon';
end $$;
reset role;

set local role authenticated;
do $$
begin
  begin perform 1 from public.mw_mission_completions limit 1; raise exception 'UNEXPECTED: a signed-in user reads completions';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.mw_point_entries limit 1; raise exception 'UNEXPECTED: a signed-in user reads the ledger';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.mw_point_totals limit 1; raise exception 'UNEXPECTED: a signed-in user reads the totals';
  exception when insufficient_privilege then null; end;
  begin insert into public.mw_point_entries (employee_id, points, kind, note) values (gen_random_uuid(), 10, 'manual', 'curang'); raise exception 'UNEXPECTED: a signed-in user writes points';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: Main WAM Misi is server only for authenticated';
end $$;
reset role;
rollback;
