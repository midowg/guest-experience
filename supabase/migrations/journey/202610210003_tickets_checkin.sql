-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Entry tickets and check-in. One ticket per RSVP that answered yes; the code is the only thing in
-- the guest's QR. Server only (service role): guests see their ticket through the app.
begin;

create table public.event_tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  rsvp_id uuid not null unique references public.rsvps(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Za-z0-9_-]{22,32}$'),
  issued_at timestamptz not null default now(),
  checked_in_at timestamptz,
  checked_in_device text check (checked_in_device is null or char_length(checked_in_device) <= 64)
);
create index event_tickets_event on public.event_tickets (event_id, checked_in_at);

alter table public.event_tickets enable row level security;
revoke all on public.event_tickets from public, anon, authenticated;
grant select, insert, update, delete on public.event_tickets to service_role;

-- The ticket of an RSVP that answered yes, created on first ask with the app's random code.
-- Asking again returns the same ticket. A "no" answer has no ticket (TICKET_NOT_ATTENDING).
create or replace function public.issue_ticket(p_rsvp_id uuid, p_code text)
returns public.event_tickets
language plpgsql
set search_path = public
as $$
declare
  answer record;
  ticket public.event_tickets;
begin
  select id, event_id, attendance into answer from public.rsvps where id = p_rsvp_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if answer.attendance <> 'yes' then raise exception 'TICKET_NOT_ATTENDING'; end if;
  insert into public.event_tickets (event_id, rsvp_id, code) values (answer.event_id, p_rsvp_id, p_code)
  on conflict (rsvp_id) do nothing;
  select * into ticket from public.event_tickets where rsvp_id = p_rsvp_id;
  return ticket;
end;
$$;

-- Check a guest in by ticket code, or by RSVP for a guest found by name (a ticket is then made
-- with a random code). Idempotent: a second scan reports the first time instead of failing.
create or replace function public.check_in_ticket(p_event_id uuid, p_code text, p_rsvp_id uuid, p_device text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  ticket public.event_tickets;
  first_time boolean := false;
begin
  if p_code is not null then
    select * into ticket from public.event_tickets where code = p_code and event_id = p_event_id for update;
  elsif p_rsvp_id is not null then
    if not exists (select 1 from public.rsvps where id = p_rsvp_id and event_id = p_event_id) then raise exception 'NOT_FOUND'; end if;
    ticket := public.issue_ticket(p_rsvp_id, replace(gen_random_uuid()::text, '-', ''));
    select * into ticket from public.event_tickets where id = ticket.id for update;
  end if;
  if ticket.id is null then raise exception 'TICKET_UNKNOWN'; end if;
  if not exists (select 1 from public.rsvps where id = ticket.rsvp_id and attendance = 'yes') then raise exception 'TICKET_NOT_ATTENDING'; end if;
  if ticket.checked_in_at is null then
    update public.event_tickets set checked_in_at = now(), checked_in_device = left(p_device, 64) where id = ticket.id returning * into ticket;
    first_time := true;
  end if;
  return to_jsonb(ticket) || jsonb_build_object('first_time', first_time);
end;
$$;

revoke all on function public.issue_ticket(uuid, text) from public, anon, authenticated;
revoke all on function public.check_in_ticket(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.issue_ticket(uuid, text) to service_role;
grant execute on function public.check_in_ticket(uuid, text, uuid, text) to service_role;

commit;
