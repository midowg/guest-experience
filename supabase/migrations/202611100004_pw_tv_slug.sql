-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- TV Announcement: a short address per TV (10 Nov 2026). A TV now opens /tv/{slug}, e.g. /tv/lobi,
-- with a slug the admin picks. The address is open on purpose (the owner's decision): whoever
-- knows or guesses it sees the room calendar. TVs made before this keep their long key address;
-- new TVs have no key. Needs 202611100003.
-- ROLLBACK (by hand): alter table public.pw_tv_screens drop column slug; (TVs without a key then
-- have no address: delete them first, then alter column key_hash set not null.)
begin;

alter table public.pw_tv_screens add column slug text;

-- TVs that exist already get a slug from their name ("Lobi Utama" → "lobi-utama"), numbered when two match.
with named as (
  select id, created_at,
    left(regexp_replace(regexp_replace(lower(btrim(name)), '[^a-z0-9]+', '-', 'g'), '^-+|-+$', '', 'g'), 30) as base
  from public.pw_tv_screens
), sized as (
  select id, created_at, case when char_length(base) < 2 then 'tv' || base else base end as base from named
), numbered as (
  select id, base, row_number() over (partition by base order by created_at, id) as n from sized
)
update public.pw_tv_screens screen
set slug = numbered.base || case when numbered.n > 1 then '-' || numbered.n else '' end
from numbered where numbered.id = screen.id;

alter table public.pw_tv_screens alter column slug set not null;
alter table public.pw_tv_screens add constraint pw_tv_screens_slug_key unique (slug);
alter table public.pw_tv_screens add constraint pw_tv_screens_slug_check
  check (char_length(slug) between 2 and 40 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and slug !~ '^tv_');
-- A TV made from now on has only its slug.
alter table public.pw_tv_screens alter column key_hash drop not null;

commit;
