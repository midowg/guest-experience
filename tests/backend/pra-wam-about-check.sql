-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
set local role service_role;
do $$
begin
  if exists (select 1 from public.pw_about) then raise exception 'about should start empty (the app shows its default)'; end if;
  insert into public.pw_about (title, summary, body, points)
    values ('Apa itu WAM?', 'Pertemuan tahunan Werkudara.', 'Paragraf pertama yang cukup panjang.', array['Kapan: 4–7 Jan 2027']);
  begin insert into public.pw_about (title, summary, body) values ('Kedua', 'Ringkasan kedua.', 'Isi kedua yang cukup panjang.'); raise exception 'UNEXPECTED: a second row';
  exception when unique_violation then null; end;
  begin insert into public.pw_about (id, title, summary, body) values (false, 'Kedua', 'Ringkasan kedua.', 'Isi kedua yang cukup panjang.'); raise exception 'UNEXPECTED: a row other than the one';
  exception when check_violation then null; end;
  begin update public.pw_about set title = ' '; raise exception 'UNEXPECTED: empty title';
  exception when check_violation then null; end;
  begin update public.pw_about set body = repeat('x', 4001); raise exception 'UNEXPECTED: body too long';
  exception when check_violation then null; end;
  begin update public.pw_about set points = array['a1','a2','a3','a4','a5','a6','a7']; raise exception 'UNEXPECTED: seven points';
  exception when check_violation then null; end;
  -- Saving again replaces the one row; removing it brings the default back.
  insert into public.pw_about (id, title, summary, body) values (true, 'Tentang WAM', 'Ringkasan baru di sini.', 'Isi baru yang cukup panjang.')
    on conflict (id) do update set title = excluded.title, summary = excluded.summary, body = excluded.body, points = excluded.points, updated_at = now();
  if (select title from public.pw_about) <> 'Tentang WAM' or (select cardinality(points) from public.pw_about) <> 0 then raise exception 'upsert did not replace the row'; end if;
  delete from public.pw_about;
  raise notice 'PASS: one about row, limits held, upsert replaces it';
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.pw_about; raise exception 'UNEXPECTED: anon read about';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: about is server only';
end $$;
reset role;

set local role authenticated;
do $$ begin
  begin insert into public.pw_about (title, summary, body) values ('Judul', 'Ringkasan uji.', 'Isi uji yang cukup panjang.'); raise exception 'UNEXPECTED: authenticated wrote about';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: only the server writes about';
end $$;
reset role;

rollback;
