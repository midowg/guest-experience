-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Which templates regular admins see in "Buat acara", chosen by the super admin. The platform
-- starts with the two client-hosting templates; the others wait until the super admin shows them.
begin;

alter table public.admin_settings
  add column enabled_templates text[] not null default array['kunjungan-klien','trip-klien']::text[]
    check (enabled_templates <@ array['kunjungan-klien','gala-dinner','seminar-launching','annual-meeting','nyadran','csr-kegiatan-sosial','pelatihan-bootcamp','trip-klien']::text[]);

commit;
