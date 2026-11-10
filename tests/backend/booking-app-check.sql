-- Execute ONLY against the disposable PostgreSQL migration-check container.
-- Migration 202611100006: bookings of the office app (/booking) share WAM's tables and never become sessions.
begin;
set local role service_role;
do $$
declare
  vasuki uuid; booker uuid; other uuid; office uuid; wam uuid; forum uuid;
begin
  select id into vasuki from public.pw_rooms where slug = 'vasuki';
  insert into public.employees (full_name) values ('Pemesan Kantor Uji') returning id into booker;
  insert into public.employees (full_name) values ('Pemesan WAM Uji') returning id into other;

  -- Senin 23 Nov 10.00–11.00 WIB from the office app: saved, no session, its own room hold.
  office := public.pw_save_booking(null, vasuki, 'Rapat vendor', '', '2026-11-23 03:00Z', '2026-11-23 04:00Z', booker, array[other], 4, null, 'kantor', 'eksternal', 'PT Contoh');
  if (select source from public.pw_room_bookings where id = office) <> 'kantor' then raise exception 'source not kept'; end if;
  if (select audience || ':' || external_note from public.pw_room_bookings where id = office) <> 'eksternal:PT Contoh' then raise exception 'audience not kept'; end if;
  if exists (select 1 from public.pw_sessions where booking_id = office) then raise exception 'office booking became a WAM session'; end if;
  if (select count(*) from public.pw_room_holds where source = 'booking' and source_id = office) <> 1 then raise exception 'office booking holds no room'; end if;
  if (select count(*) from public.pw_room_booking_participants where booking_id = office) <> 2 then raise exception 'participants not saved (booker included)'; end if;

  -- A WAM booking over it is refused, and so is a panitia session.
  begin perform public.pw_save_booking(null, vasuki, 'Tabrakan WAM', '', '2026-11-23 03:30Z', '2026-11-23 04:30Z', other, '{}', 4); raise exception 'UNEXPECTED: WAM booking over an office booking';
  exception when exclusion_violation then null; end;
  select id into forum from public.pw_sessions where title = 'Meeting biaya & budget';
  if forum is not null then
    begin update public.pw_sessions set starts_at = '2026-11-23 03:00Z', ends_at = '2026-11-23 04:00Z', room_id = vasuki, status = 'terbit' where id = forum; raise exception 'UNEXPECTED: session over an office booking';
    exception when exclusion_violation then null; end;
  end if;

  -- An office booking over a WAM booking is refused too.
  wam := public.pw_save_booking(null, vasuki, 'Appraisal', '', '2026-11-23 06:00Z', '2026-11-23 07:00Z', other, '{}', 4);
  if (select source from public.pw_room_bookings where id = wam) <> 'wam' then raise exception 'WAM booking lost its default source'; end if;
  if not exists (select 1 from public.pw_sessions where booking_id = wam) then raise exception 'WAM booking no longer becomes a session'; end if;
  begin perform public.pw_save_booking(null, vasuki, 'Tabrakan kantor', '', '2026-11-23 06:30Z', '2026-11-23 07:30Z', booker, '{}', 4, null, 'kantor', 'internal'); raise exception 'UNEXPECTED: office booking over a WAM booking';
  exception when exclusion_violation then null; end;

  -- An edit keeps the source, still makes no session, and moves the hold.
  perform public.pw_save_booking(office, vasuki, 'Rapat vendor (geser)', '', '2026-11-23 08:00Z', '2026-11-23 09:00Z', booker, '{}', 4, null, 'kantor', 'internal');
  if (select source || ':' || audience || ':' || coalesce(external_note, '-') from public.pw_room_bookings where id = office) <> 'kantor:internal:-' then raise exception 'edit did not keep source or clear the note'; end if;
  if exists (select 1 from public.pw_sessions where booking_id = office) then raise exception 'edited office booking became a session'; end if;
  if not exists (select 1 from public.pw_room_holds where source = 'booking' and source_id = office and starts_at = '2026-11-23 08:00Z') then raise exception 'hold did not move'; end if;
  -- An edit from WAM's form (no audience sent) keeps the audience.
  perform public.pw_save_booking(office, vasuki, 'Rapat vendor', '', '2026-11-23 08:00Z', '2026-11-23 09:00Z', booker, '{}', 4, null, 'kantor', 'eksternal', 'PT Contoh');
  perform public.pw_save_booking(office, vasuki, 'Rapat vendor', '', '2026-11-23 08:00Z', '2026-11-23 09:00Z', booker, '{}', 4);
  if (select audience from public.pw_room_bookings where id = office) <> 'eksternal' then raise exception 'edit without audience changed it'; end if;

  -- Eksternal needs its note.
  begin perform public.pw_save_booking(null, vasuki, 'Tanpa keterangan', '', '2026-11-24 03:00Z', '2026-11-24 04:00Z', booker, '{}', 4, null, 'kantor', 'eksternal', ' '); raise exception 'UNEXPECTED: eksternal without a note';
  exception when raise_exception then null; end;

  -- Cancelling frees the room.
  update public.pw_room_bookings set status = 'batal', cancelled_by = booker, cancelled_at = now() where id = office;
  if exists (select 1 from public.pw_room_holds where source_id = office) then raise exception 'cancelled office booking still holds'; end if;

  -- The daily limit counts both apps.
  perform public.pw_save_booking(null, vasuki, 'Satu', '', '2026-11-25 01:00Z', '2026-11-25 01:30Z', booker, '{}', 2, null, 'kantor', 'internal');
  perform public.pw_save_booking(null, vasuki, 'Dua', '', '2026-11-25 02:00Z', '2026-11-25 02:30Z', booker, '{}', 2);
  begin perform public.pw_save_booking(null, vasuki, 'Tiga', '', '2026-11-25 03:00Z', '2026-11-25 03:30Z', booker, '{}', 2, null, 'kantor', 'internal'); raise exception 'UNEXPECTED: over the daily limit';
  exception when raise_exception then null; end;

  -- Booked by the administration staff for someone: created_by names who made it; null when the booker did.
  office := public.pw_save_booking(null, vasuki, 'Atas nama', '', '2026-11-26 03:00Z', '2026-11-26 04:00Z', other, '{}', 4, null, 'kantor', 'internal', null, booker);
  if (select booked_by from public.pw_room_bookings where id = office) <> other or (select created_by from public.pw_room_bookings where id = office) <> booker then raise exception 'created_by not kept'; end if;
  office := public.pw_save_booking(null, vasuki, 'Sendiri', '', '2026-11-26 05:00Z', '2026-11-26 06:00Z', other, '{}', 4, null, 'kantor', 'internal', null, other);
  if (select created_by from public.pw_room_bookings where id = office) is not null then raise exception 'created_by set for the booker themself'; end if;

  -- The new role is allowed.
  insert into public.pw_roles (employee_id, role) values (booker, 'ga');
  raise notice 'PASS: office bookings share the rooms with WAM, hold them, and stay out of WAM sessions';
end $$;
reset role;

rollback;
