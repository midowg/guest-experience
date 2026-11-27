-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Pra WAM: rooms fit the booking. Each room gets the fewest people it is meant for (a big room is
-- not taken for a one-on-one) next to its capacity, and the spot on the office floor plan the super
-- admin picked for it. One app setting: whether the floor plan shows in Book at all.
-- Needs 202611040001. Server only (service role).
begin;

alter table public.pw_rooms
  add column min_people integer check (min_people is null or min_people between 1 and 500),
  -- A key of the floor plan's spots (src/lib/pra-wam/floor-plan.ts), e.g. 'nagapadma'; null = matched by name.
  add column plan_key text check (plan_key is null or plan_key ~ '^[a-z0-9-]{2,40}$'),
  add constraint pw_rooms_people_order check (min_people is null or capacity is null or min_people <= capacity);

create unique index pw_rooms_plan_key on public.pw_rooms (plan_key) where plan_key is not null;

create table public.pw_app_settings (
  id boolean primary key default true check (id),
  floor_plan boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.pw_app_settings enable row level security;
revoke all on public.pw_app_settings from public, anon, authenticated;
grant select, insert, update, delete on public.pw_app_settings to service_role;

commit;
