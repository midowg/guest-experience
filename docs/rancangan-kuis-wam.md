# Rancangan: Kuis live WAM

Versi 2, 19 Nov 2026; §8a diperbarui 20 Nov 2026 sesuai yang dibangun. Game pilihan ganda yang dimainkan bersama saat sesi WAM.
- **Soal:** tampil di layar besar (web khusus) dan di HP.
- **Jawaban:** dipilih di aplikasi WAM.
- **Pemain:** anonim, memakai tokoh WAM masing-masing tanpa nama.
- **Tujuan:** pemecah suasana (ice breaking) yang kompetitif dan bikin senang.

Di aplikasi WAM, kuis ini satu **modul Main WAM** (`kuis`) yang dinyalakan dari Admin WAM (lihat §8a dan `docs/main-wam/KONTRAK.md` §13).

## Keputusan pemilik

| Tanggal | Keputusan |
| --- | --- |
| 19 Nov | Nilai dari kecepatan: makin cepat makin besar, dan menjawab menjelang waktu habis tetap dapat nilai standar. Salah dikurangi, tidak menjawab 0. |
| 19 Nov | Soal urut dari mudah sampai sangat sulit. Bersaing individu. Soal tampil di layar besar dan HP. |
| 19 Nov | Anonim: tidak ada nama, hanya tokoh WAM. Ada animasi yang terasa memuaskan saat benar dan mengecewakan saat salah. Juara mendapat hadiah. |
| 19 Nov | Garis waktu yang terus mundur, dengan **nilai saat ini** yang ikut turun. Nilai yang tertera saat menjawab adalah nilai yang didapat bila jawabannya benar. |
| 19 Nov | Juara dibuka namanya di podium (buka topeng). Pemain lain tetap anonim. |
| 19 Nov | Jawaban dibuka bersama saat waktu habis, dengan persen tiap pilihan tanpa nama (§4a). |

## 1. Referensi

| Game | Cara menilai | Yang diambil untuk WAM |
| --- | --- | --- |
| Kahoot | Benar: 1000 × (1 − (waktu jawab ÷ waktu soal) ÷ 2), jadi minimal 500. Jawab < 0,5 detik dapat penuh. Salah 0. Beruntun (streak) tidak menambah poin. | Nilai turun rata dengan batas bawah. Streak hanya tampilan. |
| Mentimeter | Benar 1000 sampai 500 tergantung kecepatan, atau tetap 1000. Salah dan kosong 0. | Rentang atas dan bawah yang jelas. |
| AhaSlides | Nilai dasar + bonus cepat. Bonus penuh untuk yang tercepat, turun rata sampai waktu habis. | Pola "dasar + bonus" (sama dengan keinginan pemilik). |
| Wayground (Quizizz) | Benar dan cepat dapat poin, ada power-up. | Power-up tidak dipakai, supaya sederhana dan adil. |
| Riset "game juice" | Umpan balik meriah yang terkait keberhasilan menambah rasa senang. Umpan balik berlebihan membuat pemain merasa kurang mampu. Gambar, suara, dan getar dirancang bersama. | Benar dirayakan besar. Salah singkat dan tidak mempermalukan. Getar di HP, suara di layar besar. |

Catatan: rumus Kahoot dari halaman bantuannya. Mentimeter dan AhaSlides tidak menerbitkan rumus persis; yang tertulis di atas adalah perilakunya menurut dokumentasi.

## 2. Perhitungan nilai

### Rumus
Skala pemilik (benar 3, salah −1) dikali 100.

```
sisa   = waktu soal − waktu jawab          (detik; 0 bila habis)
benar  = 300 + round(200 × sisa / waktu soal)   → 500 saat soal dibuka, 300 tepat sebelum habis
salah  = −100
kosong = 0
```

- **Nilai saat ini di HP** = rumus `benar` yang dihitung terus. Angkanya turun rata dari 500 ke 300 bersama garis waktu.
- **Saat peserta mengetuk pilihan,** angka itu dikunci dan ditampilkan ("Terkunci · 437"). Kalau jawabannya benar, itu persis nilai yang ia dapat.
- **Jawab < 0,5 detik** tidak diberi nilai penuh khusus (beda dengan Kahoot). Nilainya tetap dari rumus, jadi tidak ada lompatan.

