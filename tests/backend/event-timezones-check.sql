-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
select set_config('request.jwt.claim.role','service_role',true);

do $$
declare
  doc jsonb := jsonb_build_object('status','draft','title','Kunjungan Makassar','starts_at','2026-11-02T09:00:00+08:00',
    'agenda','[]'::jsonb,'feedback_questions','[]'::jsonb);
  zone text;
  n integer := 0;
begin
  foreach zone in array array['Asia/Jakarta','Asia/Makassar','Asia/Jayapura'] loop
    n := n + 1;
    perform public.save_event(('44444444-4444-4444-8444-00000000000' || n)::uuid,
      doc || jsonb_build_object('slug','zona-' || n,'timezone',zone), true);
  end loop;
  if (select count(*) from public.events where slug like 'zona-%') <> 3 then raise exception 'three zones should save'; end if;
  if (select content->>'timezone' from public.events where slug = 'zona-2') <> 'Asia/Makassar' then raise exception 'WITA not stored'; end if;

  foreach zone in array array['Europe/London','UTC','',null] loop
    begin
      perform public.save_event('44444444-4444-4444-8444-000000000009'::uuid,
        doc || jsonb_build_object('slug','zona-salah','timezone',zone), true);
      raise exception 'UNEXPECTED: timezone % accepted', coalesce(zone,'null');
    exception when raise_exception then
      if sqlerrm <> 'INVALID_EVENT' then raise; end if;
    end;
  end loop;
  raise notice 'PASS: WIB, WITA and WIT save; other zones are rejected';
end $$;

rollback;
