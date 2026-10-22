-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
select set_config('request.jwt.claim.role','service_role',true);

do $$
declare
  ev constant uuid := '99999999-9999-4999-8999-999999999999';
  other constant uuid := '99999999-9999-4999-8999-999999999998';
  base jsonb := jsonb_build_object('status','published','title','Tiket','timezone','Asia/Jakarta','starts_at','2026-11-02T09:00:00+07:00',
    'agenda','[]'::jsonb,'feedback_questions','[]'::jsonb,'organizer','Werkudara','introduction','Halo','venue_name','Kantor','address','Jl. Bhinneka',
    'location_url','https://maps.app.goo.gl/x','rsvp_enabled',true,'sections',jsonb_build_array(jsonb_build_object('key','rsvp','enabled',true)));
  guest jsonb := jsonb_build_object('organization','Mitra','phone','','email','','website','','consent',true,'has_allergy',false,'allergy_details','');
  yes_id uuid; no_id uuid; walk_in uuid;
  ticket public.event_tickets;
  again public.event_tickets;
  result jsonb;
begin
  perform public.save_event(ev, base || jsonb_build_object('slug','tiket-cek','status','draft'), true);
  perform public.save_event(ev, base || jsonb_build_object('slug','tiket-cek'), false);
  perform public.save_event(other, base || jsonb_build_object('slug','tiket-lain','status','draft'), true);
  yes_id := public.submit_rsvp('tiket-cek', guest || jsonb_build_object('name','Sari Dewi','attendance','yes','idempotency_key','99999999-0000-4000-8000-000000000001'), repeat('1',64));
  no_id := public.submit_rsvp('tiket-cek', guest || jsonb_build_object('name','Budi','attendance','no','idempotency_key','99999999-0000-4000-8000-000000000002'), repeat('2',64));
  walk_in := public.submit_rsvp('tiket-cek', guest || jsonb_build_object('name','Citra','attendance','yes','idempotency_key','99999999-0000-4000-8000-000000000003'), repeat('3',64));

  ticket := public.issue_ticket(yes_id, 'AbCdEfGhIjKlMnOpQrStUv');
  again := public.issue_ticket(yes_id, 'ZZZZZZZZZZZZZZZZZZZZZZ');
  if ticket.id <> again.id or again.code <> 'AbCdEfGhIjKlMnOpQrStUv' then raise exception 'asking again must return the same ticket'; end if;
  begin perform public.issue_ticket(no_id, 'NoNoNoNoNoNoNoNoNoNoNo'); raise exception 'UNEXPECTED: ticket for a no';
  exception when others then if sqlerrm <> 'TICKET_NOT_ATTENDING' then raise; end if; end;
  begin perform public.issue_ticket(walk_in, 'bad code!'); raise exception 'UNEXPECTED: bad code';
  exception when check_violation then null; end;

  result := public.check_in_ticket(ev, 'AbCdEfGhIjKlMnOpQrStUv', null, 'dev-1');
  if not (result->>'first_time')::boolean or result->>'checked_in_at' is null then raise exception 'first scan should check in: %', result; end if;
  result := public.check_in_ticket(ev, 'AbCdEfGhIjKlMnOpQrStUv', null, 'dev-2');
  if (result->>'first_time')::boolean or result->>'checked_in_device' <> 'dev-1' then raise exception 'second scan must keep the first: %', result; end if;

  begin perform public.check_in_ticket(other, 'AbCdEfGhIjKlMnOpQrStUv', null, null); raise exception 'UNEXPECTED: ticket of another event';
  exception when others then if sqlerrm <> 'TICKET_UNKNOWN' then raise; end if; end;
  begin perform public.check_in_ticket(ev, 'TidakAdaTidakAdaTidakA', null, null); raise exception 'UNEXPECTED: unknown code';
  exception when others then if sqlerrm <> 'TICKET_UNKNOWN' then raise; end if; end;

  result := public.check_in_ticket(ev, null, walk_in, 'dev-1');
  if not (result->>'first_time')::boolean or char_length(result->>'code') <> 32 then raise exception 'check-in by name should make a ticket: %', result; end if;
  begin perform public.check_in_ticket(ev, null, no_id, null); raise exception 'UNEXPECTED: check in a no';
  exception when others then if sqlerrm <> 'TICKET_NOT_ATTENDING' then raise; end if; end;
  begin perform public.check_in_ticket(other, null, walk_in, null); raise exception 'UNEXPECTED: rsvp of another event';
  exception when others then if sqlerrm <> 'NOT_FOUND' then raise; end if; end;

  delete from public.rsvps where id = yes_id;
  if exists (select 1 from public.event_tickets where id = ticket.id) then raise exception 'ticket should go with its RSVP'; end if;
  raise notice 'PASS: one ticket per yes, idempotent check-in, event bound, check-in by name, cascade';
end $$;

set local role anon;
do $$ begin
  begin perform 1 from public.event_tickets; raise exception 'UNEXPECTED: anon read tickets';
  exception when insufficient_privilege then null; end;
  begin perform public.check_in_ticket('99999999-9999-4999-8999-999999999999', 'x', null, null); raise exception 'UNEXPECTED: anon check-in';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: tickets are server only';
end $$;
reset role;

rollback;
