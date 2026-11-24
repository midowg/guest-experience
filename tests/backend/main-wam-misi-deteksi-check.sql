-- Execute ONLY against the disposable PostgreSQL migration-check container.
-- Main WAM, mission detection from Momen photos (migration 202611300003): the mission's mode, the photo's
-- signals (the position goes with the photo and is never readable by anon or a signed-in user), what
-- detection did, and the person's own switch.
begin;
set local role service_role;
do $$
declare
  rani uuid; sari uuid; misi uuid; photo uuid; completion uuid;
begin
  insert into public.employees (full_name, nickname) values ('Rani Contoh Deteksi', 'Rani') returning id into rani;
  insert into public.employees (full_name, nickname) values ('Sari Contoh Deteksi', 'Sari') returning id into sari;

  -- The mission's mode: null by default, three words only.
  insert into public.mw_missions (title, kind, points, active) values ('Foto di lobi', 'foto', 300, true) returning id into misi;
  if (select auto_detect from public.mw_missions where id = misi) is not null then raise exception 'auto_detect should default to null (by default)'; end if;
  update public.mw_missions set auto_detect = 'mungkin' where id = misi;
  update public.mw_missions set auto_detect = null where id = misi;
  begin update public.mw_missions set auto_detect = 'selalu' where id = misi; raise exception 'UNEXPECTED: an unknown detection mode';
  exception when check_violation then null; end;

  insert into public.mw_photos (owner_id, client_id, file_key, size, width, height)
    values (rani, gen_random_uuid(), 'main-wam/momen/00000000-0000-4000-8000-0000000000bb.jpg', 1000, 800, 1000) returning id into photo;

  -- Signals: a position needs both coordinates, inside the globe; none is fine.
  insert into public.mw_photo_signals (photo_id, owner_id, live) values (photo, rani, true);
  update public.mw_photo_signals set geo_lat = -7.87, geo_lng = 112.52, geo_acc = 12 where photo_id = photo;
  begin update public.mw_photo_signals set geo_lng = null where photo_id = photo; raise exception 'UNEXPECTED: half a position';
  exception when check_violation then null; end;
  begin update public.mw_photo_signals set geo_lat = 91, geo_lng = 112.52 where photo_id = photo; raise exception 'UNEXPECTED: a latitude beyond the poles';
  exception when check_violation then null; end;
  begin update public.mw_photo_signals set geo_acc = -1 where photo_id = photo; raise exception 'UNEXPECTED: a negative accuracy';
  exception when check_violation then null; end;
  update public.mw_photo_signals set checked_at = now() where photo_id = photo;

  -- Detections: one per photo and mission, three words of outcome.
  insert into public.mw_mission_completions (mission_id, employee_id, source, status, photo_id) values (misi, rani, 'foto', 'perlu_ditinjau', photo) returning id into completion;
  insert into public.mw_photo_detections (photo_id, mission_id, status, outcome, completion_id, reasons) values (photo, misi, 'cocok', 'diajukan', completion, '["Foto diambil di lobi"]'::jsonb);
  begin insert into public.mw_photo_detections (photo_id, mission_id, status, outcome) values (photo, misi, 'cocok', 'saran'); raise exception 'UNEXPECTED: the same photo and mission twice';
  exception when unique_violation then null; end;
  begin update public.mw_photo_detections set outcome = 'otomatis' where photo_id = photo; raise exception 'UNEXPECTED: an unknown outcome';
  exception when check_violation then null; end;
  begin update public.mw_photo_detections set status = 'tidak' where photo_id = photo; raise exception 'UNEXPECTED: "tidak" is not kept';
  exception when check_violation then null; end;
  begin update public.mw_photo_detections set reasons = '{}'::jsonb where photo_id = photo; raise exception 'UNEXPECTED: reasons that are not a list';
  exception when check_violation then null; end;
  -- Taking the proof back keeps the memory (completion_id null), so it is never sent again.
  delete from public.mw_mission_completions where id = completion;
  if (select completion_id from public.mw_photo_detections where photo_id = photo and mission_id = misi) is not null then raise exception 'deleting the proof should leave the detection without a link'; end if;
  update public.mw_photo_detections set outcome = 'ditarik' where photo_id = photo and mission_id = misi;

  -- The person's own switch: on by default, one row per person.
  insert into public.mw_misi_prefs (employee_id) values (sari);
  if not (select auto_detect from public.mw_misi_prefs where employee_id = sari) then raise exception 'the switch should be on by default'; end if;
  begin insert into public.mw_misi_prefs (employee_id) values (sari); raise exception 'UNEXPECTED: two switches for one person';
  exception when unique_violation then null; end;

  -- The position goes with the photo; the detection goes with the photo or the mission.
  delete from public.mw_photos where id = photo;
  if exists (select 1 from public.mw_photo_signals where photo_id = photo) then raise exception 'deleting a photo should delete its signals (the position)'; end if;
  if exists (select 1 from public.mw_photo_detections where photo_id = photo) then raise exception 'deleting a photo should delete its detections'; end if;
  raise notice 'PASS: Main WAM mission detection rules hold in the database';
end $$;
reset role;

set local role anon;
do $$
begin
  begin perform 1 from public.mw_photo_signals limit 1; raise exception 'UNEXPECTED: anon reads photo signals';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.mw_photo_detections limit 1; raise exception 'UNEXPECTED: anon reads detections';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.mw_misi_prefs limit 1; raise exception 'UNEXPECTED: anon reads the switch';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: detection tables are server only for anon';
end $$;
reset role;

set local role authenticated;
do $$
begin
  begin perform 1 from public.mw_photo_signals limit 1; raise exception 'UNEXPECTED: a signed-in user reads the position of a photo';
  exception when insufficient_privilege then null; end;
  begin insert into public.mw_photo_signals (photo_id, owner_id) values (gen_random_uuid(), gen_random_uuid()); raise exception 'UNEXPECTED: a signed-in user writes photo signals';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.mw_photo_detections limit 1; raise exception 'UNEXPECTED: a signed-in user reads detections';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.mw_misi_prefs limit 1; raise exception 'UNEXPECTED: a signed-in user reads the switch';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: detection tables are server only for authenticated';
end $$;
reset role;
rollback;
