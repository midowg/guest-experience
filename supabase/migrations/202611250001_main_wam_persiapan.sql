-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Main WAM, Persiapan (agen S1): a checklist per agenda ("Persiapan berangkat": jaket, perlengkapan ibadah, ...).
--   mw_sessions.checklist_required: this session's checklist must be complete before a participant can check in
--     (absen) at a LATER session. Off by default: the checklist is then only a reminder. The app reads it with a
--     fallback until this runs (the column is not in SESSION_COLUMNS), so nothing waits for this file.
--   mw_checklist_items: the items of a session (text, a short note, an optional photo in private storage under
--     main-wam/ceklis/), in the admin's order. Deleted with their session.
--   mw_checklist_checks: who ticked which item (one row per person per item; ticking again is the same row).
-- A session may now be dated before the event ("H-3"): there is no date check in mw_sessions, so nothing changes here;
-- the window ("up to 60 days before the first day") is kept by the app (lib/main-wam/rundown.ts).
-- Server only (service role): closed to anon and authenticated. Safe to run again.
-- ROLLBACK (by hand): drop table public.mw_checklist_checks, public.mw_checklist_items; alter table public.mw_sessions drop column checklist_required;
begin;

alter table public.mw_sessions add column if not exists checklist_required boolean not null default false;

create table if not exists public.mw_checklist_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.mw_sessions (id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 120),
  note text not null default '' check (char_length(note) <= 300),
  -- A photo of the item ("foto contoh"), private storage: main-wam/ceklis/<uuid>.<ext>.
  photo_key text check (photo_key is null or photo_key ~ '^main-wam/ceklis/[0-9a-f-]{36}\.(webp|jpg|png)$'),
  photo_mime text check (photo_mime is null or photo_mime in ('image/webp', 'image/jpeg', 'image/png')),
  photo_size bigint check (photo_size is null or photo_size between 1 and 5242880),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mw_checklist_items_photo check ((photo_key is null) = (photo_mime is null) and (photo_key is null) = (photo_size is null))
);
create index if not exists mw_checklist_items_session on public.mw_checklist_items (session_id, sort);

create table if not exists public.mw_checklist_checks (
  item_id uuid not null references public.mw_checklist_items (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  checked_at timestamptz not null default now(),
  primary key (item_id, employee_id)
);
-- "What has this person ticked" (Agenda, the gate): led by the person.
create index if not exists mw_checklist_checks_employee on public.mw_checklist_checks (employee_id, item_id);

alter table public.mw_checklist_items enable row level security;
alter table public.mw_checklist_checks enable row level security;
revoke all on public.mw_checklist_items, public.mw_checklist_checks from public, anon, authenticated;
grant select, insert, update, delete on public.mw_checklist_items, public.mw_checklist_checks to service_role;

commit;
