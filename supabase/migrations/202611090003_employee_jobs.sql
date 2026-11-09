-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611090002.
--
-- Pekerjaan karyawan (decided 9 Nov 2026): one person may hold more than one job, each in a
-- Business Unit of Werkudara Group with its own department and post. Set in Data karyawan
-- (Ubah karyawan → Pekerjaan), one card per job, in this order: Business Unit, Departemen, Posisi
-- (HOD | Lead | Jabatan; a Jabatan names its title and who it is under: the HOD or a Lead).
--   * employee_jobs: one row per job; sort_order 0 is the Utama job.
--   * The Utama job is also copied to employees (department, position, business_unit, office,
--     reports_to), so every reader of those columns keeps working.
--   * pw_leads stays the table the app reads for HOD and Lead: the app writes one 'departemen'
--     row per HOD job and one 'lead' row per Lead job (name = that job's department).
--   * Filled from today's data: a Utama row per person with a department (post from pw_leads),
--     and a HOD row for every other department they head.
-- Before this runs, Ubah karyawan saves the Utama job to employees and pw_leads only, and says
-- the other jobs wait for this migration.
--
-- ROLLBACK (by hand): drop table public.employee_jobs;
-- (employees and pw_leads keep the Utama job and the HOD/Lead rows, so nothing else is lost.)
begin;

create table if not exists public.employee_jobs (
  employee_id uuid not null references public.employees (id) on delete cascade,
  sort_order smallint not null check (sort_order between 0 and 19),
  business_unit text not null check (char_length(btrim(business_unit)) between 1 and 120),
  department text not null check (char_length(btrim(department)) between 1 and 150),
  post text not null default 'staf' check (post in ('hod', 'lead', 'staf')),
  job_title text not null default '' check (char_length(job_title) <= 150),
  reports_to uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (employee_id, sort_order),
  constraint employee_jobs_reports_to_self check (reports_to is null or reports_to <> employee_id),
  -- A HOD or a Lead sits under nobody here: a Lead is under the HOD of their department by rule.
  constraint employee_jobs_reports_to_staf check (post = 'staf' or reports_to is null)
);
create index if not exists employee_jobs_department on public.employee_jobs (department);
create index if not exists employee_jobs_reports_to on public.employee_jobs (reports_to);
alter table public.employee_jobs enable row level security;
revoke all on public.employee_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.employee_jobs to service_role;

-- The Utama job of everyone with a department.
insert into public.employee_jobs (employee_id, sort_order, business_unit, department, post, job_title, reports_to)
select e.id, 0,
  coalesce(nullif(btrim(e.business_unit), ''), 'WNS'),
  btrim(e.department),
  p.post,
  left(coalesce(e.position, ''), 150),
  case when p.post = 'staf' and e.reports_to <> e.id then e.reports_to else null end
from public.employees e
cross join lateral (
  select case
    when exists (select 1 from public.pw_leads l where l.employee_id = e.id and l.kind = 'departemen' and btrim(l.name) = btrim(e.department)) then 'hod'
    when exists (select 1 from public.pw_leads l where l.employee_id = e.id and l.kind = 'lead') then 'lead'
    else 'staf'
  end as post
) p
where btrim(coalesce(e.department, '')) <> ''
on conflict (employee_id, sort_order) do nothing;

-- Every other department they head: a HOD job of its own, in the same Business Unit.
insert into public.employee_jobs (employee_id, sort_order, business_unit, department, post, job_title, reports_to)
select h.employee_id, h.n, h.business_unit, h.name, 'hod', '', null
from (
  select l.employee_id, btrim(l.name) as name, coalesce(nullif(btrim(e.business_unit), ''), 'WNS') as business_unit,
    (row_number() over (partition by l.employee_id order by btrim(l.name)))::smallint as n
  from public.pw_leads l
  join public.employees e on e.id = l.employee_id
  where l.kind = 'departemen'
    and btrim(coalesce(e.department, '')) <> ''
    and btrim(l.name) <> btrim(e.department)
) h
where h.n <= 19
on conflict (employee_id, sort_order) do nothing;

commit;
