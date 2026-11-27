-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611060002.
--
-- Meeting HOD books its room (decided 6 Nov 2026): a meeting keeps the office room picked when it
-- was asked for. Once every invited HOD accepts, that room is booked in the name of the HOD who
-- asked, with the invited HODs as participants (so it holds the room and shows in their agenda);
-- cancelling the meeting cancels that booking.
--
-- ROLLBACK (by hand): alter table pw_hod_meetings drop column booking_id, drop column room_id.
begin;

alter table public.pw_hod_meetings add column if not exists room_id uuid references public.pw_rooms (id) on delete set null;
alter table public.pw_hod_meetings add column if not exists booking_id uuid references public.pw_room_bookings (id) on delete set null;

commit;
