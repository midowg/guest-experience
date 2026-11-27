-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Main WAM, agen E (Admin WAM → Main WAM → isi acara, docs/main-wam/KONTRAK.md §6): the changes an
-- admin makes to many rows at once happen in one transaction, so a failure never leaves half a
-- kelompok, half a kelompok kegiatan, or half a seat list:
--   mw_admin_set_group_members     the members and koordinator of one kelompok (people move from their old kelompok)
--   mw_admin_import_groups         kelompok pasted from a sheet (by number; each listed kelompok gets exactly its rows)
--   mw_admin_set_activity_members  the members of one kelompok kegiatan (one per person per session)
--   mw_admin_import_activity_groups kelompok kegiatan of one session pasted from a sheet
--   mw_admin_set_trip_seats        kursi and kendaraan of one step of Perjalanan
--   mw_admin_session_usage         what each session already has (absen, foto, Silent Meeting, Awarding), for Hapus
--   mw_admin_delete_session        Hapus sesi, refused once the session has any of those (audit M4: Batalkan instead)
--   mw_admin_shift_sessions        Geser jam: several sessions at once, each only at the version the admin saw (audit S7)
-- Callable by the server only (service role). No table changes.
-- Needs 202611200001, 202611200002 and 202611200003 (the tables a session's usage is read from).
-- ROLLBACK (by hand): drop the eight functions below.
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

/*
 * What each session already has, so Rundown shows Hapus only where it can work (audit M4): absen,
 * Momen photos tagged to it (any status), a Silent Meeting question, Awarding categories, and its
 * kelompok kegiatan (those go with it). Only whether a Silent Meeting question exists: no feedback
 * count leaves the database before the meeting is final (mw_silent_results, audit H1).
 * p_sessions null = every session.
 */
create function public.mw_admin_session_usage(p_sessions uuid[] default null)
returns table (session_id uuid, attendance integer, photos integer, silent boolean, awards integer, activity_groups integer)
language sql stable set search_path = public as $$
  select s.id, coalesce(a.n, 0), coalesce(p.n, 0), q.session_id is not null, coalesce(c.n, 0), coalesce(g.n, 0)
  from public.mw_sessions s
  left join (select x.session_id, count(*)::integer as n from public.mw_attendance x group by x.session_id) a on a.session_id = s.id
  left join (select x.session_id, count(*)::integer as n from public.mw_photos x where x.session_id is not null group by x.session_id) p on p.session_id = s.id
  left join public.mw_silent_questions q on q.session_id = s.id
  left join (select x.session_id, count(*)::integer as n from public.mw_award_categories x where x.session_id is not null group by x.session_id) c on c.session_id = s.id
  left join (select x.session_id, count(*)::integer as n from public.mw_activity_groups x group by x.session_id) g on g.session_id = s.id
  where p_sessions is null or s.id = any(p_sessions)
$$;

/*
 * Hapus sesi. Refused (MW_SESSION_IN_USE) once it has absen, tagged photos, a Silent Meeting
 * question or an Awarding category: the admin cancels it instead (status batal), so nothing is
 * lost. The session is locked first, so a check-in or a photo tagged at the same moment waits and
 * is then refused by its foreign key: the check and the delete see the same rows. Its kelompok
 * kegiatan and its Riwayat perubahan go with it.
 */
create function public.mw_admin_delete_session(p_session uuid)
returns void
language plpgsql set search_path = public as $$
begin
  perform 1 from public.mw_sessions where id = p_session for update;
  if not found then raise exception 'MW_SESSION_NOT_FOUND' using errcode = 'P0002'; end if;
  if exists (select 1 from public.mw_attendance where session_id = p_session)
     or exists (select 1 from public.mw_photos where session_id = p_session)
     or exists (select 1 from public.mw_silent_questions where session_id = p_session)
     or exists (select 1 from public.mw_award_categories where session_id = p_session) then
    raise exception 'MW_SESSION_IN_USE' using errcode = 'P0001';
  end if;
  delete from public.mw_sessions where id = p_session;
end $$;

/*
 * Geser jam: [{"id", "version"}] moved by p_minutes together (all or nothing). Rows are locked in
 * id order (no deadlock with Rundown live's mw_rundown_change), and each must still be at the
 * version the admin saw (updated_at): one changed in the meantime, say in Rundown live, is not
 * overwritten (MW_SESSION_CHANGED, detail: its id). A draft keeps its own "diubah" mark; a
 * published or cancelled one is stamped by p_by. Returns each moved session's old and new times
 * (the server logs them and tells participants).
 */
create function public.mw_admin_shift_sessions(p_items jsonb, p_minutes integer, p_by uuid)
returns table (out_session uuid, out_status text, old_start timestamptz, old_end timestamptz, new_start timestamptz, new_end timestamptz)
language plpgsql set search_path = public as $$
declare
  item jsonb;
  s public.mw_sessions%rowtype;
  step interval := make_interval(mins => p_minutes);
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 200
     or p_minutes is null or p_minutes = 0 or abs(p_minutes) > 720 then
    raise exception 'MW_BAD_INPUT' using errcode = 'P0001';
  end if;
  perform 1 from public.mw_sessions
    where id in (select (value ->> 'id')::uuid from jsonb_array_elements(p_items))
    order by id for update;
  for item in select value from jsonb_array_elements(p_items) loop
    select * into s from public.mw_sessions where id = (item ->> 'id')::uuid;
    if not found then raise exception 'MW_SESSION_NOT_FOUND' using errcode = 'P0002'; end if;
    if item ->> 'version' is null or s.updated_at <> (item ->> 'version')::timestamptz then
      raise exception 'MW_SESSION_CHANGED' using errcode = 'P0001', detail = s.id::text;
    end if;
    update public.mw_sessions
      set starts_at = s.starts_at + step, ends_at = s.ends_at + step, updated_at = clock_timestamp(),
        changed_at = case when s.status = 'draf' then s.changed_at else now() end,
        changed_by = case when s.status = 'draf' then s.changed_by else p_by end
      where id = s.id;
    out_session := s.id; out_status := s.status;
    old_start := s.starts_at; old_end := s.ends_at; new_start := s.starts_at + step; new_end := s.ends_at + step;
    return next;
  end loop;
end $$;

revoke all on function public.mw_admin_set_group_members(uuid, uuid[], uuid), public.mw_admin_import_groups(jsonb),
  public.mw_admin_set_activity_members(uuid, uuid[]), public.mw_admin_import_activity_groups(uuid, jsonb),
  public.mw_admin_set_trip_seats(uuid, jsonb, boolean), public.mw_admin_session_usage(uuid[]), public.mw_admin_delete_session(uuid),
  public.mw_admin_shift_sessions(jsonb, integer, uuid) from public, anon, authenticated;
grant execute on function public.mw_admin_set_group_members(uuid, uuid[], uuid), public.mw_admin_import_groups(jsonb),
  public.mw_admin_set_activity_members(uuid, uuid[]), public.mw_admin_import_activity_groups(uuid, jsonb),
  public.mw_admin_set_trip_seats(uuid, jsonb, boolean), public.mw_admin_session_usage(uuid[]), public.mw_admin_delete_session(uuid),
  public.mw_admin_shift_sessions(jsonb, integer, uuid) to service_role;

commit;
