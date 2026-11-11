# Rancangan kuesioner personal WAM

Status: tahap 1 dan 2 dibangun (4 November 2026). Tahap 3 sedang dibangun: **Kartu rekan** (galeri
dan profil rekan), **Rekap**, **Ekspor**, **Kamar**, **Kebutuhan peserta**, dan **Hasil survei** untuk BOD
sudah ada (5 November; migrasi 202611050001 dan 202611050002 sudah dijalankan). Tahap 4
(penghapusan otomatis dan pengingat) dibangun 5 November. Tahap 4 belum. Ditulis 4 November 2026, diperbarui 5 November 2026.

Sumber: artifact mockup **"Cerita Kita WAM 2026"**
(https://claude.ai/artifact/BwHcrRv8Wmcg4oRTNW5Uaq). Isinya 6 bagian, sekitar 60 pertanyaan, level
baca per pertanyaan, dan kartu karakter di akhir. Jawaban di mockup hanya tersimpan di browser;
rancangan ini memindahkannya ke aplikasi WAM.

## Tujuan

1. Setiap karyawan mengisi satu kali, lewat akun WAM yang sudah ada.
2. Data yang terkumpul dipakai bersama oleh Pra WAM dan WAM:
   - kelompok team building;
   - ice breaking;
   - suasana dan jam meeting;
   - camilan dan makanan;
   - pembagian kamar WAM;
   - keamanan kegiatan;
   - masukan untuk manajemen.
3. HR mengubah nama kuesioner, pertanyaan, dan teks sendiri di admin, tanpa developer.
4. Di akhir, peserta mendapat kartu karakter seperti NFT: **karakternya dari jawaban**, **levelnya
   acak** (Common sampai Legendary). Kartunya bisa dipakai sebagai foto profil.

## Nama dan alamat kuesioner

- **Nama diatur HR** di admin. Bawaannya **"Kuesioner"**; contoh nama lain: "Cerita Kita".
- **Nama itu juga menjadi alamatnya:**
  - "Kuesioner" → `/wam/kuesioner`;
  - "Cerita Kita" → `/wam/cerita-kita`.
- **Aturan alamat:**
  - huruf kecil, angka, dan tanda hubung, 3–40 karakter;
  - tidak boleh sama dengan halaman WAM yang sudah ada (`book`, `agenda`, `account`, `settings`,
    `about`, `manage`, dan seterusnya; daftarnya dicek di server);
  - alamat bisa diubah terpisah dari nama bila perlu.
- **Ganti nama tidak merusak tautan.** Alamat lama tetap dicatat dan otomatis dialihkan ke alamat
  baru, jadi tautan yang sudah dibagikan HR tetap jalan.
- Nama yang sama dipakai di kartu Beranda, judul halaman, dan menu admin.

## Alur peserta

1. **Masuk ke aplikasi.** Di Beranda ada kartu kuesioner (memakai nama dari admin), sejajar dengan
   "Apa itu WAM?". Isinya ringkasan, sisa waktu ("sekitar 15 menit"), dan progres ("2 dari 6
   bagian").
   - Kuesioner **wajib**: kartunya tidak bisa ditutup sampai selesai.
   - Setelah selesai, kartunya berganti menjadi kartu karakter si peserta.
2. **Halaman khusus** (`/wam/kuesioner` bawaannya). Tampilan sendiri mengikuti mockup:
   - kartu yang dikupas satu per satu;
   - stiker progres untuk tiap bagian;
   - reaksi kecil setelah menjawab.

   Halamannya tetap di dalam akun WAM: tidak perlu login lagi, dan tautannya bisa dibagikan.
3. **Simpan otomatis per pertanyaan ke server.** Bisa berhenti lalu lanjut dari HP lain. Pertanyaan
   wajib diberi tanda, dan tombol Lanjut baru aktif setelah dijawab.
4. **Percabangan.** Contoh: pertanyaan 31 hanya muncul untuk supervisor/lead ke atas. Bagian
   "Ruang anonim" dikirim terpisah (lihat Privasi).
5. **Selesai.** Jawaban diproses menjadi karakter, level diundi, lalu kartunya dibuka dengan dibalik.
   Pilihan sesudahnya:
   - **Pakai sebagai foto profil**;
   - **Simpan kartu** (1080×1350);
   - **Simpan wallpaper** (1080×2340).
6. **Ubah jawaban.** Masih bisa sampai tenggat yang diatur HR, kecuali bagian anonim, yang terkirim
   sekali. Mengubah jawaban bisa mengubah karakter, tetapi level kartu tetap (lihat Kartu
   karakter).

## Admin WAM: bagian baru (nama mengikuti kuesioner)

Satu entri baru di `wamSections`, grup baru **"Data peserta"**, dengan sub-halaman:

| Sub-halaman | Isi |
|---|---|
| **Konten** | Nama dan alamat kuesioner. Bagian: judul, sapaan, pengantar. Pertanyaan: teks, tipe, pilihan, maks pilihan, wajib, level baca, catatan, placeholder, percabangan, urutan. Ada pratinjau persis seperti di HP. |
| **Kartu** | Katalog karakter dan aturan yang memilihnya dari jawaban; peluang dan batas jumlah tiap level; sebaran level yang sudah keluar. Kartu baru bisa ditambah kapan saja. |
| **Pengaturan** | Dibuka/ditutup, **Untuk siapa** (semua peserta atau orang terpilih, lihat di bawah), tenggat ubah jawaban, tanggal hapus data menginap, teks kartu Beranda, Akses Data HR (siapa yang boleh membuka; diubah super admin). |
| **Progres** | Siapa sudah dan belum, per departemen. Tombol "Ingatkan yang belum" lewat notifikasi WAM. |
| **Data HR** 🔒 | Jawaban per orang untuk data `hr` dan `hronly`. Hanya terbuka dengan email WAM orang yang punya akses. |
| **Rekap** | Grafik per pertanyaan dan kutipan jawaban terbuka, mengikuti level baca. Bagian anonim hanya rangkuman. |
| **Kamar** (tahap 3) 🔒 | Pairing kamar dari jawaban bagian menginap (papan Penpot "K3 · Pairing kamar"). |
| **Ekspor** | Excel per bagian, sesuai hak pembaca. Data HR hanya setelah Data HR dibuka. |

Supaya data tidak rusak:
- Mengubah pertanyaan setelah ada jawaban tidak mengubah jawaban lama.
- Setiap pertanyaan punya kunci tetap. Mengganti teks tidak memutus jawaban; menghapus pertanyaan
  hanya menyembunyikannya.
- Daftar departemen (pertanyaan 2) diambil dari unit di Data karyawan, bukan isian manual.
- Pertanyaan "pilih rekan" (13 dan 23) memakai daftar karyawan dengan pencarian, bukan isian bebas,
  supaya bisa langsung dipakai untuk pairing.

### Revisi pertanyaan (11 November 2026)

Mengikuti "Cerita Kita WAM 2026: daftar pertanyaan" (58 pertanyaan; sebelumnya 55), lewat migrasi
`202611110003_wam_questionnaire_revision.sql`. Baru: **5b** kontak darurat (wajib, HR), **14c**
alergi dan makanan yang dihindari (HR), **14d** kebutuhan khusus untuk ikut kegiatan (Panitia dan HR).
Diubah: **14** "kebutuhan atau batasan makanan" ("Ada alergi" menjadi "Alergi makanan" dan "Ada
makanan yang kuhindari"), **14b** hanya fobia, **16** ditambah obat rutin, catatan **3** tanpa nomor.
14 dan 14b kembali ke `hr`. Teks hanya diganti bila masih teks awal, jadi suntingan HR tetap. Karena
5b wajib, orang yang sudah selesai sebelum migrasi tercatat belum selesai sampai mengisinya.

### Opsi dan isian dari Data karyawan (11 November 2026)

Keputusan pemilik: data yang sudah ada di database tidak ditanyakan ulang dengan pilihan lain.
- **Departemen** (pertanyaan 2 dan E1) ditawarkan persis seperti di Data karyawan: departemen orang
  aktif dan pekerjaan lain mereka (`departmentOptions`). Impor unit lama (`org_units`) hanya cadangan
  bila Data karyawan tidak bisa dibaca.
- **Posisi** (3) memakai jabatan Data karyawan: Staf, Lead, HOD, GM (migrasi
  `202611110004_wam_questionnaire_position.sql`; jawaban lama "Supervisor / lead" menjadi Lead,
  "Manajer ke atas" menjadi HOD). Pertanyaan khusus lead (31) tetap untuk selain Staf.
- **Terisi otomatis**: nama lengkap (panggilan) (1), departemen (2), posisi (3, jabatan tertinggi
  dari pekerjaannya; tidak untuk BOD), nomor HP (5), dan jenis kelamin untuk kamar (33) tampil sudah
  terisi dengan tanda "Sudah terisi dari Data karyawan". Jawabannya baru tersimpan saat orangnya
  menekan Lanjut di kartu itu; yang diubah atau dikosongkan menjadi jawabannya sendiri. Pertanyaan
  yang sudah dijawab tidak pernah ditimpa, dan isian yang tidak cocok dengan pilihan (HR mengubah
  pertanyaannya) dilewati. Aturannya `prefillAnswers` (`src/lib/pra-wam/questionnaire-prefill.ts`).

### Untuk siapa (11 November 2026)

Kuesioner bisa dibuka untuk **semua peserta** (bawaan, seperti sebelumnya) atau hanya untuk
**orang terpilih** (`cq_forms.audience` = `semua` | `pilih`, `audience_ids`; migrasi
`202611110001_wam_questionnaire_audience.sql`, sebelum itu selalu untuk semua).

- **Memilih:** Pengaturan → Untuk siapa. Satu departemen sekaligus (ketuk lagi untuk membuang semua
  orangnya; garis putus-putus = sebagian), lalu tambah atau buang per orang (cari nama atau
  departemen, "Hanya yang dipilih"). Hanya karyawan aktif yang bisa dipilih; disimpan sebagai daftar
  orang, jadi karyawan baru di departemen itu **tidak** ikut otomatis.
- **Yang tidak terpilih tidak melihatnya sama sekali:** tidak ada kartu kuesioner di Beranda,
  alamat kuesioner dan Kartu rekan "tidak ditemukan", jawaban ditolak server, dan tidak mendapat
  pengingat. Admin WAM tetap bisa membuka dan mencoba (jawabannya data uji, tidak dihitung). BOD dan
  panitia tetap melihat galeri Kartu rekan.
- **Hitungan:** Progres, "Ingatkan yang belum", partisipasi di Hasil survei, Ringkasan BOD, dan MCP
  `hasil_survei` hanya menghitung orang yang dituju. Jawaban orang yang kemudian tidak terpilih tetap
  tersimpan (dan tetap di Rekap), hanya tidak dihitung di progres.
- **Tidak boleh terbuka untuk tidak seorang pun:** memilih "Orang terpilih" tanpa satu orang pun ditolak selama
  kuesioner dibuka, dan membuka kuesioner ditolak selama belum ada yang dipilih.
- Aturan murninya `inAudience`, `seesQuestionnaire` (`src/lib/pra-wam/questionnaire.ts`); simpan lewat
  `PATCH /api/admin/wam/questionnaire` dengan `audience` dan `audienceIds`.

## Akses Data HR

Data yang paling pribadi tidak cukup dilindungi password admin biasa, karena banyak orang yang tahu
password admin. Dulu dipakai satu password HR bersama; sekarang diganti **akses per orang**, supaya
log menunjukkan siapa yang membuka apa.

- **Daftar akses.**
  - Di Pengaturan kuesioner ada bagian "Akses Data HR": nama, departemen, dan email orang yang
    boleh membuka. Saat ini 3 orang dari HR dan HRGA; paling banyak 20.
  - Hanya **super admin** yang bisa menambah (dari karyawan aktif yang punya akun WAM, dengan
    pencarian) dan mencabut (dengan konfirmasi). Admin biasa hanya melihat daftarnya.
  - Mencabut akses langsung mengunci Data HR di perangkat orang itu.
- **Cara buka.**
  - Admin yang sudah login masuk ke halaman Data HR 🔒, lalu mengisi **email WAM** orang yang
    punya akses. Tidak ada password tambahan.
  - Server mencocokkan email (tanpa beda huruf besar/kecil) dengan karyawan aktif yang punya akun
    WAM aktif, lalu memeriksa orang itu ada di daftar akses.
  - Kalau cocok, kunci terbuka **30 menit** di perangkat itu saja (cookie terpisah yang
    ditandatangani, berisi orangnya, dan ikut mati bila sesi admin berakhir). Kepala halaman
    menampilkan "Dibuka oleh <nama>" dan sisa waktunya. Ada tombol "Kunci sekarang".
  - Email yang tidak dikenal dan email tanpa akses mendapat jawaban yang sama ("Email ini tidak
    punya akses Data HR"), supaya halaman tidak membocorkan siapa yang punya akses.
- **Catatan keamanan: email saja kuncinya** (keputusan pemilik). Siapa pun yang punya login admin
  dan tahu email salah satu orang HR bisa membuka Data HR. Penjaganya: setiap pembukaan dan setiap
  data per orang yang dibuka **dicatat atas nama email itu**, jadi orang HR bisa melihat di log
  bila emailnya dipakai orang lain.
- **Yang dikunci:**
  - semua jawaban per orang dengan level `hr` dan `hronly` (kesehatan, data menginap, kontak);
  - pairing kamar;
  - ekspor data HR.
- **Dijaga di server.** Setiap API data HR memeriksa sesi admin **dan** kunci HR (dan bahwa orangnya
  masih di daftar). Tanpa itu, data tidak dikirim sama sekali; jadi ini bukan sekadar tampilan yang
  disembunyikan.
- **Batas percobaan.** Dibatasi per jaringan (IP) dan per email. Lima kali gagal dalam 15 menit
  mengunci sementara selama 15 menit, dihitung per jaringan dan per email karyawan.
- **Log akses per orang.** Setiap buka, gagal buka (dengan nama pemilik email bila emailnya
  karyawan), buka data per orang, kunci, dan ekspor dicatat: siapa, waktu, IP, perangkat, dan data
  siapa yang dibuka. Perubahan daftar akses juga dicatat (oleh super admin). Log bisa dilihat dari
  halaman Data HR.
- **Anonim tetap anonim.** Akses Data HR pun tidak membuka jawaban anonim per orang, karena memang
  tidak disimpan dengan nama.

## Level baca per pertanyaan

Kode di mockup dipetakan ke peran yang sudah ada:

| Kode | Arti di mockup | Yang bisa membaca di WAM |
|---|---|---|
| `rekan` | Terlihat rekan | Semua peserta, di profil orang itu |
| `fasil` | Fasilitator | Panitia dan admin (rekap dan per orang) |
| `hr` | HR | Admin + Data HR dibuka (email WAM yang punya akses). Panitia kamar hanya melihat hasil pairing, bukan jawaban per orang |
| `hronly` | Hanya HR | Admin + Data HR dibuka saja; tidak tampil ke panitia atau BOD |
| `pilih` | Ditentukan peserta (pertanyaan 30) | Sesuai pilihan: dengan nama, tanpa nama, atau hanya fasilitator |
| `anon` | Anonim | Tidak ada yang bisa melihat per orang; hanya rangkuman |

- BOD melihat rekap (tanpa `hronly`), tidak melihat jawaban per orang.
- **Level per jawaban** (migrasi 202611050002): setiap jawaban menyimpan level pertanyaannya saat
  diisi (`cq_answers.read_level`, dicap trigger database). Yang dipakai selalu level **paling ketat**
  di antara level jawaban dan level pertanyaan sekarang, jadi melonggarkan level pertanyaan tidak
  membuka jawaban yang diisi di bawah label yang lebih ketat. Berlaku di Kartu rekan, Rekap, Ekspor,
  dan Kebutuhan peserta.
- **14 dan 14b pindah dari `hr` ke `fasil`** (keputusan pemilik, 5 Nov 2026), supaya panitia
  konsumsi tahu nama orangnya. Jawaban yang sudah masuk sebelum migrasi tetap `hr`.
- Server yang menegakkan aturan ini di setiap API, bukan hanya tampilan.

## Data yang masuk ke akun WAM

| Data dari kuesioner | Dipakai di |
|---|---|
| Nama panggilan (1) | Usulan perubahan ke Data karyawan; HR yang menyetujui |
| Nomor HP aktif (5), kontak darurat (5b) | Kontak darurat panitia selama acara; 5b dihapus otomatis bersama data menginap |
| Minat dan topik (17, 18), lagu (37), keahlian (E7), fakta unik (22, bila diizinkan) | Profil yang bisa dilihat rekan, ice breaking, playlist WAM |
| Peran di tim (34), kesiapan fisik (35), hal tidak nyaman (36) | Penyusunan kelompok dan keamanan kegiatan (panitia) |
| Makanan (14), alergi (14c), fobia (14b), kebutuhan khusus (14d), ibadah (15), kesehatan (16) | Panitia konsumsi dan acara (Kebutuhan peserta): sejak 11 Nov 2026 makanan, alergi, dan fobia `hr` (panitia hanya melihat jumlah, HR meneruskan ke dapur), kebutuhan khusus dengan nama, ibadah hanya jumlah, kesehatan hanya HR |
| Data menginap (33, 7–13, 38) | Pairing kamar dan kaos; **dihapus otomatis 30 hari setelah WAM** |
| Kartu karakter | Foto profil (opsional), Beranda, profil rekan |

## Kartu karakter dan avatar

Kartunya seperti **NFT**: koleksi bernomor dan unik, dengan level kelangkaan. **Tidak memakai
blockchain** (keputusan 4 Nov 2026); keunikan dan catatan undiannya dijaga di database WAM. Isi
kartunya punya dua sumber:

| Bagian kartu | Asalnya |
|---|---|
| **Karakter** (tokoh, gambar, kelas, deskripsi, kekuatan) | **Dari jawaban dan kepribadian** |
| **Level** (Common, Uncommon, Rare, Epic, Legendary) | **Acak**, diundi di server |
| **Detail tampilan** (latar, aksen sudut, stiker) | **Acak**, diundi di server |
| **Nomor kartu** (#001…) dan **DNA** (kode unik kombinasi) | Urut selesai dan dihitung dari isi kartu |

**Karakter dari jawaban.**
- Katalog kartu ada di admin (sub-halaman Kartu). Setiap karakter punya:
  - gambar (diunggah ke R2), nama karakter, nama tokoh, kelas, judul, deskripsi, dan kekuatan;
  - **aturan skor**: pilihan jawaban mana yang menambah skor karakter ini, dan berapa bobotnya.
    Contoh dari mockup: "Peran di tim = Eksekutor" +3 ke Garda Depan, "Aktivitas = Outdoor" +1.
- Kartu baru bisa ditambah kapan saja; mockup baru berisi 8 karakter.
- Karakter dengan skor tertinggi yang dipakai. Kalau seri, diundi di antara yang seri saja, sama
  seperti mockup.

**Level dan detail acak.**
- Peluang tiap level diatur HR di admin. Bawaan dari mockup: Common 45 %, Uncommon 27 %, Rare 18 %,
  Epic 7 %, Legendary 3 %.
- Bisa diberi **batas jumlah**, misalnya Legendary paling banyak 2 kartu, seperti edisi terbatas.
  Kalau batasnya penuh, undian turun ke level di bawahnya.
- Latar (8), aksen (6), dan stiker (0–2 dari 12) diundi. Kombinasi karakter + latar + aksen +
  stiker dijaga **unik**, jadi tidak ada dua kartu yang sama persis.
- **Undian di server**, memakai pengacak kriptografis (bukan di browser), supaya tidak bisa diakali
  dengan mengulang halaman.

**Kapan diundi dan apa yang bisa berubah.**
- Level dan detail **diundi sekali** saat orang itu pertama kali menyelesaikan kuesioner, lalu
  **dikunci selamanya**. Mengubah jawaban atau membuka ulang halaman tidak mengundi ulang.
- Karakter mengikuti jawaban sampai tenggat: kalau jawaban yang dipakai aturan berubah, karakternya
  bisa ikut berubah, tetapi level, detail, dan nomornya tetap. Setelah tenggat, karakter juga
  dikunci.
- Kalau HR menambah karakter atau mengubah aturan sebelum tenggat, admin melihat pratinjau dulu:
  berapa orang yang karakternya akan berubah.
- Hasil undian dicatat (waktu dan hasilnya), supaya kalau ada yang bertanya "kenapa saya
  Common", HR bisa menunjukkan bahwa undiannya adil.

**Gambar dan pemakaian.**
- 34 aset dari mockup (8 karakter, 8 latar, 6 aksen, 12 stiker) dipindahkan dari artifact ke R2
  sebagai isi awal katalog. **Gambar tidak masuk repo** (repo publik): HR mengunggahnya di Admin
  WAM → Kuesioner → Kartu, sekaligus satu folder dengan nama `karakter-01.webp`, `latar-01.png`,
  `aksen-01.png`, `stiker-01.png`, atau satu per satu. Aplikasi melayani gambar lewat
  `/api/wam/card-art/…` (harus login), supaya kartu bisa digambar di canvas dan disimpan.
- Tanpa gambar, kartu tetap jalan dan digambar dengan warna polos.
- Kartu disusun di browser seperti mockup (gaya full-art: aksen sudut ikut diundi dan masuk DNA,
  tetapi tidak digambar, sama seperti mockup). **Belum dibangun:** menyimpan hasil susunan ke R2
  untuk profil rekan dan galeri (tahap 3).
- **Kartu uji.** Kartu yang diundi saat Admin WAM mencoba draf tidak bernomor dan tidak dihitung
  ke batas level; saat kuesioner dibuka, kartu itu diganti undian sungguhan. Tab Kartu punya tombol
  untuk menghapus kartu uji.
- **Batas jumlah level** dicek saat mengundi. Dua orang yang selesai pada detik yang sama bisa
  sama-sama lolos batas (paling banyak lebih satu); nomor dan kombinasi tampilan tetap dijaga unik
  oleh database.
- **Jadi foto profil.** Potongan persegi dari karakter diperkecil ke 320×320 WebP dan disimpan
  lewat jalur foto profil yang sudah ada (`pra-wam/foto/…`). Pemakaiannya opsional dan bisa
  diganti foto biasa kapan saja.
- **Kartu rekan** (tahap 3, dibangun): `/wam/rekan`.
  - Galeri semua kartu bernomor, urut nomor, dengan pencarian (nama, departemen, karakter) dan
    saringan per karakter. Kartu digambar di browser saat mendekati layar, jadi gambar tidak
    disimpan ke R2.
  - Ketuk kartu untuk membuka profil rekan (`/wam/rekan/<id>`): kartu, karakter, dan **hanya**
    jawaban bertanda `rekan` dari bagian yang tidak anonim dan tidak disembunyikan. Jawaban `fasil`,
    `hr`, `hronly`, `pilih`, dan anonim tidak pernah dikirim ke halaman ini.
  - **Terbuka setelah kartu sendiri keluar** (pilihan bawaan saat dibangun; panitia, BOD, dan admin
    selalu bisa). Sebelum itu peserta melihat ajakan menyelesaikan kuesioner. Mockup menyebut galeri
    muncul "setelah form ditutup"; yang dibangun langsung bertambah setiap ada yang selesai.
  - Kartu uji dan karyawan nonaktif tidak tampil. Jalan masuk: baris "Kartu rekan" di Beranda dan
    tautan di layar akhir kuesioner.
  - Admin melihat sebaran level di tab Kartu.

## Rekap dan Ekspor (tahap 3, dibangun)

Dua tab baru di Admin WAM → Kuesioner, untuk semua admin. Aturannya ada di
`src/lib/pra-wam/recap.ts` dan ditegakkan di server: jawaban yang tidak boleh dibaca tidak diambil
dari database sama sekali.

- **Rekap** (`/admin/wam/kuesioner/rekap`): setiap pertanyaan sebagai grafik batang (pilihan,
  departemen, rekan yang dipilih: 10 teratas), tabel matriks (angka dan persen per baris), atau
  kutipan (jawaban sama dikelompokkan dengan "×N", urutan acak tetap, bukan urutan masuk). Tidak
  pernah ada nama penjawab. Bisa dipilah per departemen.
  - `rekan`, `fasil`, `pilih`: tampil lengkap.
  - `hr`: tanpa Data HR dibuka hanya jumlah pilihan (pilih satu/beberapa, matriks, departemen,
    persetujuan); isian dan rekan yang dipilih (misalnya teman sekamar) baru tampil setelah Data
    HR dibuka.
  - `hronly`: hanya setelah Data HR dibuka.
  - Bagian anonim: hanya untuk semua departemen (jawabannya tidak punya nama atau departemen), dan
    baru tampil mulai 5 jawaban per pertanyaan.
  - Dalam tampilan per departemen, jumlah pilihan `hr` (tanpa Data HR) juga baru tampil mulai 5.
  - Membuka Rekap tidak dicatat di log Data HR (log itu per orang); hanya ekspor yang dicatat.
- **Ekspor** (`/admin/wam/kuesioner/ekspor`): satu file Excel, lembar "Info" lalu satu lembar per
  bagian, atau satu bagian saja. Satu baris per orang (nama, departemen, satu kolom per pertanyaan).
  - Kolom `hr` dan `hronly` hanya ikut bila Data HR dibuka; ekspor seperti itu dicatat sebagai
    `ekspor` atas nama orang yang membuka Data HR **sebelum** file dikirim. Gagal dicatat, file
    tidak dikirim.
  - `pilih` mengikuti pertanyaan 30: "Dibagikan dengan namaku" dan "Hanya dibaca fasilitator"
    tetap bernama (admin termasuk fasilitator); "Dibagikan tanpa nama", atau belum memilih, pindah
    ke lembar "… tanpa nama" tanpa nama dan urutannya diacak.
  - Bagian anonim: satu baris per jawaban (pertanyaan, jawaban), tanpa orang dan tanggal, urutan
    diacak, dan baru diekspor setelah ada 5 kiriman.
  - Semua sel teks biasa (bukan rumus), jadi jawaban yang diawali "=" tetap teks.
- **BOD** nanti memakai aturan yang sama dengan `facilitator: false`: jawaban `pilih` yang
  memilih "Hanya dibaca fasilitator" tidak ikut, dan `hronly` tidak pernah tampil.

## Kamar (tahap 3, dibangun)

Pairing kamar WAM di Admin WAM → Kuesioner → **Kamar** 🔒 (`/admin/wam/kuesioner/kamar`), mengikuti
papan Penpot "21 · K3 · Pairing kamar (WAM)". Terkunci seperti Data HR: tanpa Data HR dibuka, halaman
tidak memuat nama atau jawaban apa pun. Migrasi `202611050001_wam_stay_rooms.sql` (tabel
`cq_stay_rooms`, `cq_stay_members`, kolom `cq_forms.rooms_published_at`). Aturan di
`src/lib/pra-wam/stay.ts`.

- **Daftar kamar** diisi HR, satu per baris: "208, Twin bed, 2"; rentang boleh ("301-310, Triple, 3").
  Kapasitas per kamar 1–8, dan database menolak kamar melebihi kapasitas.
- **Usulkan otomatis** mengisi kasur kosong tanpa memindah yang sudah ditempatkan:
  - wajib: isian "Untuk pembagian kamar" (33) sama, dan perokok tidak sekamar dengan yang keberatan (11);
  - skor: rekan yang dipilih (13, dua arah lebih tinggi), jam tidur dan bangun (7, 8), AC (10),
    preferensi departemen (12), kebiasaan tidur yang bentrok (9);
  - orang yang belum mengisi bagian menginap tidak diusulkan.
- **Atur manual**: pindah, masukkan, atau keluarkan orang. Beda isian 33 dan kamar penuh ditolak;
  bentrok lain (misalnya rokok) boleh tetapi tampil merah di kartu kamar. Setiap kamar punya tanda
  "Sudah ditinjau" yang hilang sendiri bila penghuninya berubah. Yang menempatkan dicatat
  (`placed_by`, orang yang membuka Data HR; kosong untuk usulan otomatis).
- **Terbitkan ke peserta**: setelah terbit, Beranda WAM peserta menampilkan "Kamar 208 · Twin bed ·
  Bersama <nama> (<departemen>)". Hanya nama dan departemen teman sekamar, tanpa jawaban siapa pun.
  Bisa ditarik kembali; perubahan setelah terbit langsung terlihat.
- Belum: tampilan "hasil pairing" untuk panitia kamar (tanpa Data HR), dan ekspor daftar kamar.

## Kebutuhan peserta (tahap 3, dibangun)

Kelola acara → **Kebutuhan peserta** (`/wam/manage/kebutuhan`), untuk Panitia dan Admin WAM (bukan
BOD). Satu kartu per pertanyaan, aturannya di `src/lib/pra-wam/needs.ts`:

| Pertanyaan | Yang dilihat panitia |
|---|---|
| Makanan (14), alergi (14c), fobia (14b) | Sejak 11 Nov 2026 `hr` lagi (keputusan pemilik, mengikuti daftar pertanyaan): pilihan makanan hanya jumlah per pilihan, isian alergi dan fobia hanya jumlah yang mengisi |
| Kebutuhan khusus (14d, `fasil`) | Dengan nama, untuk menyusun kegiatan dan memilih ruang |
| Ibadah (15, `hr`) | Hanya jumlah yang mengisi; isinya diminta ke HR |
| Kesiapan fisik (35), hal tidak nyaman (36) | Dengan nama (memang `fasil`) |
| Ukuran kaos (38, `hr`) | Jumlah per ukuran, tanpa nama |
| Kesehatan (16), nomor HP (5) | Tidak tampil; catatan bahwa HR menghubungi panitia bila perlu |

Pilihan "Tidak ada" hanya berupa angka.

## Hasil survei untuk BOD (tahap 3, dibangun)

Kelola acara → **Survei** (`/wam/manage/surveys`, papan Penpot "B4 · Hasil survei"), untuk BOD,
Panitia, dan Admin WAM. Memakai aturan Rekap dengan pembaca `{ hrOpen: false, facilitator }`:

- Partisipasi: selesai dari karyawan aktif ("40 dari 57 · 70%"), juga di kartu Survei Ringkasan BOD.
- Saringan bagian dan departemen. Grafik, tabel matriks, dan kutipan tanpa nama; kutipan yang sama
  dikelompokkan ("· 6 orang"), tiga teratas lalu "Lihat semua".
- Pertanyaan `hronly`, isian `hr`, dan rekan yang dipilih di pertanyaan `hr` tidak tampil sama
  sekali. Pilihan `hr` (misalnya ukuran kaos) tampil sebagai jumlah; per departemen mulai 5 jawaban.
- BOD bukan fasilitator: jawaban `pilih` dari orang yang memilih "Hanya dibaca fasilitator" tidak
  ikut dihitung. Panitia dan admin tetap melihatnya (tanpa nama).
- Bagian anonim hanya untuk semua departemen, mulai 5 jawaban.

## Privasi dan penyimpanan

- **Persetujuan (pertanyaan 6)** wajib sebelum mulai, dan waktu persetujuannya disimpan.
- **Rancangan tabel** (nama sementara, semua RLS, hanya service role):
  - `cq_forms`: nama, alamat, alamat lama, tenggat, status;
  - `cq_sections`, `cq_questions`: isi yang diubah HR, dengan kunci pertanyaan tetap;
  - `cq_answers`: satu baris per orang per pertanyaan, berisi nilai, waktu, dan versi;
  - `cq_anon_answers`: jawaban bagian anonim **tanpa kolom orang**. Waktunya dibulatkan ke hari,
    supaya tidak bisa dicocokkan dengan jam kirim;
  - `cq_anon_receipts`: hanya tanda "orang ini sudah mengirim bagian anonim", tanpa isi, supaya
    tidak dikirim dua kali;
  - `cq_cards`: katalog karakter dan gambarnya;
  - `cq_card_rules`: aturan skor karakter;
  - `cq_tiers`: level, peluang, dan batas jumlah;
  - `cq_person_cards`: kartu tiap orang: karakter, level, detail, nomor, DNA (unik), kunci
    gambar, dan catatan undian;
  - `cq_hr_access_log`: log buka kunci HR dan buka data per orang;
  - daftar akses Data HR (`cq_forms.hr_access`, id karyawan) dan siapa pelaku tiap baris log
    (`cq_hr_access_log.actor_employee_id`), migrasi 202611040012. Kolom hash password HR lama
    dibiarkan di database tetapi tidak dipakai lagi.
- **Ambang rangkuman anonim.** Rekap anonim baru tampil bila ada minimal 5 jawaban per kelompok,
  supaya departemen kecil tidak bisa ditebak.
- **Penghapusan otomatis** (tahap 4, dibangun; keputusan pemilik 5 Nov 2026). Pada "Tanggal hapus
  data menginap" (Pengaturan), mulai 00.00 WIB, yang dihapus permanen: jawaban menginap (33, 7–13,
  38), kesehatan (16), alergi dan fobia (14b, 14c), kebutuhan khusus (14d), kontak darurat (5b), dan pairing kamar (penghuni; daftar kamar hotel
  tetap, dan kamar ditarik dari Beranda). Tidak memakai cron: penghapusan berjalan saat Admin WAM
  dibuka pada atau setelah tanggal itu, dan ada tombol "Hapus sekarang" di Pengaturan. Sejak tanggal
  itu pertanyaan-pertanyaan tersebut juga hilang dari form dan dari hitungan progres, jadi yang sudah
  selesai tetap selesai. Pengaturan menampilkan jadwal, jumlah yang masih tersimpan, atau "Sudah
  dihapus". Waktu dan pelaku penghapusan tidak dicatat terpisah.
- **Pengingat** (tahap 4, dibangun): Progres → "Ingatkan yang belum", notifikasi WAM untuk semua yang
  belum selesai, atau hanya "Belum mulai" / "Sedang mengisi" sesuai saringan. Hanya selama kuesioner
  dibuka dan belum lewat tenggat, paling sering sekali per jam; Progres menampilkan kapan terakhir
  dikirim dan ke berapa orang.

## Tahapan build

1. **Tahap 1, isi dan kelola.**
   - Konten (termasuk nama dan alamat) dan Pengaturan di Admin WAM;
   - akses Data HR per orang dan kuncinya;
   - halaman kuesioner dengan simpan otomatis dan percabangan;
   - kartu di Beranda;
   - Progres di admin.
2. **Tahap 2, kartu karakter.** Katalog karakter dan aturannya di admin, level dan peluangnya,
   pindahkan aset ke R2, karakter dari jawaban dan undian level di server, buka kartu, simpan
   kartu/wallpaper, dan **pakai sebagai foto profil**.
3. **Tahap 3, pakai datanya.** Data HR 🔒, galeri kartu, rekap dan ekspor, profil rekan (data `rekan`), pairing
   kamar, kebutuhan makanan dan kesehatan untuk panitia, ringkasan untuk BOD.
4. **Tahap 4, rapikan.** Penghapusan otomatis, pengingat yang belum mengisi.

## Keputusan pemilik (4 November 2026)

1. **Data HR dibuka dengan email WAM masing-masing**, bukan password bersama, supaya log
   menunjukkan siapa yang membuka. Yang boleh hanya orang di daftar akses (saat ini 3 orang HR dan
   HRGA), yang diatur super admin. Awalnya direncanakan email + password WAM; pemilik lalu
   memutuskan email saja, dengan konsekuensi yang tercatat di bagian "Akses Data HR".
2. **Kartu karakter seperti NFT, tanpa blockchain**: kartu koleksi bernomor dan unik di dalam
   aplikasi. Karakter dari jawaban dan kepribadian; level (Common sampai Legendary) dan detail
   tampilan diundi di server sekali lalu dikunci. Katalog karakter akan bertambah dan dikelola di
   admin.
3. **Wajib dengan pengingat.** Kartu kuesioner di Beranda tidak bisa ditutup sampai selesai, dan HR
   bisa mengirim pengingat ke yang belum.
4. **Gambar karakter milik Werkudara** dan boleh dipakai di aplikasi; dipindahkan ke R2.
5. **Nama kuesioner fleksibel** dan menjadi alamatnya. Bawaannya "Kuesioner" (`/wam/kuesioner`).
6. **Tenggat** diatur HR sendiri di Pengaturan, tidak ditanam di kode.
