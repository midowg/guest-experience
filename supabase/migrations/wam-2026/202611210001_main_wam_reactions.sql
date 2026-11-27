-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Main WAM, Momen: reactions instead of hearts (docs/main-wam/KONTRAK.md §6). Runs once on a database that
-- already has 202611200201, and just as well in the full order on an empty one.
--   1. mw_photo_reactions: one emoji per person per photo (a second one replaces the first). The emoji
--      must come from the app's list (src/lib/main-wam/momen/reactions.ts); here it is only a short text
--      (1-16 characters), the server checks the list.
--   2. The hearts already given move over as the red heart (not on one's own photo); mw_photo_hearts stays
--      as it is, no longer read or written (drop it later by hand if wanted).
--   3. mw_photo_reactions(photo, viewer): the reactions of one photo as [{emoji, count, mine}], most
--      first. mw_photo_react(photo, viewer, group, emoji): sets, replaces or (emoji null) removes the
--      viewer's reaction; only on a photo the viewer sees and that is not their own.
--   4. mw_photo_feed: same two runs and keyset paging as before, but `reactions jsonb` replaces
--      `hearts, hearted`. (drop + create: the result's columns change.)
-- Server only (service role). Needs 202611200201.
-- ROLLBACK (by hand): drop function mw_photo_react(uuid, uuid, uuid, text), mw_photo_reactions(uuid, uuid), the new mw_photo_feed;
--   create the old mw_photo_feed from 202611200201; drop table mw_photo_reactions.
begin;

create table if not exists public.mw_photo_reactions (
  photo_id uuid not null references public.mw_photos (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (photo_id, employee_id)
);
-- Every foreign key has an index led by it (audit L1): the photo is the primary key's first column.
create index if not exists mw_photo_reactions_person on public.mw_photo_reactions (employee_id);

alter table public.mw_photo_reactions enable row level security;
revoke all on public.mw_photo_reactions from public, anon, authenticated;
grant select, insert, update, delete on public.mw_photo_reactions to service_role;

-- The hearts given so far become the red heart (U+2764 U+FE0F), except on the person's own photo.
insert into public.mw_photo_reactions (photo_id, employee_id, emoji, created_at)
  select h.photo_id, h.employee_id, chr(10084) || chr(65039), h.created_at
  from public.mw_photo_hearts h join public.mw_photos p on p.id = h.photo_id
  where p.owner_id <> h.employee_id
  on conflict (photo_id, employee_id) do nothing;

/* One photo's reactions for one viewer: [{"emoji", "count", "mine"}], the most given first (ties by emoji). */
create or replace function public.mw_photo_reactions(p_photo uuid, p_viewer uuid)
returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('emoji', r.emoji, 'count', r.n, 'mine', r.mine) order by r.n desc, r.emoji), '[]'::jsonb)
  from (
    select x.emoji, count(*)::integer as n, bool_or(x.employee_id = p_viewer) as mine
    from public.mw_photo_reactions x where x.photo_id = p_photo group by x.emoji
  ) r
$$;

/*
 * Reacts to a photo (p_emoji) or takes the reaction back (null); answers the photo's reactions now.
 * One reaction per person: a new emoji replaces the old one. Only on a photo the viewer sees (their
 * kelompok is given by the server) and never their own; a photo that is hidden or still in its 5
 * seconds is "not found". Taking back works on any photo that exists.
 */
create or replace function public.mw_photo_react(p_photo uuid, p_viewer uuid, p_group uuid, p_emoji text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select p.owner_id into v_owner from public.mw_photos p where p.id = p_photo;
  if not found then raise exception 'MW_PHOTO_NOT_FOUND'; end if;
  if p_emoji is null then
    delete from public.mw_photo_reactions where photo_id = p_photo and employee_id = p_viewer;
  else
    if v_owner = p_viewer then raise exception 'MW_PHOTO_OWN'; end if;
    if not exists (select 1 from public.mw_photos_for(p_viewer, p_group, 'semua') s where s.id = p_photo) then raise exception 'MW_PHOTO_NOT_FOUND'; end if;
    insert into public.mw_photo_reactions as r (photo_id, employee_id, emoji) values (p_photo, p_viewer, p_emoji)
      on conflict (photo_id, employee_id) do update set emoji = excluded.emoji, created_at = now();
  end if;
  return public.mw_photo_reactions(p_photo, p_viewer);
end;
$$;

/*
 * The feed as in 202611200201 (the stack in two runs, the gallery, keyset paging, 'older', 'older_incl',
 * 'newer'), with `reactions` (the photo's [{emoji, count, mine}]) in the place of `hearts, hearted`.
 */
drop function if exists public.mw_photo_feed(uuid, uuid, text, uuid, boolean, boolean, timestamptz, uuid, boolean, text, integer);
create function public.mw_photo_feed(
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
        select p.*, (p.owner_id = p_viewer or exists (select 1 from public.mw_photo_seen s where s.employee_id = p_viewer and s.photo_id = p.id)) as is_seen
        from public.mw_photos_for(p_viewer, p_group, p_view) p
        where p_session is null and not coalesce(p_umum, false) or coalesce(p_umum, false) and p.session_id is null or p.session_id = p_session
      ), after as (
        select b.* from base b
        where p_cursor_at is null
          or b.is_seen > coalesce(p_cursor_rest, false)
          or b.is_seen = coalesce(p_cursor_rest, false) and (b.visible_at, b.id) < (p_cursor_at, p_cursor_id)
      )
      select a.id, a.owner_id, a.audience, a.group_id, a.session_id, a.width, a.height, a.taken_at, a.visible_at, a.status, a.file_key, a.thumb_key,
        public.mw_photo_reactions(a.id, p_viewer),
        a.is_seen,
        (select count(*) from after x where x.is_seen = coalesce(p_cursor_rest, false))
      from after a
      order by a.is_seen, a.visible_at desc, a.id desc
      limit v_limit;
  elsif p_direction = 'newer' then
    return query
      select p.id, p.owner_id, p.audience, p.group_id, p.session_id, p.width, p.height, p.taken_at, p.visible_at, p.status, p.file_key, p.thumb_key,
        public.mw_photo_reactions(p.id, p_viewer),
        (p.owner_id = p_viewer or exists (select 1 from public.mw_photo_seen s where s.employee_id = p_viewer and s.photo_id = p.id)),
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
        (p.owner_id = p_viewer or exists (select 1 from public.mw_photo_seen s where s.employee_id = p_viewer and s.photo_id = p.id)),
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

revoke all on function public.mw_photo_reactions(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mw_photo_react(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.mw_photo_feed(uuid, uuid, text, uuid, boolean, boolean, timestamptz, uuid, boolean, text, integer) from public, anon, authenticated;
grant execute on function public.mw_photo_reactions(uuid, uuid) to service_role;
grant execute on function public.mw_photo_react(uuid, uuid, uuid, text) to service_role;
grant execute on function public.mw_photo_feed(uuid, uuid, text, uuid, boolean, boolean, timestamptz, uuid, boolean, text, integer) to service_role;

commit;
