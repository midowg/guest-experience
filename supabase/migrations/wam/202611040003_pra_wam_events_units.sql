-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Pra WAM, tahap 1b: the two events of the one app (Pra WAM now, WAM prepared) with the modules
-- the admin switches on, and Werkudara's units: departments and BUs, who belongs to which, under
-- what title, and who leads it. One person can be in several units and lead more than one
-- (Yulia: BAS and BU MRP; Sofyan: CoE and ACS). Needs 202611040001. Server only (service role).
begin;

create table public.pw_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  kind text not null check (kind in ('pra_wam', 'wam')),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  -- aktif: shown to everyone; disiapkan: data is gathered, the app does not show it yet.
  status text not null default 'disiapkan' check (status in ('aktif', 'disiapkan', 'selesai')),
  -- Which parts of the app are open, e.g. {"appraisal": true}.
  modules jsonb not null default '{}'::jsonb check (jsonb_typeof(modules) = 'object'),
  updated_at timestamptz not null default now()
);

insert into public.pw_events (slug, name, kind, start_date, end_date, status, modules) values
  ('pra-wam-2026', 'Pra WAM 2026', 'pra_wam', '2026-10-28', '2026-12-23', 'aktif', '{"appraisal": true}'),
  ('wam-2027', 'WAM 2027', 'wam', '2027-01-04', '2027-01-07', 'disiapkan', '{}');

create table public.org_units (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('departemen', 'bu')),
  name text not null check (char_length(btrim(name)) between 2 and 150),
  code text check (code is null or char_length(code) between 1 and 12),
  sort_order integer not null default 0,
  unique (kind, name)
);

create table public.unit_members (
  unit_id uuid not null references public.org_units (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  job_title text not null default '' check (char_length(job_title) <= 150),
  is_lead boolean not null default false,
  -- The person's own department or BU (one of each kind), as in Data karyawan.
  is_primary boolean not null default false,
  primary key (unit_id, employee_id)
);
create index unit_members_person on public.unit_members (employee_id);

alter table public.pw_events enable row level security;
alter table public.org_units enable row level security;
alter table public.unit_members enable row level security;
revoke all on public.pw_events, public.org_units, public.unit_members from public, anon, authenticated;
grant select, insert, update, delete on public.pw_events, public.org_units, public.unit_members to service_role;

commit;
