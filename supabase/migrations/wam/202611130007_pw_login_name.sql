-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611130006.
--
-- Masuk dengan nama panggilan (decided 13 Nov 2026): everyone may sign in with their email or with
-- a login name made from their nama panggilan ("dewi"; a second Dewi is "dewi2"). Interns and daily
-- workers without an email get an account through it; their password is reset by the admin.
--   * pw_accounts.login_name: lowercase letters and digits (a dot allowed inside), unique.
--   * Every existing account gets one now, from the nama panggilan (else the first name), in
--     order of the full name when two share it. Nothing else changes.
--
-- ROLLBACK (by hand): drop index if exists public.pw_accounts_login_name;
--   alter table public.pw_accounts drop column if exists login_name;
begin;

alter table public.pw_accounts add column if not exists login_name text;
alter table public.pw_accounts drop constraint if exists pw_accounts_login_name_shape;
alter table public.pw_accounts add constraint pw_accounts_login_name_shape check (login_name is null or login_name ~ '^[a-z0-9][a-z0-9.]{1,39}$');
create unique index if not exists pw_accounts_login_name on public.pw_accounts (login_name) where login_name is not null;

-- The existing accounts: the nama panggilan, letters and digits only (at least two), then a number
-- for the second and on.
with base as (
  select a.employee_id, e.full_name,
    rpad(coalesce(nullif(left(regexp_replace(lower(coalesce(nullif(btrim(e.nickname), ''), split_part(btrim(e.full_name), ' ', 1))), '[^a-z0-9]', '', 'g'), 30), ''), 'pengguna'), 2, 'x') as slug
  from public.pw_accounts a join public.employees e on e.id = a.employee_id
  where a.login_name is null
), named as (
  select employee_id, slug || case when row_number() over (partition by slug order by full_name, employee_id) > 1
    then (row_number() over (partition by slug order by full_name, employee_id))::text else '' end as login_name
  from base
)
update public.pw_accounts a set login_name = named.login_name
from named
where a.employee_id = named.employee_id
  and not exists (select 1 from public.pw_accounts other where other.login_name = named.login_name);

commit;
