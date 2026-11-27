-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Main WAM, Momen: who reacted with what (docs/main-wam/KONTRAK.md §6, keputusan 27). Runs once on a database
-- that already has 202611210001 (also up to 202611220001), and just as well in the full order on an empty one.
--   mw_photo_reactors(photo, viewer): the reactions of one photo as rows (employee_id, emoji, created_at), the
--   newest first, only when the viewer may see that photo (their own, or one shown to everyone and past its 5
--   seconds, not hidden, not reported by the viewer); otherwise no rows (the server answers 404 itself).
-- Server only (service role): closed to anon and authenticated. Safe to run again.
-- ROLLBACK (by hand): drop function public.mw_photo_reactors(uuid, uuid);
begin;

create or replace function public.mw_photo_reactors(p_photo uuid, p_viewer uuid)
returns table (employee_id uuid, emoji text, created_at timestamptz)
language sql stable
set search_path = public
as $$
  select x.employee_id, x.emoji, x.created_at
  from public.mw_photo_reactions x
  where x.photo_id = p_photo
    and (exists (select 1 from public.mw_photos_for(p_viewer, null, 'semua') s where s.id = p_photo)
      or exists (select 1 from public.mw_photos_for(p_viewer, null, 'saya') s where s.id = p_photo))
  order by x.created_at desc, x.employee_id
$$;

revoke all on function public.mw_photo_reactors(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mw_photo_reactors(uuid, uuid) to service_role;

commit;
