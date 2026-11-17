-- Execute ONLY against the disposable PostgreSQL migration-check container.
-- Main WAM modul (agen D): the rules of Voting Awarding and Silent Meeting hold in the database by the
-- server's clock (fondasi 202611200003 + 202611200401): no vote outside the window, for oneself or
-- twice; no feedback while a Silent Meeting is not open; one send = one feedback + one count with a
-- cap; the BOD approve only after voting closes. Nothing here is callable without the service role.
begin;
set local role service_role;
do $$
declare
  rani uuid; sari uuid; dimas uuid; arman uuid;
  sesi_buka uuid; sesi_lalu uuid; sesi_nanti uuid; sesi_draf uuid; photo uuid;
  open_cat uuid; early_cat uuid; closed_cat uuid; hidden_cat uuid; jury_cat uuid; auto_cat uuid;
  sari_nom uuid; dimas_nom uuid; photo_nom uuid; early_nom uuid; closed_nom uuid; hidden_nom uuid; jury_nom uuid; auto_nom uuid;
  q_open uuid; q_past uuid; q_future uuid; q_draft uuid; q_kept uuid;
  key_rani text := repeat('a1', 32);
  key_sari text := repeat('b2', 32);
  n integer;
begin
  insert into public.employees (full_name, nickname) values ('Rani Contoh Modul', 'Rani') returning id into rani;
  insert into public.employees (full_name, nickname) values ('Sari Contoh Modul', 'Sari') returning id into sari;
  insert into public.employees (full_name, nickname) values ('Dimas Contoh Modul', 'Dimas') returning id into dimas;
  insert into public.employees (full_name, nickname) values ('Arman Contoh Modul', 'Arman') returning id into arman;

  insert into public.mw_sessions (title, status, starts_at, ends_at) values ('Berjalan', 'terbit', now() - interval '1 hour', now() + interval '1 hour') returning id into sesi_buka;
  insert into public.mw_sessions (title, status, starts_at, ends_at) values ('Sudah lewat', 'terbit', now() - interval '3 hours', now() - interval '2 hours') returning id into sesi_lalu;
  insert into public.mw_sessions (title, status, starts_at, ends_at) values ('Nanti', 'terbit', now() + interval '2 hours', now() + interval '3 hours') returning id into sesi_nanti;
  insert into public.mw_sessions (title, status, starts_at, ends_at) values ('Draf', 'draf', now() - interval '1 hour', now() + interval '1 hour') returning id into sesi_draf;
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

  /* ── Silent Meeting ──────────────────────────────────────────────────────────────────────────── */
  insert into public.mw_silent_questions (session_id, question) values (sesi_buka, 'Apa yang perlu kita ubah tahun depan?') returning id into q_open;
  insert into public.mw_silent_questions (session_id, question) values (sesi_lalu, 'Pertanyaan sesi yang sudah lewat') returning id into q_past;
  insert into public.mw_silent_questions (session_id, question) values (sesi_nanti, 'Pertanyaan sesi nanti') returning id into q_future;
  insert into public.mw_silent_questions (session_id, question) values (sesi_draf, 'Pertanyaan sesi draf') returning id into q_draft;

  -- Open with its session's hours: feedback and the sender's count go in together, without a person.
  n := public.mw_silent_send(q_open, key_rani, 'Cara kerja', 'Rapat mingguan terlalu panjang.', 3);
  if n <> 1 then raise exception 'the first send should count 1, got %', n; end if;
  n := public.mw_silent_send(q_open, key_rani, '', 'Satu kanal resmi untuk info proyek.', 3);
  n := public.mw_silent_send(q_open, key_sari, 'Komunikasi', 'Info datang mendadak.', 3);
  if (select count(*) from public.mw_silent_feedback where question_id = q_open) <> 3
     or (select sent from public.mw_silent_participation where question_id = q_open and participant_key = key_rani) <> 2
     or (select count(*) from public.mw_silent_participation where question_id = q_open) <> 2 then
    raise exception 'three feedbacks from two people should be stored as such';
  end if;
  -- The cap per person, a topic the question does not have, a key that is not an HMAC.
  n := public.mw_silent_send(q_open, key_rani, '', 'Ketiga.', 3);
  begin perform public.mw_silent_send(q_open, key_rani, '', 'Keempat.', 3); raise exception 'UNEXPECTED: past the cap per person';
  exception when raise_exception then if sqlerrm <> 'silent_limit' then raise; end if; end;
  begin perform public.mw_silent_send(q_open, key_sari, 'Gaji direksi', 'Topik asing.', 3); raise exception 'UNEXPECTED: an unknown topic';
  exception when raise_exception then if sqlerrm <> 'silent_topic' then raise; end if; end;
  begin perform public.mw_silent_send(q_open, 'rani', '', 'Kunci polos.', 3); raise exception 'UNEXPECTED: a participant key that is not a keyed hash';
  exception when check_violation then null; end;
  if (select count(*) from public.mw_silent_feedback where question_id = q_open) <> 4 then raise exception 'refused sends should leave no feedback'; end if;

  -- Not open: before its session, after it (Tutup otomatis), a draft session, closed by panitia.
  begin perform public.mw_silent_send(q_future, key_rani, '', 'Terlalu awal.', 10); raise exception 'UNEXPECTED: feedback before it opens';
  exception when raise_exception then if sqlerrm <> 'silent_closed' then raise; end if; end;
  begin perform public.mw_silent_send(q_past, key_rani, '', 'Terlambat.', 10); raise exception 'UNEXPECTED: feedback after it closed';
  exception when raise_exception then if sqlerrm <> 'silent_closed' then raise; end if; end;
  begin insert into public.mw_silent_feedback (question_id, body) values (q_past, 'Langsung ke tabel, terlambat.'); raise exception 'UNEXPECTED: feedback after it closed (direct)';
  exception when raise_exception then if sqlerrm <> 'silent_closed' then raise; end if; end;
  begin perform public.mw_silent_send(q_draft, key_rani, '', 'Sesi draf.', 10); raise exception 'UNEXPECTED: feedback in a draft session';
  exception when raise_exception then if sqlerrm <> 'silent_closed' then raise; end if; end;
  if exists (select 1 from public.mw_silent_participation where question_id in (q_past, q_future, q_draft)) then
    raise exception 'a refused send should not count the person';
  end if;
  update public.mw_silent_questions set override = 'tutup', override_at = now(), override_by = dimas where id = q_open;
  begin perform public.mw_silent_send(q_open, key_sari, '', 'Ditutup panitia.', 10); raise exception 'UNEXPECTED: feedback after panitia closed it';
  exception when raise_exception then if sqlerrm <> 'silent_closed' then raise; end if; end;
  -- Panitia opens one early; with Tutup otomatis it still closes at its end, without it stays open.
  update public.mw_silent_questions set override = 'buka', override_at = now(), override_by = dimas where id = q_future;
  n := public.mw_silent_send(q_future, key_sari, '', 'Dibuka lebih awal.', 10);
  update public.mw_silent_questions set override = 'buka', override_at = now(), override_by = dimas, auto_close = true where id = q_past;
  begin perform public.mw_silent_send(q_past, key_sari, '', 'Buka tapi tutup otomatis.', 10); raise exception 'UNEXPECTED: feedback past the end with Tutup otomatis';
  exception when raise_exception then if sqlerrm <> 'silent_closed' then raise; end if; end;
  update public.mw_silent_questions set auto_close = false where id = q_past;
  n := public.mw_silent_send(q_past, key_sari, '', 'Dibiarkan terbuka panitia.', 10);
  q_kept := q_past;
  if (select count(*) from public.mw_silent_feedback where question_id = q_kept) <> 1 then raise exception 'feedback kept open by panitia should be stored'; end if;

  raise notice 'PASS: Main WAM modul: votes and Silent Meeting feedback follow their windows in the database';
end $$;
reset role;

set local role anon;
do $$
begin
  begin perform public.mw_silent_send(gen_random_uuid(), repeat('a1', 32), '', 'x', 1); raise exception 'UNEXPECTED: anon sends Silent Meeting feedback';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.mw_award_votes limit 1; raise exception 'UNEXPECTED: anon reads votes';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: Main WAM modul is server only for anon';
end $$;
reset role;

set local role authenticated;
do $$
begin
  begin perform public.mw_silent_send(gen_random_uuid(), repeat('a1', 32), '', 'x', 1); raise exception 'UNEXPECTED: a signed-in user sends Silent Meeting feedback directly';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.mw_silent_feedback limit 1; raise exception 'UNEXPECTED: a signed-in user reads feedback';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: Main WAM modul is server only for authenticated';
end $$;
reset role;
rollback;
