-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
select set_config('request.jwt.claim.role','service_role',true);

do $$
declare
  open_ev constant uuid := '77777777-7777-4777-8777-000000000001';
  personal_ev constant uuid := '77777777-7777-4777-8777-000000000002';
  base jsonb := jsonb_build_object('status','published','title','RSVP','timezone','Asia/Jakarta','starts_at','2026-11-02T09:00:00+07:00',
    'agenda','[]'::jsonb,'feedback_questions','[]'::jsonb,'organizer','Werkudara','introduction','Halo','venue_name','Kantor','address','Jl. Bhinneka',
    'location_url','https://maps.app.goo.gl/x','rsvp_enabled',true,'sections',jsonb_build_array(jsonb_build_object('key','rsvp','enabled',true)));
  guest jsonb := jsonb_build_object('name','Sari Dewi','organization','Mitra','attendance','yes','phone','','email','','website','','consent',true);
  answer jsonb;
  id uuid;
  row public.rsvps;
  invite jsonb;
begin
  perform public.save_event(open_ev, base || jsonb_build_object('slug','rsvp-umum','status','draft'), true);
  perform public.save_event(open_ev, base || jsonb_build_object('slug','rsvp-umum'), false);
  perform public.save_event(personal_ev, base || jsonb_build_object('slug','rsvp-personal','status','draft','invitation_mode','personal'), true);
  perform public.save_event(personal_ev, base || jsonb_build_object('slug','rsvp-personal','invitation_mode','personal'), false);

  -- An older client payload (no new keys) still saves, with defaults.
  answer := guest || jsonb_build_object('has_allergy',false,'allergy_details','','idempotency_key','77777777-0000-4000-8000-000000000001');
  id := public.submit_rsvp('rsvp-umum', answer, repeat('1',64));
  select * into row from public.rsvps where rsvps.id = id;
  if row.party_size <> 1 or row.dietary <> '{}' or row.photo_opt_out then raise exception 'legacy defaults wrong'; end if;

  -- New needs on a generic link.
  answer := guest || jsonb_build_object('has_allergy',true,'allergy_details','Kacang','dietary',jsonb_build_array('vegetarian','allergy'),
    'access',jsonb_build_array('sign_interpreter'),'photo_opt_out',true,'whatsapp_consent',true,'idempotency_key','77777777-0000-4000-8000-000000000002');
  id := public.submit_rsvp('rsvp-umum', answer, repeat('2',64));
  select * into row from public.rsvps where rsvps.id = id;
  if row.dietary <> array['vegetarian','allergy'] or row.access <> array['sign_interpreter'] or not row.photo_opt_out or not row.whatsapp_consent then raise exception 'needs not stored: %', row; end if;

  -- Generic links cannot bring companions.
  begin
    perform public.submit_rsvp('rsvp-umum', guest || jsonb_build_object('has_allergy',false,'allergy_details','','party_size',2,'idempotency_key','77777777-0000-4000-8000-000000000003'), repeat('3',64));
    raise exception 'UNEXPECTED: party on generic link';
  exception when raise_exception then if sqlerrm <> 'INVALID_ANSWERS' then raise; end if;
  end;

  -- Allergy in the list must match has_allergy (the old constraint still guards details).
  begin
    perform public.submit_rsvp('rsvp-umum', guest || jsonb_build_object('has_allergy',false,'allergy_details','','dietary',jsonb_build_array('allergy'),'idempotency_key','77777777-0000-4000-8000-000000000004'), repeat('4',64));
    raise exception 'UNEXPECTED: allergy mismatch accepted';
  exception when check_violation then null;
  end;

  -- Personal link: party up to the invitation's maximum, companions named.
  invite := public.manage_event_invitation(personal_ev, null, 'create', 'Bu Sari', repeat('a',64), null, 3);
  answer := guest || jsonb_build_object('has_allergy',false,'allergy_details','','party_size',3,'companion_names',jsonb_build_array('Raka','Dinda'),'idempotency_key','77777777-0000-4000-8000-000000000005');
  id := public.submit_invitation_rsvp('rsvp-personal', repeat('a',64), answer, repeat('5',64));
  select * into row from public.rsvps where rsvps.id = id;
  if row.party_size <> 3 or row.companion_names <> array['Raka','Dinda'] then raise exception 'party not stored'; end if;
  begin
    perform public.submit_invitation_rsvp('rsvp-personal', repeat('a',64), answer || jsonb_build_object('party_size',4,'idempotency_key','77777777-0000-4000-8000-000000000006'), repeat('6',64));
    raise exception 'UNEXPECTED: party above maximum';
  exception when raise_exception then if sqlerrm <> 'INVALID_ANSWERS' then raise; end if;
  end;

  -- Declining clears the party and needs; a leftover need is refused by the table.
  answer := guest || jsonb_build_object('attendance','no','has_allergy',false,'allergy_details','','idempotency_key','77777777-0000-4000-8000-000000000007');
  id := public.submit_invitation_rsvp('rsvp-personal', repeat('a',64), answer, repeat('7',64));
  select * into row from public.rsvps where rsvps.id = id;
  if row.attendance <> 'no' or row.party_size <> 1 or row.companion_names <> '{}' then raise exception 'decline not reset'; end if;
  begin
    perform public.submit_invitation_rsvp('rsvp-personal', repeat('a',64), answer || jsonb_build_object('access',jsonb_build_array('wheelchair'),'idempotency_key','77777777-0000-4000-8000-000000000008'), repeat('8',64));
    raise exception 'UNEXPECTED: needs while declining';
  exception when check_violation then null;
  end;
  raise notice 'PASS: legacy payload, needs, generic party refused, allergy agreement, personal party and limit, decline';
end $$;

rollback;
