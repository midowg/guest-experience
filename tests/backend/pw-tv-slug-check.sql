-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
set local role service_role;
do $$
begin
  insert into public.pw_tv_screens (name, slug) values ('Lobi', 'lobi');
  begin insert into public.pw_tv_screens (name, slug) values ('Lobi dua', 'lobi'); raise exception 'UNEXPECTED: one address for two TVs';
  exception when unique_violation then null; end;
  begin insert into public.pw_tv_screens (name, slug) values ('Pantry', 'Pantry Lantai 2'); raise exception 'UNEXPECTED: an address with capitals and spaces';
  exception when check_violation then null; end;
  begin insert into public.pw_tv_screens (name, slug) values ('Pantry', 'a'); raise exception 'UNEXPECTED: a one-letter address';
  exception when check_violation then null; end;
  begin insert into public.pw_tv_screens (name, slug) values ('Pantry', '-pantry'); raise exception 'UNEXPECTED: an address starting with a dash';
  exception when check_violation then null; end;
  begin insert into public.pw_tv_screens (name) values ('Pantry'); raise exception 'UNEXPECTED: a TV without an address';
  exception when not_null_violation then null; end;
  insert into public.pw_tv_screens (name, slug) values ('Pantry lantai 2', 'pantry-lantai-2');
  update public.pw_tv_screens set slug = 'resepsionis' where slug = 'lobi';
  raise notice 'PASS: a short lower-case address per TV, unique, and no key needed';
end $$;
reset role;
rollback;
