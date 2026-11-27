-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611060003.
--
-- MCP WAM (decided 6 Nov 2026): BOD and a few chosen people connect Claude or ChatGPT to WAM and
-- ask about the data in their own words. Read only; every answer runs as the person, so what the
-- app hides from them (drafts, "Hanya dibaca fasilitator", Data HR) stays hidden.
--   * pw_mcp_access: one row per person an admin allows, with what they may ask about (scopes).
--     Revoking keeps the row (revoked_at) so it can be restored; the key stops working at once.
--   * The key itself is never stored: only its sha256 (key_hash) and its last four characters
--     (key_hint) so the person recognises it. A new key replaces the old one.
--   * pw_mcp_log: one row per tool call, for the admin's "Panggilan terakhir" and the person's own.
--
-- ROLLBACK (by hand): drop table pw_mcp_log; drop table pw_mcp_access;
begin;

create table if not exists public.pw_mcp_access (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  scopes text[] not null check (cardinality(scopes) <= 20),
  granted_by text,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  key_hash text unique check (key_hash is null or key_hash ~ '^[0-9a-f]{64}$'),
  key_hint text check (key_hint is null or char_length(key_hint) = 4),
  key_created_at timestamptz,
  last_used_at timestamptz
);
alter table public.pw_mcp_access enable row level security;
revoke all on public.pw_mcp_access from public, anon, authenticated;
grant select, insert, update, delete on public.pw_mcp_access to service_role;

create table if not exists public.pw_mcp_log (
  id bigint generated always as identity primary key,
  employee_id uuid references public.employees (id) on delete cascade,
  tool text not null check (char_length(tool) between 1 and 80),
  arguments jsonb not null default '{}'::jsonb,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists pw_mcp_log_employee_created on public.pw_mcp_log (employee_id, created_at desc);
create index if not exists pw_mcp_log_created on public.pw_mcp_log (created_at desc);
alter table public.pw_mcp_log enable row level security;
revoke all on public.pw_mcp_log from public, anon, authenticated;
grant select, insert, update, delete on public.pw_mcp_log to service_role;

commit;
