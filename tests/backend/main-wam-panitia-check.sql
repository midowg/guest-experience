-- Execute ONLY against the disposable PostgreSQL migration-check container.
-- Migration 202611200301 (Main WAM, panitia): a session's version moves on every change; Rundown
-- live saves times for several sessions at once, refuses a stale version (two panitia at once),
-- skips rows without a real change, never touches drafts, and logs who changed what; moderation
-- decisions refuse a photo another panitia already handled, delete only a hidden photo, keep the
-- reason panitia gave (audit L8), handle the reports by the log on Tampilkan lagi while each
-- reporter's own hide stays (audit R17), and keep their log after the photo is gone; nothing is
-- readable or callable with the public roles.
begin;
set local role service_role;
do $$
declare
  dimas uuid; rani uuid; sari uuid;
  pemaparan uuid; makan uuid; draft uuid;
  v1 timestamptz; v2 timestamptz; v_makan timestamptz; v_after timestamptz;
  photo uuid; other_photo uuid; owner_back uuid; row_back jsonb;
  saved integer;
begin
  insert into public.employees (full_name, nickname) values ('Dimas Contoh Panitia', 'Dimas') returning id into dimas;
  insert into public.employees (full_name, nickname) values ('Rani Contoh Panitia', 'Rani') returning id into rani;
  insert into public.employees (full_name, nickname) values ('Sari Contoh Panitia', 'Sari') returning id into sari;

  insert into public.mw_sessions (title, status, starts_at, ends_at, place) values ('Pemaparan departemen', 'terbit', '2027-01-05 08:00+07', '2027-01-05 12:00+07', 'Aula Utama') returning id, updated_at into pemaparan, v1;
  insert into public.mw_sessions (title, kind, status, starts_at, ends_at) values ('Makan siang', 'makan', 'terbit', '2027-01-05 12:00+07', '2027-01-05 13:00+07') returning id, updated_at into makan, v_makan;
  insert into public.mw_sessions (title, status, starts_at) values ('Draf', 'draf', '2027-01-05 15:00+07') returning id into draft;

  -- 1. The version moves on every update (Admin WAM's too).
  update public.mw_sessions set description = 'Urutan departemen' where id = pemaparan;
  select updated_at into v2 from public.mw_sessions where id = pemaparan;
  if v2 <= v1 then raise exception 'updated_at should move on update'; end if;

  -- 2. A stale version is refused, nothing changes.
  begin
    perform * from public.mw_rundown_change(dimas, jsonb_build_array(jsonb_build_object('id', pemaparan, 'version', v1, 'endsAt', '2027-01-05 12:30+07')), true);
    raise exception 'UNEXPECTED: a stale version was saved';
  exception when raise_exception then
    if sqlerrm <> 'RUNDOWN_CHANGED' then raise; end if;
  end;
  if (select ends_at from public.mw_sessions where id = pemaparan) <> '2027-01-05 12:00+07' then raise exception 'a refused change must not save'; end if;

  -- Two sessions at once: the end of one, the next one moved by the same 30 minutes.
  select count(*) into saved from public.mw_rundown_change(dimas, jsonb_build_array(
    jsonb_build_object('id', pemaparan, 'version', v2, 'endsAt', '2027-01-05 12:30+07'),
    jsonb_build_object('id', makan, 'version', v_makan, 'startsAt', '2027-01-05 12:30+07', 'endsAt', '2027-01-05 13:30+07')), true);
  if saved <> 2 then raise exception 'both sessions should be saved, got %', saved; end if;
  if (select ends_at from public.mw_sessions where id = pemaparan) <> '2027-01-05 12:30+07' then raise exception 'new end not saved'; end if;
  if (select starts_at from public.mw_sessions where id = makan) <> '2027-01-05 12:30+07' then raise exception 'moved session not saved'; end if;
  if (select changed_by from public.mw_sessions where id = makan) <> dimas or (select changed_at from public.mw_sessions where id = makan) is null then raise exception '"diubah Dimas" not stamped'; end if;
  if (select count(*) from public.mw_rundown_log where session_id in (pemaparan, makan) and notified and changed_by = dimas) <> 2 then raise exception 'each change should be in Riwayat perubahan'; end if;
  if (select changes -> 0 ->> 'field' from public.mw_rundown_log where session_id = pemaparan) <> 'endsAt' then raise exception 'the log should name the field'; end if;
  if (select jsonb_array_length(changes) from public.mw_rundown_log where session_id = makan) <> 2 then raise exception 'start and end of the moved session should be logged'; end if;

  -- A save with the same values is not a change: no log, no version bump.
  select updated_at into v_after from public.mw_sessions where id = pemaparan;
  select count(*) into saved from public.mw_rundown_change(dimas, jsonb_build_array(jsonb_build_object('id', pemaparan, 'version', v_after, 'place', 'Aula Utama')), false);
  if saved <> 0 or (select updated_at from public.mw_sessions where id = pemaparan) <> v_after then raise exception 'an unchanged row should be left alone'; end if;

  -- Pindah tempat, batal, kembali.
  perform * from public.mw_rundown_change(dimas, jsonb_build_array(jsonb_build_object('id', pemaparan, 'version', v_after, 'place', 'Lawn')), false);
  select updated_at into v_after from public.mw_sessions where id = pemaparan;
  perform * from public.mw_rundown_change(dimas, jsonb_build_array(jsonb_build_object('id', pemaparan, 'version', v_after, 'status', 'batal')), true);
  if (select status from public.mw_sessions where id = pemaparan) <> 'batal' then raise exception 'cancel not saved'; end if;
  select updated_at into v_after from public.mw_sessions where id = pemaparan;
  begin
    perform * from public.mw_rundown_change(dimas, jsonb_build_array(jsonb_build_object('id', pemaparan, 'version', v_after, 'status', 'draf')), false);
    raise exception 'UNEXPECTED: back to draft from Rundown live';
  exception when raise_exception then if sqlerrm <> 'RUNDOWN_INVALID' then raise; end if;
  end;
  begin
    perform * from public.mw_rundown_change(dimas, jsonb_build_array(jsonb_build_object('id', draft, 'version', (select updated_at from public.mw_sessions where id = draft), 'place', 'Lawn')), false);
    raise exception 'UNEXPECTED: a draft changed from Rundown live';
  exception when raise_exception then if sqlerrm <> 'RUNDOWN_INVALID' then raise; end if;
  end;
  begin
    perform * from public.mw_rundown_change(dimas, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'version', now())), false);
    raise exception 'UNEXPECTED: an unknown session';
  exception when raise_exception then if sqlerrm <> 'RUNDOWN_GONE' then raise; end if;
  end;
  begin
    perform * from public.mw_rundown_change(dimas, jsonb_build_array(jsonb_build_object('id', makan, 'version', (select updated_at from public.mw_sessions where id = makan), 'endsAt', '2027-01-05 11:00+07')), false);
    raise exception 'UNEXPECTED: an end before the start';
  exception when check_violation then null;
  end;
  begin
    perform * from public.mw_rundown_change(null, jsonb_build_array(jsonb_build_object('id', makan)), false);
    raise exception 'UNEXPECTED: a change without who';
  exception when raise_exception then if sqlerrm <> 'RUNDOWN_INVALID' then raise; end if;
  end;

  -- 3. Moderasi.
  insert into public.mw_photos (owner_id, client_id, file_key, thumb_key, size, width, height, status)
    values (rani, gen_random_uuid(), 'main-wam/momen/' || gen_random_uuid() || '.jpg', null, 1000, 800, 1000, 'ditinjau') returning id into photo;
  insert into public.mw_photos (owner_id, client_id, file_key, size, width, height) values (rani, gen_random_uuid(), 'main-wam/momen/' || gen_random_uuid() || '.jpg', 1000, 800, 1000) returning id into other_photo;
  insert into public.mw_photo_reports (photo_id, reporter_id, reason, created_at) values (photo, dimas, 'tidak_setuju', now() - interval '5 minutes');
  insert into public.mw_photo_reports (photo_id, reporter_id, reason, created_at) values (photo, sari, 'tidak_pantas', now() - interval '4 minutes');

  begin
    perform * from public.mw_moderate_photo(photo, 'sembunyikan', 'tampil', dimas, '');
    raise exception 'UNEXPECTED: a decision on a status the photo no longer has';
  exception when raise_exception then if sqlerrm <> 'PHOTO_HANDLED' then raise; end if;
  end;
  begin
    perform * from public.mw_moderate_photo(other_photo, 'hapus', 'tampil', dimas, '');
    raise exception 'UNEXPECTED: Hapus before it is hidden';
  exception when raise_exception then if sqlerrm <> 'PHOTO_INVALID' then raise; end if;
  end;
  select out_owner into owner_back from public.mw_moderate_photo(photo, 'sembunyikan', 'ditinjau', dimas, 'Tidak pantas · Ada nomor kamar');
  if owner_back <> rani then raise exception 'the owner should come back (for the notice)'; end if;
  if (select status from public.mw_photos where id = photo) <> 'disembunyikan' or (select hidden_by from public.mw_photos where id = photo) <> dimas then raise exception 'photo not hidden by Dimas'; end if;
  if (select reports from public.mw_moderation_log where photo_id = photo and action = 'sembunyikan') <> 2 then raise exception 'the decision should be logged with its reports'; end if;
  -- L8: the reason panitia gave is kept (log and the photo), a long one cut at 300.
  if (select reason from public.mw_moderation_log where photo_id = photo and action = 'sembunyikan') <> 'Tidak pantas · Ada nomor kamar' then raise exception 'the reason should be logged'; end if;
  if (select hidden_reason from public.mw_photos where id = photo) <> 'Tidak pantas · Ada nomor kamar' then raise exception 'the photo should keep why it is hidden'; end if;

  -- Rani's own Tampilkan lagi (as a reporter would) must survive panitia's decision; Sari's own hide too.
  update public.mw_photo_reports set unhidden_at = now() - interval '1 minute' where photo_id = photo and reporter_id = dimas;
  perform * from public.mw_moderate_photo(photo, 'tampilkan', 'disembunyikan', dimas, '');
  if (select status from public.mw_photos where id = photo) <> 'tampil' or (select hidden_by from public.mw_photos where id = photo) is not null then raise exception 'photo not shown again'; end if;
  if (select hidden_reason from public.mw_photos where id = photo) <> '' then raise exception 'shown again: no hidden reason'; end if;
  -- R17: Tampilkan lagi handles the reports through the log: every report is older than the decision
  -- (panitia's queue is empty for it), the reports stay, and each reporter's own choice is untouched.
  if exists (select 1 from public.mw_photo_reports r where r.photo_id = photo
             and r.created_at > (select max(acted_at) from public.mw_moderation_log where photo_id = photo and action in ('sembunyikan', 'tampilkan'))) then
    raise exception 'after Tampilkan lagi no report should be newer than the last decision';
  end if;
  if (select count(*) from public.mw_photo_reports where photo_id = photo) <> 2 then raise exception 'the reports should stay after Tampilkan lagi'; end if;
  if (select unhidden_at from public.mw_photo_reports where photo_id = photo and reporter_id = sari) is not null then raise exception 'a reporter''s own hide is theirs, not panitia''s'; end if;
  if (select unhidden_at from public.mw_photo_reports where photo_id = photo and reporter_id = dimas) is null then raise exception 'a reporter''s own Tampilkan lagi must stay'; end if;
  if (select reason from public.mw_moderation_log where photo_id = photo and action = 'tampilkan') <> '' then raise exception 'Tampilkan lagi has no reason'; end if;
  perform * from public.mw_moderate_photo(photo, 'sembunyikan', 'tampil', dimas, '');
  select out_row into row_back from public.mw_moderate_photo(photo, 'hapus', 'disembunyikan', dimas, '');
  if row_back ->> 'file_key' is null then raise exception 'the storage keys should come back after Hapus'; end if;
  if exists (select 1 from public.mw_photos where id = photo) or exists (select 1 from public.mw_photo_reports where photo_id = photo) then raise exception 'Hapus should delete the photo and its reports'; end if;
  if (select count(*) from public.mw_moderation_log where photo_id = photo) <> 4 then raise exception 'the log should outlive the photo'; end if;
  perform * from public.mw_moderate_photo(other_photo, 'sembunyikan', 'tampil', dimas, repeat('x', 400));
  if (select char_length(reason) from public.mw_moderation_log where photo_id = other_photo) <> 300 then raise exception 'a long reason should be cut at 300'; end if;
  begin
    perform * from public.mw_moderate_photo(photo, 'tampilkan', 'disembunyikan', dimas, '');
    raise exception 'UNEXPECTED: a deleted photo';
  exception when raise_exception then if sqlerrm <> 'PHOTO_GONE' then raise; end if;
  end;
  begin
    perform * from public.mw_moderate_photo(other_photo, 'blokir', 'tampil', dimas, '');
    raise exception 'UNEXPECTED: an unknown action';
  exception when raise_exception then if sqlerrm <> 'PHOTO_INVALID' then raise; end if;
  end;
end;
$$;

-- Nothing for the public roles.
do $$
begin
  if has_table_privilege('anon', 'public.mw_moderation_log', 'select') or has_table_privilege('authenticated', 'public.mw_moderation_log', 'select') then raise exception 'mw_moderation_log must be server only'; end if;
  if has_function_privilege('anon', 'public.mw_rundown_change(uuid, jsonb, boolean)', 'execute') or has_function_privilege('authenticated', 'public.mw_rundown_change(uuid, jsonb, boolean)', 'execute') then raise exception 'mw_rundown_change must be server only'; end if;
  if has_function_privilege('anon', 'public.mw_moderate_photo(uuid, text, text, uuid, text)', 'execute') or has_function_privilege('authenticated', 'public.mw_moderate_photo(uuid, text, text, uuid, text)', 'execute') then raise exception 'mw_moderate_photo must be server only'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.mw_moderation_log'::regclass) then raise exception 'RLS must be on'; end if;
end;
$$;
rollback;
