-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- WAM: absen sesi pakai wajah (decided 22 Nov 2026), besides the printed QR. The participant takes
-- one photo in Detail sesi; the phone turns it into SFace's 128 numbers and the server compares them
-- with the person's reference face of WG People (pw_face_profiles, the same database). The photo is
-- kept as proof like an online check-in's Zoom screenshot, in the same private folder
-- pra-wam/absen/<session>/<employee>/, so proof_key holds it and "Lihat bukti" opens it.
--   face_score:  the cosine score (cocok from 0.363, perlu cek from 0.300; below is not recorded);
--   face_status: cocok, perlu_cek (recorded, panitia looks), disahkan (panitia looked and agreed,
--                face_checked_by says who).
-- Same window and one row per person per session as before. Needs 202611050003 and 202611200701.
-- Server only. The code works before this runs: the face button stays away.
--
-- ROLLBACK (by hand, after deleting the wajah rows):
--   alter table public.pw_attendance drop constraint pw_attendance_face;
--   alter table public.pw_attendance drop column face_checked_by, drop column face_status, drop column face_score;
--   then restore the two checks of 202611050003.
begin;

alter table public.pw_attendance drop constraint pw_attendance_method_check;
alter table public.pw_attendance add constraint pw_attendance_method_check
  check (method in ('qr', 'manual', 'offline', 'online', 'wajah'));

alter table public.pw_attendance add column face_score real;
alter table public.pw_attendance add column face_status text check (face_status in ('cocok', 'perlu_cek', 'disahkan'));
-- Who of panitia agreed to a perlu_cek face (recorded_by stays for manual rows only).
alter table public.pw_attendance add column face_checked_by uuid references public.employees (id) on delete set null;
-- A face check-in always has its score and status, and nothing else has them.
alter table public.pw_attendance add constraint pw_attendance_face check (
  (method = 'wajah') = (face_score is not null and face_status is not null)
  and (face_score is null or face_score between -1 and 1)
);

-- The photo of a face check-in is kept like the Zoom screenshot of an online one.
alter table public.pw_attendance drop constraint pw_attendance_online_proof;
alter table public.pw_attendance add constraint pw_attendance_online_proof check ((method in ('online', 'wajah')) = (proof_key is not null));

commit;