### Contoh (soal Sedang, 20 detik)

| Ketuk di detik | Nilai saat itu | Benar | Salah | Tidak menjawab |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 490 | +490 | −100 | |
| 5 | 450 | +450 | −100 | |
| 10 | 400 | +400 | −100 | |
| 19 | 310 | +310 | −100 | |
| 20 (habis) | — | — | — | 0 |

### Pemeriksaan supaya tidak salah hitung

1. **Jam.**
   - HP menyamakan jamnya dengan server saat kuis dibuka (selisih jam disimpan, seperti layar TV kantor).
   - Garis waktu dan nilai di semua HP dihitung dari jam soal dibuka di server, jadi semua HP turun bersamaan.
2. **Nilai di layar = nilai yang didapat.**
   - HP mengirim waktu ketukannya.
   - Server menerima waktu itu bila tidak lebih awal dari soal dibuka, dan tidak lebih dari 1,5 detik sebelum jawaban sampai di server (jeda wajar wifi). Di luar itu, server memakai jam terima dikurangi 1,5 detik.
   - Dengan begitu, angka yang terkunci di HP tidak berubah, tetapi waktu tidak bisa diakali.
3. **Batas.**
   - Jawaban yang diketuk sebelum waktu habis tetap diterima bila sampai paling lambat 2 detik setelah habis.
   - Satu jawaban per orang per soal (kunci unik di database). Jawaban kedua ditolak.
4. **Pembulatan:** bilangan bulat, dibulatkan biasa. Semua skor tersimpan per jawaban, dan total = jumlahnya. Total tidak disimpan terpisah, jadi tidak bisa selisih.
5. **Skor sama:** urutan ditentukan total waktu jawaban benar (lebih kecil di atas), lalu jawaban benar terakhir yang lebih awal.
6. **Menebak asal:**
   - Peluang benar 1 dari 4. Rata-rata nilai benar ±400, jadi menebak memberi rata-rata 0,25 × 400 − 0,75 × 100 = **+25**. Menebak masih sedikit untung, sehingga orang berani menjawab, dan ini cocok untuk pemecah suasana.
   - Kalau ingin menebak tidak menguntungkan, nilai salah dijadikan −150. Rata-rata tebakan jadi 0,25 × 400 − 0,75 × 150 = −12,5. Hasilnya tepat 0 bila tebakan dilakukan cepat, saat nilai benarnya ±450.
7. **Level soal** hanya mengatur urutan dan lama waktu (Mudah 15 detik, Sedang 20, Sulit 30, Sangat sulit 40). Rentang nilai sama, 300–500. Soal sulit memberi waktu lebih lama, jadi tidak ada yang dirugikan karena harus berpikir.
8. **Jeda:** server menyimpan total lama jeda per soal. Waktu jawab = jam ketuk − jam soal dibuka − total jeda sebelum ketukan. Selama jeda, pilihan tidak bisa diketuk.
9. **Uji otomatis wajib:** rumus di titik 0, ½, dan akhir waktu; batas 1,5 detik dan 2 detik; jawaban ganda; urutan skor sama; total = jumlah jawaban.

## 3. Anonim dengan tokoh WAM

- **Identitas pemain** = kartu tokoh dari kuesioner (Cerita Kita). Tiap tokoh hanya dimiliki satu orang ("1 dari 1", 100 tokoh), jadi tidak ada yang kembar di papan skor.
  - Gambar tokoh, nama tokoh (mis. "Marie Curie"), dan warna personanya.
  - Nama asli tidak pernah tampil di layar besar maupun di HP orang lain. Satu-satunya pengecualian adalah juara di podium akhir (§6).
- **Belum punya kartu** (tidak mengisi kuesioner, atau kuota tokoh habis): "Tokoh misterius #07" dengan siluet. Nomornya tetap selama kuis.
- **Batas anonim:** orang yang pernah memamerkan kartunya bisa dikenali dari tokohnya. Ini diterima karena yang disembunyikan adalah nama, bukan tokoh.
- **Penyimpanan:** server tetap menyimpan siapa menjawab apa (untuk mencegah jawaban ganda dan memberi hadiah). Hasil lengkap hanya bisa dilihat panitia di Admin WAM.

