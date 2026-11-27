-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Main WAM, Momen: the stack holds only photos the person has not seen yet (docs/main-wam/KONTRAK.md §6, keputusan 30).
-- Runs once on a database that already has 202611230001 (or any earlier Main WAM migration back to 202611210001),
-- and just as well in the full order on an empty one. Safe to run again.
--   mw_photo_feed (same arguments and columns as in 202611210001): in the stack ("p_unseen") only the photos with no
--     mw_photo_seen row for the viewer. The second run (seen and own photos) is gone. The viewer's own unseen photo
--     comes first (a photo just sent shows once, at the front), then the others newest first; `p_cursor_rest` now
--     means "the cursor is still inside the own run". `seen` = a mw_photo_seen row exists, own photos included (it
--     was "or the owner" before), in every direction; `total` counts the stack's photos after the cursor.
--   mw_photo_unseen_count(viewer, group): "N foto baru" on Beranda = unseen photos of others (never one's own).
--   Backfill: photos sent before this migration count as seen by their owners (so old own photos do not return).
-- Order against the deploy: either order works. SQL first: the previous app shows only the unseen photos (its own
-- photo is not marked seen, so it stays first until the new app marks it). Deploy first: the new app drops seen
-- photos by itself (the previous SQL still returns them in a second run), until this file runs.
-- Server only (service role): closed to anon and authenticated.
-- ROLLBACK (by hand): create or replace mw_photo_feed from 202611210001; drop function public.mw_photo_unseen_count(uuid, uuid).
begin;

create or replace function public.mw_photo_feed(
  p_viewer uuid, p_group uuid, p_view text, p_session uuid, p_umum boolean, p_unseen boolean,
  p_cursor_at timestamptz, p_cursor_id uuid, p_cursor_rest boolean, p_direction text, p_limit integer
)
returns table (
  id uuid, owner_id uuid, audience text, group_id uuid, session_id uuid, width integer, height integer,
  taken_at timestamptz, visible_at timestamptz, status text, file_key text, thumb_key text,
  reactions jsonb, seen boolean, total bigint
)
language plpgsql stable
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 60);
begin
  if p_view not in ('semua', 'kelompok', 'saya') then raise exception 'MW_FEED_VIEW'; end if;
  if p_direction not in ('older', 'older_incl', 'newer') then raise exception 'MW_FEED_DIRECTION'; end if;
  if coalesce(p_unseen, false) and p_direction <> 'older' then raise exception 'MW_FEED_DIRECTION'; end if;
  if coalesce(p_unseen, false) then
    return query
      with base as (
        select p.*, (p.owner_id = p_viewer) as is_own
        from public.mw_photos_for(p_viewer, p_group, p_view) p
        where (p_session is null and not coalesce(p_umum, false) or coalesce(p_umum, false) and p.session_id is null or p.session_id = p_session)
          and not exists (select 1 from public.mw_photo_seen s where s.employee_id = p_viewer and s.photo_id = p.id)
      ), after as (
        select b.* from base b
        where p_cursor_at is null
          or b.is_own < coalesce(p_cursor_rest, false)
          or b.is_own = coalesce(p_cursor_rest, false) and (b.visible_at, b.id) < (p_cursor_at, p_cursor_id)
      )
      select a.id, a.owner_id, a.audience, a.group_id, a.session_id, a.width, a.height, a.taken_at, a.visible_at, a.status, a.file_key, a.thumb_key,
        public.mw_photo_reactions(a.id, p_viewer),
        false,
        (select count(*) from after)
      from after a
      order by a.is_own desc, a.visible_at desc, a.id desc
      limit v_limit;
  elsif p_direction = 'newer' then
    return query
      select p.id, p.owner_id, p.audience, p.group_id, p.session_id, p.width, p.height, p.taken_at, p.visible_at, p.status, p.file_key, p.thumb_key,
        public.mw_photo_reactions(p.id, p_viewer),
        exists (select 1 from public.mw_photo_seen s where s.employee_id = p_viewer and s.photo_id = p.id),
        count(*) over ()
      from public.mw_photos_for(p_viewer, p_group, p_view) p
      where (p_session is null and not coalesce(p_umum, false) or coalesce(p_umum, false) and p.session_id is null or p.session_id = p_session)
        and p_cursor_at is not null and (p.visible_at, p.id) > (p_cursor_at, p_cursor_id)
      order by p.visible_at, p.id
      limit v_limit;
  else
    return query
      select p.id, p.owner_id, p.audience, p.group_id, p.session_id, p.width, p.height, p.taken_at, p.visible_at, p.status, p.file_key, p.thumb_key,
        public.mw_photo_reactions(p.id, p_viewer),
        exists (select 1 from public.mw_photo_seen s where s.employee_id = p_viewer and s.photo_id = p.id),
        count(*) over ()
      from public.mw_photos_for(p_viewer, p_group, p_view) p
      where (p_session is null and not coalesce(p_umum, false) or coalesce(p_umum, false) and p.session_id is null or p.session_id = p_session)
        and (p_cursor_at is null
          or p_direction = 'older' and (p.visible_at, p.id) < (p_cursor_at, p_cursor_id)
          or p_direction = 'older_incl' and (p.visible_at, p.id) <= (p_cursor_at, p_cursor_id))
      order by p.visible_at desc, p.id desc
      limit v_limit;
  end if;
end;
$$;

/* "N foto baru" on Beranda: the photos of others the person has not seen (never their own). */
create or replace function public.mw_photo_unseen_count(p_viewer uuid, p_group uuid)
returns bigint
language sql stable
set search_path = public
as $$
  select count(*)
  from public.mw_photos_for(p_viewer, p_group, 'semua') p
  where p.owner_id <> p_viewer
    and not exists (select 1 from public.mw_photo_seen s where s.employee_id = p_viewer and s.photo_id = p.id)
$$;

/* Photos sent before this migration count as seen by their owners (they were never "new" to them). */
insert into public.mw_photo_seen (photo_id, employee_id)
  select p.id, p.owner_id from public.mw_photos p
  on conflict (employee_id, photo_id) do nothing;

revoke all on function public.mw_photo_feed(uuid, uuid, text, uuid, boolean, boolean, timestamptz, uuid, boolean, text, integer) from public, anon, authenticated;
revoke all on function public.mw_photo_unseen_count(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mw_photo_feed(uuid, uuid, text, uuid, boolean, boolean, timestamptz, uuid, boolean, text, integer) to service_role;
grant execute on function public.mw_photo_unseen_count(uuid, uuid) to service_role;

commit;
