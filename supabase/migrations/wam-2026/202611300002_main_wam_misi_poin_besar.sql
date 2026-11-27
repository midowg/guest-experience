-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization (the owner runs it).
-- Main WAM, Misi: points x10 (keputusan pemilik 24 Nov 2026). A mission is now worth 300 to 1.500 points
-- (templates), so the columns must take tens of thousands: mw_missions.points and mw_point_entries.points
-- go from +-1.000 to +-100.000. Existing missions and ledger rows are NOT changed (no data migration):
-- an admin edits the points of missions already made. Needs 202611260001 (Misi).
-- ROLLBACK (by hand; fails if a row already holds more than 1.000):
--   alter table public.mw_missions drop constraint mw_missions_points_range;
--   alter table public.mw_missions add constraint mw_missions_points_check check (points between 0 and 1000);
--   alter table public.mw_point_entries drop constraint mw_point_entries_points_range;
--   alter table public.mw_point_entries add constraint mw_point_entries_points_check check (points between -1000 and 1000 and points <> 0);
begin;

alter table public.mw_missions drop constraint if exists mw_missions_points_check;
alter table public.mw_missions add constraint mw_missions_points_range check (points between 0 and 100000);

alter table public.mw_point_entries drop constraint if exists mw_point_entries_points_check;
alter table public.mw_point_entries add constraint mw_point_entries_points_range check (points between -100000 and 100000 and points <> 0);

commit;
