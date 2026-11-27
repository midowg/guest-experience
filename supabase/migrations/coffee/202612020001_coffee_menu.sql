-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
--
-- WG Coffee, F6 (26 Nov 2026): drink options per audience, and a menu the pengelola manages.
-- Run after 202612010001_coffee.sql and 202612010002_coffee_push.sql. Those two are applied on the
-- live database and are never edited again; everything new is here.
--
-- SAFE ON LIVE DATA, AND SAFE TO RUN TWICE:
--   * Nothing is dropped or rewritten. Existing orders keep their temperature, sugar and ice as
--     they were stored; the only write to old rows fills the new, empty drink_name.
--   * Every statement is "if not exists", "drop not null" (a no-op the second time), "create or
--     replace", or guarded: the 15 drinks are seeded only while coffee_drinks is empty, so a drink
--     the pengelola deleted or renamed never comes back, and the option switches are added with
--     their defaults only when the columns are new, so a later run never resets what was chosen.
--   * The deployed app works before and after: until this runs it reads the menu from its code
--     and asks every option of everyone (as before); once this has run it reads both from here.
--
-- What it does:
--   1. coffee_settings: nine switches, per audience (klaim = an employee's own claim, tim = a team
--      member in a meeting, tamu = a guest) x (suhu, gula, es). Employees are self-service at the
--      machine, so a claim asks nothing by default; guests and the team are served by GA and keep
--      all three. "es" (takaran es) only means something with "suhu" on and a cold drink.
--   2. coffee_order_items: temperature, sugar and ice may be NULL (the option was not asked; never
--      a made-up default), and drink_name keeps the drink's name as it was when ordered, so a
--      renamed or deleted drink still reads right in the history and the recap.
--   3. coffee_drinks: the menu (slug, name, description, group, temperatures, photo, order, shown
--      or hidden). Orders point at a drink by its slug; there is no foreign key, because 'lainnya'
--      (Catat manual) is not a drink of the menu.
--   4. coffee_submit_claim and coffee_submit_meeting, replaced with the same signatures: the drink
--      must be on the menu (and shown, unless a pengelola records it by hand), its name is copied
--      onto the row, and absent options are stored as NULL.
--   5. coffee_delete_drink (only a drink no order ever used), coffee_sort_drinks, coffee_drink_usage.
-- Server only, like every coffee_* table: RLS on, no policy, service_role alone.
--
-- ROLLBACK (by hand; only while no order has a NULL option, see the last line):
--   drop function if exists public.coffee_drink_usage();
--   drop function if exists public.coffee_sort_drinks(text[]);
--   drop function if exists public.coffee_delete_drink(text);
--   drop table if exists public.coffee_drinks;
--   alter table public.coffee_order_items drop column if exists drink_name;
--   alter table public.coffee_settings drop column if exists opt_klaim_suhu, drop column if exists opt_klaim_gula, drop column if exists opt_klaim_es,
--     drop column if exists opt_tim_suhu, drop column if exists opt_tim_gula, drop column if exists opt_tim_es,
--     drop column if exists opt_tamu_suhu, drop column if exists opt_tamu_gula, drop column if exists opt_tamu_es,
--     drop column if exists options_at, drop column if exists options_label;
--   then run the two "create or replace function" blocks of 202612010001_coffee.sql again, and,
--   after filling any NULL temperature/sugar/ice, set those three columns "not null" again.
begin;

-- 1. The option switches. Defaults: an employee's claim asks nothing; the team and guests are asked all three.
alter table public.coffee_settings
  add column if not exists opt_klaim_suhu boolean not null default false,
  add column if not exists opt_klaim_gula boolean not null default false,
  add column if not exists opt_klaim_es boolean not null default false,
  add column if not exists opt_tim_suhu boolean not null default true,
  add column if not exists opt_tim_gula boolean not null default true,
  add column if not exists opt_tim_es boolean not null default true,
  add column if not exists opt_tamu_suhu boolean not null default true,
  add column if not exists opt_tamu_gula boolean not null default true,
  add column if not exists opt_tamu_es boolean not null default true,
  add column if not exists options_at timestamptz,
  add column if not exists options_label text check (options_label is null or char_length(options_label) <= 120);

-- 2. An option that was not asked is stored as NULL. The value checks of migration 1 stay (a NULL passes them).
alter table public.coffee_order_items
  alter column temperature drop not null,
  alter column sugar drop not null,
  alter column ice drop not null,
  alter column ice drop default;
alter table public.coffee_order_items
  add column if not exists drink_name text check (drink_name is null or char_length(btrim(drink_name)) between 1 and 60);