## 4. Rasa: kapan senang, kapan kecewa

Prinsip:
- Benar dirayakan besar.
- Salah singkat (≤ 1,5 detik), lalu langsung diarahkan ke soal berikutnya.
- Tidak ada yang dipermalukan, karena semua anonim.
- Suara diputar di layar besar (speaker venue). HP biasanya senyap, jadi HP memakai getar dan gerak.

| Momen | Layar besar | HP peserta |
| --- | --- | --- |
| Lobi | Tokoh yang bergabung "melompat" masuk satu per satu, angka peserta naik, musik lobi. | Tokohmu tampil besar: "Kamu ikut sebagai Marie Curie". |
| Pergantian level | Kartu level membalik: Mudah → Sedang → Sulit → Sangat sulit. Musik makin tegang. | Lencana level yang sama. |
| Soal berjalan | Garis waktu menyusut, jumlah yang sudah menjawab naik. 5 detik terakhir: garis memerah dan bunyi detak. | Garis waktu + **nilai saat ini** besar yang terus turun. 5 detik terakhir: getar halus tiap detik. |
| Mengetuk | — | Tombol ditekan masuk, pilihan lain meredup, chip "Terkunci · 437". **Belum ada tanda benar atau salah.** |
| Menunggu | "87 dari 112 sudah menjawab". Sebaran pilihan **tidak** ditampilkan selama soal berjalan. | "Terkunci · 437 · Jawaban dibuka saat waktu habis", dengan tokohmu bernapas pelan. |
| Waktu habis | "Waktu habis!" dan bunyi drum (2 detik, sekaligus menampung jawaban yang telat sampai). | Sama, serempak. |
| Buka sebaran | Batang persen A–D tumbuh bersamaan. Jawaban benar **belum** ditandai (±1,5 detik ketegangan). | Persen yang sama di tiap pilihan. Pilihanmu ditandai "Pilihanmu". |
| **Buka jawaban: benar** | Pilihan benar menyala, ditambah keterangan sebaran (§4a). | Ledakan hijau dan konfeti dari tombol. Angka +437 menghitung naik. Getar sukses. "Naik 5 peringkat". |
| **Buka jawaban: salah** | Sama. | Kartu bergetar sekali, warna meredup, "−100", dan pilihan benar ikut menyala. Kalimat penyemangat singkat ("Masih ada 12 soal"). |
| Tidak menjawab | — | Abu-abu netral, "Tidak menjawab · 0". |
| Beruntun | — | Lencana "3 benar beruntun" (tanpa poin tambahan, seperti Kahoot). |
| Papan skor | 5 besar dengan batang yang bertukar posisi (animasi naik/turun). | Peringkatmu + "12 poin lagi ke #4" (hampir menang memicu semangat). |
| Akhir | Podium dibuka dari #3, #2, lalu #1, dengan drum dan konfeti. | Peringkat akhir dan skor. Juara: layar emas "Kamu juara 1". |

## 4a. Jawaban dibuka bersama saat waktu habis

Keputusan pemilik 19 Nov:
- Jawaban baru dibuka saat waktu habis, supaya ada momen bersama: mengecek, kecewa, dan senang bersama-sama, bahkan saling meledek.
- Sebaran tampil dalam persen tanpa memperlihatkan siapa memilih apa.

Aturannya:
1. **Selama soal berjalan, tidak ada yang tahu benar atau salah.**
   - HP hanya mengunci pilihan dan nilainya.
   - Layar besar hanya menampilkan jumlah yang sudah menjawab, bukan sebaran. Supaya yang terlambat tidak ikut-ikutan mayoritas.
2. **Tidak ada penutupan lebih awal.**
   - Soal selalu berjalan sampai waktunya habis, walaupun semua sudah menjawab. Jeda inilah yang membangun ketegangan.
   - Pengecualian satu-satunya: MC bisa **membatalkan soal** yang ternyata keliru. Soal itu tidak dinilai.
3. **Serempak.**
   - Server menetapkan jam buka (= jam soal dibuka + waktu soal + 2 detik).
   - Semua HP dan layar besar memainkan animasi buka di jam yang sama, berdasarkan jam yang sudah disamakan. Jadi satu ruangan bereaksi bersamaan.
