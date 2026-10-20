-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Which event modules regular admins may use, set by the super admin. One row. Server only:
-- unlike site_settings it is not readable by guests. The app enforces the list on save.
begin;

create table public.admin_settings (
  id boolean primary key default true check (id),
  disabled_modules text[] not null default '{}' check (disabled_modules <@ array[
    'experience','agenda','location','route','gallery','prepare','team','rsvp','personal','contact','bilingual','feedback','review','collaboration'
  ]::text[]),
  updated_at timestamptz not null default now()
);
insert into public.admin_settings (id) values (true);

alter table public.admin_settings enable row level security;
revoke all on public.admin_settings from public, anon, authenticated;
grant select, update on public.admin_settings to service_role;

commit;
