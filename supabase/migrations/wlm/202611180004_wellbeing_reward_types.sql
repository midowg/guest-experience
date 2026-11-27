-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611180003 (Voucher re-roll).
--
-- Jenis hadiah dan voucher kode (decided 18 Nov 2026, docs/rancangan-wellbeing.md "Jenis hadiah dan voucher kode"):
--   * wb_rewards.kind gains 'uang' (money the admin hands over), 'voucher' (a code or a link) and 'lainnya'.
--     The re-roll vouchers keep their kinds ('reroll', 'reroll_legendary'): the admin shows them as Voucher →
--     Fitur aplikasi, with the effect (re-roll, re-roll Legendary) as the choice; more effects can come later.
--   * wb_rewards.delivery, one setting for every kind: 'admin' (asked for, the admin approves and then hands
--     it over, as before), 'approved' (approved at once, the admin hands it over) or 'auto' (handed over at
--     once: only what needs nobody, a voucher whose code is ready or an app voucher). The re-roll vouchers
--     there are stay automatic, as they were.
--   * A code voucher's code_mode: 'pool' (wb_reward_codes: one unique code or link per claim; what is
--     left is the codes not given yet), 'shared' (one code or link for everyone, shared_code) or 'manual'
--     (the admin types it in when handing it over).
--   * valid_until (a voucher's last day, WIB; it cannot be claimed after it) and how_to (how to use it,
--     shown with the code).
--   * wb_reward_claims.code: the code or link a claim got. The app shows it only once handed over. A claim
--     rejected or cancelled before that gives its pool code back and loses its code (trigger).
--   * wb_request_reward handles every kind but the re-roll vouchers. wb_claim_reroll follows the delivery too:
--     handed over at once (with its ticket) or waiting for the admin; the ticket comes when the admin hands
--     the claim over (trigger). A Legendary claim still waiting holds a Legendary place, like an unused ticket.
--   * Read and written only by the server (service role): RLS on, no policies.
--
-- ROLLBACK (by hand): drop trigger wb_reward_claims_code_back on public.wb_reward_claims;
--   drop function public.wb_reward_code_back(); drop trigger wb_reward_claims_ticket on public.wb_reward_claims;
--   drop function public.wb_reward_ticket(); drop table public.wb_reward_codes;
--   alter table public.wb_reward_claims drop column code;
--   alter table public.wb_rewards drop constraint wb_rewards_delivery, drop constraint wb_rewards_code_mode,
--     drop constraint wb_rewards_voucher, drop constraint wb_rewards_shared, drop constraint wb_rewards_auto,
--     drop column delivery, drop column code_mode, drop column shared_code, drop column valid_until, drop column how_to;
--   move uang/voucher/lainnya rewards to barang, then the kind check, wb_request_reward and wb_claim_reroll from
--   202611180003 again (after handing over or rejecting re-roll claims still waiting).
begin;

alter table public.wb_rewards drop constraint if exists wb_rewards_kind;
alter table public.wb_rewards add constraint wb_rewards_kind check (kind in ('barang', 'uang', 'voucher', 'lainnya', 'reroll', 'reroll_legendary'));

alter table public.wb_rewards add column if not exists delivery text not null default 'admin';
alter table public.wb_rewards add column if not exists code_mode text;
alter table public.wb_rewards add column if not exists shared_code text;
alter table public.wb_rewards add column if not exists valid_until date;
alter table public.wb_rewards add column if not exists how_to text not null default '';
-- The re-roll vouchers there are were always handed over at once, and stay so (the admin may change it).
update public.wb_rewards set delivery = 'auto' where kind in ('reroll', 'reroll_legendary') and delivery <> 'auto';

alter table public.wb_rewards drop constraint if exists wb_rewards_delivery;
alter table public.wb_rewards add constraint wb_rewards_delivery check (delivery in ('admin', 'approved', 'auto'));
alter table public.wb_rewards drop constraint if exists wb_rewards_code_mode;
alter table public.wb_rewards add constraint wb_rewards_code_mode check (code_mode is null or code_mode in ('pool', 'shared', 'manual'));
-- A code voucher always says where its codes come from; nothing else has a code mode.
alter table public.wb_rewards drop constraint if exists wb_rewards_voucher;
alter table public.wb_rewards add constraint wb_rewards_voucher check ((kind = 'voucher') = (code_mode is not null));
-- One code for everyone: the code is there (and only then).
alter table public.wb_rewards drop constraint if exists wb_rewards_shared;
alter table public.wb_rewards add constraint wb_rewards_shared check (
  (coalesce(code_mode, '') = 'shared') = (shared_code is not null) and (shared_code is null or char_length(btrim(shared_code)) between 1 and 500)
);
-- Handed over at once: only what needs nobody (a code that is ready, an app voucher).
alter table public.wb_rewards drop constraint if exists wb_rewards_auto;
alter table public.wb_rewards add constraint wb_rewards_auto check (
  delivery <> 'auto' or kind in ('reroll', 'reroll_legendary') or (kind = 'voucher' and code_mode in ('pool', 'shared'))
);
alter table public.wb_rewards drop constraint if exists wb_rewards_how_to;
alter table public.wb_rewards add constraint wb_rewards_how_to check (char_length(how_to) <= 1000);

