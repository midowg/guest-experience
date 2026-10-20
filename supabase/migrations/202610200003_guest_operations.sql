-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Guest operations: WhatsApp numbers and party size per invitation, bulk import, "sent" and
-- "opened" tracking. Additive: existing invitations keep working with the new columns empty.
begin;

alter table public.event_invitations
  -- International form without "+", e.g. 6281234567890 (wa.me format).
  add column phone text check (phone is null or phone ~ '^628[0-9]{8,11}$'),
  add column party_size_max smallint not null default 1 check (party_size_max between 1 and 10),
  -- When the admin last opened WhatsApp for this guest. Intent only: delivery is not known.
  add column last_sent_at timestamptz,
  add column send_count integer not null default 0 check (send_count >= 0),
  -- Set from the guest's browser after the page shows, so link-preview crawlers do not count.
  add column first_opened_at timestamptz,
  add column last_opened_at timestamptz,
  add column open_count integer not null default 0 check (open_count >= 0);

-- The new signature keeps the old five parameters first, so earlier calls still resolve.
drop function public.manage_event_invitation(uuid,uuid,text,text,text);
create function public.manage_event_invitation(
  p_event uuid, p_id uuid, p_action text, p_name text default null, p_token text default null,
  p_phone text default null, p_party_size integer default null, p_rows jsonb default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.events; invitation public.event_invitations; item jsonb; created jsonb := '[]'::jsonb; total integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  select * into e from public.events where id=p_event for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_phone is not null and p_phone !~ '^628[0-9]{8,11}$' then raise exception 'INVALID_INVITATION'; end if;
  if p_party_size is not null and p_party_size not between 1 and 10 then raise exception 'INVALID_INVITATION'; end if;

  if p_action = 'create' then
    if (select count(*) from public.event_invitations where event_id=p_event) >= 1000 then raise exception 'INVITATION_LIMIT'; end if;
    if p_id is not null or p_name is null or length(btrim(p_name)) not between 1 and 150 or p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_INVITATION'; end if;
    insert into public.event_invitations(event_id,name,token,phone,party_size_max)
      values(p_event,btrim(p_name),p_token,p_phone,coalesce(p_party_size,1)) returning * into invitation;

  elsif p_action = 'import' then
    if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'INVALID_INVITATION'; end if;
    select count(*) into total from public.event_invitations where event_id=p_event;
    if total + jsonb_array_length(p_rows) > 1000 then raise exception 'INVITATION_LIMIT'; end if;
    for item in select value from jsonb_array_elements(p_rows) loop
      if length(btrim(coalesce(item->>'name',''))) not between 1 and 150
        or coalesce(item->>'token','') !~ '^[0-9a-f]{64}$'
        or (item->>'phone' is not null and item->>'phone' !~ '^628[0-9]{8,11}$')
        or coalesce((item->>'party_size_max')::integer, 1) not between 1 and 10
      then raise exception 'INVALID_INVITATION'; end if;
      insert into public.event_invitations(event_id,name,token,phone,party_size_max)
        values(p_event,btrim(item->>'name'),item->>'token',item->>'phone',coalesce((item->>'party_size_max')::integer,1))
        returning * into invitation;
      created := created || to_jsonb(invitation);
    end loop;
    return created;

  elsif p_action = 'mark_sent' then
    -- p_rows: array of invitation ids, for the bulk "send" and "remind" buttons.
    if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1000 then raise exception 'INVALID_INVITATION'; end if;
    update public.event_invitations set last_sent_at=clock_timestamp(), send_count=send_count+1
      where event_id=p_event and id in (select (value#>>'{}')::uuid from jsonb_array_elements(p_rows));
    select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) into created from public.event_invitations i
      where event_id=p_event and id in (select (value#>>'{}')::uuid from jsonb_array_elements(p_rows));
    return created;

  elsif p_action in ('rename','revoke','rotate','update') then
    select * into invitation from public.event_invitations where event_id=p_event and id=p_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if p_action in ('rename','update') then
      if p_name is null or length(btrim(p_name)) not between 1 and 150 then raise exception 'INVALID_INVITATION'; end if;
      update public.event_invitations set name=btrim(p_name),updated_at=clock_timestamp(),
        phone=case when p_action='update' then p_phone else phone end,
        party_size_max=case when p_action='update' then coalesce(p_party_size,1) else party_size_max end
        where id=p_id returning * into invitation;
    elsif p_action = 'revoke' then
      update public.event_invitations set active=false,updated_at=clock_timestamp() where id=p_id returning * into invitation;
    else
      if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_INVITATION'; end if;
      update public.event_invitations set token=p_token,active=true,updated_at=clock_timestamp() where id=p_id returning * into invitation;
    end if;
  else raise exception 'INVALID_INVITATION'; end if;
  return to_jsonb(invitation);
end $$;
revoke all on function public.manage_event_invitation(uuid,uuid,text,text,text,text,integer,jsonb) from public, anon, authenticated;
grant execute on function public.manage_event_invitation(uuid,uuid,text,text,text,text,integer,jsonb) to service_role;

-- Counts an opening of an active personal link on a published personal-mode event. Silent
-- otherwise: the guest page never learns whether a token exists from this call.
create function public.mark_invitation_opened(p_slug text, p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  update public.event_invitations i set
    first_opened_at=coalesce(i.first_opened_at, clock_timestamp()), last_opened_at=clock_timestamp(), open_count=i.open_count+1
  from public.events e
  where e.slug=p_slug and i.event_id=e.id and i.token=p_token and i.active
    and e.status='published' and coalesce(e.content->>'invitation_mode','open')='personal';
end $$;
revoke all on function public.mark_invitation_opened(text,text) from public, anon, authenticated;
grant execute on function public.mark_invitation_opened(text,text) to service_role;

commit;
