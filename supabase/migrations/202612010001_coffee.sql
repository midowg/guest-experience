-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Werkudara Coffee (decided 25 Nov 2026, docs/coffee/RENCANA-PENERAPAN.md):
--   1. Employees claim a drink from the office JumpStart machine in /coffee (a monthly quota per
--      group, calendar month in WIB); GA sends meeting orders (guests and team) from the tablet at
--      /coffee/ga; the pengelola (admin grant 'coffee') buys by hand and marks each one in
--      /admin/coffee. coffee_orders holds one row per request, coffee_order_items its drinks.
--      Names, positions, BU and group are copied onto the rows, so last month's recap never
--      changes when Data karyawan does.
--   2. The quota is decided in one place only, coffee_submit_claim, under a lock per person and
--      month, so two quick taps (or twenty) never pass it together.
--   3. A pengelola may cancel a record made by hand (Catat manual) with coffee_cancel_manual: the
--      row stays, as 'batal', with who cancelled it and when, and its place in the quota is free again.
--   4. admin_grants.apps gains 'coffee'. Until this runs only the super admin opens /admin/coffee,
--      and every Coffee API answers "menunggu migrasi".
-- Server only, like every pw_* table: RLS on, no policy, service_role alone.
--
-- ROLLBACK (by hand):
--   drop function if exists public.coffee_cancel_manual(uuid, uuid, text);
--   drop function if exists public.coffee_reopen(uuid, uuid, text, integer);
--   drop function if exists public.coffee_submit_meeting(jsonb, jsonb, uuid);
--   drop function if exists public.coffee_submit_claim(uuid, jsonb, timestamptz, boolean, uuid, text, uuid);
--   drop table if exists public.coffee_order_items, public.coffee_orders, public.coffee_settings;
--   drop sequence if exists public.coffee_claim_no, public.coffee_meeting_no;
--   update public.admin_grants set apps = array_remove(apps, 'coffee');
--   then restore the check of 202611200703 without 'coffee'.
begin;

create table if not exists public.coffee_settings (
  id smallint primary key default 1 check (id = 1),
  quota_karyawan smallint not null default 4 check (quota_karyawan between 0 and 60),
  quota_ga smallint not null default 2 check (quota_ga between 0 and 60),
  quota_intern smallint not null default 2 check (quota_intern between 0 and 60),
  updated_at timestamptz,
  updated_label text check (updated_label is null or char_length(updated_label) <= 120),
  -- PIN GA: four digits the GA officer types to leave the guest menu book on the tablet. Only its
  -- salted hash is kept (worked out on the server, src/lib/server/coffee/pin.ts); it never leaves
  -- the server, the pages only learn whether one is set. Null: no PIN yet (leaving asks to confirm).
  ga_pin_hash text check (ga_pin_hash is null or char_length(ga_pin_hash) between 20 and 300),
  ga_pin_at timestamptz,
  ga_pin_label text check (ga_pin_label is null or char_length(ga_pin_label) <= 120)
);
insert into public.coffee_settings (id) values (1) on conflict (id) do nothing;

create sequence if not exists public.coffee_claim_no;
create sequence if not exists public.coffee_meeting_no;

