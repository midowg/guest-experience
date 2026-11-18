-- Execute ONLY against the disposable PostgreSQL migration-check container.
-- Migrations 202611200001–0003: Main WAM's tables. One settings row; the rundown's rules (a meal
-- takes no check-in, wajib needs absen); one kelompok and one kelompok kegiatan per person per
-- session; photos for a kelompok carry it and are kept once per phone id; a vote's nominee belongs
-- to its category; Silent Meeting feedback stores no person and closed is final; nothing is readable but by the server.
begin;
set local role service_role;
do $$
declare
  rani uuid; sari uuid; dimas uuid; arman uuid;
  pemaparan uuid; makan uuid; team uuid; g4 uuid; g2 uuid; pos2 uuid; pos3 uuid;
  photo uuid; category uuid; other_category uuid; nominee uuid; other_nominee uuid; q uuid; ann uuid;
begin
  insert into public.employees (full_name, nickname) values ('Rani Contoh Main', 'Rani') returning id into rani;
  insert into public.employees (full_name, nickname) values ('Sari Contoh Main', 'Sari') returning id into sari;
  insert into public.employees (full_name, nickname) values ('Dimas Contoh Main', 'Dimas') returning id into dimas;
  insert into public.employees (full_name, nickname) values ('Arman Contoh Main', 'Arman') returning id into arman;

  -- Settings: one row, made by the migration, mode pra.
  if (select count(*) from public.mw_settings) <> 1 or (select mode from public.mw_settings) <> 'pra' then raise exception 'settings should start as one row in mode pra'; end if;
  begin insert into public.mw_settings (id) values (true); raise exception 'UNEXPECTED: a second settings row';
  exception when unique_violation then null; end;
  begin insert into public.mw_settings (id) values (false); raise exception 'UNEXPECTED: a settings row other than the one';
  exception when check_violation then null; end;
  begin update public.mw_settings set mode = 'buka'; raise exception 'UNEXPECTED: unknown mode';
  exception when check_violation then null; end;
  begin update public.mw_settings set modules = '[]'::jsonb; raise exception 'UNEXPECTED: modules not an object';
  exception when check_violation then null; end;
  update public.mw_settings set mode = 'uji', modules = '{"absen": true, "mozaik": true}', theme = '{"colors": {"accent": "#1E3A5F"}}', updated_at = now();
  insert into public.mw_testers (employee_id, added_by) values (sari, 'Admin Contoh');
  begin insert into public.mw_testers (employee_id) values (sari); raise exception 'UNEXPECTED: a penguji twice';
  exception when unique_violation then null; end;

  -- Rundown.
  insert into public.mw_sessions (title, kind, status, starts_at, ends_at, place, uses_attendance, required)
    values ('Pemaparan departemen', 'sesi', 'terbit', '2027-01-05 08:00+07', '2027-01-05 12:00+07', 'Aula Utama', true, true) returning id into pemaparan;
  insert into public.mw_sessions (title, kind, status, starts_at, ends_at) values ('Makan siang', 'makan', 'terbit', '2027-01-05 12:00+07', '2027-01-05 13:00+07') returning id into makan;
  insert into public.mw_sessions (title, status, starts_at) values ('Team building', 'terbit', '2027-01-05 15:00+07') returning id into team;
  begin insert into public.mw_sessions (title, kind, starts_at, uses_attendance) values ('Sarapan', 'makan', '2027-01-05 07:00+07', true); raise exception 'UNEXPECTED: a meal with check-in';
  exception when check_violation then null; end;
  begin insert into public.mw_sessions (title, starts_at, required) values ('Wajib tanpa absen', '2027-01-05 07:00+07', true); raise exception 'UNEXPECTED: wajib without absen';
  exception when check_violation then null; end;
  begin insert into public.mw_sessions (title, starts_at, ends_at) values ('Terbalik', '2027-01-05 10:00+07', '2027-01-05 09:00+07'); raise exception 'UNEXPECTED: ends before it starts';
  exception when check_violation then null; end;
  begin insert into public.mw_sessions (title, starts_at, module) values ('Modul asing', '2027-01-05 10:00+07', 'komitmen'); raise exception 'UNEXPECTED: unknown module';
  exception when check_violation then null; end;
  begin update public.mw_sessions set lineup = '{}'::jsonb where id = pemaparan; raise exception 'UNEXPECTED: lineup not a list';
  exception when check_violation then null; end;
  insert into public.mw_rundown_log (session_id, changes, notified, recipients, changed_by)
    values (pemaparan, '[{"field": "endsAt", "from": "2027-01-05T05:00:00Z", "to": "2027-01-05T05:30:00Z"}]', true, 122, dimas);
  begin insert into public.mw_rundown_log (session_id, changes) values (pemaparan, '[]'); raise exception 'UNEXPECTED: a log entry without a change';
  exception when check_violation then null; end;

  -- Attendance: once per person; manual names who recorded it.
  insert into public.mw_attendance (session_id, employee_id, method) values (pemaparan, rani, 'qr');
  begin insert into public.mw_attendance (session_id, employee_id, method) values (pemaparan, rani, 'qr'); raise exception 'UNEXPECTED: checked in twice';
  exception when unique_violation then null; end;
  begin insert into public.mw_attendance (session_id, employee_id, method) values (pemaparan, sari, 'manual'); raise exception 'UNEXPECTED: manual without who';
  exception when check_violation then null; end;
  insert into public.mw_attendance (session_id, employee_id, method, recorded_by) values (pemaparan, sari, 'manual', dimas);

  -- Kelompok: one per person, one koordinator.
  insert into public.mw_groups (number, name) values (4, 'Arjuno') returning id into g4;
  insert into public.mw_groups (number, name) values (2, 'Kawi') returning id into g2;
  insert into public.mw_group_members (group_id, employee_id, coordinator) values (g4, rani, true), (g4, sari, false);
  begin insert into public.mw_group_members (group_id, employee_id) values (g2, rani); raise exception 'UNEXPECTED: two kelompok for one person';
  exception when unique_violation then null; end;
  begin update public.mw_group_members set coordinator = true where employee_id = sari; raise exception 'UNEXPECTED: two koordinator';
  exception when unique_violation then null; end;

  -- Kelompok kegiatan: one per person per session.
  insert into public.mw_activity_groups (session_id, kind, label) values (team, 'pos', 'Pos 2') returning id into pos2;
  insert into public.mw_activity_groups (session_id, kind, label) values (team, 'pos', 'Pos 3') returning id into pos3;
  insert into public.mw_activity_group_members (activity_group_id, session_id, employee_id) values (pos2, team, rani);
  begin insert into public.mw_activity_group_members (activity_group_id, session_id, employee_id) values (pos3, team, rani); raise exception 'UNEXPECTED: two posts in one session';
  exception when unique_violation then null; end;
  begin insert into public.mw_activity_group_members (activity_group_id, session_id, employee_id) values (pos3, pemaparan, sari); raise exception 'UNEXPECTED: a member under the wrong session';
  exception when foreign_key_violation then null; end;

  -- Perjalanan.
  insert into public.mw_trips (direction, kind, title, place, distance_km) values ('berangkat', 'kereta', 'Kereta', 'Yogyakarta → Malang', 350);
  begin insert into public.mw_trips (direction, title, map_url) values ('berangkat', 'Peta', 'http://maps.example'); raise exception 'UNEXPECTED: a map link without https';
  exception when check_violation then null; end;
  begin insert into public.mw_trips (direction, title) values ('mampir', 'Arah asing'); raise exception 'UNEXPECTED: unknown direction';
  exception when check_violation then null; end;

  -- Panduan: a file has its type and size.
  insert into public.mw_guides (slug, kind, title, published) values ('denah-venue', 'denah', 'Denah venue', true);
  begin insert into public.mw_guides (slug, title, file_key) values ('tanpa-jenis', 'Berkas', 'main-wam/panduan/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pdf'); raise exception 'UNEXPECTED: a file without its type';
  exception when check_violation then null; end;
  begin insert into public.mw_guides (slug, title) values ('Bukan Slug', 'Judul'); raise exception 'UNEXPECTED: a slug with capitals and a space';
  exception when check_violation then null; end;

  -- Notes on WAM's inbox.
  insert into public.pw_announcements (event_id, kind, title, body, created_by)
    select id, 'pengumuman', 'Team building mulai 15.00 di Lawn', 'Pakai kaos tim.', dimas from public.pw_events where kind = 'wam' returning id into ann;
  insert into public.mw_notes (announcement_id, kind, link, pinned_until, audience) values (ann, 'pengumuman', '/wam/acara', '2027-01-05 15:00+07', '{"type": "semua"}');
  begin update public.mw_notes set link = '/wam/book' where announcement_id = ann; raise exception 'UNEXPECTED: a link outside Main WAM';
  exception when check_violation then null; end;
  begin update public.mw_notes set audience = '{"semua": true}' where announcement_id = ann; raise exception 'UNEXPECTED: an audience without its type';
  exception when check_violation then null; end;
  delete from public.pw_announcements where id = ann;
  if exists (select 1 from public.mw_notes where announcement_id = ann) then raise exception 'a note should leave with its announcement'; end if;

  -- Momen.
  insert into public.mw_photos (owner_id, client_id, audience, group_id, session_id, file_key, size, width, height)
    values (rani, '11111111-1111-4111-8111-111111111111', 'kelompok', g4, team, 'main-wam/momen/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg', 400000, 1600, 2000) returning id into photo;
  if (select visible_at - created_at from public.mw_photos where id = photo) <> interval '5 seconds' then raise exception 'a photo should show 5 seconds after it is sent'; end if;
  begin insert into public.mw_photos (owner_id, client_id, file_key, size, width, height) values (rani, '11111111-1111-4111-8111-111111111111', 'main-wam/momen/aaaaaaaa-bbbb-4ccc-8ddd-000000000000.jpg', 1, 1, 1); raise exception 'UNEXPECTED: the same phone photo twice';
  exception when unique_violation then null; end;
  begin insert into public.mw_photos (owner_id, client_id, audience, file_key, size, width, height) values (sari, gen_random_uuid(), 'kelompok', 'main-wam/momen/aaaaaaaa-bbbb-4ccc-8ddd-111111111111.jpg', 1, 1, 1); raise exception 'UNEXPECTED: a kelompok photo without its kelompok';
  exception when check_violation then null; end;
  begin insert into public.mw_photos (owner_id, client_id, file_key, size, width, height) values (sari, gen_random_uuid(), 'pra-wam/mom/x.jpg', 1, 1, 1); raise exception 'UNEXPECTED: a key outside main-wam/momen';
  exception when check_violation then null; end;
  begin delete from public.mw_groups where id = g4; raise exception 'UNEXPECTED: a kelompok with photos deleted';
  exception when foreign_key_violation then null; end;
  delete from public.mw_sessions where id = team;
  if (select session_id from public.mw_photos where id = photo) is not null then raise exception 'a deleted session should leave its photos Umum'; end if;
  insert into public.mw_photo_hearts (photo_id, employee_id) values (photo, sari);
  begin insert into public.mw_photo_hearts (photo_id, employee_id) values (photo, sari); raise exception 'UNEXPECTED: two hearts from one person';
  exception when unique_violation then null; end;
  begin insert into public.mw_photo_reports (photo_id, reporter_id, reason) values (photo, sari, 'lainnya'); raise exception 'UNEXPECTED: Lainnya without a note';
  exception when check_violation then null; end;
  insert into public.mw_photo_reports (photo_id, reporter_id, reason) values (photo, sari, 'tidak_setuju');
  insert into public.mw_photo_seen (photo_id, employee_id) values (photo, sari);
  insert into public.mw_mosaic_tiles (tile, photo_id) values (0, photo);
  begin insert into public.mw_mosaic_tiles (tile, photo_id) values (1, photo); raise exception 'UNEXPECTED: one photo in two tiles';
  exception when unique_violation then null; end;

  -- Awarding.
  insert into public.mw_award_categories (title, method, opens_at, closes_at, published) values ('Rekan paling suportif', 'voting', now() - interval '1 hour', now() + interval '1 hour', true) returning id into category;
  insert into public.mw_award_categories (title, method) values ('Departemen paling berdampak', 'juri') returning id into other_category;
  begin insert into public.mw_award_categories (title, method, published) values ('Tanpa jadwal', 'voting', true); raise exception 'UNEXPECTED: a published vote without its window';
  exception when check_violation then null; end;
  insert into public.mw_award_nominees (category_id, employee_id, reason) values (category, sari, 'Selalu sigap membantu.') returning id into nominee;
  insert into public.mw_award_nominees (category_id, label) values (other_category, 'CoE') returning id into other_nominee;
  begin insert into public.mw_award_nominees (category_id, employee_id) values (category, sari); raise exception 'UNEXPECTED: one person nominated twice';
  exception when unique_violation then null; end;
  begin insert into public.mw_award_nominees (category_id) values (category); raise exception 'UNEXPECTED: a nominee without anyone';
  exception when check_violation then null; end;
  insert into public.mw_award_votes (category_id, voter_id, nominee_id) values (category, rani, nominee);
  begin insert into public.mw_award_votes (category_id, voter_id, nominee_id) values (category, rani, nominee); raise exception 'UNEXPECTED: two votes in one category';
  exception when unique_violation then null; end;
  begin insert into public.mw_award_votes (category_id, voter_id, nominee_id) values (category, sari, other_nominee); raise exception 'UNEXPECTED: a vote for a nominee of another category';
  exception when foreign_key_violation then null; end;
  -- Never for oneself (Sari votes for Sari), and never outside the window or in a category that is not voted.
  begin insert into public.mw_award_votes (category_id, voter_id, nominee_id) values (category, sari, nominee); raise exception 'UNEXPECTED: a vote for oneself';
  exception when raise_exception then if sqlerrm <> 'vote_self' then raise; end if; end;
  begin insert into public.mw_award_votes (category_id, voter_id, nominee_id) values (other_category, rani, other_nominee); raise exception 'UNEXPECTED: a vote in a jury category';
  exception when raise_exception then if sqlerrm <> 'vote_closed' then raise; end if; end;
  update public.mw_award_categories set closes_at = now() - interval '1 minute', opens_at = now() - interval '2 hours' where id = category;
  begin update public.mw_award_votes set voted_at = now() where category_id = category and voter_id = rani; raise exception 'UNEXPECTED: a vote changed after closing';
  exception when raise_exception then if sqlerrm <> 'vote_closed' then raise; end if; end;
  insert into public.mw_award_approvals (category_id, nominee_id, approved_by) values (category, nominee, arman);

  -- Silent Meeting: one question per session; feedback and openers without a person or a time;
  -- panitia's opening and closing each once, and closed is final.
  insert into public.mw_silent_questions (session_id, question) values (pemaparan, 'Apa yang perlu kita ubah tahun depan?') returning id into q;
  begin insert into public.mw_silent_questions (session_id, question) values (pemaparan, 'Pertanyaan kedua di sesi yang sama'); raise exception 'UNEXPECTED: two questions in one session';
  exception when unique_violation then null; end;
  begin update public.mw_silent_questions set opened_by = dimas where id = q; raise exception 'UNEXPECTED: who opened it without when';
  exception when check_violation then null; end;
  begin update public.mw_silent_questions set feedback_count = 3 where id = q; raise exception 'UNEXPECTED: a count before it closed';
  exception when check_violation then null; end;
  -- Its session is in 2027: not open yet, so no feedback and no opener.
  begin insert into public.mw_silent_feedback (question_id, body) values (q, 'Terlalu awal.'); raise exception 'UNEXPECTED: feedback before it opens';
  exception when raise_exception then if sqlerrm <> 'silent_closed' then raise; end if; end;
  begin insert into public.mw_silent_openers (question_id, opener_key) values (q, repeat('ab', 32)); raise exception 'UNEXPECTED: an opener before it opens';
  exception when raise_exception then if sqlerrm <> 'silent_closed' then raise; end if; end;
  -- Panitia opens it now ("Buka sekarang"), once.
  update public.mw_silent_questions set opened_at = now(), opened_by = dimas where id = q;
  insert into public.mw_silent_feedback (question_id, topic, body) values (q, 'Cara kerja', 'Rapat mingguan terlalu panjang.');
  insert into public.mw_silent_openers (question_id, opener_key) values (q, repeat('ab', 32));
  begin insert into public.mw_silent_openers (question_id, opener_key) values (q, 'rani'); raise exception 'UNEXPECTED: an opener key that is not a keyed hash';
  exception when check_violation then null; end;
  begin insert into public.mw_silent_feedback (question_id, body) values (q, '   '); raise exception 'UNEXPECTED: empty feedback';
  exception when check_violation then null; end;
  begin update public.mw_silent_questions set opened_at = null, opened_by = null where id = q; raise exception 'UNEXPECTED: an early opening undone';
  exception when raise_exception then if sqlerrm <> 'silent_final' then raise; end if; end;
  begin update public.mw_silent_questions set question = 'Pertanyaan lain setelah dibuka' where id = q; raise exception 'UNEXPECTED: the question changed once open';
  exception when raise_exception then if sqlerrm <> 'silent_locked' then raise; end if; end;
  -- Closed by panitia: no more feedback, and it never opens again.
  update public.mw_silent_questions set closed_at = now(), closed_by = dimas where id = q;
  begin insert into public.mw_silent_feedback (question_id, body) values (q, 'Terlambat.'); raise exception 'UNEXPECTED: feedback after closing';
  exception when raise_exception then if sqlerrm <> 'silent_closed' then raise; end if; end;
  begin update public.mw_silent_questions set closed_at = null, closed_by = null where id = q; raise exception 'UNEXPECTED: a closed Silent Meeting opened again';
  exception when raise_exception then if sqlerrm <> 'silent_final' then raise; end if; end;
  begin insert into public.mw_silent_openers (question_id, opener_key) values (q, repeat('cd', 32)); raise exception 'UNEXPECTED: an opener after closing';
  exception when raise_exception then if sqlerrm <> 'silent_closed' then raise; end if; end;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'mw_silent_feedback'
    and column_name not in ('id', 'question_id', 'topic', 'body')) then raise exception 'Silent Meeting feedback should store no person, device or time'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'mw_silent_openers'
    and column_name not in ('question_id', 'opener_key')) then raise exception 'Silent Meeting openers should store no person or time'; end if;
  if to_regclass('public.mw_silent_participation') is not null then raise exception 'no count per sender should be kept'; end if;

  raise notice 'PASS: Main WAM settings, rundown, kelompok, perjalanan, panduan, notes, Momen, Awarding and Silent Meeting hold their rules';
