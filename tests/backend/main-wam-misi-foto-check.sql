-- Execute ONLY against the disposable PostgreSQL migration-check container.
-- Main WAM, Misi around photos (migration 202611300001): the rules column, the new statuses, the tries,
-- the link to a Momen photo, and the tags. Points still come only with "disetujui": a proof that is
-- dikirim, diperiksa, perlu_ditinjau (or the older menunggu) or ditolak holds no ledger row.
begin;
set local role service_role;
do $$
declare
  rani uuid; sari uuid; dimas uuid;
  misi uuid; completion uuid; photo uuid;
  total integer;
begin
  insert into public.employees (full_name, nickname) values ('Rani Contoh Foto', 'Rani') returning id into rani;
  insert into public.employees (full_name, nickname) values ('Sari Contoh Foto', 'Sari') returning id into sari;
  insert into public.employees (full_name, nickname) values ('Dimas Contoh Foto', 'Dimas') returning id into dimas;

  -- Rules: an array, at most ten, empty by default.
  insert into public.mw_missions (title, kind, points, active) values ('Tanpa aturan', 'foto', 10, true);
  if (select rules from public.mw_missions where title = 'Tanpa aturan') <> '[]'::jsonb then raise exception 'rules should default to an empty list'; end if;
  insert into public.mw_missions (title, kind, points, active, rules) values ('Foto bareng BOD', 'foto', 150, true, '[{"type":"foto_langsung"},{"type":"tag","count":2,"relation":"bod","required":true}]'::jsonb) returning id into misi;
  begin update public.mw_missions set rules = '{"type":"tag"}'::jsonb where id = misi; raise exception 'UNEXPECTED: rules that are not a list';
  exception when check_violation then null; end;
  begin update public.mw_missions set rules = (select jsonb_agg('{"type":"foto_langsung"}'::jsonb) from generate_series(1, 11)) where id = misi; raise exception 'UNEXPECTED: eleven rules';
  exception when check_violation then null; end;

  -- The road: no points until "disetujui", and a step back takes them away.
  insert into public.mw_mission_completions (mission_id, employee_id, source, status) values (misi, rani, 'foto', 'dikirim') returning id into completion;
  if exists (select 1 from public.mw_point_entries where completion_id = completion) then raise exception 'a proof that was only sent holds no points'; end if;
  update public.mw_mission_completions set status = 'diperiksa' where id = completion;
  if exists (select 1 from public.mw_point_entries where completion_id = completion) then raise exception 'a proof being checked holds no points'; end if;
  update public.mw_mission_completions set status = 'perlu_ditinjau' where id = completion;
  if exists (select 1 from public.mw_point_entries where completion_id = completion) then raise exception 'a proof waiting for review holds no points'; end if;
  update public.mw_mission_completions set status = 'menunggu' where id = completion;
  if exists (select 1 from public.mw_point_entries where completion_id = completion) then raise exception 'the older "menunggu" holds no points'; end if;
  update public.mw_mission_completions set status = 'disetujui' where id = completion;
  select points into total from public.mw_point_totals where employee_id = rani;
  if total <> 150 then raise exception 'approving gives the mission points once (150), got %', total; end if;
  update public.mw_mission_completions set status = 'ditolak', review_note = 'Hanya satu BOD yang ditandai.' where id = completion;
  if exists (select 1 from public.mw_point_entries where completion_id = completion) then raise exception 'rejecting takes the points back'; end if;
  begin update public.mw_mission_completions set status = 'diterima' where id = completion; raise exception 'UNEXPECTED: an unknown status';
  exception when check_violation then null; end;

  -- Tries: at least one, a bounded number.
  if (select attempts from public.mw_mission_completions where id = completion) <> 1 then raise exception 'attempts should start at 1'; end if;
  update public.mw_mission_completions set attempts = 2 where id = completion;
  begin update public.mw_mission_completions set attempts = 0 where id = completion; raise exception 'UNEXPECTED: zero tries';
  exception when check_violation then null; end;
  begin update public.mw_mission_completions set check_result = '[]'::jsonb where id = completion; raise exception 'UNEXPECTED: a check result that is not an object';
  exception when check_violation then null; end;
  update public.mw_mission_completions set check_result = '{"checks":[],"verifier":null,"decidedAt":"2027-01-05T09:00:00+07:00"}'::jsonb where id = completion;

  -- A Momen photo made from the proof, and its tags.
  insert into public.mw_photos (owner_id, client_id, file_key, size, width, height, mission_id, status)
    values (rani, gen_random_uuid(), 'main-wam/momen/00000000-0000-4000-8000-0000000000aa.jpg', 1000, 800, 1000, misi, 'ditinjau') returning id into photo;
  update public.mw_mission_completions set photo_id = photo where id = completion;
  insert into public.mw_photo_tags (photo_id, employee_id, tagged_by) values (photo, sari, rani);
  insert into public.mw_photo_tags (photo_id, employee_id, tagged_by) values (photo, dimas, rani);
  begin insert into public.mw_photo_tags (photo_id, employee_id, tagged_by) values (photo, sari, rani); raise exception 'UNEXPECTED: the same person tagged twice';
  exception when unique_violation then null; end;
  begin insert into public.mw_photo_tags (photo_id, employee_id, tagged_by) values (photo, rani, rani); raise exception 'UNEXPECTED: tagging yourself';
  exception when check_violation then null; end;
  update public.mw_photo_tags set removed_at = now() where photo_id = photo and employee_id = sari;
  if (select count(*) from public.mw_photo_tags where photo_id = photo and removed_at is null) <> 1 then raise exception 'a lifted tag should no longer count'; end if;
  begin update public.mw_photo_tags set removed_at = now() - interval '1 day' where photo_id = photo and employee_id = dimas; raise exception 'UNEXPECTED: a tag lifted before it was made';
  exception when check_violation then null; end;

  -- What goes with what: deleting the photo takes its tags and leaves the proof (photo_id null); deleting the mission leaves the photo.
  delete from public.mw_photos where id = photo;
  if exists (select 1 from public.mw_photo_tags where photo_id = photo) then raise exception 'deleting a photo should delete its tags'; end if;
  if (select photo_id from public.mw_mission_completions where id = completion) is not null then raise exception 'deleting the photo should leave the proof without a photo link'; end if;
  raise notice 'PASS: Main WAM Misi photo rules hold in the database';
end $$;
reset role;

set local role anon;
do $$
begin
  begin perform 1 from public.mw_photo_tags limit 1; raise exception 'UNEXPECTED: anon reads photo tags';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: photo tags are server only for anon';
end $$;
reset role;

set local role authenticated;
do $$
begin
  begin perform 1 from public.mw_photo_tags limit 1; raise exception 'UNEXPECTED: a signed-in user reads photo tags';
  exception when insufficient_privilege then null; end;
  begin insert into public.mw_photo_tags (photo_id, employee_id, tagged_by) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid()); raise exception 'UNEXPECTED: a signed-in user writes photo tags';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: photo tags are server only for authenticated';
end $$;
reset role;
rollback;
