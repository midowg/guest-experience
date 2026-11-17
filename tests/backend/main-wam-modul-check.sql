-- Execute ONLY against the disposable PostgreSQL migration-check container.
-- Main WAM modul (agen D): the rules of Voting Awarding and Silent Meeting hold in the database by the
-- server's clock (fondasi 202611200003 + 202611200401): no vote outside the window, for oneself or
-- twice; no feedback while a Silent Meeting is not open; one send = one feedback and nothing else;
-- openers once per person while open; closed is final (by panitia, by its end, by a cancelled session)
-- and counted only then; the BOD approve only after voting closes. Nothing here is callable without
-- the service role.
begin;
set local role service_role;
do $$
declare
  rani uuid; sari uuid; dimas uuid; arman uuid;
  sesi_buka uuid; sesi_lalu uuid; sesi_nanti uuid; sesi_draf uuid; photo uuid;
  open_cat uuid; early_cat uuid; closed_cat uuid; hidden_cat uuid; jury_cat uuid; auto_cat uuid;
  sari_nom uuid; dimas_nom uuid; photo_nom uuid; early_nom uuid; closed_nom uuid; hidden_nom uuid; jury_nom uuid; auto_nom uuid;
  sesi_geser uuid; sesi_batal_awal uuid; sesi_batal_jalan uuid;
  q_open uuid; q_past uuid; q_future uuid; q_draft uuid; q_moved uuid; q_cancel_early uuid; q_cancel_running uuid;
  key_rani text := repeat('a1', 32);
  key_sari text := repeat('b2', 32);
  answer text;
  before_ids uuid[];
