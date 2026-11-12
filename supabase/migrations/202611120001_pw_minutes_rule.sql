-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- WAM Notulen (MoM), 12 Nov 2026: which meetings need a MoM is set in Admin WAM instead of fixed in
-- the code.
--   * pw_settings: small app settings by key. 'minutes_rule' holds the rule per session kind and
--     for one-on-ones, {"forum": true, "rapat": true, "acara": false, "berdua": false}: the rule
--     of 11 Nov 2026, so nothing changes until an admin changes it.
--   * pw_sessions.minutes_required: one session's own choice; null follows the rule, true always
--     needs a MoM, false never.
-- Server only (service role). Needs 202611040004 (pw_sessions).
begin;

create table if not exists public.pw_settings (
  key text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.pw_settings enable row level security;
revoke all on public.pw_settings from anon, authenticated;

insert into public.pw_settings (key, value)
values ('minutes_rule', '{"forum": true, "rapat": true, "acara": false, "berdua": false}'::jsonb)
on conflict (key) do nothing;

alter table public.pw_sessions add column if not exists minutes_required boolean;

commit;
