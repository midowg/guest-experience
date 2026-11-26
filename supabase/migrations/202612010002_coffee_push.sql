-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
--
-- Werkudara Coffee, web push (F4, 26 Nov 2026). Run after 202612010001_coffee.sql.
--   * coffee_push_subscriptions: one row per phone, tablet or browser that turned notifications
--     on (its push endpoint and keys), the same shape as pw_push_subscriptions. A table of its
--     own because the subscription belongs to Coffee's service worker (/coffee/sw.js), not WAM's.
--     A device belongs to whoever is signed in on it: saving the same endpoint again moves it to
--     that person, signing out removes it, and an endpoint the push service no longer knows
--     (404/410) is removed when a sending meets it. updated_at is when the device was last saved
--     (turned on, or a page opened on it): the server keeps a person's five newest devices and
--     sends to those only (final audit F5-04). The address is checked by the server against the
--     known push services before it is stored and before every sending.
--   * coffee_push_sent: what was already announced, one row per order, event and moment, so the
--     same news never goes out twice (a claim sent twice with one key is one "Klaim baru"). A
--     decision that was undone and made again has a new moment (processed_at) and is told again.
--     The server deletes rows older than 30 days whenever it announces something new (they only
--     guard against the same news twice); rows also go with their order.
--   * The VAPID keys are server secrets (WAM_VAPID_PUBLIC_KEY, WAM_VAPID_PRIVATE_KEY), not stored here.
--
-- ROLLBACK (by hand): drop table coffee_push_sent; drop table coffee_push_subscriptions;
begin;

create table if not exists public.coffee_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 10 and 2000),
  p256dh text not null check (char_length(p256dh) between 10 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  device text not null default '' check (char_length(device) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index if not exists coffee_push_subscriptions_employee on public.coffee_push_subscriptions (employee_id, updated_at desc);
alter table public.coffee_push_subscriptions enable row level security;
revoke all on public.coffee_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.coffee_push_subscriptions to service_role;

create table if not exists public.coffee_push_sent (
  order_id uuid not null references public.coffee_orders (id) on delete cascade,
  event text not null check (event in ('klaim_baru', 'rapat_baru', 'selesai', 'ditolak')),
  -- '' for a new order; the decision's processed_at (ISO text) for selesai / ditolak.
  stamp text not null default '' check (char_length(stamp) <= 40),
  sent_at timestamptz not null default now(),
  primary key (order_id, event, stamp)
);
create index if not exists coffee_push_sent_at on public.coffee_push_sent (sent_at);
alter table public.coffee_push_sent enable row level security;
revoke all on public.coffee_push_sent from public, anon, authenticated;
grant select, insert, delete on public.coffee_push_sent to service_role;

commit;