4. **Urutan buka (±4 detik):**
   - "Waktu habis!" (2 detik);
   - batang persen tumbuh tanpa tanda benar (1,5 detik);
   - jawaban benar menyala, dan setiap HP menampilkan hasilnya sendiri.
5. **Persen tanpa nama.**
   - Tiap pilihan menampilkan persen dan jumlah orang ("B · 64% · 72 orang").
   - Tidak ada nama atau tokoh per pilihan.
   - Persen dihitung dari yang menjawab; yang tidak menjawab ditulis terpisah ("9 tidak menjawab").
6. **Keterangan pemancing reaksi** (dipilih otomatis dari sebaran, tampil di layar besar):
   - benar ≤ 15%: "Hanya 9% yang benar!";
   - mayoritas memilih jawaban salah: "64% tertipu pilihan B";
   - benar ≥ 90%: "Hampir semua benar!";
   - semua benar: "Semua benar!" (konfeti di layar besar);
   - tercepat: "Tercepat: Marie Curie · 1,2 detik". Tokoh boleh tampil karena tetap anonim; nama asli tidak.
7. **Kunci jawaban** baru dikirim ke HP pada jam buka. Kunci tidak pernah ada di HP sebelum itu, termasuk di data yang tersembunyi.

- **Aksesibilitas:** pilihan A–D dibedakan dengan warna **dan** bentuk. Mengikuti pengaturan "kurangi gerak". Tidak ada kilatan.
- **Catatan perangkat:** getar tidak jalan di iPhone lewat web (Safari). Di versi aplikasi (Capacitor) bisa memakai getar native.

## 5. Supaya berhasil sebagai pemecah suasana

1. **Pembuka mudah dan lucu.** 3 soal pertama hampir pasti benar (tentang kantor, WAM, kebiasaan tim), supaya semua merasakan "benar" lebih dulu.
2. **Pendek.** 15–20 soal, ±15 menit termasuk papan skor.
3. **Soal yang memancing tawa,** misalnya tebak kebiasaan kantor dan angka-angka lucu tentang Werkudara. Sebaran jawaban di layar besar jadi bahan obrolan MC.
4. **Papan skor tiap 3–4 soal,** bukan tiap soal, supaya tempo tidak turun. Papan skor wajib sebelum babak Sangat sulit.
5. **Babak akhir menegangkan:** Sangat sulit dengan waktu 40 detik. Nilainya sama, tetapi urutan bisa berubah besar.
6. **MC memegang kontrol,** dan layar besar terlihat dari semua meja.
7. **Wifi venue diuji** saat technical meeting dengan ±120 HP.

## 6. Hadiah dan buka topeng juara

Keputusan pemilik 19 Nov: nama juara dibuka di podium.

1. Podium dibuka satu per satu dari #3, lalu #2, lalu #1.
2. Untuk tiap juara:
   - **tokohnya tampil lebih dulu**, dengan skor dan drum;
   - setelah jeda 2 detik, kartu **berputar seperti koin**: 5–7 putaran pada sumbu tegak, sisi tokoh dan sisi nama bergantian, makin lama makin pelan (±3,5 detik). Kartu berhenti di sisi nama asli (dengan foto profil bila ada), sedikit bergoyang lalu diam. Bunyi "tik" di tiap setengah putaran ikut melambat, lalu "ding" dan konfeti saat berhenti (keputusan pemilik 19 Nov). Dengan "kurangi gerak": cukup memudar.
3. MC yang menekan tombol buka untuk tiap juara, jadi tempo bisa disesuaikan dengan suasana ruangan.
4. **HP juara:** layar emas "Kamu juara 1 · Ke panggung untuk hadiah" muncul bersamaan dengan namanya dibuka.
5. **Pemain lain:** tetap anonim. Papan skor lengkap dengan nama hanya ada di Admin WAM (untuk panitia).
6. **Juara dibuka di HP siapa saja?** Nama juara hanya tampil di layar besar dan di HP juara itu sendiri, bukan di HP peserta lain. Supaya momen bersama terjadi di layar besar.

## 7. Layar

