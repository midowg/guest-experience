-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
--
-- WG Coffee, F7 (27 Nov 2026): where each drink shows ("Buku tamu" and "Menu biasa"). The regular
-- menu starts as what the office machine (JS Mini) makes. No drink is added or removed.
-- Run after 202612010001, 202612010002 and 202612020001. Those three are applied on the live
-- database and are never edited again; everything new is here.
--
-- SAFE ON LIVE DATA, AND SAFE TO RUN TWICE:
--   * Nothing is dropped, no order is touched. Two columns are added to coffee_drinks, both
--     "not null default true", so every drink there is (the pengelola's own additions too) starts
--     in both menus, exactly as before.
--   * The owner's defaults are written ONCE: inside the block that adds the columns, which only
--     runs while coffee_drinks has no in_regular_menu column. The whole file is one transaction,
--     so "the column exists" and "the defaults were applied" always go together. A second run
--     finds the column and skips the block: a tick the pengelola changed is never reset.
--   * The two functions are "create or replace" with the signatures they always had.
--   * The deployed app works before and after: until this runs it shows every drink in both menus
--     (as before); once this has run it reads the two ticks from here.
--
-- What it does:
--   1. coffee_drinks.in_guest_book ("Buku tamu": the GA tablet's guest menu book, and what a Tamu
--      line may be) and coffee_drinks.in_regular_menu ("Menu biasa": the employee app, and what a
--      Tim · rapat line and an employee's claim may be). A drink with both off shows nowhere; the
--      old "active" (Tampil / Tersembunyi) stays as the switch above both.
--   2. First run only. The paper menu (the 15 drinks) is the guest book and stays whole. The
--      regular menu is what the JS Mini machine makes, because employees serve themselves there:
--      americano, cappuccino, cafe-latte, cafe-mocha, piccolo-latte, milk-chocolate,
--      dark-chocolate, espresso, kopi-hitam, kopi-susu, matcha-espresso, matcha-latte. So the
--      three paper drinks the machine does not make (cappuccino-double-shot, cucumber-ice,
--      classic-tea) leave the regular menu and stay in the guest book. A drink the pengelola
--      added, renamed or hid keeps both ticks on; one of those three that was deleted stays deleted.
--   3. coffee_submit_claim and coffee_submit_meeting enforce it: a claim and a Tim · rapat line
--      need a regular-menu drink, a Tamu line a guest-book drink (COFFEE_DRINK_GONE otherwise).
--      Catat manual may still record any drink of the menu, as before.
--
-- ROLLBACK (by hand):
--   run the two "create or replace function" blocks of 202612020001_coffee_menu.sql again, then
--   alter table public.coffee_drinks drop column if exists in_guest_book, drop column if exists in_regular_menu;
begin;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'coffee_drinks' and column_name = 'in_regular_menu') then
    alter table public.coffee_drinks
      add column in_guest_book boolean not null default true,
      add column in_regular_menu boolean not null default true;
    -- The paper-menu drinks the machine does not make: guest book only.
    update public.coffee_drinks set in_regular_menu = false
      where slug in ('cappuccino-double-shot', 'cucumber-ice', 'classic-tea');
  end if;
end $$;

/*
 * One claim: the function of 202612020001 word for word (same signature, same rules), with one
 * rule more. An employee claims from "Menu biasa": the drink must be shown AND ticked for the
 * regular menu, unless a pengelola records it by hand (Catat manual may use any drink of the menu).
 */
create or replace function public.coffee_submit_claim(
  p_employee uuid, p_item jsonb, p_at timestamptz, p_manual boolean, p_actor uuid, p_actor_label text, p_key uuid
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  saved uuid;
  again record;
  person record;
  cfg record;
  drink record;
  grp text;
  quota integer;
  at_time timestamptz := coalesce(p_at, now());
  bulan text;
  is_manual boolean := coalesce(p_manual, false);
  the_slug text := p_item->>'slug';
  the_name text;
begin
  if p_key is not null then
    select o.id, o.kind, o.employee_id, o.manual, o.status into again from coffee_orders o where o.idempotency_key = p_key;
    if found then
      -- The key belongs to one sending: not to someone else's, another kind's, or one already refused or cancelled.
      if again.kind <> 'klaim' or again.employee_id <> p_employee or again.manual <> is_manual or again.status in ('ditolak', 'batal') then
        raise exception 'COFFEE_KEY_REUSED';
      end if;
      return again.id;
    end if;
  end if;
  if at_time > now() + interval '5 minutes' then raise exception 'COFFEE_INVALID'; end if;
  -- A drink off the menu ("lainnya") only exists in Catat manual.
  if not is_manual and the_slug = 'lainnya' then raise exception 'COFFEE_INVALID'; end if;
  if the_slug is distinct from 'lainnya' then
    -- Shared lock: coffee_delete_drink waits for this claim, so a drink is never deleted under an order.
    select d.name, d.active, d.temperatures, d.in_regular_menu into drink from coffee_drinks d where d.slug = the_slug for share;
    if not found or (not is_manual and not (drink.active and drink.in_regular_menu)) then raise exception 'COFFEE_DRINK_GONE'; end if;
    if p_item->>'temperature' is not null and not (p_item->>'temperature' = any (drink.temperatures)) then raise exception 'COFFEE_INVALID'; end if;
    the_name := drink.name;
  end if;
  select e.id, e.full_name, e.position, e.business_unit, e.category into person
    from employees e where e.id = p_employee and e.active;
  if not found then raise exception 'COFFEE_NOT_EMPLOYEE'; end if;
  grp := case person.category when 'intern' then 'intern' when 'dw' then 'ga' when 'ga' then 'ga' else 'karyawan' end;
  select s.quota_karyawan, s.quota_ga, s.quota_intern into cfg from coffee_settings s where s.id = 1;
  quota := case grp when 'intern' then coalesce(cfg.quota_intern, 2) when 'ga' then coalesce(cfg.quota_ga, 2) else coalesce(cfg.quota_karyawan, 4) end;
  bulan := to_char(at_time at time zone 'Asia/Jakarta', 'YYYY-MM');
  perform pg_advisory_xact_lock(hashtext('coffee:' || p_employee::text || ':' || bulan));
  -- The same request sent twice at once: the second one waited on the lock and finds the first here.
  if p_key is not null then
    select o.id, o.kind, o.employee_id, o.manual, o.status into again from coffee_orders o where o.idempotency_key = p_key;
    if found then
      if again.kind <> 'klaim' or again.employee_id <> p_employee or again.manual <> is_manual or again.status in ('ditolak', 'batal') then
        raise exception 'COFFEE_KEY_REUSED';
      end if;
      return again.id;
    end if;
  end if;
  if (select count(*) from coffee_orders
       where employee_id = p_employee and kind = 'klaim' and quota_month = bulan and status in ('diproses', 'selesai')) >= quota then
    raise exception 'COFFEE_QUOTA_FULL';
  end if;
  insert into coffee_orders (kind, number, employee_id, person_name, person_group, person_position, person_bu,
      status, processed_by, processed_label, processed_at, created_by, created_label, manual, ordered_at, quota_month, idempotency_key)
  values ('klaim', nextval('coffee_claim_no'), p_employee, person.full_name, grp, person.position, person.business_unit,
      case when is_manual then 'selesai' else 'diproses' end,
      case when is_manual then p_actor end, case when is_manual then left(p_actor_label, 120) end, case when is_manual then now() end,
      p_actor, left(p_actor_label, 120), is_manual, at_time, bulan, p_key)
  returning id into saved;
  insert into coffee_order_items (order_id, for_whom, employee_id, drink_slug, drink_other, drink_name, temperature, sugar, ice, qty)
  values (saved, 'klaim', p_employee, the_slug, nullif(btrim(coalesce(p_item->>'other', '')), ''), the_name,
      p_item->>'temperature', p_item->>'sugar', p_item->>'ice', 1);
  return saved;
end $$;

/*
 * One meeting order: the function of 202612020001 word for word (same signature, same rules), with
 * one rule more, for every drink: a guest's line (tamu) needs a drink ticked for "Buku tamu", a team
 * member's line (tim) one ticked for "Menu biasa". Catat manual may use any drink of the menu.
 */
create or replace function public.coffee_submit_meeting(p_order jsonb, p_items jsonb, p_key uuid) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  saved uuid;
  again record;
  pic record;
  parent record;
  first_round record;
  who record;
  drink record;
  pic_id uuid;
  pic_name text;
  pic_group text;
  pic_position text;
  pic_bu text;
  the_room text;
  the_spot text;
  the_guest text;
  the_guest_count smallint;
  the_slug text;
  the_name text;
  item jsonb;
  place integer;
  root uuid;
  order_no integer;
  rnd integer := 1;
  at_time timestamptz := coalesce((p_order->>'ordered_at')::timestamptz, now());
  is_manual boolean := coalesce((p_order->>'manual')::boolean, false);
  actor uuid := nullif(p_order->>'actor_id', '')::uuid;
  actor_label text := left(p_order->>'actor_label', 120);
  req_print text := nullif(left(coalesce(p_order->>'print', ''), 100), '');
begin
  if p_key is not null then
    select o.id, o.kind, o.manual, o.status, o.request_print into again from coffee_orders o where o.idempotency_key = p_key;
    if found then
      if again.kind <> 'rapat' or again.manual <> is_manual or again.status in ('ditolak', 'batal') then
        raise exception 'COFFEE_KEY_REUSED';
      end if;
      -- The same key with other drinks, another room or another PIC is not the same sending.
      if again.request_print is not null and req_print is not null and again.request_print <> req_print then
        raise exception 'COFFEE_KEY_REUSED';
      end if;
      return again.id;
    end if;
  end if;
  -- Two checks, not one "or": SQL does not promise which side of an "or" is worked out first.
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'COFFEE_INVALID'; end if;
  if jsonb_array_length(p_items) not between 1 and 40 then raise exception 'COFFEE_INVALID'; end if;
  if at_time > now() + interval '5 minutes' then raise exception 'COFFEE_INVALID'; end if;
  if nullif(p_order->>'parent_id', '') is not null then
    if is_manual then raise exception 'COFFEE_INVALID'; end if;
    select o.id, o.number, o.parent_id into parent from coffee_orders o where o.id = (p_order->>'parent_id')::uuid and o.kind = 'rapat';
    if not found then raise exception 'COFFEE_NOT_FOUND'; end if;
    root := coalesce(parent.parent_id, parent.id);
    select o.employee_id, o.person_name, o.person_group, o.person_position, o.person_bu, o.room, o.room_spot, o.guest, o.guest_count,
           o.status, o.manual, o.ordered_at
      into first_round from coffee_orders o where o.id = root and o.kind = 'rapat';
    if not found then raise exception 'COFFEE_NOT_FOUND'; end if;
    if first_round.manual or first_round.status in ('ditolak', 'batal')
       or to_char(first_round.ordered_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD') <> to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD') then
      raise exception 'COFFEE_PARENT_CLOSED';
    end if;
    pic_id := first_round.employee_id; pic_name := first_round.person_name; pic_group := first_round.person_group;
    pic_position := first_round.person_position; pic_bu := first_round.person_bu;
    the_room := first_round.room; the_spot := first_round.room_spot; the_guest := first_round.guest; the_guest_count := first_round.guest_count;
    order_no := parent.number;
    -- Two "Tambah lagi" at once take turns, so each gets its own round.
    perform pg_advisory_xact_lock(hashtext('coffee:rapat:' || order_no::text));
    select coalesce(max(o.round), 0) + 1 into rnd from coffee_orders o where o.kind = 'rapat' and o.number = order_no;
    if rnd > 50 then raise exception 'COFFEE_INVALID'; end if;
  else
    select e.id, e.full_name, e.position, e.business_unit, e.category into pic
      from employees e where e.id = (p_order->>'pic_id')::uuid and e.active;
    if not found then raise exception 'COFFEE_NOT_EMPLOYEE'; end if;
    pic_id := pic.id; pic_name := pic.full_name; pic_position := pic.position; pic_bu := pic.business_unit;
    pic_group := case pic.category when 'intern' then 'intern' when 'dw' then 'ga' when 'ga' then 'ga' else 'karyawan' end;
    the_room := nullif(btrim(coalesce(p_order->>'room', '')), ''); the_spot := nullif(p_order->>'room_spot', '');
    the_guest := nullif(btrim(coalesce(p_order->>'guest', '')), ''); the_guest_count := (p_order->>'guest_count')::smallint;
    order_no := nextval('coffee_meeting_no');
  end if;
  insert into coffee_orders (kind, number, round, parent_id, employee_id, person_name, person_group, person_position, person_bu,
      room, room_spot, guest, guest_count, status, processed_by, processed_label, processed_at,
      created_by, created_label, manual, ordered_at, quota_month, idempotency_key, request_print)
  values ('rapat', order_no, rnd, root, pic_id, pic_name, pic_group, pic_position, pic_bu,
      the_room, the_spot, the_guest, the_guest_count,
      case when is_manual then 'selesai' else 'diproses' end,
      case when is_manual then actor end, case when is_manual then actor_label end, case when is_manual then now() end,
      actor, actor_label, is_manual, at_time, to_char(at_time at time zone 'Asia/Jakarta', 'YYYY-MM'), p_key, req_print)
  returning id into saved;
  for item, place in select value, ordinality from jsonb_array_elements(p_items) with ordinality loop
    the_slug := item->>'slug';
    the_name := null;
    if the_slug is distinct from 'lainnya' then
      -- Shared lock: coffee_delete_drink waits for this order, so a drink is never deleted under it.
      select d.name, d.active, d.temperatures, d.in_guest_book, d.in_regular_menu into drink from coffee_drinks d where d.slug = the_slug for share;
      if not found or (not drink.active and not is_manual) then raise exception 'COFFEE_DRINK_GONE'; end if;
      -- Where the drink shows decides who may be given it: guests from the guest book, the team from the regular menu.
      if not is_manual and ((item->>'for' = 'tamu' and not drink.in_guest_book) or (item->>'for' = 'tim' and not drink.in_regular_menu)) then
        raise exception 'COFFEE_DRINK_GONE';
      end if;
      if item->>'temperature' is not null and not (item->>'temperature' = any (drink.temperatures)) then raise exception 'COFFEE_INVALID'; end if;
      the_name := drink.name;
    elsif not is_manual then
      -- A drink off the menu ("lainnya") only exists in Catat manual.
      raise exception 'COFFEE_INVALID';
    end if;
    if item->>'for' = 'tim' then
      select e.id, e.full_name, e.position, e.business_unit, e.category into who
        from employees e where e.id = (item->>'person_id')::uuid and e.active;
      if not found then raise exception 'COFFEE_NOT_EMPLOYEE'; end if;
      insert into coffee_order_items (order_id, for_whom, employee_id, person_name, person_group, person_position, person_bu,
          drink_slug, drink_other, drink_name, temperature, sugar, ice, qty, sort)
      values (saved, 'tim', who.id, who.full_name,
          case who.category when 'intern' then 'intern' when 'dw' then 'ga' when 'ga' then 'ga' else 'karyawan' end, who.position, who.business_unit,
          the_slug, nullif(btrim(coalesce(item->>'other', '')), ''), the_name, item->>'temperature', item->>'sugar', item->>'ice',
          coalesce((item->>'qty')::smallint, 1), place);
    elsif item->>'for' = 'tamu' then
      -- The guest's own name is optional, trimmed, and 40 letters at most (the form and the API cap it too).
      if char_length(btrim(coalesce(item->>'guest_name', ''))) > 40 then raise exception 'COFFEE_INVALID'; end if;
      insert into coffee_order_items (order_id, for_whom, guest_name, drink_slug, drink_other, drink_name, temperature, sugar, ice, qty, sort)
      values (saved, 'tamu', nullif(btrim(coalesce(item->>'guest_name', '')), ''),
          the_slug, nullif(btrim(coalesce(item->>'other', '')), ''), the_name, item->>'temperature', item->>'sugar',
          item->>'ice', coalesce((item->>'qty')::smallint, 1), place);
    else
      raise exception 'COFFEE_INVALID';
    end if;
  end loop;
  return saved;
end $$;

-- The two replaced functions keep their rights (create or replace does not touch them); said again so this file stands alone.
revoke all on function public.coffee_submit_claim(uuid, jsonb, timestamptz, boolean, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.coffee_submit_meeting(jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.coffee_submit_claim(uuid, jsonb, timestamptz, boolean, uuid, text, uuid) to service_role;
grant execute on function public.coffee_submit_meeting(jsonb, jsonb, uuid) to service_role;

commit;
