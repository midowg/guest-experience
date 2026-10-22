-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- BEO (banquet event order) for hospitality: the number to prepare and its status, one row per
-- event, plus every change as a revision with its reason. Server only (service role).
begin;

create table public.event_beo (
  event_id uuid primary key references public.events(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','set','revised','final','done')),
  prepared_count integer check (prepared_count between 0 and 100000),
  notes text not null default '' check (char_length(notes) <= 4000),
  version integer not null default 0 check (version >= 0),
  locked_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.event_beo_revisions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  version integer not null,
  status text not null check (status in ('draft','set','revised','final','done')),
  prepared_count integer,
  attending integer not null default 0,
  reason text not null default '' check (char_length(reason) <= 500),
  device_id text check (device_id is null or char_length(device_id) <= 64),
  role text check (role is null or role in ('admin','super')),
  at timestamptz not null default now()
);
create index event_beo_revisions_event on public.event_beo_revisions (event_id, version desc);

alter table public.event_beo enable row level security;
alter table public.event_beo_revisions enable row level security;
revoke all on public.event_beo, public.event_beo_revisions from public, anon, authenticated;
grant select, insert, update, delete on public.event_beo, public.event_beo_revisions to service_role;

-- One step of the BEO flow. p_expected_version guards against two people changing it at once
-- (BEO_CHANGED); a step not allowed from the current status raises BEO_STEP. A draft save is not
-- a revision; every other step is recorded with the attending count at that moment.
create or replace function public.apply_beo_action(
  p_event_id uuid, p_action text, p_expected_version integer,
  p_prepared_count integer, p_notes text, p_reason text, p_attending integer,
  p_device_id text, p_role text
) returns public.event_beo
language plpgsql
set search_path = public
as $$
declare
  current_row public.event_beo;
  next_status text;
  next_version integer;
begin
  if not exists (select 1 from public.events where id = p_event_id) then raise exception 'EVENT_NOT_FOUND'; end if;
  insert into public.event_beo (event_id) values (p_event_id) on conflict (event_id) do nothing;
  select * into current_row from public.event_beo where event_id = p_event_id for update;
  if current_row.version <> coalesce(p_expected_version, -1) then raise exception 'BEO_CHANGED'; end if;

  next_status := case
    when p_action = 'save' and current_row.status = 'draft' then 'draft'
    when p_action = 'set' and current_row.status = 'draft' then 'set'
    when p_action = 'revise' and current_row.status in ('set','revised','final') then 'revised'
    when p_action = 'final' and current_row.status in ('set','revised') then 'final'
    when p_action = 'done' and current_row.status = 'final' then 'done'
    when p_action = 'reopen' and current_row.status = 'done' then 'revised'
  end;
  if next_status is null then raise exception 'BEO_STEP'; end if;
  if p_action = 'revise' and char_length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'BEO_REASON'; end if;

  next_version := current_row.version + 1;
  update public.event_beo set
    status = next_status,
    prepared_count = case when p_action in ('save','set','revise') then p_prepared_count else prepared_count end,
    notes = coalesce(p_notes, notes),
    version = next_version,
    locked_at = case when p_action = 'set' then now() when p_action = 'revise' then now() else locked_at end,
    updated_at = now()
  where event_id = p_event_id
  returning * into current_row;

  if p_action <> 'save' then
    insert into public.event_beo_revisions (event_id, version, status, prepared_count, attending, reason, device_id, role)
    values (p_event_id, next_version, next_status, current_row.prepared_count, coalesce(p_attending, 0), left(coalesce(p_reason, ''), 500), p_device_id, p_role);
  end if;
  return current_row;
end;
$$;

revoke all on function public.apply_beo_action(uuid, text, integer, integer, text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.apply_beo_action(uuid, text, integer, integer, text, text, integer, text, text) to service_role;

commit;
