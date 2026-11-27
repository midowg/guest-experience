-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor.
--
-- Book ruang hours become 07.00–22.00 WIB (decided 5 Nov 2026), still Monday to Friday, one day,
-- at most 4 hours (pw_booking_order is unchanged). Replaces the 09.00–18.00 check of
-- 202611040001_pra_wam_appraisal.sql. Bookings already stored all fall inside the wider hours.

alter table public.pw_room_bookings drop constraint if exists pw_booking_hours;
alter table public.pw_room_bookings add constraint pw_booking_hours check (
  (starts_at at time zone 'Asia/Jakarta')::date = (ends_at at time zone 'Asia/Jakarta')::date
  and (starts_at at time zone 'Asia/Jakarta')::time >= time '07:00'
  and (ends_at at time zone 'Asia/Jakarta')::time <= time '22:00'
  and extract(isodow from starts_at at time zone 'Asia/Jakarta') between 1 and 5
);
