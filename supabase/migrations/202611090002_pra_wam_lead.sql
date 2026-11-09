-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611060002.
--
-- Lead (decided 9 Nov 2026): there is no "lead BU". A Lead is a team lead inside a department,
-- just under the HOD (almost the same level), with their own people under them through
-- employees.reports_to ("Atasan langsung"). A BU is only the business unit a person belongs to
-- inside Werkudara Group. Set in Data karyawan (Ubah karyawan → Struktur dan akses → Lead).
--   * pw_leads gets the kind 'lead' (name = the Lead's department, for reading the table by hand).
--   * The old 'bu' rows stay (no data is dropped) but the app no longer reads them.
-- Before this runs, ticking Lead says it is waiting for this migration; HOD keeps working.
--
-- ROLLBACK (by hand): delete from public.pw_leads where kind = 'lead';
-- alter table public.pw_leads drop constraint pw_leads_kind_check;
-- alter table public.pw_leads add constraint pw_leads_kind_check check (kind in ('departemen', 'bu'));
begin;

alter table public.pw_leads drop constraint if exists pw_leads_kind_check;
alter table public.pw_leads add constraint pw_leads_kind_check check (kind in ('departemen', 'bu', 'lead'));

commit;