end $$;
reset role;

set local role anon;
do $$
declare t text;
begin
  foreach t in array array['mw_settings', 'mw_testers', 'mw_sessions', 'mw_attendance', 'mw_groups', 'mw_photos', 'mw_award_votes', 'mw_silent_feedback', 'mw_notes'] loop
    begin execute format('select 1 from public.%I limit 1', t); raise exception 'UNEXPECTED: anon read %', t;
    exception when insufficient_privilege then null; end;
  end loop;
  raise notice 'PASS: Main WAM is server only for anon';
end $$;
reset role;

set local role authenticated;
do $$
declare t text;
begin
  foreach t in array array['mw_settings', 'mw_guides', 'mw_trips', 'mw_photos', 'mw_photo_reports', 'mw_award_categories', 'mw_silent_questions'] loop
    begin execute format('select 1 from public.%I limit 1', t); raise exception 'UNEXPECTED: authenticated read %', t;
    exception when insufficient_privilege then null; end;
  end loop;
  raise notice 'PASS: Main WAM is server only for authenticated';
end $$;
reset role;
-- Audit L1: every foreign key of a fondasi table (0001, 0002) has an index led by its column, and
-- removing a panitia who recorded a manual check-in keeps the check-in (recorded_by set null).
do $$
declare missing text; checked int;
begin
  select string_agg(format('%s.%s', c.conrelid::regclass, a.attname), ', ') filter (where not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])),
    count(*) into missing, checked
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f' and array_length(c.conkey, 1) = 1
    and c.conrelid::regclass::text in ('mw_testers', 'mw_guides', 'mw_sessions', 'mw_rundown_log', 'mw_attendance', 'mw_groups', 'mw_group_members',
      'mw_activity_groups', 'mw_activity_group_members', 'mw_stay_room_details', 'mw_trips', 'mw_trip_seats', 'mw_notes',
      'mw_photos', 'mw_photo_hearts', 'mw_photo_reactions', 'mw_photo_reports', 'mw_photo_seen', 'mw_mosaic_tiles');
  if checked < 30 then raise exception 'the foreign key check looked at % keys only', checked; end if;
  if missing is not null then raise exception 'foreign keys without an index: %', missing; end if;
  if (select confdeltype from pg_constraint where conrelid = 'public.mw_attendance'::regclass and contype = 'f'
      and conkey = array[(select attnum from pg_attribute where attrelid = 'public.mw_attendance'::regclass and attname = 'recorded_by')]) <> 'n' then
    raise exception 'mw_attendance.recorded_by should be on delete set null';
  end if;
  raise notice 'PASS: fondasi foreign keys are indexed; recorded_by is set null';
