-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;

set local role service_role;
do $$ begin
  update public.admin_settings set enabled_templates = array['kunjungan-klien','handbook-trip','panduan-lokasi'];
  if (select enabled_templates from public.admin_settings) <> array['kunjungan-klien','handbook-trip','panduan-lokasi'] then raise exception 'handbook-trip should be accepted'; end if;
  begin update public.admin_settings set enabled_templates = array['handbook-lain']; raise exception 'UNEXPECTED: unknown template';
  exception when check_violation then null; end;
  raise notice 'PASS: handbook-trip and panduan-lokasi may be offered, unknown templates may not';
end $$;
reset role;

rollback;