create table if not exists public.coffee_orders (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('klaim', 'rapat')),
  -- K-418 / T-0113; a later round of the same meeting ("Tambah lagi") keeps its first round's number.
  number integer not null,
  round smallint not null default 1 check (round between 1 and 50),
  parent_id uuid references public.coffee_orders (id) on delete set null,
  -- klaim: who claims; rapat: the PIC.
  employee_id uuid not null references public.employees (id),
  person_name text not null check (char_length(person_name) <= 200),
  person_group text check (person_group is null or person_group in ('karyawan', 'ga', 'intern')),
  person_position text check (person_position is null or char_length(person_position) <= 200),
  person_bu text check (person_bu is null or char_length(person_bu) <= 120),
  room text check (room is null or char_length(room) <= 80),
  room_spot text check (room_spot is null or char_length(room_spot) <= 40),
  guest text check (guest is null or char_length(guest) <= 120),
  guest_count smallint check (guest_count is null or guest_count between 1 and 500),
  status text not null default 'diproses' check (status in ('diproses', 'selesai', 'ditolak', 'batal')),
  reject_note text check (reject_note is null or char_length(btrim(reject_note)) between 3 and 300),
  processed_by uuid references public.employees (id) on delete set null,
  processed_label text check (processed_label is null or char_length(processed_label) <= 120),
  processed_at timestamptz,
  -- Who sent it: the claimant, GA, or the pengelola (Catat manual).
  created_by uuid references public.employees (id) on delete set null,
  created_label text check (created_label is null or char_length(created_label) <= 120),
  manual boolean not null default false,
  -- May lie in the past for Catat manual.
  ordered_at timestamptz not null default now(),
  -- The WIB month of ordered_at, filled by the functions below.
  quota_month text not null check (quota_month ~ '^\d{4}-\d{2}$'),
  -- From the browser: the same request sent twice is one row.
  idempotency_key uuid unique,
  -- Meeting orders: a fingerprint of what the key was first sent with (room, PIC, parent, drinks),
  -- worked out on the server. The same key with other contents is refused instead of answered
  -- with the first order (drinks added after a lost answer would vanish silently).
  request_print text check (request_print is null or char_length(request_print) <= 100),
  created_at timestamptz not null default now(),
  constraint coffee_orders_number unique (kind, number, round),
  constraint coffee_orders_claim_shape check (kind <> 'klaim' or (person_group is not null and room is null and guest is null and guest_count is null and round = 1 and parent_id is null)),
  constraint coffee_orders_refused_note check (status <> 'ditolak' or reject_note is not null)
);
create index if not exists coffee_orders_waiting on public.coffee_orders (ordered_at) where status = 'diproses';
create index if not exists coffee_orders_quota on public.coffee_orders (employee_id, quota_month) where kind = 'klaim' and status in ('diproses', 'selesai');
create index if not exists coffee_orders_day on public.coffee_orders (ordered_at desc);
create index if not exists coffee_orders_person on public.coffee_orders (employee_id, ordered_at desc);
-- The queue's "Baru diproses" and today's numbers are read every ten seconds.
create index if not exists coffee_orders_processed on public.coffee_orders (processed_at desc) where status in ('selesai', 'ditolak');

create table if not exists public.coffee_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.coffee_orders (id) on delete cascade,
  for_whom text not null check (for_whom in ('klaim', 'tamu', 'tim')),
  -- tim: that person; klaim: the claimant; tamu: null.
  employee_id uuid references public.employees (id) on delete set null,
  -- tim only: copied like the order's own person.
  person_name text check (person_name is null or char_length(person_name) <= 200),
  person_group text check (person_group is null or person_group in ('karyawan', 'ga', 'intern')),
  person_position text check (person_position is null or char_length(person_position) <= 200),
  person_bu text check (person_bu is null or char_length(person_bu) <= 120),
  -- tamu only, optional: the name a guest gave in the menu book ("Tamu · Budi"), so the cups are not mixed up.
  guest_name text check (guest_name is null or char_length(guest_name) between 1 and 40),
  -- A slug of src/lib/coffee/menu.ts, or 'lainnya' (Catat manual only) with its name in drink_other.
  drink_slug text not null check (char_length(drink_slug) between 1 and 40),
  drink_other text check (drink_other is null or char_length(btrim(drink_other)) between 1 and 60),
  temperature text not null check (temperature in ('panas', 'es')),
  sugar text not null check (sugar in ('Tanpa', 'Sedikit', 'Setengah', 'Kurang', 'Normal', 'Ekstra')),
  ice text not null default 'Normal' check (ice in ('Sedikit', 'Normal', 'Ekstra')),
  qty smallint not null default 1 check (qty between 1 and 50),
  sort smallint not null default 0,
  constraint coffee_order_items_other check (drink_slug <> 'lainnya' or drink_other is not null)
);
create index if not exists coffee_order_items_order on public.coffee_order_items (order_id);

