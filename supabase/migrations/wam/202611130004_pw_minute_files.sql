-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611130003.
--
-- MoM sebagai berkas (decided 13 Nov 2026): instead of filling the form, whoever may write a
-- meeting's MoM can upload its MoM as one file (PDF, DOC or DOCX, at most 10 MB). With Kirim MoM it
-- counts as the MoM: it goes to the Telegram groups as the document, and Arsip MoM lists it.
-- One file per meeting (a new upload replaces it); the file itself is in private R2 storage under
-- pra-wam/mom/<session>/berkas/. A new table only; nothing existing changes.
-- Read and written only by the server (service role).
--
-- ROLLBACK (by hand): drop table public.pw_session_minute_files;
begin;

create table if not exists public.pw_session_minute_files (
  session_id uuid primary key references public.pw_sessions (id) on delete cascade,
  file_key text not null unique check (char_length(file_key) between 1 and 300),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  size integer not null check (size between 1 and 10485760),
  content_type text not null check (content_type in (
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  uploaded_by uuid references public.employees (id) on delete set null,
  uploaded_at timestamptz not null default now()
);

alter table public.pw_session_minute_files enable row level security;
revoke all on public.pw_session_minute_files from anon, authenticated;
grant select, insert, update, delete on public.pw_session_minute_files to service_role;

commit;
