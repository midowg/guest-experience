-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Hosting brief for a visit: who invited the guest, who the guest is, the relationship and the
-- purpose, and what hospitality should know. One row per event, read and written by the server
-- (service role) only. Never part of the event document the guest page reads.
begin;

create table public.event_hosting_brief (
  event_id uuid primary key references public.events(id) on delete cascade,
  brief jsonb not null default '{}'::jsonb check (jsonb_typeof(brief) = 'object' and pg_column_size(brief) <= 16000),
  version integer not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

alter table public.event_hosting_brief enable row level security;
revoke all on public.event_hosting_brief from public, anon, authenticated;
grant select, insert, update, delete on public.event_hosting_brief to service_role;

-- Save the brief when nobody else saved it since p_expected_version was read (BRIEF_CHANGED).
create or replace function public.save_hosting_brief(p_event_id uuid, p_brief jsonb, p_expected_version integer)
returns public.event_hosting_brief
language plpgsql
set search_path = public
as $$
declare
  current_row public.event_hosting_brief;
begin
  if not exists (select 1 from public.events where id = p_event_id) then raise exception 'EVENT_NOT_FOUND'; end if;
  insert into public.event_hosting_brief (event_id) values (p_event_id) on conflict (event_id) do nothing;
  select * into current_row from public.event_hosting_brief where event_id = p_event_id for update;
  if current_row.version <> coalesce(p_expected_version, -1) then raise exception 'BRIEF_CHANGED'; end if;
  update public.event_hosting_brief set brief = p_brief, version = current_row.version + 1, updated_at = now()
  where event_id = p_event_id
  returning * into current_row;
  return current_row;
end;
$$;

revoke all on function public.save_hosting_brief(uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.save_hosting_brief(uuid, jsonb, integer) to service_role;

commit;
