# Rancangan kuesioner personal WAM

Status: tahap 1 dan 2 dibangun (4 November 2026). Tahap 3 sedang dibangun: **Kartu rekan** (galeri
dan profil rekan), **Rekap**, dan **Ekspor** sudah ada (5 November); kamar, kebutuhan panitia, dan
ringkasan BOD belum. Tahap 4 belum. Ditulis 4 November 2026, diperbarui 5 November 2026.

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
| **Pengaturan** | Dibuka/ditutup, tenggat ubah jawaban, tanggal hapus data menginap, teks kartu Beranda, Akses Data HR (siapa yang boleh membuka; diubah super admin). |
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
- Server yang menegakkan aturan ini di setiap API, bukan hanya tampilan.

## Data yang masuk ke akun WAM

| Data dari kuesioner | Dipakai di |
|---|---|
| Nama panggilan (1) | Usulan perubahan ke Data karyawan; HR yang menyetujui |
| Nomor HP aktif (5) | Kontak darurat panitia selama acara |
| Minat dan topik (17, 18), lagu (37), keahlian (E7), fakta unik (22, bila diizinkan) | Profil yang bisa dilihat rekan, ice breaking, playlist WAM |
| Peran di tim (34), kesiapan fisik (35), hal tidak nyaman (36) | Penyusunan kelompok dan keamanan kegiatan (panitia) |
| Makanan (14), alergi dan fobia (14b), ibadah (15), kesehatan (16) | Panitia konsumsi dan acara; kesehatan hanya HR |
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
- **Penghapusan otomatis** data menginap dan kesehatan pada tanggal yang diatur. Admin melihat
  jadwal penghapusannya.

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
