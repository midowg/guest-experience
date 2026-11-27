-- LOCAL REVIEW ONLY. Run by the owner in the Supabase SQL Editor, after 202612030001.
--
-- TV Announcement: who opens the TV addresses (27 Nov 2026, asked by the owner). The addresses
-- (/tv, /tv/lite, /tv/{alamat}, /tv/{alamat}/lite) are open with no sign-in, so what is kept is the
-- device, never the person: one line per device, address and day, with what kind of device it is,
-- its browser, its screen size, which version of the board it got, and when it was first and last
-- seen that day. Admin TV → Pantauan shows the last seven days; lines older than thirty days are
-- removed by the app.
--
-- No network address is kept. "device" and "net" are marks made from it (and from the browser's
-- name) with the server's own secret: the same device or network gives the same mark, and the
-- address cannot be read back from it. No name, no account, no cookie.
--
-- Until this runs nothing is noted, and Pantauan says it waits for this migration.
--
-- ROLLBACK:
--   begin;
--   drop table if exists public.pw_tv_visits;
--   commit;

begin;

create table public.pw_tv_visits (
  id uuid primary key default gen_random_uuid(),
  device text not null check (device ~ '^[0-9a-f]{16}$'),
  net text not null check (net ~ '^[0-9a-f]{8}$'),
  -- The address opened, as a path: "/tv", "/tv/lite", "/tv/lobi".
  address text not null check (char_length(address) between 1 and 80),
  version text not null check (version in ('papan', 'lite', 'hp')),
  -- The day in WIB.
  day date not null,
  kind text not null check (kind in ('tv', 'hp', 'tablet', 'komputer')),
  -- "TV Samsung · Samsung Internet 2", "HP Android · Chrome 131".
  name text not null check (char_length(name) between 1 and 80),
  width integer check (width between 1 and 20000),
  height integer check (height between 1 and 20000),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (device, address, day)
);
create index pw_tv_visits_day on public.pw_tv_visits (day, last_seen_at desc);

alter table public.pw_tv_visits enable row level security;
revoke all on public.pw_tv_visits from public, anon, authenticated;
grant select, insert, update, delete on public.pw_tv_visits to service_role;

commit;
