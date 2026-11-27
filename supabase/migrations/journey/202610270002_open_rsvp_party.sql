-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- General link: one confirmation may cover the guest and the people coming with them (board 11,
-- "Datang bersama orang lain"). Until now the general link was always one person; only a
-- personal invitation could bring companions. The cap is the table's own: ten people in all.
begin;

create or replace function public.submit_rsvp(p_slug text,p_payload jsonb,p_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare e public.events; existing public.rsvps; result uuid; party integer; attending boolean; names text[];
begin
  select * into e from public.events where slug=p_slug for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if coalesce(e.content->>'invitation_mode','open') <> 'open' then raise exception 'EVENT_CLOSED'; end if;
  select * into existing from public.rsvps where event_id=e.id and idempotency_key=(p_payload->>'idempotency_key')::uuid;
  if found then
    if existing.request_hash <> p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return existing.id;
  end if;
  if e.status <> 'published' or (e.content->>'rsvp_enabled')::boolean is distinct from true
    or not exists(select 1 from jsonb_array_elements(e.content->'sections') s where s->>'key'='rsvp' and (s->>'enabled')::boolean)
    or ((e.content->>'rsvp_closes_at')::timestamptz is not null and clock_timestamp() >= (e.content->>'rsvp_closes_at')::timestamptz)
  then raise exception 'EVENT_CLOSED'; end if;
  attending := p_payload->>'attendance' = 'yes';
  party := case when attending then coalesce((p_payload->>'party_size')::integer, 1) else 1 end;
  names := case when attending then public.rsvp_text_array(p_payload->'companion_names') else '{}' end;
  if p_payload->>'website' is distinct from '' or (p_payload->>'consent')::boolean is distinct from true
    or party < 1 or party > 10 or cardinality(names) > party - 1 then raise exception 'INVALID_ANSWERS'; end if;
  insert into public.rsvps(event_id,name,organization,attendance,phone,email,has_allergy,allergy_details,idempotency_key,request_hash,
      party_size,companion_names,dietary,dietary_other,access,access_other,photo_opt_out,whatsapp_consent)
    values(e.id,p_payload->>'name',p_payload->>'organization',p_payload->>'attendance',p_payload->>'phone',p_payload->>'email',
      (p_payload->>'has_allergy')::boolean,p_payload->>'allergy_details',(p_payload->>'idempotency_key')::uuid,p_hash,
      party,names,public.rsvp_text_array(p_payload->'dietary'),coalesce(p_payload->>'dietary_other',''),
      public.rsvp_text_array(p_payload->'access'),coalesce(p_payload->>'access_other',''),
      coalesce((p_payload->>'photo_opt_out')::boolean,false),coalesce((p_payload->>'whatsapp_consent')::boolean,false))
    returning id into result;
  return result;
end $$;

-- The app asks this before it offers companions on a general link, so an older database never
-- receives a party it would refuse.
create function public.open_rsvp_party_max() returns integer
language sql immutable set search_path = '' as $$ select 10 $$;
revoke all on function public.open_rsvp_party_max() from public, anon, authenticated;
grant execute on function public.open_rsvp_party_max() to service_role;

commit;
