-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- WAM questionnaire, revision of 11 Nov 2026 ("Cerita Kita WAM 2026: daftar pertanyaan", 58
-- questions; was 55). Three new questions and four changed ones, by fixed key, so answers already
-- given stay with their question:
--   new  5b   Kenalan dulu: emergency contact (required, HR & manajemen)
--   new  14c  Menginap: allergies and foods avoided, in detail (HR & manajemen)
--   new  14d  Menginap: special needs to join every activity (Panitia dan HR)
--   edit 14   "Ada kebutuhan atau batasan makanan?"; "Ada alergi" becomes "Alergi makanan" and
--             "Ada makanan yang kuhindari"
--   edit 14b  phobias only (allergies moved to 14c)
--   edit 16   health "atau obat rutin", new examples
--   edit 3    its note no longer names a question number
-- A text is changed only while it is still the original, so an edit HR made in Admin WAM stands.
-- Read level, by the owner's decision (11 Nov 2026, following the document): 14 and 14b go back
-- from "Panitia dan HR" to "HR & manajemen". The app reads the stricter of an answer's and its
-- question's level, so answers given before are covered at once.
-- Order: every question's sort is spread by ten first, so the new ones sit right where the
-- document has them and any order HR set stays. Needs 202611040011 and 202611050002.
-- Note: 5b is required, so someone who already finished counts as unfinished until they add it.
begin;

do $$
declare
  f uuid;
  intro uuid;
  stay uuid;
begin
  select id into f from public.cq_forms order by created_at limit 1;
  if f is null then return; end if;
  select id into intro from public.cq_sections where form_id = f and key = '0';
  select id into stay from public.cq_sections where form_id = f and key = 'A';
  if intro is null or stay is null then raise exception 'Bagian 0 atau A tidak ditemukan.'; end if;
  -- Run once: stop if the revision is already in.
  if exists (select 1 from public.cq_questions where form_id = f and key in ('5b', '14c', '14d')) then return; end if;

  update public.cq_questions set sort = sort * 10 where form_id = f;

  insert into public.cq_questions (form_id, section_id, key, prompt, kind, required, visibility, placeholder, note, sort)
  select f, intro, '5b', 'Siapa yang bisa dihubungi kalau terjadi sesuatu selama acara?', 'text', true, 'hr',
    'Nama, hubungan, nomor HP. Misalnya Rina, kakak, 0812xxxx', 'Hanya dipakai dalam keadaan darurat.',
    coalesce((select sort from public.cq_questions where form_id = f and key = '5'), 50) + 5;

  update public.cq_questions set
    prompt = 'Ada kebutuhan atau batasan makanan?',
    options = '["Tidak ada", "Halal", "Vegetarian", "Vegan", "Alergi makanan", "Ada makanan yang kuhindari", "Lainnya"]'::jsonb
  where form_id = f and key = '14' and prompt = 'Ada kebutuhan makanan?'
    and options = '["Tidak ada", "Halal", "Vegetarian", "Vegan", "Ada alergi", "Lainnya"]'::jsonb;

  insert into public.cq_questions (form_id, section_id, key, prompt, kind, required, visibility, placeholder, note, sort)
  select f, stay, '14c', 'Kalau ada alergi atau makanan yang kamu hindari, apa saja?', 'long', false, 'hr',
    'Misalnya alergi udang (gatal parah, bawa obat), tidak makan pedas, tidak makan jeroan',
    'Tulis juga seberapa parah alerginya, supaya dapur bisa memisahkan masakannya.',
    coalesce((select sort from public.cq_questions where form_id = f and key = '14'), 450) + 5;

  update public.cq_questions set
    prompt = 'Ada fobia atau hal lain yang sebaiknya tidak ada di dekatmu selama acara?',
    placeholder = 'Misalnya fobia buah atau bau tertentu, takut gelap, takut hewan tertentu.'
  where form_id = f and key = '14b' and prompt = 'Ada alergi, fobia, atau hal lain yang sebaiknya tidak ada di dekatmu selama acara?';

  insert into public.cq_questions (form_id, section_id, key, prompt, kind, required, visibility, options, note, sort)
  select f, stay, '14d', 'Ada kebutuhan khusus supaya kamu bisa ikut semua kegiatan dengan nyaman?', 'multi', false, 'fasil',
    '["Tidak ada", "Pendengaran", "Penglihatan", "Mobilitas atau kursi roda", "Tidak bisa lari atau lompat", "Sulit naik tangga", "Lainnya"]'::jsonb,
    'Dipakai untuk menyusun kegiatan dan memilih ruang supaya semua bisa ikut. Kamu tidak perlu menjelaskan alasannya.',
    coalesce((select sort from public.cq_questions where form_id = f and key = '14b'), 460) + 5;

  update public.cq_questions set
    prompt = 'Ada kondisi kesehatan atau obat rutin yang perlu panitia tahu supaya kamu aman?',
    placeholder = 'Misalnya asma (bawa inhaler), diabetes, mabuk perjalanan, epilepsi'
  where form_id = f and key = '16' and prompt = 'Ada kondisi kesehatan yang perlu panitia tahu supaya kamu aman?';

  update public.cq_questions set note = 'Dipakai untuk memunculkan pertanyaan khusus supervisor/lead dan manajer di bagian Mimpi & bertahan.'
  where form_id = f and key = '3' and note = 'Dipakai untuk percabangan pertanyaan 31.';

  update public.cq_questions set visibility = 'hr'
  where form_id = f and key in ('14', '14b') and visibility = 'fasil';

  update public.cq_forms set updated_at = now() where id = f;
end $$;

commit;
