-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611120004.
--
-- MoM untuk BOD lewat CoS (decided 13 Nov 2026): the MoM of a meeting with a BOD member also goes
-- to the Chief of Staff's own chat with the bot, and the CoS forwards it to the BOD. Admin WAM →
-- Telegram makes a one-time link; the CoS opens it and presses Start, and that chat is kept here
-- as the one active row with scope 'cos' (no department, no topic).
-- Only the scope checks change; existing rows and codes are untouched.
--
-- ROLLBACK (by hand, after removing any 'cos' rows):
--   alter table public.pw_telegram_groups drop constraint pw_telegram_groups_scope_check,
--     add constraint pw_telegram_groups_scope_check check (scope in ('departemen', 'hod'));
--   alter table public.pw_telegram_codes drop constraint pw_telegram_codes_scope_check,
--     add constraint pw_telegram_codes_scope_check check (scope in ('departemen', 'hod'));
--   drop index if exists public.pw_telegram_groups_cos;
begin;

alter table public.pw_telegram_groups drop constraint if exists pw_telegram_groups_scope_check;
alter table public.pw_telegram_groups add constraint pw_telegram_groups_scope_check check (scope in ('departemen', 'hod', 'cos'));
alter table public.pw_telegram_codes drop constraint if exists pw_telegram_codes_scope_check;
alter table public.pw_telegram_codes add constraint pw_telegram_codes_scope_check check (scope in ('departemen', 'hod', 'cos'));

-- One active CoS chat.
create unique index if not exists pw_telegram_groups_cos on public.pw_telegram_groups (scope) where active and scope = 'cos';

commit;
