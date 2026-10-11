-- Apply to the isolated test container after all earlier migrations, before the new one.
insert into public.events(id,slug,status,content) values
('11111111-1111-4111-8111-111111111111','legacy-open','published',
 '{"title":"Legacy event","rsvp_enabled":true,"rsvp_closes_at":null,"sections":[{"key":"rsvp","enabled":true}]}'::jsonb),
('22222222-2222-4222-8222-222222222222','personal-event','published',
 '{"title":"Personal event","rsvp_enabled":true,"rsvp_closes_at":null,"sections":[{"key":"rsvp","enabled":true}]}'::jsonb),
('33333333-3333-4333-8333-333333333333','draft-event','draft',
 '{"title":"Draft event","rsvp_enabled":true,"rsvp_closes_at":null,"sections":[{"key":"rsvp","enabled":true}]}'::jsonb);
insert into public.rsvps(event_id,name,organization,attendance,phone,email,has_allergy,allergy_details,idempotency_key,request_hash)
values ('11111111-1111-4111-8111-111111111111','Legacy guest','Community','yes','','',false,'',
 '11111111-1111-4111-8111-000000000001',repeat('a',64));
