-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611060002.
--
-- Business Unit as its short code (decided 6 Nov 2026): MRP, WNS, TEE, NMU, WNN. Everyone who was
-- given the full name "Werkudara Nirwana Sakti" (the default of 202611060002) becomes WNS, and the
-- default is WNS from now on; a BU led (pw_leads, kind 'bu') with a full name gets its code too.
--
-- ROLLBACK (by hand): update the codes back to full names and set the default back.
begin;

update public.employees set business_unit = 'WNS' where business_unit in ('Werkudara Nirwana Sakti', '');
update public.employees set business_unit = 'MRP' where business_unit = 'Maha Raja Pratama';
alter table public.employees alter column business_unit set default 'WNS';

update public.pw_leads set name = 'WNS' where kind = 'bu' and name = 'Werkudara Nirwana Sakti';
update public.pw_leads set name = 'MRP' where kind = 'bu' and name = 'Maha Raja Pratama';

commit;
