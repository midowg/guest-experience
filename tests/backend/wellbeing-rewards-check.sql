-- Execute ONLY against the disposable PostgreSQL migration-check container.
-- Migration 202611180001: Hadiah. A claim holds points from the saldo (never the board), within the stock
-- and the per-person limit; rejected and cancelled claims give the points back.
begin;
set local role service_role;
do $$
declare
  dewi uuid; bima uuid; voucher uuid; tumbler uuid; off uuid; first public.wb_reward_claims; second public.wb_reward_claims; saldo bigint;
begin
  insert into public.employees (full_name) values ('Dewi Uji Hadiah') returning id into dewi;
  insert into public.employees (full_name) values ('Bima Uji Hadiah') returning id into bima;
  -- Dewi has 1.000 points (an activity 700 + admin 300); Bima 100.
  insert into public.wb_activities (employee_id, type_code, dimension_id, happened_on, points_claimed, points)
    select dewi, code, 'physical', '2026-11-17', 700, 700 from public.wb_activity_types where kind = 'sport' limit 1;
  insert into public.wb_point_entries (employee_id, points, reason, happened_on, batch_id) values (dewi, 300, 'Hadir acara', '2026-11-17', gen_random_uuid());
  insert into public.wb_point_entries (employee_id, points, reason, happened_on, batch_id) values (bima, 100, 'Hadir acara', '2026-11-17', gen_random_uuid());

  insert into public.wb_rewards (title, cost, stock, per_person, active) values ('Voucher Uji', 400, 2, 1, true) returning id into voucher;
  insert into public.wb_rewards (title, cost, stock, per_person, active) values ('Tumbler Uji', 500, null, 3, true) returning id into tumbler;
  insert into public.wb_rewards (title, cost, active) values ('Belum aktif', 10, false) returning id into off;

  -- A claim holds the price, keeps the title, and the board's points do not change.
  first := public.wb_request_reward(dewi, voucher, '  ukuran M  ');
  if first.status <> 'requested' or first.cost <> 400 or first.reward_title <> 'Voucher Uji' or first.note <> 'ukuran M' then raise exception 'claim not saved as asked: %', row_to_json(first); end if;
  if (select sum(points) from public.wb_totals(null, null) where employee_id = dewi) <> 1000 then raise exception 'a claim changed the points'; end if;

  -- Per person: the voucher once.
  begin perform public.wb_request_reward(dewi, voucher, ''); raise exception 'UNEXPECTED: second voucher for the same person';
  exception when raise_exception then if sqlerrm <> 'reward_limit' then raise; end if; end;
  -- Saldo: 1.000 - 400 = 600, so one tumbler (500) fits and a second does not.
  second := public.wb_request_reward(dewi, tumbler, '');
  begin perform public.wb_request_reward(dewi, tumbler, ''); raise exception 'UNEXPECTED: claim past the saldo';
  exception when raise_exception then if sqlerrm <> 'reward_balance' then raise; end if; end;
  -- Not enough points at all, and a reward that is off.
  begin perform public.wb_request_reward(bima, voucher, ''); raise exception 'UNEXPECTED: Bima claimed with 100 points';
  exception when raise_exception then if sqlerrm <> 'reward_balance' then raise; end if; end;
  begin perform public.wb_request_reward(dewi, off, ''); raise exception 'UNEXPECTED: inactive reward claimed';
  exception when raise_exception then if sqlerrm <> 'reward_unavailable' then raise; end if; end;

  -- Rejecting gives the points back (needs a reason); then the tumbler fits again.
  begin update public.wb_reward_claims set status = 'rejected' where id = second.id; raise exception 'UNEXPECTED: rejected without a reason';
  exception when check_violation then null; end;
  update public.wb_reward_claims set status = 'rejected', reason = 'Stok di toko habis' where id = second.id;
  perform public.wb_request_reward(dewi, tumbler, '');

  -- Stock: two vouchers in all (handed-over claims count), the third is sold out.
  update public.wb_point_entries set points = 1000 where employee_id = bima;
  update public.wb_reward_claims set status = 'delivered' where id = first.id;
  perform public.wb_request_reward(bima, voucher, '');
  insert into public.employees (full_name) values ('Ketiga Uji Hadiah') returning id into dewi;
  insert into public.wb_point_entries (employee_id, points, reason, happened_on, batch_id) values (dewi, 1000, 'Hadir acara', '2026-11-17', gen_random_uuid());
  begin perform public.wb_request_reward(dewi, voucher, ''); raise exception 'UNEXPECTED: past the stock';
  exception when raise_exception then if sqlerrm <> 'reward_sold_out' then raise; end if; end;

  -- A claimed reward cannot be deleted (only switched off).
  begin delete from public.wb_rewards where id = voucher; raise exception 'UNEXPECTED: claimed reward deleted';
  exception when foreign_key_violation then null; end;
end $$;
rollback;
\echo 'WELLBEING REWARDS CHECKS PASSED'
