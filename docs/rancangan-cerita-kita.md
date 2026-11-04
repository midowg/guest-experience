# Rancangan kuesioner personal WAM

Status: rancangan, belum diimplementasikan. Ditulis 4 November 2026, diperbarui hari yang sama.

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
| **Pengaturan** | Dibuka/ditutup, tenggat ubah jawaban, tanggal hapus data menginap, teks kartu Beranda, password HR. |
| **Progres** | Siapa sudah dan belum, per departemen. Tombol "Ingatkan yang belum" lewat notifikasi WAM. |
| **Data HR** 🔒 | Jawaban per orang untuk data `hr` dan `hronly`. Hanya terbuka dengan password HR. |
| **Rekap** | Grafik per pertanyaan dan kutipan jawaban terbuka, mengikuti level baca. Bagian anonim hanya rangkuman. |
| **Kamar** (tahap 3) 🔒 | Pairing kamar dari jawaban bagian menginap (papan Penpot "K3 · Pairing kamar"). |
| **Ekspor** | Excel per bagian, sesuai hak pembaca. Data HR hanya setelah password HR. |

Supaya data tidak rusak:
- Mengubah pertanyaan setelah ada jawaban tidak mengubah jawaban lama.
- Setiap pertanyaan punya kunci tetap. Mengganti teks tidak memutus jawaban; menghapus pertanyaan
  hanya menyembunyikannya.
- Daftar departemen (pertanyaan 2) diambil dari unit di Data karyawan, bukan isian manual.
- Pertanyaan "pilih rekan" (13 dan 23) memakai daftar karyawan dengan pencarian, bukan isian bebas,
  supaya bisa langsung dipakai untuk pairing.

## Password khusus HR

Data yang paling pribadi tidak cukup dilindungi password admin biasa, karena banyak orang yang tahu
password admin. Jadi:

- **Ada password HR terpisah.**
  - Disimpan di server sebagai hash, tidak pernah dalam bentuk asli, tidak di repo, tidak di
    dokumen.
  - HR mengaturnya di Pengaturan. Mengganti password butuh password HR yang lama; kalau lupa,
    super admin bisa mengatur ulang.
- **Yang dikunci:**
  - semua jawaban per orang dengan level `hr` dan `hronly` (kesehatan, data menginap, kontak);
  - pairing kamar;
  - ekspor data HR.
- **Cara buka.**
  - Admin yang sudah login masuk ke halaman 🔒, lalu diminta password HR.
  - Kalau benar, kunci terbuka **30 menit** di perangkat itu saja (cookie terpisah yang
    ditandatangani), lalu otomatis terkunci lagi. Ada tombol "Kunci sekarang".
- **Dijaga di server.** Setiap API data HR memeriksa sesi admin **dan** kunci HR. Tanpa keduanya,
  data tidak dikirim sama sekali; jadi ini bukan sekadar tampilan yang disembunyikan.
- **Batas percobaan.** Salah password beberapa kali dikunci sementara.
- **Log akses.** Setiap buka kunci, gagal buka, dan buka data per orang dicatat: waktu, IP,
  perangkat, dan data siapa yang dibuka. Log bisa dilihat dari halaman Data HR.
- **Anonim tetap anonim.** Password HR pun tidak membuka jawaban anonim per orang, karena memang
  tidak disimpan dengan nama.

## Level baca per pertanyaan

Kode di mockup dipetakan ke peran yang sudah ada:

| Kode | Arti di mockup | Yang bisa membaca di WAM |
|---|---|---|
| `rekan` | Terlihat rekan | Semua peserta, di profil orang itu |
| `fasil` | Fasilitator | Panitia dan admin (rekap dan per orang) |
| `hr` | HR | Admin + password HR. Panitia kamar hanya melihat hasil pairing, bukan jawaban per orang |
| `hronly` | Hanya HR | Admin + password HR saja; tidak tampil ke panitia atau BOD |
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
- 34 aset dari mockup (8 karakter, 8 latar, 6 aksen, 12 stiker) dipindahkan dari artifact ke R2,
  dari teks base64 menjadi berkas WebP, sebagai isi awal katalog.
- Kartu disusun di browser seperti mockup. Hasil akhirnya disimpan ke R2, supaya profil, galeri,
  dan admin tidak menyusun ulang.
- **Jadi foto profil.** Potongan persegi dari karakter diperkecil ke 320×320 WebP dan disimpan
  lewat jalur foto profil yang sudah ada (`pra-wam/foto/…`). Pemakaiannya opsional dan bisa
  diganti foto biasa kapan saja.
- **Galeri** (tahap 3): peserta bisa melihat koleksi kartu rekan-rekannya, seperti galeri di mockup.
  Admin melihat sebaran level.

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
  - hash password HR disimpan di pengaturan, hanya hash.
- **Ambang rangkuman anonim.** Rekap anonim baru tampil bila ada minimal 5 jawaban per kelompok,
  supaya departemen kecil tidak bisa ditebak.
- **Penghapusan otomatis** data menginap dan kesehatan pada tanggal yang diatur. Admin melihat
  jadwal penghapusannya.

## Tahapan build

1. **Tahap 1, isi dan kelola.**
   - Konten (termasuk nama dan alamat) dan Pengaturan di Admin WAM;
   - password HR dan kuncinya;
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

1. **Data HR dikunci password khusus HR**, terpisah dari password admin. Hanya HR dan yang diberi
   tahu yang bisa membuka; aksesnya dicatat.
2. **Kartu karakter seperti NFT, tanpa blockchain**: kartu koleksi bernomor dan unik di dalam
   aplikasi. Karakter dari jawaban dan kepribadian; level (Common sampai Legendary) dan detail
   tampilan diundi di server sekali lalu dikunci. Katalog karakter akan bertambah dan dikelola di
   admin.
3. **Wajib dengan pengingat.** Kartu kuesioner di Beranda tidak bisa ditutup sampai selesai, dan HR
   bisa mengirim pengingat ke yang belum.
4. **Gambar karakter milik Werkudara** dan boleh dipakai di aplikasi; dipindahkan ke R2.
5. **Nama kuesioner fleksibel** dan menjadi alamatnya. Bawaannya "Kuesioner" (`/wam/kuesioner`).
6. **Tenggat** diatur HR sendiri di Pengaturan, tidak ditanam di kode.
