-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
set local role service_role;
do $$
declare f uuid; s uuid; qn uuid; person uuid;
begin
  select id into f from public.cq_forms where slug = 'kuesioner';
  if f is null then raise exception 'the first form is missing'; end if;
  if (select count(*) from public.cq_sections where form_id = f) <> 6 then raise exception 'expected 6 sections'; end if;
  if (select count(*) from public.cq_questions where form_id = f) <> 55 then raise exception 'expected 55 questions'; end if;
  if (select status from public.cq_forms where id = f) <> 'draf' then raise exception 'the first form starts as a draft'; end if;
  if not (select anonymous from public.cq_sections where form_id = f and key = 'D') then raise exception 'section D is the anonymous one'; end if;
  if (select kind from public.cq_questions where form_id = f and key = '2') <> 'department' then raise exception 'question 2 picks a department'; end if;
  if (select show_if->>'question' from public.cq_questions where form_id = f and key = '31') <> '3' then raise exception 'question 31 follows question 3'; end if;

  begin update public.cq_forms set slug = 'Bad Slug' where id = f; raise exception 'UNEXPECTED: bad slug';
  exception when check_violation then null; end;
  begin insert into public.cq_forms (slug) values ('kuesioner'); raise exception 'UNEXPECTED: duplicate slug';
  exception when unique_violation then null; end;
  begin update public.cq_forms set hr_password_hash = 'plain-text' where id = f; raise exception 'UNEXPECTED: a non-scrypt password';
  exception when check_violation then null; end;

  select id into s from public.cq_sections where form_id = f and key = '0';
  begin insert into public.cq_questions (form_id, section_id, key, prompt, kind, visibility) values (f, s, '1', 'Dua kali', 'text', 'rekan'); raise exception 'UNEXPECTED: duplicate question key';
  exception when unique_violation then null; end;

  select id into person from public.employees limit 1;
  select id into qn from public.cq_questions where form_id = f and key = '1';
  if person is not null then
    insert into public.cq_answers (form_id, question_id, employee_id, value) values (f, qn, person, '"Dewi"');
    insert into public.cq_answers (form_id, question_id, employee_id, value) values (f, qn, person, '"Dewi Lestari"')
      on conflict (question_id, employee_id) do update set value = excluded.value, updated_at = now();
    if (select value #>> '{}' from public.cq_answers where question_id = qn and employee_id = person) <> 'Dewi Lestari' then raise exception 'an answer is replaced, not added'; end if;
    insert into public.cq_anon_receipts (form_id, employee_id) values (f, person);
    begin insert into public.cq_anon_receipts (form_id, employee_id) values (f, person); raise exception 'UNEXPECTED: the anonymous part sent twice';
    exception when unique_violation then null; end;
  end if;
  raise notice 'PASS: first form seeded, slug and keys guarded, answers replace, anonymous sent once';
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.cq_answers; raise exception 'UNEXPECTED: anon read answers';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.cq_anon_answers; raise exception 'UNEXPECTED: anon read anonymous answers';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