| Layar | Dipakai oleh | Isi |
| --- | --- | --- |
| Admin WAM → Kuis | panitia/admin (web) | Daftar kuis, editor soal (teks, gambar opsional, 4 pilihan, kunci, level), pratinjau, hasil akhir (unduh, untuk hadiah). |
| Kontrol kuis | MC/panitia (HP atau laptop) | Satu tombol besar **Lanjut** yang menyebut langkah berikutnya ("Lanjut: Papan skor"), pintasan Spasi. **Jeda** (P) bisa dipakai kapan saja: saat soal berjalan, garis waktu dan nilai membeku untuk semua, dan waktu jeda tidak dihitung. Setelah jawaban dibuka, alur berhenti menunggu MC supaya ruangan sempat bereaksi. Aksi sekunder: Batalkan soal, Papan skor sekarang. Jawaban dibuka otomatis saat waktu habis. |
| Layar besar | proyektor/LED (web, alamat berkode, tanpa login) | Lobi, pergantian level, soal + garis waktu, jawaban + sebaran, papan skor, podium. Tema WAM. |
| Kuis di aplikasi WAM | peserta | Kartu Beranda "Kuis dimulai · Ikut", layar soal dengan nilai saat ini, terkunci, hasil, papan skor pribadi, akhir. |

## 8. Teknis

- **Server pemegang aturan:**
  - status kuis (lobi / level / soal / waktu habis / jawaban / skor / selesai), soal aktif, jam soal dibuka, jam buka jawaban;
  - kunci jawaban dan sebaran baru dikirim ke HP pada jam buka jawaban;
  - animasi buka diputar serempak di jam itu.
- **Realtime:**
  - Perubahan status dikirim lewat Supabase Realtime Broadcast (dikirim server).
  - Klien hanya menerima tanda, lalu mengambil isi dari API.
  - Cadangan: polling setiap 2 detik.
- **Tabel (usulan awal, sebelum Main WAM ada):** `pw_quizzes` dan seterusnya. Yang dibangun: `mw_quiz_*`, lihat §8a.
- **Aset:** suara (lobi, detak, benar, salah, drum, juara) dengan lisensi bebas pakai atau dibuat sendiri; konfeti dengan canvas ringan.

## 8a. Yang dibangun (v1, 20 Nov 2026)

Prototipe acuan: `D:\projects\events\2027-01-werkudara-wam\aplikasi\prototipe-kuis\index.html` (revisi 2: tombol Lanjut, Jeda, koin juara).
Kuis live dibangun sebagai **modul Main WAM** (`docs/main-wam/KONTRAK.md` §13), bukan fitur Pra WAM.

**Modul dan akses.**
- Modul `kuis` di `mw_settings.modules`, bawaannya **mati**. Dinyalakan di Admin WAM → Main WAM → Pengaturan.
  Modul mati: halaman dan API 404, kartu Beranda tidak ada, layar besar "tidak ditemukan".
- **Pemain:** semua yang boleh melihat Main WAM (mode acara dan penguji seperti biasa), termasuk BOD.
- **Pengendali:** dipilih per kuis di Admin WAM (`mw_quiz_hosts`), ditambah pemegang peran Admin WAM.
  Peran panitia saja tidak cukup. Bagi orang lain halaman kendali 404.
- Gerbang: setiap halaman `requireModulePage("kuis", …)`, setiap API `requireModuleApi("kuis")` (tes `acara-pages`).

**Data** (migrasi `202611200601_main_wam_kuis.sql`, dijalankan pemilik di Supabase SQL Editor):

| Tabel | Isi |
| --- | --- |
| `mw_quizzes` | Judul, sha256 kunci layar besar dan 4 huruf terakhirnya. |
| `mw_quiz_hosts` | Pengendali per kuis. |
| `mw_quiz_questions` | Level 1–4, urutan di dalam level, teks, 4 pilihan, kunci. V1 tanpa gambar. |
| `mw_quiz_runs` | Satu permainan: soal yang **dibekukan** saat permainan dibuat, fase, soal aktif, jam mulai fase, jeda MC (`pauses`), soal dibatalkan, papan skor yang sudah tampil, juara yang sudah dibuka, nomor revisi. Paling banyak satu permainan belum selesai per kuis. |
| `mw_quiz_players` | Pemain + alias (tokoh kartu, atau "Tokoh misterius #NN" yang nomornya tetap selama permainan, lewat `mw_quiz_join`). |
| `mw_quiz_answers` | Satu baris per orang per soal (kunci utama): pilihan, waktu jawab tanpa jeda, benar/salah, poin (300–500 atau −100). |

