-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Main WAM, agen E (Admin WAM → Main WAM → isi acara, docs/main-wam/KONTRAK.md §6): the changes an
-- admin makes to many rows at once happen in one transaction, so a failure never leaves half a
-- kelompok, half a kelompok kegiatan, or half a seat list:
--   mw_admin_set_group_members     the members and koordinator of one kelompok (people move from their old kelompok)
--   mw_admin_import_groups         kelompok pasted from a sheet (by number; each listed kelompok gets exactly its rows)
--   mw_admin_set_activity_members  the members of one kelompok kegiatan (one per person per session)
--   mw_admin_import_activity_groups kelompok kegiatan of one session pasted from a sheet
--   mw_admin_set_trip_seats        kursi and kendaraan of one step of Perjalanan
-- Callable by the server only (service role). No table changes.
-- Needs 202611200001.
-- ROLLBACK (by hand): drop the five functions below.
begin;

/* One kelompok's members: exactly `p_members`, at most one koordinator (one of them). */
create function public.mw_admin_set_group_members(p_group uuid, p_members uuid[], p_coordinator uuid)
returns integer
language plpgsql set search_path = public as $$
declare
  members uuid[] := array(select distinct member from unnest(coalesce(p_members, '{}'::uuid[])) as member where member is not null);
  placed integer;
begin
  perform 1 from public.mw_groups where id = p_group for update;
  if not found then raise exception 'MW_GROUP_NOT_FOUND' using errcode = 'P0002'; end if;
  if p_coordinator is not null and not (p_coordinator = any(members)) then
    raise exception 'MW_COORDINATOR_NOT_MEMBER' using errcode = 'P0001';
  end if;
  delete from public.mw_group_members where group_id = p_group and not (employee_id = any(members));
  -- Clear the koordinator first: the partial unique index allows one per kelompok at any moment.
  update public.mw_group_members set coordinator = false where group_id = p_group and coordinator;
  -- One kelompok per person: someone in another kelompok moves here (and is no longer its koordinator).
  insert into public.mw_group_members (group_id, employee_id, coordinator)
    select p_group, member, false from unnest(members) as member
    on conflict (employee_id) do update set group_id = excluded.group_id, coordinator = false;
  get diagnostics placed = row_count;
  if p_coordinator is not null then
    update public.mw_group_members set coordinator = true where group_id = p_group and employee_id = p_coordinator;
  end if;
  return placed;
end $$;

/*
 * Kelompok from a sheet: [{"number", "name", "employeeIds": [...], "coordinatorId"}]. A number
 * that exists is renamed; a new one is added. Each listed kelompok ends with exactly its people;
 * kelompok not listed keep theirs (minus people who moved into a listed one).
 */
create function public.mw_admin_import_groups(p_groups jsonb)
returns integer
language plpgsql set search_path = public as $$
declare
  item jsonb;
  target uuid;
  members uuid[];
  seen uuid[] := '{}'::uuid[];
  numbers integer[] := '{}'::integer[];
  done integer := 0;
begin
  if jsonb_typeof(p_groups) is distinct from 'array' or jsonb_array_length(p_groups) = 0 then
    raise exception 'MW_BAD_INPUT' using errcode = 'P0001';
  end if;
  for item in select value from jsonb_array_elements(p_groups) loop
    if (item->>'number')::integer = any(numbers) then raise exception 'MW_DUPLICATE_GROUP' using errcode = 'P0001'; end if;
    numbers := numbers || (item->>'number')::integer;
    members := array(select jsonb_array_elements_text(coalesce(item->'employeeIds', '[]'::jsonb))::uuid);
    if members && seen then raise exception 'MW_DUPLICATE_MEMBER' using errcode = 'P0001'; end if;
    seen := seen || members;
    insert into public.mw_groups (number, name, sort) values ((item->>'number')::integer, btrim(item->>'name'), (item->>'number')::integer)
      on conflict (number) do update set name = excluded.name
      returning id into target;
    perform public.mw_admin_set_group_members(target, members, nullif(item->>'coordinatorId', '')::uuid);
    done := done + 1;
  end loop;
  return done;
end $$;

/* One kelompok kegiatan's members: exactly `p_members`; someone in another group of the same session moves here. */
create function public.mw_admin_set_activity_members(p_group uuid, p_members uuid[])
returns integer
language plpgsql set search_path = public as $$
declare
  members uuid[] := array(select distinct member from unnest(coalesce(p_members, '{}'::uuid[])) as member where member is not null);
  target_session uuid;
  placed integer;
