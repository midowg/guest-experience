-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
select set_config('request.jwt.claim.role','service_role',true);

do $$
declare
  ev constant uuid := '77777777-7777-4777-8777-777777777777';
  doc jsonb := jsonb_build_object('status','draft','title','BEO','slug','beo-cek','timezone','Asia/Jakarta',
    'starts_at','2026-11-02T09:00:00+07:00','agenda','[]'::jsonb,'feedback_questions','[]'::jsonb);
  row public.event_beo;
begin
  perform public.save_event(ev, doc, true);

  row := public.apply_beo_action(ev, 'save', 0, 40, 'Catatan awal', '', 30, 'dev-1', 'admin');
  if row.status <> 'draft' or row.prepared_count <> 40 or row.version <> 1 or row.locked_at is not null then raise exception 'draft save wrong: %', row; end if;
  if exists (select 1 from public.event_beo_revisions where event_id = ev) then raise exception 'a draft save is not a revision'; end if;

  row := public.apply_beo_action(ev, 'set', 1, 42, null, '', 31, 'dev-1', 'admin');
  if row.status <> 'set' or row.prepared_count <> 42 or row.locked_at is null or row.notes <> 'Catatan awal' then raise exception 'set wrong: %', row; end if;

  begin perform public.apply_beo_action(ev, 'save', 2, 50, null, '', 31, null, 'admin'); raise exception 'UNEXPECTED: save after set';
  exception when others then if sqlerrm <> 'BEO_STEP' then raise; end if; end;
  begin perform public.apply_beo_action(ev, 'revise', 2, 50, null, '  ', 31, null, 'admin'); raise exception 'UNEXPECTED: revise without reason';
  exception when others then if sqlerrm <> 'BEO_REASON' then raise; end if; end;
  begin perform public.apply_beo_action(ev, 'revise', 1, 50, null, 'telat', 31, null, 'admin'); raise exception 'UNEXPECTED: stale version';
  exception when others then if sqlerrm <> 'BEO_CHANGED' then raise; end if; end;

  row := public.apply_beo_action(ev, 'revise', 2, 50, null, 'Tambahan 8 tamu dari klien', 39, 'dev-2', 'super');
  if row.status <> 'revised' or row.prepared_count <> 50 or row.version <> 3 then raise exception 'revise wrong: %', row; end if;
  row := public.apply_beo_action(ev, 'final', 3, 999, null, '', 39, null, 'admin');
  if row.status <> 'final' or row.prepared_count <> 50 then raise exception 'final must keep the number: %', row; end if;
  row := public.apply_beo_action(ev, 'done', 4, null, null, '', 40, null, 'admin');
  row := public.apply_beo_action(ev, 'reopen', 5, null, null, '', 40, null, 'admin');
  if row.status <> 'revised' then raise exception 'reopen wrong'; end if;

  if (select count(*) from public.event_beo_revisions where event_id = ev) <> 5 then raise exception 'expected 5 revisions'; end if;
  if (select reason from public.event_beo_revisions where event_id = ev and version = 3) <> 'Tambahan 8 tamu dari klien' then raise exception 'reason not kept'; end if;

  begin perform public.apply_beo_action('00000000-0000-4000-8000-000000000000', 'save', 0, 1, '', '', 0, null, 'admin'); raise exception 'UNEXPECTED: unknown event';
  exception when others then if sqlerrm <> 'EVENT_NOT_FOUND' then raise; end if; end;
  raise notice 'PASS: BEO flow, version guard, reason required, revisions kept';
end $$;

set local role anon;
do $$ begin
  begin perform 1 from public.event_beo; raise exception 'UNEXPECTED: anon read BEO';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: BEO is server only';
end $$;
reset role;

rollback;