end $$;

set local role service_role;
do $$
declare s uuid; rani uuid; dimas uuid;
begin
  insert into public.employees (full_name, nickname) values ('Rani L1', 'Rani') returning id into rani;
  insert into public.employees (full_name, nickname) values ('Dimas L1', 'Dimas') returning id into dimas;
  insert into public.mw_sessions (title, status, starts_at, uses_attendance) values ('Sesi L1', 'terbit', '2027-01-05 08:00+07', true) returning id into s;
  insert into public.mw_attendance (session_id, employee_id, method, recorded_by) values (s, rani, 'manual', dimas);
  begin insert into public.mw_attendance (session_id, employee_id, method, recorded_by) values (s, dimas, 'qr', rani); raise exception 'UNEXPECTED: a QR check-in with a recorder';
  exception when check_violation then null; end;
  delete from public.employees where id = dimas;
  if (select recorded_by from public.mw_attendance where session_id = s and employee_id = rani) is not null
    or not exists (select 1 from public.mw_attendance where session_id = s and employee_id = rani and method = 'manual') then
    raise exception 'the manual check-in should stay, without its recorder';
  end if;
  raise notice 'PASS: removing who recorded a manual check-in keeps the check-in';
end $$;
reset role;

-- Row level security is on for every Main WAM table.
do $$ begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'mw\_%' and not c.relrowsecurity) then
    raise exception 'a Main WAM table without row level security';
  end if;
  raise notice 'PASS: row level security on every mw_ table';
end $$;

rollback;
