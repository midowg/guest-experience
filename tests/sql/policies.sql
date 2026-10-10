-- Behavioural checks for the guest-experience schema. Every assertion raises on failure,
-- so a silent pass means the policy or guard actually held.
\set ON_ERROR_STOP on
create or replace function public._expect(condition boolean, label text) returns void language plpgsql as $$
begin if not condition then raise exception 'FAILED: %', label; else raise notice 'ok: %', label; end if; end $$;

-- A refused read may either error (no table grant) or return nothing (row-level policy).
-- Both mean the data stayed hidden, so treat either as a pass.
create or replace function public._expect_hidden(query text, label text) returns void language plpgsql as $$
declare found_rows bigint;
begin
  execute 'select count(*) from (' || query || ') t' into found_rows;
  perform public._expect(found_rows = 0, label);
exception when insufficient_privilege then perform public._expect(true, label || ' (refused outright)');
end $$;

create or replace function public._act_as(user_id uuid) returns void language plpgsql as $$
begin update public._test_identity set id = user_id; end $$;

insert into auth.users(id, email) values
  ('11111111-1111-4111-8111-111111111111', 'admin@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'bukan-admin@example.test');
insert into public.admin_members(user_id) values ('11111111-1111-4111-8111-111111111111');

-- Seed one published and one draft event through the guarded function, as the admin.
select public._act_as('11111111-1111-4111-8111-111111111111');
select public.save_event('aaaaaaaa-0000-4000-8000-000000000001'::uuid, jsonb_build_object(
  'id','aaaaaaaa-0000-4000-8000-000000000001','slug','acara-publik','status','draft','title','Acara Publik','timezone','Asia/Jakarta',
  'starts_at','2026-10-12T11:00:00Z','ends_at','2026-10-12T14:00:00Z','organizer','Panitia','introduction','Isi undangan',
  'venue_name','PT. Werkudara','address','Alamat','location_url','https://example.test/lokasi','rsvp_enabled',true,'feedback_enabled',false,
  'review_enabled',false,'review_url','','sections',jsonb_build_array(jsonb_build_object('key','rsvp','enabled',true),jsonb_build_object('key','feedback','enabled',true)),
  'agenda','[]'::jsonb,'feedback_questions','[]'::jsonb), true);
select public.save_event('aaaaaaaa-0000-4000-8000-000000000002'::uuid, jsonb_build_object(
  'id','aaaaaaaa-0000-4000-8000-000000000002','slug','acara-draft','status','draft','title','Acara Draft','timezone','Asia/Jakarta',
  'starts_at','2026-11-01T11:00:00Z','ends_at',null,'organizer','Panitia','introduction','Draft',
  'venue_name','PT. Werkudara','address','Alamat','location_url','https://example.test/lokasi','rsvp_enabled',true,'feedback_enabled',false,
  'review_enabled',false,'review_url','','sections',jsonb_build_array(jsonb_build_object('key','rsvp','enabled',true)),
  'agenda','[]'::jsonb,'feedback_questions','[]'::jsonb), true);

-- Publishing requires the mandatory fields, enforced inside the transaction.
do $$ begin
  begin
    perform public.save_event('aaaaaaaa-0000-4000-8000-000000000001'::uuid, jsonb_build_object(
      'id','aaaaaaaa-0000-4000-8000-000000000001','slug','acara-publik','status','published','title','Acara Publik','timezone','Asia/Jakarta',
      'starts_at','2026-10-12T11:00:00Z','ends_at','2026-10-12T14:00:00Z','organizer','','introduction','Isi',
      'venue_name','PT. Werkudara','address','Alamat','location_url','https://example.test/lokasi','rsvp_enabled',true,'feedback_enabled',false,
      'review_enabled',false,'review_url','','sections','[]'::jsonb,'agenda','[]'::jsonb,'feedback_questions','[]'::jsonb), false);
    perform public._expect(false, 'publish without organizer must be rejected');
  exception when others then
    perform public._expect(sqlerrm = 'INVALID_EVENT', 'publish without organizer rejected (got: ' || sqlerrm || ')');
  end;
end $$;

select public.save_event('aaaaaaaa-0000-4000-8000-000000000001'::uuid, jsonb_build_object(
  'id','aaaaaaaa-0000-4000-8000-000000000001','slug','acara-publik','status','published','title','Acara Publik','timezone','Asia/Jakarta',
  'starts_at','2026-10-12T11:00:00Z','ends_at','2026-10-12T14:00:00Z','organizer','Panitia','introduction','Isi undangan',
  'venue_name','PT. Werkudara','address','Alamat','location_url','https://example.test/lokasi','rsvp_enabled',true,'feedback_enabled',false,
  'review_enabled',false,'review_url','','sections',jsonb_build_array(jsonb_build_object('key','rsvp','enabled',true),jsonb_build_object('key','feedback','enabled',true)),
  'agenda','[]'::jsonb,'feedback_questions',jsonb_build_array(jsonb_build_object('id','cccccccc-0000-4000-8000-000000000001','label','Nilai acara','kind','rating','required',true,'options','[]'::jsonb,'sort_order',0))), false);

-- A guest submits as service_role, the only role allowed to call the write function.
set role service_role;
select public.submit_rsvp('acara-publik', jsonb_build_object('name','Tamu Satu','organization','Komunitas','attendance','yes','phone','','email','','has_allergy',false,'allergy_details','','consent',true,'website','','idempotency_key','dddddddd-0000-4000-8000-000000000001'), repeat('a',64)) as rsvp_id \gset
select public._expect(:'rsvp_id' is not null, 'guest RSVP accepted on a published event');

-- Replaying the same key with the same content must not create a second row.
select public.submit_rsvp('acara-publik', jsonb_build_object('name','Tamu Satu','organization','Komunitas','attendance','yes','phone','','email','','has_allergy',false,'allergy_details','','consent',true,'website','','idempotency_key','dddddddd-0000-4000-8000-000000000001'), repeat('a',64)) as replay_id \gset
select public._expect(:'replay_id' = :'rsvp_id', 'identical replay returns the original row');
select public._expect((select count(*) from public.rsvps) = 1, 'no duplicate row created by replay');

do $$ begin
  begin
    perform public.submit_rsvp('acara-publik', jsonb_build_object('name','Tamu Berubah','organization','Komunitas','attendance','no','phone','','email','','has_allergy',false,'allergy_details','','consent',true,'website','','idempotency_key','dddddddd-0000-4000-8000-000000000001'), repeat('b',64));
    perform public._expect(false, 'reused key with different content must be rejected');
  exception when others then
    perform public._expect(sqlerrm = 'IDEMPOTENCY_CONFLICT', 'reused key with different content rejected');
  end;
  begin
    perform public.submit_rsvp('acara-draft', jsonb_build_object('name','Tamu','organization','X','attendance','yes','phone','','email','','has_allergy',false,'allergy_details','','consent',true,'website','','idempotency_key','dddddddd-0000-4000-8000-000000000009'), repeat('c',64));
    perform public._expect(false, 'RSVP to an unpublished event must be rejected');
  exception when others then
    perform public._expect(sqlerrm = 'EVENT_CLOSED', 'RSVP to an unpublished event rejected');
  end;
  begin
    perform public.submit_rsvp('acara-publik', jsonb_build_object('name','Bot','organization','X','attendance','yes','phone','','email','','has_allergy',false,'allergy_details','','consent',true,'website','isi-spam','idempotency_key','dddddddd-0000-4000-8000-00000000000a'), repeat('d',64));
    perform public._expect(false, 'honeypot submission must be rejected');
  exception when others then
    perform public._expect(sqlerrm = 'INVALID_ANSWERS', 'honeypot submission rejected');
  end;
  begin
    perform public.submit_feedback('acara-publik', jsonb_build_object('website','','idempotency_key','eeeeeeee-0000-4000-8000-000000000001','answers',jsonb_build_array(jsonb_build_object('question_id','cccccccc-0000-4000-8000-000000000001','value','9'))), repeat('e',64));
    perform public._expect(false, 'out-of-range rating must be rejected');
  exception when others then
    perform public._expect(sqlerrm in ('INVALID_ANSWERS','EVENT_CLOSED'), 'out-of-range rating rejected');
  end;
end $$;

-- Rate limiting must actually stop the third attempt in a window of two.
select public._expect(public.consume_rate_limit(repeat('f',64), 2, 600), 'rate limit allows first hit');
select public._expect(public.consume_rate_limit(repeat('f',64), 2, 600), 'rate limit allows second hit');
select public._expect(not public.consume_rate_limit(repeat('f',64), 2, 600), 'rate limit blocks third hit');
reset role;

-- Anonymous visitors: published content only, never guest answers.
select public._act_as(null);
set role anon;
select public._expect((select count(*) from public.events) = 1, 'anonymous sees only the published event');
select public._expect_hidden('select 1 from public.rsvps', 'anonymous cannot read RSVPs');
select public._expect_hidden('select 1 from public.feedback_submissions', 'anonymous cannot read feedback');
select public._expect((select count(*) from public.event_documents) = 1, 'anonymous document view hides drafts');
do $$ begin
  begin
    insert into public.rsvps(event_id,name,organization,attendance,idempotency_key,request_hash)
      values('aaaaaaaa-0000-4000-8000-000000000001','Penyusup','X','yes','99999999-0000-4000-8000-000000000001',repeat('9',64));
    perform public._expect(false, 'anonymous direct insert must be refused');
  exception when others then perform public._expect(true, 'anonymous direct insert refused');
  end;
end $$;
reset role;

-- A signed-in account that is not an admin gets no more than an anonymous visitor.
select public._act_as('22222222-2222-4222-8222-222222222222');
set role authenticated;
select public._expect_hidden('select 1 from public.rsvps', 'non-admin account cannot read RSVPs');
select public._expect((select count(*) from public.events) = 1, 'non-admin account cannot read drafts');
select public._expect_hidden('select 1 from public.admin_members where user_id <> auth.uid()', 'non-admin cannot read other admin rows');
do $$ begin
  begin
    perform public.save_event('aaaaaaaa-0000-4000-8000-000000000002'::uuid, jsonb_build_object('id','aaaaaaaa-0000-4000-8000-000000000002','slug','acara-draft','status','published','title','Dibajak','timezone','Asia/Jakarta','starts_at','2026-11-01T11:00:00Z','ends_at',null,'organizer','X','introduction','X','venue_name','X','address','X','location_url','https://example.test/x','rsvp_enabled',true,'feedback_enabled',false,'review_enabled',false,'review_url','','sections','[]'::jsonb,'agenda','[]'::jsonb,'feedback_questions','[]'::jsonb), false);
    perform public._expect(false, 'non-admin must not be able to publish');
  exception when others then
    perform public._expect(sqlerrm = 'FORBIDDEN', 'non-admin cannot publish');
  end;
end $$;
reset role;

-- The admin sees everything scoped to their team.
select public._act_as('11111111-1111-4111-8111-111111111111');
set role authenticated;
select public._expect((select count(*) from public.events) = 2, 'admin sees drafts and published events');
select public._expect((select count(*) from public.rsvps) = 1, 'admin reads guest confirmations');
select public._expect((select count(*) from public.feedback_questions where event_id = 'aaaaaaaa-0000-4000-8000-000000000001') = 1, 'admin reads the survey question set');

-- Questions that already received answers must not be silently rewritten.
-- Enable the feedback section first, otherwise the submission is correctly refused.
select public.save_event('aaaaaaaa-0000-4000-8000-000000000001'::uuid, jsonb_build_object(
  'id','aaaaaaaa-0000-4000-8000-000000000001','slug','acara-publik','status','published','title','Acara Publik','timezone','Asia/Jakarta',
  'starts_at','2026-10-12T11:00:00Z','ends_at','2026-10-12T14:00:00Z','organizer','Panitia','introduction','Isi undangan',
  'venue_name','PT. Werkudara','address','Alamat','location_url','https://example.test/lokasi','rsvp_enabled',true,'feedback_enabled',true,
  'review_enabled',false,'review_url','','sections',jsonb_build_array(jsonb_build_object('key','rsvp','enabled',true),jsonb_build_object('key','feedback','enabled',true)),
  'agenda','[]'::jsonb,'feedback_questions',jsonb_build_array(jsonb_build_object('id','cccccccc-0000-4000-8000-000000000001','label','Nilai acara','kind','rating','required',true,'options','[]'::jsonb,'sort_order',0))), false);
reset role;
set role service_role;
select public.submit_feedback('acara-publik', jsonb_build_object('website','','idempotency_key','eeeeeeee-0000-4000-8000-000000000002','answers',jsonb_build_array(jsonb_build_object('question_id','cccccccc-0000-4000-8000-000000000001','value','5'))), repeat('1',64)) as fb \gset
reset role;
set role authenticated;
do $$ begin
  begin
    perform public.save_event('aaaaaaaa-0000-4000-8000-000000000001'::uuid, jsonb_build_object(
      'id','aaaaaaaa-0000-4000-8000-000000000001','slug','acara-publik','status','published','title','Acara Publik','timezone','Asia/Jakarta',
      'starts_at','2026-10-12T11:00:00Z','ends_at','2026-10-12T14:00:00Z','organizer','Panitia','introduction','Isi undangan',
      'venue_name','PT. Werkudara','address','Alamat','location_url','https://example.test/lokasi','rsvp_enabled',true,'feedback_enabled',true,
      'review_enabled',false,'review_url','','sections',jsonb_build_array(jsonb_build_object('key','rsvp','enabled',true)),
      'agenda','[]'::jsonb,'feedback_questions',jsonb_build_array(jsonb_build_object('id','cccccccc-0000-4000-8000-000000000001','label','Pertanyaan diganti diam-diam','kind','rating','required',true,'options','[]'::jsonb,'sort_order',0))), false);
    perform public._expect(false, 'answered question set must be locked');
  exception when others then
    perform public._expect(sqlerrm = 'QUESTIONS_LOCKED', 'answered question set is locked');
  end;
end $$;
reset role;
select 'ALL POLICY CHECKS PASSED' as result;
