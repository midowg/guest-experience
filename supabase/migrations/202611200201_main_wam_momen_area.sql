-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Main WAM, area B (Momen + Mozaik), on top of fondasi 202611200002 (docs/main-wam/KONTRAK.md §6):
--   1. mw_photos.tile_key: the 160 px square made in the browser for the Mozaik (and the TV), so no
--      screen ever loads a large photo for a tile.
--   2. mw_photos_for: what one person may see (status, the 5 seconds of Batalkan, kelompok photos only
--      for their kelompok, photos they reported hidden for them). Every reader below goes through it.
--   3. mw_photo_feed: the stack and the gallery, keyset paging on (visible_at, id), never OFFSET,
--      with hearts, "mine", "seen" and the total in one query (no N+1).
--   4. mw_photo_session_counts: the "Saring sesi" sheet (photos per session, Umum).
--   5. mw_photo_report: Laporkan foto, one report per person; the third reporter hides the photo for
--      everyone (status ditinjau) until panitia decide (K08, area C).
--   6. mw_mosaic_place: fills empty mosaic cells, in a fixed seeded order, with photos for everyone
--      at least 5 minutes old; stable (a placed photo never moves), atomic under concurrent polls.
-- Server only (service role): functions are not callable with the public keys.
-- ROLLBACK (by hand): drop function mw_mosaic_place(integer[], integer), mw_photo_report(uuid, uuid, text, text, integer),
--   mw_photo_session_counts(uuid, uuid, text), mw_photo_feed(uuid, uuid, text, uuid, boolean, boolean, timestamptz, uuid, text, integer),
--   mw_photos_for(uuid, uuid, text); drop index mw_photos_owner_feed, mw_photo_reports_reporter; alter table mw_photos drop column tile_key.
begin;

alter table public.mw_photos add column tile_key text unique
  check (tile_key is null or tile_key ~ '^main-wam/momen/[0-9a-f-]{36}-ubin\.jpg$');

-- Fotoku and "my photos in the mosaic": keyset on the owner's photos.
create index mw_photos_owner_feed on public.mw_photos (owner_id, visible_at desc, id desc);
-- Rate of reports per person, and "reported by me".
create index mw_photo_reports_reporter on public.mw_photo_reports (reporter_id, created_at desc);

/*
 * The photos one person may see in a view: semua (for everyone), kelompok (their kelompok's: sent
 * to it, or sent for everyone by one of its members), saya (their own, any status). Others' photos
 * show from visible_at on (after Batalkan's 5 seconds); a photo the person reported is hidden for
 * them until "Tampilkan lagi". p_group is the viewer's own kelompok, decided by the server.
 * One SELECT, STABLE, plain SQL and no SET clause (every name is qualified): the planner inlines it
 * into each caller's query, so the callers' conditions use the indexes.
 */
create function public.mw_photos_for(p_viewer uuid, p_group uuid, p_view text)
returns setof public.mw_photos
language sql stable
as $$
  select p.* from public.mw_photos p
  where case p_view
      when 'saya' then p.owner_id = p_viewer
      when 'kelompok' then p.status = 'tampil' and p_group is not null and (
        (p.audience = 'kelompok' and p.group_id = p_group)
        or (p.audience = 'semua' and exists (select 1 from public.mw_group_members m where m.group_id = p_group and m.employee_id = p.owner_id)))
      else p.status = 'tampil' and p.audience = 'semua'
    end
    and (p.owner_id = p_viewer or p.visible_at <= now())
    and (p.owner_id = p_viewer or not exists (
      select 1 from public.mw_photo_reports r where r.photo_id = p.id and r.reporter_id = p_viewer and r.unhidden_at is null))
$$;

/*
 * One page of a view, newest first. p_session: one session; p_umum: only photos without a session
 * (both empty: every session). p_unseen: the stack's "baru" (not the person's own, not seen yet).
 * Cursor (p_cursor_at, p_cursor_id) with p_direction: 'older' (after it in the list), 'older_incl'
 * (from it: a stack opened at one photo of the gallery), 'newer' (before it, nearest first: going
 * back from that photo). total = how many match on that side of the cursor (all of them without one).
 */
