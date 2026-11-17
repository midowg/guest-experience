-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Main WAM, agen A (peserta): Kelompok & kamar (L01) reads the kelompok kegiatan of one person
-- (activityGroups({ employeeId }), src/lib/server/main-wam/read.ts) on every visit. The table's keys
-- start with the group or the session, so that read scanned the table; this index serves it.
-- Needs 202611200001 (mw_activity_group_members). No data changes; the app works without it.
-- ROLLBACK (by hand): drop index public.mw_activity_group_members_person;
begin;

create index if not exists mw_activity_group_members_person on public.mw_activity_group_members (employee_id);

commit;
