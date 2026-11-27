-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611170002.
--
-- Hadiah (decided 18 Nov 2026, docs/rancangan-wellbeing.md "Hadiah"): employees trade points for prizes
-- the admin puts up (photos, description, price in points, stock, a limit per person).
--   * The leaderboard and the total points never change: a claim only spends the "saldo poin"
--     (all points that count, minus what open and handed-over claims hold).
--   * A claim is a request: the points are held at once; the admin approves it, hands the prize over,
--     or rejects it with a reason (the points come back). The employee may cancel while it waits.
--   * wb_request_reward checks the reward, the stock, the per-person limit and the saldo, and adds the
--     claim, in one transaction locked per person and per reward, so two taps never spend twice.
--   * Read and written only by the server (service role): RLS on, no policies.
--
-- ROLLBACK (by hand): drop function public.wb_request_reward(uuid, uuid, text);
--   drop table public.wb_reward_claims, public.wb_rewards;
begin;

create table if not exists public.wb_rewards (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  -- Keys in storage (wellbeing/hadiah/...), or links for prizes brought over from the old app.
  photos text[] not null default '{}' check (cardinality(photos) <= 6),
  cost integer not null check (cost between 1 and 10000000),
  -- null: no limit; otherwise how many may be claimed in all (open, approved and handed over).
  stock integer check (stock is null or stock between 0 and 100000),
  per_person integer not null default 1 check (per_person between 1 and 100),
  active boolean not null default false,
  sort integer not null default 100,
  legacy_id text unique check (char_length(legacy_id) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_name text check (char_length(updated_by_name) <= 150)
);

create table if not exists public.wb_reward_claims (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references public.wb_rewards (id) on delete restrict,
  employee_id uuid not null references public.employees (id) on delete cascade,
  -- The price when it was claimed (a later price change does not touch it), and the title then.
  cost integer not null check (cost between 0 and 10000000),
  reward_title text not null check (char_length(reward_title) <= 120),
  status text not null default 'requested' check (status in ('requested', 'approved', 'delivered', 'rejected', 'cancelled')),
  note text not null default '' check (char_length(note) <= 300),
  reason text check (char_length(reason) <= 300),
  decided_by_name text check (char_length(decided_by_name) <= 150),
  decided_at timestamptz,
  delivered_by_name text check (char_length(delivered_by_name) <= 150),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wb_reward_claims_reason check (status <> 'rejected' or char_length(btrim(coalesce(reason, ''))) >= 2)
);
create index if not exists wb_reward_claims_employee on public.wb_reward_claims (employee_id, created_at desc);
create index if not exists wb_reward_claims_open on public.wb_reward_claims (status, created_at desc);
create index if not exists wb_reward_claims_reward on public.wb_reward_claims (reward_id, status);

-- One claim: the reward must be on, not sold out, under the person's limit, and within the saldo.
-- Raises reward_unavailable / reward_sold_out / reward_limit / reward_balance (P0001) otherwise.
create or replace function public.wb_request_reward(p_employee uuid, p_reward uuid, p_note text default '')
returns public.wb_reward_claims
language plpgsql security invoker set search_path = public as $$
declare
  r public.wb_rewards;
  taken integer;
  mine integer;
  earned bigint;
  held bigint;
  claim public.wb_reward_claims;
begin
  -- One claim at a time per person (the saldo), and per reward (the stock).
  perform pg_advisory_xact_lock(hashtextextended('wb_reward_person:' || p_employee::text, 0));
  select * into r from public.wb_rewards where id = p_reward for update;
  if not found or not r.active then raise exception 'reward_unavailable'; end if;
  select count(*) into taken from public.wb_reward_claims where reward_id = p_reward and status in ('requested', 'approved', 'delivered');
  if r.stock is not null and taken >= r.stock then raise exception 'reward_sold_out'; end if;
  select count(*) into mine from public.wb_reward_claims where reward_id = p_reward and employee_id = p_employee and status in ('requested', 'approved', 'delivered');
  if mine >= r.per_person then raise exception 'reward_limit'; end if;
  select coalesce(sum(t.points), 0) into earned from public.wb_totals(null, null) t where t.employee_id = p_employee;
  select coalesce(sum(c.cost), 0) into held from public.wb_reward_claims c where c.employee_id = p_employee and c.status in ('requested', 'approved', 'delivered');
  if earned - held < r.cost then raise exception 'reward_balance'; end if;
  insert into public.wb_reward_claims (reward_id, employee_id, cost, reward_title, note)
    values (p_reward, p_employee, r.cost, r.title, left(btrim(coalesce(p_note, '')), 300))
    returning * into claim;
  return claim;
end $$;

alter table public.wb_rewards enable row level security;
alter table public.wb_reward_claims enable row level security;
revoke all on public.wb_rewards, public.wb_reward_claims from public, anon, authenticated;
grant select, insert, update, delete on public.wb_rewards, public.wb_reward_claims to service_role;
revoke all on function public.wb_request_reward(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.wb_request_reward(uuid, uuid, text) to service_role;

commit;
