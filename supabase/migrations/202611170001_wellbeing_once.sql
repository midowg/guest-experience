-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611160050_wellbeing.sql.
--
-- Wellbeing (decided 17 Nov 2026, review of the employee app): the app refuses a daily activity
-- logged twice on one day, but two sends at the same moment could both pass that check and count
-- twice. The database now keeps one: a daily (non-sport) activity logged in the app, not rejected,
-- once per person, type and day. Imported rows from the old app (source 'import') and sports are
-- left out (the old app allowed repeats; several sports a day are normal).
-- The app keeps working before this runs (it checks in code as well).
--
-- ROLLBACK (by hand): drop index public.wb_activities_daily_once;
begin;

create unique index if not exists wb_activities_daily_once
  on public.wb_activities (employee_id, type_code, happened_on)
  where status <> 'rejected' and source = 'manual' and type_code not like 'sport.%';

commit;
