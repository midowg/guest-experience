-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Studio Poster design library: a poster set up on one event (Figma backgrounds and boxes) saved
-- by the super admin so later events can start from it. An event copies the design, so editing
-- or deleting a design never changes an event. Server only (service role).
begin;

create table public.poster_designs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text not null default '' check (char_length(description) <= 300),
  template jsonb not null check (jsonb_typeof(template) = 'object' and coalesce(jsonb_typeof(template->'fields'), '') = 'array' and pg_column_size(template) <= 200000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index poster_designs_newest on public.poster_designs (created_at desc);

alter table public.poster_designs enable row level security;
revoke all on public.poster_designs from public, anon, authenticated;
grant select, insert, update, delete on public.poster_designs to service_role;

commit;
