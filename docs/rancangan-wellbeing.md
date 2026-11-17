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

## Catat dari foto (18 Nov 2026)

Karyawan tidak perlu mengetik angka: pilih **Dari foto bukti**, unggah screenshot aplikasi atau foto layar
jam, dan form terbuka sudah terisi (jenis olahraga atau Langkah harian, tanggal, langkah, kalori, durasi).
Kolom yang terisi dari foto ditandai sampai diubah; karyawan memeriksa lalu menyimpan. Foto yang sama
langsung jadi bukti. Foto yang ditambahkan di tengah form juga dibaca, tapi hanya mengisi yang masih kosong.

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

## Peralihan

1. Uji di Journey dengan salinan data (aplikasi lama tetap resmi).
2. Hari H: aplikasi lama dikunci, impor terakhir, aplikasi Strava dipindah, alamat lama dialihkan ke
   `journey.werkudara.group/wellbeing`, lalu diumumkan.
