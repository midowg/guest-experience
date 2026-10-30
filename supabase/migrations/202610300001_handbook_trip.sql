-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Handbook trip: a client trip's handbook (transport, hotel, help contacts, do & don't) as its own
-- template. The parts live in the event document (content.trip), so only the list of templates the
-- super admin may offer changes. "panduan-lokasi" was added to the code without this
-- list; it is included here so it can be offered too.
begin;

alter table public.admin_settings drop constraint admin_settings_enabled_templates_check;
alter table public.admin_settings add constraint admin_settings_enabled_templates_check
  check (enabled_templates <@ array['kunjungan-klien','gala-dinner','seminar-launching','annual-meeting','nyadran','csr-kegiatan-sosial','pelatihan-bootcamp','trip-klien','poster-sesi','e-guide','panduan-lokasi','handbook-trip']::text[]);

commit;
