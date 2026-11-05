-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- WAM questionnaire, stage 3: room pairing for the WAM stay. HR keeps the hotel's rooms (name, kind,
-- capacity per room), the app suggests who shares from the stay answers (questions 33 and 7-13),
-- and HR moves people by hand under the Data HR lock. Once published, each participant sees their
-- own room and roommates on Beranda. Needs 202611040011. Server only (service role).
begin;

create table public.cq_stay_rooms (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.cq_forms (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  kind text not null default '' check (char_length(kind) <= 40),
  capacity integer not null check (capacity between 1 and 8),
  -- "Sudah ditinjau": set by HR, cleared by the app whenever the room's people change.
  reviewed_at timestamptz,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  unique (form_id, name)
);
create index cq_stay_rooms_form on public.cq_stay_rooms (form_id, sort);

-- One room per person per form.
create table public.cq_stay_members (
  form_id uuid not null references public.cq_forms (id) on delete cascade,
  room_id uuid not null references public.cq_stay_rooms (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  -- Who placed them: the person whose email opened Data HR; null for an automatic suggestion.
  placed_by uuid references public.employees (id) on delete set null,
  placed_at timestamptz not null default now(),
  primary key (form_id, employee_id)
);
create index cq_stay_members_room on public.cq_stay_members (room_id);

-- A room never holds more than its capacity, and a person stays within the room's form. The room
-- row is locked first, so two placements at once cannot both take the last bed.
create function public.cq_stay_members_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  room public.cq_stay_rooms%rowtype;
begin
  select * into room from public.cq_stay_rooms where id = new.room_id for update;
  if room.form_id <> new.form_id then
    raise exception 'Kamar ini milik kuesioner lain.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.cq_stay_members where room_id = new.room_id) > room.capacity then
    raise exception 'Kamar % sudah penuh.', room.name using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger cq_stay_members_check after insert or update on public.cq_stay_members
  for each row execute function public.cq_stay_members_check();

-- A smaller capacity than the people already in the room is refused too.
create function public.cq_stay_rooms_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.cq_stay_members where room_id = new.id) > new.capacity then
    raise exception 'Kamar % berisi lebih banyak orang dari kapasitas baru.', new.name using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger cq_stay_rooms_check after update of capacity on public.cq_stay_rooms
  for each row execute function public.cq_stay_rooms_check();

-- When the pairing is shown to participants; null while HR is still arranging it.
alter table public.cq_forms add column rooms_published_at timestamptz;

alter table public.cq_stay_rooms enable row level security;
alter table public.cq_stay_members enable row level security;
revoke all on public.cq_stay_rooms, public.cq_stay_members from public, anon, authenticated;
grant select, insert, update, delete on public.cq_stay_rooms, public.cq_stay_members to service_role;
revoke all on function public.cq_stay_members_check(), public.cq_stay_rooms_check() from public, anon, authenticated;

commit;
