-- Execute ONLY against the disposable PostgreSQL migration-check container.
-- Main WAM Kuis live (202611200601): one answer per person per question; the points' bounds; one game
-- of a quiz that is not over; joining numbers "Tokoh misterius" without a gap or a twin and refuses a
-- game that is not open; totals are the sum of the answers, cancelled questions out, up to a question
-- and up to an earlier one. Nothing here is callable without the service role.
begin;
set local role service_role;
do $$
declare
  rani uuid; sari uuid; dimas uuid; arman uuid;
  quiz uuid; game uuid; answer text;
  qs jsonb := '[{"id":"q1","level":1,"body":"Satu?","options":["a","b","c","d"],"correct":1},{"id":"q2","level":1,"body":"Dua?","options":["a","b","c","d"],"correct":0},{"id":"q3","level":2,"body":"Tiga?","options":["a","b","c","d"],"correct":2}]';
  board record;
begin
  insert into public.employees (full_name, nickname) values ('Rani Contoh Kuis', 'Rani') returning id into rani;
  insert into public.employees (full_name, nickname) values ('Sari Contoh Kuis', 'Sari') returning id into sari;
  insert into public.employees (full_name, nickname) values ('Dimas Contoh Kuis', 'Dimas') returning id into dimas;
  insert into public.employees (full_name, nickname) values ('Arman Contoh Kuis', 'Arman') returning id into arman;

  insert into public.mw_quizzes (title) values ('Kuis contoh') returning id into quiz;
  insert into public.mw_quiz_hosts (quiz_id, employee_id) values (quiz, dimas);
  insert into public.mw_quiz_questions (quiz_id, level, body, options, correct) values (quiz, 1, 'Satu?', array['a','b','c','d'], 1);
  begin insert into public.mw_quiz_questions (quiz_id, level, body, options, correct) values (quiz, 1, 'Tiga pilihan?', array['a','b','c'], 1); raise exception 'UNEXPECTED: a question with three options';
  exception when check_violation then null; end;
  begin insert into public.mw_quiz_questions (quiz_id, level, body, options, correct) values (quiz, 5, 'Level lima?', array['a','b','c','d'], 1); raise exception 'UNEXPECTED: level 5';
  exception when check_violation then null; end;

  insert into public.mw_quiz_runs (quiz_id, number, questions) values (quiz, 1, qs) returning id into game;
  begin insert into public.mw_quiz_runs (quiz_id, number, questions) values (quiz, 2, qs); raise exception 'UNEXPECTED: two games of one quiz not over';
  exception when unique_violation then null; end;

  -- Not open for joining before the lobby.
  if public.mw_quiz_join(game, rani, 'marie-curie', 'Marie Curie', 'Ahli Siasat', array['#3A6FBF', '#1B2C66']) <> 'tutup' then raise exception 'joined a game before its lobby'; end if;
  update public.mw_quiz_runs set phase = 'lobi' where id = game;
  if public.mw_quiz_join(game, rani, 'marie-curie', 'Marie Curie', 'Ahli Siasat', array['#3A6FBF', '#1B2C66']) <> 'ok' then raise exception 'could not join the lobby'; end if;
  if public.mw_quiz_join(game, rani, 'marie-curie', 'Marie Curie', 'Ahli Siasat', array['#3A6FBF', '#1B2C66']) <> 'sudah' then raise exception 'joined twice'; end if;
  if public.mw_quiz_join(game, sari, null, null, null, null) <> 'ok' then raise exception 'Sari could not join'; end if;
  if public.mw_quiz_join(game, arman, null, null, null, null) <> 'ok' then raise exception 'Arman could not join'; end if;
  if public.mw_quiz_join(gen_random_uuid(), arman, null, null, null, null) <> 'unknown' then raise exception 'joined a game that does not exist'; end if;
  if (select string_agg(alias, ', ' order by mystery_no) from public.mw_quiz_players where run_id = game and mystery_no is not null) <> 'Tokoh misterius #01, Tokoh misterius #02' then
    raise exception 'mystery numbers should run 01, 02';
  end if;
  begin insert into public.mw_quiz_players (run_id, employee_id, alias, mystery_no) values (game, dimas, 'Tokoh misterius #02', 2); raise exception 'UNEXPECTED: two players with one mystery number';
  exception when unique_violation then null; end;

  -- One answer per person per question; the points' bounds.
  insert into public.mw_quiz_answers (run_id, question_index, employee_id, choice, ms, correct, points, tapped_at) values (game, 0, rani, 1, 2000, true, 473, now());
  begin insert into public.mw_quiz_answers (run_id, question_index, employee_id, choice, ms, correct, points, tapped_at) values (game, 0, rani, 2, 3000, false, -100, now()); raise exception 'UNEXPECTED: a second answer';
  exception when unique_violation then null; end;
  begin insert into public.mw_quiz_answers (run_id, question_index, employee_id, choice, ms, correct, points, tapped_at) values (game, 1, rani, 0, 3000, true, 900, now()); raise exception 'UNEXPECTED: 900 points';
  exception when check_violation then null; end;
  begin insert into public.mw_quiz_answers (run_id, question_index, employee_id, choice, ms, correct, points, tapped_at) values (game, 1, rani, 1, 3000, false, -50, now()); raise exception 'UNEXPECTED: a wrong answer not −100';
  exception when check_violation then null; end;
  begin insert into public.mw_quiz_answers (run_id, question_index, employee_id, choice, ms, correct, points, tapped_at) values (game, 0, dimas, 1, 3000, true, 470, now()); raise exception 'UNEXPECTED: an answer of someone who did not join';
  exception when foreign_key_violation then null; end;
  insert into public.mw_quiz_answers (run_id, question_index, employee_id, choice, ms, correct, points, tapped_at) values (game, 0, sari, 3, 4000, false, -100, now());
  insert into public.mw_quiz_answers (run_id, question_index, employee_id, choice, ms, correct, points, tapped_at) values (game, 1, rani, 0, 5000, true, 433, now() + interval '1 minute');
  insert into public.mw_quiz_answers (run_id, question_index, employee_id, choice, ms, correct, points, tapped_at) values (game, 1, sari, 0, 1000, true, 487, now() + interval '1 minute');
  insert into public.mw_quiz_answers (run_id, question_index, employee_id, choice, ms, correct, points, tapped_at) values (game, 2, rani, 2, 6000, true, 460, now() + interval '2 minutes');

  -- Totals: the sum of the answers up to a question, and up to the one before.
  select * into board from public.mw_quiz_board(game, 1, 0) b where b.employee_id = rani;
  if board.total <> 906 or board.correct <> 2 or board.correct_ms <> 7000 or board.prev_total <> 473 or board.prev_correct_ms <> 2000 then raise exception 'Rani''s totals are wrong: %', board; end if;
  select * into board from public.mw_quiz_board(game, 2, 1) b where b.employee_id = rani;
  if board.total <> 1366 or board.prev_total <> 906 then raise exception 'Rani''s totals up to question 3 are wrong: %', board; end if;
  select * into board from public.mw_quiz_board(game, 2, 1) b where b.employee_id = arman;
  if board.total <> 0 or board.correct <> 0 or board.last_correct_at is not null then raise exception 'a player without answers should be on the board with 0: %', board; end if;
  if (select count(*) from public.mw_quiz_board(game, 2, 1)) <> 3 then raise exception 'everyone who joined is on the board'; end if;
  -- A cancelled question is not scored.
  update public.mw_quiz_runs set canceled = array[1] where id = game;
  select * into board from public.mw_quiz_board(game, 2, 1) b where b.employee_id = sari;
  if board.total <> -100 or board.correct <> 0 then raise exception 'a cancelled question still counts: %', board; end if;

  -- Over: a new game of the same quiz may start; on the podium nobody joins.
  update public.mw_quiz_runs set phase = 'podium' where id = game;
  if public.mw_quiz_join(game, dimas, null, null, null, null) <> 'tutup' then raise exception 'joined on the podium'; end if;
  update public.mw_quiz_runs set phase = 'selesai', ended_at = now() where id = game;
  insert into public.mw_quiz_runs (quiz_id, number, questions) values (quiz, 2, qs);

  -- Deleting a quiz takes its games, players and answers with it.
  delete from public.mw_quizzes where id = quiz;
  if exists (select 1 from public.mw_quiz_answers where run_id = game) then raise exception 'answers left after the quiz was deleted'; end if;

  raise notice 'PASS: Main WAM kuis: one answer per question, totals are sums, mystery numbers in order';
end $$;
reset role;

set local role anon;
do $$
begin
  begin perform 1 from public.mw_quiz_answers limit 1; raise exception 'UNEXPECTED: anon reads answers';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.mw_quizzes limit 1; raise exception 'UNEXPECTED: anon reads quizzes (and their keys)';
  exception when insufficient_privilege then null; end;
  begin perform public.mw_quiz_join(gen_random_uuid(), gen_random_uuid(), null, null, null, null); raise exception 'UNEXPECTED: anon joins a game';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.mw_quiz_board(gen_random_uuid(), 0, 0); raise exception 'UNEXPECTED: anon reads a board';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: Main WAM kuis is server only for anon';
end $$;
reset role;

set local role authenticated;
do $$
begin
  begin perform 1 from public.mw_quiz_questions limit 1; raise exception 'UNEXPECTED: a signed-in user reads the keys';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.mw_quiz_runs limit 1; raise exception 'UNEXPECTED: a signed-in user reads a game';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: Main WAM kuis is server only for authenticated';
end $$;
reset role;
rollback;
