-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- WAM: a participant signs themselves in for a session with "Saya hadir" (decided 5 Nov 2026),
-- besides the printed QR and panitia's hand correction. They choose where they are: at the office
-- (offline, one tap) or online through Zoom, which needs a screenshot of the meeting as proof. The
-- screenshot lives in private R2 storage under pra-wam/absen/<session>/<employee>/; only its key is
-- kept here, and the server shows it to panitia and BOD through a short-lived address. Same window
-- as the QR (30 minutes before the start to 30 minutes after the end), one row per person per
-- session. Needs 202611040005. Server only.
begin;

-- qr: scanned the printed QR; manual: panitia marked them; offline: "Saya hadir" at the office;
-- online: "Saya hadir" through Zoom, with a screenshot.
alter table public.pw_attendance drop constraint pw_attendance_method_check;
alter table public.pw_attendance add constraint pw_attendance_method_check
  check (method in ('qr', 'manual', 'offline', 'online'));

-- The Zoom screenshot of an online check-in, in this person's own folder for this session.
alter table public.pw_attendance add column proof_key text;
alter table public.pw_attendance add constraint pw_attendance_proof_key check (
  proof_key is null or (
    proof_key ~ '^pra-wam/absen/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$'
    and proof_key like 'pra-wam/absen/' || session_id || '/' || employee_id || '/%'
  )
);
-- Online always has its proof, and only online has one. Manual still records who (pw_attendance_manual).
alter table public.pw_attendance add constraint pw_attendance_online_proof check ((method = 'online') = (proof_key is not null));

commit;
