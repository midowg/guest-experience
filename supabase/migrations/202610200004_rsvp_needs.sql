-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- RSVP in steps: party size and companion names, food and access needs, photo opt-out, and
-- WhatsApp consent. The old allergy columns stay and keep their constraint: choosing
-- "Alergi makanan" fills has_allergy and allergy_details as before.
begin;

alter table public.rsvps
  add column party_size smallint not null default 1 check (party_size between 1 and 10),
  add column companion_names text[] not null default '{}' check (cardinality(companion_names) <= 9),
  add column dietary text[] not null default '{}' check (dietary <@ array['vegetarian','allergy','other']::text[]),
  add column dietary_other text not null default '' check (length(dietary_other) <= 300),
  add column access text[] not null default '{}' check (access <@ array['wheelchair','companion','sign_interpreter','other']::text[]),
  add column access_other text not null default '' check (length(access_other) <= 300),
  add column photo_opt_out boolean not null default false,
  add column whatsapp_consent boolean not null default false;

-- Earlier answers with an allergy carry it into the new list, so the two never disagree.
update public.rsvps set dietary = array['allergy'] where has_allergy;

alter table public.rsvps
  add constraint rsvps_allergy_in_dietary check (('allergy' = any(dietary)) = has_allergy),
  add constraint rsvps_needs_only_when_attending check (attendance = 'yes' or (party_size = 1 and cardinality(companion_names) = 0 and cardinality(dietary) = 0 and cardinality(access) = 0)),
  add constraint rsvps_companions_fit_party check (cardinality(companion_names) <= party_size - 1);

create function public.rsvp_text_array(p_value jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end)), '{}'::text[])
$$;
revoke all on function public.rsvp_text_array(jsonb) from public, anon, authenticated;

-- Generic link: one guest, no companions (party size belongs to personal invitations).
create or replace function public.submit_rsvp(p_slug text,p_payload jsonb,p_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare e public.events; existing public.rsvps; result uuid;
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
  if p_payload->>'website' is distinct from '' or (p_payload->>'consent')::boolean is distinct from true
    or coalesce((p_payload->>'party_size')::integer, 1) <> 1 then raise exception 'INVALID_ANSWERS'; end if;
  insert into public.rsvps(event_id,name,organization,attendance,phone,email,has_allergy,allergy_details,idempotency_key,request_hash,
      party_size,companion_names,dietary,dietary_other,access,access_other,photo_opt_out,whatsapp_consent)
    values(e.id,p_payload->>'name',p_payload->>'organization',p_payload->>'attendance',p_payload->>'phone',p_payload->>'email',
      (p_payload->>'has_allergy')::boolean,p_payload->>'allergy_details',(p_payload->>'idempotency_key')::uuid,p_hash,
      1,'{}',public.rsvp_text_array(p_payload->'dietary'),coalesce(p_payload->>'dietary_other',''),
      public.rsvp_text_array(p_payload->'access'),coalesce(p_payload->>'access_other',''),
      coalesce((p_payload->>'photo_opt_out')::boolean,false),coalesce((p_payload->>'whatsapp_consent')::boolean,false))
    returning id into result;
  return result;
end $$;

-- Personal link: the party may grow up to the invitation's party_size_max.
create or replace function public.submit_invitation_rsvp(p_slug text,p_token text,p_payload jsonb,p_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare e public.events; invitation public.event_invitations; existing public.rsvps; prior public.invitation_rsvp_requests; result uuid; party integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  select * into e from public.events where slug=p_slug for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into invitation from public.event_invitations where event_id=e.id and token=p_token and active for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if e.status <> 'published' or coalesce(e.content->>'invitation_mode','open') <> 'personal'
    or (e.content->>'rsvp_enabled')::boolean is distinct from true
    or not exists(select 1 from jsonb_array_elements(e.content->'sections') s where s->>'key'='rsvp' and (s->>'enabled')::boolean)
    or ((e.content->>'rsvp_closes_at')::timestamptz is not null and clock_timestamp() >= (e.content->>'rsvp_closes_at')::timestamptz)
  then raise exception 'EVENT_CLOSED'; end if;
  party := coalesce((p_payload->>'party_size')::integer, 1);
  if p_payload->>'website' is distinct from '' or (p_payload->>'consent')::boolean is distinct from true
    or p_hash !~ '^[0-9a-f]{64}$' or party < 1 or party > invitation.party_size_max then raise exception 'INVALID_ANSWERS'; end if;
  select * into prior from public.invitation_rsvp_requests
    where invitation_id=invitation.id and idempotency_key=(p_payload->>'idempotency_key')::uuid;
  if found then
    if prior.request_hash <> p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return prior.rsvp_id;
  end if;
  select * into existing from public.rsvps where invitation_id=invitation.id for update;
  if found then
    update public.rsvps set name=p_payload->>'name',organization=p_payload->>'organization',attendance=p_payload->>'attendance',
      phone=p_payload->>'phone',email=p_payload->>'email',has_allergy=(p_payload->>'has_allergy')::boolean,
      allergy_details=p_payload->>'allergy_details',consent_at=clock_timestamp(),updated_at=clock_timestamp(),
      idempotency_key=(p_payload->>'idempotency_key')::uuid,request_hash=p_hash,
      party_size=party,companion_names=public.rsvp_text_array(p_payload->'companion_names'),
      dietary=public.rsvp_text_array(p_payload->'dietary'),dietary_other=coalesce(p_payload->>'dietary_other',''),
      access=public.rsvp_text_array(p_payload->'access'),access_other=coalesce(p_payload->>'access_other',''),
      photo_opt_out=coalesce((p_payload->>'photo_opt_out')::boolean,false),whatsapp_consent=coalesce((p_payload->>'whatsapp_consent')::boolean,false)
      where id=existing.id returning id into result;
  else
    insert into public.rsvps(event_id,invitation_id,name,organization,attendance,phone,email,has_allergy,allergy_details,idempotency_key,request_hash,
        party_size,companion_names,dietary,dietary_other,access,access_other,photo_opt_out,whatsapp_consent)
      values(e.id,invitation.id,p_payload->>'name',p_payload->>'organization',p_payload->>'attendance',p_payload->>'phone',p_payload->>'email',
        (p_payload->>'has_allergy')::boolean,p_payload->>'allergy_details',(p_payload->>'idempotency_key')::uuid,p_hash,
        party,public.rsvp_text_array(p_payload->'companion_names'),public.rsvp_text_array(p_payload->'dietary'),coalesce(p_payload->>'dietary_other',''),
        public.rsvp_text_array(p_payload->'access'),coalesce(p_payload->>'access_other',''),
        coalesce((p_payload->>'photo_opt_out')::boolean,false),coalesce((p_payload->>'whatsapp_consent')::boolean,false))
      returning id into result;
  end if;
  insert into public.invitation_rsvp_requests(invitation_id,idempotency_key,request_hash,rsvp_id)
    values(invitation.id,(p_payload->>'idempotency_key')::uuid,p_hash,result);
  return result;
end $$;

commit;
