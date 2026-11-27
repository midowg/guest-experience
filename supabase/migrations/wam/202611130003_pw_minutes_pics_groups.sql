-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611130002.
--
-- MoM, 13 Nov 2026:
--   * A follow-up may have more than one PIC: pw_session_minute_actions.pic_ids, in order. pic_id
--     stays (the first PIC), so everything that reads it keeps working; existing rows get their
--     one PIC copied into pic_ids.
--   * The notetaker picks the Telegram groups a MoM goes to: pw_session_minutes.telegram_chats
--     (chat ids). NULL, as for every MoM so far, means the groups of the participants'
--     departments, as before.
-- Only columns are added and one copy is made; nothing is removed or changed otherwise.
--
-- ROLLBACK (by hand):
--   alter table public.pw_session_minute_actions drop column if exists pic_ids;
--   alter table public.pw_session_minutes drop column if exists telegram_chats;
begin;

alter table public.pw_session_minute_actions add column if not exists pic_ids uuid[] not null default '{}';
alter table public.pw_session_minute_actions drop constraint if exists pw_session_minute_actions_pic_ids;
alter table public.pw_session_minute_actions add constraint pw_session_minute_actions_pic_ids check (cardinality(pic_ids) <= 10);
update public.pw_session_minute_actions set pic_ids = array[pic_id] where pic_id is not null and cardinality(pic_ids) = 0;
create index if not exists pw_session_minute_actions_pic_ids on public.pw_session_minute_actions using gin (pic_ids) where not done;

alter table public.pw_session_minutes add column if not exists telegram_chats text[];
alter table public.pw_session_minutes drop constraint if exists pw_session_minutes_telegram_chats;
alter table public.pw_session_minutes add constraint pw_session_minutes_telegram_chats check (telegram_chats is null or cardinality(telegram_chats) <= 40);

commit;
