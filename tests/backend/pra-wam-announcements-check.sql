-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
set local role service_role;
do $$
declare event uuid; forum uuid; person uuid; note uuid;
begin
  select id into event from public.pw_events where slug = 'pra-wam-2026';
  select id into forum from public.pw_sessions where title = 'HOD Meeting';
  insert into public.employees (full_name) values ('Penerima Uji') returning id into person;
  insert into public.pw_announcements (event_id, title, body, audience_label) values (event, 'Selamat datang', 'Isi', 'Semua peserta') returning id into note;
  insert into public.pw_notification_receipts (announcement_id, employee_id) values (note, person);
  begin insert into public.pw_notification_receipts (announcement_id, employee_id) values (note, person); raise exception 'UNEXPECTED: received twice';
  exception when unique_violation then null; end;
  begin insert into public.pw_announcements (event_id, kind, title) values (event, 'gosip', 'Judul'); raise exception 'UNEXPECTED: unknown kind';
  exception when check_violation then null; end;
  update public.pw_notification_receipts set read_at = now() where announcement_id = note;
  insert into public.pw_announcements (event_id, kind, title, session_id) values (event, 'sesi', 'HOD Meeting diterbitkan', forum);
  delete from public.pw_sessions where id = forum;
  if (select session_id from public.pw_announcements where title = 'HOD Meeting diterbitkan') is not null then raise exception 'session link not cleared'; end if;
  raise notice 'PASS: one receipt per person, known kinds, session link cleared when the session goes';
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.pw_notification_receipts; raise exception 'UNEXPECTED: anon read receipts';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: announcements are server only';
end $$;
reset role;

rollback;
