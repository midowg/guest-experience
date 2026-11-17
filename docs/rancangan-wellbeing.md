# Wellbeing di Journey

Program wellbeing kantor (karyawan mencatat aktivitas per dimensi dan mengumpulkan poin) dipindah dari aplikasi
lama (welbeing.netlify.app, Supabase terpisah) ke Journey. Dokumen ini ringkasan publik; catatan lengkap pemilik
(termasuk data lama) ada di luar repo.

Status 17 Nov 2026: admin dan aplikasi karyawan dibangun; **belum diumumkan**. Aplikasi lama tetap dipakai sampai
versi Journey stabil.

## Keputusan

- Dibangun di dalam Journey, seperti Booking Kantor: karyawan masuk dengan **akun WAM**; akses admin diberikan per
  orang di Super admin → Akses admin (aplikasi "Wellbeing").
- Versi pertama hanya fitur yang benar-benar dipakai di aplikasi lama (dilihat dari datanya): pencatatan, riwayat,
  peringkat, periksa oleh admin, dan tambah poin ke banyak orang. **Quest, streak bonus, penghargaan bulanan, dan
  rewards/koin ditunda** (tidak pernah dipakai). Hadiah diberikan ke juara peringkat di luar aplikasi.
- Pencatatan **langsung dihitung**; admin memeriksa belakangan (Oke / Ubah poin / Tolak, dengan alasan yang dibaca
  karyawan). Tanggal depan ditolak; mundur paling lama sesuai aturan (bawaan 7 hari).
- Katalog kegiatan mengikuti katalog yang sedang dipakai di aplikasi lama (nama, dimensi, poin), bisa diubah admin.
- Absensi acara lewat QR diganti **Tambah poin ke banyak orang** (cara yang sudah dipakai admin).

## Peta fitur lama

| Fitur lama | Jadi |
|---|---|
| Login sendiri, ganti password | Akun WAM |
| Catat harian, olahraga, langkah, form "downgrade" | Satu tombol **Catat** (harian / olahraga) |
| Riwayat aktivitas, notifikasi | Tab **Riwayat** (status dan alasan admin) |
| Leaderboard (Overall/Steps/Quests) | **Peringkat**: bulan ini / sepanjang waktu, per dimensi |
| Profil, kartu ID, dompet koin | **Profil** (data dari akun WAM, riwayat poin) |
| Strava | Dibangun ulang (lihat di bawah) |
| Quest, rewards, gacha, QR spot, pesan antar rekan, survei, Apple Health, city tour | Ditunda / dibuang |
| Admin 15 tab | 4 menu: **Hari ini, Periksa, Karyawan, Pengaturan** |

## Cara dibangun (standar rasa aplikasi mobile)

- Satu aplikasi klien per bagian: `/wellbeing/[[...]]` (karyawan) dan `/admin/wellbeing/[[...]]` (admin). Server
  hanya memeriksa sesi; pindah menu, filter, dan detail terjadi di browser tanpa muat ulang halaman.
- Data lewat `/api/wellbeing/*` dan `/api/admin/wellbeing/*`, disimpan di cache klien (tampil dulu, diperbarui di
  latar). Formulir dan detail di lembar/panel. Komponen bersama: `src/components/app-shell/`.
- Kontrak data karyawan: `src/lib/wellbeing/app-types.ts`; aturan: `src/lib/wellbeing/rules.ts`.
- Database: tabel `wb_*` (migrasi `202611160050_wellbeing.sql`), terhubung ke `employees`. Foto bukti baru di R2
  privat (`wellbeing/<karyawan>/…`), ditampilkan dengan tautan bertanda tangan.
- Pratinjau pengembangan tanpa login: `/dev-preview/wellbeing` (data contoh; tidak ada di produksi).

## Tampilan balapan (18 Nov 2026)

Aplikasi karyawan sifatnya kompetitif (juara bulanan dapat hadiah), jadi tampilannya mengikuti aplikasi olahraga
(Strava, Apple Fitness, Nike Run Club) tanpa meninggalkan aturan desain rumah (HIG + Material, kontras, target
sentuh, mode gelap).

- **Bulan = balapan.** Beranda dibuka dengan kartu balapan: peringkat bulan ini, sisa hari, dan **Kejar #n**
  (selisih poin ke orang tepat di atas, dengan bilah progres). Yang memimpin melihat selisih keunggulannya.
  Total sepanjang waktu tetap ada, lebih kecil.
