-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
select set_config('request.jwt.claim.role','service_role',true);

do $$
declare
  ev constant uuid := '88888888-8888-4888-8888-888888888888';
  doc jsonb := jsonb_build_object('status','draft','title','Galeri','slug','galeri-cek','timezone','Asia/Jakarta',
    'starts_at','2026-11-02T09:00:00+07:00','agenda','[]'::jsonb,'feedback_questions','[]'::jsonb);
  photo uuid;
begin
  perform public.save_event(ev, doc, true);
  insert into public.gallery_photos (event_id, original_key, original_kind, original_bytes, large_key, large_bytes, thumb_key, thumb_bytes, width, height)
  values (ev, 'events/x/original.jpg', 'jpeg', 5000000, 'events/x/large.webp', 900000, 'events/x/thumb.webp', 60000, 4000, 3000) returning id into photo;
  if (select status from public.gallery_photos where id = photo) <> 'uploading' then raise exception 'new photo should start uploading'; end if;
  update public.gallery_photos set status = 'ready' where id = photo;

  begin insert into public.gallery_photos (event_id, original_key, original_kind, original_bytes, large_key, large_bytes, thumb_key, thumb_bytes)
    values (ev, 'k', 'gif', 10, 'l', 10, 't', 10); raise exception 'UNEXPECTED: gif accepted';
  exception when check_violation then null; end;
  begin insert into public.gallery_photos (event_id, original_key, original_kind, original_bytes, large_key, large_bytes, thumb_key, thumb_bytes)
    values (ev, 'k', 'jpeg', 30000000, 'l', 10, 't', 10); raise exception 'UNEXPECTED: 30 MB original accepted';
  exception when check_violation then null; end;
  begin update public.gallery_photos set status = 'deleted' where id = photo; raise exception 'UNEXPECTED: unknown status';
  exception when check_violation then null; end;

  delete from public.events where id = ev;
  if exists (select 1 from public.gallery_photos where id = photo) then raise exception 'photos should go with the event'; end if;
  raise notice 'PASS: gallery photo kinds, size limits, statuses, cascade';
end $$;

set local role anon;
do $$ begin
  begin perform 1 from public.gallery_photos; raise exception 'UNEXPECTED: anon read gallery';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: gallery table is server only';
end $$;
reset role;

rollback;
