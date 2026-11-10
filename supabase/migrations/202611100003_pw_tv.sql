-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- TV Announcement (Admin WAM → TV Announcement, 10 Nov 2026): office TVs open one secret address
-- each and play the room calendar (today, and this week) and the pictures uploaded here. A TV has no sign-in: its
-- address holds a key, of which only the sha256 is kept (as MCP keys are). The pictures live in
-- private storage under pra-wam/tv/. Every TV shows the same content.
-- ROLLBACK (by hand): drop table public.pw_tv_slides, public.pw_tv_screens, public.pw_tv_settings;
begin;

create table public.pw_tv_screens (
  id uuid primary key default gen_random_uuid(),
  -- Where the TV is, for the admin's list: "Lobi", "Pantry lantai 2".
  name text not null check (char_length(btrim(name)) between 2 and 60),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  -- The key's last four characters, to tell addresses apart.
  key_hint text not null default '' check (char_length(key_hint) <= 8),
  -- When the TV last asked for content, and how big its screen was then.
  last_seen_at timestamptz,
  last_width integer check (last_width between 1 and 20000),
  last_height integer check (last_height between 1 and 20000),
  created_at timestamptz not null default now()
);

create table public.pw_tv_slides (
  id uuid primary key default gen_random_uuid(),
  image_key text not null unique check (image_key like 'pra-wam/tv/%'),
  title text not null default '' check (char_length(title) <= 80),
  seconds integer not null default 8 check (seconds between 3 and 120),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index pw_tv_slides_order on public.pw_tv_slides (sort_order, created_at);

-- One row: which calendars are shown (today's rooms against the hours, the week a column per
-- day), and for how long each stays on screen.
create table public.pw_tv_settings (
  id boolean primary key default true check (id),
  show_day boolean not null default true,
  day_seconds integer not null default 20 check (day_seconds between 5 and 120),
  show_week boolean not null default true,
  week_seconds integer not null default 20 check (week_seconds between 5 and 120),
  updated_at timestamptz not null default now()
);
insert into public.pw_tv_settings default values;

alter table public.pw_tv_screens enable row level security;
alter table public.pw_tv_slides enable row level security;
alter table public.pw_tv_settings enable row level security;
revoke all on public.pw_tv_screens, public.pw_tv_slides, public.pw_tv_settings from public, anon, authenticated;
grant select, insert, update, delete on public.pw_tv_screens, public.pw_tv_slides, public.pw_tv_settings to service_role;

commit;
