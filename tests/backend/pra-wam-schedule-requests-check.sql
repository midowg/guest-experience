-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
set local role service_role;
do $$
declare forum uuid; person uuid; panitia uuid; asked uuid;
begin
  select id into forum from public.pw_sessions where title = 'Meeting biaya & budget';
  insert into public.employees (full_name) values ('Peserta Uji') returning id into person;
  insert into public.employees (full_name) values ('Panitia Uji') returning id into panitia;
  insert into public.pw_schedule_requests (session_id, employee_id, from_starts_at, from_ends_at, to_starts_at, to_ends_at, reason)
  values (forum, person, '2026-11-13 03:00Z', '2026-11-13 05:00Z', '2026-11-13 06:00Z', '2026-11-13 08:00Z', 'Bentrok dengan kunjungan klien') returning id into asked;
  begin insert into public.pw_schedule_requests (session_id, employee_id, from_starts_at, from_ends_at, to_starts_at, to_ends_at, reason)
    values (forum, person, '2026-11-13 03:00Z', '2026-11-13 05:00Z', '2026-11-13 07:00Z', '2026-11-13 08:00Z', 'Permintaan kedua'); raise exception 'UNEXPECTED: two open requests';
  exception when unique_violation then null; end;
  begin update public.pw_schedule_requests set status = 'disetujui' where id = asked; raise exception 'UNEXPECTED: approved without review time';
  exception when check_violation then null; end;
  update public.pw_schedule_requests set status = 'ditolak', reviewed_by = panitia, reviewed_at = now(), review_note = 'Ruang penuh' where id = asked;
  -- Once answered, a new request may follow.
  insert into public.pw_schedule_requests (session_id, employee_id, from_starts_at, from_ends_at, to_starts_at, to_ends_at, reason)
  values (forum, person, '2026-11-13 03:00Z', '2026-11-13 05:00Z', '2026-11-13 07:00Z', '2026-11-13 09:00Z', 'Usul jam lain');
  begin insert into public.pw_schedule_requests (session_id, employee_id, from_starts_at, from_ends_at, to_starts_at, to_ends_at, reason)
    values (forum, panitia, '2026-11-13 03:00Z', '2026-11-13 05:00Z', '2026-11-13 07:00Z', '2026-11-13 09:00Z', 'ok'); raise exception 'UNEXPECTED: reason too short';
  exception when check_violation then null; end;
  raise notice 'PASS: one open request per person, review recorded, reason required';
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.pw_schedule_requests; raise exception 'UNEXPECTED: anon read requests';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: schedule requests are server only';
end $$;
reset role;

rollback;
