-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
select set_config('request.jwt.claim.role','service_role',true);

do $$
declare ev constant uuid := '88888888-8888-4888-8888-000000000001';
begin
  perform public.save_event(ev, jsonb_build_object('status','draft','slug','rahasia','title','Acara Rahasia','timezone','Asia/Jakarta',
    'starts_at','2026-11-02T09:00:00+07:00','agenda','[]'::jsonb,'feedback_questions','[]'::jsonb), true);
  if (select admin_hidden from public.events where id = ev) then raise exception 'hidden by default'; end if;

  perform public.set_event_admin_hidden(ev, true);
  perform public.set_event_admin_hidden(ev, true);
  if not (select admin_hidden from public.events where id = ev) then raise exception 'not hidden'; end if;
  if (select count(*) from public.event_audit where event_id = ev and action = 'hide') <> 1 then raise exception 'hide audited wrongly'; end if;

  -- Saving the content keeps the flag.
  perform public.save_event(ev, jsonb_build_object('status','draft','slug','rahasia','title','Acara Rahasia 2','timezone','Asia/Jakarta',
    'starts_at','2026-11-02T09:00:00+07:00','agenda','[]'::jsonb,'feedback_questions','[]'::jsonb), false);
  if not (select admin_hidden from public.events where id = ev) then raise exception 'save cleared the flag'; end if;
  if (select document ? 'admin_hidden' from public.event_documents where id = ev) then raise exception 'flag leaked into the document'; end if;

  perform public.set_event_admin_hidden(ev, false);
  if (select admin_hidden from public.events where id = ev) or not exists(select 1 from public.event_audit where event_id = ev and action = 'unhide') then raise exception 'unhide failed'; end if;

  begin perform public.set_event_admin_hidden('88888888-8888-4888-8888-000000000099', true); raise exception 'UNEXPECTED: missing event';
  exception when raise_exception then if sqlerrm <> 'NOT_FOUND' then raise; end if; end;

  insert into public.admin_access_log(kind, role) values ('login_success', 'super');
  begin insert into public.admin_access_log(kind, role) values ('login_success', 'owner'); raise exception 'UNEXPECTED: bad role';
  exception when check_violation then null; end;
  raise notice 'PASS: hide/unhide, idempotent audit, flag survives save, not in document, access-log role';
end $$;

set local role anon;
do $$ begin
  begin perform public.set_event_admin_hidden('88888888-8888-4888-8888-000000000001', false); raise exception 'UNEXPECTED: anon call';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
