-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Data karyawan: one list of Werkudara's people for every Journey app (Pantry / Kopi Kantor, PIC
-- pickers, and the apps to come). The super admin imports it from HR's Excel and keeps it in the
-- admin; it is personal data, so only the server reads it (service role), never a guest page.
begin;

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 150),
  -- One person per name: the import matches rows by it, so a second import updates instead of doubling.
  name_key text generated always as (upper(regexp_replace(btrim(full_name), '\s+', ' ', 'g'))) stored unique,
  nickname text not null default '' check (char_length(nickname) <= 60),
  department text not null default '' check (char_length(department) <= 150),
  position text not null default '' check (char_length(position) <= 150),
  -- The company code from HR's sheet (WNS, TEE, MRP).
  office text not null default '' check (char_length(office) <= 20),
  -- What an app needs to know about the person: Pantry's monthly allowance follows the category.
  category text not null default 'karyawan' check (category in ('karyawan', 'ga', 'intern')),
  phone text not null default '' check (char_length(phone) <= 30),
  email text not null default '' check (char_length(email) <= 200),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index employees_order on public.employees (active desc, department, full_name);

alter table public.employees enable row level security;
revoke all on public.employees from public, anon, authenticated;
grant select, insert, update, delete on public.employees to service_role;

commit;
