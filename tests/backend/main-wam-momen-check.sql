-- Execute ONLY against the disposable PostgreSQL migration-check container.
-- Migrations 202611200201 and 202611210001 (Main WAM area B, Momen + Mozaik, reactions): who sees which photo (kelompok photos only
-- for their kelompok, Batalkan's 5 seconds, reported photos hidden for the reporter), keyset paging
-- of the stack and the gallery, the session counts, reports (one per person, the third hides the
-- photo once), the mosaic's stable placement and its version (ETag), a nominated photo that cannot
-- be deleted (with 202611200003), one reaction per person on a photo (set, replaced, taken back, counted, never
-- on one's own, a hidden or an unseen photo), and that none of it is open to the public keys.
begin;
set local role service_role;
do $$
declare
  rani uuid; sari uuid; dimas uuid; bima uuid; ayu uuid; yoga uuid;
  g4 uuid; g2 uuid; team uuid; pem uuid;
  p_old uuid; p_mid uuid; p_new uuid; p_k4 uuid; p_k2 uuid; p_rani uuid; p_fresh uuid; p_hidden uuid;
  r record; n integer; ids uuid[]; v1 text; v2 text; cat uuid; msg text; reacts jsonb;
  heart text := chr(10084) || chr(65039); laugh text := chr(128514); fire text := chr(128293);
  base timestamptz := now() - interval '2 hours';
begin
  insert into public.employees (full_name, nickname) values ('Rani Contoh Momen', 'Rani') returning id into rani;
  insert into public.employees (full_name, nickname) values ('Sari Contoh Momen', 'Sari') returning id into sari;
  insert into public.employees (full_name, nickname) values ('Dimas Contoh Momen', 'Dimas') returning id into dimas;
  insert into public.employees (full_name, nickname) values ('Bima Contoh Momen', 'Bima') returning id into bima;
  insert into public.employees (full_name, nickname) values ('Ayu Contoh Momen', 'Ayu') returning id into ayu;
  insert into public.employees (full_name, nickname) values ('Yoga Contoh Momen', 'Yoga') returning id into yoga;
  insert into public.mw_groups (number, name) values (94, 'Arjuno Uji') returning id into g4;
  insert into public.mw_groups (number, name) values (92, 'Kawi Uji') returning id into g2;
  insert into public.mw_group_members (group_id, employee_id) values (g4, rani), (g4, sari), (g4, bima), (g2, dimas);
  insert into public.mw_sessions (title, status, starts_at, ends_at) values ('Team building uji', 'terbit', base, base + interval '2 hours') returning id into team;
  insert into public.mw_sessions (title, status, starts_at, ends_at) values ('Pemaparan uji', 'terbit', base - interval '4 hours', base - interval '1 hour') returning id into pem;

  -- The tile key has its own shape.
  begin
    insert into public.mw_photos (owner_id, client_id, file_key, tile_key, size, width, height)
      values (sari, gen_random_uuid(), 'main-wam/momen/00000000-0000-4000-8000-0000000000a1.jpg', 'main-wam/momen/00000000-0000-4000-8000-0000000000a1-kecil.jpg', 1, 1, 1);
    raise exception 'UNEXPECTED: a tile key that is not -ubin.jpg';
  exception when check_violation then null; end;

  -- Photos, oldest first. Times are explicit: now() does not move inside this transaction.
  insert into public.mw_photos (owner_id, client_id, audience, session_id, file_key, tile_key, size, width, height, created_at, visible_at)
    values (dimas, gen_random_uuid(), 'semua', pem, 'main-wam/momen/00000000-0000-4000-8000-000000000001.jpg', 'main-wam/momen/00000000-0000-4000-8000-000000000001-ubin.jpg', 1, 1280, 1600, base, base + interval '5 seconds') returning id into p_old;
  insert into public.mw_photos (owner_id, client_id, audience, session_id, file_key, tile_key, size, width, height, created_at, visible_at)
    values (sari, gen_random_uuid(), 'semua', team, 'main-wam/momen/00000000-0000-4000-8000-000000000002.jpg', 'main-wam/momen/00000000-0000-4000-8000-000000000002-ubin.jpg', 1, 1280, 1600, base + interval '10 minutes', base + interval '10 minutes 5 seconds') returning id into p_mid;
  insert into public.mw_photos (owner_id, client_id, audience, session_id, file_key, tile_key, size, width, height, created_at, visible_at)
    values (bima, gen_random_uuid(), 'semua', null, 'main-wam/momen/00000000-0000-4000-8000-000000000003.jpg', 'main-wam/momen/00000000-0000-4000-8000-000000000003-ubin.jpg', 1, 1280, 1600, base + interval '20 minutes', base + interval '20 minutes 5 seconds') returning id into p_new;
  insert into public.mw_photos (owner_id, client_id, audience, group_id, session_id, file_key, tile_key, size, width, height, created_at, visible_at)
    values (sari, gen_random_uuid(), 'kelompok', g4, team, 'main-wam/momen/00000000-0000-4000-8000-000000000004.jpg', 'main-wam/momen/00000000-0000-4000-8000-000000000004-ubin.jpg', 1, 1280, 1600, base + interval '30 minutes', base + interval '30 minutes 5 seconds') returning id into p_k4;
  insert into public.mw_photos (owner_id, client_id, audience, group_id, file_key, size, width, height, created_at, visible_at)
    values (dimas, gen_random_uuid(), 'kelompok', g2, 'main-wam/momen/00000000-0000-4000-8000-000000000005.jpg', 1, 1280, 1600, base + interval '40 minutes', base + interval '40 minutes 5 seconds') returning id into p_k2;
  insert into public.mw_photos (owner_id, client_id, audience, file_key, tile_key, size, width, height, created_at, visible_at)
    values (rani, gen_random_uuid(), 'semua', 'main-wam/momen/00000000-0000-4000-8000-000000000006.jpg', 'main-wam/momen/00000000-0000-4000-8000-000000000006-ubin.jpg', 1, 1280, 1600, base + interval '50 minutes', base + interval '50 minutes 5 seconds') returning id into p_rani;
  -- Sent a moment ago: still in its 5 seconds of Batalkan.
  insert into public.mw_photos (owner_id, client_id, audience, file_key, tile_key, size, width, height)
    values (yoga, gen_random_uuid(), 'semua', 'main-wam/momen/00000000-0000-4000-8000-000000000007.jpg', 'main-wam/momen/00000000-0000-4000-8000-000000000007-ubin.jpg', 1, 1280, 1600) returning id into p_fresh;
  -- Hidden by panitia.
  insert into public.mw_photos (owner_id, client_id, audience, file_key, tile_key, size, width, height, created_at, visible_at, status)
    values (ayu, gen_random_uuid(), 'semua', 'main-wam/momen/00000000-0000-4000-8000-000000000008.jpg', 'main-wam/momen/00000000-0000-4000-8000-000000000008-ubin.jpg', 1, 1280, 1600, base, base + interval '5 seconds', 'disembunyikan') returning id into p_hidden;

  -- Semua: photos for everyone that are shown and past their 5 seconds; never a kelompok photo.
  select array_agg(id order by visible_at desc, id desc) into ids from public.mw_photos_for(dimas, g2, 'semua');
  if ids is distinct from array[p_rani, p_new, p_mid, p_old] then raise exception 'semua for Dimas: %', ids; end if;
  -- The sender sees their own photo at once.
  if not exists (select 1 from public.mw_photos_for(yoga, null, 'semua') where id = p_fresh) then raise exception 'the sender should see a fresh photo'; end if;
  if exists (select 1 from public.mw_photos_for(rani, g4, 'semua') where id = p_fresh) then raise exception 'others should not see a photo within its 5 seconds'; end if;

  -- Kelompokku: the kelompok's own photos and its members' photos for everyone; never another kelompok's.
  select array_agg(id order by visible_at desc, id desc) into ids from public.mw_photos_for(rani, g4, 'kelompok');
  if ids is distinct from array[p_rani, p_k4, p_new, p_mid] then raise exception 'kelompok for Rani: %', ids; end if;
  if exists (select 1 from public.mw_photos_for(rani, g4, 'kelompok') where id = p_k2) then raise exception 'a photo for Kelompok 2 seen by Kelompok 4'; end if;
  if exists (select 1 from public.mw_photos_for(dimas, g2, 'semua') where id = p_k4) then raise exception 'a kelompok photo in Semua'; end if;
  if exists (select 1 from public.mw_photos_for(yoga, null, 'kelompok')) then raise exception 'no kelompok, no Kelompokku'; end if;

  -- Fotoku: one's own, any status.
  if (select count(*) from public.mw_photos_for(ayu, null, 'saya')) <> 1 then raise exception 'Fotoku should keep a hidden photo for its owner'; end if;
  if exists (select 1 from public.mw_photos_for(rani, g4, 'semua') where id = p_hidden) then raise exception 'a hidden photo shown to others'; end if;
  raise notice 'PASS: who sees which photo';

  -- The feed: newest first, total, keyset paging both ways.
  select count(*) into n from public.mw_photo_feed(dimas, g2, 'semua', null, false, false, null, null, null, 'older', 2);
  if n <> 2 then raise exception 'page size 2, got %', n; end if;
  if (select max(f.total) from public.mw_photo_feed(dimas, g2, 'semua', null, false, false, null, null, null, 'older', 2) f) <> 4 then raise exception 'total of Semua should be 4'; end if;
  select array_agg(f.id) into ids from public.mw_photo_feed(dimas, g2, 'semua', null, false, false, base + interval '20 minutes 5 seconds', p_new, null, 'older', 10) f;
  if ids is distinct from array[p_mid, p_old] then raise exception 'older than p_new: %', ids; end if;
  select array_agg(f.id) into ids from public.mw_photo_feed(dimas, g2, 'semua', null, false, false, base + interval '20 minutes 5 seconds', p_new, null, 'older_incl', 10) f;
  if ids is distinct from array[p_new, p_mid, p_old] then raise exception 'from p_new: %', ids; end if;
  select array_agg(f.id) into ids from public.mw_photo_feed(dimas, g2, 'semua', null, false, false, base + interval '10 minutes 5 seconds', p_mid, null, 'newer', 10) f;
  if ids is distinct from array[p_new, p_rani] then raise exception 'newer than p_mid (nearest first): %', ids; end if;
  -- One session, and Umum.
  select array_agg(f.id) into ids from public.mw_photo_feed(rani, g4, 'kelompok', team, false, false, null, null, null, 'older', 10) f;
  if ids is distinct from array[p_k4, p_mid] then raise exception 'Team building in Kelompokku: %', ids; end if;
  select array_agg(f.id) into ids from public.mw_photo_feed(dimas, g2, 'semua', null, true, false, null, null, null, 'older', 10) f;
  if ids is distinct from array[p_rani, p_new] then raise exception 'Umum: %', ids; end if;

  -- Reactions, mine, seen; "baru" is every photo of the view, one's own included: unseen ones first, then seen and own.
  perform public.mw_photo_react(p_mid, rani, g4, heart);
  perform public.mw_photo_react(p_mid, dimas, g2, heart);
  select * into r from public.mw_photo_feed(rani, g4, 'semua', null, false, false, null, null, null, 'older', 10) f where f.id = p_mid;
  if r.reactions is distinct from jsonb_build_array(jsonb_build_object('emoji', heart, 'count', 2, 'mine', true)) then raise exception 'reactions of p_mid for Rani: %', r.reactions; end if;
  select * into r from public.mw_photo_feed(dimas, g2, 'semua', null, false, false, null, null, null, 'older', 10) f where f.id = p_new;
  if r.reactions is distinct from '[]'::jsonb then raise exception 'a photo nobody reacted to: %', r.reactions; end if;
  insert into public.mw_photo_seen (photo_id, employee_id) values (p_old, rani);
  select array_agg(f.id order by f.seen, f.visible_at desc, f.id desc) into ids from public.mw_photo_feed(rani, g4, 'semua', null, false, true, null, null, null, 'older', 10) f;
  if ids is distinct from array[p_new, p_mid, p_rani, p_old] then raise exception 'baru for Rani (unseen first, then own and seen): %', ids; end if;
  if (select count(*) from public.mw_photo_feed(rani, g4, 'semua', null, false, true, null, null, null, 'older', 10) f where not f.seen) <> 2 then raise exception 'two unseen for Rani'; end if;
  if (select max(f.total) from public.mw_photo_feed(rani, g4, 'semua', null, false, true, null, null, null, 'older', 10) f) <> 2 then raise exception 'foto baru counts only the unseen, never her own'; end if;
  if not (select f.seen from public.mw_photo_feed(rani, g4, 'semua', null, false, true, null, null, null, 'older', 10) f where f.id = p_rani) then raise exception 'one''s own photo is not new'; end if;
  -- Paging through the two runs: page 1 ends in the unseen run, page 2 is the own and seen run.
  select array_agg(f.id) into ids from public.mw_photo_feed(rani, g4, 'semua', null, false, true, null, null, null, 'older', 2) f;
  if ids is distinct from array[p_new, p_mid] then raise exception 'baru page 1: %', ids; end if;
  select array_agg(f.id) into ids from public.mw_photo_feed(rani, g4, 'semua', null, false, true, base + interval '10 minutes 5 seconds', p_mid, false, 'older', 2) f;
  if ids is distinct from array[p_rani, p_old] then raise exception 'baru page 2 (the run of own and seen): %', ids; end if;
  if (select max(f.total) from public.mw_photo_feed(rani, g4, 'semua', null, false, true, base + interval '10 minutes 5 seconds', p_mid, false, 'older', 2) f) <> 0 then raise exception 'no unseen photo is left after page 1 (total counts the cursor''s own run)'; end if;
  if (select max(f.total) from public.mw_photo_feed(rani, g4, 'semua', null, false, true, null, null, null, 'older', 1) f) <> 2 then raise exception 'page 1 still counts both unseen photos'; end if;
  -- A photo seen meanwhile does not move the cursor: seen p_new, ask for what comes after p_new in the unseen run.
  insert into public.mw_photo_seen (photo_id, employee_id) values (p_new, rani);
  select array_agg(f.id) into ids from public.mw_photo_feed(rani, g4, 'semua', null, false, true, base + interval '20 minutes 5 seconds', p_new, false, 'older', 10) f;
  if ids is distinct from array[p_mid, p_rani, p_new, p_old] then raise exception 'baru after p_new seen meanwhile: %', ids; end if;
  delete from public.mw_photo_seen where photo_id = p_new and employee_id = rani;
  begin perform * from public.mw_photo_feed(rani, g4, 'semua', null, false, true, null, null, null, 'newer', 10); raise exception 'UNEXPECTED: baru only goes older';
  exception when raise_exception then if sqlerrm <> 'MW_FEED_DIRECTION' then raise; end if; end;
  if not (select f.seen from public.mw_photo_feed(rani, g4, 'semua', null, false, false, null, null, null, 'older', 10) f where f.id = p_rani) then raise exception 'one''s own photo counts as seen'; end if;
  begin perform * from public.mw_photo_feed(rani, g4, 'semua; drop', null, false, false, null, null, null, 'older', 10); raise exception 'UNEXPECTED: an unknown view';
  exception when raise_exception then if sqlerrm <> 'MW_FEED_VIEW' then raise; end if; end;

  -- Session counts (null = Umum).
  if (select photos from public.mw_photo_session_counts(rani, g4, 'kelompok') where session_id = team) <> 2 then raise exception 'Team building should count 2 in Kelompokku'; end if;
  if (select photos from public.mw_photo_session_counts(dimas, g2, 'semua') where session_id is null) <> 2 then raise exception 'Umum should count 2 in Semua'; end if;
  raise notice 'PASS: the feed pages, counts, reactions and seen';

  -- Reactions: one per person (a new emoji replaces the old), counted by emoji, the most given first, taken back with null.
  reacts := public.mw_photo_react(p_mid, bima, g4, laugh);
  if jsonb_array_length(reacts) <> 2 or reacts -> 0 <> jsonb_build_object('emoji', heart, 'count', 2, 'mine', false) or reacts -> 1 <> jsonb_build_object('emoji', laugh, 'count', 1, 'mine', true) then
    raise exception 'two hearts, one laugh, for Bima: %', reacts;
  end if;
  reacts := public.mw_photo_react(p_mid, rani, g4, laugh);
  if (select count(*) from public.mw_photo_reactions where photo_id = p_mid) <> 3 then raise exception 'a new emoji should replace the old one, not add'; end if;
  if reacts -> 0 <> jsonb_build_object('emoji', laugh, 'count', 2, 'mine', true) or reacts -> 1 <> jsonb_build_object('emoji', heart, 'count', 1, 'mine', false) then
    raise exception 'Rani changed her heart to a laugh: %', reacts;
  end if;
  reacts := public.mw_photo_react(p_mid, rani, g4, laugh);
  if (select count(*) from public.mw_photo_reactions where photo_id = p_mid) <> 3 then raise exception 'the same emoji again should change nothing'; end if;
  reacts := public.mw_photo_react(p_mid, rani, g4, null);
  if reacts is distinct from public.mw_photo_reactions(p_mid, rani) or jsonb_array_length(reacts) <> 2 or reacts::text like '%"mine": true%' then raise exception 'taken back by Rani: %', reacts; end if;
  perform public.mw_photo_react(p_mid, rani, g4, null);
  if (select count(*) from public.mw_photo_reactions where photo_id = p_mid) <> 2 then raise exception 'taking back twice should be harmless'; end if;
  perform public.mw_photo_react(p_mid, rani, g4, heart);
  -- Never on one's own photo, nor on one the person cannot see: hidden, within its 5 seconds, another kelompok's, unknown.
  begin perform public.mw_photo_react(p_mid, sari, g4, heart); raise exception 'UNEXPECTED: a reaction on one''s own photo';
  exception when raise_exception then if sqlerrm <> 'MW_PHOTO_OWN' then raise; end if; end;
  begin perform public.mw_photo_react(p_hidden, rani, g4, heart); raise exception 'UNEXPECTED: a reaction on a hidden photo';
  exception when raise_exception then if sqlerrm <> 'MW_PHOTO_NOT_FOUND' then raise; end if; end;
  begin perform public.mw_photo_react(p_fresh, rani, g4, heart); raise exception 'UNEXPECTED: a reaction within the 5 seconds';
  exception when raise_exception then if sqlerrm <> 'MW_PHOTO_NOT_FOUND' then raise; end if; end;
  begin perform public.mw_photo_react(p_k2, rani, g4, heart); raise exception 'UNEXPECTED: a reaction on another kelompok''s photo';
  exception when raise_exception then if sqlerrm <> 'MW_PHOTO_NOT_FOUND' then raise; end if; end;
  begin perform public.mw_photo_react(gen_random_uuid(), rani, g4, heart); raise exception 'UNEXPECTED: a reaction on no photo';
  exception when raise_exception then if sqlerrm <> 'MW_PHOTO_NOT_FOUND' then raise; end if; end;
  -- A short text only (the app checks its list): 1 to 16 characters.
  begin perform public.mw_photo_react(p_mid, rani, g4, ''); raise exception 'UNEXPECTED: an empty emoji';
  exception when check_violation then null; end;
  begin perform public.mw_photo_react(p_mid, rani, g4, repeat('a', 17)); raise exception 'UNEXPECTED: a 17-character emoji';
  exception when check_violation then null; end;
  if (select count(*) from public.mw_photo_reactions where photo_id = p_mid) <> 3 then raise exception 'a refused reaction left a row'; end if;
  perform public.mw_photo_react(p_mid, rani, g4, null);
  raise notice 'PASS: reactions (one per person, replaced, taken back, counted, never on one''s own, hidden or unseen photo)';

  -- Reports: not one's own; one per person; the third reporter hides it once.
  begin perform * from public.mw_photo_report(p_mid, sari, 'tidak_pantas', '', 3); raise exception 'UNEXPECTED: reporting one''s own photo';
  exception when raise_exception then if sqlerrm <> 'MW_PHOTO_OWN' then raise; end if; end;
  select * into r from public.mw_photo_report(p_mid, rani, 'tidak_setuju', '', 3);
  if r.reporters <> 1 or r.hidden or r.owner_id <> sari then raise exception 'first report: %', r; end if;
  -- Hidden for the reporter only.
  if exists (select 1 from public.mw_photos_for(rani, g4, 'semua') where id = p_mid) then raise exception 'a reported photo shown to its reporter'; end if;
  begin perform public.mw_photo_react(p_mid, rani, g4, fire); raise exception 'UNEXPECTED: a reaction on a photo hidden for its reporter';
  exception when raise_exception then if sqlerrm <> 'MW_PHOTO_NOT_FOUND' then raise; end if; end;
  if not exists (select 1 from public.mw_photos_for(dimas, g2, 'semua') where id = p_mid) then raise exception 'one report should not hide it for others'; end if;
  update public.mw_photo_reports set created_at = now() - interval '1 hour' where photo_id = p_mid and reporter_id = rani;
  select * into r from public.mw_photo_report(p_mid, rani, 'tidak_pantas', '', 3);
  if r.reporters <> 1 then raise exception 'the same person counted twice'; end if;
  if (select created_at from public.mw_photo_reports where photo_id = p_mid and reporter_id = rani) < now() - interval '1 minute' then
    raise exception 'a report made again should take the new time (panitia''s queue)';
  end if;
  if (select reason from public.mw_photo_reports where photo_id = p_mid and reporter_id = rani) <> 'tidak_pantas' then raise exception 'the new reason should replace the old'; end if;
  -- "Tampilkan lagi".
  update public.mw_photo_reports set unhidden_at = now() where photo_id = p_mid and reporter_id = rani;
  if not exists (select 1 from public.mw_photos_for(rani, g4, 'semua') where id = p_mid) then raise exception 'Tampilkan lagi should show it to the reporter'; end if;
  select * into r from public.mw_photo_report(p_mid, dimas, 'tidak_pantas', '', 3);
  if r.hidden then raise exception 'two reports should not hide it'; end if;
  begin perform * from public.mw_photo_report(p_mid, bima, 'lainnya', '  ', 3); raise exception 'UNEXPECTED: Lainnya without a note';
  exception when check_violation then null; end;
  select * into r from public.mw_photo_report(p_mid, bima, 'lainnya', 'Belum siap difoto.', 3);
  if not r.hidden or r.reporters <> 3 then raise exception 'the third reporter should hide it: %', r; end if;
  if (select status from public.mw_photos where id = p_mid) <> 'ditinjau' then raise exception 'hidden for review'; end if;
  if exists (select 1 from public.mw_photos_for(yoga, null, 'semua') where id = p_mid) then raise exception 'a photo in review shown'; end if;
  -- Panitia show it again: later reports do not hide it again.
  update public.mw_photos set status = 'tampil', hidden_at = null where id = p_mid;
  select * into r from public.mw_photo_report(p_mid, ayu, 'tidak_pantas', '', 3);
  if r.hidden or (select status from public.mw_photos where id = p_mid) <> 'tampil' then raise exception 'reviewed photo hidden again'; end if;
  begin perform * from public.mw_photo_report(gen_random_uuid(), ayu, 'tidak_pantas', '', 3); raise exception 'UNEXPECTED: a report on no photo';
  exception when raise_exception then if sqlerrm <> 'MW_PHOTO_NOT_FOUND' then raise; end if; end;
  raise notice 'PASS: reports';

  -- Mozaik: for everyone, shown, with a tile, at least 5 minutes old; the order given; stable.
  n := public.mw_mosaic_place(array[7, 3, 5, 1, 2, 9, 4], 300);
  -- p_old, p_mid, p_new, p_rani qualify (p_k4 is for a kelompok, p_fresh is too new, p_hidden hidden, p_k2 has no tile).
  if n <> 4 then raise exception 'placed %, expected 4', n; end if;
  -- Oldest first into the cells in the order given: p_old 7, p_mid 3, p_new 5, p_rani 1.
  if (select tile from public.mw_mosaic_tiles where photo_id = p_old) <> 7 or (select tile from public.mw_mosaic_tiles where photo_id = p_mid) <> 3
    or (select tile from public.mw_mosaic_tiles where photo_id = p_new) <> 5 or (select tile from public.mw_mosaic_tiles where photo_id = p_rani) <> 1 then
    raise exception 'cells not in the given order';
  end if;
  if exists (select 1 from public.mw_mosaic_tiles where photo_id in (p_k4, p_fresh, p_hidden, p_k2)) then raise exception 'a photo that should not be in the mosaic'; end if;
  if public.mw_mosaic_place(array[7, 3, 5, 1, 2, 9, 4], 300) <> 0 then raise exception 'placing again should place nothing'; end if;
  -- The version (the ETag, audit R3): the same while nothing changes; only cells inside the grid count.
  v1 := public.mw_mosaic_version(100);
  if v1 !~ '^[0-9a-f]{32}$' or public.mw_mosaic_version(100) <> v1 then raise exception 'the version should be stable: %', v1; end if;
  if public.mw_mosaic_version(6) = v1 then raise exception 'cell 7 is outside a grid of 6 and should not count'; end if;
  -- A photo deleted frees its cell, which the next photo fills; the others stay where they are.
  delete from public.mw_photos where id = p_new;
  if public.mw_mosaic_version(100) = v1 then raise exception 'a tile gone should change the version'; end if;
  update public.mw_photos set created_at = base, visible_at = base + interval '1 minute' where id = p_fresh;
  n := public.mw_mosaic_place(array[7, 3, 5, 1, 2, 9, 4], 300);
  if n <> 1 or (select photo_id from public.mw_mosaic_tiles where tile = 5) <> p_fresh then raise exception 'the freed cell should take the next photo'; end if;
  if (select tile from public.mw_mosaic_tiles where photo_id = p_old) <> 7 then raise exception 'a placed photo moved'; end if;
  v2 := public.mw_mosaic_version(100);
  if v2 = v1 then raise exception 'another photo in cell 5 should change the version'; end if;
  -- In review (third report): out of the manifest, so out of the version; shown again: the same as before.
  update public.mw_photos set status = 'ditinjau' where id = p_old;
  if public.mw_mosaic_version(100) = v2 then raise exception 'a tile in review should change the version'; end if;
  update public.mw_photos set status = 'tampil' where id = p_old;
  if public.mw_mosaic_version(100) <> v2 then raise exception 'shown again: the version should come back'; end if;
  -- Hidden for good by panitia: its cell is freed on the next placement.
  update public.mw_photos set status = 'disembunyikan' where id = p_mid;
  perform public.mw_mosaic_place(array[7, 3, 5, 1, 2, 9, 4], 300);
  if exists (select 1 from public.mw_mosaic_tiles where photo_id = p_mid) then raise exception 'a photo hidden by panitia kept its cell'; end if;
  raise notice 'PASS: the mosaic places photos in a stable order, its version follows the tiles';

  -- Audit M3: a photo nominated for Awarding is not deleted (Hapus foto answers 409 on 23503), and
  -- its nomination stays; no longer nominated, it is deleted with its reactions and its mosaic cell.
  insert into public.mw_award_categories (title, method, nominee_kind) values ('Foto terbaik uji', 'juri', 'foto') returning id into cat;
  insert into public.mw_award_nominees (category_id, photo_id) values (cat, p_old);
  perform public.mw_photo_react(p_old, rani, g4, fire);
  begin
    delete from public.mw_photos where id = p_old;
    raise exception 'UNEXPECTED: a nominated photo deleted';
  exception when foreign_key_violation then
    get stacked diagnostics msg = returned_sqlstate;
    if msg <> '23503' then raise exception 'expected 23503, got %', msg; end if;
  end;
  if not exists (select 1 from public.mw_photos where id = p_old) or not exists (select 1 from public.mw_award_nominees where photo_id = p_old)
    or not exists (select 1 from public.mw_mosaic_tiles where photo_id = p_old) then
    raise exception 'the nominated photo, its nomination or its cell went';
  end if;
  delete from public.mw_award_nominees where category_id = cat;
  delete from public.mw_photos where id = p_old;
  if exists (select 1 from public.mw_photo_reactions where photo_id = p_old) or exists (select 1 from public.mw_mosaic_tiles where photo_id = p_old) then
    raise exception 'reactions and the mosaic cell should go with the photo';
  end if;
  raise notice 'PASS: a nominated photo cannot be deleted (23503)';
end $$;
reset role;

-- Nothing of it with the public keys.
set local role anon;
do $$ begin
  begin perform * from public.mw_photo_feed(gen_random_uuid(), null, 'semua', null, false, false, null, null, null, 'older', 10); raise exception 'UNEXPECTED: anon reads the feed';
  exception when insufficient_privilege then null; end;
  begin perform public.mw_mosaic_place(array[1], 0); raise exception 'UNEXPECTED: anon places mosaic tiles';
  exception when insufficient_privilege then null; end;
  begin perform public.mw_photo_react(gen_random_uuid(), gen_random_uuid(), null, chr(10084)); raise exception 'UNEXPECTED: anon reacts';
  exception when insufficient_privilege then null; end;
  begin perform public.mw_photo_reactions(gen_random_uuid(), gen_random_uuid()); raise exception 'UNEXPECTED: anon reads reactions';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from public.mw_photo_reactions; raise exception 'UNEXPECTED: anon reads the reactions table';
  exception when insufficient_privilege then null; end;
  begin perform public.mw_mosaic_version(100); raise exception 'UNEXPECTED: anon reads the mosaic version';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: Momen functions closed to anon';
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin perform * from public.mw_photo_report(gen_random_uuid(), gen_random_uuid(), 'tidak_pantas', '', 3); raise exception 'UNEXPECTED: authenticated reports';
  exception when insufficient_privilege then null; end;
  begin perform public.mw_photo_react(gen_random_uuid(), gen_random_uuid(), null, chr(10084)); raise exception 'UNEXPECTED: authenticated reacts';
  exception when insufficient_privilege then null; end;
  begin perform * from public.mw_photo_session_counts(gen_random_uuid(), null, 'semua'); raise exception 'UNEXPECTED: authenticated counts';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: Momen functions closed to authenticated';
end $$;
reset role;

rollback;
