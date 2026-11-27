-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Pra WAM: "Apa itu WAM?", the short text on Beranda that the super admin writes. One row for
-- the one app; while there is no row the app shows its own default text (built from pw_events).
-- Plain text: the app splits paragraphs and renders them as text, never as HTML. Needs
-- 202611040003. Server only (service role).
begin;

create table public.pw_about (
  id boolean primary key default true check (id),
  title text not null check (char_length(btrim(title)) between 2 and 80),
  summary text not null check (char_length(btrim(summary)) between 10 and 220),
  body text not null check (char_length(btrim(body)) between 20 and 4000),
  -- Up to six short lines, e.g. "Kapan: 4–7 Jan 2027"; each is checked by the app (2 to 120).
  points text[] not null default '{}' check (cardinality(points) <= 6 and char_length(array_to_string(points, '')) <= 720),
  updated_at timestamptz not null default now()
);

alter table public.pw_about enable row level security;
revoke all on public.pw_about from public, anon, authenticated;
grant select, insert, update, delete on public.pw_about to service_role;

commit;