begin
  insert into public.employees (full_name, nickname) values ('Rani Contoh Modul', 'Rani') returning id into rani;
  insert into public.employees (full_name, nickname) values ('Sari Contoh Modul', 'Sari') returning id into sari;
  insert into public.employees (full_name, nickname) values ('Dimas Contoh Modul', 'Dimas') returning id into dimas;
  insert into public.employees (full_name, nickname) values ('Arman Contoh Modul', 'Arman') returning id into arman;

  insert into public.mw_sessions (title, status, starts_at, ends_at) values ('Berjalan', 'terbit', now() - interval '1 hour', now() + interval '1 hour') returning id into sesi_buka;
  insert into public.mw_sessions (title, status, starts_at, ends_at) values ('Sudah lewat', 'terbit', now() - interval '3 hours', now() - interval '2 hours') returning id into sesi_lalu;
  insert into public.mw_sessions (title, status, starts_at, ends_at) values ('Nanti', 'terbit', now() + interval '2 hours', now() + interval '3 hours') returning id into sesi_nanti;
  insert into public.mw_sessions (title, status, starts_at, ends_at) values ('Draf', 'draf', now() - interval '1 hour', now() + interval '1 hour') returning id into sesi_draf;
  insert into public.mw_sessions (title, status, starts_at, ends_at) values ('Lewat lalu digeser', 'terbit', now() - interval '3 hours', now() - interval '1 hour') returning id into sesi_geser;
  insert into public.mw_sessions (title, status, starts_at, ends_at) values ('Batal sebelum mulai', 'terbit', now() + interval '1 hour', now() + interval '2 hours') returning id into sesi_batal_awal;
  insert into public.mw_sessions (title, status, starts_at, ends_at) values ('Batal saat berjalan', 'terbit', now() - interval '1 hour', now() + interval '1 hour') returning id into sesi_batal_jalan;
  insert into public.mw_photos (owner_id, client_id, file_key, size, width, height)
    values (dimas, gen_random_uuid(), 'main-wam/momen/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg', 400000, 1600, 2000) returning id into photo;

  /* ── Voting Awarding ─────────────────────────────────────────────────────────────────────────── */
  insert into public.mw_award_categories (title, method, opens_at, closes_at, published) values ('Dibuka', 'voting', now() - interval '1 hour', now() + interval '1 hour', true) returning id into open_cat;
  insert into public.mw_award_categories (title, method, opens_at, closes_at, published) values ('Belum dibuka', 'voting', now() + interval '1 hour', now() + interval '2 hours', true) returning id into early_cat;
  insert into public.mw_award_categories (title, method, opens_at, closes_at, published) values ('Sudah ditutup', 'voting', now() - interval '2 hours', now() - interval '1 second', true) returning id into closed_cat;
  insert into public.mw_award_categories (title, method, opens_at, closes_at, published) values ('Belum terbit', 'voting', now() - interval '1 hour', now() + interval '1 hour', false) returning id into hidden_cat;
  insert into public.mw_award_categories (title, method, published) values ('Juri BOD', 'juri', true) returning id into jury_cat;
  insert into public.mw_award_categories (title, method, published) values ('Dihitung otomatis', 'otomatis', true) returning id into auto_cat;
  insert into public.mw_award_nominees (category_id, employee_id) values (open_cat, sari) returning id into sari_nom;
  insert into public.mw_award_nominees (category_id, employee_id) values (open_cat, dimas) returning id into dimas_nom;
  insert into public.mw_award_nominees (category_id, photo_id) values (open_cat, photo) returning id into photo_nom;
  insert into public.mw_award_nominees (category_id, employee_id) values (early_cat, sari) returning id into early_nom;
  insert into public.mw_award_nominees (category_id, employee_id) values (closed_cat, sari) returning id into closed_nom;
  insert into public.mw_award_nominees (category_id, employee_id) values (hidden_cat, sari) returning id into hidden_nom;
  insert into public.mw_award_nominees (category_id, label) values (jury_cat, 'CoE') returning id into jury_nom;
  insert into public.mw_award_nominees (category_id, label) values (auto_cat, 'Kelompok 2 · Kawi') returning id into auto_nom;

  -- In the window: a vote, then a change of mind (still one vote), with the server's time.
  insert into public.mw_award_votes (category_id, voter_id, nominee_id, voted_at) values (open_cat, rani, sari_nom, '2000-01-01');
  if (select voted_at from public.mw_award_votes where category_id = open_cat and voter_id = rani) < now() - interval '1 minute' then
    raise exception 'a vote should carry the server''s time, not the one sent';
  end if;
  insert into public.mw_award_votes (category_id, voter_id, nominee_id) values (open_cat, rani, dimas_nom)
    on conflict (category_id, voter_id) do update set nominee_id = excluded.nominee_id;
  if (select count(*) from public.mw_award_votes where category_id = open_cat and voter_id = rani) <> 1
     or (select nominee_id from public.mw_award_votes where category_id = open_cat and voter_id = rani) <> dimas_nom then
    raise exception 'changing a vote should keep one vote, the new one';
  end if;
  -- Twice in one category.
  begin insert into public.mw_award_votes (category_id, voter_id, nominee_id) values (open_cat, rani, sari_nom); raise exception 'UNEXPECTED: two votes from one person in one category';
  exception when unique_violation then null; end;
  -- For oneself: the person, and the owner of a nominated photo.
  begin insert into public.mw_award_votes (category_id, voter_id, nominee_id) values (open_cat, sari, sari_nom); raise exception 'UNEXPECTED: a vote for oneself';
  exception when raise_exception then if sqlerrm <> 'vote_self' then raise; end if; end;
  begin insert into public.mw_award_votes (category_id, voter_id, nominee_id) values (open_cat, dimas, photo_nom); raise exception 'UNEXPECTED: a vote for one''s own photo';
  exception when raise_exception then if sqlerrm <> 'vote_self' then raise; end if; end;
  insert into public.mw_award_votes (category_id, voter_id, nominee_id) values (open_cat, dimas, sari_nom);
  begin update public.mw_award_votes set nominee_id = dimas_nom where category_id = open_cat and voter_id = dimas; raise exception 'UNEXPECTED: a vote changed to oneself';
  exception when raise_exception then if sqlerrm <> 'vote_self' then raise; end if; end;
  -- Outside the window: before it opens, after it closes, unpublished, not a voting category.
  begin insert into public.mw_award_votes (category_id, voter_id, nominee_id) values (early_cat, rani, early_nom); raise exception 'UNEXPECTED: a vote before the window opens';
  exception when raise_exception then if sqlerrm <> 'vote_closed' then raise; end if; end;
  begin insert into public.mw_award_votes (category_id, voter_id, nominee_id) values (closed_cat, rani, closed_nom); raise exception 'UNEXPECTED: a vote after the window closed';
  exception when raise_exception then if sqlerrm <> 'vote_closed' then raise; end if; end;
  begin insert into public.mw_award_votes (category_id, voter_id, nominee_id) values (hidden_cat, rani, hidden_nom); raise exception 'UNEXPECTED: a vote in an unpublished category';
  exception when raise_exception then if sqlerrm <> 'vote_closed' then raise; end if; end;
  begin insert into public.mw_award_votes (category_id, voter_id, nominee_id) values (jury_cat, rani, jury_nom); raise exception 'UNEXPECTED: a vote in a jury category';
  exception when raise_exception then if sqlerrm <> 'vote_closed' then raise; end if; end;
  begin insert into public.mw_award_votes (category_id, voter_id, nominee_id) values (auto_cat, rani, auto_nom); raise exception 'UNEXPECTED: a vote in a computed category';
  exception when raise_exception then if sqlerrm <> 'vote_closed' then raise; end if; end;
  -- Closing the window locks the votes in it, changes too.
  update public.mw_award_categories set closes_at = now() - interval '1 second', opens_at = now() - interval '2 hours' where id = open_cat;
  begin update public.mw_award_votes set nominee_id = sari_nom where category_id = open_cat and voter_id = rani; raise exception 'UNEXPECTED: a vote changed after closing';
  exception when raise_exception then if sqlerrm <> 'vote_closed' then raise; end if; end;
  begin insert into public.mw_award_votes (category_id, voter_id, nominee_id) values (open_cat, arman, sari_nom); raise exception 'UNEXPECTED: a new vote after closing';
  exception when raise_exception then if sqlerrm <> 'vote_closed' then raise; end if; end;

  -- Approval: a voting category only once closed; jury any time; computed never.
  begin insert into public.mw_award_approvals (category_id, nominee_id, approved_by) values (early_cat, early_nom, arman); raise exception 'UNEXPECTED: approving before voting closed';
  exception when raise_exception then if sqlerrm <> 'approval_open' then raise; end if; end;
  begin insert into public.mw_award_approvals (category_id, nominee_id, approved_by) values (auto_cat, auto_nom, arman); raise exception 'UNEXPECTED: approving a computed category';
  exception when raise_exception then if sqlerrm <> 'approval_auto' then raise; end if; end;
  insert into public.mw_award_approvals (category_id, nominee_id, approved_by, approved_at) values (open_cat, dimas_nom, arman, '2000-01-01');
  if (select approved_at from public.mw_award_approvals where category_id = open_cat) < now() - interval '1 minute' then raise exception 'an approval should carry the server''s time'; end if;
  insert into public.mw_award_approvals (category_id, nominee_id, approved_by) values (jury_cat, jury_nom, arman);
  begin insert into public.mw_award_approvals (category_id, nominee_id, approved_by) values (open_cat, sari_nom, arman); raise exception 'UNEXPECTED: two winners in one category';
  exception when unique_violation then null; end;
  begin insert into public.mw_award_approvals (category_id, nominee_id, approved_by) values (closed_cat, sari_nom, arman); raise exception 'UNEXPECTED: a winner of another category';
  exception when foreign_key_violation then null; end;
  -- Deleting never takes votes or feedback with it (audit M3, M4): a nominated photo stays, a session
  -- with a category or a Silent Meeting is cancelled instead; who approved may leave, the approval stays.
  begin delete from public.mw_photos where id = photo; raise exception 'UNEXPECTED: a nominated photo deleted with its votes';
  exception when foreign_key_violation then null; end;
  update public.mw_award_categories set session_id = sesi_nanti where id = jury_cat;
  begin delete from public.mw_sessions where id = sesi_nanti; raise exception 'UNEXPECTED: a session with an award category deleted';
  exception when foreign_key_violation then null; end;
  delete from public.employees where id = arman;
  if (select count(*) from public.mw_award_approvals where category_id in (open_cat, jury_cat) and approved_by is null) <> 2 then
    raise exception 'an approval should stay when its approver is removed';
  end if;

  /* ── Silent Meeting ──────────────────────────────────────────────────────────────────────────── */
  insert into public.mw_silent_questions (session_id, question) values (sesi_buka, 'Apa yang perlu kita ubah tahun depan?') returning id into q_open;
  insert into public.mw_silent_questions (session_id, question) values (sesi_lalu, 'Pertanyaan sesi yang sudah lewat') returning id into q_past;
  insert into public.mw_silent_questions (session_id, question) values (sesi_nanti, 'Pertanyaan sesi nanti') returning id into q_future;
  insert into public.mw_silent_questions (session_id, question) values (sesi_draf, 'Pertanyaan sesi draf') returning id into q_draft;
  insert into public.mw_silent_questions (session_id, question) values (sesi_geser, 'Pertanyaan sesi yang digeser') returning id into q_moved;
  insert into public.mw_silent_questions (session_id, question) values (sesi_batal_awal, 'Pertanyaan sesi yang batal lebih awal') returning id into q_cancel_early;
  insert into public.mw_silent_questions (session_id, question) values (sesi_batal_jalan, 'Pertanyaan sesi yang batal saat berjalan') returning id into q_cancel_running;

  -- Open with its session's hours: a send stores the feedback alone (no person, no count).
  answer := public.mw_silent_send(q_open, 'Cara kerja', 'Rapat mingguan terlalu panjang.');
  if answer <> 'ok' then raise exception 'a send while open should answer ok, got %', answer; end if;
  perform public.mw_silent_send(q_open, '', 'Satu kanal resmi untuk info proyek.');
  perform public.mw_silent_send(q_open, 'Komunikasi', 'Info datang mendadak.');
  if (select count(*) from public.mw_silent_feedback where question_id = q_open) <> 3 then raise exception 'three sends should store three feedbacks'; end if;
  if exists (select 1 from public.mw_silent_openers where question_id = q_open) then raise exception 'a send should write no row about its sender'; end if;
  if exists (select 1 from pg_proc where proname = 'mw_silent_send' and pronargs <> 3) then raise exception 'a send should take no person (question, topic, text only)'; end if;
  -- Refused sends answer a word, never an error (nothing with the text reaches the log), and store nothing.
  if public.mw_silent_send(q_open, 'Gaji direksi', 'Topik asing.') <> 'topic' then raise exception 'an unknown topic should be refused'; end if;
  if public.mw_silent_send(q_open, '', '   ') <> 'invalid' then raise exception 'empty feedback should be refused'; end if;
  if public.mw_silent_send(gen_random_uuid(), '', 'Pertanyaan lain.') <> 'unknown' then raise exception 'an unknown question should be refused'; end if;
  if public.mw_silent_send(q_future, '', 'Terlalu awal.') <> 'closed' then raise exception 'feedback before it opens should be refused'; end if;
  if public.mw_silent_send(q_past, '', 'Terlambat.') <> 'closed' then raise exception 'feedback after it closed should be refused'; end if;
  if public.mw_silent_send(q_draft, '', 'Sesi draf.') <> 'closed' then raise exception 'feedback in a draft session should be refused'; end if;
  begin insert into public.mw_silent_feedback (question_id, body) values (q_past, 'Langsung ke tabel, terlambat.'); raise exception 'UNEXPECTED: feedback after it closed (direct)';
  exception when raise_exception then if sqlerrm <> 'silent_closed' then raise; end if; end;
  if (select count(*) from public.mw_silent_feedback where question_id in (q_open, q_past, q_future, q_draft)) <> 3 then raise exception 'refused sends should leave no feedback'; end if;

  -- Openers: once per person per question, only while open, only a keyed hash.
  if public.mw_silent_open(q_open, key_rani) <> 'ok' or public.mw_silent_open(q_open, key_rani) <> 'ok' or public.mw_silent_open(q_open, key_sari) <> 'ok' then
    raise exception 'opening the form while open should be recorded';
  end if;
  if (select count(*) from public.mw_silent_openers where question_id = q_open) <> 2 then raise exception 'each person should count once as an opener'; end if;
  if public.mw_silent_open(q_future, key_rani) <> 'closed' or public.mw_silent_open(q_past, key_rani) <> 'closed' then raise exception 'an opener only while open'; end if;
  if public.mw_silent_open(q_open, 'rani') <> 'invalid' then raise exception 'an opener key that is not a keyed hash should be refused'; end if;

  -- No count of an open Silent Meeting leaves the database.
  if exists (select 1 from public.mw_silent_results() r where r.question_id in (q_open, q_future, q_draft)) then raise exception 'no count of a question that is not closed'; end if;

  -- Panitia opens one early ("Buka sekarang"), once; a closed one never.
  if public.mw_silent_control(q_future, 'buka', dimas) <> 'opened' then raise exception 'panitia should open it before its start'; end if;
  if public.mw_silent_control(q_future, 'buka', dimas) <> 'already_open' then raise exception 'opening twice should say it is open'; end if;
  if public.mw_silent_send(q_future, '', 'Dibuka lebih awal.') <> 'ok' then raise exception 'feedback once opened early should be stored'; end if;
  if public.mw_silent_control(q_past, 'buka', dimas) <> 'final' then raise exception 'a Silent Meeting closed by its end should never open again'; end if;
  if public.mw_silent_control(q_draft, 'buka', dimas) <> 'unknown' then raise exception 'a draft session''s Silent Meeting should not open'; end if;
  if public.mw_silent_control(q_draft, 'tutup', dimas) <> 'not_open' then raise exception 'closing one that is not open should say so'; end if;
  begin update public.mw_silent_questions set opened_at = now(), opened_by = dimas where id = q_past; raise exception 'UNEXPECTED: opened after it closed';
  exception when raise_exception then if sqlerrm <> 'silent_final' then raise; end if; end;
  begin update public.mw_silent_questions set session_id = sesi_nanti where id = q_open; raise exception 'UNEXPECTED: an open question moved to another session';
  exception when raise_exception then if sqlerrm <> 'silent_locked' then raise; end if; end;

  -- Panitia closes it ("Tutup sekarang"): final. Then buka is refused, by the function and by the table.
  select array_agg(id) into before_ids from public.mw_silent_feedback where question_id = q_open;
  if public.mw_silent_control(q_open, 'tutup', dimas) <> 'closed' then raise exception 'panitia should close an open Silent Meeting'; end if;
  if public.mw_silent_send(q_open, '', 'Ditutup panitia.') <> 'closed' then raise exception 'feedback after panitia closed it should be refused'; end if;
  if public.mw_silent_control(q_open, 'buka', dimas) <> 'final' then raise exception 'UNEXPECTED: a closed Silent Meeting opened again'; end if;
  if public.mw_silent_control(q_open, 'tutup', dimas) <> 'final' then raise exception 'closing twice should say it is closed'; end if;
  begin update public.mw_silent_questions set closed_at = null, closed_by = null where id = q_open; raise exception 'UNEXPECTED: a close undone';
  exception when raise_exception then if sqlerrm <> 'silent_final' then raise; end if; end;
  -- Its session moved later: still closed.
  update public.mw_sessions set ends_at = now() + interval '5 hours' where id = sesi_buka;
  if public.mw_silent_send(q_open, '', 'Sesi diperpanjang.') <> 'closed' then raise exception 'moving the session should not open a closed Silent Meeting'; end if;
  -- Closed for good: counted once, shuffled (new ids), and the openers forgotten.
  if (select feedback_count from public.mw_silent_questions where id = q_open) <> 3 or (select opener_count from public.mw_silent_questions where id = q_open) <> 2 then
    raise exception 'closing should keep 3 feedbacks and 2 openers on the question';
  end if;
  if exists (select 1 from public.mw_silent_openers where question_id = q_open) then raise exception 'openers should be deleted once closed for good'; end if;
  if (select count(*) from public.mw_silent_feedback where question_id = q_open) <> 3 then raise exception 'the shuffle should keep every feedback'; end if;
  if exists (select 1 from public.mw_silent_feedback where question_id = q_open and id = any (before_ids)) then raise exception 'the shuffle should give every feedback a new id'; end if;
  begin update public.mw_silent_questions set feedback_count = 99 where id = q_open; raise exception 'UNEXPECTED: a final count changed';
  exception when raise_exception then if sqlerrm <> 'silent_final' then raise; end if; end;

  -- Closed by its end, then its session moved later: the close is stamped first, so it stays closed.
  update public.mw_sessions set starts_at = now() - interval '30 minutes', ends_at = now() + interval '2 hours' where id = sesi_geser;
  if (select closed_at from public.mw_silent_questions where id = q_moved) is null then raise exception 'moving a session past its close should stamp the close'; end if;
  if public.mw_silent_send(q_moved, '', 'Setelah digeser.') <> 'closed' then raise exception 'UNEXPECTED: a Silent Meeting closed by its end opened again'; end if;
  -- Cancelled while running, then put back: stays closed. Cancelled before it ever opened: opens again normally.
  update public.mw_sessions set status = 'batal' where id = sesi_batal_jalan;
  update public.mw_sessions set status = 'terbit' where id = sesi_batal_jalan;
  if public.mw_silent_send(q_cancel_running, '', 'Setelah batal.') <> 'closed' then raise exception 'UNEXPECTED: cancelled while running, then opened again'; end if;
  update public.mw_sessions set status = 'batal' where id = sesi_batal_awal;
  if exists (select 1 from public.mw_silent_results() r where r.question_id = q_cancel_early) then raise exception 'a Silent Meeting cancelled before it opened has nothing to count'; end if;
  update public.mw_sessions set status = 'terbit' where id = sesi_batal_awal;
  if public.mw_silent_control(q_cancel_early, 'buka', dimas) <> 'opened' then raise exception 'cancelled before it opened, then put back: it should still open'; end if;

  begin delete from public.mw_sessions where id = sesi_draf; raise exception 'UNEXPECTED: a session with a Silent Meeting deleted with its feedback';
  exception when foreign_key_violation then null; end;

  -- The counts of closed questions only.
  if (select count(*) from public.mw_silent_results() r where r.question_id in (q_open, q_past, q_moved, q_cancel_running)) <> 4 then raise exception 'every closed question should have its count'; end if;
  if exists (select 1 from public.mw_silent_results() r where r.question_id in (q_future, q_draft, q_cancel_early)) then raise exception 'no count of a question that is not closed'; end if;

  raise notice 'PASS: Main WAM modul: votes and Silent Meeting feedback follow their windows in the database';
