-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611130004.
--
-- Booking di luar WAM (decided 13 Nov 2026): a participant may book a room for something that is
-- not a WAM meeting (a client visit, an interview, personal use). It stays on the room schedule
-- and the calendar as any booking does, but its session asks for no check-in and no MoM.
-- pw_room_bookings.purpose: 'wam' (every booking so far, the default) or 'lain'.
-- One column only; existing bookings stay 'wam'.
--
-- ROLLBACK (by hand): alter table public.pw_room_bookings drop column if exists purpose;
begin;

alter table public.pw_room_bookings add column if not exists purpose text not null default 'wam';
alter table public.pw_room_bookings drop constraint if exists pw_room_bookings_purpose;
alter table public.pw_room_bookings add constraint pw_room_bookings_purpose check (purpose in ('wam', 'lain'));

commit;
