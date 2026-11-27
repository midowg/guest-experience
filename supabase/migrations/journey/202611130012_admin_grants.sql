-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611130007.
--
-- Admin per orang (decided 13 Nov 2026): admins sign in with their own WAM account instead of the
-- shared admin password; the super admin password stays as the way in of last resort.
--   * admin_grants: who is an admin and what they open: whole apps (Acara, Friday Sharing, Your
--     Visit, Admin WAM, TV kantor), every event or picked events. No row = not an admin.
--   * staff_members.employee_id: the Data karyawan person behind a Tim Werkudara entry, so the
--     PIC of an event opens it by themselves.
--   * admin_access_log.employee_id / actor: the log names the person (or what was typed when a
--     sign-in failed), not only the device.
-- From the moment this runs, the shared admin password no longer signs in (sessions opened with
-- it end too). Give the admins their access right after: Super admin → Akses admin.
-- Nothing existing is changed or removed.
--
-- ROLLBACK (by hand): drop table if exists public.admin_grants;
--   alter table public.staff_members drop column if exists employee_id;
--   alter table public.admin_access_log drop column if exists employee_id, drop column if exists actor;
begin;

create table if not exists public.admin_grants (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  apps text[] not null default '{}' check (apps <@ array['acara', 'friday_sharing', 'your_visit', 'wam', 'tv']::text[]),
  all_events boolean not null default false,
  event_ids uuid[] not null default '{}' check (cardinality(event_ids) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_grants enable row level security;
revoke all on public.admin_grants from public, anon, authenticated;
grant select, insert, update, delete on public.admin_grants to service_role;

alter table public.staff_members add column if not exists employee_id uuid references public.employees (id) on delete set null;
create unique index if not exists staff_members_employee on public.staff_members (employee_id) where employee_id is not null;

alter table public.admin_access_log
  add column if not exists employee_id uuid references public.employees (id) on delete set null,
  add column if not exists actor text check (actor is null or char_length(actor) <= 200);
create index if not exists admin_access_log_employee on public.admin_access_log (employee_id, at desc);

commit;
