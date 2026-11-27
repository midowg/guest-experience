-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611060004.
--
-- Business Unit from the office column (6 Nov 2026): HR's sheet already says each person's BU in
-- "office" (WNS, TEE, MRP...). 202611060004 put everyone on WNS; this sets the BU to the office's
-- code wherever the office is one of the five, so Takshaka Event & Experience (office TEE) is TEE
-- and Maha Raja Pratama (office MRP) is MRP. People whose office is empty or unknown keep theirs.
--
-- ROLLBACK (by hand): update public.employees set business_unit = 'WNS' where business_unit <> 'WNS';
begin;

update public.employees
   set business_unit = upper(btrim(office)), updated_at = now()
 where upper(btrim(office)) in ('MRP', 'WNS', 'TEE', 'NMU', 'WNN')
   and business_unit is distinct from upper(btrim(office));

commit;
