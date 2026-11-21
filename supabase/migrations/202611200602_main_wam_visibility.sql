-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Main WAM tersembunyi (20 Nov 2026, keputusan pemilik; docs/main-wam/KONTRAK.md §14): Pra WAM's committee
-- and admins are not the WAM team, so Main WAM (Kuis live included) shows nowhere in Journey until the
-- super admin presses "Tampilkan" in Super admin → Halaman utama. One switch on the admin's settings row,
-- off by default, with when and by whom it was last switched. Before this migration the app treats Main
-- WAM as hidden (Admin WAM's menu without Main WAM, /wam never sending on to /wam/acara, Main WAM's notes
-- only to the listed penguji); Main WAM's own pages still open by their address.
-- Server only (admin_settings is service-role only since 202610200006). Needs 202610200006.
-- ROLLBACK (by hand): alter table public.admin_settings drop column main_wam_shown, drop column main_wam_shown_at, drop column main_wam_shown_by;
begin;

alter table public.admin_settings
  add column if not exists main_wam_shown boolean not null default false,
  add column if not exists main_wam_shown_at timestamptz,
  add column if not exists main_wam_shown_by text check (main_wam_shown_by is null or char_length(main_wam_shown_by) <= 150);

-- Still server only (the same grants as 202610200006, stated again for the new columns).
revoke all on public.admin_settings from public, anon, authenticated;
grant select, update on public.admin_settings to service_role;

commit;
