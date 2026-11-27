-- Admin login now uses one shared password (ADMIN_PASSWORD) checked by the app server.
-- Every sign-in attempt and sign-out is appended here by the server (service role only).
-- The log is append-only for the app: no update or delete grant.
begin;

create table public.admin_access_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default clock_timestamp(),
  kind text not null check (kind in ('login_success','login_failure','logout')),
  ip text check (ip is null or length(ip) <= 64),
  country text check (country is null or length(country) <= 8),
  region text check (region is null or length(region) <= 64),
  city text check (city is null or length(city) <= 120),
  user_agent text check (user_agent is null or length(user_agent) <= 500),
  device_id uuid,
  new_device boolean not null default false
);

create index admin_access_log_at_idx on public.admin_access_log (at desc);
create index admin_access_log_device_idx on public.admin_access_log (device_id) where kind = 'login_success';

alter table public.admin_access_log enable row level security;
revoke all on public.admin_access_log from public, anon, authenticated;
grant select, insert on public.admin_access_log to service_role;

comment on table public.admin_access_log is 'Shared-password admin sign-ins: time, IP, approximate place, user agent, and a random per-browser device id. Not a person identifier.';

commit;
