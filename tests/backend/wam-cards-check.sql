-- Execute ONLY against the disposable PostgreSQL migration-check container.
-- Checks migration 202611040013 (character cards): the mockup's catalog and the unique rules.
begin;
set local role service_role;
do $$
declare f uuid; garda uuid; person uuid; other uuid;
begin
  select id into f from public.cq_forms where slug = 'kuesioner';
  if (select count(*) from public.cq_tiers where form_id = f) <> 5 then raise exception 'expected 5 levels'; end if;
  if (select sum(odds) from public.cq_tiers where form_id = f) <> 10000 then raise exception 'odds add up to 100 %%'; end if;
  if (select count(*) from public.cq_cards where form_id = f) <> 8 then raise exception 'expected 8 characters'; end if;
  if (select count(*) from public.cq_card_rules) <> 31 then raise exception 'expected 31 score rules'; end if;
  if (select count(*) from public.cq_card_parts where form_id = f) <> 26 then raise exception 'expected 26 look parts'; end if;
  if exists (select 1 from public.cq_cards where form_id = f and partner_id is null) then raise exception 'every mockup character has a partner'; end if;
  select id into garda from public.cq_cards where form_id = f and key = 'garda';
  if (select name from public.cq_cards where id = garda) <> 'Happy Rebel' then raise exception 'garda is Happy Rebel (M08)'; end if;

  select id into person from public.employees limit 1;
  select id into other from public.employees where id <> person limit 1;
  insert into public.cq_person_cards (form_id, employee_id, card_id, tier_key, background, accent, stickers, serial, combo, dna)
    values (f, person, garda, 'common', 1, 1, '{}', 1, 'x|1|1|', 'a1b2c3d4e5');
  begin
    insert into public.cq_person_cards (form_id, employee_id, card_id, tier_key, background, accent, stickers, serial, combo, dna)
      values (f, other, garda, 'common', 1, 1, '{}', 1, 'x|2|1|', 'b1b2c3d4e5');
    raise exception 'UNEXPECTED: the same number twice';
  exception when unique_violation then null; end;
  begin
    insert into public.cq_person_cards (form_id, employee_id, card_id, tier_key, background, accent, stickers, serial, combo, dna)
      values (f, other, garda, 'common', 1, 1, '{}', 2, 'x|1|1|', 'c1b2c3d4e5');
    raise exception 'UNEXPECTED: the same look twice';
  exception when unique_violation then null; end;
  begin
    insert into public.cq_person_cards (form_id, employee_id, card_id, tier_key, background, accent, stickers, serial, trial, combo, dna)
      values (f, other, garda, 'common', 1, 1, '{}', 2, true, 'x|3|1|', 'd1b2c3d4e5');
    raise exception 'UNEXPECTED: a trial card with a number';
  exception when check_violation then null; end;
  begin delete from public.cq_cards where id = garda; raise exception 'UNEXPECTED: deleting a character someone has';
  exception when foreign_key_violation then null; end;
  begin update public.cq_cards set image_key = 'elsewhere/x.png' where id = garda; raise exception 'UNEXPECTED: a picture outside pra-wam/kartu';
  exception when check_violation then null; end;
end $$;
rollback;
