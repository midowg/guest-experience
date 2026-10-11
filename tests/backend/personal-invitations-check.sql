-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
select set_config('request.jwt.claim.role','service_role',true);
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
declare failed boolean := false;
begin
  begin
    execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'Expected %, got %', expected, sqlerrm; end if;
    failed := true;
  end;
  if not failed then raise exception 'Expected error % for %', expected, statement; end if;
end $$;

do $$
declare
  old_event constant uuid := '11111111-1111-4111-8111-111111111111';
  personal_event constant uuid := '22222222-2222-4222-8222-222222222222';
  draft_event constant uuid := '33333333-3333-4333-8333-333333333333';
  token1 text := repeat('1',64);
  token2 text := repeat('2',64);
  token3 text := repeat('3',64);
  accepted_duplicate boolean := false;
  payload jsonb;
  changed jsonb;
  invite_id uuid;
  response_id uuid;
  result_id uuid;
begin
  if (select count(*) from public.rsvps where event_id=old_event and invitation_id is null) <> 1 then raise exception 'Legacy RSVP was lost'; end if;
  if (select content ? 'invitation_mode' from public.events where id=old_event) then raise exception 'Legacy document mutated'; end if;
  if has_table_privilege('anon','public.event_invitations','SELECT') or has_table_privilege('authenticated','public.event_invitations','SELECT') then raise exception 'Invitation table readable without service role'; end if;
  if has_function_privilege('anon','public.submit_invitation_rsvp(text,text,jsonb,text)','EXECUTE') then raise exception 'Invitation write RPC exposed to anon'; end if;
  if has_table_privilege('anon','public.invitation_rsvp_requests','SELECT') then raise exception 'Idempotency log readable without service role'; end if;

  payload := jsonb_build_object('name','Legacy guest','organization','Community','attendance','yes','phone','','email','','has_allergy',false,'allergy_details','','website','','consent',true,'idempotency_key','11111111-1111-4111-8111-000000000002');
  perform public.submit_rsvp('legacy-open', payload, repeat('b',64));
  if (select count(*) from public.rsvps where event_id=old_event and invitation_id is null) <> 2 then raise exception 'Legacy open RSVP failed'; end if;

  update public.events set content=content || '{"invitation_mode":"personal"}'::jsonb where id=personal_event;
  perform pg_temp.expect_error(format('select public.submit_rsvp(%L,%L::jsonb,%L)', 'personal-event',payload::text,repeat('c',64)), 'EVENT_CLOSED');
  perform pg_temp.expect_error(format('select public.manage_event_invitation(%L::uuid,null,%L,%L,%L)',personal_event,'create','Guest','bad-token'), 'INVALID_INVITATION');
  perform public.manage_event_invitation(draft_event,null,'create','Draft Guest',token3);
  perform pg_temp.expect_error(format('select public.submit_invitation_rsvp(%L,%L,%L::jsonb,%L)', 'draft-event',token3,payload::text,repeat('e',64)), 'EVENT_CLOSED');
  changed := public.manage_event_invitation(personal_event,null,'create','Guest One',token1);
  invite_id := (changed->>'id')::uuid;
  if changed->>'name' <> 'Guest One' then raise exception 'Guest creation failed'; end if;
  -- The token column has a unique constraint; a second identical token cannot be inserted.
  begin
    perform public.manage_event_invitation(personal_event,null,'create','Duplicate',token1);
    accepted_duplicate := true;
  exception when unique_violation then null;
  end;
  if accepted_duplicate then raise exception 'Duplicate token was accepted'; end if;

  payload := jsonb_build_object('name','Guest One','organization','Community','attendance','yes','phone','','email','','has_allergy',false,'allergy_details','','website','','consent',true,'idempotency_key','22222222-2222-4222-8222-000000000001');
  response_id := public.submit_invitation_rsvp('personal-event',token1,payload,repeat('a',64));
  result_id := public.submit_invitation_rsvp('personal-event',token1,payload,repeat('a',64));
  if result_id <> response_id then raise exception 'Idempotent replay returned different ID'; end if;
  perform pg_temp.expect_error(format('select public.submit_invitation_rsvp(%L,%L,%L::jsonb,%L)', 'personal-event',token1,payload::text,repeat('b',64)), 'IDEMPOTENCY_CONFLICT');
  changed := jsonb_set(jsonb_set(payload,'{attendance}','"no"'::jsonb),'{idempotency_key}','"22222222-2222-4222-8222-000000000002"'::jsonb);
  result_id := public.submit_invitation_rsvp('personal-event',token1,changed,repeat('c',64));
  if result_id <> response_id or (select attendance from public.rsvps where id=response_id) <> 'no' then raise exception 'RSVP update failed'; end if;
  result_id := public.submit_invitation_rsvp('personal-event',token1,payload,repeat('a',64));
  if result_id <> response_id or (select attendance from public.rsvps where id=response_id) <> 'no' then raise exception 'Old retry reverted newer answer'; end if;
  if (select count(*) from public.rsvps r where r.invitation_id=invite_id) <> 1 then raise exception 'Duplicate RSVP for invitation'; end if;

  changed := public.manage_event_invitation(personal_event,invite_id,'rename','Guest Renamed',null);
  if changed->>'name' <> 'Guest Renamed' then raise exception 'Rename failed'; end if;
  perform public.manage_event_invitation(personal_event,invite_id,'revoke',null,null);
  perform pg_temp.expect_error(format('select public.submit_invitation_rsvp(%L,%L,%L::jsonb,%L)', 'personal-event',token1,payload::text,repeat('a',64)), 'NOT_FOUND');
  perform public.manage_event_invitation(personal_event,invite_id,'rotate',null,token2);
  perform pg_temp.expect_error(format('select public.submit_invitation_rsvp(%L,%L,%L::jsonb,%L)', 'personal-event',token1,payload::text,repeat('a',64)), 'NOT_FOUND');
  if (select attendance from public.rsvps where id=response_id) <> 'no' then raise exception 'Rotation lost RSVP'; end if;
  changed := jsonb_set(payload,'{idempotency_key}','"22222222-2222-4222-8222-000000000003"'::jsonb);
  perform public.submit_invitation_rsvp('personal-event',token2,changed,repeat('d',64));
  update public.events set content=jsonb_set(content,'{rsvp_closes_at}',to_jsonb((clock_timestamp()-interval '1 second')::text)) where id=personal_event;
  perform pg_temp.expect_error(format('select public.submit_invitation_rsvp(%L,%L,%L::jsonb,%L)', 'personal-event',token2,changed::text,repeat('d',64)), 'EVENT_CLOSED');
  update public.events set content=jsonb_set(content,'{rsvp_closes_at}','null'::jsonb) where id=personal_event;
  update public.events set status='draft' where id=personal_event;
  perform pg_temp.expect_error(format('select public.submit_invitation_rsvp(%L,%L,%L::jsonb,%L)', 'personal-event',token2,changed::text,repeat('d',64)), 'EVENT_CLOSED');
  update public.events set status='published', content=content || '{"invitation_mode":"open"}'::jsonb where id=personal_event;
  perform pg_temp.expect_error(format('select public.submit_invitation_rsvp(%L,%L,%L::jsonb,%L)', 'personal-event',token2,changed::text,repeat('d',64)), 'EVENT_CLOSED');
  if (select count(*) from public.rsvps where event_id=old_event and invitation_id is null) <> 2 then raise exception 'Old RSVPs changed after mode tests'; end if;
  raise notice 'PASS: legacy rows, open mode, token lifecycle, one RSVP, updates, replay, closure, draft and rollback';
end $$;
rollback;