- **Papan relatif.** "Di sekitarmu" (dua di atas, dua di bawah) di Beranda, karena papan besar membuat yang di
  bawah kehilangan semangat; orang dibandingkan dengan yang terjangkau. Di luar 30 besar, Peringkat tetap
  menampilkan baris di sekitarmu.
- **Medali** emas, perak, perunggu untuk tiga teratas (selalu dengan angka, tidak hanya warna), juara bulan lalu,
  streak dengan ajakan "catat hari ini supaya streak tidak putus", rekor pribadi di Profil, dan setelah mencatat:
  naik peringkat atau sisa poin untuk menyalip.
- **Visual:** permukaan balapan gelap ("ink") dengan satu aksen hijau-kuning ("volt"), angka papan skor Barlow
  Condensed, teks Plus Jakarta Sans. Warna utama lama (biru) bentrok dengan warna dimensi Finansial, jadi diganti.
- API: `GET /api/wellbeing/leaderboard` kini juga mengirim `near` (sekitarku) dan `ahead` (yang dikejar).

### Api streak (18 Nov 2026)

Seperti Duolingo: di Beranda (bawah grafik 7 hari) ada api di samping jumlah hari beruntun.

- **Menyala** (oranye, bergoyang pelan, dengan cahaya) bila hari ini sudah ada aktivitas yang dihitung:
  "Hari ini sudah tercatat. Lanjutkan besok."
- **Garis abu-abu saja** (seperti mati) bila hari ini belum: angka streak ikut abu-abu, "Belum tercatat hari ini."
  dan tombol Catat sekarang. Belum punya streak: "Catat hari ini untuk menyalakan api."
- Aktivitas pertama hari itu menyalakan api: layar Tercatat menampilkan "N hari beruntun · api hari ini menyala"
  dengan animasi menyala, dan api di Beranda ikut menyala. Tanpa animasi bila HP diatur mengurangi gerakan.
- Pratinjau: `/dev-preview/wellbeing?belumhariini=1` (hari ini belum tercatat).

### Halaman Peringkat (18 Nov 2026)

Halaman menampilkan beberapa saja, sisanya di **Lihat semua peringkat** (lembar bawah). Urutannya:

