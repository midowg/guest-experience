-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611130012.
--
-- Kuesioner WAM as its own admin access (decided 14 Nov 2026): the WAM questionnaire (isi,
-- pengaturan, progres, rekap, Data HR, kamar, kartu) is given per person in Super admin → Akses
-- admin, also to Admin WAM holders: Admin WAM alone no longer opens it.
--   * admin_grants.apps may hold 'kuesioner'.
--   * Everyone who has Admin WAM now gets Kuesioner WAM too, so nobody loses the questionnaire
--     today; the super admin can untick it per person afterwards.
--
-- ROLLBACK (by hand): update public.admin_grants set apps = array_remove(apps, 'kuesioner');
--   then restore the check without 'kuesioner' (see 202611130012).
begin;

alter table public.admin_grants drop constraint if exists admin_grants_apps_check;
alter table public.admin_grants add constraint admin_grants_apps_check
  check (apps <@ array['acara', 'friday_sharing', 'your_visit', 'wam', 'kuesioner', 'tv']::text[]);

update public.admin_grants
   set apps = array_append(apps, 'kuesioner'), updated_at = now()
 where 'wam' = any (apps) and not ('kuesioner' = any (apps));

commit;
