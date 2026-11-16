-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611130010 (and 202611130011).
--
-- Kartu tokoh v3 (handoff "Cerita Kita WAM 2026", 16 Nov 2026, decisions of Hanung):
--   * 100 figures: the 48 of 202611130010 keep their numbers; the 52 new ones (5 more and 47 spare
--     for the re-roll) take 49 to 100, under the persona of the same key. Their pictures and the
--     Legendary RPG forms ship with the app (public/figur, public/figur/leg).
--   * One person per figure ("1 dari 1"): the app now gives only place 1, and the unique place
--     index (cq_person_cards_figure_place) refuses a second person on it. When no figure is held by
--     two people yet, a unique index on the figure alone is added too. Cards already sharing a
--     figure (places 2 and 3, before this) keep it.
--   * cq_forms.reroll_until: Admin WAM opens the one re-roll per person until this moment (null:
--     closed). The re-roll itself is one update of the person's card (the old figure is let go and
--     the new one taken in the same statement), recorded in roll.reroll.
--   * The figure number may be 1 to 999 and its uploaded picture tokoh-100-….
-- Server only (service role), like the other cq_* tables. Questions and answers are untouched.
--
-- ROLLBACK (by hand, only while nobody holds figures 49 to 100):
--   drop index if exists public.cq_person_cards_figure_one;
--   alter table public.cq_forms drop column if exists reroll_until;
--   delete from public.cq_figures where number > 48;
begin;

alter table public.cq_figures drop constraint if exists cq_figures_number_check;
alter table public.cq_figures add constraint cq_figures_number_check check (number between 1 and 999);
alter table public.cq_figures drop constraint if exists cq_figures_image_key_check;
alter table public.cq_figures add constraint cq_figures_image_key_check
  check (image_key is null or image_key ~ '^pra-wam/kartu/tokoh-[0-9]{2,3}-[0-9a-f-]{36}\.(webp|png|jpg)$');

alter table public.cq_forms add column if not exists reroll_until timestamptz;

