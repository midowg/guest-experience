-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611080001.
--
-- Pilihan notifikasi HP (decided 8 Nov 2026): every notification stays in the bell (Notifikasi),
-- but only some topics are also pushed to the phone, and each person chooses which in Pengaturan.
--   * pw_notification_prefs: one row per person who changed a choice. `push` holds only their
--     own choices, topic → true/false (e.g. {"booking_baru": true}); a topic not in it follows its
--     default (src/lib/pra-wam/push.ts, pushTopicInfo). Pengumuman is always pushed and never
--     stored here. A person without a row has every default.
--   * Quiet hours (21.00–06.00 WIB) are decided by the app, not stored.
--
-- ROLLBACK (by hand): drop table pw_notification_prefs;
begin;

create table if not exists public.pw_notification_prefs (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  push jsonb not null default '{}'::jsonb check (jsonb_typeof(push) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.pw_notification_prefs enable row level security;
revoke all on public.pw_notification_prefs from public, anon, authenticated;
grant select, insert, update, delete on public.pw_notification_prefs to service_role;

commit;