alter table public.wb_reward_claims add column if not exists code text;
alter table public.wb_reward_claims drop constraint if exists wb_reward_claims_code;
alter table public.wb_reward_claims add constraint wb_reward_claims_code check (code is null or char_length(code) <= 500);

-- A voucher's unique codes or links: free until a claim takes one.
create table if not exists public.wb_reward_codes (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references public.wb_rewards (id) on delete cascade,
  code text not null check (char_length(btrim(code)) between 1 and 500),
  claim_id uuid unique references public.wb_reward_claims (id) on delete set null,
  given_at timestamptz,
  created_by_name text check (char_length(created_by_name) <= 150),
  created_at timestamptz not null default now(),
  constraint wb_reward_codes_once unique (reward_id, code)
);
create index if not exists wb_reward_codes_free on public.wb_reward_codes (reward_id, created_at, id) where claim_id is null;

-- A claim rejected or cancelled before it was handed over: its pool code goes back, and it keeps no code.
-- (One handed over keeps its code: the employee has seen it.)
create or replace function public.wb_reward_code_back()
returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if old.status in ('requested', 'approved') and new.status in ('rejected', 'cancelled') then
    update public.wb_reward_codes set claim_id = null, given_at = null where claim_id = new.id;
    new.code := null;
  end if;
  return new;
end $$;
drop trigger if exists wb_reward_claims_code_back on public.wb_reward_claims;
create trigger wb_reward_claims_code_back before update of status on public.wb_reward_claims
  for each row execute function public.wb_reward_code_back();

-- An app voucher handed over by the admin: its ticket comes now (once; one claimed at once got it already).
create or replace function public.wb_reward_ticket()
returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  k text;
begin
  if new.status = 'delivered' and old.status in ('requested', 'approved') then
    select kind into k from public.wb_rewards where id = new.reward_id;
    if k in ('reroll', 'reroll_legendary') then
      insert into public.wb_reroll_tickets (employee_id, legendary, claim_id)
        values (new.employee_id, k = 'reroll_legendary', new.id) on conflict (claim_id) do nothing;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists wb_reward_claims_ticket on public.wb_reward_claims;
create trigger wb_reward_claims_ticket after update of status on public.wb_reward_claims
  for each row execute function public.wb_reward_ticket();

-- Every kind but the re-roll vouchers: the checks as before, plus a voucher's last day, then a code
-- (pool: the oldest free one; shared: the one for everyone) and the status the delivery says.
-- Raises reward_unavailable / reward_expired / reward_sold_out / reward_limit / reward_balance (P0001).
create or replace function public.wb_request_reward(p_employee uuid, p_reward uuid, p_note text default '')
returns public.wb_reward_claims
language plpgsql security invoker set search_path = public as $$
declare
  r public.wb_rewards;
  taken integer;
  mine integer;
  earned bigint;
  held bigint;
  code_id uuid;
  code_text text;
  state text;
  claim public.wb_reward_claims;
begin
  perform pg_advisory_xact_lock(hashtextextended('wb_reward_person:' || p_employee::text, 0));
  -- The reward's row lock also lines up every claim of it, so two claims never take the same code.
  select * into r from public.wb_rewards where id = p_reward for update;
  if not found or not r.active or r.kind not in ('barang', 'uang', 'voucher', 'lainnya') then raise exception 'reward_unavailable'; end if;
  if r.valid_until is not null and r.valid_until < (now() at time zone 'Asia/Jakarta')::date then raise exception 'reward_expired'; end if;
  select count(*) into taken from public.wb_reward_claims where reward_id = p_reward and status in ('requested', 'approved', 'delivered');
  if r.stock is not null and taken >= r.stock then raise exception 'reward_sold_out'; end if;
  select count(*) into mine from public.wb_reward_claims where reward_id = p_reward and employee_id = p_employee and status in ('requested', 'approved', 'delivered');
  if mine >= r.per_person then raise exception 'reward_limit'; end if;
  select coalesce(sum(t.points), 0) into earned from public.wb_totals(null, null) t where t.employee_id = p_employee;
  select coalesce(sum(c.cost), 0) into held from public.wb_reward_claims c where c.employee_id = p_employee and c.status in ('requested', 'approved', 'delivered');
  if earned - held < r.cost then raise exception 'reward_balance'; end if;
  if r.kind = 'voucher' and r.code_mode = 'pool' then
    select k.id, k.code into code_id, code_text from public.wb_reward_codes k
      where k.reward_id = p_reward and k.claim_id is null order by k.created_at, k.id limit 1 for update;
    if code_id is null then raise exception 'reward_sold_out'; end if;
  elsif r.kind = 'voucher' and r.code_mode = 'shared' then
    code_text := r.shared_code;
  end if;
  state := case r.delivery when 'auto' then 'delivered' when 'approved' then 'approved' else 'requested' end;
  insert into public.wb_reward_claims (reward_id, employee_id, cost, reward_title, note, status, code, decided_by_name, decided_at, delivered_by_name, delivered_at)
    values (p_reward, p_employee, r.cost, r.title, left(btrim(coalesce(p_note, '')), 300), state, code_text,
      case when state <> 'requested' then 'Otomatis' end, case when state <> 'requested' then now() end,
      case when state = 'delivered' then 'Otomatis' end, case when state = 'delivered' then now() end)
    returning * into claim;
  if code_id is not null then update public.wb_reward_codes set claim_id = claim.id, given_at = now() where id = code_id; end if;
  return claim;
