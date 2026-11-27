-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Pra WAM, tahap 4a: announcements and in-app notifications. Panitia sends an announcement to
-- everyone, to a session's participants, or to units; the app also notifies a session's
-- participants when it is published, moved, or cancelled. Recipients are fixed when it is sent,
-- so "dibaca 12 dari 40" stays true even when units change later. Needs 202611040004.
begin;

create table public.pw_announcements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.pw_events (id),
  -- pengumuman: written by panitia; sesi: written by the app about a session.
  kind text not null default 'pengumuman' check (kind in ('pengumuman', 'sesi')),
  title text not null check (char_length(btrim(title)) between 2 and 150),
  body text not null default '' check (char_length(body) <= 4000),
  session_id uuid references public.pw_sessions (id) on delete set null,
  -- Who it was for, in words for the list: "Semua peserta", "Peserta HOD Meeting", "BAS, MRP".
  audience_label text not null default '' check (char_length(audience_label) <= 300),
  created_by uuid references public.employees (id),
  created_at timestamptz not null default now()
);
create index pw_announcements_event on public.pw_announcements (event_id, created_at desc);

create table public.pw_notification_receipts (
  announcement_id uuid not null references public.pw_announcements (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  read_at timestamptz,
  primary key (announcement_id, employee_id)
);
create index pw_receipts_person on public.pw_notification_receipts (employee_id, read_at);

alter table public.pw_announcements enable row level security;
alter table public.pw_notification_receipts enable row level security;
revoke all on public.pw_announcements, public.pw_notification_receipts from public, anon, authenticated;
grant select, insert, update, delete on public.pw_announcements, public.pw_notification_receipts to service_role;

commit;