create function public.mw_photo_feed(
  p_viewer uuid, p_group uuid, p_view text, p_session uuid, p_umum boolean, p_unseen boolean,
  p_cursor_at timestamptz, p_cursor_id uuid, p_direction text, p_limit integer
)
returns table (
  id uuid, owner_id uuid, audience text, group_id uuid, session_id uuid, width integer, height integer,
  taken_at timestamptz, visible_at timestamptz, status text, file_key text, thumb_key text,
  hearts integer, hearted boolean, seen boolean, total bigint
)
language plpgsql stable
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 60);
begin
  if p_view not in ('semua', 'kelompok', 'saya') then raise exception 'MW_FEED_VIEW'; end if;
  if p_direction not in ('older', 'older_incl', 'newer') then raise exception 'MW_FEED_DIRECTION'; end if;
  if p_direction = 'newer' then
    return query
      select p.id, p.owner_id, p.audience, p.group_id, p.session_id, p.width, p.height, p.taken_at, p.visible_at, p.status, p.file_key, p.thumb_key,
        (select count(*)::integer from public.mw_photo_hearts h where h.photo_id = p.id),
        exists (select 1 from public.mw_photo_hearts h where h.photo_id = p.id and h.employee_id = p_viewer),
        (p.owner_id = p_viewer or exists (select 1 from public.mw_photo_seen s where s.employee_id = p_viewer and s.photo_id = p.id)),
        count(*) over ()
      from public.mw_photos_for(p_viewer, p_group, p_view) p
      where (p_session is null and not coalesce(p_umum, false) or coalesce(p_umum, false) and p.session_id is null or p.session_id = p_session)
        and (not coalesce(p_unseen, false) or p.owner_id <> p_viewer and not exists (select 1 from public.mw_photo_seen s where s.employee_id = p_viewer and s.photo_id = p.id))
        and p_cursor_at is not null and (p.visible_at, p.id) > (p_cursor_at, p_cursor_id)
      order by p.visible_at, p.id
      limit v_limit;
  else
    return query
      select p.id, p.owner_id, p.audience, p.group_id, p.session_id, p.width, p.height, p.taken_at, p.visible_at, p.status, p.file_key, p.thumb_key,
        (select count(*)::integer from public.mw_photo_hearts h where h.photo_id = p.id),
        exists (select 1 from public.mw_photo_hearts h where h.photo_id = p.id and h.employee_id = p_viewer),
        (p.owner_id = p_viewer or exists (select 1 from public.mw_photo_seen s where s.employee_id = p_viewer and s.photo_id = p.id)),
        count(*) over ()
      from public.mw_photos_for(p_viewer, p_group, p_view) p
      where (p_session is null and not coalesce(p_umum, false) or coalesce(p_umum, false) and p.session_id is null or p.session_id = p_session)
        and (not coalesce(p_unseen, false) or p.owner_id <> p_viewer and not exists (select 1 from public.mw_photo_seen s where s.employee_id = p_viewer and s.photo_id = p.id))
        and (p_cursor_at is null
          or p_direction = 'older' and (p.visible_at, p.id) < (p_cursor_at, p_cursor_id)
          or p_direction = 'older_incl' and (p.visible_at, p.id) <= (p_cursor_at, p_cursor_id))
      order by p.visible_at desc, p.id desc
      limit v_limit;
  end if;
end;
$$;

/* "Saring sesi": how many photos of a view each session has (null = Umum). */
create function public.mw_photo_session_counts(p_viewer uuid, p_group uuid, p_view text)
returns table (session_id uuid, photos bigint)
language sql stable
set search_path = public
as $$
  select p.session_id, count(*) from public.mw_photos_for(p_viewer, p_group, p_view) p group by p.session_id
$$;

/*
 * Laporkan foto (M04): one report per person (a second one replaces the reason and shows it hidden
 * for them again). When the reports reach p_threshold different people, a photo still shown goes
 * to panitia (status ditinjau) and disappears for everyone; once panitia have shown it again, later
 * reports do not hide it again (the reports stay in their list). A second report by the same person
 * replaces the first and takes the new time (so panitia see it again), without counting twice. Not
 * for one's own photo.
 */
