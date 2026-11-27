-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization (the owner runs it).
-- Main WAM, Misi redesigned around photos (docs/main-wam/KONTRAK.md §13, keputusan pemilik 24 Nov 2026):
-- every mission is confirmed by a photo, has rules (TNC), tags friends, and a proof goes down a road:
-- dikirim → diperiksa → disetujui | perlu_ditinjau | ditolak. Points still come only with "disetujui".
--   mw_missions.rules            the TNC as jsonb (src/lib/main-wam/misi/rules.ts): foto_langsung, lokasi,
--                                tag, pose, waktu, batas_kali. Old missions keep [] (their columns stand in).
--   mw_mission_completions       status gains dikirim, diperiksa, perlu_ditinjau ("menunggu" stays: the
--                                older word for perlu_ditinjau); attempts counts the proofs sent (a
--                                rejected one counts, batas_kali), photo_id links the Momen photo made from
--                                the proof, check_result keeps what the automatic checks and the verifier said.
--   mw_photos.mission_id         the mission a Momen photo came from ("Misi: <judul>").
--   mw_photo_tags                who is tagged on a photo, by whom, and when they lifted their own tag.
-- mw_completion_points (202611260001) is unchanged: it gives a ledger row for "disetujui" only and removes
-- it for any other status, so the new statuses never carry points (covered by main-wam-misi-foto-check.sql).
-- Server only (service role). Needs 202611260001 (Misi) and 202611200002 (Momen).
-- ROLLBACK (by hand): drop table public.mw_photo_tags; drop index mw_photos_mission; alter table public.mw_photos drop column mission_id;
--   drop index mw_mission_completions_photo; alter table public.mw_mission_completions drop column check_result, drop column photo_id, drop column attempts;
--   update public.mw_mission_completions set status = 'menunggu' where status in ('dikirim', 'diperiksa', 'perlu_ditinjau');
--   alter table public.mw_mission_completions drop constraint mw_mission_completions_status_check;
--   alter table public.mw_mission_completions add constraint mw_mission_completions_status_check check (status in ('menunggu', 'disetujui', 'ditolak'));
--   alter table public.mw_missions drop column rules;
begin;

alter table public.mw_missions
  add column rules jsonb not null default '[]'::jsonb check (jsonb_typeof(rules) = 'array' and jsonb_array_length(rules) <= 10);

alter table public.mw_mission_completions drop constraint if exists mw_mission_completions_status_check;
alter table public.mw_mission_completions add constraint mw_mission_completions_status_check
  check (status in ('menunggu', 'dikirim', 'diperiksa', 'perlu_ditinjau', 'disetujui', 'ditolak'));
alter table public.mw_mission_completions
  add column attempts integer not null default 1 check (attempts between 1 and 50),
  add column photo_id uuid references public.mw_photos (id) on delete set null,
  add column check_result jsonb check (check_result is null or jsonb_typeof(check_result) = 'object');
create index mw_mission_completions_photo on public.mw_mission_completions (photo_id) where photo_id is not null;

alter table public.mw_photos add column mission_id uuid references public.mw_missions (id) on delete set null;
create index mw_photos_mission on public.mw_photos (mission_id) where mission_id is not null;

create table public.mw_photo_tags (
  photo_id uuid not null references public.mw_photos (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  tagged_by uuid not null references public.employees (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Set when the tagged person lifts their own tag; the row stays so a re-sent photo never tags them again.
  removed_at timestamptz,
  primary key (photo_id, employee_id),
  constraint mw_photo_tags_self check (employee_id <> tagged_by),
  constraint mw_photo_tags_removed check (removed_at is null or removed_at >= created_at)
);
create index mw_photo_tags_person on public.mw_photo_tags (employee_id) where removed_at is null;
create index mw_photo_tags_by on public.mw_photo_tags (tagged_by);

alter table public.mw_photo_tags enable row level security;
revoke all on public.mw_photo_tags from public, anon, authenticated;
grant select, insert, update, delete on public.mw_photo_tags to service_role;

commit;
