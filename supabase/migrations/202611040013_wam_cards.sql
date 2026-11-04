-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- WAM questionnaire, stage 2: character cards, like a numbered collection (no blockchain). The
-- character follows a person's answers (score rules per card); the level and the look (background,
-- corner accent, 0-2 stickers) are drawn once on the server and then kept. HR keeps the catalog,
-- the rules and the odds in Admin WAM. Pictures live in private R2 storage (pra-wam/kartu/...),
-- uploaded in Admin WAM; until then the app draws plain colours. Needs 202611040011. Server only.
begin;

-- The five levels: odds per 10,000 (they add up to 10,000; the server checks), and an optional
-- cap like a limited edition. When a level is full the draw falls to the next lower one.
create table public.cq_tiers (
  form_id uuid not null references public.cq_forms (id) on delete cascade,
  key text not null check (key ~ '^[a-z]{2,20}$'),
  name text not null check (char_length(btrim(name)) between 2 and 30),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  odds integer not null check (odds between 0 and 10000),
  max_cards integer check (max_cards is null or max_cards between 0 and 10000),
  line text not null default '' check (char_length(line) <= 120),
  sort integer not null,
  primary key (form_id, key)
);

-- The characters. number names its picture (karakter-01 ...); key is fixed for the rules.
create table public.cq_cards (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.cq_forms (id) on delete cascade,
  number integer not null check (number between 1 and 99),
  key text not null check (key ~ '^[a-z0-9-]{2,30}$'),
  name text not null check (char_length(btrim(name)) between 2 and 40),
  figure text not null default '' check (char_length(figure) <= 40),
  class text not null check (char_length(btrim(class)) between 2 and 40),
  title text not null default '' check (char_length(title) <= 120),
  description text not null default '' check (char_length(description) <= 400),
  powers text[] not null default '{}' check (cardinality(powers) <= 5),
  partner_id uuid references public.cq_cards (id) on delete set null,
  image_key text check (image_key is null or image_key ~ '^pra-wam/kartu/[a-z]+-[0-9]{2}-[0-9a-f-]{36}\.(webp|png|jpg)$'),
  image_updated_at timestamptz,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (form_id, number),
  unique (form_id, key)
);

-- Score rules: choosing this option of this question (by its fixed key) adds weight to the card.
create table public.cq_card_rules (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cq_cards (id) on delete cascade,
  question_key text not null check (question_key ~ '^[A-Za-z0-9_-]{1,20}$'),
  option text not null check (char_length(option) between 1 and 200),
  weight integer not null check (weight between 1 and 9),
  unique (card_id, question_key, option)
);
create index cq_card_rules_card on public.cq_card_rules (card_id);

-- The look parts drawn at random: backgrounds (the back of the card and the wallpaper), corner
-- accents, and stickers.
create table public.cq_card_parts (
  form_id uuid not null references public.cq_forms (id) on delete cascade,
  kind text not null check (kind in ('latar', 'aksen', 'stiker')),
  number integer not null check (number between 1 and 99),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  image_key text check (image_key is null or image_key ~ '^pra-wam/kartu/[a-z]+-[0-9]{2}-[0-9a-f-]{36}\.(webp|png|jpg)$'),
  image_updated_at timestamptz,
  primary key (form_id, kind, number)
);

