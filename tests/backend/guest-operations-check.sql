-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
select set_config('request.jwt.claim.role','service_role',true);

do $$
declare
  ev constant uuid := '66666666-6666-4666-8666-666666666666';
  doc jsonb := jsonb_build_object('status','draft','title','Operasi Tamu','slug','operasi-tamu','timezone','Asia/Jakarta',
    'starts_at','2026-11-02T09:00:00+07:00','agenda','[]'::jsonb,'feedback_questions','[]'::jsonb,'invitation_mode','personal');
  rows jsonb;
  one jsonb;
  ids jsonb;
begin
  perform public.save_event(ev, doc, true);

  one := public.manage_event_invitation(ev, null, 'create', 'Bu Sari', repeat('a',64), '6281234567890', 3);
  if one->>'phone' <> '6281234567890' or (one->>'party_size_max')::int <> 3 or (one->>'open_count')::int <> 0 then raise exception 'create with details failed: %', one; end if;
  -- The old five-argument call still works.
  one := public.manage_event_invitation(ev, null, 'create', 'Pak Budi', repeat('b',64));
  if one->>'phone' is not null or (one->>'party_size_max')::int <> 1 then raise exception 'legacy create defaults wrong'; end if;

  rows := jsonb_build_array(
    jsonb_build_object('name','Tamu Satu','phone','6281111111111','party_size_max',2,'token',repeat('c',64)),
    jsonb_build_object('name','Tamu Dua','token',repeat('d',64)));
  rows := public.manage_event_invitation(ev, null, 'import', p_rows => rows);
  if jsonb_array_length(rows) <> 2 or (select count(*) from public.event_invitations where event_id=ev) <> 4 then raise exception 'import failed'; end if;

  -- A bad row rejects the whole batch.
  begin
    perform public.manage_event_invitation(ev, null, 'import', p_rows => jsonb_build_array(
      jsonb_build_object('name','Baik','token',repeat('e',64)), jsonb_build_object('name','Nomor salah','phone','0812','token',repeat('f',64))));
    raise exception 'UNEXPECTED: bad import accepted';
  exception when raise_exception then if sqlerrm <> 'INVALID_INVITATION' then raise; end if;
  end;
  if (select count(*) from public.event_invitations where event_id=ev) <> 4 then raise exception 'partial import kept'; end if;

  select jsonb_agg(id) into ids from public.event_invitations where event_id=ev and name in ('Tamu Satu','Tamu Dua');
  rows := public.manage_event_invitation(ev, null, 'mark_sent', p_rows => ids);
  if jsonb_array_length(rows) <> 2 or exists(select 1 from public.event_invitations where id in (select (value#>>'{}')::uuid from jsonb_array_elements(ids)) and (send_count <> 1 or last_sent_at is null)) then raise exception 'mark_sent failed'; end if;

  one := public.manage_event_invitation(ev, (select id from public.event_invitations where name='Pak Budi'), 'update', 'Bapak Budi', null, '6282222222222', 2);
  if one->>'name' <> 'Bapak Budi' or one->>'phone' <> '6282222222222' then raise exception 'update failed'; end if;

  -- Opening counts only on a published personal event and an active link.
  perform public.mark_invitation_opened('operasi-tamu', repeat('a',64));
  if (select open_count from public.event_invitations where token=repeat('a',64)) <> 0 then raise exception 'draft opening counted'; end if;
  perform public.save_event(ev, doc || jsonb_build_object('status','published','organizer','Werkudara','introduction','Halo','venue_name','Kantor','address','Jl. Bhinneka','location_url','https://maps.app.goo.gl/x'), false);
  perform public.mark_invitation_opened('operasi-tamu', repeat('a',64));
  perform public.mark_invitation_opened('operasi-tamu', repeat('a',64));
  perform public.mark_invitation_opened('operasi-tamu', repeat('9',64));
  if (select open_count from public.event_invitations where token=repeat('a',64)) <> 2
    or (select first_opened_at from public.event_invitations where token=repeat('a',64)) is null then raise exception 'opening not counted'; end if;
  perform public.manage_event_invitation(ev, (select id from public.event_invitations where token=repeat('a',64)), 'revoke');
  perform public.mark_invitation_opened('operasi-tamu', repeat('a',64));
  if (select open_count from public.event_invitations where token=repeat('a',64)) <> 2 then raise exception 'revoked opening counted'; end if;
  raise notice 'PASS: details, legacy call, import, atomic rejection, mark_sent, update, opened tracking';
end $$;

set local role anon;
do $$ begin
  begin perform public.mark_invitation_opened('operasi-tamu', repeat('a',64)); raise exception 'UNEXPECTED: anon call';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
