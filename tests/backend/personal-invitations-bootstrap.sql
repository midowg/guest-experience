-- PostgreSQL-only substitutes for Supabase-owned schemas, for isolated migration tests.
create role anon nologin;
create role authenticated nologin;
-- Supabase gives service_role BYPASSRLS; RLS-enabled tables depend on that.
create role service_role nologin bypassrls;
create schema auth;
create schema storage;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (bucket_id text not null);