create function public.mw_photo_report(p_photo uuid, p_reporter uuid, p_reason text, p_note text, p_threshold integer default 3)
returns table (reporters integer, hidden boolean, owner_id uuid)
language plpgsql
set search_path = public
as $$
declare
  v_owner uuid;
  v_status text;
  v_count integer;
  v_hidden boolean := false;
begin
  select p.owner_id, p.status into v_owner, v_status from public.mw_photos p where p.id = p_photo for update;
  if not found then raise exception 'MW_PHOTO_NOT_FOUND'; end if;
  if v_owner = p_reporter then raise exception 'MW_PHOTO_OWN'; end if;
  insert into public.mw_photo_reports as r (photo_id, reporter_id, reason, note)
    values (p_photo, p_reporter, p_reason, coalesce(p_note, ''))
    -- Reported again: the new reason, and the new time (panitia's queue, K08, shows reports newer than its last decision).
    on conflict (photo_id, reporter_id) do update set reason = excluded.reason, note = excluded.note, unhidden_at = null, created_at = now();
  select count(*)::integer into v_count from public.mw_photo_reports r where r.photo_id = p_photo;
  if v_count = greatest(p_threshold, 1) and v_status = 'tampil' then
    update public.mw_photos set status = 'ditinjau', hidden_at = now(), hidden_by = null where id = p_photo;
    v_hidden := true;
  end if;
  return query select v_count, v_hidden, v_owner;
end;
$$;

/*
 * Mozaik: fills the empty cells, in the order given (a fixed seeded shuffle of the grid made by the
 * app), with photos for everyone that are shown, have a tile, are at least p_min_age_seconds old and
 * are not placed yet, oldest first. A placed photo keeps its cell; a cell is freed only when its
 * photo is deleted or hidden for good by panitia. Serialised: two polls at once never place twice.
 */
create function public.mw_mosaic_place(p_order integer[], p_min_age_seconds integer default 300)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_cells integer[];
  v_photos uuid[];
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('mw_mosaic_place'));
  delete from public.mw_mosaic_tiles t using public.mw_photos p where p.id = t.photo_id and p.status = 'disembunyikan';
  select coalesce(array_agg(u.cell order by u.ord), '{}') into v_cells
    from unnest(p_order) with ordinality as u(cell, ord)
    where u.cell between 0 and 6399 and not exists (select 1 from public.mw_mosaic_tiles t where t.tile = u.cell);
  if cardinality(v_cells) = 0 then return 0; end if;
  select coalesce(array_agg(s.id order by s.visible_at, s.id), '{}') into v_photos from (
    select p.id, p.visible_at from public.mw_photos p
    where p.status = 'tampil' and p.audience = 'semua' and p.tile_key is not null
      and p.visible_at <= now() - make_interval(secs => greatest(p_min_age_seconds, 0))
      and not exists (select 1 from public.mw_mosaic_tiles t where t.photo_id = p.id)
    order by p.visible_at, p.id
    limit cardinality(v_cells)
  ) s;
  v_count := least(cardinality(v_cells), cardinality(v_photos));
  if v_count = 0 then return 0; end if;
  insert into public.mw_mosaic_tiles (tile, photo_id) select v_cells[i], v_photos[i] from generate_series(1, v_count) as i;
  return v_count;
end;
$$;

revoke all on function public.mw_photos_for(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.mw_photo_feed(uuid, uuid, text, uuid, boolean, boolean, timestamptz, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.mw_photo_session_counts(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.mw_photo_report(uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.mw_mosaic_place(integer[], integer) from public, anon, authenticated;
grant execute on function public.mw_photos_for(uuid, uuid, text) to service_role;
grant execute on function public.mw_photo_feed(uuid, uuid, text, uuid, boolean, boolean, timestamptz, uuid, text, integer) to service_role;
grant execute on function public.mw_photo_session_counts(uuid, uuid, text) to service_role;
grant execute on function public.mw_photo_report(uuid, uuid, text, text, integer) to service_role;
grant execute on function public.mw_mosaic_place(integer[], integer) to service_role;

commit;
