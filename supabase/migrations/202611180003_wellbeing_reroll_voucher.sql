-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611180001 (Hadiah).
--
-- Voucher re-roll (decided 18 Nov 2026, docs/rancangan-wellbeing.md "Voucher re-roll"): a reward in Hadiah
-- can be a voucher that re-rolls the WAM questionnaire's tokoh card, instead of a prize to hand over.
--   * wb_rewards.kind: 'barang' (a prize, as before), 'reroll' (a new figure, the rarity drawn again) or
--     'reroll_legendary' (a new figure, the rarity Legendary, within the Legendary quota).
--   * A voucher claim needs no admin: wb_claim_reroll checks the reward, stock, per-person limit, saldo,
--     that the person has a card, and (Legendary) that a Legendary place is left, then adds the claim as
--     handed over and one ticket, in one transaction. The points are spent at once.
--   * wb_reroll_tickets: one re-roll each, used on the card page whenever the person likes (also when
--     Admin WAM's own re-roll is closed or already used). An unused Legendary ticket holds a Legendary
--     place, so the quota still holds when it is used.
--   * Super admin can give a ticket by hand (no claim), cancel an unused one, give the points back, or
--     put the card back as it was. The card before each use is kept in the ticket (result.before).
--   * Read and written only by the server (service role): RLS on, no policies.
--
-- ROLLBACK (by hand): drop function public.wb_claim_reroll(uuid, uuid, uuid, text);
--   drop table public.wb_reroll_tickets; alter table public.wb_rewards drop column kind;
--   then run wb_request_reward from 202611180001 again.
begin;

alter table public.wb_rewards add column if not exists kind text not null default 'barang';
alter table public.wb_rewards drop constraint if exists wb_rewards_kind;
alter table public.wb_rewards add constraint wb_rewards_kind check (kind in ('barang', 'reroll', 'reroll_legendary'));

create table if not exists public.wb_reroll_tickets (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  legendary boolean not null default false,
  -- The claim that paid for it (Hadiah), or null when a super admin gave it by hand.
  claim_id uuid unique references public.wb_reward_claims (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'used', 'revoked')),
  note text not null default '' check (char_length(note) <= 300),
  given_by_name text check (char_length(given_by_name) <= 150),
  -- Once used: the questionnaire, when, and what changed ({ before: {...}, from, to, tierFrom, tierTo }).
  form_id uuid references public.cq_forms (id) on delete set null,
  used_at timestamptz,
  result jsonb,
  -- Super admin's corrections.
  revoked_at timestamptz,
  revoked_by_name text check (char_length(revoked_by_name) <= 150),
  revoke_reason text check (char_length(revoke_reason) <= 300),
  restored_at timestamptz,
  restored_by_name text check (char_length(restored_by_name) <= 150),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wb_reroll_tickets_employee on public.wb_reroll_tickets (employee_id, status);
create index if not exists wb_reroll_tickets_open on public.wb_reroll_tickets (status, legendary);
create index if not exists wb_reroll_tickets_created on public.wb_reroll_tickets (created_at desc);

-- A prize as before; a voucher goes through wb_claim_reroll instead.
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
  perform pg_advisory_xact_lock(hashtextextended('wb_reward_person:' || p_employee::text, 0));
  select * into r from public.wb_rewards where id = p_reward for update;
  if not found or not r.active or r.kind <> 'barang' then raise exception 'reward_unavailable'; end if;
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

-- A voucher: the same checks as a prize, plus a card to re-roll (p_form, the current questionnaire) and,
-- for Legendary, a Legendary place left (p_legend is that tier's key). Handed over at once, with a ticket.
-- Raises reward_unavailable / reward_sold_out / reward_limit / reward_no_card / reward_legend_full /
-- reward_balance (P0001) otherwise.
create or replace function public.wb_claim_reroll(p_employee uuid, p_reward uuid, p_form uuid, p_legend text default null)
returns public.wb_reward_claims
language plpgsql security invoker set search_path = public as $$
declare
  r public.wb_rewards;
  taken integer;
  mine integer;
  earned bigint;
  held bigint;
  cap integer;
  legends integer;
  claim public.wb_reward_claims;
begin
  perform pg_advisory_xact_lock(hashtextextended('wb_reward_person:' || p_employee::text, 0));
  select * into r from public.wb_rewards where id = p_reward for update;
  if not found or not r.active or r.kind not in ('reroll', 'reroll_legendary') then raise exception 'reward_unavailable'; end if;
  select count(*) into taken from public.wb_reward_claims where reward_id = p_reward and status in ('requested', 'approved', 'delivered');
  if r.stock is not null and taken >= r.stock then raise exception 'reward_sold_out'; end if;
  select count(*) into mine from public.wb_reward_claims where reward_id = p_reward and employee_id = p_employee and status in ('requested', 'approved', 'delivered');
  if mine >= r.per_person then raise exception 'reward_limit'; end if;
  -- A card to re-roll: drawn for real (not a trial) and with a figure.
  if p_form is null or not exists (
    select 1 from public.cq_person_cards c where c.form_id = p_form and c.employee_id = p_employee and not c.trial and c.figure_id is not null
  ) then raise exception 'reward_no_card'; end if;
  if r.kind = 'reroll_legendary' then
    -- The quota is shared by everyone: one Legendary voucher claim at a time.
    perform pg_advisory_xact_lock(hashtextextended('wb_reroll_legendary', 0));
    if p_legend is null then raise exception 'reward_unavailable'; end if;
    select t.max_cards into cap from public.cq_tiers t where t.form_id = p_form and t.key = p_legend;
    if not found then raise exception 'reward_unavailable'; end if;
    if cap is not null then
      -- Everyone else holding Legendary or an unused Legendary voucher takes one place.
      select count(*) into legends from (
        select c.employee_id from public.cq_person_cards c where c.form_id = p_form and not c.trial and c.tier_key = p_legend and c.employee_id <> p_employee
        union
        select k.employee_id from public.wb_reroll_tickets k where k.legendary and k.status = 'open' and k.employee_id <> p_employee
      ) people;
      if legends >= cap then raise exception 'reward_legend_full'; end if;
    end if;
  end if;
  select coalesce(sum(t.points), 0) into earned from public.wb_totals(null, null) t where t.employee_id = p_employee;
  select coalesce(sum(c.cost), 0) into held from public.wb_reward_claims c where c.employee_id = p_employee and c.status in ('requested', 'approved', 'delivered');
  if earned - held < r.cost then raise exception 'reward_balance'; end if;
  insert into public.wb_reward_claims (reward_id, employee_id, cost, reward_title, status, decided_by_name, decided_at, delivered_by_name, delivered_at)
    values (p_reward, p_employee, r.cost, r.title, 'delivered', 'Otomatis', now(), 'Otomatis', now())
    returning * into claim;
  insert into public.wb_reroll_tickets (employee_id, legendary, claim_id)
    values (p_employee, r.kind = 'reroll_legendary', claim.id);
  return claim;
end $$;

alter table public.wb_reroll_tickets enable row level security;
revoke all on public.wb_reroll_tickets from public, anon, authenticated;
grant select, insert, update, delete on public.wb_reroll_tickets to service_role;
revoke all on function public.wb_request_reward(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.wb_request_reward(uuid, uuid, text) to service_role;
revoke all on function public.wb_claim_reroll(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.wb_claim_reroll(uuid, uuid, uuid, text) to service_role;

commit;
