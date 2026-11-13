-- LOCAL REVIEW ONLY: the owner applies this in the Supabase SQL Editor, after 202611040013.
--
-- Kartu tokoh dunia (handoff "Cerita Kita WAM 2026", 12 Nov 2026): the card at the end of the
-- questionnaire shows a toy figure of a world figure instead of an anime character.
--   * The 8 characters of 202611040013 stay as the 8 personas (Garda Depan … Bard Penghibur): their
--     score rules are the handoff's weights, so the persona is chosen as before.
--   * cq_figures: the 48 figures, each under one persona, with what it is matched on (hobbies,
--     activities, energy, music genre). Its picture is uploaded in Admin WAM → Kuesioner → Kartu
--     (private storage, as the characters'), exported from the Figma file of the handoff.
--   * cq_person_cards.figure_id / figure_slot: the figure a person got, and which of its two places
--     (1 or 2): unique per form, so no figure is given to more than two people, even when two
--     people finish at the same moment. reason: the sentence on the card ("Kamu dapat … karena …").
--     The figure is drawn once and kept. A card drawn before this migration gets its figure the
--     next time it is opened, keeping its level and number.
-- Server only (service role), like the other cq_* tables.
--
-- ROLLBACK (by hand):
--   drop index if exists public.cq_person_cards_figure_place;
--   alter table public.cq_person_cards drop column if exists figure_id, drop column if exists figure_slot, drop column if exists reason;
--   drop table if exists public.cq_figures;
begin;

create table if not exists public.cq_figures (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.cq_forms (id) on delete cascade,
  number integer not null check (number between 1 and 99),
  key text not null check (key ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  persona_id uuid not null references public.cq_cards (id) on delete restrict,
  costume text not null default '' check (char_length(costume) <= 200),
  hobbies text[] not null default '{}' check (cardinality(hobbies) <= 10),
  activities text[] not null default '{}' check (cardinality(activities) <= 10),
  energy text not null default '' check (char_length(energy) <= 120),
  genre text not null default '' check (char_length(genre) <= 60),
  indonesian boolean not null default false,
  funny boolean not null default false,
  -- Filled only once checked against a trustworthy source; a wrongly attributed quote is not used.
  quote text check (quote is null or char_length(quote) <= 300),
  image_key text check (image_key is null or image_key ~ '^pra-wam/kartu/tokoh-[0-9]{2}-[0-9a-f-]{36}\.(webp|png|jpg)$'),
  image_updated_at timestamptz,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (form_id, number),
  unique (form_id, key)
);
create index if not exists cq_figures_persona on public.cq_figures (persona_id);
alter table public.cq_figures enable row level security;
revoke all on public.cq_figures from anon, authenticated;
grant select, insert, update, delete on public.cq_figures to service_role;

alter table public.cq_person_cards add column if not exists figure_id uuid references public.cq_figures (id) on delete restrict;
alter table public.cq_person_cards add column if not exists figure_slot smallint check (figure_slot is null or figure_slot between 1 and 2);
alter table public.cq_person_cards add column if not exists reason text check (reason is null or char_length(reason) <= 400);
alter table public.cq_person_cards drop constraint if exists cq_person_cards_figure_both;
alter table public.cq_person_cards add constraint cq_person_cards_figure_both check ((figure_id is null) = (figure_slot is null));
-- At most two people per figure: each takes place 1 or 2. Trial cards (Admin WAM trying the draft) do not count.
create unique index if not exists cq_person_cards_figure_place on public.cq_person_cards (form_id, figure_id, figure_slot)
  where figure_id is not null and not trial;

-- The handoff's 48 figures, for the first form, under the persona of the same key.
insert into public.cq_figures (form_id, number, key, name, persona_id, costume, hobbies, activities, energy, genre, indonesian, funny)
select forms.id, figures.number, figures.key, figures.name, personas.id, figures.costume, figures.hobbies, figures.activities, figures.energy, figures.genre, figures.indonesian, figures.funny
from (select id from public.cq_forms order by created_at limit 1) forms
cross join (values
  (1, 'ki-hajar-dewantara', 'Ki Hajar Dewantara', 'garda', 'Blangkon, beskap, buku tulis terbuka', array['Baca buku']::text[], array['Diskusi']::text[], 'Kelompok kecil', '', true, false),
  (2, 'serena-williams', 'Serena Williams', 'garda', 'Gaun tenis, bandana, raket dan bola kuning', array['Olahraga & outdoor']::text[], array['Games kompetitif']::text[], 'Kelompok besar', '', false, false),
  (3, 'gordon-ramsay', 'Gordon Ramsay', 'garda', 'Jas chef putih, wajan berasap', array['Kuliner & masak']::text[], array['Kuliner']::text[], 'Kelompok besar', '', false, true),
  (4, 'edmund-hillary', 'Edmund Hillary', 'garda', 'Jaket gunung, kacamata salju, kapak es', array['Olahraga & outdoor']::text[], array['Outdoor']::text[], 'Kelompok kecil', '', false, false),
  (5, 'susi-susanti', 'Susi Susanti', 'garda', 'Kaus olahraga, raket bulu tangkis, medali', array['Olahraga & outdoor']::text[], array['Games kompetitif']::text[], 'Kelompok kecil', '', true, false),
  (6, 'valentino-rossi', 'Valentino Rossi', 'garda', 'Baju balap kuning nomor 46, helm di tangan', array['Otomotif']::text[], array['Games kompetitif']::text[], 'Kelompok besar', '', false, true),
  (7, 'leonardo-da-vinci', 'Leonardo da Vinci', 'penyihir', 'Baret, jubah, kuas, model sayap kayu', array['Seni & kerajinan']::text[], array['Kreatif / seni']::text[], 'Tergantung, tapi butuh waktu sendiri buat recharge', '', false, false),
  (8, 'nikola-tesla', 'Nikola Tesla', 'penyihir', 'Jas rapi, kumparan dengan percik listrik', array['Baca buku']::text[], array['Diskusi']::text[], 'Tergantung, tapi butuh waktu sendiri buat recharge', '', false, false),
  (9, 'salvador-dali', 'Salvador Dalí', 'penyihir', 'Kumis melengkung ke atas, jam saku meleleh', array['Seni & kerajinan']::text[], array['Kreatif / seni']::text[], 'Kelompok besar', '', false, true),
  (10, 'frida-kahlo', 'Frida Kahlo', 'penyihir', 'Mahkota bunga, selendang warna-warni, palet', array['Seni & kerajinan']::text[], array['Kreatif / seni']::text[], 'Kelompok kecil', '', false, false),
  (11, 'affandi', 'Affandi', 'penyihir', 'Kaus lusuh, pipa, kanvas dan tube cat', array['Seni & kerajinan']::text[], array['Kreatif / seni']::text[], 'Tergantung, tapi butuh waktu sendiri buat recharge', '', true, false),
  (12, 'stan-lee', 'Stan Lee', 'penyihir', 'Kacamata hitam, kumis putih, setumpuk komik (tanpa logo)', array['Film & series']::text[], array['Kreatif / seni']::text[], 'Kelompok besar', '', false, true),
  (13, 'marie-curie', 'Marie Curie', 'siasat', 'Jas lab, sanggul, labu kimia hijau bercahaya', array['Baca buku']::text[], array['Diskusi']::text[], 'Kelompok kecil', '', false, false),
  (14, 'sun-tzu', 'Sun Tzu', 'siasat', 'Jubah kuno, gulungan bambu', array['Baca buku']::text[], array['Games kompetitif']::text[], 'Tergantung, tapi butuh waktu sendiri buat recharge', '', false, false),
  (15, 'elon-musk', 'Elon Musk', 'siasat', 'Jaket hitam, roket mini mendarat tegak', array['Otomotif']::text[], array['Diskusi']::text[], 'Kelompok besar', '', false, true),
  (16, 'amelia-earhart', 'Amelia Earhart', 'siasat', 'Jaket pilot kulit, kacamata terbang, syal', array['Traveling']::text[], array['Outdoor']::text[], 'Kelompok kecil', '', false, false),
  (17, 'alan-turing', 'Alan Turing', 'siasat', 'Sweter, mesin sandi mini', array['Game']::text[], array['Diskusi']::text[], 'Tergantung, tapi butuh waktu sendiri buat recharge', '', false, false),
  (18, 'warren-buffett', 'Warren Buffett', 'siasat', 'Kemeja dan dasi, koran keuangan, kalkulator', array['Baca buku']::text[], array['Diskusi']::text[], 'Kelompok kecil', '', false, true),
  (19, 'nelson-mandela', 'Nelson Mandela', 'penjaga', 'Kemeja motif cerah, merpati', array['Komunitas & ibadah']::text[], array['Diskusi']::text[], 'Kelompok besar', '', false, false),
  (20, 'audrey-hepburn', 'Audrey Hepburn', 'penjaga', 'Gaun hitam, kacamata hitam besar, croissant', array['Film & series']::text[], array['Santai tanpa agenda']::text[], 'Kelompok kecil', '', false, false),
  (21, 'bob-ross', 'Bob Ross', 'penjaga', 'Rambut kribo, kemeja, palet dan pohon kecil', array['Seni & kerajinan']::text[], array['Santai tanpa agenda']::text[], 'Tergantung, tapi butuh waktu sendiri buat recharge', '', false, false),
  (22, 'keanu-reeves', 'Keanu Reeves', 'penjaga', 'Jaket kulit, helm motor', array['Film & series']::text[], array['Santai tanpa agenda']::text[], 'Kelompok kecil', '', false, true),
  (23, 'kofi-annan', 'Kofi Annan', 'penjaga', 'Jas abu-abu, map dokumen, bendera putih kecil', array['Traveling']::text[], array['Diskusi']::text[], 'Kelompok kecil', '', false, false),
  (24, 'oprah-winfrey', 'Oprah Winfrey', 'penjaga', 'Blazer cerah, kartu pertanyaan, mikrofon', array['Komunitas & ibadah']::text[], array['Diskusi']::text[], 'Kelompok besar', '', false, false),
  (25, 'muhammad-ali', 'Muhammad Ali', 'pemantik', 'Celana tinju putih, sarung tinju merah', array['Olahraga & outdoor']::text[], array['Games kompetitif']::text[], 'Kelompok besar', '', false, false),
  (26, 'usain-bolt', 'Usain Bolt', 'pemantik', 'Baju lari kuning-hijau, sepatu lari, pose kilat', array['Olahraga & outdoor']::text[], array['Outdoor']::text[], 'Kelompok besar', '', false, false),
  (27, 'freddie-mercury', 'Freddie Mercury', 'pemantik', 'Jaket kuning, kumis, mikrofon setengah tiang', array['Musik']::text[], array['Musik / karaoke']::text[], 'Kelompok besar', 'Rock', false, true),
  (28, 'bambang-pamungkas', 'Bambang Pamungkas', 'pemantik', 'Jersey merah nomor 20, bola', array['Olahraga & outdoor']::text[], array['Games kompetitif']::text[], 'Kelompok besar', '', true, false),
  (29, 'pele', 'Pelé', 'pemantik', 'Jersey kuning nomor 10, bola', array['Olahraga & outdoor']::text[], array['Outdoor']::text[], 'Kelompok besar', '', false, false),
  (30, 'bruce-lee', 'Bruce Lee', 'pemantik', 'Baju kuning bergaris hitam, nunchaku', array['Olahraga & outdoor']::text[], array['Games kompetitif']::text[], 'Kelompok kecil', '', false, false),
  (31, 'ada-lovelace', 'Ada Lovelace', 'pengintai', 'Gaun era Victoria, roda gigi dan kartu berlubang', array['Baca buku']::text[], array['Diskusi']::text[], 'Kelompok kecil', '', false, false),
  (32, 'agatha-christie', 'Agatha Christie', 'pengintai', 'Topi cloche, kaca pembesar, cangkir teh', array['Baca buku']::text[], array['Santai tanpa agenda']::text[], 'Kelompok kecil', '', false, false),
  (33, 'albert-einstein', 'Albert Einstein', 'pengintai', 'Rambut putih mengembang, papan tulis E=mc²', array['Baca buku']::text[], array['Diskusi']::text[], 'Tergantung, tapi butuh waktu sendiri buat recharge', '', false, false),
  (34, 'steve-jobs', 'Steve Jobs', 'pengintai', 'Turtleneck hitam, jeans, kacamata bulat', array['Foto & bikin konten']::text[], array['Diskusi']::text[], 'Kelompok kecil', '', false, true),
  (35, 'alfred-hitchcock', 'Alfred Hitchcock', 'pengintai', 'Jas hitam, kamera film klasik', array['Film & series']::text[], array['Santai tanpa agenda']::text[], 'Kelompok kecil', '', false, true),
  (36, 'sapardi-djoko-damono', 'Sapardi Djoko Damono', 'pengintai', 'Topi pet, buku puisi, payung', array['Baca buku']::text[], array['Diskusi']::text[], 'Tergantung, tapi butuh waktu sendiri buat recharge', '', true, false),
  (37, 'r-a-kartini', 'R.A. Kartini', 'penyembuh', 'Kebaya, sanggul, pena dan surat terlipat', array['Baca buku']::text[], array['Diskusi']::text[], 'Ngobrol berdua', '', true, false),
  (38, 'fred-rogers', 'Fred Rogers', 'penyembuh', 'Kardigan merah, sepatu kets', array['Keluarga & anak']::text[], array['Santai tanpa agenda']::text[], 'Ngobrol berdua', '', false, false),
  (39, 'putri-diana', 'Putri Diana', 'penyembuh', 'Blazer pastel, tiara mungil, setangkai mawar', array['Keluarga & anak']::text[], array['Santai tanpa agenda']::text[], 'Ngobrol berdua', '', false, false),
  (40, 'florence-nightingale', 'Florence Nightingale', 'penyembuh', 'Seragam perawat klasik, lampu minyak', array['Komunitas & ibadah']::text[], array['Santai tanpa agenda']::text[], 'Ngobrol berdua', '', false, false),
  (41, 'dolly-parton', 'Dolly Parton', 'penyembuh', 'Rambut pirang besar, gitar berkilau', array['Musik']::text[], array['Musik / karaoke']::text[], 'Kelompok besar', 'Pop', false, true),
  (42, 'pak-raden-suyadi', 'Pak Raden (Suyadi)', 'penyembuh', 'Blangkon, kumis tebal, pensil gambar', array['Keluarga & anak']::text[], array['Kreatif / seni']::text[], 'Kelompok kecil', '', true, false),
  (43, 'charlie-chaplin', 'Charlie Chaplin', 'penghibur', 'Topi bowler, kumis kecil, celana kedodoran, tongkat', array['Film & series']::text[], array['Santai tanpa agenda']::text[], 'Kelompok besar', '', false, false),
  (44, 'benyamin-sueb', 'Benyamin Sueb', 'penghibur', 'Peci miring, kemeja Betawi, gitar kecil', array['Musik']::text[], array['Musik / karaoke']::text[], 'Kelompok besar', 'Pop Indonesia', true, false),
  (45, 'kim-kardashian', 'Kim Kardashian', 'penghibur', 'Gaun glamor, ponsel dengan lampu ring selfie', array['Foto & bikin konten']::text[], array['Santai tanpa agenda']::text[], 'Kelompok besar', '', false, true),
  (46, 'didi-kempot', 'Didi Kempot', 'penghibur', 'Kacamata hitam, kemeja, gitar, sapu tangan', array['Musik']::text[], array['Musik / karaoke']::text[], 'Kelompok besar', 'Dangdut / Koplo', true, false),
  (47, 'elvis-presley', 'Elvis Presley', 'penghibur', 'Jumpsuit putih berpayet, jambul, mikrofon', array['Musik']::text[], array['Musik / karaoke']::text[], 'Kelompok besar', 'Rock', false, false),
  (48, 'bondan-winarno', 'Bondan Winarno', 'penghibur', 'Topi, rompi, mangkuk bakso', array['Kuliner & masak']::text[], array['Kuliner']::text[], 'Kelompok besar', '', true, false)
) as figures (number, key, name, persona, costume, hobbies, activities, energy, genre, indonesian, funny)
join public.cq_cards personas on personas.key = figures.persona
where personas.form_id = forms.id
on conflict (form_id, key) do nothing;

commit;