-- One card per person. The level, the look and the number are drawn once and never redrawn; the
-- character may follow changed answers until the deadline. combo (character + look) is unique,
-- so no two cards are the same. A card drawn while the form was a draft (Admin WAM trying it) is
-- a trial: no number, not counted, and replaced by a real draw once the form is open.
create table public.cq_person_cards (
  form_id uuid not null references public.cq_forms (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  card_id uuid not null references public.cq_cards (id) on delete restrict,
  tier_key text not null,
  background integer not null check (background >= 1),
  accent integer not null check (accent >= 1),
  stickers integer[] not null default '{}' check (cardinality(stickers) <= 2),
  serial integer check (serial is null or serial >= 1),
  trial boolean not null default false,
  combo text not null check (char_length(combo) <= 120),
  dna text not null check (dna ~ '^[0-9a-f]{10}$'),
  -- How it was drawn, for "why did I get Common": the odds then, the number drawn, any full level
  -- passed over, and later changes of character.
  roll jsonb not null default '{}'::jsonb,
  drawn_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (form_id, employee_id),
  foreign key (form_id, tier_key) references public.cq_tiers (form_id, key) on update cascade,
  check ((trial and serial is null) or (not trial and serial is not null))
);
create unique index cq_person_cards_serial on public.cq_person_cards (form_id, serial) where serial is not null;
create unique index cq_person_cards_combo on public.cq_person_cards (form_id, combo) where not trial;
create index cq_person_cards_card on public.cq_person_cards (card_id);

alter table public.cq_tiers enable row level security;
alter table public.cq_cards enable row level security;
alter table public.cq_card_rules enable row level security;
alter table public.cq_card_parts enable row level security;
alter table public.cq_person_cards enable row level security;
revoke all on public.cq_tiers, public.cq_cards, public.cq_card_rules, public.cq_card_parts, public.cq_person_cards from anon, authenticated;

-- The mockup's catalog, for the first form.
insert into public.cq_tiers (form_id, key, name, color, odds, line, sort)
select forms.id, tiers.key, tiers.name, tiers.color, tiers.odds, tiers.line, tiers.sort
from (select id from public.cq_forms order by created_at limit 1) forms,
(values
  ('common', 'Common', '#AEB7C7', 4500, 'Karakter klasik, separuh staf dapat ini.', 0),
  ('uncommon', 'Uncommon', '#47D6AA', 2700, 'Lumayan, tidak semua orang dapat.', 1),
  ('rare', 'Rare', '#449DFF', 1800, 'Hanya sekitar 1 dari 6 orang.', 2),
  ('epic', 'Epic', '#C37BFF', 700, 'Langka. Sekitar 1 dari 14 orang.', 3),
  ('legendary', 'Legendary', '#FFC94A', 300, 'Paling langka. Hanya 3 dari 100.', 4)
) as tiers (key, name, color, odds, line, sort);

insert into public.cq_cards (form_id, number, key, name, figure, class, title, description, powers)
select forms.id, cards.number, cards.key, cards.name, cards.figure, cards.class, cards.title, cards.description, cards.powers
from (select id from public.cq_forms order by created_at limit 1) forms,
(values
  (1, 'penghibur', 'Urban DJ', 'Jaka', 'Bard Penghibur', 'Yang membuat kerja berat terasa ringan', 'Humor dan keceriaanmu jadi bahan bakar tim. Meja makan selalu ramai kalau ada kamu.', array['Humor', 'Gampang akrab', 'Mencairkan suasana']::text[]),
  (2, 'pemantik', 'Festival Rebel', 'Bara', 'Pemantik Semangat', 'Yang terbang paling depan saat tim mulai lelah', 'Energimu menular. Satu teriakan ayo darimu bisa membangunkan satu ruangan.', array['Energi', 'Berani', 'Menggerakkan']::text[]),
  (3, 'penyihir', 'City Dreamer', 'Kirana', 'Penyihir Ide', 'Yang mengubah ide biasa jadi luar biasa', 'Kepalamu penuh kemungkinan. Saat semua buntu, kamu yang datang dengan sudut pandang baru.', array['Kreatif', 'Imajinatif', 'Punya selera']::text[]),
  (4, 'pengintai', 'Neon Wanderer', 'Nara', 'Pengintai Jeli', 'Yang menangkap detail sebelum jadi masalah', 'Hal kecil yang luput dari orang lain tertangkap olehmu, dan itu sering menyelamatkan event.', array['Detail', 'Rapi', 'Konsisten']::text[]),
  (5, 'penyembuh', 'Story Collector', 'Tirta', 'Penyembuh Hati', 'Yang membuat orang merasa didengar', 'Hangat dan sabar. Orang datang padamu untuk didengar, bukan diceramahi, dan pulang dengan lega.', array['Mendengar', 'Empati', 'Hangat']::text[]),
  (6, 'siasat', 'Street Voyager', 'Sena', 'Ahli Siasat', 'Yang melihat papan permainan dari atas', 'Kamu memikirkan tiga langkah ke depan. Rencana yang rapi membuat tim berani mengambil risiko.', array['Strategi', 'Tenang', 'Visioner']::text[]),
  (7, 'penjaga', 'Groove Seeker', 'Damar', 'Penjaga Damai', 'Yang membuat semua orang duduk lagi', 'Adil dan dipercaya semua pihak. Saat diskusi memanas, kehadiranmu menurunkan suhu.', array['Adil', 'Sabar', 'Dipercaya']::text[]),
  (8, 'garda', 'Happy Rebel', 'Raka', 'Garda Depan', 'Yang maju duluan dan menyelesaikan sampai tuntas', 'Kalau sudah bilang jalan, kamu jalan sampai selesai. Tim merasa aman karena tahu ada yang pasti mengeksekusi.', array['Eksekusi', 'Tahan banting', 'Apa adanya']::text[])
) as cards (number, key, name, figure, class, title, description, powers);

update public.cq_cards cards set partner_id = partners.id
from public.cq_cards partners, (values
  ('penghibur', 'penyembuh'),
  ('pemantik', 'penjaga'),
  ('penyihir', 'garda'),
  ('pengintai', 'siasat'),
  ('penyembuh', 'penghibur'),
  ('siasat', 'pengintai'),
  ('penjaga', 'pemantik'),
  ('garda', 'penyihir')
) as pairs (card, partner)
where cards.key = pairs.card and partners.key = pairs.partner and partners.form_id = cards.form_id;

insert into public.cq_card_rules (card_id, question_key, option, weight)
select cards.id, rules.question_key, rules.option, rules.weight
from public.cq_cards cards join (values
  ('penyihir', '34', 'Pencetus ide', 3),
  ('siasat', '34', 'Penyusun strategi', 3),
  ('garda', '34', 'Eksekutor', 3),
  ('penjaga', '34', 'Penengah', 3),
  ('pemantik', '34', 'Penyemangat', 3),
  ('pengintai', '34', 'Teliti soal detail', 3),
  ('penyembuh', '34', 'Pendengar', 3),
  ('penghibur', '20', 'Kelompok besar', 1),
  ('pengintai', '20', 'Kelompok kecil', 1),
  ('penyembuh', '20', 'Ngobrol berdua', 1),
  ('penyihir', '20', 'Tergantung, tapi butuh waktu sendiri buat recharge', 1),
  ('garda', '21', 'Outdoor', 1),
  ('pemantik', '21', 'Games kompetitif', 1),
  ('penjaga', '21', 'Diskusi', 1),
  ('penyihir', '21', 'Kreatif / seni', 1),
  ('penghibur', '21', 'Musik / karaoke', 1),
  ('penghibur', '21', 'Kuliner', 1),
  ('penyembuh', '21', 'Santai tanpa agenda', 1),
  ('garda', '35', 'Berat juga oke, misalnya hiking atau olahraga berat', 1),
  ('garda', '17', 'Olahraga & outdoor', 1),
  ('penghibur', '17', 'Musik', 1),
  ('penyihir', '17', 'Seni & kerajinan', 1),
  ('penyihir', '17', 'Foto & bikin konten', 1),
  ('pemantik', '17', 'Game', 1),
  ('penghibur', '17', 'Kuliner & masak', 1),
  ('siasat', '17', 'Baca buku', 1),
  ('penyembuh', '17', 'Keluarga & anak', 1),
  ('penjaga', '17', 'Komunitas & ibadah', 1),
  ('pengintai', '17', 'Film & series', 1),
  ('garda', '17', 'Otomotif', 1),
  ('siasat', '17', 'Traveling', 1)
) as rules (card, question_key, option, weight) on rules.card = cards.key;

insert into public.cq_card_parts (form_id, kind, number, name)
select forms.id, parts.kind, parts.number, parts.name
from (select id from public.cq_forms order by created_at limit 1) forms,
(values
  ('latar', 1, 'Senja Ungu'),
  ('latar', 2, 'Sunset Pink'),
  ('latar', 3, 'Laguna Tosca'),
  ('latar', 4, 'Galaksi Ungu'),
  ('latar', 5, 'Hutan Lime'),
  ('latar', 6, 'Berry Pink'),
  ('latar', 7, 'Langit Biru'),
  ('latar', 8, 'Amber Emas'),
  ('aksen', 1, 'Sudut Magenta'),
  ('aksen', 2, 'Sudut Pelangi'),
  ('aksen', 3, 'Sudut Lime'),
  ('aksen', 4, 'Sudut Tosca'),
  ('aksen', 5, 'Sudut Jingga'),
  ('aksen', 6, 'Sudut Ungu'),
  ('stiker', 1, 'Bintang'),
  ('stiker', 2, 'Mahkota'),
  ('stiker', 3, 'Petir Pink'),
  ('stiker', 4, 'Senyum'),
  ('stiker', 5, 'Piringan'),
  ('stiker', 6, 'Lencana'),
  ('stiker', 7, 'Api'),
  ('stiker', 8, 'Petir Tosca'),
  ('stiker', 9, 'Kotak Krem'),
  ('stiker', 10, 'Segitiga'),
  ('stiker', 11, 'Titik-titik'),
  ('stiker', 12, 'Logo W')
) as parts (kind, number, name);

commit;
