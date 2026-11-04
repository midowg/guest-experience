-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
set local role service_role;
do $$
declare small uuid; big uuid;
begin
  select id into small from public.pw_rooms where slug = 'vasuki';
  select id into big from public.pw_rooms where slug = 'cfc-ananta';
  update public.pw_rooms set capacity = 4, min_people = 1, plan_key = 'vasuki' where id = small;
  update public.pw_rooms set capacity = 12, min_people = 4, plan_key = 'ananta' where id = big;
  begin update public.pw_rooms set min_people = 13 where id = big; raise exception 'UNEXPECTED: min above capacity';
  exception when check_violation then null; end;
  begin update public.pw_rooms set plan_key = 'vasuki' where id = big; raise exception 'UNEXPECTED: two rooms on one spot';
  exception when unique_violation then null; end;
  begin update public.pw_rooms set plan_key = 'Bad Key!' where id = big; raise exception 'UNEXPECTED: bad plan key';
  exception when check_violation then null; end;
  insert into public.pw_app_settings (floor_plan) values (false);
  begin insert into public.pw_app_settings (id, floor_plan) values (false, true); raise exception 'UNEXPECTED: a second settings row';
  exception when check_violation then null; end;
  raise notice 'PASS: room people range, one room per plan spot, one settings row';
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.pw_app_settings; raise exception 'UNEXPECTED: anon read settings';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
