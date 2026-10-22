-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Studio Poster: the "poster-sesi" template may be shown to regular admins, and the "poster"
-- module may be switched off for them. The poster itself lives in events.content (no column).
begin;

alter table public.admin_settings drop constraint admin_settings_enabled_templates_check;
alter table public.admin_settings add constraint admin_settings_enabled_templates_check
  check (enabled_templates <@ array['kunjungan-klien','gala-dinner','seminar-launching','annual-meeting','nyadran','csr-kegiatan-sosial','pelatihan-bootcamp','trip-klien','poster-sesi']::text[]);

alter table public.admin_settings drop constraint admin_settings_disabled_modules_check;
alter table public.admin_settings add constraint admin_settings_disabled_modules_check
  check (disabled_modules <@ array[
    'experience','agenda','location','route','gallery','prepare','team','rsvp','personal','contact','bilingual','feedback','review','collaboration','poster'
  ]::text[]);

commit;
