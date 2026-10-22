-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;

set local role service_role;
do $$ begin
  if (select enabled_templates from public.admin_settings) <> array['kunjungan-klien','trip-klien'] then raise exception 'client templates should be the default'; end if;
  update public.admin_settings set enabled_templates = array['kunjungan-klien','nyadran'];
  if (select enabled_templates from public.admin_settings) <> array['kunjungan-klien','nyadran'] then raise exception 'update failed'; end if;
  update public.admin_settings set enabled_templates = '{}';
  begin update public.admin_settings set enabled_templates = array['ulang-tahun']; raise exception 'UNEXPECTED: unknown template';
  exception when check_violation then null; end;
  raise notice 'PASS: client templates by default, known templates only, may be empty';
end $$;
reset role;

rollback;