Total tidak disimpan: `mw_quiz_board(permainan, sampai, sebelumnya)` menjumlah jawaban (soal dibatalkan tidak dihitung).
Migrasi yang sama menambah jenis notifikasi `kuis` di `mw_notes`.

**Kode.**
- Logika murni `src/lib/main-wam/kuis/` (tes vitest): `rules.ts` (rumus §2, jam permainan tanpa jeda, penerimaan
  jawaban 1,5 dan 2 detik, urutan skor dan seri, sebaran dan keterangan §4a), `flow.ts` (fase, label Lanjut, Jeda,
  Batalkan, Papan skor sekarang, podium), `snapshot.ts` (apa yang boleh keluar ke tiap layar), `clock.ts`, `admin.ts`.
- Server `src/lib/server/main-wam/kuis/`: `play.ts` (HP: keadaan, gabung, jawab), `control.ts` (MC), `screen.ts`
  (layar besar), `home.ts` (kartu Beranda), `admin.ts` (Admin WAM), `alias.ts` (tokoh dari kartu kuesioner), `store.ts`.
- API: `/api/wam/acara/kuis/{kuis}` (GET keadaan `?v=`, POST gabung), `/jawab`, `/kendali` (GET, POST aksi);
  `/api/kuis/{kunci}` (layar besar, publik); `/api/admin/wam/main/kuis/…`.
- Halaman: `/wam/acara/kuis/{kuis}` (main), `/wam/acara/kuis/{kuis}/kendali` (MC), `/kuis/{kunci}` (layar besar),
  Admin WAM → Main WAM → Modul acara → **Kuis live** (`/admin/wam/main/kuis`).
- Pratinjau tanpa login: `/dev-preview/main-wam/kuis?layar=hp-jalan|kendali-benar|layar-podium-putar|…` dan
  `/dev-preview/main-wam/kuis/admin?layar=daftar|kuis`.

**Alur dan waktu (semua pada jam server).**
- Admin membuat permainan (fase Siap). MC menekan **Lanjut: Buka lobi**: kartu Beranda "Kuis dimulai · Ikut" muncul
  dan notifikasi "Kuis dimulai" dikirim (jenis `kuis`, topik push `pengumuman` yang sudah ada; tanpa topik baru).
- "Mulai soal" menjadwalkan soal dibuka **3 detik** kemudian (3-2-1). Jawaban dibuka pada jam buka + waktu soal + 2 detik;
  batang sebaran 1,5 detik, lalu jawaban benar menyala. Jeda menggeser semua jam itu; waktu jeda tidak dihitung.
- Setiap layar menyamakan jam ke server (contoh dengan perjalanan bolak-balik terpendek, pola TV kantor) dan memutar
  animasi dari jam itu, jadi satu ruangan bereaksi bersamaan.
- **Kunci jawaban, sebaran, dan skor soal itu baru dikirim ke klien pada jam buka.** Sebelumnya HP hanya tahu pilihannya
  sendiri dan nilai yang terkunci. Total di HP baru bertambah saat jawaban benar menyala.
- Nama asli hanya di podium layar besar untuk tempat yang sudah dibuka MC, dan sebagai "Kamu juara n" di HP juara.
  Hasil lengkap dengan nama hanya di Admin WAM (bisa diunduh Excel).
- Layar besar: kunci acak `kuis_` + 32 byte, hanya sha256-nya disimpan, tautan tampil sekali di Admin WAM; noindex,
  no-referrer; hidup hanya saat modul menyala. Suara Web Audio diputar di layar besar setelah satu klik atau tombol.

