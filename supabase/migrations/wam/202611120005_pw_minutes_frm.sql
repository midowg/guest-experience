-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611120004.
--
-- MoM seperti form FRM.05.00.00.027 (12 Nov 2026), versi sederhana: everything the paper form asks,
-- written in the app, and the meeting's photos.
--   * pw_session_minutes:
--       number       the MoM's number, shown as MoM/<year>/<month>/<0001> (the meeting's month);
--                    given on the first save, one sequence for every MoM. MoMs saved before this
--                    migration are numbered in the order they were first saved.
--       chair_id     the chairperson (one of the people in the meeting); the notetaker stays
--                    whoever saved first (submitted_by).
--       items        the agenda items, in order: [{"topic", "discussion", "decision", "added"}];
--                    "added" marks a new topic, outside the agenda. A MoM from before keeps its
--                    summary and decisions, read as one item.
--       absent_ids   who of the people in the meeting did not come (everyone else came);
--       guests       others who came and are not on the list (free text).
--       next_*       the next meeting: day, time (HH:MM), place, draft agenda. All optional.
--   * pw_session_minute_photos: the meeting's photos (JPEG, at most 400 KB each, made smaller in the
--     browser), in private R2 storage under pra-wam/mom/<session>/. They go into the PDF.
--   * pw_save_minutes(): one save in one transaction: the MoM, its Kirim MoM and version, and the
--     follow-ups. A follow-up kept from before keeps its done, and when and by whom it was ticked.
-- Read and written only by the server (service role), like the other pw_* tables.
--
-- ROLLBACK (by hand):
--   drop function if exists public.pw_save_minutes(uuid, uuid, timestamptz, boolean, jsonb, jsonb);
--   drop table if exists public.pw_session_minute_photos;
--   alter table public.pw_session_minutes drop constraint if exists pw_session_minutes_body;
--   alter table public.pw_session_minutes drop column if exists number, drop column if exists chair_id,
--     drop column if exists items, drop column if exists absent_ids, drop column if exists guests,
--     drop column if exists next_date, drop column if exists next_time, drop column if exists next_place,
--     drop column if exists next_agenda;
--   drop sequence if exists public.pw_minutes_number_seq;
--   (the old check "summary or decisions" is not put back: MoMs written with items only would break it)
begin;

alter table public.pw_session_minutes add column if not exists number integer;
alter table public.pw_session_minutes add column if not exists chair_id uuid references public.employees (id) on delete set null;
alter table public.pw_session_minutes add column if not exists items jsonb not null default '[]'::jsonb;
alter table public.pw_session_minutes add column if not exists absent_ids uuid[] not null default '{}';
alter table public.pw_session_minutes add column if not exists guests text not null default '';
alter table public.pw_session_minutes add column if not exists next_date date;
alter table public.pw_session_minutes add column if not exists next_time text;
alter table public.pw_session_minutes add column if not exists next_place text not null default '';
alter table public.pw_session_minutes add column if not exists next_agenda text not null default '';

