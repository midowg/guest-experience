-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611120001.
--
-- MoM lewat Telegram, tahap 1 (decided 12 Nov 2026, docs/rancangan-mom-telegram.md): one bot
-- (@wam_werkudara_bot) in one Telegram group per department, plus one shared HOD group. Admin WAM
-- → Telegram makes a one-time link; opening it adds the bot to a group (or the admin types the
-- command in a group the bot is already in), and the group is then tied to its department here.
--   * pw_telegram_groups: the groups the bot posts in: which department (or the HOD group), the
--     "MoM" topic when the group has topics, and whether the bot is still in it.
--   * pw_telegram_codes: the one-time install codes, stored hashed, valid for 30 minutes.
-- Sending the real MoM from the notetaker's panel, the members and the send log follow in a later
-- migration. Both tables are read and written only by the server (service role).
-- Before this runs, Admin WAM → Telegram shows the bot and its webhook, and says groups wait for it.
--
-- ROLLBACK (by hand): drop table public.pw_telegram_codes, public.pw_telegram_groups;
begin;

create table if not exists public.pw_telegram_groups (
  chat_id bigint primary key,
  title text not null default '' check (char_length(title) <= 255),
  scope text not null check (scope in ('departemen', 'hod')),
  department text check (department is null or char_length(btrim(department)) between 1 and 150),
  is_forum boolean not null default false,
  mom_topic_id integer,
  bot_status text not null default 'anggota' check (bot_status in ('admin', 'anggota', 'dikeluarkan')),
  active boolean not null default true,
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'departemen') = (department is not null))
);
-- One active group per department, and one active HOD group.
create unique index if not exists pw_telegram_groups_department on public.pw_telegram_groups (lower(btrim(department))) where active and scope = 'departemen';
create unique index if not exists pw_telegram_groups_hod on public.pw_telegram_groups (scope) where active and scope = 'hod';

create table if not exists public.pw_telegram_codes (
  code_hash text primary key check (char_length(code_hash) = 64),
  scope text not null check (scope in ('departemen', 'hod')),
  department text check (department is null or char_length(btrim(department)) between 1 and 150),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_chat_id bigint,
  created_at timestamptz not null default now(),
  check ((scope = 'departemen') = (department is not null))
);
create index if not exists pw_telegram_codes_expires on public.pw_telegram_codes (expires_at);

alter table public.pw_telegram_groups enable row level security;
alter table public.pw_telegram_codes enable row level security;
revoke all on public.pw_telegram_groups, public.pw_telegram_codes from anon, authenticated;
grant select, insert, update, delete on public.pw_telegram_groups, public.pw_telegram_codes to service_role;

commit;