1. **Arena** (permukaan gelap): nama balapan ("Balapan November · Fisik"), sisa hari, hadiah bila diisi admin,
   lalu podium tiga teratas di bawah cahaya emas: #1 di tengah dengan mahkota, foto lebih besar, poin emas dan
   pil **Unggul N** (selisih dari #2). Nama lengkap, departemen, dan angka peringkat di tiap podium (bukan warna saja).
2. **Posisimu**: peringkat besar (berwarna medali bila di podium), poin, **Kejar #n** dengan bilah jarak,
   "N poin lagi ke podium", atau "Kamu memimpin, unggul N poin". Belum punya poin: ajakan dan tombol Catat.
3. **Mengejar podium**: #4 sampai #8, lalu (bila lebih ke bawah) satu di atasmu, kamu, dan satu di bawahmu.
4. **Lihat semua peringkat**: semua yang punya poin; baris "Kamu" tetap di bawah lembar dan mengantar ke posisimu.
5. Juara bulan lalu di akhir.

Sejak ini API mengirim **semua** yang punya poin di `items` (dulu 30 teratas); aplikasi yang memakai jawaban lama
tetap menampilkan baris di sekitarmu dari `near`.

## Catat dari foto (18 Nov 2026)

Karyawan tidak perlu mengetik angka: pilih **Dari foto bukti**, unggah screenshot aplikasi atau foto layar
jam, dan form terbuka sudah terisi (jenis olahraga atau Langkah harian, tanggal, langkah, kalori, durasi).
Kolom yang terisi dari foto ditandai sampai diubah; karyawan memeriksa lalu menyimpan. Foto yang sama
langsung jadi bukti. Foto yang ditambahkan di tengah form juga dibaca, tapi hanya mengisi yang masih kosong.

Setelah foto terbaca muncul **satu layar Periksa hasil foto** (17 Nov 2026): foto di atas, di bawahnya semua
hasil bacaan yang bisa langsung dikoreksi (Kegiatan dalam satu pilihan untuk olahraga dan kegiatan harian,
Tanggal, **Jam**, Kalori dan Durasi atau Jumlah langkah, Catatan/nama acara dari foto mis. "Morning Run"), lalu
Simpan. Tanpa pindah-pindah langkah.

**Jam kegiatan** (opsional) ada di semua form Catat dan terisi dari foto bila layarnya menulis jam
("at 6:05 AM", "pukul 06.05", "16/11/2026 07.10"); jam ponsel di pojok layar tidak dihitung. Jam disimpan di
kolom `wb_activities.happened_time` (migrasi `202611170002_wellbeing_time_app.sql`). Sebelum migrasi itu dijalankan,
aplikasi tetap jalan dan menyimpan tanpa jam.

- **Mesin:** Tesseract (`tesseract.js` 7.0.0) berjalan di HP karyawan. Foto **tidak dikirim** ke layanan lain
  untuk dibaca, gratis. Mesin dan model bahasa Inggris (±7 MB, dari CDN jsDelivr pada versi yang terkunci)
  diunduh sekali saat pertama dipakai, lalu tersimpan di browser.
- **Pembaca:** `src/components/wellbeing/read-proof.ts` mengubah teks foto jadi data: angka ribuan/desimal
  gaya Indonesia dan Inggris, target ("/ 10.000") dan jam layar tidak dihitung, label Indonesia/Inggris,
  tanggal hanya dalam batas hari mundur, jenis olahraga dicocokkan dengan katalog.
- **Batas:** akurasi tergantung foto (buram, miring, tulisan kecil). Yang tidak terbaca dibiarkan kosong dan
  diisi sendiri; data tetap diperiksa admin seperti biasa.

## Profil dan Riwayat (18 Nov 2026)

- Profil: rekor, lalu daftar pengaturan seperti di HP (Strava, Tema dengan pilihannya di kanan dan lembar
  pilihan Otomatis/Terang/Gelap, Keluar). Riwayat tidak lagi diulang di Profil.
- Riwayat: satu-satunya tempat riwayat, dengan chip Semua, Harian, Olahraga, Strava, dan **Dari admin**
  (poin acara kantor, koreksi, dan saldo dari aplikasi lama).

## Admin: Laporan, konfirmasi massal, kontrol aplikasi (17 Nov 2026)

- **Periksa:** centang kartu (atau tombol X, atau Pilih semua), lalu **Konfirmasi** menandai semua yang
  dipilih sebagai sudah diperiksa sekaligus, dengan Urungkan. Poin dan keputusan tidak berubah. Yang dipilih juga
  bisa langsung diunduh sebagai Excel. Kartu dalam satu baris sama tinggi dan tombolnya sama lebar.
- **Laporan** (menu baru): tiga laporan Excel (.xlsx) dengan pilihan periode (bulan ini, bulan lalu, rentang
  tanggal, semua) dan saringan: Rekap poin per karyawan, Daftar aktivitas, Poin dari admin. Angka berupa angka
  sungguhan di Excel (bisa dijumlah); lembar Keterangan mencatat periode, saringan, waktu, dan siapa yang
  mengunduh. Ada ringkasan bulan ini dan poin per dimensi.
- **Pengaturan → Aplikasi karyawan** (dikurasi: hanya yang memang perlu dikendalikan admin): pengumuman di
  Beranda (bisa ditutup karyawan, muncul lagi kalau diubah, bisa diberi tanggal akhir), teks hadiah bulan ini
  (di kartu balapan dan Peringkat), baca data dari foto aktif/mati, dan jeda pencatatan dengan pesan.
  Tidak dibuat: menyembunyikan peringkat, mengubah warna, batas foto (dibatasi database 5), Strava (belum ada).
  Disimpan di `wb_settings.app` (migrasi `202611170002_wellbeing_time_app.sql`); sebelum migrasi aplikasi
  memakai bawaan.
- Pratinjau tanpa login: `/dev-preview/wellbeing-admin` (data contoh di browser; Unduh Excel hanya di admin
  sungguhan).

## Strava

Satu aplikasi Strava API milik kantor; tiap karyawan menyambungkan akun Strava-nya sendiri. Aturan Strava sejak
Juni 2026: pemilik aplikasi wajib berlangganan Strava; aplikasi baru 1 atlet, naik sendiri ke 10, lebih dari itu
lewat review; data Strava seseorang hanya tampil ke orang itu kecuali ia setuju (peringkat hanya total poin, dengan
persetujuan saat menyambung). Sambungan baru (webhook, token per orang) dibangun setelah aplikasi Strava API kantor
siap; sampai itu olahraga dicatat lewat Catat → Olahraga.

## Pindah data lama

`scripts/wellbeing-import.mjs` membaca ekspor CSV aplikasi lama (di luar repo) dan menulis salinan ke `wb_*`:
uji kering secara bawaan, `--apply` untuk menulis. Bisa diulang (`legacy_id`): menambah yang baru, memperbarui yang
berubah, menghapus yang sudah tidak ada. Profil lama dicocokkan ke Data karyawan
(`scripts/wellbeing-match-employees.mjs`). Total poin tiap orang dibuat sama dengan aplikasi lama (tanpa data uji
Desember 2025). Token Strava baru dipindah saat peralihan.

### Storage (18 Nov 2026)

Foto bukti hasil impor awalnya tautan ke bucket publik `quest-proofs` project lama. Supaya project lama bisa
diarsipkan, `scripts/wellbeing-storage.mjs` memindahkannya ke R2 Journey:

- **Foto bukti:** tiap tautan lama di `wb_activities.photos` diunduh, dicek jenisnya dari byte awal (foto, atau
  video MP4/MOV yang dulu dipakai sebagai bukti dan sekarang diputar di aplikasi), disimpan sebagai
  `wellbeing/<karyawan>/<id tetap>.<ext>`, dicek ukurannya, lalu tautan diganti kunci baru. Daftar tautan lama ke
  kunci baru ada di `foto-pindah.csv` (folder ekspor); impor ulang memakainya supaya tautan lama tidak kembali.
  Uji kering 18 Nov: 2.167 tautan, semua masih bisa diunduh dan dikenali (2.161 foto, 6 video), total 4,5 GB.
- **Arsip (`--arsip`):** semua bucket dan berkas project lama (termasuk yang tidak dipakai aktivitas) ke R2
  `arsip/wellbeing-lama/<bucket>/<path>`, di luar `wellbeing/` sehingga tidak pernah ditampilkan. Foto bukti yang
  sudah pindah tidak disimpan dua kali. Daftar lengkap dengan sha256 di `arsip-storage.csv`.
- Tidak ada yang dihapus dari project lama oleh skrip.

## Peralihan

1. Uji di Journey dengan salinan data (aplikasi lama tetap resmi).
2. Hari H, berurutan:
   1. Aplikasi lama dikunci (tidak bisa mencatat), supaya tidak ada data baru di sana.
   2. Ekspor terakhir: `ekspor-semua.sql` di SQL Editor project lama, simpan sebagai `semua-tabel.csv`.
   3. Impor terakhir: `node --env-file=.env scripts/wellbeing-import.mjs <folder> --semua` (uji kering), cek
      `impor-laporan.md` (total tiap orang sama dengan aplikasi lama), lalu ulangi dengan `--apply`.
   4. Foto: `node --env-file=.env scripts/wellbeing-storage.mjs <folder>` (uji kering), lalu `--apply`. Selesai bila
      tertulis **tautan lama tersisa di Journey: 0**. Buka beberapa aktivitas lama di Admin Periksa: foto tampil.
      `.env` perlu `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (sama dengan Vercel).
   5. Arsip storage: pemilik mengisi sementara kunci project lama di `akses.env`, jalankan `--arsip --apply`,
      lalu kosongkan lagi `akses.env`.
   6. Arsip database: `semua-tabel.csv` (semua tabel, tanpa kolom rahasia) sudah cukup sebagai catatan. Kalau
      ingin salinan yang bisa dipulihkan utuh, unduh juga dump database (`supabase db dump` atau `pg_dump` dengan
      kata sandi database project lama). Simpan folder ekspor ini di tempat arsip kantor.
   7. Aplikasi Strava dipindah, alamat lama dialihkan ke `journey.werkudara.group/wellbeing`, lalu diumumkan.
3. Project Supabase lama: dijeda (pause) dulu setelah langkah di atas selesai, bukan langsung dihapus. Hapus hanya
   setelah beberapa minggu tanpa masalah dan arsip sudah diperiksa.