create index if not exists coffee_order_items_drink on public.coffee_order_items (drink_slug);

-- 3. The menu.
create table if not exists public.coffee_drinks (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 1 and 40 and slug <> 'lainnya'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text not null default '' check (char_length(description) <= 200),
  drink_group text not null check (drink_group in ('kopi', 'non-kopi')),
  -- What it comes in; the first is offered first. One or both of 'panas' and 'es', never the same twice.
  temperatures text[] not null check (cardinality(temperatures) between 1 and 2 and temperatures <@ array['panas', 'es']::text[] and temperatures[1] is distinct from temperatures[2]),
  -- Where the photo is served from: a static file of the app (/coffee/drinks/...) for the first 15, or the public address of an uploaded one.
  photo_url text check (photo_url is null or char_length(photo_url) between 1 and 500),
  -- The uploaded photo's path in storage, so the old file can be removed when it is replaced. Null for the static files.
  photo_key text check (photo_key is null or char_length(photo_key) between 1 and 300),
  sort integer not null default 0,
  -- Hidden drinks cannot be ordered, but still show in the history.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_label text check (updated_label is null or char_length(updated_label) <= 120)
);
create index if not exists coffee_drinks_sort on public.coffee_drinks (sort, name);

-- The 15 drinks of src/lib/coffee/menu.ts, only while the menu is empty (the very first run): a
-- later run must not bring back a drink the pengelola deleted, nor undo a rename.
insert into public.coffee_drinks (slug, name, description, drink_group, temperatures, photo_url, sort)
select v.slug, v.name, v.description, v.drink_group, v.temperatures, '/coffee/drinks/' || v.slug || '.jpg', v.sort
from (values
  ('kopi-susu', 'Kopi Susu', 'Kopi hitam dicampur susu, lembut dan manis.', 'kopi', array['panas', 'es'], 10),
  ('cappuccino', 'Cappuccino', 'Espresso, susu panas, dan busa susu yang lembut.', 'kopi', array['panas', 'es'], 20),
  ('cafe-latte', 'Café Latte', 'Espresso dengan lebih banyak susu dan sedikit busa.', 'kopi', array['panas', 'es'], 30),
  ('cafe-mocha', 'Café Mocha', 'Espresso, susu, dan cokelat. Manis dan creamy.', 'kopi', array['panas', 'es'], 40),
  ('piccolo-latte', 'Piccolo Latte', 'Espresso dengan sedikit susu, rasa lebih kuat.', 'kopi', array['panas', 'es'], 50),
  ('cappuccino-double-shot', 'Cappuccino Double Shot', 'Cappuccino dengan dua shot espresso.', 'kopi', array['panas', 'es'], 60),
  ('matcha-espresso', 'Matcha Espresso', 'Matcha susu dengan espresso di atasnya.', 'kopi', array['panas', 'es'], 70),
  ('kopi-hitam', 'Kopi Hitam', 'Kopi murni tanpa susu, pekat.', 'kopi', array['panas', 'es'], 80),
  ('americano', 'Americano', 'Espresso dicampur air, rasa kopi lebih ringan.', 'kopi', array['panas', 'es'], 90),
  ('espresso', 'Espresso', 'Kopi pekat dalam porsi kecil.', 'kopi', array['panas'], 100),
  ('milk-chocolate', 'Milk Chocolate', 'Cokelat manis dicampur susu, rasanya lembut.', 'non-kopi', array['panas', 'es'], 110),
  ('matcha-latte', 'Matcha Latte', 'Matcha dengan susu, teh hijau yang lembut.', 'non-kopi', array['panas', 'es'], 120),
  ('dark-chocolate', 'Dark Chocolate', 'Cokelat hitam dengan susu, sedikit pahit.', 'non-kopi', array['panas', 'es'], 130),
  ('cucumber-ice', 'Cucumber Ice', 'Timun, jeruk nipis, dan mint. Segar.', 'non-kopi', array['es'], 140),
  ('classic-tea', 'Classic Tea', 'Seduhan teh dengan rasa klasik.', 'non-kopi', array['panas', 'es'], 150)
) as v (slug, name, description, drink_group, temperatures, sort)
where not exists (select 1 from public.coffee_drinks)
on conflict (slug) do nothing;

