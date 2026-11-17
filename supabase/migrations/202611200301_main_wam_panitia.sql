-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Main WAM, panitia (agen C, docs/main-wam/KONTRAK.md §6): what Rundown live and Moderasi Momen
-- need on top of fondasi's tables.
--   1. mw_sessions.updated_at moves on every change (Admin WAM too), so it is the row's version:
--      a save from Rundown live names the version it saw and is refused when someone changed the
--      row in between (two panitia at once never overwrite each other, optimistic concurrency).
--   2. mw_rundown_change: saves one change of Rundown live (times, place, cancel) for one or more
--      sessions at once, in one transaction, checks every version, stamps "diubah <siapa> · jam",
--      and writes Riwayat perubahan.
--   3. mw_moderation_log + mw_moderate_photo: panitia's decisions on reported photos (siapa, kapan,
--      apa), in one step with the photo's status, refused when another panitia decided first. The
--      log outlives a deleted photo (no foreign key on the photo).
-- Server only (service role). Needs 202611200001 and 202611200002.
-- ROLLBACK (by hand): drop function mw_moderate_photo, mw_rundown_change; drop table mw_moderation_log;
--   drop trigger mw_sessions_version on mw_sessions; drop function mw_sessions_version.
begin;

/* 1. The row's version. */
create or replace function public.mw_sessions_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- clock_timestamp: two changes in one transaction still get different versions.
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
drop trigger if exists mw_sessions_version on public.mw_sessions;
create trigger mw_sessions_version before update on public.mw_sessions for each row execute function public.mw_sessions_version();

/*
 * 2. One change of Rundown live. p_items: [{"id", "version", "startsAt"?, "endsAt"?, "place"?, "status"?}]
 * ("endsAt": null = a moment without an end). Rows are locked in id order (no deadlock between two
 * panitia), every version must still be the row's, drafts are not touched, and a row without any
 * real change is left alone. Errors: RUNDOWN_INVALID, RUNDOWN_GONE, RUNDOWN_CHANGED (detail: the
 * session's id). Returns the changed sessions with their log entry and new version.
 */
create or replace function public.mw_rundown_change(p_by uuid, p_items jsonb, p_notified boolean)
returns table (out_session uuid, out_log uuid, out_version timestamptz)
language plpgsql set search_path = '' as $$
declare
  item jsonb;
  s public.mw_sessions%rowtype;
  new_start timestamptz; new_end timestamptz; new_place text; new_status text;
  changes jsonb;
begin
  if p_by is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 41 then
    raise exception 'RUNDOWN_INVALID';
  end if;
  perform 1 from public.mw_sessions
    where id in (select (value ->> 'id')::uuid from jsonb_array_elements(p_items))
    order by id for update;
  for item in select value from jsonb_array_elements(p_items) loop
    select * into s from public.mw_sessions where id = (item ->> 'id')::uuid;
    if not found then raise exception 'RUNDOWN_GONE'; end if;
    if s.status = 'draf' then raise exception 'RUNDOWN_INVALID'; end if;
    if item ->> 'version' is null or s.updated_at <> (item ->> 'version')::timestamptz then
      raise exception 'RUNDOWN_CHANGED' using detail = s.id::text;
    end if;
    new_start := coalesce((item ->> 'startsAt')::timestamptz, s.starts_at);
    new_end := case when item ? 'endsAt' then (item ->> 'endsAt')::timestamptz else s.ends_at end;
    new_place := coalesce(item ->> 'place', s.place);
    new_status := coalesce(item ->> 'status', s.status);
    if new_status not in ('terbit', 'batal') then raise exception 'RUNDOWN_INVALID'; end if;
    changes := '[]'::jsonb;
    if new_start is distinct from s.starts_at then changes := changes || jsonb_build_array(jsonb_build_object('field', 'startsAt', 'from', s.starts_at, 'to', new_start)); end if;
    if new_end is distinct from s.ends_at then changes := changes || jsonb_build_array(jsonb_build_object('field', 'endsAt', 'from', s.ends_at, 'to', new_end)); end if;
    if new_place is distinct from s.place then changes := changes || jsonb_build_array(jsonb_build_object('field', 'place', 'from', s.place, 'to', new_place)); end if;
    if new_status is distinct from s.status then changes := changes || jsonb_build_array(jsonb_build_object('field', 'status', 'from', s.status, 'to', new_status)); end if;
    continue when jsonb_array_length(changes) = 0;
    update public.mw_sessions
      set starts_at = new_start, ends_at = new_end, place = new_place, status = new_status, changed_at = now(), changed_by = p_by
      where id = s.id
      returning updated_at into out_version;
    insert into public.mw_rundown_log (session_id, changes, notified, changed_by)
      values (s.id, changes, coalesce(p_notified, false), p_by)
      returning id into out_log;
    out_session := s.id;
    return next;
  end loop;
