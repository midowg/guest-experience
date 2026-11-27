-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- WAM questionnaire (11 Nov 2026): since every Admin WAM sees every named answer (Rekap, owner's
-- decision), the two section intros that name the readers say so too, as the labels on the
-- question cards do. Changed only while they are still the original texts, so an edit HR made in
-- Admin WAM stands. Needs 202611040011.
begin;

update public.cq_sections set intro = 'Nama dan departemen kamu akan muncul di profil yang bisa dilihat rekan. Sisanya untuk HR dan admin WAM.'
where key = '0' and intro = 'Nama dan departemen kamu akan muncul di profil yang bisa dilihat rekan. Sisanya hanya untuk HR.';

update public.cq_sections set intro = 'Untuk pembagian kamar WAM Januari 2027. Hanya dibaca HR, manajemen, admin WAM, dan panitia kamar, lalu dihapus paling lambat 30 hari setelah WAM.'
where key = 'A' and intro = 'Untuk pembagian kamar WAM Januari 2027. Hanya dibaca HR, manajemen, dan panitia kamar, lalu dihapus paling lambat 30 hari setelah WAM.';

commit;
