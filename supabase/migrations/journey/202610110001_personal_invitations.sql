-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
begin;

create table public.event_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 150),
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, id)
);
create index event_invitations_event on public.event_invitations(event_id, created_at, id);
alter table public.event_invitations enable row level security;
revoke all on public.event_invitations from anon, authenticated;
grant all on public.event_invitations to service_role;

alter table public.rsvps add column invitation_id uuid;
alter table public.rsvps add column updated_at timestamptz;
alter table public.rsvps add constraint rsvps_invitation_event_fk foreign key (event_id, invitation_id)
  references public.event_invitations(event_id, id) on delete cascade;
create unique index rsvps_one_per_invitation on public.rsvps(invitation_id) where invitation_id is not null;

-- Retain every accepted key so a delayed retry cannot restore an older answer after an edit.
create table public.invitation_rsvp_requests (
  invitation_id uuid not null references public.event_invitations(id) on delete cascade,
  idempotency_key uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  rsvp_id uuid not null references public.rsvps(id) on delete cascade,
  primary key (invitation_id, idempotency_key)
);
alter table public.invitation_rsvp_requests enable row level security;
revoke all on public.invitation_rsvp_requests from anon, authenticated;
grant all on public.invitation_rsvp_requests to service_role;

-- Keep legacy documents valid. The mode check also guards writes from older API versions.
create function public.check_invitation_mode() returns trigger language plpgsql
set search_path = '' as $$
begin
  if coalesce(new.content->>'invitation_mode', 'open') not in ('open', 'personal') then
    raise exception 'INVALID_EVENT';
  end if;
  return new;
end $$;
create trigger events_invitation_mode before insert or update of content on public.events
  for each row execute function public.check_invitation_mode();
revoke all on function public.check_invitation_mode() from public, anon, authenticated;

-- This RPC is called only by the server with its service key; the admin API is currently public.
create function public.manage_event_invitation(p_event uuid, p_id uuid, p_action text, p_name text default null, p_token text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.events; invitation public.event_invitations;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  select * into e from public.events where id=p_event for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_action = 'create' then
    if (select count(*) from public.event_invitations where event_id=p_event) >= 1000 then raise exception 'INVITATION_LIMIT'; end if;
    if p_id is not null or p_name is null or length(btrim(p_name)) not between 1 and 150 or p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_INVITATION'; end if;
    insert into public.event_invitations(event_id,name,token) values(p_event,btrim(p_name),p_token) returning * into invitation;
  elsif p_action in ('rename','revoke','rotate') then
    select * into invitation from public.event_invitations where event_id=p_event and id=p_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if p_action = 'rename' then
      if p_name is null or length(btrim(p_name)) not between 1 and 150 then raise exception 'INVALID_INVITATION'; end if;
      update public.event_invitations set name=btrim(p_name),updated_at=clock_timestamp() where id=p_id returning * into invitation;
    elsif p_action = 'revoke' then
      update public.event_invitations set active=false,updated_at=clock_timestamp() where id=p_id returning * into invitation;
    else
      if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_INVITATION'; end if;
      update public.event_invitations set token=p_token,active=true,updated_at=clock_timestamp() where id=p_id returning * into invitation;
    end if;
  else raise exception 'INVALID_INVITATION'; end if;
  return to_jsonb(invitation);
end $$;
revoke all on function public.manage_event_invitation(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.manage_event_invitation(uuid,uuid,text,text,text) to service_role;

-- Replace the legacy RPC: generic links cannot write RSVP while personal mode is active.
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
  if p_payload->>'website' is distinct from '' or (p_payload->>'consent')::boolean is distinct from true then raise exception 'INVALID_ANSWERS'; end if;
  insert into public.rsvps(event_id,name,organization,attendance,phone,email,has_allergy,allergy_details,idempotency_key,request_hash)
    values(e.id,p_payload->>'name',p_payload->>'organization',p_payload->>'attendance',p_payload->>'phone',p_payload->>'email',
      (p_payload->>'has_allergy')::boolean,p_payload->>'allergy_details',(p_payload->>'idempotency_key')::uuid,p_hash)
    returning id into result;
  return result;
end $$;

create function public.submit_invitation_rsvp(p_slug text,p_token text,p_payload jsonb,p_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare e public.events; invitation public.event_invitations; existing public.rsvps; prior public.invitation_rsvp_requests; result uuid;
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
  if p_payload->>'website' is distinct from '' or (p_payload->>'consent')::boolean is distinct from true
    or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_ANSWERS'; end if;
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
      idempotency_key=(p_payload->>'idempotency_key')::uuid,request_hash=p_hash
      where id=existing.id returning id into result;
  else
    insert into public.rsvps(event_id,invitation_id,name,organization,attendance,phone,email,has_allergy,allergy_details,idempotency_key,request_hash)
      values(e.id,invitation.id,p_payload->>'name',p_payload->>'organization',p_payload->>'attendance',p_payload->>'phone',p_payload->>'email',
        (p_payload->>'has_allergy')::boolean,p_payload->>'allergy_details',(p_payload->>'idempotency_key')::uuid,p_hash)
      returning id into result;
  end if;
  insert into public.invitation_rsvp_requests(invitation_id,idempotency_key,request_hash,rsvp_id)
    values(invitation.id,(p_payload->>'idempotency_key')::uuid,p_hash,result);
  return result;
end $$;
revoke all on function public.submit_invitation_rsvp(text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.submit_invitation_rsvp(text,text,jsonb,text) to service_role;
commit;
