-- Execute ONLY against the disposable PostgreSQL migration-check container.
-- Migration 202611200101 (agen A, peserta): the reads of Beranda, Agenda and Saya by one person are
-- served by an index (check-ins, seats, kelompok kegiatan, notification receipts), and the tables
-- they read stay server only.
begin;
set local role service_role;
do $$
declare
  missing text;
begin
  select string_agg(wanted, ', ') into missing
  from unnest(array['mw_activity_group_members_person', 'mw_attendance_person', 'mw_trip_seats_person', 'pw_receipts_person', 'mw_rundown_log_session']) as wanted
  where not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = wanted);
  if missing is not null then raise exception 'missing index for agen A reads: %', missing; end if;

  if (select indexdef from pg_indexes where indexname = 'mw_activity_group_members_person') not like '%(employee_id)%' then
    raise exception 'mw_activity_group_members_person should be on employee_id';
  end if;
  raise notice 'PASS: agen A reads by person are indexed';
end $$;

-- Server only: the participant-facing tables are not readable with the public keys.
reset role;
do $$
declare
  open_table text;
begin
  select string_agg(t, ', ') into open_table
  from unnest(array['mw_sessions', 'mw_attendance', 'mw_groups', 'mw_group_members', 'mw_activity_groups', 'mw_activity_group_members', 'mw_trips', 'mw_trip_seats', 'mw_guides', 'mw_notes', 'mw_rundown_log']) as t
  where has_table_privilege('anon', format('public.%I', t), 'select') or has_table_privilege('authenticated', format('public.%I', t), 'select');
  if open_table is not null then raise exception 'readable with a public key: %', open_table; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.mw_activity_group_members'::regclass) then raise exception 'RLS off on mw_activity_group_members'; end if;
  raise notice 'PASS: agen A tables stay server only';
end $$;
rollback;
