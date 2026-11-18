-- Execute ONLY against the disposable PostgreSQL migration-check container.
-- Migration 202611180004: Jenis hadiah dan voucher kode. Uang and Lainnya work like a prize; a code voucher
-- gives one unique code (pool), the code for everyone (shared) or none until the admin types it (manual);
-- delivery decides the first status; a rejected or cancelled claim gives its pool code back.
begin;
set local role service_role;
do $$
declare
  dewi uuid; bima uuid; sari uuid; pool uuid; shared uuid; manual uuid; money uuid; ended uuid; code_a uuid;
  first public.wb_reward_claims; second public.wb_reward_claims; third public.wb_reward_claims; claim public.wb_reward_claims;
begin
  insert into public.employees (full_name) values ('Dewi Uji Voucher') returning id into dewi;
  insert into public.employees (full_name) values ('Bima Uji Voucher') returning id into bima;
  insert into public.employees (full_name) values ('Sari Uji Voucher') returning id into sari;
  insert into public.wb_point_entries (employee_id, points, reason, happened_on, batch_id)
    select person, 10000, 'Hadir acara', '2026-11-17', gen_random_uuid() from unnest(array[dewi, bima, sari]) person;

  -- The rules of a reward's kind, delivery and codes.
  begin insert into public.wb_rewards (title, cost, active, kind) values ('Tanpa mode', 10, true, 'voucher'); raise exception 'UNEXPECTED: a code voucher without a code mode';
  exception when check_violation then null; end;
  begin insert into public.wb_rewards (title, cost, active, kind, code_mode) values ('Mode di barang', 10, true, 'barang', 'pool'); raise exception 'UNEXPECTED: a prize with a code mode';
  exception when check_violation then null; end;
  begin insert into public.wb_rewards (title, cost, active, kind, code_mode) values ('Tanpa kode', 10, true, 'voucher', 'shared'); raise exception 'UNEXPECTED: one code for everyone, without the code';
  exception when check_violation then null; end;
  begin insert into public.wb_rewards (title, cost, active, kind, delivery) values ('Barang otomatis', 10, true, 'barang', 'auto'); raise exception 'UNEXPECTED: a prize handed over at once';
  exception when check_violation then null; end;
  begin insert into public.wb_rewards (title, cost, active, kind, code_mode, delivery) values ('Manual otomatis', 10, true, 'voucher', 'manual', 'auto'); raise exception 'UNEXPECTED: a typed-in code handed over at once';
  exception when check_violation then null; end;
  begin insert into public.wb_rewards (title, cost, active, kind, delivery) values ('Re-roll lewat admin', 10, true, 'reroll', 'admin'); raise exception 'UNEXPECTED: a re-roll voucher through the admin';
  exception when check_violation then null; end;

  insert into public.wb_rewards (title, cost, per_person, active, kind, code_mode, delivery, how_to) values ('Voucher Kopi', 100, 5, true, 'voucher', 'pool', 'auto', 'Tunjukkan di kasir') returning id into pool;
  insert into public.wb_reward_codes (reward_id, code, created_at) values (pool, 'KOPI-A', now() - interval '2 minutes') returning id into code_a;
  insert into public.wb_reward_codes (reward_id, code, created_at) values (pool, 'KOPI-B', now() - interval '1 minute');
  begin insert into public.wb_reward_codes (reward_id, code) values (pool, 'KOPI-A'); raise exception 'UNEXPECTED: the same code twice';
  exception when unique_violation then null; end;

  -- Pool + auto: handed over at once with the oldest free code; when the codes run out it is sold out.
  first := public.wb_request_reward(dewi, pool, '');
  if first.status <> 'delivered' or first.code <> 'KOPI-A' or first.delivered_by_name <> 'Otomatis' then raise exception 'pool claim not handed over with its code: %', row_to_json(first); end if;
  if (select claim_id from public.wb_reward_codes where id = code_a) <> first.id then raise exception 'the code is not marked as given'; end if;
  second := public.wb_request_reward(bima, pool, '');
  if second.code <> 'KOPI-B' then raise exception 'second claim did not get the next code: %', second.code; end if;
  begin perform public.wb_request_reward(sari, pool, ''); raise exception 'UNEXPECTED: a pool claim without a free code';
  exception when raise_exception then if sqlerrm <> 'reward_sold_out' then raise; end if; end;
  -- A handed-over code stays given, also if the claim is refunded later.
  update public.wb_reward_claims set status = 'rejected', reason = 'Uji pengembalian' where id = second.id;
  if (select claim_id from public.wb_reward_codes where code = 'KOPI-B' and reward_id = pool) is distinct from second.id then raise exception 'a code already seen went back to the pool'; end if;

  -- Pool + admin: the code is held at once but the claim waits; cancelled, the code goes back.
  update public.wb_rewards set delivery = 'admin' where id = pool;
  insert into public.wb_reward_codes (reward_id, code) values (pool, 'KOPI-C');
  third := public.wb_request_reward(sari, pool, 'tolong cepat');
  if third.status <> 'requested' or third.code <> 'KOPI-C' or third.decided_at is not null then raise exception 'pool claim through the admin wrong: %', row_to_json(third); end if;
  update public.wb_reward_claims set status = 'cancelled' where id = third.id;
  select * into claim from public.wb_reward_claims where id = third.id;
  if claim.code is not null then raise exception 'a cancelled claim kept its code'; end if;
  if exists (select 1 from public.wb_reward_codes where code = 'KOPI-C' and claim_id is not null) then raise exception 'a cancelled claim kept the pool code'; end if;
  third := public.wb_request_reward(sari, pool, '');
  if third.code <> 'KOPI-C' then raise exception 'the code that came back was not given again: %', third.code; end if;

  -- Shared + approved: everyone gets the same code, approved at once (the admin still hands it over).
  insert into public.wb_rewards (title, cost, active, kind, code_mode, shared_code, delivery, per_person) values ('Diskon Toko', 50, true, 'voucher', 'shared', 'https://toko.example/diskon', 'approved', 1) returning id into shared;
  claim := public.wb_request_reward(dewi, shared, '');
  if claim.status <> 'approved' or claim.code <> 'https://toko.example/diskon' or claim.decided_by_name <> 'Otomatis' or claim.delivered_at is not null then raise exception 'shared claim wrong: %', row_to_json(claim); end if;

  -- Manual: no code until the admin types it in.
  insert into public.wb_rewards (title, cost, active, kind, code_mode) values ('Pulsa', 50, true, 'voucher', 'manual') returning id into manual;
  claim := public.wb_request_reward(dewi, manual, '0812');
  if claim.status <> 'requested' or claim.code is not null then raise exception 'manual claim wrong: %', row_to_json(claim); end if;

  -- Uang: a prize like before (asked for, the admin decides).
  insert into public.wb_rewards (title, cost, active, kind) values ('Saldo e-wallet', 500, true, 'uang') returning id into money;
  claim := public.wb_request_reward(bima, money, '');
  if claim.status <> 'requested' or claim.code is not null then raise exception 'money claim wrong: %', row_to_json(claim); end if;

  -- A voucher past its last day (WIB) cannot be claimed; the re-roll vouchers still go through wb_claim_reroll.
  insert into public.wb_rewards (title, cost, active, kind, code_mode, valid_until) values ('Sudah lewat', 10, true, 'voucher', 'manual', (now() at time zone 'Asia/Jakarta')::date - 1) returning id into ended;
  begin perform public.wb_request_reward(dewi, ended, ''); raise exception 'UNEXPECTED: a voucher claimed after its last day';
  exception when raise_exception then if sqlerrm <> 'reward_expired' then raise; end if; end;
  update public.wb_rewards set valid_until = (now() at time zone 'Asia/Jakarta')::date where id = ended;
  perform public.wb_request_reward(dewi, ended, '');
  insert into public.wb_rewards (title, cost, active, kind, delivery) values ('Re-roll', 10, true, 'reroll', 'auto') returning id into ended;
  begin perform public.wb_request_reward(dewi, ended, ''); raise exception 'UNEXPECTED: a re-roll voucher through wb_request_reward';
  exception when raise_exception then if sqlerrm <> 'reward_unavailable' then raise; end if; end;
end $$;
rollback;
\echo 'WELLBEING REWARD TYPES CHECKS PASSED'
