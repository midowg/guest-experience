-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611130007.
--
-- Fixes the login names 202611130007 gave the accounts that existed then: Postgres rpad(text, 2)
-- also cuts a longer text to 2 characters, so "adinda" became "ad" (and "ad2" for the second).
-- Each such account gets its full nama panggilan back ("adinda"; a second Adinda "adinda2"),
-- the way the app makes them for new accounts. Accounts made by the app since are already right
-- and keep theirs. Nothing else changes.
--
-- ROLLBACK: none needed; the cut names never worked as intended.
begin;

do $$
declare
  person record;
  wanted text;
  n int;
begin
  -- The accounts whose name is the first 2 letters of a longer nama panggilan (plus a number).
  create temporary table cut_names on commit drop as
  select a.employee_id, e.full_name, s.slug
    from public.pw_accounts a
    join public.employees e on e.id = a.employee_id
    cross join lateral (
      select coalesce(nullif(left(regexp_replace(lower(coalesce(nullif(btrim(e.nickname), ''), split_part(btrim(e.full_name), ' ', 1))), '[^a-z0-9]', '', 'g'), 30), ''), 'pengguna') as raw
    ) r
    cross join lateral (select case when length(r.raw) < 2 then r.raw || 'x' else r.raw end as slug) s
   where length(s.slug) > 2
     and a.login_name ~ ('^' || left(s.slug, 2) || '[0-9]*$');

  -- Free them first, so they do not block each other.
  update public.pw_accounts set login_name = null where employee_id in (select employee_id from cut_names);

  for person in select * from cut_names order by slug, full_name, employee_id loop
    wanted := person.slug;
    n := 2;
    while exists (select 1 from public.pw_accounts where login_name = wanted) loop
      wanted := person.slug || n;
      n := n + 1;
    end loop;
    update public.pw_accounts set login_name = wanted where employee_id = person.employee_id;
  end loop;
end $$;

commit;
