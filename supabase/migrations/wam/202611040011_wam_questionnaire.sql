-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- WAM: the personal questionnaire (from the "Cerita Kita" mockup). HR edits its name, address,
-- sections and questions in Admin WAM; people answer it in the WAM app. Answers of the anonymous
-- section are kept with no link to a person (cq_anon_answers), only a receipt that they sent it.
-- The most private answers are read with a separate HR password (its scrypt hash lives on the
-- form); every unlock and every look is logged. Needs 202611030001 (employees). Server only.
begin;

create table public.cq_forms (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Kuesioner' check (char_length(btrim(name)) between 2 and 60),
  -- The address under /wam; old ones keep redirecting after a rename.
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  old_slugs text[] not null default '{}',
  status text not null default 'draf' check (status in ('draf', 'buka', 'tutup')),
  intro text not null default '' check (char_length(intro) <= 800),
  card_text text not null default '' check (char_length(card_text) <= 200),
  minutes integer not null default 15 check (minutes between 1 and 120),
  edit_until timestamptz,
  stay_delete_on date,
  hr_password_hash text check (hr_password_hash is null or hr_password_hash ~ '^scrypt\$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cq_sections (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.cq_forms (id) on delete cascade,
  key text not null check (key ~ '^[A-Za-z0-9_-]{1,20}$'),
  title text not null check (char_length(btrim(title)) between 2 and 80),
  short text not null default '' check (char_length(short) <= 30),
  hello text not null default '' check (char_length(hello) <= 120),
  intro text not null default '' check (char_length(intro) <= 600),
  tease text not null default '' check (char_length(tease) <= 160),
  anonymous boolean not null default false,
  sort integer not null default 0,
  hidden boolean not null default false,
  unique (form_id, key)
);

create table public.cq_questions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.cq_forms (id) on delete cascade,
  section_id uuid not null references public.cq_sections (id) on delete cascade,
  -- A fixed key: rewording a question never cuts it off from its answers.
  key text not null check (key ~ '^[A-Za-z0-9_-]{1,20}$'),
  prompt text not null check (char_length(btrim(prompt)) between 2 and 300),
  kind text not null check (kind in ('text', 'long', 'single', 'multi', 'consent', 'matrix', 'department', 'person')),
  required boolean not null default false,
  visibility text not null check (visibility in ('rekan', 'fasil', 'hr', 'hronly', 'pilih', 'anon')),
  options jsonb not null default '[]' check (jsonb_typeof(options) = 'array'),
  max_choices integer check (max_choices is null or max_choices between 1 and 20),
  matrix_rows jsonb not null default '[]' check (jsonb_typeof(matrix_rows) = 'array'),
  scale jsonb not null default '[]' check (jsonb_typeof(scale) = 'array'),
  placeholder text not null default '' check (char_length(placeholder) <= 160),
  note text not null default '' check (char_length(note) <= 400),
  react text not null default '' check (char_length(react) <= 160),
  -- Shown only when another answer matches, e.g. {"question": "3", "not": ["Staf"]}.
  show_if jsonb check (show_if is null or jsonb_typeof(show_if) = 'object'),
  sort integer not null default 0,
  hidden boolean not null default false,
  unique (form_id, key)
);

