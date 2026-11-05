-- Execute ONLY against the disposable PostgreSQL migration-check container.
-- Migration 202611050004: every active room booking is also a published session.
begin;
set local role service_role;
do $$
declare
  vasuki uuid; nagapadma uuid; booker uuid; guest uuid; other uuid; booking uuid; session record; sid uuid; forum uuid;
begin
  select id into vasuki from public.pw_rooms where slug = 'vasuki';
  select id into nagapadma from public.pw_rooms where slug = 'nagapadma';
  insert into public.employees (full_name) values ('Pemesan Uji') returning id into booker;
  insert into public.employees (full_name) values ('Tamu Uji') returning id into guest;
  insert into public.employees (full_name) values ('Lain Uji') returning id into other;

  -- Senin 16 Nov 10.00–11.00 WIB: the booking becomes a published 'rapat' by the booker, with both people.
  booking := public.pw_save_booking(null, vasuki, '1-on-1 Q4', 'Catatan', '2026-11-16 03:00Z', '2026-11-16 04:00Z', booker, array[guest], 4);
  select * into session from public.pw_sessions where booking_id = booking;
  if session.id is null then raise exception 'booking has no session'; end if;
  if session.status <> 'terbit' or session.published_at is null or session.kind <> 'rapat' then raise exception 'session not published as rapat'; end if;
  if session.title <> '1-on-1 Q4' or session.description <> 'Catatan' or session.room_id <> vasuki or session.created_by <> booker then raise exception 'session does not match booking'; end if;
  if session.starts_at <> '2026-11-16 03:00Z' or session.ends_at <> '2026-11-16 04:00Z' then raise exception 'session time does not match'; end if;
  if (select count(*) from public.pw_session_participants where session_id = session.id and employee_id in (booker, guest)) <> 2 then raise exception 'participants not copied (booker included)'; end if;

  -- One hold for the booking: the session's; none of its own.
  if exists (select 1 from public.pw_room_holds where source = 'booking' and source_id = booking) then raise exception 'booking still holds the room next to its session'; end if;
  if (select count(*) from public.pw_room_holds where source = 'sesi' and source_id = session.id) <> 1 then raise exception 'session hold missing'; end if;

  -- Another booking or session in that room and hour is still refused.
  begin perform public.pw_save_booking(null, vasuki, 'Tabrakan', '', '2026-11-16 03:30Z', '2026-11-16 04:30Z', other, '{}', 4); raise exception 'UNEXPECTED: second booking over the first';
  exception when exclusion_violation then null; end;
  select id into forum from public.pw_sessions where title = 'Meeting biaya & budget';
  begin update public.pw_sessions set starts_at = '2026-11-16 03:00Z', ends_at = '2026-11-16 04:00Z', room_id = vasuki, status = 'terbit' where id = forum; raise exception 'UNEXPECTED: session over a booking session';
  exception when exclusion_violation then null; end;

  -- An edit moves the session and its hold, and replaces the participants.
  perform public.pw_save_booking(booking, nagapadma, '1-on-1 Q4 (ganti)', '', '2026-11-16 06:00Z', '2026-11-16 07:00Z', booker, array[other], 4);
  select * into session from public.pw_sessions where booking_id = booking;
  if session.title <> '1-on-1 Q4 (ganti)' or session.room_id <> nagapadma or session.starts_at <> '2026-11-16 06:00Z' then raise exception 'edit not mirrored'; end if;
  if (select count(*) from public.pw_sessions where booking_id = booking) <> 1 then raise exception 'edit made a second session'; end if;
  if exists (select 1 from public.pw_session_participants where session_id = session.id and employee_id = guest) then raise exception 'removed participant still in session'; end if;
  if not exists (select 1 from public.pw_session_participants where session_id = session.id and employee_id = other) then raise exception 'new participant missing'; end if;
  if not exists (select 1 from public.pw_room_holds where source = 'sesi' and source_id = session.id and room_id = nagapadma and starts_at = '2026-11-16 06:00Z') then raise exception 'hold did not move'; end if;
  -- Vasuki 10.00 is free again.
  perform public.pw_save_booking(null, vasuki, 'Sekarang bisa', '', '2026-11-16 03:00Z', '2026-11-16 04:00Z', other, '{}', 4);

  -- A booking session never goes back to draft.
  begin update public.pw_sessions set status = 'draf' where id = session.id; raise exception 'UNEXPECTED: booking session became a draft';
  exception when check_violation then null; end;

  -- Cancelling the booking cancels the session and frees the room.
  update public.pw_room_bookings set status = 'batal', cancelled_by = booker, cancelled_at = now() where id = booking;
  if (select status from public.pw_sessions where id = session.id) <> 'batal' then raise exception 'cancelled booking left its session published'; end if;
  if exists (select 1 from public.pw_room_holds where source_id in (booking, session.id)) then raise exception 'cancelled booking still holds'; end if;
  -- ... and the session is not published again.
  begin update public.pw_sessions set status = 'terbit' where id = session.id; raise exception 'UNEXPECTED: cancelled booking session published again';
  exception when check_violation then null; end;

  -- Cancelling the session cancels its booking.
  booking := public.pw_save_booking(null, nagapadma, 'Review', '', '2026-11-17 03:00Z', '2026-11-17 04:00Z', booker, '{}', 4);
  select id into sid from public.pw_sessions where booking_id = booking;
  update public.pw_sessions set status = 'batal' where id = sid;
  if (select status from public.pw_room_bookings where id = booking) <> 'batal' then raise exception 'cancelled session left its booking active'; end if;

  -- Deleting the booking deletes its session, participants and holds.
  booking := public.pw_save_booking(null, nagapadma, 'Hapus saya', '', '2026-11-18 03:00Z', '2026-11-18 04:00Z', booker, array[guest], 4);
  select id into sid from public.pw_sessions where booking_id = booking;
  delete from public.pw_room_bookings where id = booking;
  if exists (select 1 from public.pw_sessions where id = sid) or exists (select 1 from public.pw_session_participants where session_id = sid) then raise exception 'deleted booking left its session'; end if;
  if exists (select 1 from public.pw_room_holds where source_id in (booking, sid)) then raise exception 'deleted booking left a hold'; end if;

  -- The sync is idempotent: running it again changes nothing.
  booking := public.pw_save_booking(null, nagapadma, 'Sekali saja', '', '2026-11-19 03:00Z', '2026-11-19 04:00Z', booker, '{}', 4);
  perform public.pw_sync_booking_session(booking);
  perform public.pw_sync_booking_session(booking);
  if (select count(*) from public.pw_sessions where booking_id = booking) <> 1 then raise exception 'sync not idempotent'; end if;
  if (select count(*) from public.pw_room_holds where source = 'sesi' and source_id = (select id from public.pw_sessions where booking_id = booking)) <> 1 then raise exception 'sync doubled the hold'; end if;

  -- Backfill: every active booking that has not ended has its session and no own hold.
  if exists (select 1 from public.pw_room_bookings b where b.status = 'aktif' and b.ends_at > now() and not exists (select 1 from public.pw_sessions s where s.booking_id = b.id)) then raise exception 'active future booking without a session'; end if;
  if exists (select 1 from public.pw_room_holds h join public.pw_sessions s on s.booking_id = h.source_id where h.source = 'booking') then raise exception 'a booking with a session still has its own hold'; end if;
  raise notice 'PASS: bookings are published sessions, one hold each, edits/cancels/deletes mirrored';
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform public.pw_sync_booking_session(gen_random_uuid()); raise exception 'UNEXPECTED: anon ran the booking sync';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: booking sync is server only';
end $$;
reset role;

rollback;
