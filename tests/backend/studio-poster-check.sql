-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;

set local role service_role;
do $$ begin
  update public.admin_settings set enabled_templates = array['kunjungan-klien','poster-sesi'];
  update public.admin_settings set disabled_modules = array['poster','team'];
  begin update public.admin_settings set enabled_templates = array['ulang-tahun']; raise exception 'UNEXPECTED: unknown template';
  exception when check_violation then null; end;
  begin update public.admin_settings set disabled_modules = array['poster-lain']; raise exception 'UNEXPECTED: unknown module';
  exception when check_violation then null; end;
  raise notice 'PASS: poster template and module allowed, unknown ones still refused';
end $$;
reset role;

rollback;