/*
 * One claim. The quota is checked here and nowhere else: the person, their group and the
 * settings are read inside, under a lock per person and WIB month. p_manual: recorded by a
 * pengelola (Catat manual), saved as done at once; the quota still holds.
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
  grp text;
  quota integer;
  at_time timestamptz := coalesce(p_at, now());
  bulan text;
  is_manual boolean := coalesce(p_manual, false);
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
  if not is_manual and p_item->>'slug' = 'lainnya' then raise exception 'COFFEE_INVALID'; end if;
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
  insert into coffee_order_items (order_id, for_whom, employee_id, drink_slug, drink_other, temperature, sugar, ice, qty)
  values (saved, 'klaim', p_employee, p_item->>'slug', nullif(btrim(coalesce(p_item->>'other', '')), ''),
      p_item->>'temperature', p_item->>'sugar', coalesce(p_item->>'ice', 'Normal'), 1);
  return saved;
end $$;

/*
 * One meeting order with all its drinks, in one transaction; no quota. p_order: pic_id, room,
 * room_spot, guest, guest_count, parent_id ("Tambah lagi": the same number, the next round),
 * actor_id, actor_label, ordered_at, manual (saved as done at once). p_items: an array of
 * { for: 'tamu' | 'tim', person_id (tim), slug, other, temperature, sugar, ice, qty }.
 * With parent_id the PIC, room, guest and guest count are the first round's: what the sender put
 * in p_order for them is not read. The first round must be of today (WIB), sent from the tablet,
 * and neither refused nor cancelled.
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
  pic_id uuid;
  pic_name text;
  pic_group text;
  pic_position text;
  pic_bu text;
  the_room text;
  the_spot text;
  the_guest text;
  the_guest_count smallint;
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
    if item->>'for' = 'tim' then
      select e.id, e.full_name, e.position, e.business_unit, e.category into who
        from employees e where e.id = (item->>'person_id')::uuid and e.active;
      if not found then raise exception 'COFFEE_NOT_EMPLOYEE'; end if;
      insert into coffee_order_items (order_id, for_whom, employee_id, person_name, person_group, person_position, person_bu,
          drink_slug, drink_other, temperature, sugar, ice, qty, sort)
      values (saved, 'tim', who.id, who.full_name,
          case who.category when 'intern' then 'intern' when 'dw' then 'ga' when 'ga' then 'ga' else 'karyawan' end, who.position, who.business_unit,
          item->>'slug', nullif(btrim(coalesce(item->>'other', '')), ''), item->>'temperature', item->>'sugar', coalesce(item->>'ice', 'Normal'),
          coalesce((item->>'qty')::smallint, 1), place);
    elsif item->>'for' = 'tamu' then
      -- The guest's own name is optional, trimmed, and 40 letters at most (the form and the API cap it too).
      if char_length(btrim(coalesce(item->>'guest_name', ''))) > 40 then raise exception 'COFFEE_INVALID'; end if;
      insert into coffee_order_items (order_id, for_whom, guest_name, drink_slug, drink_other, temperature, sugar, ice, qty, sort)
      values (saved, 'tamu', nullif(btrim(coalesce(item->>'guest_name', '')), ''),
          item->>'slug', nullif(btrim(coalesce(item->>'other', '')), ''), item->>'temperature', item->>'sugar',
          coalesce(item->>'ice', 'Normal'), coalesce((item->>'qty')::smallint, 1), place);
    else
      raise exception 'COFFEE_INVALID';
    end if;
  end loop;
  return saved;
end $$;

/*
 * Urungkan: a done or refused order goes back to the queue, only by the one who processed it and
 * within the window. A refused claim takes a place in the quota again, so the quota is checked
 * again under the same lock as coffee_submit_claim.
 */
create or replace function public.coffee_reopen(p_order uuid, p_actor uuid, p_actor_label text, p_window_seconds integer) returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  found_order record;
  cfg record;
  quota integer;
