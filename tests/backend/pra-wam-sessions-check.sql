-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
set local role service_role;
do $$
declare
  event uuid; vasuki uuid; nagapadma uuid; person uuid; forum uuid; booking uuid;
begin
  select id into event from public.pw_events where slug = 'pra-wam-2026';
  select id into vasuki from public.pw_rooms where slug = 'vasuki';
  select id into nagapadma from public.pw_rooms where slug = 'nagapadma';
  if (select count(*) from public.pw_sessions where status = 'draf' and starts_at is null) <> 11 then raise exception 'calendar forums not seeded as drafts'; end if;
  insert into public.employees (full_name) values ('Panitia Uji') returning id into person;

  -- A draft cannot be published without a time.
  select id into forum from public.pw_sessions where title = 'Meeting biaya & budget';
  begin update public.pw_sessions set status = 'terbit' where id = forum; raise exception 'UNEXPECTED: published without time';
  exception when check_violation then null; end;

  -- Rabu 4 Nov 10.00–11.00 WIB: the session takes Vasuki.
  update public.pw_sessions set starts_at = '2026-11-04 03:00Z', ends_at = '2026-11-04 04:00Z', room_id = vasuki, status = 'terbit' where id = forum;
  if not exists (select 1 from public.pw_room_holds where source = 'sesi' and source_id = forum) then raise exception 'session hold missing'; end if;

  -- An appraisal booking for the same hour is refused by the shared holds.
  begin perform public.pw_save_booking(null, vasuki, 'Appraisal', '', '2026-11-04 03:30Z', '2026-11-04 04:30Z', person, '{}', 4); raise exception 'UNEXPECTED: booking over a session';
  exception when exclusion_violation then null; end;
  booking := public.pw_save_booking(null, nagapadma, 'Appraisal', '', '2026-11-04 03:00Z', '2026-11-04 04:00Z', person, '{}', 4);

  -- Moving the session onto the booking is refused too.
  begin update public.pw_sessions set room_id = nagapadma where id = forum; raise exception 'UNEXPECTED: session over a booking';
  exception when exclusion_violation then null; end;

  -- Cancelling the session frees Vasuki; cancelling the booking frees Nagapadma.
  update public.pw_sessions set status = 'batal' where id = forum;
  perform public.pw_save_booking(null, vasuki, 'Appraisal', '', '2026-11-04 03:30Z', '2026-11-04 04:30Z', person, '{}', 4);
  update public.pw_room_bookings set status = 'batal', cancelled_by = person, cancelled_at = now() where id = booking;
  if exists (select 1 from public.pw_room_holds where source = 'booking' and source_id = booking) then raise exception 'cancelled booking still holds'; end if;

  insert into public.pw_session_participants (session_id, employee_id) values (forum, person);
  insert into public.pw_documents (event_id, session_id, title, file_key, filename, mime, size, uploaded_by)
  values (event, forum, 'Bahan forum', 'pra-wam/dokumen/a/bahan.pdf', 'bahan.pdf', 'application/pdf', 1024, person);
  begin insert into public.pw_documents (event_id, title, file_key, filename, mime, size, uploaded_by) values (event, 'Lain', 'lain/x.pdf', 'x.pdf', 'application/pdf', 10, person); raise exception 'UNEXPECTED: key outside the folder';
  exception when check_violation then null; end;
  raise notice 'PASS: drafts seeded, sessions and bookings share room holds, documents kept in their folder';
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.pw_sessions; raise exception 'UNEXPECTED: anon read sessions';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.pw_documents; raise exception 'UNEXPECTED: anon read documents';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: sessions and documents are server only';
end $$;
reset role;

rollback;