-- Orders made before this migration: the name the drink had then, from the menu in the code.
-- Only rows without a name are touched, so a second run changes nothing. 'lainnya' keeps its
-- typed name in drink_other.
update public.coffee_order_items i set drink_name = v.name
from (values
  ('kopi-susu', 'Kopi Susu'), ('cappuccino', 'Cappuccino'), ('cafe-latte', 'Café Latte'), ('cafe-mocha', 'Café Mocha'),
  ('piccolo-latte', 'Piccolo Latte'), ('cappuccino-double-shot', 'Cappuccino Double Shot'), ('matcha-espresso', 'Matcha Espresso'),
  ('kopi-hitam', 'Kopi Hitam'), ('americano', 'Americano'), ('espresso', 'Espresso'), ('milk-chocolate', 'Milk Chocolate'),
  ('matcha-latte', 'Matcha Latte'), ('dark-chocolate', 'Dark Chocolate'), ('cucumber-ice', 'Cucumber Ice'), ('classic-tea', 'Classic Tea')
) as v (slug, name)
where i.drink_name is null and i.drink_slug = v.slug;

/*
 * One claim (the same signature and rules as in 202612010001). New here: the drink must be on the
 * menu, and shown unless a pengelola records it by hand; its name is copied onto the row; and
 * temperature, sugar and ice are stored as they come, NULL when the option was not asked (the
 * server decides which options an audience is asked, from coffee_settings).
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
    select d.name, d.active, d.temperatures into drink from coffee_drinks d where d.slug = the_slug for share;
    if not found or (not drink.active and not is_manual) then raise exception 'COFFEE_DRINK_GONE'; end if;
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
 * One meeting order with all its drinks (the same signature and rules as in 202612010001). New
 * here, for every drink: it must be on the menu, and shown unless a pengelola records it by hand
 * ('lainnya' only then); its name is copied onto the row; absent options are stored as NULL.
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
      select d.name, d.active, d.temperatures into drink from coffee_drinks d where d.slug = the_slug for share;
      if not found or (not drink.active and not is_manual) then raise exception 'COFFEE_DRINK_GONE'; end if;
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

/*
 * Hapus minuman: only a drink that no order ever used; anything ordered once can only be hidden,
 * so the history and the recap never lose it. The row is locked first, so an order being sent for
 * this drink right now (which holds a shared lock on it) is seen. Answers with the uploaded
 * photo's storage path, for the server to remove the file.
 */
create or replace function public.coffee_delete_drink(p_slug text) returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  found_key text;
begin
  perform 1 from coffee_drinks d where d.slug = p_slug for update;
  if not found then raise exception 'COFFEE_DRINK_NOT_FOUND'; end if;
  if exists (select 1 from coffee_order_items i where i.drink_slug = p_slug) then raise exception 'COFFEE_DRINK_USED'; end if;
  delete from coffee_drinks d where d.slug = p_slug returning d.photo_key into found_key;
  return found_key;
end $$;

/* Atur urutan: the menu's order, in one statement. Slugs that are not on the menu are passed over; answers how many were placed. */
create or replace function public.coffee_sort_drinks(p_slugs text[]) returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  placed integer;
begin
  update coffee_drinks d set sort = x.place * 10
    from unnest(p_slugs) with ordinality as x (slug, place)
   where d.slug = x.slug;
  get diagnostics placed = row_count;
  return placed;
end $$;

/* How many orders ever used each drink (the admin's Menu: "Hapus" is only offered at zero). */
create or replace function public.coffee_drink_usage() returns table (slug text, orders bigint)
language sql
stable
set search_path = public, pg_temp
as $$
  select i.drink_slug, count(distinct i.order_id) from coffee_order_items i where i.drink_slug <> 'lainnya' group by i.drink_slug;
$$;

alter table public.coffee_drinks enable row level security;
revoke all on public.coffee_drinks from public, anon, authenticated;
revoke all on function public.coffee_delete_drink(text) from public, anon, authenticated;
revoke all on function public.coffee_sort_drinks(text[]) from public, anon, authenticated;
revoke all on function public.coffee_drink_usage() from public, anon, authenticated;
grant select, insert, update, delete on public.coffee_drinks to service_role;
grant execute on function public.coffee_delete_drink(text) to service_role;
grant execute on function public.coffee_sort_drinks(text[]) to service_role;
grant execute on function public.coffee_drink_usage() to service_role;
-- The two replaced functions keep the rights of 202612010001 (create or replace does not touch them); said again so this file stands alone.
revoke all on function public.coffee_submit_claim(uuid, jsonb, timestamptz, boolean, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.coffee_submit_meeting(jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.coffee_submit_claim(uuid, jsonb, timestamptz, boolean, uuid, text, uuid) to service_role;
grant execute on function public.coffee_submit_meeting(jsonb, jsonb, uuid) to service_role;

commit;
