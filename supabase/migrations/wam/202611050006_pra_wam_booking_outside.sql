-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611050005.
--
-- Book ruang "Di luar kantor" (decided 5 Nov 2026): a booking may have no office room and a place
-- name instead (a café, a client's office). Such a booking:
--   * has room_id null and `place` filled (2–120 characters); a room booking has no place;
--   * may be on any day of the week and at any hour of that one day, and longer than 4 hours
--     (still whole half hours, still one WIB day; the period and the daily limit stay as they are);
--   * holds no room (pw_room_holds and the overlap rule only concern rooms);
--   * becomes a published session like any booking, with the place as the session's `location`.
-- Room bookings keep every rule of 202611040001 / 202611050005 (07.00–22.00, Monday–Friday, 4 hours).
-- pw_save_booking gains p_place (default null), so callers that send no place keep working.
--
-- ROLLBACK (by hand): cancel or delete the bookings with room_id null first, then restore
-- pw_booking_order / pw_booking_hours from 202611050005, drop pw_booking_where and the place
-- column, set room_id not null, and recreate pw_save_booking, pw_hold_booking and
-- pw_sync_booking_session from 202611040001 and 202611050004.
begin;

alter table public.pw_room_bookings alter column room_id drop not null;
alter table public.pw_room_bookings add column if not exists place text;

alter table public.pw_room_bookings drop constraint if exists pw_booking_where;
alter table public.pw_room_bookings add constraint pw_booking_where check (
  (room_id is not null and place is null)
  or (room_id is null and place is not null and char_length(btrim(place)) between 2 and 120)
);

alter table public.pw_room_bookings drop constraint if exists pw_booking_order;
alter table public.pw_room_bookings add constraint pw_booking_order check (
  ends_at > starts_at and (room_id is null or ends_at - starts_at <= interval '4 hours')
);

alter table public.pw_room_bookings drop constraint if exists pw_booking_hours;
alter table public.pw_room_bookings add constraint pw_booking_hours check (
  (starts_at at time zone 'Asia/Jakarta')::date = (ends_at at time zone 'Asia/Jakarta')::date
  and (
    room_id is null
    or (
      (starts_at at time zone 'Asia/Jakarta')::time >= time '07:00'
      and (ends_at at time zone 'Asia/Jakarta')::time <= time '22:00'
      and extract(isodow from starts_at at time zone 'Asia/Jakarta') between 1 and 5
    )
  )
);

-- An outside booking holds no room.
create or replace function public.pw_hold_booking() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  delete from pw_room_holds where source = 'booking' and source_id = coalesce(new.id, old.id);
  if tg_op <> 'DELETE' and new.status = 'aktif' and new.room_id is not null and not exists (select 1 from pw_sessions where booking_id = new.id) then
    insert into pw_room_holds (source, source_id, room_id, starts_at, ends_at) values ('booking', new.id, new.room_id, new.starts_at, new.ends_at);
  end if;
  return coalesce(new, old);
end $$;

-- The booking's session carries the place as its location (and no room) for an outside booking.
create or replace function public.pw_sync_booking_session(p_booking uuid) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare
  b public.pw_room_bookings;
  ev uuid;
  sid uuid;
  wanted text;
  where_text text;
begin
  select * into b from pw_room_bookings where id = p_booking;
  if not found then return null; end if;
  select id into sid from pw_sessions where booking_id = b.id;
  if sid is null and b.status <> 'aktif' then return null; end if;
  wanted := case b.status when 'aktif' then 'terbit' else 'batal' end;
  where_text := coalesce(btrim(b.place), '');
  if sid is null then
    select id into ev from pw_events where kind = 'pra_wam' order by start_date limit 1;
    if ev is null then return null; end if;
  end if;
  if b.status = 'aktif' then delete from pw_room_holds where source = 'booking' and source_id = b.id; end if;
  if sid is null then
    insert into pw_sessions (event_id, title, kind, description, starts_at, ends_at, room_id, location, status, created_by, published_at, booking_id)
    values (ev, b.title, 'rapat', b.description, b.starts_at, b.ends_at, b.room_id, where_text, wanted, b.booked_by, now(), b.id)
    returning id into sid;
  else
    update pw_sessions
       set title = b.title, description = b.description, room_id = b.room_id, location = where_text, starts_at = b.starts_at, ends_at = b.ends_at,
           status = wanted, created_by = b.booked_by,
           published_at = case when wanted = 'terbit' then coalesce(published_at, now()) else published_at end,
           updated_at = now()
     where id = sid
       and (title, description, room_id, location, starts_at, ends_at, status, created_by) is distinct from (b.title, b.description, b.room_id, where_text, b.starts_at, b.ends_at, wanted, b.booked_by);
  end if;
  delete from pw_session_participants
   where session_id = sid
     and employee_id not in (select employee_id from pw_room_booking_participants where booking_id = b.id union select b.booked_by);
  insert into pw_session_participants (session_id, employee_id)
  select sid, person from (select employee_id as person from pw_room_booking_participants where booking_id = b.id union select b.booked_by) as people
  on conflict do nothing;
  return sid;
end $$;

-- pw_save_booking with a place: p_room null and p_place filled for an outside booking.
drop function if exists public.pw_save_booking(uuid, uuid, text, text, timestamptz, timestamptz, uuid, uuid[], integer);
create function public.pw_save_booking(
  p_id uuid, p_room uuid, p_title text, p_description text, p_starts timestamptz, p_ends timestamptz,
  p_booked_by uuid, p_participants uuid[], p_max_per_day integer, p_place text default null
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  saved uuid;
  day date := (p_starts at time zone 'Asia/Jakarta')::date;
  outside_place text := case when p_room is null then nullif(btrim(coalesce(p_place, '')), '') end;
begin
  if p_room is null and outside_place is null then raise exception 'PLACE_MISSING'; end if;
  if p_room is not null and not exists (select 1 from pw_rooms where id = p_room and bookable) then raise exception 'ROOM_NOT_BOOKABLE'; end if;
  perform pg_advisory_xact_lock(hashtext('pw_booking:' || p_booked_by::text || ':' || day::text));
  if (select count(*) from pw_room_bookings
      where booked_by = p_booked_by and status = 'aktif' and id is distinct from p_id
        and (starts_at at time zone 'Asia/Jakarta')::date = day) >= p_max_per_day then
    raise exception 'BOOKING_DAILY_LIMIT';
  end if;
  if p_id is null then
    insert into pw_room_bookings (room_id, place, title, description, starts_at, ends_at, booked_by)
    values (p_room, outside_place, btrim(p_title), btrim(p_description), p_starts, p_ends, p_booked_by)
    returning id into saved;
  else
    update pw_room_bookings
       set room_id = p_room, place = outside_place, title = btrim(p_title), description = btrim(p_description),
           starts_at = p_starts, ends_at = p_ends, updated_at = now()
     where id = p_id and status = 'aktif'
    returning id into saved;
    if saved is null then raise exception 'NOT_FOUND'; end if;
    delete from pw_room_booking_participants where booking_id = saved;
  end if;
  insert into pw_room_booking_participants (booking_id, employee_id)
  select saved, person from unnest(array_append(p_participants, p_booked_by)) as person
  on conflict do nothing;
  return saved;
end $$;

revoke all on function public.pw_save_booking(uuid, uuid, text, text, timestamptz, timestamptz, uuid, uuid[], integer, text) from public, anon, authenticated;
grant execute on function public.pw_save_booking(uuid, uuid, text, text, timestamptz, timestamptz, uuid, uuid[], integer, text) to service_role;
revoke all on function public.pw_sync_booking_session(uuid), public.pw_hold_booking() from public, anon, authenticated;
grant execute on function public.pw_sync_booking_session(uuid) to service_role;

commit;
