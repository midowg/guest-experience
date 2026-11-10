-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- TV Announcement: how the board looks (10 Nov 2026). The admin picks dark or light (the colours
-- stay the WAM theme's), and may put a QR code on the board: where it points (empty = the TV's
-- own address), a short line under it, and the corner it sits in. Needs 202611100003.
-- ROLLBACK (by hand): alter table public.pw_tv_settings drop column mode, drop column qr_show,
--   drop column qr_url, drop column qr_label, drop column qr_position;
begin;

alter table public.pw_tv_settings
  add column mode text not null default 'dark' check (mode in ('dark', 'light')),
  add column qr_show boolean not null default false,
  add column qr_url text not null default '' check (char_length(qr_url) <= 500 and (qr_url = '' or qr_url ~* '^https?://')),
  add column qr_label text not null default '' check (char_length(qr_label) <= 60),
  add column qr_position text not null default 'kanan-bawah' check (qr_position in ('kanan-bawah', 'kiri-bawah', 'kanan-atas', 'kiri-atas'));

commit;
