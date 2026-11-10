-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611050006.
--
-- Booking Kantor (decided 10 Nov 2026): the office's own booking app at /booking, outside WAM,
-- replacing booking.werkudaragroup.com. It writes to the SAME tables as WAM's Book ruang
-- (pw_rooms, pw_room_bookings, pw_room_booking_participants, through pw_save_booking), so a room
-- can never be taken twice whichever app the booking comes from: pw_booking_no_overlap and
-- pw_room_holds_no_overlap keep refusing an overlap as before.
--   * pw_room_bookings.source: 'wam' (every booking so far) or 'kantor'. A 'kantor' booking is NOT
--     turned into a WAM session (pw_sync_booking_session returns early), so it stays out of WAM's
--     agenda, notifications and attendance. It keeps its own room hold (pw_hold_booking), so
--     sessions and bookings still cannot overlap it.
--   * pw_room_bookings.audience / external_note: Internal or Eksternal with who the guest is, as
--     the old booking app asked.
--   * pw_roles gains 'ga': the administration staff who manage every booking in /booking/kelola.
--   * pw_save_booking gains p_source, p_audience and p_external_note (all optional), so WAM's
--     calls keep working unchanged. The daily limit still counts a person's bookings from both apps.
-- Hours, weekdays, the 30-minute step and the 4-hour limit are unchanged (202611050006).
-- Before this runs, /booking shows rooms and bookings but saving answers "menunggu migrasi".
--
-- ROLLBACK (by hand): cancel or delete the bookings with source 'kantor' first (or accept that they
-- become WAM sessions on their next change), delete the 'ga' rows of pw_roles and restore its
-- check, recreate pw_save_booking and pw_sync_booking_session from 202611050006, then drop the
-- source, audience and external_note columns.
begin;

alter table public.pw_room_bookings
  add column if not exists source text not null default 'wam' check (source in ('wam', 'kantor')),
  add column if not exists audience text not null default 'internal' check (audience in ('internal', 'eksternal')),
  add column if not exists external_note text;

alter table public.pw_room_bookings drop constraint if exists pw_booking_external;
alter table public.pw_room_bookings add constraint pw_booking_external check (
  (audience = 'internal' and external_note is null)
  or (audience = 'eksternal' and external_note is not null and char_length(btrim(external_note)) between 2 and 200)
);

alter table public.pw_roles drop constraint if exists pw_roles_role_check;
alter table public.pw_roles add constraint pw_roles_role_check check (role in ('panitia', 'bod', 'admin', 'ga'));

-- The same function as 202611050006, with one early return: a booking of the office app has no session.
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
  if b.source = 'kantor' then return null; end if;
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

-- pw_save_booking with where the booking comes from. p_audience null on an edit keeps what it had.
drop function if exists public.pw_save_booking(uuid, uuid, text, text, timestamptz, timestamptz, uuid, uuid[], integer, text);
create function public.pw_save_booking(
  p_id uuid, p_room uuid, p_title text, p_description text, p_starts timestamptz, p_ends timestamptz,
  p_booked_by uuid, p_participants uuid[], p_max_per_day integer, p_place text default null,
  p_source text default 'wam', p_audience text default null, p_external_note text default null
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  saved uuid;
  day date := (p_starts at time zone 'Asia/Jakarta')::date;
  outside_place text := case when p_room is null then nullif(btrim(coalesce(p_place, '')), '') end;
  note text := case when p_audience = 'eksternal' then nullif(btrim(coalesce(p_external_note, '')), '') end;
begin
  if p_room is null and outside_place is null then raise exception 'PLACE_MISSING'; end if;
  if p_room is not null and not exists (select 1 from pw_rooms where id = p_room and bookable) then raise exception 'ROOM_NOT_BOOKABLE'; end if;
  if p_audience = 'eksternal' and note is null then raise exception 'EXTERNAL_NOTE_MISSING'; end if;
  perform pg_advisory_xact_lock(hashtext('pw_booking:' || p_booked_by::text || ':' || day::text));
  if (select count(*) from pw_room_bookings
      where booked_by = p_booked_by and status = 'aktif' and id is distinct from p_id
        and (starts_at at time zone 'Asia/Jakarta')::date = day) >= p_max_per_day then
    raise exception 'BOOKING_DAILY_LIMIT';
  end if;
  if p_id is null then
    insert into pw_room_bookings (room_id, place, title, description, starts_at, ends_at, booked_by, source, audience, external_note)
    values (p_room, outside_place, btrim(p_title), btrim(p_description), p_starts, p_ends, p_booked_by, coalesce(p_source, 'wam'), coalesce(p_audience, 'internal'), note)
    returning id into saved;
  else
    update pw_room_bookings
       set room_id = p_room, place = outside_place, title = btrim(p_title), description = btrim(p_description),
           starts_at = p_starts, ends_at = p_ends,
           audience = coalesce(p_audience, audience),
           external_note = case when p_audience is null then external_note else note end,
           updated_at = now()
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

revoke all on function public.pw_save_booking(uuid, uuid, text, text, timestamptz, timestamptz, uuid, uuid[], integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.pw_save_booking(uuid, uuid, text, text, timestamptz, timestamptz, uuid, uuid[], integer, text, text, text, text) to service_role;

commit;
