-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- TV Announcement (11 Nov 2026): birthday greetings, after the team's own card ("WG Bday").
--   'ultah': title = the person's name, body = the wish, slide_id = their photo (optional),
--            extra = {"call": what the greeting calls them, "date": their birthday (YYYY-MM-DD)}.
-- A row of this kind may have a picture (its photo); until now only 'gambar' rows had one.
-- Needs 202611100010 (this replaces its list of kinds). Before this one a greeting cannot be added.
-- ROLLBACK (by hand): delete from public.pw_tv_items where kind = 'ultah';
--   alter table public.pw_tv_items drop constraint pw_tv_items_kind_check, drop constraint pw_tv_items_picture_check, drop column extra;
--   alter table public.pw_tv_items add constraint pw_tv_items_kind_check
--     check (kind in ('kalender_hari', 'kalender_minggu', 'timeline', 'pengumuman', 'sambutan', 'tamu', 'teks', 'video', 'gambar'));
--   alter table public.pw_tv_items add constraint pw_tv_items_check check ((kind = 'gambar') = (slide_id is not null));
begin;

alter table public.pw_tv_items drop constraint pw_tv_items_kind_check;
alter table public.pw_tv_items add constraint pw_tv_items_kind_check
  check (kind in ('kalender_hari', 'kalender_minggu', 'timeline', 'pengumuman', 'sambutan', 'tamu', 'ultah', 'teks', 'video', 'gambar'));

-- "A picture row has a picture, no other row has one" becomes: a picture row has one, a birthday
-- greeting may have one, no other row has one. The old rule was made without a name, so it is
-- found by what it says.
do $$
declare old_rule text;
begin
  select conname into old_rule from pg_constraint
  where conrelid = 'public.pw_tv_items'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%slide_id IS NOT NULL%';
  if old_rule is not null then execute format('alter table public.pw_tv_items drop constraint %I', old_rule); end if;
end $$;
alter table public.pw_tv_items add constraint pw_tv_items_picture_check
  check (case kind when 'gambar' then slide_id is not null when 'ultah' then true else slide_id is null end);

alter table public.pw_tv_items add column extra jsonb not null default '{}';

commit;
