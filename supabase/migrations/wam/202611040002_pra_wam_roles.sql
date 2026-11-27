-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Pra WAM, tahap 1: NIP in Data karyawan, and the roles that change what a person sees after
-- signing in. Everyone with an account is a peserta; a role adds to that. Panitia is set freely
-- by the admin in the app; BOD starts with Pak Fadli and Pak Bagus. Needs 202611040001.
begin;

-- Empty for now; unique once filled.
alter table public.employees add column nip text check (nip is null or nip ~ '^[0-9A-Za-z.-]{1,30}$');
create unique index employees_nip on public.employees (nip) where nip is not null;

create table public.pw_roles (
  employee_id uuid not null references public.employees (id) on delete cascade,
  -- panitia: runs the forums and may cancel any booking; bod: reads everything, changes nothing;
  -- admin: accounts, roles and rooms in the app.
  role text not null check (role in ('panitia', 'bod', 'admin')),
  granted_at timestamptz not null default now(),
  primary key (employee_id, role)
);

-- BOD as confirmed by the owner on 3 Nov 2026. A name that is not in Data karyawan yet adds nothing.
insert into public.pw_roles (employee_id, role)
select id, 'bod' from public.employees
where name_key in ('FADLI FAHMI ALI', 'I GUSTI PUTU YAKTIANURAGA')
on conflict do nothing;

alter table public.pw_roles enable row level security;
revoke all on public.pw_roles from public, anon, authenticated;
grant select, insert, update, delete on public.pw_roles to service_role;

commit;
