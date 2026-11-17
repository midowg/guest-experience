-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor (Journey), after 202611160050_wellbeing.sql.
--
-- WLM Strava (18 Nov 2026, docs/rancangan-wellbeing.md "Strava"): one Strava API app of the office; each
-- employee connects their own Strava account. One row per connected employee, read and written by the
-- server only (service role): the tokens are encrypted by the app before they are stored and never go to a
-- browser. One Strava account belongs to one employee (athlete_id is unique).
begin;

create table if not exists public.wb_strava_links (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  athlete_id bigint not null unique,
  athlete_name text not null default '' check (char_length(athlete_name) <= 150),
  -- What the person allowed (space separated, as Strava answers), e.g. "read,activity:read_all".
  scope text not null default '' check (char_length(scope) <= 200),
  -- Encrypted by the app (AES-256-GCM); a new refresh token replaces the old one on every refresh.
  access_token text not null check (char_length(access_token) <= 1000),
  refresh_token text not null check (char_length(refresh_token) <= 1000),
  expires_at timestamptz not null,
  -- ok, or reconnect when Strava refused the tokens (revoked, expired): the person connects again.
  status text not null default 'ok' check (status in ('ok', 'reconnect')),
  -- The person agreed that the points of their Strava activities count on the board (only totals show).
  consent_at timestamptz not null default now(),
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_error text check (char_length(last_error) <= 300),
  -- One refresh at a time: a refresh holds this until it is done (or the time passes).
  refreshing_until timestamptz,
  updated_at timestamptz not null default now()
);
comment on table public.wb_strava_links is 'WLM: akun Strava yang disambungkan karyawan (token terenkripsi, hanya server).';

alter table public.wb_strava_links enable row level security;
revoke all on public.wb_strava_links from public, anon, authenticated;

commit;
