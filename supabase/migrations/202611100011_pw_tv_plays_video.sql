-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- TV Announcement (11 Nov 2026): a TV can be told not to play videos. An old or slow TV then passes
-- over every 'video' row of the playlist (a YouTube video or an uploaded file) and plays the rest.
-- The one address for all (/tv) has no TV to set this on, so it always plays videos.
-- Before this one every TV plays videos. (An uploaded video file needs no column: its row's body
-- keeps its place in storage, 'pra-wam/tv/video-…'.)
-- ROLLBACK (by hand): alter table public.pw_tv_screens drop column plays_video;
begin;

alter table public.pw_tv_screens add column plays_video boolean not null default true;

commit;
