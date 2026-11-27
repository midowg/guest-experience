-- Panel/API aplikasi kini TANPA LOGIN atas keputusan pemilik.
-- Pada domain publik siapa pun dapat menggunakan fungsi admin aplikasi.
-- Database tetap menolak anon secara langsung; service key hanya di server.
-- Jangan jalankan seed lama. Migrasi ini tidak mengubah data acara.
begin;

create or replace function public.save_event(p_id uuid,p_document jsonb,p_create boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare old_status text; old_questions jsonb; new_questions jsonb; item jsonb; result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_event_admin() then raise exception 'FORBIDDEN'; end if;
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

create or replace function public.set_featured_event(p_event uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare event_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_event_admin() then raise exception 'FORBIDDEN'; end if;
  if p_event is not null then
    select status into event_status from public.events where id = p_event;
    if not found then raise exception 'NOT_FOUND'; end if;
    if event_status <> 'published' then raise exception 'EVENT_CLOSED'; end if;
  end if;
  update public.site_settings set featured_event_id = p_event, updated_at = clock_timestamp() where id;
  return p_event;
end $$;

create or replace function public.delete_event(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare target public.events; rsvp_count integer; feedback_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_event_admin() then raise exception 'FORBIDDEN'; end if;
  select * into target from public.events where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if exists (select 1 from public.site_settings where id and featured_event_id = p_id) then
    raise exception 'EVENT_IS_FEATURED';
  end if;
  select count(*) into rsvp_count from public.rsvps where event_id = p_id;
  select count(*) into feedback_count from public.feedback_submissions where event_id = p_id;
  delete from public.events where id = p_id;
  return jsonb_build_object('slug', target.slug, 'rsvps', rsvp_count, 'feedback', feedback_count);
end $$;

revoke all on function public.save_event(uuid,jsonb,boolean), public.set_featured_event(uuid), public.delete_event(uuid) from public, anon;
grant execute on function public.save_event(uuid,jsonb,boolean), public.set_featured_event(uuid), public.delete_event(uuid) to service_role, authenticated;
commit;