begin
  select o.id, o.kind, o.status, o.manual, o.employee_id, o.person_group, o.quota_month, o.processed_by, o.processed_label, o.processed_at
    into found_order from coffee_orders o where o.id = p_order for update;
  if not found then raise exception 'COFFEE_NOT_FOUND'; end if;
  if found_order.status not in ('selesai', 'ditolak') or found_order.manual
     or found_order.processed_by is distinct from p_actor or found_order.processed_label is distinct from left(p_actor_label, 120)
     or found_order.processed_at is null
     or found_order.processed_at <= now() - make_interval(secs => greatest(coalesce(p_window_seconds, 0), 0)) then
    raise exception 'COFFEE_UNDO_EXPIRED';
  end if;
  if found_order.kind = 'klaim' and found_order.status = 'ditolak' then
    perform pg_advisory_xact_lock(hashtext('coffee:' || found_order.employee_id::text || ':' || found_order.quota_month));
    select s.quota_karyawan, s.quota_ga, s.quota_intern into cfg from coffee_settings s where s.id = 1;
    quota := case found_order.person_group when 'intern' then coalesce(cfg.quota_intern, 2) when 'ga' then coalesce(cfg.quota_ga, 2) else coalesce(cfg.quota_karyawan, 4) end;
    if (select count(*) from coffee_orders
         where employee_id = found_order.employee_id and kind = 'klaim' and quota_month = found_order.quota_month
           and status in ('diproses', 'selesai')) >= quota then
      raise exception 'COFFEE_QUOTA_FULL';
    end if;
  end if;
  update coffee_orders set status = 'diproses', processed_by = null, processed_label = null, processed_at = null, reject_note = null
   where id = p_order;
end $$;

/*
 * Batalkan catatan: a record made by hand (Catat manual) that turned out wrong (the wrong person,
 * the wrong month). Any pengelola may cancel it. The row stays, as 'batal', and processed_* now
 * say who cancelled it and when (created_* still say who recorded it). A cancelled claim no longer
 * counts in the quota, so nothing needs the quota's lock. Orders made in the app are never touched.
 */
create or replace function public.coffee_cancel_manual(p_order uuid, p_actor uuid, p_actor_label text) returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  found_order record;
begin
  select o.id, o.status, o.manual into found_order from coffee_orders o where o.id = p_order for update;
  if not found then raise exception 'COFFEE_NOT_FOUND'; end if;
  if not found_order.manual then raise exception 'COFFEE_NOT_MANUAL'; end if;
  if found_order.status <> 'selesai' then raise exception 'COFFEE_ALREADY_CANCELLED'; end if;
  update coffee_orders set status = 'batal', processed_by = p_actor, processed_label = left(p_actor_label, 120), processed_at = now()
   where id = p_order;
end $$;

alter table public.coffee_settings enable row level security;
alter table public.coffee_orders enable row level security;
alter table public.coffee_order_items enable row level security;
revoke all on public.coffee_settings, public.coffee_orders, public.coffee_order_items from public, anon, authenticated;
revoke all on sequence public.coffee_claim_no, public.coffee_meeting_no from public, anon, authenticated;
revoke all on function public.coffee_submit_claim(uuid, jsonb, timestamptz, boolean, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.coffee_submit_meeting(jsonb, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.coffee_reopen(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.coffee_cancel_manual(uuid, uuid, text) from public, anon, authenticated;
grant select, insert, update, delete on public.coffee_settings, public.coffee_orders, public.coffee_order_items to service_role;
grant usage, select on sequence public.coffee_claim_no, public.coffee_meeting_no to service_role;
grant execute on function public.coffee_submit_claim(uuid, jsonb, timestamptz, boolean, uuid, text, uuid) to service_role;
grant execute on function public.coffee_submit_meeting(jsonb, jsonb, uuid) to service_role;
grant execute on function public.coffee_reopen(uuid, uuid, text, integer) to service_role;
grant execute on function public.coffee_cancel_manual(uuid, uuid, text) to service_role;

-- The apps check of 202611200703 plus 'coffee' (Pengelola Werkudara Coffee, /admin/coffee).
alter table public.admin_grants drop constraint if exists admin_grants_apps_check;
alter table public.admin_grants add constraint admin_grants_apps_check
  check (apps <@ array['acara', 'friday_sharing', 'your_visit', 'wam', 'kuesioner', 'tv', 'wellbeing', 'wam_acara', 'hr', 'coffee']::text[]);

commit;
