-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Tim Werkudara: the people who can be an event's PIC. The super admin keeps the list; picking
-- someone copies their name, role, number and photo into the event, so guests never read this
-- table and a later edit here does not change past events. Server only (service role).
begin;

create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 150),
  role text not null default '' check (char_length(role) <= 150),
  phone text not null default '' check (char_length(phone) <= 30),
  photo jsonb not null default '{"url":"","alt":"","srcset":[]}'::jsonb check (jsonb_typeof(photo) = 'object'),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index staff_members_order on public.staff_members (active desc, sort_order, name);

alter table public.staff_members enable row level security;
revoke all on public.staff_members from public, anon, authenticated;
grant select, insert, update, delete on public.staff_members to service_role;

commit;