end;
$$;

/* 3. Moderasi Momen: who decided what about a photo, and when. */
create table public.mw_moderation_log (
  id uuid primary key default gen_random_uuid(),
  -- No foreign key: the entry stays after the photo is deleted (Hapus).
  photo_id uuid not null,
  owner_id uuid references public.employees (id) on delete set null,
  action text not null check (action in ('sembunyikan', 'tampilkan', 'hapus')),
  -- The status the photo had before (tampil, ditinjau, disembunyikan).
  from_status text not null check (from_status in ('tampil', 'ditinjau', 'disembunyikan')),
  reason text not null default '' check (char_length(reason) <= 300),
  -- How many reports it had at the decision.
  reports integer not null default 0 check (reports >= 0),
  acted_by uuid references public.employees (id) on delete set null,
  acted_at timestamptz not null default now()
);
create index mw_moderation_log_photo on public.mw_moderation_log (photo_id, acted_at desc);

/*
 * One decision. p_from is the status the panitia saw: when the photo is no longer in it, another
 * panitia decided first (PHOTO_HANDLED). Sembunyikan from tampil or ditinjau; Tampilkan lagi from
 * any status (it also marks the reports as handled); Hapus only once hidden. Returns the owner and
 * the row as it was (its storage keys, to delete the files after a Hapus, whichever key columns the
 * table has). Errors: PHOTO_GONE, PHOTO_HANDLED, PHOTO_INVALID.
 */
create or replace function public.mw_moderate_photo(p_photo uuid, p_action text, p_from text, p_by uuid, p_reason text default '')
returns table (out_owner uuid, out_row jsonb)
language plpgsql set search_path = '' as $$
declare
  p public.mw_photos%rowtype;
  report_count integer;
begin
  if p_by is null or p_action not in ('sembunyikan', 'tampilkan', 'hapus') then raise exception 'PHOTO_INVALID'; end if;
  select * into p from public.mw_photos where id = p_photo for update;
  if not found then raise exception 'PHOTO_GONE'; end if;
  if p.status is distinct from p_from then raise exception 'PHOTO_HANDLED'; end if;
  if (p_action = 'sembunyikan' and p.status = 'disembunyikan') or (p_action = 'hapus' and p.status <> 'disembunyikan') then
    raise exception 'PHOTO_INVALID';
  end if;
  select count(*) into report_count from public.mw_photo_reports where photo_id = p.id;
  insert into public.mw_moderation_log (photo_id, owner_id, action, from_status, reason, reports, acted_by)
    values (p.id, p.owner_id, p_action, p.status, left(coalesce(p_reason, ''), 300), report_count, p_by);
  if p_action = 'sembunyikan' then
    update public.mw_photos set status = 'disembunyikan', hidden_by = p_by, hidden_at = now(), hidden_reason = left(coalesce(p_reason, ''), 300) where id = p.id;
  elsif p_action = 'tampilkan' then
    update public.mw_photos set status = 'tampil', hidden_by = null, hidden_at = null, hidden_reason = '' where id = p.id;
  else
    delete from public.mw_photos where id = p.id;
  end if;
  out_owner := p.owner_id; out_row := to_jsonb(p);
  return next;
end;
$$;

alter table public.mw_moderation_log enable row level security;
revoke all on public.mw_moderation_log from public, anon, authenticated;
grant select, insert, update, delete on public.mw_moderation_log to service_role;
revoke all on function public.mw_sessions_version() from public, anon, authenticated;
revoke all on function public.mw_rundown_change(uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.mw_moderate_photo(uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.mw_rundown_change(uuid, jsonb, boolean) to service_role;
grant execute on function public.mw_moderate_photo(uuid, text, text, uuid, text) to service_role;

commit;
