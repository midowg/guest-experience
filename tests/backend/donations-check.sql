-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
select set_config('request.jwt.claim.role','service_role',true);

do $$
declare
  doc jsonb := jsonb_build_object('status','draft','title','Berbagi Bersama Anak Panti','starts_at','2026-12-12T09:00:00+07:00','timezone','Asia/Jakarta',
    'agenda','[]'::jsonb,'feedback_questions','[]'::jsonb,'organizer','Werkudara','introduction','Untuk anak panti.','venue_name','','address','','location_url','',
    'event_kind','csr',
    'donation', jsonb_build_object('enabled', true, 'proofRequired', false, 'closesAt', null,
      'items', jsonb_build_array(jsonb_build_object('key','dana','label','Dana','category','fund','unit','Rp'), jsonb_build_object('key','sembako','label','Sembako','category','goods','unit','paket'))));
  gift jsonb := jsonb_build_object('item_key','dana','item_label','Dana','category','fund','amount',100000,'unit','Rp','donor_name','Sari Dewi','display','name',
    'donor_phone','081234567890','message','Semoga bermanfaat','website','','idempotency_key','7a000000-0000-4000-8000-000000000001');
  first uuid; again uuid;
begin
  -- A CSR page publishes without a place.
  perform public.save_event('7b000000-0000-4000-8000-000000000001'::uuid, doc || jsonb_build_object('slug','csr-panti'), true);
  perform public.save_event('7b000000-0000-4000-8000-000000000001'::uuid, doc || jsonb_build_object('slug','csr-panti','status','published'), false);
  if (select status from public.events where slug = 'csr-panti') <> 'published' then raise exception 'csr not published'; end if;
  -- An ordinary event still needs its place.
  perform public.save_event('7b000000-0000-4000-8000-000000000002'::uuid, doc || jsonb_build_object('slug','acara-tanpa-tempat','event_kind','acara'), true);
  begin
    perform public.save_event('7b000000-0000-4000-8000-000000000002'::uuid, doc || jsonb_build_object('slug','acara-tanpa-tempat','event_kind','acara','status','published'), false);
    raise exception 'UNEXPECTED: event published without a place';
  exception when raise_exception then if sqlerrm <> 'INVALID_EVENT' then raise; end if; end;

  first := public.submit_donation('csr-panti', gift, 'hash-1');
  again := public.submit_donation('csr-panti', gift, 'hash-1');
  if first is distinct from again then raise exception 'idempotency broken'; end if;
  if (select status from public.donations where id = first) <> 'pending' then raise exception 'new donation not pending'; end if;
  begin perform public.submit_donation('csr-panti', gift, 'hash-2'); raise exception 'UNEXPECTED: same key, other answers';
  exception when raise_exception then if sqlerrm <> 'IDEMPOTENCY_CONFLICT' then raise; end if; end;

  perform public.submit_donation('csr-panti', gift || jsonb_build_object('idempotency_key','7a000000-0000-4000-8000-000000000002','item_key','sembako','item_label','Sembako','category','goods','amount',3,'unit','paket','display','hamba_allah'), 'h3');
  perform public.submit_donation('csr-panti', gift || jsonb_build_object('idempotency_key','7a000000-0000-4000-8000-000000000003','item_key','','item_label','Kursi roda','category','other','amount',0,'unit','','display','hidden'), 'h4');

  -- Refused: honeypot, too little money, no count of goods, unknown chip, chip of another kind.
  begin perform public.submit_donation('csr-panti', gift || jsonb_build_object('idempotency_key','7a000000-0000-4000-8000-000000000010','website','spam'), 'x1'); raise exception 'UNEXPECTED: honeypot';
  exception when raise_exception then if sqlerrm <> 'INVALID_DONATION' then raise; end if; end;
  begin perform public.submit_donation('csr-panti', gift || jsonb_build_object('idempotency_key','7a000000-0000-4000-8000-000000000011','amount',500), 'x2'); raise exception 'UNEXPECTED: Rp 500';
  exception when raise_exception then if sqlerrm <> 'INVALID_DONATION' then raise; end if; end;
  begin perform public.submit_donation('csr-panti', gift || jsonb_build_object('idempotency_key','7a000000-0000-4000-8000-000000000012','item_key','sembako','item_label','Sembako','category','goods','amount',0), 'x3'); raise exception 'UNEXPECTED: zero goods';
  exception when raise_exception then if sqlerrm <> 'INVALID_DONATION' then raise; end if; end;
  begin perform public.submit_donation('csr-panti', gift || jsonb_build_object('idempotency_key','7a000000-0000-4000-8000-000000000013','item_key','kasur'), 'x4'); raise exception 'UNEXPECTED: unknown chip';
  exception when raise_exception then if sqlerrm <> 'INVALID_DONATION' then raise; end if; end;
  begin perform public.submit_donation('csr-panti', gift || jsonb_build_object('idempotency_key','7a000000-0000-4000-8000-000000000014','item_key','sembako'), 'x5'); raise exception 'UNEXPECTED: fund under a goods chip';
  exception when raise_exception then if sqlerrm <> 'INVALID_DONATION' then raise; end if; end;

  -- A proof is required for money when the admin asks for one.
  perform public.save_event('7b000000-0000-4000-8000-000000000001'::uuid, doc || jsonb_build_object('slug','csr-panti','status','published','donation', (doc->'donation') || jsonb_build_object('proofRequired', true)), false);
  begin perform public.submit_donation('csr-panti', gift || jsonb_build_object('idempotency_key','7a000000-0000-4000-8000-000000000015'), 'x6'); raise exception 'UNEXPECTED: money without proof';
  exception when raise_exception then if sqlerrm <> 'INVALID_DONATION' then raise; end if; end;
  perform public.submit_donation('csr-panti', gift || jsonb_build_object('idempotency_key','7a000000-0000-4000-8000-000000000015'), 'x6', 'csr-panti/bukti.jpg');

  -- Closed: past the closing time, donations off, or not a CSR event.
  perform public.save_event('7b000000-0000-4000-8000-000000000001'::uuid, doc || jsonb_build_object('slug','csr-panti','status','published','donation', (doc->'donation') || jsonb_build_object('closesAt','2020-01-01T00:00:00+07:00')), false);
  begin perform public.submit_donation('csr-panti', gift || jsonb_build_object('idempotency_key','7a000000-0000-4000-8000-000000000016'), 'x7'); raise exception 'UNEXPECTED: after closing';
  exception when raise_exception then if sqlerrm <> 'DONATION_CLOSED' then raise; end if; end;
  perform public.save_event('7b000000-0000-4000-8000-000000000001'::uuid, doc || jsonb_build_object('slug','csr-panti','status','published','event_kind','acara','venue_name','Panti','address','Jl. Kaliurang','location_url','https://maps.google.com/x'), false);
  begin perform public.submit_donation('csr-panti', gift || jsonb_build_object('idempotency_key','7a000000-0000-4000-8000-000000000017'), 'x8'); raise exception 'UNEXPECTED: not a CSR event';
  exception when raise_exception then if sqlerrm <> 'DONATION_CLOSED' then raise; end if; end;

  if (select count(*) from public.donations where event_id = '7b000000-0000-4000-8000-000000000001') <> 4 then raise exception 'wrong number of donations'; end if;
  if (select public from storage.buckets where id = 'bukti-donasi') then raise exception 'proof bucket is public'; end if;
  raise notice 'PASS: CSR publishes without a place, donations idempotent, refused when invalid or closed, proof bucket private';
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.donations; raise exception 'UNEXPECTED: anon read donations';
  exception when insufficient_privilege then null; end;
  begin perform public.submit_donation('csr-panti', '{}'::jsonb, 'x'); raise exception 'UNEXPECTED: anon submit';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: donations are server only';
end $$;
reset role;

rollback;
