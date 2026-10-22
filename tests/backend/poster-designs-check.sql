-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
set local role service_role;
do $$
declare design uuid;
begin
  insert into public.poster_designs (name, template) values ('Rempah JCWF', '{"preset":"rempah-nusantara","formats":{},"fields":[]}') returning id into design;
  if (select description from public.poster_designs where id = design) <> '' then raise exception 'description default wrong'; end if;
  begin insert into public.poster_designs (name, template) values ('A', '{"fields":[]}'); raise exception 'UNEXPECTED: one-letter name';
  exception when check_violation then null; end;
  begin insert into public.poster_designs (name, template) values ('Tanpa kotak', '{"preset":"x"}'); raise exception 'UNEXPECTED: no fields array';
  exception when check_violation then null; end;
  begin insert into public.poster_designs (name, template) values ('Bukan objek', '[]'); raise exception 'UNEXPECTED: template not an object';
  exception when check_violation then null; end;
  raise notice 'PASS: poster design name, template shape';
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.poster_designs; raise exception 'UNEXPECTED: anon read designs';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: poster designs are server only';
end $$;
reset role;

rollback;