create table public.cq_progress (
  form_id uuid not null references public.cq_forms (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  consent_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (form_id, employee_id)
);

create table public.cq_answers (
  form_id uuid not null references public.cq_forms (id) on delete cascade,
  question_id uuid not null references public.cq_questions (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (question_id, employee_id)
);
create index cq_answers_person on public.cq_answers (form_id, employee_id);

-- The anonymous section: no person column, and only the day it came in, so it cannot be matched
-- to a sign-in or to the receipt below by time.
create table public.cq_anon_answers (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.cq_forms (id) on delete cascade,
  question_id uuid not null references public.cq_questions (id) on delete cascade,
  value jsonb not null,
  submitted_on date not null default current_date
);
create index cq_anon_answers_form on public.cq_anon_answers (form_id, question_id);

create table public.cq_anon_receipts (
  form_id uuid not null references public.cq_forms (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  submitted_on date not null default current_date,
  primary key (form_id, employee_id)
);

create table public.cq_hr_access_log (
  id uuid primary key default gen_random_uuid(),
  form_id uuid references public.cq_forms (id) on delete cascade,
  action text not null check (action in ('buka', 'gagal', 'kunci', 'lihat', 'ekspor', 'ganti_password')),
  subject_employee_id uuid references public.employees (id) on delete set null,
  ip text,
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
create index cq_hr_access_log_time on public.cq_hr_access_log (created_at desc);

alter table public.cq_forms enable row level security;
alter table public.cq_sections enable row level security;
alter table public.cq_questions enable row level security;
alter table public.cq_progress enable row level security;
alter table public.cq_answers enable row level security;
alter table public.cq_anon_answers enable row level security;
alter table public.cq_anon_receipts enable row level security;
alter table public.cq_hr_access_log enable row level security;
revoke all on public.cq_forms, public.cq_sections, public.cq_questions, public.cq_progress, public.cq_answers,
  public.cq_anon_answers, public.cq_anon_receipts, public.cq_hr_access_log from public, anon, authenticated;
grant select, insert, update, delete on public.cq_forms, public.cq_sections, public.cq_questions, public.cq_progress,
  public.cq_answers, public.cq_anon_answers, public.cq_anon_receipts, public.cq_hr_access_log to service_role;

-- The first form: the mockup's content, as a draft for HR to check before opening it.
with form as (
  insert into public.cq_forms (name, slug, intro, card_text, minutes) values (
    'Kuesioner', 'kuesioner',
    'Kenalan lebih dekat sebelum Pra WAM dan WAM. Jawabanmu dipakai untuk menyusun kelompok, kegiatan, kamar, dan suasana meeting yang nyaman. Di akhir, kamu mendapat kartu karakter.',
    'Ceritakan dirimu untuk Pra WAM dan WAM. Sekitar 15 menit, bisa dilanjut kapan saja.', 15)
  returning id
), sections as (
  insert into public.cq_sections (form_id, key, title, short, hello, intro, tease, anonymous, sort)
  select form.id, '0', 'Kenalan dulu', 'Kenalan', 'Mulai dari yang gampang.', 'Nama dan departemen kamu akan muncul di profil yang bisa dilihat rekan. Sisanya hanya untuk HR.', 'Habis ini: hal-hal yang bikin kamu jadi kamu.', false, 1 from form
  union all
  select form.id, 'B', 'Tentang kamu', 'Tentang kamu', 'Bagian favorit kami.', 'Soal hal yang kamu suka dan cara kamu bekerja dalam tim. Ini dipakai untuk menyusun kelompok team building, kegiatan pilihan, dan ice breaking.', 'Habis ini: kembali sebentar ke masa kecilmu.', false, 2 from form
  union all
  select form.id, 'C', 'Mimpi & bertahan', 'Mimpi', 'Pelan-pelan saja.', 'Tidak ada jawaban benar atau salah, dan ini tidak ada hubungannya dengan penilaian kinerja. Di akhir bagian, kamu yang memutuskan jawabanmu boleh dibagikan atau tidak.', 'Habis ini: kerja bareng departemen lain.', false, 3 from form
  union all
  select form.id, 'E', 'Kerja bareng departemen lain', 'Kerja bareng', 'Sembilan pertanyaan singkat.', 'Jawabanmu dipakai untuk menata meeting Pra-WAM supaya nyaman: suasana ruang, jam, aturan main, sampai cara saling berterima kasih. Rekan hanya melihat rangkuman, bukan jawabanmu.', 'Habis ini: biar tidurmu nyenyak saat WAM.', false, 4 from form
  union all
  select form.id, 'A', 'Nyaman saat menginap', 'Menginap', 'Supaya tidurmu nyenyak saat WAM.', 'Untuk pembagian kamar WAM Januari 2027. Hanya dibaca HR, manajemen, dan panitia kamar, lalu dihapus paling lambat 30 hari setelah WAM.', 'Habis ini: satu ruang di mana kamu bisa jujur tanpa nama.', false, 5 from form
  union all
  select form.id, 'D', 'Ruang anonim', 'Anonim', 'Di sini kamu boleh jujur sepenuhnya.', 'Mulai dari sini, jawabanmu disimpan terpisah dan tidak terhubung ke nama atau emailmu. Kami hanya membaca rangkumannya.', 'Habis ini: kartu karaktermu dibuka.', true, 6 from form
  returning id, key, form_id
)
insert into public.cq_questions (form_id, section_id, key, prompt, kind, required, visibility, options, max_choices, matrix_rows, scale, placeholder, note, react, show_if, sort)
  select sections.form_id, sections.id, '1', 'Siapa nama lengkap dan nama panggilanmu?', 'text', true, 'rekan', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, 'Contoh: Dewi Lestari (Dewi)', '', '', null::jsonb, 1 from sections where sections.key = '0'
union all
  select sections.form_id, sections.id, '2', 'Kamu di departemen mana?', 'department', true, 'rekan', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 2 from sections where sections.key = '0'
union all
  select sections.form_id, sections.id, '3', 'Posisimu sekarang?', 'single', true, 'hr', '["Staf", "Supervisor / lead", "Manajer ke atas"]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', 'Dipakai untuk percabangan pertanyaan 31.', '', null::jsonb, 3 from sections where sections.key = '0'
union all
  select sections.form_id, sections.id, '4', 'Sudah berapa lama di Werkudara?', 'single', true, 'hr', '["Belum setahun", "1–3 tahun", "3–5 tahun", "Lebih dari 5 tahun"]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 4 from sections where sections.key = '0'
union all
  select sections.form_id, sections.id, '5', 'Nomor HP yang aktif selama acara?', 'text', true, 'hr', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '08xx xxxx xxxx', '', '', null::jsonb, 5 from sections where sections.key = '0'
union all
  select sections.form_id, sections.id, '6', 'Saya paham siapa yang membaca jawaban saya, dan data kenyamanan menginap akan dihapus setelah WAM.', 'consent', true, 'hr', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 6 from sections where sections.key = '0'
union all
  select sections.form_id, sections.id, '17', 'Kamu paling suka ngapain di luar kerjaan?', 'multi', true, 'rekan', '["Olahraga & outdoor", "Musik", "Film & series", "Game", "Kuliner & masak", "Traveling", "Foto & bikin konten", "Seni & kerajinan", "Baca buku", "Otomotif", "Keluarga & anak", "Komunitas & ibadah", "Lainnya"]'::jsonb, 3::integer, '[]'::jsonb, '[]'::jsonb, '', 'Dipakai untuk mengelompokkan kegiatan dan meja makan berdasarkan minat.', '{jawaban}? Kamu bakal punya teman sehobi.', null::jsonb, 7 from sections where sections.key = 'B'
union all
  select sections.form_id, sections.id, '18', 'Lebih spesifiknya? Atau topik yang bikin kamu betah ngobrol berjam-jam.', 'text', false, 'rekan', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, 'Contoh: F1, kopi manual brew, anime 90-an', '', '', null::jsonb, 8 from sections where sections.key = 'B'
union all
  select sections.form_id, sections.id, '19', 'Ada topik yang lebih baik tidak dibahas selama acara?', 'text', false, 'hronly', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 9 from sections where sections.key = 'B'
union all
  select sections.form_id, sections.id, '20', 'Di acara kelompok, kamu paling nyaman di mana?', 'single', false, 'rekan', '["Kelompok besar", "Kelompok kecil", "Ngobrol berdua", "Tergantung, tapi butuh waktu sendiri buat recharge"]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 10 from sections where sections.key = 'B'
union all
  select sections.form_id, sections.id, '21', 'Aktivitas bareng yang paling kamu nikmati?', 'multi', false, 'rekan', '["Outdoor", "Games kompetitif", "Diskusi", "Kreatif / seni", "Musik / karaoke", "Kuliner", "Santai tanpa agenda"]'::jsonb, 3::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 11 from sections where sections.key = 'B'
union all
  select sections.form_id, sections.id, '21b', 'Makanan atau camilan yang paling kamu suka, apa pun itu?', 'text', false, 'rekan', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, 'Jujur saja. Misalnya seblak, martabak manis, es kopi susu', 'Tidak ada jawaban yang salah.', '', null::jsonb, 12 from sections where sections.key = 'B'
union all
  select sections.form_id, sections.id, '21c', 'Dari daftar ini, camilan dan minuman mana yang paling kamu suka?', 'multi', false, 'fasil', '["Kopi", "Teh", "Infused water", "Air kelapa", "Jus tanpa gula tambahan", "Susu atau oat milk", "Buah potong", "Kacang panggang", "Edamame", "Ubi atau singkong rebus", "Roti gandum", "Yogurt", "Kue tradisional"]'::jsonb, 3::integer, '[]'::jsonb, '[]'::jsonb, '', 'Dipakai untuk menyiapkan camilan dan minuman di berbagai agenda.', '', null::jsonb, 13 from sections where sections.key = 'B'
union all
  select sections.form_id, sections.id, '34', 'Di dalam tim, peran apa yang biasanya kamu ambil?', 'multi', true, 'fasil', '["Pencetus ide", "Penyusun strategi", "Eksekutor", "Penengah", "Penyemangat", "Teliti soal detail", "Pendengar"]'::jsonb, 2::integer, '[]'::jsonb, '[]'::jsonb, '', 'Dipakai untuk menyeimbangkan kelompok team building.', 'Tim yang seimbang butuh peran ini.', null::jsonb, 14 from sections where sections.key = 'B'
union all
  select sections.form_id, sections.id, '35', 'Seberapa siap kamu untuk aktivitas fisik?', 'single', true, 'fasil', '["Ringan saja, misalnya jalan santai", "Sedang, misalnya outbound dan games lapangan", "Berat juga oke, misalnya hiking atau olahraga berat"]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 15 from sections where sections.key = 'B'
union all
  select sections.form_id, sections.id, '36', 'Ada aktivitas yang bikin kamu tidak nyaman?', 'multi', true, 'fasil', '["Ketinggian", "Air, atau tidak bisa berenang", "Gelap atau ruang sempit", "Tampil di depan banyak orang", "Kompetisi fisik", "Tidak ada"]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', 'Dipakai untuk keamanan kegiatan WAM (misalnya kegiatan di ketinggian, di air, atau outbound) dan supaya tidak ada yang dipaksa.', '', null::jsonb, 16 from sections where sections.key = 'B'
union all
  select sections.form_id, sections.id, '22', 'Satu hal tentang kamu yang jarang diketahui orang kantor?', 'text', false, 'rekan', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', 'Ada pilihan: boleh dipakai untuk ice breaking (Ya/Tidak).', '', null::jsonb, 17 from sections where sections.key = 'B'
union all
  select sections.form_id, sections.id, '37', 'Lagu yang selalu bikin kamu semangat?', 'text', false, 'rekan', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, 'Judul dan penyanyi', 'Masuk playlist bersama WAM.', '', null::jsonb, 18 from sections where sections.key = 'B'
union all
  select sections.form_id, sections.id, '23', 'Siapa rekan dari departemen lain yang ingin kamu kenal lebih dekat?', 'person', false, 'fasil', '[]'::jsonb, 3::integer, '[]'::jsonb, '[]'::jsonb, '', 'Di platform sebaiknya berupa pilihan dari daftar staf, bukan isian bebas, supaya bisa langsung dipakai untuk pairing.', '', null::jsonb, 19 from sections where sections.key = 'B'
union all
  select sections.form_id, sections.id, '24', 'Waktu kecil, kamu ingin jadi apa?', 'long', true, 'pilih', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, 'Dan kenapa mimpi itu menarik buatmu waktu itu?', '', 'Mimpi yang keren. Simpan dulu, nanti kita bahas.', null::jsonb, 20 from sections where sections.key = 'C'
union all
  select sections.form_id, sections.id, '25', 'Kalau tidak ada batasan uang, waktu, atau omongan orang, apa yang ingin kamu coba?', 'long', false, 'pilih', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 21 from sections where sections.key = 'C'
union all
  select sections.form_id, sections.id, '26', 'Apa yang paling sering bikin kamu menahan sebuah ide atau mimpi?', 'multi', false, 'pilih', '["Takut gagal", "Takut dinilai", "Waktu", "Uang", "Harapan keluarga atau lingkungan", "Bingung mulai dari mana", "Lainnya"]'::jsonb, 2::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 22 from sections where sections.key = 'C'
union all
  select sections.form_id, sections.id, '27', 'Ceritakan satu masa sulit yang berhasil kamu lewati. Apa yang bikin kamu bertahan?', 'long', false, 'pilih', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 23 from sections where sections.key = 'C'
union all
  select sections.form_id, sections.id, '28', 'Menurutmu, apa yang bikin Werkudara bisa bertahan sampai hari ini?', 'long', true, 'pilih', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, 'Satu-dua kalimat sudah cukup', '', 'Terima kasih. Ini yang bikin kita bertahan.', null::jsonb, 24 from sections where sections.key = 'C'
union all
  select sections.form_id, sections.id, '29', 'Punya satu ide untuk Werkudara di 2027 yang belum pernah kamu sampaikan?', 'long', false, 'pilih', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, 'Sekecil atau seberani apa pun', '', '', null::jsonb, 25 from sections where sections.key = 'C'
union all
  select sections.form_id, sections.id, '31', 'Satu hal apa yang ingin kamu lakukan berbeda supaya timmu berani mencoba hal baru di 2027?', 'long', false, 'pilih', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', 'Hanya muncul untuk supervisor/lead dan manajer.', '', '{"question": "3", "not": ["Staf"]}'::jsonb, 26 from sections where sections.key = 'C'
union all
  select sections.form_id, sections.id, '30', 'Jawabanmu di bagian ini boleh...', 'single', true, 'hr', '["Dibagikan dengan namaku", "Dibagikan tanpa nama", "Hanya dibaca fasilitator"]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 27 from sections where sections.key = 'C'
union all
  select sections.form_id, sections.id, 'E1', 'Departemen mana yang paling sering kamu ajak koordinasi?', 'department', true, 'fasil', '[]'::jsonb, 2::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 28 from sections where sections.key = 'E'
union all
  select sections.form_id, sections.id, 'E2', 'Selama 2026, data atau info apa dari departemen lain yang paling sering telat, kurang lengkap, atau beda versi?', 'long', true, 'fasil', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 29 from sections where sections.key = 'E'
union all
  select sections.form_id, sections.id, 'E3', 'Satu hal yang ingin kamu minta, atau tawarkan, ke departemen lain supaya 2027 lebih lancar?', 'long', false, 'fasil', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 30 from sections where sections.key = 'E'
union all
  select sections.form_id, sections.id, 'E4', 'Di meeting Pra-WAM, kamu paling nyaman menyampaikan pendapat lewat...', 'single', true, 'fasil', '["Diskusi terbuka", "Kelompok kecil", "Ditulis dulu, baru dibahas", "Kotak anonim"]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', 'Format meeting akan disesuaikan.', null::jsonb, 31 from sections where sections.key = 'E'
union all
  select sections.form_id, sections.id, 'E5', 'Hal apa yang paling bikin kamu malas di sebuah meeting?', 'multi', false, 'fasil', '["Molor dari jadwal", "Tidak ada keputusan di akhir", "Satu-dua orang mendominasi", "Peserta sibuk HP atau laptop", "Tujuannya tidak jelas", "Terlalu banyak slide", "Bahasan melebar ke mana-mana", "Lainnya"]'::jsonb, 2::integer, '[]'::jsonb, '[]'::jsonb, '', 'Dipakai menyusun aturan main tiap meeting. Ditampilkan tanpa nama.', '', null::jsonb, 32 from sections where sections.key = 'E'
union all
  select sections.form_id, sections.id, 'E6', 'Jam berapa otakmu paling segar untuk diskusi yang berat?', 'single', false, 'fasil', '["Pagi, 08.00 sampai 11.00", "Siang, 11.00 sampai 14.00", "Sore, 14.00 sampai 17.00", "Sama saja"]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', 'Dipakai mengatur jam meeting yang paling berat.', '', null::jsonb, 33 from sections where sections.key = 'E'
union all
  select sections.form_id, sections.id, 'E7', 'Satu keahlianmu yang mungkin belum diketahui departemen lain, dan boleh mereka mintai tolong?', 'text', false, 'rekan', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, 'Misalnya rumus Excel, edit video, negosiasi vendor, bahasa Mandarin', 'Muncul di sesi singkat "ternyata bisa minta tolong ke dia".', '', null::jsonb, 34 from sections where sections.key = 'E'
union all
  select sections.form_id, sections.id, 'E8', 'Kalau rekan ingin berterima kasih, cara apa yang paling bikin kamu senang?', 'single', false, 'fasil', '["Disebut di depan forum", "Pesan pribadi", "Ditulis di kartu atau catatan", "Ditraktir", "Cukup bilang langsung"]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', 'Dipakai di sesi penutup meeting.', '', null::jsonb, 35 from sections where sections.key = 'E'
union all
  select sections.form_id, sections.id, 'E9', 'Suasana ruang meeting seperti apa yang bikin kamu betah?', 'multi', false, 'fasil', '["Lampu terang", "Lampu hangat dan redup", "Ada musik pelan", "Hening tanpa musik", "Duduk di kursi dan meja", "Duduk santai di sofa atau lesehan", "Dekat jendela atau cahaya alami", "Ada tanaman", "Boleh berdiri atau jalan-jalan", "Lainnya"]'::jsonb, 3::integer, '[]'::jsonb, '[]'::jsonb, '', 'Ruang meeting tiap departemen ditata dari jawaban timmu. Aroma ruangan sengaja tidak ditawarkan supaya aman bagi yang punya alergi atau fobia.', '', null::jsonb, 36 from sections where sections.key = 'E'
union all
  select sections.form_id, sections.id, '33', 'Untuk pembagian kamar, kamu...', 'single', true, 'hr', '["Laki-laki", "Perempuan"]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 37 from sections where sections.key = 'A'
union all
  select sections.form_id, sections.id, '7', 'Biasanya kamu tidur jam berapa?', 'single', true, 'hr', '["Sebelum 22.00", "22.00–24.00", "Lewat tengah malam"]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 38 from sections where sections.key = 'A'
union all
  select sections.form_id, sections.id, '8', 'Dan bangun jam berapa?', 'single', true, 'hr', '["Sebelum 05.00", "05.00–06.30", "Setelah 06.30"]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 39 from sections where sections.key = 'A'
union all
  select sections.form_id, sections.id, '9', 'Kebiasaan tidur yang sebaiknya diketahui teman sekamar?', 'multi', true, 'hr', '["Mendengkur", "Pakai earplug", "Pakai penutup mata", "Butuh kamar gelap total", "Nyaman dengan lampu menyala", "Gampang terbangun", "Sering ke kamar mandi malam", "Tidak ada", "Tidak ingin menjawab"]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 40 from sections where sections.key = 'A'
union all
  select sections.form_id, sections.id, '10', 'AC yang nyaman buatmu?', 'single', true, 'hr', '["Dingin sekali", "Sedang", "Tidak terlalu dingin", "Bebas"]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 41 from sections where sections.key = 'A'
union all
  select sections.form_id, sections.id, '11', 'Soal rokok?', 'single', true, 'hr', '["Saya merokok", "Tidak merokok, tidak keberatan", "Tidak merokok, keberatan"]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 42 from sections where sections.key = 'A'
union all
  select sections.form_id, sections.id, '12', 'Mau sekamar dengan siapa?', 'single', true, 'hr', '["Siapa saja boleh", "Lebih nyaman satu departemen", "Beda departemen, biar kenal"]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 43 from sections where sections.key = 'A'
union all
  select sections.form_id, sections.id, '13', 'Ada 1–3 rekan yang nyaman jadi teman sekamarmu?', 'person', false, 'hr', '[]'::jsonb, 3::integer, '[]'::jsonb, '[]'::jsonb, '', 'Tidak dijamin terpenuhi. Keberatan soal kamar disampaikan langsung ke HR, bukan lewat form.', '', null::jsonb, 44 from sections where sections.key = 'A'
union all
  select sections.form_id, sections.id, '14', 'Ada kebutuhan makanan?', 'multi', false, 'hr', '["Tidak ada", "Halal", "Vegetarian", "Vegan", "Ada alergi", "Lainnya"]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 45 from sections where sections.key = 'A'
union all
  select sections.form_id, sections.id, '14b', 'Ada alergi, fobia, atau hal lain yang sebaiknya tidak ada di dekatmu selama acara?', 'long', false, 'hr', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, 'Misalnya alergi kacang, fobia buah atau bau tertentu, takut gelap. Tulis juga seberapa parah.', '', '', null::jsonb, 46 from sections where sections.key = 'A'
union all
  select sections.form_id, sections.id, '15', 'Ada kebutuhan ibadah yang perlu panitia siapkan?', 'text', false, 'hr', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, 'Waktu atau tempat', '', '', null::jsonb, 47 from sections where sections.key = 'A'
union all
  select sections.form_id, sections.id, '16', 'Ada kondisi kesehatan yang perlu panitia tahu supaya kamu aman?', 'long', false, 'hronly', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, 'Misalnya asma, mabuk perjalanan, atau tidak bisa aktivitas fisik berat', '', '', null::jsonb, 48 from sections where sections.key = 'A'
union all
  select sections.form_id, sections.id, '38', 'Ukuran kaos?', 'single', true, 'hr', '["S", "M", "L", "XL", "XXL", "XXXL"]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', 'Hapus jika WAM tidak membagikan merchandise.', '', null::jsonb, 49 from sections where sections.key = 'A'
union all
  select sections.form_id, sections.id, '32', 'Ada lagi yang perlu kami tahu supaya WAM nyaman buatmu?', 'long', false, 'hr', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 50 from sections where sections.key = 'A'
union all
  select sections.form_id, sections.id, 'D1', 'Seberapa terasa nilai-nilai ini di keseharian kerjamu selama 2026?', 'matrix', true, 'anon', '[]'::jsonb, null::integer, '["Hospitality", "Excellence Service", "Inclusivity", "Sustainability"]'::jsonb, '["Belum terasa", "Sedikit", "Cukup", "Terasa", "Sangat terasa"]'::jsonb, '', '', '', null::jsonb, 51 from sections where sections.key = 'D'
union all
  select sections.form_id, sections.id, 'D2', 'Nilai mana yang paling terasa? Ceritakan satu momennya.', 'long', false, 'anon', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 52 from sections where sections.key = 'D'
union all
  select sections.form_id, sections.id, 'D3', 'Nilai mana yang paling perlu diperbaiki di 2027, dan apa satu langkah konkretnya?', 'long', false, 'anon', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 53 from sections where sections.key = 'D'
union all
  select sections.form_id, sections.id, 'D4', 'Seberapa sering kamu merasa ide atau pendapatmu didengar di tim?', 'single', true, 'anon', '["Tidak pernah", "Jarang", "Kadang", "Sering", "Selalu"]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', 'Jawaban ini tidak terhubung ke namamu.', null::jsonb, 54 from sections where sections.key = 'D'
union all
  select sections.form_id, sections.id, 'D5', 'Satu kebiasaan kecil di kantor atau di event yang bisa kita ubah supaya lebih sustainable?', 'long', false, 'anon', '[]'::jsonb, null::integer, '[]'::jsonb, '[]'::jsonb, '', '', '', null::jsonb, 55 from sections where sections.key = 'D';

commit;
