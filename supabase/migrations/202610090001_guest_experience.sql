-- LOCAL REVIEW ONLY. Requires separate authorization before applying to any remote database.
-- Initial schema for a dedicated project. No remote users, memberships or published seed are created.
begin;

create table public.admin_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create function public.is_event_admin() returns boolean language sql stable security definer
set search_path = '' as $$ select exists(select 1 from public.admin_members where user_id = auth.uid()) $$;
revoke all on function public.is_event_admin() from public;
grant execute on function public.is_event_admin() to anon, authenticated;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (length(slug) between 1 and 100 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status text not null default 'draft' check(status in ('draft','published','archived')),
  content jsonb not null check(jsonb_typeof(content) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.event_agenda_items (
  id uuid primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check(ends_at > starts_at),
  title text not null check(length(title) between 1 and 200),
  description text not null default '' check(length(description) <= 1500),
  sort_order integer not null check(sort_order between 0 and 1000),
  unique(event_id,id)
);
create table public.feedback_questions (
  id uuid primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null check(length(label) between 1 and 500),
  kind text not null check(kind in ('rating','choice','text')),
  required boolean not null default false,
  options jsonb not null default '[]' check(jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 20),
  sort_order integer not null check(sort_order between 0 and 1000),
  unique(event_id,id)
);
create table public.rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check(length(name) between 2 and 150),
  organization text not null check(length(organization) between 1 and 200),
  attendance text not null check(attendance in ('yes','no')),
  phone text not null default '' check(length(phone) <= 30),
  email text not null default '' check(length(email) <= 254),
  has_allergy boolean not null default false,
  allergy_details text not null default '' check(length(allergy_details) <= 1000),
  consent_at timestamptz not null default now(),
  idempotency_key uuid not null,
  request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique(event_id,idempotency_key),
  check((attendance = 'yes' and has_allergy and length(allergy_details) > 0) or (not has_allergy and allergy_details = ''))
);
create index rsvps_event_created on public.rsvps(event_id,created_at desc,id);
create table public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  idempotency_key uuid not null,
  request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique(event_id,idempotency_key),
  unique(event_id,id)
);
create index feedback_event_created on public.feedback_submissions(event_id,created_at desc,id);
create table public.feedback_answers (
  submission_id uuid not null,
  event_id uuid not null,
  question_id uuid not null,
  value text not null check(length(value) <= 3000),
  primary key(submission_id,question_id),
  foreign key(event_id,submission_id) references public.feedback_submissions(event_id,id) on delete cascade,
  foreign key(event_id,question_id) references public.feedback_questions(event_id,id) on delete restrict
);
create table public.event_audit (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check(action in ('create','publish','archive','draft','delete_rsvp','delete_feedback')),
  subject_id uuid,
  created_at timestamptz not null default now()
);
create table public.request_limits (
  key_hash text primary key check(key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  hits integer not null check(hits > 0),
  expires_at timestamptz not null
);
create index request_limits_expiry on public.request_limits(expires_at);

alter table public.admin_members enable row level security;
alter table public.events enable row level security;
alter table public.event_agenda_items enable row level security;
alter table public.feedback_questions enable row level security;
alter table public.rsvps enable row level security;
alter table public.feedback_submissions enable row level security;
alter table public.feedback_answers enable row level security;
alter table public.event_audit enable row level security;
alter table public.request_limits enable row level security;

create policy member_self on public.admin_members for select to authenticated using(user_id = auth.uid());
create policy event_read on public.events for select to anon,authenticated using(status = 'published' or public.is_event_admin());
create policy agenda_read on public.event_agenda_items for select to anon,authenticated using(exists(select 1 from public.events e where e.id = event_id and (e.status = 'published' or public.is_event_admin())));
create policy question_read on public.feedback_questions for select to anon,authenticated using(exists(select 1 from public.events e where e.id = event_id and (e.status = 'published' or public.is_event_admin())));
create policy rsvp_admin on public.rsvps for select to authenticated using(public.is_event_admin());
create policy submission_admin on public.feedback_submissions for select to authenticated using(public.is_event_admin());
create policy answer_admin on public.feedback_answers for select to authenticated using(public.is_event_admin());
create policy audit_admin on public.event_audit for select to authenticated using(public.is_event_admin());
-- No client write policies. Only explicitly granted, guarded transaction functions write.
revoke all on public.admin_members, public.events, public.event_agenda_items, public.feedback_questions, public.rsvps, public.feedback_submissions, public.feedback_answers, public.event_audit, public.request_limits from anon,authenticated;
grant select on public.events,public.event_agenda_items,public.feedback_questions to anon,authenticated;
grant select on public.admin_members,public.rsvps,public.feedback_submissions,public.feedback_answers,public.event_audit to authenticated;
grant all on public.admin_members,public.events,public.event_agenda_items,public.feedback_questions,public.rsvps,public.feedback_submissions,public.feedback_answers,public.event_audit,public.request_limits to service_role;

create view public.event_documents with (security_invoker = true) as
select e.id,e.slug,e.status,e.updated_at,
  e.content || jsonb_build_object('id',e.id,'slug',e.slug,'status',e.status,'created_at',e.created_at,'updated_at',e.updated_at,
    'agenda',coalesce((select jsonb_agg(to_jsonb(a)-'event_id' order by a.sort_order,a.id) from public.event_agenda_items a where a.event_id=e.id),'[]'::jsonb),
    'feedback_questions',coalesce((select jsonb_agg(to_jsonb(q)-'event_id' order by q.sort_order,q.id) from public.feedback_questions q where q.event_id=e.id),'[]'::jsonb)) as document
from public.events e;
grant select on public.event_documents to anon,authenticated,service_role;

create function public.save_event(p_id uuid,p_document jsonb,p_create boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare old_status text; old_questions jsonb; new_questions jsonb; item jsonb; result jsonb;
begin
  if not public.is_event_admin() then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(p_document) is distinct from 'object'
    or p_document->>'status' not in ('draft','published','archived')
    or coalesce(length(p_document->>'title'),0) not between 1 and 180
    or p_document->>'timezone' is distinct from 'Asia/Jakarta'
    or p_document->>'starts_at' is null
    or jsonb_typeof(p_document->'agenda') is distinct from 'array'
    or jsonb_typeof(p_document->'feedback_questions') is distinct from 'array'
    or jsonb_array_length(p_document->'agenda') > 100
    or jsonb_array_length(p_document->'feedback_questions') > 30
    or octet_length(p_document::text) > 200000
  then raise exception 'INVALID_EVENT'; end if;
  if p_document->>'ends_at' is not null and (p_document->>'ends_at')::timestamptz <= (p_document->>'starts_at')::timestamptz then raise exception 'INVALID_EVENT'; end if;
  -- Publication invariants enforced inside the transaction, not only by the UI/API.
  if p_document->>'status' = 'published' then
    if coalesce(length(btrim(p_document->>'organizer')),0)=0 or coalesce(length(btrim(p_document->>'introduction')),0)=0
      or coalesce(length(btrim(p_document->>'venue_name')),0)=0 or coalesce(length(btrim(p_document->>'address')),0)=0
      or coalesce(p_document->>'location_url','') !~ '^https://[^/[:space:]]+'
      or ((p_document->>'feedback_enabled')::boolean and jsonb_array_length(p_document->'feedback_questions')=0)
      or ((p_document->>'review_enabled')::boolean and coalesce(p_document->>'review_url','') !~ '^https://[^/[:space:]]+')
    then raise exception 'INVALID_EVENT'; end if;
  end if;
  if p_create then
    if p_document->>'status' <> 'draft' then raise exception 'INVALID_EVENT'; end if;
    insert into public.events(id,slug,status,content) values(p_id,p_document->>'slug','draft','{}');
  end if;
  select status into old_status from public.events where id=p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  -- All submissions lock this same event. Question-set immutability has no race window.
  select coalesce(jsonb_agg(to_jsonb(q)-'event_id' order by q.id),'[]'::jsonb) into old_questions from public.feedback_questions q where event_id=p_id;
  select coalesce(jsonb_agg(value order by value->>'id'),'[]'::jsonb) into new_questions from jsonb_array_elements(p_document->'feedback_questions');
  if exists(select 1 from public.feedback_submissions where event_id=p_id) and old_questions is distinct from new_questions then raise exception 'QUESTIONS_LOCKED'; end if;
  update public.events set slug=p_document->>'slug',status=p_document->>'status',
    content=p_document - array['id','slug','status','created_at','updated_at','agenda','feedback_questions'],updated_at=clock_timestamp() where id=p_id;
  delete from public.event_agenda_items where event_id=p_id;
  for item in select value from jsonb_array_elements(p_document->'agenda') loop
    insert into public.event_agenda_items(id,event_id,starts_at,ends_at,title,description,sort_order)
      values((item->>'id')::uuid,p_id,(item->>'starts_at')::timestamptz,(item->>'ends_at')::timestamptz,item->>'title',item->>'description',(item->>'sort_order')::integer);
  end loop;
  if not exists(select 1 from public.feedback_submissions where event_id=p_id) then
    delete from public.feedback_questions where event_id=p_id;
    for item in select value from jsonb_array_elements(p_document->'feedback_questions') loop
      if item->>'kind' = 'choice' and (jsonb_array_length(item->'options') < 2 or
        (select count(*) from jsonb_array_elements(item->'options')) <> (select count(distinct value) from jsonb_array_elements(item->'options'))) then raise exception 'INVALID_EVENT'; end if;
      insert into public.feedback_questions(id,event_id,label,kind,required,options,sort_order)
        values((item->>'id')::uuid,p_id,item->>'label',item->>'kind',(item->>'required')::boolean,item->'options',(item->>'sort_order')::integer);
    end loop;
  end if;
  if p_create or old_status is distinct from p_document->>'status' then
    insert into public.event_audit(event_id,actor_id,action) values(p_id,auth.uid(),case when p_create then 'create' when p_document->>'status'='published' then 'publish' when p_document->>'status'='archived' then 'archive' else 'draft' end);
  end if;
  select document into result from public.event_documents where id=p_id;
  return result;
end $$;
revoke all on function public.save_event(uuid,jsonb,boolean) from public,anon;
grant execute on function public.save_event(uuid,jsonb,boolean) to authenticated;

create function public.consume_rate_limit(p_key text,p_limit integer,p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
-- `current_time` is a reserved SQL function name; shadowing it breaks the comparisons below.
declare current_hits integer; bucket timestamptz; now_ts timestamptz := clock_timestamp();
begin
  if p_limit not between 1 and 1000 or p_window_seconds not between 60 and 3600 then raise exception 'INVALID_LIMIT'; end if;
  bucket := to_timestamp(floor(extract(epoch from now_ts) / p_window_seconds) * p_window_seconds);
  -- Opportunistic deletion is additional to the scheduled housekeeping function below.
  delete from public.request_limits where expires_at < now_ts;
  insert into public.request_limits(key_hash,window_start,hits,expires_at) values(p_key,bucket,1,bucket+make_interval(secs=>p_window_seconds*2))
    on conflict(key_hash) do update set
      hits=case when public.request_limits.window_start=excluded.window_start then least(public.request_limits.hits+1,p_limit+1) else 1 end,
      window_start=excluded.window_start,expires_at=excluded.expires_at
    returning hits into current_hits;
  return current_hits <= p_limit;
end $$;
revoke all on function public.consume_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_rate_limit(text,integer,integer) to service_role;

create function public.submit_rsvp(p_slug text,p_payload jsonb,p_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare e public.events; existing public.rsvps; result uuid;
begin
  select * into e from public.events where slug=p_slug for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into existing from public.rsvps where event_id=e.id and idempotency_key=(p_payload->>'idempotency_key')::uuid;
  if found then
    if existing.request_hash <> p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return existing.id;
  end if;
  if e.status <> 'published' or (e.content->>'rsvp_enabled')::boolean is distinct from true
    or not exists(select 1 from jsonb_array_elements(e.content->'sections') s where s->>'key'='rsvp' and (s->>'enabled')::boolean)
    or ((e.content->>'rsvp_closes_at')::timestamptz is not null and clock_timestamp() >= (e.content->>'rsvp_closes_at')::timestamptz)
  then raise exception 'EVENT_CLOSED'; end if;
  if p_payload->>'website' is distinct from '' or (p_payload->>'consent')::boolean is distinct from true then raise exception 'INVALID_ANSWERS'; end if;
  insert into public.rsvps(event_id,name,organization,attendance,phone,email,has_allergy,allergy_details,idempotency_key,request_hash)
    values(e.id,p_payload->>'name',p_payload->>'organization',p_payload->>'attendance',p_payload->>'phone',p_payload->>'email',
      (p_payload->>'has_allergy')::boolean,p_payload->>'allergy_details',(p_payload->>'idempotency_key')::uuid,p_hash)
    returning id into result;
  return result;
end $$;
revoke all on function public.submit_rsvp(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.submit_rsvp(text,jsonb,text) to service_role;

create function public.submit_feedback(p_slug text,p_payload jsonb,p_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare e public.events; existing public.feedback_submissions; q public.feedback_questions; answer jsonb; result uuid; answer_count integer;
begin
  select * into e from public.events where slug=p_slug for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into existing from public.feedback_submissions where event_id=e.id and idempotency_key=(p_payload->>'idempotency_key')::uuid;
  if found then
    if existing.request_hash <> p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return existing.id;
  end if;
  if e.status <> 'published' or (e.content->>'feedback_enabled')::boolean is distinct from true
    or not exists(select 1 from jsonb_array_elements(e.content->'sections') s where s->>'key'='feedback' and (s->>'enabled')::boolean)
    or ((e.content->>'feedback_opens_at')::timestamptz is not null and clock_timestamp() < (e.content->>'feedback_opens_at')::timestamptz)
    or not exists(select 1 from public.feedback_questions where event_id=e.id)
  then raise exception 'EVENT_CLOSED'; end if;
  if p_payload->>'website' is distinct from '' or jsonb_typeof(p_payload->'answers') is distinct from 'array' or jsonb_array_length(p_payload->'answers') > 30 then raise exception 'INVALID_ANSWERS'; end if;
  if (select count(*) from jsonb_array_elements(p_payload->'answers')) <> (select count(distinct value->>'question_id') from jsonb_array_elements(p_payload->'answers')) then raise exception 'INVALID_ANSWERS'; end if;
  for q in select * from public.feedback_questions where event_id=e.id loop
    select count(*) into answer_count from jsonb_array_elements(p_payload->'answers') a where a->>'question_id'=q.id::text and length(btrim(a->>'value')) > 0;
    if q.required and answer_count<>1 then raise exception 'INVALID_ANSWERS'; end if;
  end loop;
  for answer in select value from jsonb_array_elements(p_payload->'answers') loop
    select * into q from public.feedback_questions where event_id=e.id and id=(answer->>'question_id')::uuid;
    if not found or jsonb_typeof(answer->'value') is distinct from 'string' or length(answer->>'value')>3000 then raise exception 'INVALID_ANSWERS'; end if;
    if length(btrim(answer->>'value'))>0 then
      if q.kind='rating' and answer->>'value' !~ '^[1-5]$' then raise exception 'INVALID_ANSWERS'; end if;
      if q.kind='choice' and not (q.options ? (answer->>'value')) then raise exception 'INVALID_ANSWERS'; end if;
    end if;
  end loop;
  insert into public.feedback_submissions(event_id,idempotency_key,request_hash) values(e.id,(p_payload->>'idempotency_key')::uuid,p_hash) returning id into result;
  insert into public.feedback_answers(submission_id,event_id,question_id,value)
    select result,e.id,(a->>'question_id')::uuid,a->>'value' from jsonb_array_elements(p_payload->'answers') a;
  return result;
end $$;
revoke all on function public.submit_feedback(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.submit_feedback(text,jsonb,text) to service_role;

create function public.delete_event_response(p_event uuid,p_response uuid,p_kind text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if not public.is_event_admin() then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.events where id=p_event for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_kind='rsvp' then
    delete from public.rsvps where id=p_response and event_id=p_event;
  elsif p_kind='feedback' then
    delete from public.feedback_submissions where id=p_response and event_id=p_event;
  else raise exception 'INVALID_ANSWERS'; end if;
  get diagnostics affected = row_count;
  if affected=0 then raise exception 'NOT_FOUND'; end if;
  insert into public.event_audit(event_id,actor_id,action,subject_id) values(p_event,auth.uid(),'delete_'||p_kind,p_response);
  return true;
end $$;
revoke all on function public.delete_event_response(uuid,uuid,text) from public,anon;
grant execute on function public.delete_event_response(uuid,uuid,text) to authenticated;

-- Run through an explicitly approved scheduler daily; no extension/scheduler is installed here.
create function public.purge_expired_request_limits() returns void language sql security definer set search_path = '' as $$ delete from public.request_limits where expires_at < clock_timestamp() $$;
revoke all on function public.purge_expired_request_limits() from public,anon,authenticated;
grant execute on function public.purge_expired_request_limits() to service_role;

-- Storage upload intentionally not enabled. No buckets or broad storage policies are created.
commit;
