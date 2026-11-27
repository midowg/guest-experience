-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Two WAM admin doors and the WAM committee per event (20 Nov 2026, keputusan pemilik; docs/main-wam/KONTRAK.md §15):
-- Pra WAM's committee and admins are not the WAM team.
--   1. Super admin → Akses admin may give "Admin WAM 2026" (app 'wam_acara'): the admin of the WAM event itself
--      (Main WAM, /admin/wam2026). Admin Pra WAM ('wam', /admin/wam) no longer opens it. Nobody gets it
--      automatically: until the super admin ticks it per person, only the super admin opens Admin WAM 2026.
--   2. pw_event_staff: the committee of one event (docs/rancangan-main-wam.md, "Peran per acara"), with a seksi that
--      is only a label. Main WAM reads its committee (tab Panitia, panitia's tools, penguji) from here for the WAM
--      event (pw_events.kind = 'wam'), no longer from the global role in pw_roles. Pra WAM's committee stays in
--      pw_roles, unchanged; nobody is copied over.
-- Server only (service role). Needs 202611130012 (admin_grants), 202611160050 (its last apps check) and pw_events.
-- ROLLBACK (by hand): drop table public.pw_event_staff;
--   update public.admin_grants set apps = array_remove(apps, 'wam_acara');
--   then restore the apps check without 'wam_acara'.
-- Order-safe (24 Nov 2026): the apps check below also keeps 'hr' (202611200703, which may have run first). Without it
-- this migration fails after 0703 once someone holds 'hr' ("violates check constraint"), rolls back whole, and
-- pw_event_staff is never made (production, 21–24 Nov 2026: the table was not there after it was run).
begin;

alter table public.admin_grants drop constraint if exists admin_grants_apps_check;
alter table public.admin_grants add constraint admin_grants_apps_check
  check (apps <@ array['acara', 'friday_sharing', 'your_visit', 'wam', 'kuesioner', 'tv', 'wellbeing', 'wam_acara', 'hr']::text[]);

create table if not exists public.pw_event_staff (
  event_id uuid not null references public.pw_events (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  -- A label only (kamar, acara, konsumsi, dokumentasi …): every seksi has the same rights.
  seksi text not null default '' check (char_length(seksi) <= 40),
  granted_at timestamptz not null default now(),
  granted_by text not null default '' check (char_length(granted_by) <= 150),
  primary key (event_id, employee_id)
);
-- Deleting a person, and "is this person on the committee of an event" (audit L1).
create index if not exists pw_event_staff_employee on public.pw_event_staff (employee_id);

alter table public.pw_event_staff enable row level security;
revoke all on public.pw_event_staff from public, anon, authenticated;
grant select, insert, update, delete on public.pw_event_staff to service_role;
-- admin_grants keeps its grants (202611130012), stated again.
revoke all on public.admin_grants from public, anon, authenticated;
grant select, insert, update, delete on public.admin_grants to service_role;

commit;
