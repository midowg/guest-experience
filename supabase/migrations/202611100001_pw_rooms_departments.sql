-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611040009.
--
-- Ruang khusus departemen (decided 10 Nov 2026): a room may be kept for some departments only,
-- e.g. Ruang 4 for Sales & Marketing. Set in Admin WAM → Ruang dan denah (Khusus departemen),
-- where admins also add rooms themselves now.
--   * pw_rooms.departments: the departments that may book the room, by name as in Data karyawan
--     (employees.department and the jobs of employee_jobs). Empty = every department.
--   * The app checks it when a booking is saved and greys the room out for everyone else.
-- Before this runs, rooms can still be added and edited, but not kept for departments.
--
-- ROLLBACK (by hand): alter table public.pw_rooms drop column departments;
begin;

alter table public.pw_rooms
  add column if not exists departments text[] not null default '{}'
    check (cardinality(departments) <= 30);

commit;
