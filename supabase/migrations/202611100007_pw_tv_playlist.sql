-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- TV Announcement: one playlist instead of a fixed order (10 Nov 2026). Until now a TV played the
-- day calendar, the week calendar, then every picture. Now everything it plays is a row here, in
-- any order: templates fed by WAM (the two room calendars, Timeline's forums and events, panitia's
-- announcements), text the admin types, and the uploaded pictures. A row may be for some TVs only
-- (screen_ids; empty = every TV) and may show only between two dates or two times of day.
-- The rows are made from today's settings, so a TV plays exactly what it played before.
-- Also: an admin can ask a TV to load itself afresh (reload_at), and a TV reports what it shows.
-- Needs 202611100003 (and reads the calendars' settings of it).
-- ROLLBACK (by hand): drop table public.pw_tv_items;
--   alter table public.pw_tv_screens drop column reload_at, drop column last_item;
begin;

create table public.pw_tv_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('kalender_hari', 'kalender_minggu', 'timeline', 'pengumuman', 'teks', 'gambar')),
  title text not null default '' check (char_length(title) <= 80),
  -- For 'teks': what the slide says.
  body text not null default '' check (char_length(body) <= 600),
  -- For 'gambar': the picture; it goes when its picture goes.
  slide_id uuid unique references public.pw_tv_slides (id) on delete cascade,
  seconds integer not null default 15 check (seconds between 3 and 120),
  sort_order integer not null default 0,
  active boolean not null default true,
  -- Shown only from/until these days (WIB), and only between these times of day; null = no limit.
  show_from date,
  show_until date,
  time_from time,
  time_until time,
  -- The TVs it plays on; empty = every TV, and the one address for all (/tv).
  screen_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  check ((kind = 'gambar') = (slide_id is not null)),
  check (show_from is null or show_until is null or show_from <= show_until)
);
create index pw_tv_items_order on public.pw_tv_items (sort_order, created_at);

-- What TVs play today, as rows: the two calendars as the settings have them, then the pictures in their order.
insert into public.pw_tv_items (kind, seconds, sort_order, active)
select 'kalender_hari', coalesce(max(day_seconds), 20), 1, coalesce(bool_and(show_day), true) from public.pw_tv_settings;
insert into public.pw_tv_items (kind, seconds, sort_order, active)
select 'kalender_minggu', coalesce(max(week_seconds), 20), 2, coalesce(bool_and(show_week), true) from public.pw_tv_settings;
insert into public.pw_tv_items (kind, title, slide_id, seconds, sort_order, active)
select 'gambar', title, id, seconds, 2 + row_number() over (order by sort_order, created_at), active from public.pw_tv_slides;

alter table public.pw_tv_screens
  add column reload_at timestamptz,
  add column last_item text check (char_length(last_item) <= 80);

alter table public.pw_tv_items enable row level security;
revoke all on public.pw_tv_items from public, anon, authenticated;
grant select, insert, update, delete on public.pw_tv_items to service_role;

commit;
