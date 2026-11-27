-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Pra WAM: every active appraisal room booking is also a PUBLISHED session ("Terbit" in Jadwal
-- sesi, on its participants' agenda), so QR attendance, "Saya hadir" and documents work on it
-- (decided 5 Nov 2026). The database does the mirroring, so every code path and the
-- pw_save_booking RPC get it atomically:
--   * pw_sessions.booking_id links the session to its booking (one each, deleted with it);
--     kind is 'rapat' (no new kind), the booker is created_by, participants = booker + booking's.
--   * a booking edit moves/renames the session; cancelling the booking cancels the session
--     (and cancelling such a session cancels the booking); deleting the booking deletes it.
--     Such a session never goes back to draft, and a cancelled one is not published again.
--   * Room holds: the session's hold REPLACES the booking's (pw_hold_booking skips a booking
--     that has a session), so the two never collide and roomUses sees one use per booking.
--   * Active bookings that have not ended yet get their session below (idempotent); past ones stay
--     plain bookings, which every list still shows once.
-- Needs 202611040001, 202611040003 and 202611040004.
--
-- ROLLBACK (by hand, in this order):
--   drop trigger pw_room_booking_participants_mirror on public.pw_room_booking_participants;
--   drop trigger pw_room_bookings_mirror on public.pw_room_bookings;
--   drop trigger pw_sessions_booking_cancels on public.pw_sessions;
--   drop trigger pw_sessions_booking_guard on public.pw_sessions;
--   delete from public.pw_sessions where booking_id is not null;   -- also removes their holds
--   alter table public.pw_sessions drop column booking_id;
--   drop function public.pw_mirror_booking(), public.pw_mirror_booking_participants(),
--     public.pw_sync_booking_session(uuid), public.pw_session_booking_cancels(), public.pw_session_booking_guard();
--   -- then restore pw_hold_booking from 202611040004 (without the "not exists" clause) and run:
--   insert into public.pw_room_holds (source, source_id, room_id, starts_at, ends_at)
--   select 'booking', id, room_id, starts_at, ends_at from public.pw_room_bookings where status = 'aktif'
--   on conflict do nothing;
begin;

alter table public.pw_sessions add column booking_id uuid unique references public.pw_room_bookings (id) on delete cascade;

-- A booking that has a session is held by the session, not by itself.
create or replace function public.pw_hold_booking() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  delete from pw_room_holds where source = 'booking' and source_id = coalesce(new.id, old.id);
  if tg_op <> 'DELETE' and new.status = 'aktif' and not exists (select 1 from pw_sessions where booking_id = new.id) then
    insert into pw_room_holds (source, source_id, room_id, starts_at, ends_at) values ('booking', new.id, new.room_id, new.starts_at, new.ends_at);
  end if;
  return coalesce(new, old);
end $$;

/*
 * Makes the booking's session match the booking, and returns its id (null: no booking, no Pra WAM
 * event, or a cancelled booking that never had a session). Safe to call any number of times.
 */
create function public.pw_sync_booking_session(p_booking uuid) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare
  b public.pw_room_bookings;
  ev uuid;
  sid uuid;
  wanted text;
begin
  select * into b from pw_room_bookings where id = p_booking;
  if not found then return null; end if;
  select id into sid from pw_sessions where booking_id = b.id;
  if sid is null and b.status <> 'aktif' then return null; end if;
  wanted := case b.status when 'aktif' then 'terbit' else 'batal' end;
  if sid is null then
    select id into ev from pw_events where kind = 'pra_wam' order by start_date limit 1;
    if ev is null then return null; end if;
  end if;
  -- The session's hold takes over, so the booking's own goes first.
  if b.status = 'aktif' then delete from pw_room_holds where source = 'booking' and source_id = b.id; end if;
  if sid is null then
    insert into pw_sessions (event_id, title, kind, description, starts_at, ends_at, room_id, status, created_by, published_at, booking_id)
    values (ev, b.title, 'rapat', b.description, b.starts_at, b.ends_at, b.room_id, wanted, b.booked_by, now(), b.id)
    returning id into sid;
  else
    update pw_sessions
       set title = b.title, description = b.description, room_id = b.room_id, starts_at = b.starts_at, ends_at = b.ends_at,
           status = wanted, created_by = b.booked_by,
           published_at = case when wanted = 'terbit' then coalesce(published_at, now()) else published_at end,
           updated_at = now()
     where id = sid
       and (title, description, room_id, starts_at, ends_at, status, created_by) is distinct from (b.title, b.description, b.room_id, b.starts_at, b.ends_at, wanted, b.booked_by);
  end if;
  delete from pw_session_participants
   where session_id = sid
     and employee_id not in (select employee_id from pw_room_booking_participants where booking_id = b.id union select b.booked_by);
  insert into pw_session_participants (session_id, employee_id)
  select sid, person from (select employee_id as person from pw_room_booking_participants where booking_id = b.id union select b.booked_by) as people
  on conflict do nothing;
  return sid;
end $$;

create function public.pw_mirror_booking() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  perform public.pw_sync_booking_session(new.id);
  return null;
end $$;

-- pw_save_booking writes the participants after the booking row, and rewrites them on an edit.
create function public.pw_mirror_booking_participants() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  perform public.pw_sync_booking_session(coalesce(new.booking_id, old.booking_id));
  return null;
end $$;

-- Cancelling the session itself cancels its booking (one source of truth); a booking session never goes back to draft.
create function public.pw_session_booking_cancels() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  update pw_room_bookings set status = 'batal', cancelled_at = coalesce(cancelled_at, now()), updated_at = now()
   where id = new.booking_id and status = 'aktif';
  return null;
end $$;

-- A cancelled booking's session stays cancelled: only a new booking makes a new session.
create function public.pw_session_booking_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.booking_id is not null and new.status = 'draf' then
    raise exception 'BOOKING_SESSION_NOT_DRAFT' using errcode = '23514';
  end if;
  if new.booking_id is not null and new.status = 'terbit' and exists (select 1 from pw_room_bookings where id = new.booking_id and status <> 'aktif') then
    raise exception 'BOOKING_SESSION_CANCELLED' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger pw_room_bookings_mirror after insert or update on public.pw_room_bookings for each row execute function public.pw_mirror_booking();
create trigger pw_room_booking_participants_mirror after insert or delete on public.pw_room_booking_participants for each row execute function public.pw_mirror_booking_participants();
create trigger pw_sessions_booking_cancels after update of status on public.pw_sessions for each row
  when (new.booking_id is not null and new.status = 'batal' and old.status is distinct from 'batal') execute function public.pw_session_booking_cancels();
create trigger pw_sessions_booking_guard before update on public.pw_sessions for each row
  when (new.booking_id is not null and new.status in ('draf', 'terbit')) execute function public.pw_session_booking_guard();

revoke all on function public.pw_sync_booking_session(uuid), public.pw_mirror_booking(), public.pw_mirror_booking_participants(),
  public.pw_session_booking_cancels(), public.pw_session_booking_guard() from public, anon, authenticated;
grant execute on function public.pw_sync_booking_session(uuid) to service_role;

-- Active bookings that have not ended yet (idempotent: only those without a session). Past ones
-- stay plain bookings with their own hold; an edit to one would give it its session then.
do $$
declare booking record;
begin
  for booking in select b.id from public.pw_room_bookings b
    where b.status = 'aktif' and b.ends_at > now() and not exists (select 1 from public.pw_sessions s where s.booking_id = b.id) order by b.starts_at
  loop
    perform public.pw_sync_booking_session(booking.id);
  end loop;
end $$;

commit;