end $$;

-- A re-roll voucher: the checks of 202611180003 (a Legendary claim still waiting holds a place too), then the
-- status the delivery says; the ticket at once only when handed over at once.
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
  state text;
  claim public.wb_reward_claims;
begin
  perform pg_advisory_xact_lock(hashtextextended('wb_reward_person:' || p_employee::text, 0));
  select * into r from public.wb_rewards where id = p_reward for update;
  if not found or not r.active or r.kind not in ('reroll', 'reroll_legendary') then raise exception 'reward_unavailable'; end if;
  select count(*) into taken from public.wb_reward_claims where reward_id = p_reward and status in ('requested', 'approved', 'delivered');
  if r.stock is not null and taken >= r.stock then raise exception 'reward_sold_out'; end if;
  select count(*) into mine from public.wb_reward_claims where reward_id = p_reward and employee_id = p_employee and status in ('requested', 'approved', 'delivered');
  if mine >= r.per_person then raise exception 'reward_limit'; end if;
  if p_form is null or not exists (
    select 1 from public.cq_person_cards c where c.form_id = p_form and c.employee_id = p_employee and not c.trial and c.figure_id is not null
  ) then raise exception 'reward_no_card'; end if;
  if r.kind = 'reroll_legendary' then
    perform pg_advisory_xact_lock(hashtextextended('wb_reroll_legendary', 0));
    if p_legend is null then raise exception 'reward_unavailable'; end if;
    select t.max_cards into cap from public.cq_tiers t where t.form_id = p_form and t.key = p_legend;
    if not found then raise exception 'reward_unavailable'; end if;
    if cap is not null then
      -- Everyone else holding Legendary, an unused Legendary voucher, or a Legendary claim still waiting takes one place.
      select count(*) into legends from (
        select c.employee_id from public.cq_person_cards c where c.form_id = p_form and not c.trial and c.tier_key = p_legend and c.employee_id <> p_employee
        union
        select k.employee_id from public.wb_reroll_tickets k where k.legendary and k.status = 'open' and k.employee_id <> p_employee
        union
        select w.employee_id from public.wb_reward_claims w join public.wb_rewards x on x.id = w.reward_id
          where x.kind = 'reroll_legendary' and w.status in ('requested', 'approved') and w.employee_id <> p_employee
      ) people;
      if legends >= cap then raise exception 'reward_legend_full'; end if;
    end if;
  end if;
  select coalesce(sum(t.points), 0) into earned from public.wb_totals(null, null) t where t.employee_id = p_employee;
  select coalesce(sum(c.cost), 0) into held from public.wb_reward_claims c where c.employee_id = p_employee and c.status in ('requested', 'approved', 'delivered');
  if earned - held < r.cost then raise exception 'reward_balance'; end if;
  state := case r.delivery when 'auto' then 'delivered' when 'approved' then 'approved' else 'requested' end;
  insert into public.wb_reward_claims (reward_id, employee_id, cost, reward_title, status, decided_by_name, decided_at, delivered_by_name, delivered_at)
    values (p_reward, p_employee, r.cost, r.title, state,
      case when state <> 'requested' then 'Otomatis' end, case when state <> 'requested' then now() end,
      case when state = 'delivered' then 'Otomatis' end, case when state = 'delivered' then now() end)
    returning * into claim;
  if state = 'delivered' then
    insert into public.wb_reroll_tickets (employee_id, legendary, claim_id) values (p_employee, r.kind = 'reroll_legendary', claim.id);
  end if;
  return claim;
end $$;

alter table public.wb_reward_codes enable row level security;
revoke all on public.wb_reward_codes from public, anon, authenticated;
grant select, insert, update, delete on public.wb_reward_codes to service_role;
revoke all on function public.wb_reward_code_back() from public, anon, authenticated;
revoke all on function public.wb_reward_ticket() from public, anon, authenticated;
revoke all on function public.wb_claim_reroll(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.wb_claim_reroll(uuid, uuid, uuid, text) to service_role;
revoke all on function public.wb_request_reward(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.wb_request_reward(uuid, uuid, text) to service_role;

commit;
