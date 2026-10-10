-- Minimal stand-ins so the Supabase migration can be exercised on a plain PostgreSQL
-- instance. Test-only: this file is never applied to a real project.
create schema if not exists auth;
create table auth.users (id uuid primary key, email text);

-- Swappable current user, so policies can be checked as anonymous, member and admin.
create table public._test_identity (id uuid);
insert into public._test_identity values (null);
create function auth.uid() returns uuid language sql stable as $$ select id from public._test_identity limit 1 $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