end $$;
reset role;

set local role anon;
do $$
begin
  begin perform public.mw_silent_send(gen_random_uuid(), '', 'x'); raise exception 'UNEXPECTED: anon sends Silent Meeting feedback';
  exception when insufficient_privilege then null; end;
  begin perform public.mw_silent_open(gen_random_uuid(), repeat('a1', 32)); raise exception 'UNEXPECTED: anon records an opener';
  exception when insufficient_privilege then null; end;
  begin perform public.mw_silent_control(gen_random_uuid(), 'buka', null); raise exception 'UNEXPECTED: anon opens a Silent Meeting';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.mw_silent_results(); raise exception 'UNEXPECTED: anon reads Silent Meeting counts';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.mw_award_votes limit 1; raise exception 'UNEXPECTED: anon reads votes';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: Main WAM modul is server only for anon';
end $$;
reset role;

set local role authenticated;
do $$
begin
  begin perform public.mw_silent_send(gen_random_uuid(), '', 'x'); raise exception 'UNEXPECTED: a signed-in user sends Silent Meeting feedback directly';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.mw_silent_results(); raise exception 'UNEXPECTED: a signed-in user reads Silent Meeting counts';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.mw_silent_feedback limit 1; raise exception 'UNEXPECTED: a signed-in user reads feedback';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: Main WAM modul is server only for authenticated';
end $$;
reset role;
rollback;