alter table public.pw_session_minutes drop constraint if exists pw_session_minutes_shape;
alter table public.pw_session_minutes add constraint pw_session_minutes_shape check (
  jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 20
  and cardinality(absent_ids) <= 300
  and char_length(guests) <= 500
  and (next_time is null or next_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
  and char_length(next_place) <= 200
  and char_length(next_agenda) <= 2000
);

-- A MoM now may be agenda items only: the old "summary or decisions" check becomes "something".
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.pw_session_minutes'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%btrim(summary)%'
  loop
    execute format('alter table public.pw_session_minutes drop constraint %I', c);
  end loop;
end $$;
alter table public.pw_session_minutes add constraint pw_session_minutes_body check (
  jsonb_array_length(items) > 0 or char_length(btrim(summary)) >= 2 or char_length(btrim(decisions)) >= 2
);

-- Numbers: the MoMs there are, in the order they were first saved; the sequence goes on after them.
create sequence if not exists public.pw_minutes_number_seq;
with ordered as (
  select session_id, row_number() over (order by submitted_at, session_id) as n
  from public.pw_session_minutes where number is null
), top as (select coalesce(max(number), 0) as max from public.pw_session_minutes)
update public.pw_session_minutes m set number = top.max + ordered.n from ordered, top where m.session_id = ordered.session_id;
select setval('public.pw_minutes_number_seq', coalesce(max(number), 0) + 1, false) from public.pw_session_minutes;
create unique index if not exists pw_session_minutes_number on public.pw_session_minutes (number);

create table if not exists public.pw_session_minute_photos (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.pw_sessions (id) on delete cascade,
  file_key text not null unique check (file_key ~ '^pra-wam/mom/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  size integer not null check (size between 1 and 409600),
  width integer check (width is null or width between 1 and 4000),
  height integer check (height is null or height between 1 and 4000),
  uploaded_by uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists pw_session_minute_photos_session on public.pw_session_minute_photos (session_id, created_at);
alter table public.pw_session_minute_photos enable row level security;
revoke all on public.pw_session_minute_photos from anon, authenticated;
grant select, insert, update, delete on public.pw_session_minute_photos to service_role;

/*
 * One save: p_minutes holds items, chair_id, absent_ids, guests, next_date, next_time, next_place,
 * next_agenda and telegram_off; p_actions the follow-ups in order: {"id"?, "task", "pic_id", "due_date"}.
 * p_send sends a draft. Once sent, every save is a new version. A follow-up whose id is one of this
 * MoM's keeps its done; one left out is removed; one without (or with a strange) id is new.
 * Returns whether this save sent it, the version, and the number.
 */
create or replace function public.pw_save_minutes(
  p_session uuid, p_member uuid, p_at timestamptz, p_send boolean, p_minutes jsonb, p_actions jsonb
) returns table (sent_now boolean, version integer, number integer)
language plpgsql security invoker set search_path = public as $$
#variable_conflict use_column
declare
  v_row public.pw_session_minutes%rowtype;
  v_sent_now boolean := false;
  v_given jsonb;
  v_absent uuid[] := coalesce((select array_agg(value::uuid) from jsonb_array_elements_text(coalesce(p_minutes->'absent_ids', '[]'::jsonb))), '{}');
begin
  select * into v_row from public.pw_session_minutes m where m.session_id = p_session for update;
  if not found then
    v_sent_now := p_send;
    insert into public.pw_session_minutes as m (
      session_id, summary, decisions, items, chair_id, absent_ids, guests, next_date, next_time, next_place, next_agenda, telegram_off,
      submitted_by, submitted_at, updated_by, updated_at, sent_at, sent_by, version, number
    ) values (
      p_session, '', '', coalesce(p_minutes->'items', '[]'::jsonb), nullif(p_minutes->>'chair_id', '')::uuid, v_absent,
      coalesce(p_minutes->>'guests', ''), nullif(p_minutes->>'next_date', '')::date, nullif(p_minutes->>'next_time', ''),
      coalesce(p_minutes->>'next_place', ''), coalesce(p_minutes->>'next_agenda', ''), coalesce((p_minutes->>'telegram_off')::boolean, false),
      p_member, p_at, p_member, p_at,
      case when p_send then p_at end, case when p_send then p_member end, case when p_send then 1 else 0 end,
      nextval('public.pw_minutes_number_seq')
    ) returning * into v_row;
  else
    v_sent_now := v_row.sent_at is null and p_send;
    update public.pw_session_minutes m set
      summary = '', decisions = '',
      items = coalesce(p_minutes->'items', '[]'::jsonb), chair_id = nullif(p_minutes->>'chair_id', '')::uuid, absent_ids = v_absent,
      guests = coalesce(p_minutes->>'guests', ''), next_date = nullif(p_minutes->>'next_date', '')::date, next_time = nullif(p_minutes->>'next_time', ''),
      next_place = coalesce(p_minutes->>'next_place', ''), next_agenda = coalesce(p_minutes->>'next_agenda', ''),
      telegram_off = coalesce((p_minutes->>'telegram_off')::boolean, false),
      updated_by = p_member, updated_at = p_at,
      sent_at = case when v_sent_now then p_at else m.sent_at end,
      sent_by = case when v_sent_now then p_member else m.sent_by end,
      version = case when v_sent_now then 1 when m.sent_at is not null then m.version + 1 else m.version end,
      number = coalesce(m.number, nextval('public.pw_minutes_number_seq'))
    where m.session_id = p_session
    returning * into v_row;
  end if;

  -- The follow-ups given, in order, with the id only when it is one of this MoM's.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', coalesce(old.id, gen_random_uuid()), 'kept', old.id is not null, 'sort_order', given.ord - 1,
    'task', btrim(given.value->>'task'), 'pic_id', nullif(given.value->>'pic_id', ''), 'due_date', nullif(given.value->>'due_date', '')
  ) order by given.ord), '[]'::jsonb) into v_given
  from jsonb_array_elements(coalesce(p_actions, '[]'::jsonb)) with ordinality as given(value, ord)
  left join public.pw_session_minute_actions old on old.session_id = p_session and old.id::text = given.value->>'id';

  delete from public.pw_session_minute_actions a
  where a.session_id = p_session
    and not exists (select 1 from jsonb_to_recordset(v_given) as g(id uuid, kept boolean) where g.kept and g.id = a.id);
  update public.pw_session_minute_actions a set sort_order = g.sort_order, task = g.task, pic_id = g.pic_id, due_date = g.due_date
  from jsonb_to_recordset(v_given) as g(id uuid, kept boolean, sort_order integer, task text, pic_id uuid, due_date date)
  where g.kept and a.id = g.id and a.session_id = p_session;
  insert into public.pw_session_minute_actions (id, session_id, sort_order, task, pic_id, due_date, done)
  select g.id, p_session, g.sort_order, g.task, g.pic_id, g.due_date, false
  from jsonb_to_recordset(v_given) as g(id uuid, kept boolean, sort_order integer, task text, pic_id uuid, due_date date)
  where not g.kept;

  return query select v_sent_now, v_row.version, v_row.number;
end $$;

revoke all on function public.pw_save_minutes(uuid, uuid, timestamptz, boolean, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.pw_save_minutes(uuid, uuid, timestamptz, boolean, jsonb, jsonb) to service_role;

commit;
