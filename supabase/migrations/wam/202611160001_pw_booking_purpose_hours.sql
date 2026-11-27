-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611130005.
-- Safe to run again (17 Nov 2026: the first version replaced a check that does not exist,
-- pw_room_bookings_span, and left the 4-hour limit, pw_booking_order, in place; run this one).
--
-- Booking ruangan di luar WAM (decided 16 Nov 2026): a booking for something outside WAM
-- (purpose = 'lain') may freely set its hours: longer than 4 hours, at any hour of the day
-- (00.00–23.30), and on weekends, just as Di luar kantor does, while still holding the room.
--
-- ROLLBACK (by hand):
--   alter table public.pw_room_bookings drop constraint if exists pw_booking_hours;
--   alter table public.pw_room_bookings add constraint pw_booking_hours check (
--     (starts_at at time zone 'Asia/Jakarta')::date = (ends_at at time zone 'Asia/Jakarta')::date
--     and (room_id is null or ((starts_at at time zone 'Asia/Jakarta')::time >= time '07:00' and (ends_at at time zone 'Asia/Jakarta')::time <= time '22:00' and extract(isodow from starts_at at time zone 'Asia/Jakarta') between 1 and 5))
--   );
--   alter table public.pw_room_bookings drop constraint if exists pw_booking_order;
--   alter table public.pw_room_bookings add constraint pw_booking_order check (
--     ends_at > starts_at and (room_id is null or ends_at - starts_at <= interval '4 hours')
--   );
begin;

alter table public.pw_room_bookings drop constraint if exists pw_booking_hours;
alter table public.pw_room_bookings add constraint pw_booking_hours check (
  (starts_at at time zone 'Asia/Jakarta')::date = (ends_at at time zone 'Asia/Jakarta')::date
  and (
    room_id is null
    or purpose = 'lain'
    or (
      (starts_at at time zone 'Asia/Jakarta')::time >= time '07:00'
      and (ends_at at time zone 'Asia/Jakarta')::time <= time '22:00'
      and extract(isodow from starts_at at time zone 'Asia/Jakarta') between 1 and 5
    )
  )
);

-- The 4-hour limit is pw_booking_order (202611050006); the first version's extra check goes.
alter table public.pw_room_bookings drop constraint if exists pw_room_bookings_span;
alter table public.pw_room_bookings drop constraint if exists pw_booking_order;
alter table public.pw_room_bookings add constraint pw_booking_order check (
  ends_at > starts_at and (room_id is null or purpose = 'lain' or ends_at - starts_at <= interval '4 hours')
);

commit;
