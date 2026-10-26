-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- E-Guide (event_kind 'eguide'): a guidebook to read, not an invitation. Like a card
-- (202610220003_card_publish.sql), publishing it does not ask for an organiser, an introduction or
-- a place. Only that check in save_event changes; the rest is the same as 202610220003.
-- The "e-guide" template may also be shown to regular admins (super admin, Templat).
begin;

alter table public.admin_settings drop constraint admin_settings_enabled_templates_check;
alter table public.admin_settings add constraint admin_settings_enabled_templates_check
  check (enabled_templates <@ array['kunjungan-klien','gala-dinner','seminar-launching','annual-meeting','nyadran','csr-kegiatan-sosial','pelatihan-bootcamp','trip-klien','poster-sesi','e-guide']::text[]);

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
      or (location_mode = 'manual' and (
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