begin
  select session_id into target_session from public.mw_activity_groups where id = p_group for update;
  if not found then raise exception 'MW_GROUP_NOT_FOUND' using errcode = 'P0002'; end if;
  delete from public.mw_activity_group_members where activity_group_id = p_group and not (employee_id = any(members));
  insert into public.mw_activity_group_members (activity_group_id, session_id, employee_id)
    select p_group, target_session, member from unnest(members) as member
    on conflict (session_id, employee_id) do update set activity_group_id = excluded.activity_group_id;
  get diagnostics placed = row_count;
  return placed;
end $$;

/* Kelompok kegiatan of one session from a sheet: [{"label", "kind", "note", "sort", "employeeIds"}], matched by label. */
create function public.mw_admin_import_activity_groups(p_session uuid, p_groups jsonb)
returns integer
language plpgsql set search_path = public as $$
declare
  item jsonb;
  target uuid;
  members uuid[];
  seen uuid[] := '{}'::uuid[];
  done integer := 0;
begin
  perform 1 from public.mw_sessions where id = p_session;
  if not found then raise exception 'MW_SESSION_NOT_FOUND' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_groups) is distinct from 'array' or jsonb_array_length(p_groups) = 0 then
    raise exception 'MW_BAD_INPUT' using errcode = 'P0001';
  end if;
  for item in select value from jsonb_array_elements(p_groups) loop
    members := array(select jsonb_array_elements_text(coalesce(item->'employeeIds', '[]'::jsonb))::uuid);
    if members && seen then raise exception 'MW_DUPLICATE_MEMBER' using errcode = 'P0001'; end if;
    seen := seen || members;
    insert into public.mw_activity_groups (session_id, kind, label, note, sort)
      values (p_session, coalesce(item->>'kind', 'pos'), btrim(item->>'label'), coalesce(item->>'note', ''), coalesce((item->>'sort')::integer, 0))
      on conflict (session_id, label) do update set kind = excluded.kind,
        note = case when excluded.note <> '' then excluded.note else public.mw_activity_groups.note end, sort = excluded.sort
      returning id into target;
    perform public.mw_admin_set_activity_members(target, members);
    done := done + 1;
  end loop;
  return done;
end $$;

/*
 * Kursi and kendaraan of one step: [{"employeeId", "seat", "vehicle"}]. With p_replace, people not
 * listed lose their seat on this step; a row with neither seat nor vehicle is no seat.
 */
create function public.mw_admin_set_trip_seats(p_trip uuid, p_seats jsonb, p_replace boolean)
returns integer
language plpgsql set search_path = public as $$
declare
  placed integer;
begin
  perform 1 from public.mw_trips where id = p_trip for update;
  if not found then raise exception 'MW_TRIP_NOT_FOUND' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_seats) is distinct from 'array' then raise exception 'MW_BAD_INPUT' using errcode = 'P0001'; end if;
  if p_replace then
    delete from public.mw_trip_seats where trip_id = p_trip
      and employee_id not in (select (value->>'employeeId')::uuid from jsonb_array_elements(p_seats));
  end if;
  insert into public.mw_trip_seats (trip_id, employee_id, seat, vehicle)
    select p_trip, (value->>'employeeId')::uuid, btrim(coalesce(value->>'seat', '')), btrim(coalesce(value->>'vehicle', '')) from jsonb_array_elements(p_seats)
    on conflict (trip_id, employee_id) do update set seat = excluded.seat, vehicle = excluded.vehicle;
  get diagnostics placed = row_count;
  delete from public.mw_trip_seats where trip_id = p_trip and seat = '' and vehicle = '';
  return placed;
end $$;

revoke all on function public.mw_admin_set_group_members(uuid, uuid[], uuid), public.mw_admin_import_groups(jsonb),
  public.mw_admin_set_activity_members(uuid, uuid[]), public.mw_admin_import_activity_groups(uuid, jsonb),
  public.mw_admin_set_trip_seats(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.mw_admin_set_group_members(uuid, uuid[], uuid), public.mw_admin_import_groups(jsonb),
  public.mw_admin_set_activity_members(uuid, uuid[]), public.mw_admin_import_activity_groups(uuid, jsonb),
  public.mw_admin_set_trip_seats(uuid, jsonb, boolean) to service_role;

commit;