-- The handoff's 52 new figures, for the first form, under the persona of the same key.
insert into public.cq_figures (form_id, number, key, name, persona_id, costume, hobbies, activities, energy, genre, indonesian, funny)
select forms.id, figures.number, figures.key, figures.name, personas.id, figures.costume, figures.hobbies, figures.activities, figures.energy, figures.genre, figures.indonesian, figures.funny
from (select id from public.cq_forms order by created_at limit 1) forms
cross join (values
  (49, 'jenderal-sudirman', 'Jenderal Sudirman', 'garda', 'Blangkon, mantel panjang, tongkat, tandu bambu di latar', array['Komunitas & ibadah']::text[], array['Diskusi']::text[], 'Kelompok kecil', '', true, false),
  (50, 'cut-nyak-dhien', 'Cut Nyak Dhien', 'garda', 'Kerudung dan baju kurung Aceh gelap, rencong di pinggang', array['Komunitas & ibadah']::text[], array['Diskusi']::text[], 'Kelompok kecil', '', true, false),
  (51, 'michael-jordan', 'Michael Jordan', 'garda', 'Jersey basket merah tanpa logo, bola basket, pose melompat', array['Olahraga & outdoor']::text[], array['Games kompetitif']::text[], 'Kelompok besar', '', false, false),
  (52, 'ayrton-senna', 'Ayrton Senna', 'garda', 'Helm balap kuning-hijau, baju balap, setir', array['Otomotif']::text[], array['Games kompetitif']::text[], 'Kelompok kecil', '', false, false),
  (53, 'taufik-hidayat', 'Taufik Hidayat', 'garda', 'Kaus badminton, raket, kok di udara', array['Olahraga & outdoor']::text[], array['Games kompetitif']::text[], 'Kelompok kecil', '', true, false),
  (54, 'jeanne-darc', 'Jeanne d''Arc', 'garda', 'Baju zirah perak, bendera putih, rambut pendek', array['Komunitas & ibadah']::text[], array['Diskusi']::text[], 'Kelompok besar', '', false, false),
  (55, 'neil-armstrong', 'Neil Armstrong', 'garda', 'Baju astronot putih, helm di tangan, bendera kecil', array['Traveling']::text[], array['Outdoor']::text[], 'Kelompok kecil', '', false, false),
  (56, 'wolfgang-amadeus-mozart', 'Wolfgang Amadeus Mozart', 'penyihir', 'Wig putih berpita, jas merah bersulam emas, biola', array['Musik']::text[], array['Musik / karaoke']::text[], 'Kelompok besar', '', false, false),
  (57, 'walt-disney', 'Walt Disney', 'penyihir', 'Jas dan dasi, kumis tipis, papan storyboard dan pensil', array['Film & series']::text[], array['Kreatif / seni']::text[], 'Kelompok besar', '', false, false),
  (58, 'hayao-miyazaki', 'Hayao Miyazaki', 'penyihir', 'Celemek, kacamata, rambut putih, kuas cat air', array['Seni & kerajinan']::text[], array['Kreatif / seni']::text[], 'Tergantung, tapi butuh waktu sendiri buat recharge', '', false, false),
  (59, 'raden-saleh', 'Raden Saleh', 'penyihir', 'Beskap dan blangkon, kanvas lukisan, palet', array['Seni & kerajinan']::text[], array['Kreatif / seni']::text[], 'Kelompok kecil', '', true, false),
  (60, 'ismail-marzuki', 'Ismail Marzuki', 'penyihir', 'Kemeja putih, peci, biola dan partitur', array['Musik']::text[], array['Musik / karaoke']::text[], 'Kelompok kecil', 'Pop Indonesia', true, false),
  (61, 'shigeru-miyamoto', 'Shigeru Miyamoto', 'penyihir', 'Kemeja kasual, stik game, gambar sketsa karakter (generik)', array['Game']::text[], array['Games kompetitif']::text[], 'Kelompok kecil', '', false, false),
  (62, 'b-j-habibie', 'B.J. Habibie', 'siasat', 'Jas, kacamata, model pesawat di tangan', array['Otomotif']::text[], array['Diskusi']::text[], 'Kelompok kecil', '', true, false),
  (63, 'mohammad-hatta', 'Mohammad Hatta', 'siasat', 'Jas putih, kacamata bulat, tumpukan buku', array['Baca buku']::text[], array['Diskusi']::text[], 'Tergantung, tapi butuh waktu sendiri buat recharge', '', true, false),
  (64, 'gajah-mada', 'Gajah Mada', 'siasat', 'Busana Majapahit, mahkota sederhana, gulungan peta', array['Baca buku']::text[], array['Diskusi']::text[], 'Kelompok besar', '', true, false),
  (65, 'katherine-johnson', 'Katherine Johnson', 'siasat', 'Kacamata, kardigan, papan tulis penuh rumus, kertas orbit', array['Baca buku']::text[], array['Diskusi']::text[], 'Kelompok kecil', '', false, false),
  (66, 'enzo-ferrari', 'Enzo Ferrari', 'siasat', 'Kacamata hitam, jas, mobil balap merah klasik tanpa logo', array['Otomotif']::text[], array['Diskusi']::text[], 'Kelompok kecil', '', false, false),
  (67, 'satoshi-tajiri', 'Satoshi Tajiri', 'siasat', 'Kaus kasual, jaring serangga, konsol genggam generik', array['Game']::text[], array['Games kompetitif']::text[], 'Tergantung, tapi butuh waktu sendiri buat recharge', '', false, false),
  (68, 'hedy-lamarr', 'Hedy Lamarr', 'siasat', 'Gaun glamor 1940-an, sketsa penemuan sinyal radio', array['Film & series']::text[], array['Diskusi']::text[], 'Kelompok kecil', '', false, true),
  (69, 'iwan-fals', 'Iwan Fals', 'penjaga', 'Rambut gondrong berikat kepala, kaus hitam, gitar dan harmonika', array['Musik']::text[], array['Musik / karaoke']::text[], 'Kelompok besar', 'Rock', true, false),
  (70, 'mahatma-gandhi', 'Mahatma Gandhi', 'penjaga', 'Kain putih, kacamata bulat, alat pemintal', array['Komunitas & ibadah']::text[], array['Diskusi']::text[], 'Kelompok besar', '', false, false),
  (71, 'gus-dur', 'Gus Dur', 'penjaga', 'Peci, kemeja batik, kacamata, senyum santai', array['Komunitas & ibadah']::text[], array['Santai tanpa agenda']::text[], 'Kelompok besar', '', true, true),
  (72, 'ebiet-g-ade', 'Ebiet G. Ade', 'penjaga', 'Topi pet, kemeja flanel, gitar akustik', array['Musik']::text[], array['Musik / karaoke']::text[], 'Kelompok kecil', 'Pop Indonesia', true, false),
  (73, 'wangari-maathai', 'Wangari Maathai', 'penjaga', 'Kain dan ikat kepala Afrika berwarna, bibit pohon', array['Olahraga & outdoor']::text[], array['Outdoor']::text[], 'Kelompok besar', '', false, false),
  (74, 'tom-hanks', 'Tom Hanks', 'penjaga', 'Kemeja kotak-kotak, kotak cokelat, mesin ketik', array['Film & series']::text[], array['Santai tanpa agenda']::text[], 'Kelompok kecil', '', false, true),
  (75, 'chairil-anwar', 'Chairil Anwar', 'pemantik', 'Rambut ikal berantakan, kemeja putih digulung, buku puisi, tangan terkepal', array['Baca buku']::text[], array['Diskusi']::text[], 'Kelompok kecil', '', true, false),
  (76, 'bob-marley', 'Bob Marley', 'pemantik', 'Rambut gimbal, kaus warna merah-kuning-hijau, gitar', array['Musik']::text[], array['Musik / karaoke']::text[], 'Kelompok besar', 'Lainnya', false, false),
  (77, 'rhoma-irama', 'Rhoma Irama', 'pemantik', 'Kostum panggung berkilau, gitar listrik, rambut kribo', array['Musik']::text[], array['Musik / karaoke']::text[], 'Kelompok besar', 'Dangdut / Koplo', true, true),
  (78, 'bung-tomo', 'Bung Tomo', 'pemantik', 'Kemeja dan peci, mikrofon radio jadul, tangan terangkat', array['Komunitas & ibadah']::text[], array['Diskusi']::text[], 'Kelompok besar', '', true, false),
  (79, 'jackie-chan', 'Jackie Chan', 'pemantik', 'Kaus kungfu, tangga kecil sebagai senjata, pose akrobat', array['Film & series']::text[], array['Games kompetitif']::text[], 'Kelompok besar', '', false, true),
  (80, 'simone-biles', 'Simone Biles', 'pemantik', 'Leotard berkilau tanpa logo, pose senam', array['Olahraga & outdoor']::text[], array['Games kompetitif']::text[], 'Kelompok besar', '', false, false),
  (81, 'maria-montessori', 'Maria Montessori', 'pengintai', 'Sanggul, gaun biru tua berkerah renda, balok kayu warna-warni', array['Keluarga & anak']::text[], array['Kreatif / seni']::text[], 'Kelompok kecil', '', false, false),
  (82, 'charles-darwin', 'Charles Darwin', 'pengintai', 'Jas Victoria, janggut putih, kaca pembesar, burung finch', array['Traveling']::text[], array['Outdoor']::text[], 'Tergantung, tapi butuh waktu sendiri buat recharge', '', false, false),
  (83, 'jacques-cousteau', 'Jacques Cousteau', 'pengintai', 'Topi kupluk merah, baju selam, tabung oksigen', array['Olahraga & outdoor']::text[], array['Outdoor']::text[], 'Kelompok kecil', '', false, false),
  (84, 'pramoedya-ananta-toer', 'Pramoedya Ananta Toer', 'pengintai', 'Rambut putih, kemeja, mesin ketik, rokok tidak ditampilkan', array['Baca buku']::text[], array['Diskusi']::text[], 'Tergantung, tapi butuh waktu sendiri buat recharge', '', true, false),
  (85, 'anthony-bourdain', 'Anthony Bourdain', 'pengintai', 'Jaket kulit, mangkuk mi kaki lima, ransel', array['Kuliner & masak']::text[], array['Kuliner']::text[], 'Kelompok kecil', '', false, false),
  (86, 'ansel-adams', 'Ansel Adams', 'pengintai', 'Topi koboi, kamera format besar di tripod, pegunungan', array['Foto & bikin konten']::text[], array['Outdoor']::text[], 'Tergantung, tapi butuh waktu sendiri buat recharge', '', false, false),
  (87, 'jane-goodall', 'Jane Goodall', 'penyembuh', 'Kemeja dan celana khaki, teropong, bayi simpanse', array['Olahraga & outdoor']::text[], array['Outdoor']::text[], 'Ngobrol berdua', '', false, false),
  (88, 'bunda-teresa', 'Bunda Teresa', 'penyembuh', 'Kerudung putih bergaris biru, tangan memegang mangkuk', array['Komunitas & ibadah']::text[], array['Santai tanpa agenda']::text[], 'Ngobrol berdua', '', false, false),
  (89, 'dr-lo-siaw-ging', 'dr. Lo Siaw Ging', 'penyembuh', 'Jas dokter putih, stetoskop, tas dokter jadul', array['Komunitas & ibadah']::text[], array['Santai tanpa agenda']::text[], 'Ngobrol berdua', '', true, false),
  (90, 'buya-hamka', 'Buya Hamka', 'penyembuh', 'Peci, kacamata, sarung, buku tebal', array['Komunitas & ibadah']::text[], array['Diskusi']::text[], 'Ngobrol berdua', '', true, false),
  (91, 'dewi-sartika', 'Dewi Sartika', 'penyembuh', 'Kebaya dan sanggul, papan tulis kecil, buku', array['Keluarga & anak']::text[], array['Diskusi']::text[], 'Kelompok kecil', '', true, false),
  (92, 'steve-irwin', 'Steve Irwin', 'penyembuh', 'Kemeja khaki, celana pendek, buaya kecil yang ramah', array['Olahraga & outdoor']::text[], array['Outdoor']::text[], 'Kelompok besar', '', false, true),
  (93, 'pak-kasur', 'Pak Kasur', 'penyembuh', 'Kemeja dan peci, dikelilingi anak-anak kartun generik, buku lagu', array['Keluarga & anak']::text[], array['Musik / karaoke']::text[], 'Kelompok kecil', 'Pop Indonesia', true, false),
  (94, 'robin-williams', 'Robin Williams', 'penghibur', 'Kemeja kotak-kotak, ekspresi jenaka, lampu ajaib generik', array['Film & series']::text[], array['Santai tanpa agenda']::text[], 'Kelompok besar', '', false, false),
  (95, 'rowan-atkinson', 'Rowan Atkinson', 'penghibur', 'Jas cokelat sempit, dasi tipis, boneka beruang', array['Film & series']::text[], array['Santai tanpa agenda']::text[], 'Kelompok kecil', '', false, true),
  (96, 'dono-warkop-dki', 'Dono (Warkop DKI)', 'penghibur', 'Kacamata tebal, kemeja kampus, buku kuliah', array['Film & series']::text[], array['Santai tanpa agenda']::text[], 'Kelompok besar', '', true, true),
  (97, 'bing-slamet', 'Bing Slamet', 'penghibur', 'Jas panggung 1960-an, mikrofon klasik', array['Musik']::text[], array['Musik / karaoke']::text[], 'Kelompok besar', 'Pop Indonesia', true, false),
  (98, 'louis-armstrong', 'Louis Armstrong', 'penghibur', 'Jas, sapu tangan putih, terompet emas', array['Musik']::text[], array['Musik / karaoke']::text[], 'Kelompok besar', 'Jazz', false, false),
  (99, 'avicii', 'Avicii', 'penghibur', 'Topi terbalik, kaus, meja DJ dengan lampu', array['Musik']::text[], array['Musik / karaoke']::text[], 'Kelompok besar', 'EDM', false, false),
  (100, 'chrisye', 'Chrisye', 'penghibur', 'Kemeja rapi, kacamata, mikrofon, nada musik melayang', array['Musik']::text[], array['Musik / karaoke']::text[], 'Kelompok kecil', 'Pop Indonesia', true, false)
) as figures (number, key, name, persona, costume, hobbies, activities, energy, genre, indonesian, funny)
join public.cq_cards personas on personas.key = figures.persona
where personas.form_id = forms.id
on conflict (form_id, key) do nothing;

-- One person per figure, by the figure alone, when no figure has two people yet.
do $$
begin
  if not exists (
    select 1 from public.cq_person_cards where figure_id is not null and not trial
    group by form_id, figure_id having count(*) > 1
  ) then
    create unique index if not exists cq_person_cards_figure_one on public.cq_person_cards (form_id, figure_id)
      where figure_id is not null and not trial;
  end if;
end $$;

commit;
