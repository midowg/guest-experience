-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611240001.
--
-- Refleksi Leader (19 Nov 2026): the reflection Werkudara's leaders write before the Leadership Reset
-- training ("Comeback in Last Minute", Coach ARZ), at /refleksi. No sign-in anywhere:
--   * a leader types their name and team; their answer is found again by a key only they hold
--     (kept here as its sha256), so they can read and change it while the form is open;
--   * the small CMS (/refleksi/kelola/<key>) opens by its own key: the form's text and
--     questions, open or closed, and who has answered (never what they wrote);
--   * the coach reads every answer at /refleksi/coach/<key>, a key the CMS makes.
-- Only the server (service_role) reads or writes these tables.
--
-- AFTER RUNNING: the result grid shows one row, "tautan_cms": the CMS link. It is shown this once
-- (only its sha256 is kept); save it. Lost it? Run the snippet at the bottom for a new one.
--
-- ROLLBACK (by hand): drop table public.lr_responses; drop table public.lr_form;
begin;

create table if not exists public.lr_form (
  id smallint primary key default 1 check (id = 1),
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  is_open boolean not null default true,
  admin_key_hash text not null check (admin_key_hash ~ '^[0-9a-f]{64}$'),
  coach_key_hash text check (coach_key_hash ~ '^[0-9a-f]{64}$'),
  coach_key_at timestamptz,
  coach_seen_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.lr_responses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  team text not null check (length(btrim(team)) between 2 and 120),
  target_status text not null check (target_status in ('tercapai', 'sebagian', 'belum')),
  answers jsonb not null check (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) <= 8),
  own_key_hash text not null unique check (own_key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lr_responses_created_idx on public.lr_responses (created_at desc);

alter table public.lr_form enable row level security;
alter table public.lr_responses enable row level security;
revoke all on table public.lr_form, public.lr_responses from public, anon, authenticated;
grant select, insert, update, delete on table public.lr_form, public.lr_responses to service_role;

commit;

-- The first CMS link: made here, shown once in the result grid, kept only as its sha256.
with k as (select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') as key),
     made as (
       insert into public.lr_form (id, admin_key_hash)
       select 1, encode(sha256(convert_to(k.key, 'UTF8')), 'hex') from k
       on conflict (id) do nothing
       returning id
     )
select 'https://journey.werkudara.group/refleksi/kelola/' || k.key as tautan_cms from k where exists (select 1 from made);

-- CMS link lost? This makes a new one (the old one stops working) and shows it once:
-- with k as (select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') as key),
--      changed as (update public.lr_form set admin_key_hash = encode(sha256(convert_to(k.key, 'UTF8')), 'hex'), updated_at = now() from k where id = 1 returning id)
-- select 'https://journey.werkudara.group/refleksi/kelola/' || k.key as tautan_cms from k where exists (select 1 from changed);