**Pembaruan langsung.** Polling, bukan Realtime: 1,5 detik selama permainan, 4 detik saat Siap, 15 detik setelah
selesai, 10 detik saat tab tersembunyi, mundur bertahap bila jaringan gagal, ditambah satu permintaan tepat saat jawaban
dibuka (disebar 120–420 ms). HP mengirim versi yang dimilikinya; bila tidak berubah, server hanya menjawab jamnya.
Kueri per polling HP (di luar gerbang Main WAM yang 6 kueri): 1 bila tidak berubah (2 di lobi), sampai 4 saat jawaban
dibuka. Jadi ±7 kueri per polling HP, ±80 polling per detik untuk 120 HP. Supabase Realtime atau gerbang yang lebih murah
untuk polling ini baru dipertimbangkan bila uji beban menunjukkan perlu.

**Uji sebelum dipakai:**
- tes rumus, fase, potret keadaan, server (basis data tiruan), dan uji SQL `tests/backend/main-wam-kuis-check.sql` (sudah);
- satu permainan dengan beberapa akun uji di HP sungguhan (Mode demo mati atau rundown sudah terisi: selama rundown
  contoh dipakai, semua penyimpanan ditolak, juga Ikut dan jawaban);
- uji beban sekitar 120 pemain tiruan ke API;
- uji di wifi venue saat technical meeting.

## 8b. Penyesuaian penerapan prototipe final (21 Nov 2026)

- **Teks soal tidak ada di HP** (keputusan pemilik): soal dibaca di layar besar, HP menulis "Baca soal di layar besar".
  Teks pilihan A–D tetap tampil di HP. Server tidak mengirim teks soal ke HP sama sekali (`phoneQuestionView`, tes `snapshot.test.ts`);
  layar besar dan kendali MC tetap memuatnya.
- **Tautan ke agenda:** kuis bisa ditautkan ke item agenda "Kuis live" (Admin WAM → Kuis live → satu kuis → kartu **Agenda**,
  kolom `mw_quizzes.session_id`, migrasi `202611270001_main_wam_kuis_agenda.sql`). Selama permainan terbuka (lobi sampai podium),
  Detail sesi item itu menampilkan tombol **Ikut kuis**. Sebelum migrasi: tidak ada yang tertaut, Admin WAM menulis "menunggu pembaruan sistem".
- **Mode demo:** kuis contoh tiga soal (`src/lib/main-wam/kuis/demo.ts`) memutar dirinya sendiri berulang (lobi, tiga soal, papan skor,
  podium) menurut jam server, tanpa data tersimpan. Kartunya ada di Beranda bila tidak ada permainan sungguhan, dan item agenda berjudul
  mengandung "kuis" membuka kuis contoh itu. Mengetuk jawaban tidak disimpan (pesan Mode demo); tokoh saya menjawab benar otomatis.

## 9. Pertanyaan terbuka

1. Hadiah: apa hadiahnya, dan berapa juara yang dibuka (usulan 3)?
2. Nilai salah: −100 (menebak sedikit untung) atau −150 (menebak tidak untung)?
3. Jumlah soal per sesi (usulan 18: 5 mudah, 5 sedang, 5 sulit, 3 sangat sulit). Siapa yang menulis soal, dan temanya apa?
4. Satu sesi kuis atau beberapa? Kalau beberapa, skornya dijumlah?

## Sumber

- Kahoot, cara poin dihitung: https://support.kahoot.com/hc/articles/115002303908
- Kahoot, mode Confidence (streak): https://support.kahoot.com/hc/en-us/articles/32200674639261
- Mentimeter, kuis dengan skor cepat (panduan kampus): https://helpdesk.lsua.edu/support/solutions/articles/48001282294-create-a-quiz-within-mentimeter-slides
- AhaSlides, Pick Answer dan bonus cepat: https://docs2.ahaslides.com/slides/pick-answer
- Sendsteps, bonus beruntun: https://support.sendsteps.com/portal/en/kb/articles/how-are-the-scores-calculated-when-playing-a-quiz
- Wayground, power-up: https://help.wayground.com/support/solutions/articles/158000404941-power-ups-their-types
- Ringkasan riset game juice: https://psych.substack.com/p/the-juicy-factor-the-science-of-making
- Juicy haptic design (Univ. Waterloo): https://uwaterloo.ca/haptic-experience-lab/projects/juicy-haptic-design-vibrotactile-embellishments-can-improve
