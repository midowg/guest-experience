-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
select set_config('request.jwt.claim.role','service_role',true);

do $$
declare
  ev constant uuid := 'aaaaaaaa-1111-4111-8111-111111111111';
  ev2 constant uuid := 'aaaaaaaa-1111-4111-8111-111111111112';
  doc jsonb := jsonb_build_object('status','draft','title','Kode','timezone','Asia/Jakarta','starts_at','2026-11-02T09:00:00+07:00',
    'agenda','[]'::jsonb,'feedback_questions','[]'::jsonb,'invitation_mode','personal');
  code1 text; code2 text;
  inv jsonb;
  short1 text; short2 text;
  sample text;
begin
  perform public.save_event(ev, doc || jsonb_build_object('slug','kode-satu'), true);
  perform public.save_event(ev2, doc || jsonb_build_object('slug','kode-dua'), true);
  select code into code1 from public.events where id = ev;
  select code into code2 from public.events where id = ev2;
  if code1 !~ '^[A-HJKMNP-Z2-9]{6}$' or code1 = code2 then raise exception 'codes should be 6 readable characters and differ: % %', code1, code2; end if;
  if (select document->>'code' from public.event_documents where id = ev) <> code1 then raise exception 'document should carry the code'; end if;

  -- A save never changes the code, even when the document carries another one.
  perform public.save_event(ev, doc || jsonb_build_object('slug','kode-satu','code','ZZZZZZ','title','Ganti judul'), false);
  if (select code from public.events where id = ev) <> code1 then raise exception 'save must keep the code'; end if;
  if (select document->>'code' from public.event_documents where id = ev) <> code1 then raise exception 'column must win over content'; end if;

  begin update public.events set code = 'abc123' where id = ev; raise exception 'UNEXPECTED: lowercase code';
  exception when check_violation then null; end;
  begin update public.events set code = code2 where id = ev; raise exception 'UNEXPECTED: duplicate code';
  exception when unique_violation then null; end;

  inv := public.manage_event_invitation(ev, null, 'create', 'Bu Sari', repeat('a',64));
  select short_token into short1 from public.event_invitations where id = (inv->>'id')::uuid;
  if short1 !~ '^[a-hjkmnp-z2-9]{8}$' then raise exception 'short token format: %', short1; end if;
  update public.event_invitations set name = 'Bu Sari Dewi' where id = (inv->>'id')::uuid;
  if (select short_token from public.event_invitations where id = (inv->>'id')::uuid) <> short1 then raise exception 'renaming must keep the short token'; end if;
  perform public.manage_event_invitation(ev, (inv->>'id')::uuid, 'rotate', p_token => repeat('b',64));
  select short_token into short2 from public.event_invitations where id = (inv->>'id')::uuid;
  if short2 = short1 then raise exception 'rotating the token must replace the short token'; end if;

  sample := public.random_text(200, 'ab');
  if sample !~ '^[ab]{200}$' or sample !~ 'a' or sample !~ 'b' then raise exception 'random_text alphabet'; end if;
  raise notice 'PASS: event codes, document code, save keeps code, short tokens, rotate renews';
end $$;

set local role anon;
do $$ begin
  begin perform public.random_text(6, 'AB'); raise exception 'UNEXPECTED: anon random_text';
  exception when insufficient_privilege then null; end;
  begin perform short_token from public.event_invitations; raise exception 'UNEXPECTED: anon read short tokens';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: short tokens are server only';
end $$;
reset role;

rollback;
