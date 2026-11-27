-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611040006.
--
-- Notifikasi di HP (decided 8 Nov 2026): every in-app notification (announcements, session news,
-- Meeting HOD, reminders) also goes to the phones a person turned on in Pengaturan, as Web Push.
--   * pw_push_subscriptions: one row per phone or browser (its push endpoint and keys). A person
--     may have several; a phone that turns it off, or that the push service no longer knows
--     (404/410), is removed.
--   * The VAPID keys are server secrets (WAM_VAPID_PUBLIC_KEY, WAM_VAPID_PRIVATE_KEY), not stored here.
--
-- ROLLBACK (by hand): drop table pw_push_subscriptions;
begin;

create table if not exists public.pw_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 10 and 2000),
  p256dh text not null check (char_length(p256dh) between 10 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  device text not null default '' check (char_length(device) <= 120),
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index if not exists pw_push_subscriptions_employee on public.pw_push_subscriptions (employee_id);
alter table public.pw_push_subscriptions enable row level security;
revoke all on public.pw_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.pw_push_subscriptions to service_role;

commit;
