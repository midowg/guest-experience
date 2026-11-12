-- LOCAL REVIEW ONLY. Run by the owner in the Supabase SQL Editor, after 202611120007.
--
-- Nomor surat MoM (13 Nov 2026): the notetaker types the MoM's number in the form, as taken from
-- the register in SharePoint (MOM_NUMBER_REGISTER in src/lib/pra-wam/minutes.ts), e.g.
-- "001/MoM/BAS/XI/2026". When given, it is the MoM's number everywhere (PDF, Telegram, Arsip MoM);
-- without it the automatic number (pw_session_minutes.number, "MoM/2026/11/0012") stands.
--
--   * pw_session_minutes.doc_number: as typed, 1 to 60 characters; null = none yet.
--
-- Purely additive. Until this runs the app reads and saves the MoM without it (the number typed
-- is not kept, and the automatic number is used).
--
-- ROLLBACK:
--   begin;
--   alter table public.pw_session_minutes drop column if exists doc_number;
--   commit;

begin;

alter table public.pw_session_minutes add column if not exists doc_number text
  check (doc_number is null or char_length(doc_number) between 1 and 60);

comment on column public.pw_session_minutes.doc_number is
  'Nomor surat MoM as typed by the notetaker (from the SharePoint register); null = none, then the automatic number stands.';

commit;
