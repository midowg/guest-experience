-- Execute ONLY against the disposable PostgreSQL migration-check container.
-- Migration 202611250001: Refleksi Leader. One form row with a CMS key; answers by a key's sha256;
-- nobody but service_role reads either table.
begin;
do $$
declare
  hash text := encode(sha256(convert_to('contoh-kunci-uji-yang-cukup-panjang-123', 'UTF8')), 'hex');
begin
  if (select count(*) from public.lr_form) <> 1 then raise exception 'the migration did not make the form row'; end if;
  if (select admin_key_hash from public.lr_form) !~ '^[0-9a-f]{64}$' then raise exception 'the CMS key is not kept as a sha256'; end if;

  -- One form row only.
  begin insert into public.lr_form (id, admin_key_hash) values (2, hash); raise exception 'UNEXPECTED: a second form row';
  exception when check_violation then null; end;

  insert into public.lr_responses (name, team, target_status, answers, own_key_hash)
    values ('Contoh Satu', 'Tim Uji', 'sebagian', '[{"id":"belum","label":"Q","text":"A"}]', hash);
  -- The same key twice is one answer.
  begin insert into public.lr_responses (name, team, target_status, answers, own_key_hash) values ('Contoh Dua', 'Tim Uji', 'belum', '[]', hash); raise exception 'UNEXPECTED: one key, two answers';
  exception when unique_violation then null; end;
  begin insert into public.lr_responses (name, team, target_status, answers, own_key_hash) values ('Contoh Tiga', 'Tim Uji', 'lumayan', '[]', md5('x') || md5('y')); raise exception 'UNEXPECTED: unknown target status';
  exception when check_violation then null; end;
  begin insert into public.lr_responses (name, team, target_status, answers, own_key_hash) values (' ', 'Tim Uji', 'belum', '[]', md5('a') || md5('b')); raise exception 'UNEXPECTED: empty name';
  exception when check_violation then null; end;
end $$;

-- The browser roles read nothing.
set local role anon;
do $$ begin
  perform 1 from public.lr_responses; raise exception 'UNEXPECTED: anon reads lr_responses';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform 1 from public.lr_form; raise exception 'UNEXPECTED: anon reads lr_form';
exception when insufficient_privilege then null; end $$;
reset role;
rollback;
