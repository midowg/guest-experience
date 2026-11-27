-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- TV Announcement (11 Nov 2026): a welcome's design is picked per playlist row.
--   'werkudara': the office's welcome sign (the blue one with the logo and WELCOME, taken from
--                "Welcome Sign Template.pptx"), the guest's name in its empty middle. The default.
--   'foto':      the visit's cover photo, darkened, behind the words.
--   'polos':     the board's own colours.
-- Only rows of kind 'sambutan' and 'tamu' use it. Needs 202611100008.
-- Before this one every welcome is drawn as 'werkudara' and the choice in Admin TV says it waits.
-- ROLLBACK (by hand): alter table public.pw_tv_items drop column design;
begin;

alter table public.pw_tv_items
  add column design text not null default 'werkudara' check (design in ('werkudara', 'foto', 'polos'));

commit;
