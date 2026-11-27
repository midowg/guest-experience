-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- CSR donations (event_kind 'csr', src/lib/donations.ts): people give money or goods on the event
-- page, the committee marks each one received or rejected, and later tells every donor by
-- WhatsApp that the help was handed over. Money is paid by hand (transfer or QRIS shown on the
-- page); a proof of transfer goes to the private bucket bukti-donasi. The table is server only:
-- the public page reads totals and the donor list the server computes from received rows.
-- save_event: a CSR page publishes without a place (organiser and introduction are still asked).
begin;

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  item_key text not null default '' check (item_key ~ '^[a-z0-9-]{0,40}$'),
  item_label text not null check (char_length(btrim(item_label)) between 2 and 120),
  category text not null check (category in ('fund','goods','other')),
  amount numeric(16,2) not null default 0 check (amount >= 0 and amount <= 1000000000000),
  unit text not null default '' check (char_length(unit) <= 20),
  donor_name text not null check (char_length(btrim(donor_name)) between 2 and 150),
  display text not null check (display in ('name','hamba_allah','hidden')),
  donor_phone text not null default '' check (char_length(donor_phone) <= 30),
  message text not null default '' check (char_length(message) <= 500),
  proof_key text not null default '' check (char_length(proof_key) <= 300),
  status text not null default 'pending' check (status in ('pending','received','rejected')),
  received_amount numeric(16,2) check (received_amount is null or (received_amount >= 0 and received_amount <= 1000000000000)),
  reject_reason text not null default '' check (char_length(reject_reason) <= 300),
  verified_at timestamptz,
  notified_at timestamptz,
  manual boolean not null default false,
  idempotency_key uuid,
  request_hash text,
  created_at timestamptz not null default now(),
  check (category <> 'fund' or amount >= 1000 or manual),
  check (category <> 'goods' or amount > 0),
  unique (event_id, idempotency_key)
);
create index donations_event_status on public.donations (event_id, status, created_at desc);

alter table public.donations enable row level security;
revoke all on public.donations from public, anon, authenticated;
grant select, insert, update, delete on public.donations to service_role;

-- Proofs of transfer show bank details: never public, read by the admin through short-lived signed addresses.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bukti-donasi', 'bukti-donasi', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

/*
 * A donation from the public page. Only for a published CSR event whose donations are open and not
 * past their closing time; a chip must still exist; a proof must come with money when the admin
 * asks for one. The same idempotency key with the same answers returns the first donation.
 */
create function public.submit_donation(p_slug text, p_payload jsonb, p_hash text, p_proof text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare e public.events; existing public.donations; result uuid; settings jsonb; category text; amount numeric;
begin
  select * into e from public.events where slug = p_slug for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into existing from public.donations where event_id = e.id and idempotency_key = (p_payload->>'idempotency_key')::uuid;
  if found then
    if existing.request_hash <> p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return existing.id;
  end if;
  settings := e.content->'donation';
  if e.status <> 'published' or coalesce(e.content->>'event_kind', '') <> 'csr'
    or (settings->>'enabled')::boolean is distinct from true
    or ((settings->>'closesAt') is not null and clock_timestamp() >= (settings->>'closesAt')::timestamptz)
  then raise exception 'DONATION_CLOSED'; end if;
  category := p_payload->>'category';
  amount := coalesce((p_payload->>'amount')::numeric, 0);
  if p_payload->>'website' is distinct from ''
    or category not in ('fund','goods','other')
    or p_payload->>'display' not in ('name','hamba_allah','hidden')
    or (category = 'fund' and amount < 1000) or (category = 'goods' and amount <= 0) or amount < 0
    or (coalesce(p_payload->>'item_key', '') <> '' and not exists (
      select 1 from jsonb_array_elements(coalesce(settings->'items', '[]'::jsonb)) item
      where item->>'key' = p_payload->>'item_key' and item->>'category' = category))
    or (category = 'fund' and (settings->>'proofRequired')::boolean and coalesce(p_proof, '') = '')
  then raise exception 'INVALID_DONATION'; end if;
  insert into public.donations (event_id, item_key, item_label, category, amount, unit, donor_name, display, donor_phone, message, proof_key, idempotency_key, request_hash)
    values (e.id, coalesce(p_payload->>'item_key', ''), btrim(p_payload->>'item_label'), category, amount, coalesce(p_payload->>'unit', ''),
      btrim(p_payload->>'donor_name'), p_payload->>'display', coalesce(p_payload->>'donor_phone', ''), coalesce(p_payload->>'message', ''),
      coalesce(p_proof, ''), (p_payload->>'idempotency_key')::uuid, p_hash)
    returning id into result;
  return result;
end $$;
revoke all on function public.submit_donation(text,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.submit_donation(text,jsonb,text,text) to service_role;

-- save_event as in 202610260001, except that a CSR page publishes without a place.
create or replace function public.save_event(p_id uuid,p_document jsonb,p_create boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare old_status text; old_questions jsonb; new_questions jsonb; item jsonb; result jsonb; location_mode text;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_event_admin() then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(p_document) is distinct from 'object'
    or p_document->>'status' not in ('draft','published','archived')
    or coalesce(length(p_document->>'title'),0) not between 1 and 180
    or coalesce(p_document->>'timezone','') not in ('Asia/Jakarta','Asia/Makassar','Asia/Jayapura')
    or p_document->>'starts_at' is null
    or jsonb_typeof(p_document->'agenda') is distinct from 'array'
    or jsonb_typeof(p_document->'feedback_questions') is distinct from 'array'
    or jsonb_array_length(p_document->'agenda') > 100
    or jsonb_array_length(p_document->'feedback_questions') > 30
    or octet_length(p_document::text) > 200000
  then raise exception 'INVALID_EVENT'; end if;
  if p_document->>'ends_at' is not null and (p_document->>'ends_at')::timestamptz <= (p_document->>'starts_at')::timestamptz then raise exception 'INVALID_EVENT'; end if;
  location_mode := coalesce(p_document->>'location_display', case when coalesce(p_document->>'location_embed_url','') <> '' then 'embed' else 'manual' end);
  if location_mode not in ('manual','embed') then raise exception 'INVALID_EVENT'; end if;
  if location_mode = 'embed' and coalesce(p_document->>'location_embed_url','') !~ '^https://www\.google\.com/maps/embed\?pb=![^[:space:]#&<>]+$' then raise exception 'INVALID_EVENT'; end if;
  if p_document->>'status' = 'published' and coalesce(p_document->>'event_kind', '') not in ('kartu','eguide') then
    if coalesce(length(btrim(p_document->>'organizer')),0)=0 or coalesce(length(btrim(p_document->>'introduction')),0)=0
      or (location_mode = 'manual' and coalesce(p_document->>'event_kind', '') <> 'csr' and (
        coalesce(length(btrim(p_document->>'venue_name')),0)=0 or coalesce(length(btrim(p_document->>'address')),0)=0
        or coalesce(p_document->>'location_url','') !~ '^https://[^/[:space:]]+'))
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

commit;
