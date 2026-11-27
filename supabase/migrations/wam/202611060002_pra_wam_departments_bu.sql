-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611060001.
--
-- Departemen dan BU (decided 6 Nov 2026):
--   * Every person in Data karyawan belongs to a business unit (BU), such as Werkudara Nirwana Sakti
--     (WNS) or Maha Raja Pratama (MRP). Not filled in yet, so everyone starts in Werkudara Nirwana
--     Sakti; the super admin changes it per person later.
--   * Who heads what, set by hand in Admin WAM (Akun dan peran) or Data karyawan: a person may be
--     HOD of several departments (Sofyan: Center of Excellence and Art & Creative Support) and lead
--     of a BU (Yulia Mekar: HOD of Business & Administrative Services, lead of BU Maha Raja Pratama).
--     Departments are the department names of Data karyawan; BUs are BU names.
--   * HOD is no longer a role to tick: a person is HOD while they head at least one department.
--     The HOD ticks saved with 202611060001 become HOD of the person's own department.
--   * A meeting invite keeps the department it was sent for (a HOD may head several).
--
-- ROLLBACK (by hand): drop table pw_leads; alter table employees drop column business_unit;
-- alter table pw_hod_meeting_invites drop column department.
begin;

alter table public.employees add column if not exists business_unit text not null default 'Werkudara Nirwana Sakti';
alter table public.employees drop constraint if exists employees_business_unit_length;
alter table public.employees add constraint employees_business_unit_length check (char_length(btrim(business_unit)) between 1 and 120);

create table if not exists public.pw_leads (
  employee_id uuid not null references public.employees (id) on delete cascade,
  kind text not null check (kind in ('departemen', 'bu')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (employee_id, kind, name)
);
create index if not exists pw_leads_kind_name on public.pw_leads (kind, name);
alter table public.pw_leads enable row level security;
revoke all on public.pw_leads from public, anon, authenticated;
grant select, insert, update, delete on public.pw_leads to service_role;

-- The HOD ticks of 202611060001 become HOD of the person's own department.
insert into public.pw_leads (employee_id, kind, name)
select r.employee_id, 'departemen', btrim(e.department)
from public.pw_roles r join public.employees e on e.id = r.employee_id
where r.role = 'hod' and btrim(coalesce(e.department, '')) <> ''
on conflict do nothing;
delete from public.pw_roles where role = 'hod';

alter table public.pw_hod_meeting_invites add column if not exists department text not null default '';

commit;
