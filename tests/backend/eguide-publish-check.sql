-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
select set_config('request.jwt.claim.role','service_role',true);

do $$
declare
  doc jsonb := jsonb_build_object('status','draft','title','Mengenal Lombok','starts_at','2026-11-07T11:30:00+07:00','timezone','Asia/Jakarta',
    'agenda','[]'::jsonb,'feedback_questions','[]'::jsonb,'organizer','','introduction','','venue_name','','address','','location_url','');
begin
  perform public.save_event('66666666-6666-4666-8666-000000000001'::uuid, doc || jsonb_build_object('slug','eguide-terbit','event_kind','eguide'), true);
  perform public.save_event('66666666-6666-4666-8666-000000000001'::uuid, doc || jsonb_build_object('slug','eguide-terbit','event_kind','eguide','status','published'), false);
  if (select status from public.events where slug = 'eguide-terbit') <> 'published' then raise exception 'e-guide not published'; end if;

  perform public.save_event('66666666-6666-4666-8666-000000000002'::uuid, doc || jsonb_build_object('slug','acara-terbit-2','event_kind','acara'), true);
  begin
    perform public.save_event('66666666-6666-4666-8666-000000000002'::uuid, doc || jsonb_build_object('slug','acara-terbit-2','event_kind','acara','status','published'), false);
    raise exception 'UNEXPECTED: event published without organiser and place';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_EVENT' then raise; end if;
  end;
  begin
    perform public.save_event('66666666-6666-4666-8666-000000000001'::uuid, doc || jsonb_build_object('slug','eguide-terbit','event_kind','eguide','status','published','timezone','UTC'), false);
    raise exception 'UNEXPECTED: e-guide saved with a foreign zone';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_EVENT' then raise; end if;
  end;
  -- A card still publishes as before.
  perform public.save_event('66666666-6666-4666-8666-000000000003'::uuid, doc || jsonb_build_object('slug','kartu-terbit-2','event_kind','kartu'), true);
  perform public.save_event('66666666-6666-4666-8666-000000000003'::uuid, doc || jsonb_build_object('slug','kartu-terbit-2','event_kind','kartu','status','published'), false);
  if (select status from public.events where slug = 'kartu-terbit-2') <> 'published' then raise exception 'card not published'; end if;
  -- The super admin may show the E-Guide template to regular admins.
  update public.admin_settings set enabled_templates = array['kunjungan-klien','poster-sesi','e-guide'];
  raise notice 'PASS: an e-guide (and a card) publishes without invitation details; events still need them; other checks stay';
end $$;

rollback;
