# WG Coffee: panduan go-live untuk pemilik

Disalin dari audit akhir (`AUDIT-F5.md`, 26 Nov 2026) dan diperbarui setelah perbaikannya. Kerjakan
**berurutan**. Yang bertanda (teknis) dikerjakan orang yang memegang database dan server; sisanya bisa
pemilik sendiri. Aturan pemakaian sehari-hari: `docs/aturan-coffee.md`.

## Yang perlu diketahui dulu

- Ada **dua berkas database** (migrasi) yang **belum pernah dijalankan di database Supabase mana
  pun**. **SQL sudah dijalankan di Postgres WASM (PGlite) pada 26 Nov 2026; uji balapan sungguhan
  belum** (lihat langkah 1). Sebelum keduanya dijalankan, WG Coffee mati dengan rapi:
  halamannya menulis "belum dibuka", dan aplikasi lain tidak berubah.
- **Belum pernah diuji dengan orang sungguhan:** masuk dengan akun asli, HP dan tablet asli, dan
  notifikasi sungguhan. Semua itu baru diuji lewat tes otomatis dan layar tiruan. Langkah 9 dan 10 di
  bawah adalah ujinya.
- Jangan umumkan `/coffee` ke karyawan sebelum langkah 12.

## Daftar langkah

0. **Sebelum kode dinaikkan (teknis).** Ambil keadaan terbaru `main`, pastikan cabang ini masih bisa
   digabung tanpa bentrok, jalankan lagi tiga pemeriksaan (tes, tsc, eslint), lalu naikkan. Setelah
   tayang tanpa migrasi: `/coffee` menulis "belum dibuka" dan aplikasi lain normal. **Jangan mencentang
   WG Coffee di Akses admin dulu**: akan ditolak dengan kalimat "Akses WG Coffee menunggu
   migrasi 202612010001_coffee.sql", dan tidak ada yang tersimpan.
1. **Uji database (teknis). Sebagian sudah, satu hal belum.**
   - **Sudah (26 Nov 2026):** kedua migrasi dijalankan apa adanya di mesin Postgres sungguhan yang
     hidup di memori (PGlite, Postgres versi WASM), di atas tabel `employees` dan `admin_grants` yang
     dibuat dari migrasi aslinya. Hasil: **keduanya berjalan tanpa galat, tidak ada SQL yang perlu
     diperbaiki**; dijalankan ulang 3 kali (tabel kosong dan sudah berisi) tetap aman, isi tabel, nomor
     urut, PIN, dan akses tidak berubah. 325 pemeriksaan aturan lulus saat itu (715 sejak migrasi menu, lihat "Pembaruan 26 Nov"; 794 sejak migrasi Buku tamu / Menu biasa, lihat "Pembaruan 27 Nov") (jatah 4/2/2 per bulan WIB, kunci
     kiriman, Catat manual, Batalkan catatan, Urungkan, pesanan rapat, Tambah lagi, PIN, notifikasi,
     akses admin, hak akses), dan hasilnya **sama** dengan tiruan yang dipakai tes (`fake-db.ts`).
     Ulangi kapan saja, tanpa memasang apa pun dan tanpa menyentuh database asli:
     `npx --yes --package=@electric-sql/pglite node scripts/coffee-sql-check.mjs` (perlu Node 22.18+;
     tambah `--verbose` untuk melihat tiap pemeriksaan). Jalankan lagi setiap kali berkas migrasi diubah.
   - **Belum (wajib, di database uji Supabase):** **balapan sungguhan.** PGlite hanya punya satu
     koneksi, jadi dua permintaan tidak pernah benar-benar bersamaan; yang terbukti hanya bahwa kunci
     jatah diambil di dalam transaksi klaim dan dilepas sesudahnya. Jalankan kedua berkas di database
     uji, lalu kirim 20 klaim serentak untuk satu orang yang jatahnya tinggal 1 → harus tepat 1 yang
     berhasil; dan 2 "Tambah lagi" serentak → nomor `T-xxxx-2` dan `T-xxxx-3`, tidak ada yang kembar.
   - **Juga belum:** lewat PostgREST/Supabase sungguhan (pemanggilan `.rpc`, baca pesanan beserta
     minumannya, kode galat), dan versi Postgres Supabase (PGlite memakai versi yang lebih baru).
   - Diketahui dari uji: nomor rapat `T-xxxx` bisa melompat satu bila sebuah kiriman ditolak di
     tengah jalan (sifat nomor urut Postgres, bukan salah).
2. **Produksi, cek satu hal sebelum migrasi (teknis).** Jalankan:
   `select pg_get_constraintdef(oid) from pg_constraint where conname = 'admin_grants_apps_check';`
   Isinya harus tepat `acara, friday_sharing, your_visit, wam, kuesioner, tv, wellbeing, wam_acara, hr`.
   Bila ada nama lain, **berhenti**: tambahkan nama itu ke baris `check (apps <@ array[...])` di akhir
   berkas migrasi pertama dulu, kalau tidak akses aplikasi itu ikut terbuang.
3. **Jalankan migrasi pertama** (`202612010001_coffee.sql`) (teknis). Cek: `/admin/coffee` terbuka untuk
   super admin dengan antrean kosong, `/coffee` menampilkan menu, Pengaturan menampilkan jatah 4 / 2 / 2.
4. **Jalankan migrasi kedua** (`202612010002_coffee_push.sql`) (teknis). Ini menyalakan notifikasi.
   Syarat dari audit ("perbaikan F5-01 sudah masuk") **sudah terpenuhi** di kode ini: di mode tamu,
   mengetuk notifikasi tidak lagi membuka jendela lain. Tetap dibuktikan di langkah 10.
5. **Setelan server (teknis).** `WAM_VAPID_PUBLIC_KEY` dan `WAM_VAPID_PRIVATE_KEY` (sudah dipakai WAM,
   jangan dikosongkan), dan `RATE_LIMIT_SECRET` (minimal 32 huruf). **Jangan mengganti
   `RATE_LIMIT_SECRET` setelah PIN GA diatur**; bila terpaksa, simpan PIN baru sesudahnya.
6. **Beri akses pengelola.** Super admin → Akses admin → centang **WG Coffee** untuk tiap
   pengelola (HR/admin). Mereka masuk ke admin dengan **akun karyawan sendiri**; super admin tidak bisa
   menerima notifikasi. Pemegang akses otomatis bisa memakai Mode GA di tablet.
7. **Atur PIN GA.** `/admin/coffee` → Pengaturan → PIN GA (4 angka) → beri tahu petugas GA.
8. **Siapkan tablet GA.** **Tablet GA: buka `journey.werkudara.group/coffee/ga`, masuk dengan akun
   karyawan GA** (halaman masuk khusus tablet, `/coffee/ga/masuk`; akun dan password sama dengan
   Journey). Lalu **pasang ke layar utama, dan sematkan layarnya** (screen pinning). Ganti petugas:
   **Keluar** di bilah atas tablet, lalu petugas berikutnya masuk dengan akunnya sendiri. Mode tamu hanya menjaga halaman tablet; tanpa disematkan, tamu
   masih bisa mengetik alamat lain di browser.
9. **Uji dengan akun asli (belum pernah dilakukan).**
   - Masuk dari `/coffee` → kembali ke halaman yang dituju.
   - Ajukan klaim di HP → muncul di Antrean pengelola dalam 10 detik.
   - Pengelola tekan Selesai, lalu coba Tolak pada klaim lain → berubah di HP dalam 15 detik.
   - Batalkan klaim yang belum diproses → jatah kembali.
   - Keluar di HP → layar "Kamu sudah keluar".
   - Karyawan biasa membuka `/coffee/ga` → halaman masuk tablet berkata "Akun ini belum punya akses
     Mode GA. Minta pengelola WG Coffee." dengan Keluar dan tautan ke aplikasi karyawan.
   - Tablet: tanpa sesi `/coffee/ga` membuka `/coffee/ga/masuk`; masuk → Mode GA; **Keluar** di bilah
     atas → kembali ke halaman masuk tablet, tanpa nama atau pesanan orang sebelumnya. Saat Serahkan
     ke tamu terbuka, ketik `/coffee/ga/masuk` di alamat → tetap buku menu.
   - Catat manual, lalu Batalkan catatan.
   - Rekap → Unduh CSV dan Unduh Excel → buka di Excel, lembar Detail berisi 23 kolom dengan lebar yang pas.
   - Dua pengelola menekan Selesai bersamaan pada pesanan yang sama → satu yang menang.
   - Di tablet: Serahkan ke tamu → ketik PIN salah 5 kali → layar meminta menunggu 30 detik → setelah
     itu PIN yang benar diterima. Coba juga: saat terkunci, pengelola menyimpan PIN baru → PIN baru
     langsung diterima.
10. **Uji notifikasi di perangkat asli (belum pernah dilakukan).** Harus lewat alamat `https` asli.
    1. Komputer pengelola (Chrome/Edge), browser yang **belum pernah** membuka `/coffee`: masuk admin
       dengan akun karyawan → `/admin/coffee` → **Nyalakan notifikasi** → Izinkan. Harus berhasil pada
       **tekan pertama** (perbaikan F5-03; baru terbukti lewat tes, belum di Chrome asli). Ajukan klaim
       dari HP lain → notifikasi "Klaim baru" muncul, juga saat tab admin ditutup.
    2. HP Android karyawan: buka `/coffee`, pasang, Izinkan notifikasi. Akun → **Kirim notifikasi tes**
       → muncul. Ajukan klaim, kunci layar, pengelola tekan Selesai → "Silakan ambil di mesin". Ulangi
       dengan Tolak: isi catatan tolak **tidak** tampil di notifikasi.
    3. iPhone (iOS 16.4 ke atas): di Safari tertulis "dipasang dulu ke layar utama". Pasang → buka dari
       ikon → Akun → Nyalakan notifikasi → ulangi nomor 2.
    4. Tablet GA: **Nyalakan notifikasi** di bilah atas. Kirim pesanan rapat, pengelola tekan Selesai →
       "Pesanan rapat siap diambil"; ketuk → status pesanan itu terbuka. Coba **Matikan** di samping
       "Notifikasi aktif".
    5. **Mode tamu (yang terpenting).** Di tablet tekan Serahkan ke tamu. Lalu buat tiga kabar: pengelola
       memproses pesanan rapat, karyawan lain mengajukan klaim (bila petugas tablet juga pengelola), dan
       pengelola memproses klaim pribadi petugas tablet. Setiap kali, di tablet hanya muncul
       "WG Coffee · Ada pembaruan pesanan." tanpa suara. **Ketuk masing-masing: tablet harus
       tetap di buku menu, tidak ada jendela atau tab baru yang terbuka.** Bila ada yang terbuka,
       berhenti dan laporkan; jangan pakai tablet dengan tamu.
    6. Ganti orang: Keluar di HP itu, masuk sebagai orang lain → notifikasi orang pertama tidak masuk lagi.
    7. Tolak izin notifikasi di browser → aplikasi menjelaskan cara mengizinkan lagi; status tetap
       berubah sendiri.
11. **Keputusan pemilik yang masih terbuka.**
    - Siapa yang dianggap "GA": sekarang kategori DW, Admin Booking, dan pemegang akses Coffee boleh
      Mode GA (pesanan tim tanpa jatah, melihat daftar karyawan). Setuju?
    - "Siap diambil" pada pesanan rapat hanya tampil di hari yang sama. Setuju?
    - Notifikasi di mode tamu dibuat netral; PIC rapat dibawa ke `/coffee`; membatalkan klaim tidak
      menarik notifikasi "Klaim baru" yang sudah muncul. Setuju?
    - Format angka di Excel Detail: tanyakan ke HR saat rekap pertama.
12. **Baru setelah semua di atas beres: bagikan `/coffee` ke karyawan.**

## Kalau harus mundur

- **Mematikan notifikasi saja** (aplikasi tetap jalan, status tetap berubah sendiri) (teknis):
  `drop table public.coffee_push_sent; drop table public.coffee_push_subscriptions;`
  Jangan mengosongkan `WAM_VAPID_*`: WAM memakainya.
- **Menarik kodenya** (teknis): cabang ini hanya menambah, jadi kode lama bisa ditayangkan lagi kapan
  saja; tabel yang sudah dibuat tidak mengganggu kode lama. Setelah itu buka sekali Super admin →
  Akses admin untuk memastikan orang yang pernah dicentang Coffee masih tampil benar (perlu dicek).
- **Menghapus migrasi kedua** (teknis): dua `drop table` di atas.
- **Menghapus migrasi pertama** (teknis; **semua data pesanan hilang, unduh Rekap dulu**): migrasi
  kedua harus dihapus lebih dulu. Lalu urutan di kepala berkas `202612010001_coffee.sql`: empat
  `drop function`, `drop table coffee_order_items, coffee_orders, coffee_settings, coffee_pin_tries`,
  dua `drop sequence`, `update admin_grants set apps = array_remove(apps, 'coffee')`, lalu pasang lagi
  batasan dari `202611200703` tanpa `'coffee'`.
- **Tablet terkunci di buku menu:** masukkan PIN GA. 5 kali salah → tunggu 30 detik (lalu 1, 5, paling
  lama 15 menit; layar menyebut lamanya). Lupa PIN, atau tidak mau menunggu: pengelola menyimpan PIN
  baru di Pengaturan, tablet langsung terbuka dengan PIN baru.
- **Notifikasi tidak masuk:** status tetap berubah sendiri di layar. Di perangkat itu: Matikan lalu
  Nyalakan lagi. Sebuah kabar hanya dikirim sekali; yang gagal terkirim tidak diulang.

## Yang masih terbuka setelah perbaikan audit

- Migrasi belum pernah dijalankan di database Supabase (uji maupun produksi), dan uji 20 klaim
  serentak (balapan sungguhan) belum dilakukan. Yang sudah: SQL dijalankan dan aturannya diuji di
  Postgres WASM (PGlite), 26 Nov 2026 (langkah 1).
- Akun asli, perangkat asli, dan notifikasi sungguhan belum pernah diuji (langkah 9 dan 10).
- Keluar dari WAM, WG People, atau Booking (bukan dari Coffee) belum menghentikan notifikasi Coffee di
  perangkat itu sampai Coffee dibuka lagi di sana.
- Keputusan pemilik di langkah 11.

## Pembaruan 26 Nov: menu dan opsi

Dua hal baru setelah WG Coffee tayang (F6): **opsi minuman per audiens** (karyawan tidak lagi ditanya
suhu, gula, dan takaran es; tamu dan tim rapat tetap) dan **Menu** yang dikelola pengelola di
`/admin/coffee` → Menu. Butuh satu migrasi baru. Dua migrasi yang sudah berjalan
(`202612010001_coffee.sql`, `202612010002_coffee_push.sql`) **tidak diubah dan tidak perlu dijalankan lagi**.

### Yang harus dilakukan pemilik

1. **Naikkan kode.** Otomatis saat cabang ini di-push ke `main` (tidak ada langkah lain).
2. **Jalankan `supabase/migrations/coffee/202612020001_coffee_menu.sql`** di SQL Editor Supabase (salin seluruh
   isi berkas, Run). Satu kali cukup; dijalankan dua kali pun aman.
3. **Buka `/admin/coffee` → Pengaturan → Opsi minuman**, cek bawaannya (di bawah), ubah bila perlu, Simpan opsi.
4. **Buka `/admin/coffee` → Menu**, cek 15 minuman tampil dengan fotonya.

Urutan 1 lalu 2 itu penting: kode dulu, baru migrasi. Dibalik pun aplikasi lama tetap jalan
(migrasinya hanya menambah), tetapi klaim baru akan tersimpan dengan nama minuman kosong sampai kode baru naik.

### Sebelum dan sesudah migrasi dijalankan

| | Sebelum `202612020001` dijalankan (kode baru sudah naik) | Sesudah |
| --- | --- | --- |
| Aplikasi karyawan, tablet GA, buku menu | Jalan seperti kemarin: **semua opsi masih ditanya ke semua orang**, menu dari 15 minuman bawaan | Karyawan langsung "Ajukan klaim" tanpa opsi; tamu dan tim ditanya sesuai Pengaturan; menu dari database |
| Antrean, Rekap, Catat manual, notifikasi | Jalan seperti kemarin | Sama, dan opsi yang tidak ditanya tidak ditulis ("Café Latte" saja) |
| Pengaturan → Opsi minuman | Tampil, semua nyala, **tidak bisa disimpan**; tertulis "Menunggu migrasi 202612020001_coffee_menu.sql" | Bisa diubah; berlaku mulai pesanan berikutnya |
| Menu | 15 minuman bawaan, **hanya dilihat**; tertulis menunggu migrasi yang sama | Tambah, ubah, ganti foto, atur urutan, sembunyikan, hapus |
| Kesalahan 500 | Tidak ada: aplikasi memeriksa sendiri apakah migrasi sudah ada | Tidak ada |

Setelah migrasi dijalankan aplikasi **mengetahuinya sendiri paling lama 30 detik kemudian**; tidak perlu
deploy ulang atau memuat ulang server.

### Bawaan opsi (anggapan PM, ubah di Pengaturan bila tidak cocok)

| Audiens | Suhu (Panas/Es) | Gula | Takaran es | Alasan |
| --- | --- | --- | --- | --- |
| Karyawan (klaim) | mati | mati | mati | Karyawan mengambil sendiri di mesin |
| Tim · rapat | nyala | nyala | nyala | Disiapkan GA, sama dengan tamu |
| Tamu | nyala | nyala | nyala | Disiapkan GA |

Takaran es hanya bisa nyala bersama Suhu.

### Apa yang dilakukan migrasi ini pada data yang sudah ada

- **Tidak ada yang dihapus atau ditimpa.** Pesanan lama tetap menyimpan suhu, gula, dan takaran esnya.
- Satu-satunya yang ditulis ke baris lama: kolom baru `drink_name` diisi nama minumannya (dari 15
  minuman bawaan), supaya riwayat dan rekap tetap benar walau minuman nanti diganti nama atau dihapus.
- Suhu, gula, dan takaran es kini **boleh kosong** (untuk pesanan yang memang tidak ditanya).
- Tabel baru `coffee_drinks` diisi 15 minuman bawaan **hanya bila masih kosong**: dijalankan ulang
  nanti, minuman yang sudah dihapus atau diganti nama pengelola tidak kembali, dan opsi yang sudah
  diubah tidak direset.
- Dua fungsi database (`coffee_submit_claim`, `coffee_submit_meeting`) diganti dengan versi baru
  bertanda tangan sama; aturan lama (jatah, kunci kiriman, Tambah lagi) tidak berubah.

**Sudah diuji (26 Nov 2026) di Postgres WASM (PGlite), bukan di Supabase:** migrasi 1 dan 2 dijalankan,
pesanan dibuat dengan skema lama, lalu migrasi 3 dijalankan di atasnya, diulang, diulang lagi setelah
menu dan opsi diubah, lalu ketiganya berurutan. 715 pemeriksaan lulus, 0 gagal
(`npx --yes --package=@electric-sql/pglite node scripts/coffee-sql-check.mjs`). **Belum diuji:**
di database Supabase asli, dan balapan sungguhan (dua transaksi bersamaan).

### Jangan

- **Jangan menjalankan lagi `202612010001_coffee.sql` setelah `202612020001`.** Berkas pertama memuat
  versi lama kedua fungsi itu dan akan menimpanya (klaim lalu tersimpan tanpa nama minuman, dan takaran
  es terisi "Normal" karangan). Bila terlanjur: jalankan `202612020001_coffee_menu.sql` sekali lagi.
- Jangan mengubah isi `coffee_drinks.slug` dengan tangan: pesanan menunjuk minuman lewat slug itu.

### Foto minuman

Foto yang diunggah pengelola disimpan di penyimpanan Supabase yang sama dengan foto acara (bucket
`event-photos`, folder `coffee/drinks/`), dipotong persegi 640 px, WebP. Bila bucket itu belum ada di
server, Ganti foto menjawab "Penyimpanan foto belum disiapkan"; hal lain tetap jalan. 15 minuman
bawaan memakai berkas foto di aplikasi sampai fotonya diganti.

### Kalau harus mundur

Kode lama (sebelum F6) tetap bisa membaca database yang sudah dimigrasi **selama belum ada pesanan
tanpa opsi**. Setelah karyawan mengajukan klaim tanpa opsi, kode lama akan menampilkan baris itu
dengan suhu kosong. Jadi bila kode harus dimundurkan: nyalakan dulu ketiga opsi untuk Karyawan di
Pengaturan (dengan kode baru), baru mundurkan. Cara membatalkan migrasinya ada di kepala berkas SQL.

## Pembaruan 27 Nov: menu mesin JS Mini dan pilihan Buku tamu / Menu biasa

Keputusan pemilik 27 Nov 2026 (F7): tiap minuman punya **dua centang** di `/admin/coffee` → Menu,
**Buku tamu** (buku menu tamu di tablet GA, dan baris Tamu) dan **Menu biasa** (aplikasi karyawan
`/coffee`, klaim, dan baris Tim · rapat). Menu biasa mengikuti **mesin JumpStart JS Mini** di pantry
(12 minuman, dibaca dari jumpstart.id/machine/2/menu), karena karyawan mengambil sendiri di mesin.
**Tidak ada minuman yang ditambah atau dihapus**: ke-12 minuman mesin sudah ada di menu kita. Butuh
satu migrasi baru; tiga migrasi yang sudah berjalan tidak diubah.

### Yang harus dilakukan pemilik

1. **Naikkan kode.** Otomatis saat cabang ini di-push ke `main` (tidak ada langkah lain).
2. **Jalankan `supabase/migrations/coffee/202612030003_coffee_menu_audience.sql`** di SQL Editor Supabase (salin
   seluruh isi berkas, Run). Satu kali cukup; dijalankan dua kali pun aman.
3. **Buka `/admin/coffee` → Menu**, cek centangnya (tabel di bawah) dan ubah bila perlu.

Kode dulu, baru migrasi. Aplikasi mengetahui migrasinya sendiri paling lama 30 detik kemudian.

### Centang awal (ditulis sekali oleh migrasi)

| Minuman | Buku tamu | Menu biasa |
| --- | --- | --- |
| Kopi Susu, Cappuccino, Café Latte, Café Mocha, Piccolo Latte, Matcha Espresso, Kopi Hitam, Americano, Espresso, Milk Chocolate, Matcha Latte, Dark Chocolate (12, dibuat mesin JS Mini) | ya | ya |
| Cappuccino Double Shot, Cucumber Ice, Classic Tea (3, hanya di menu kertas) | ya | **tidak** |
| Minuman lain yang sudah ditambah pengelola sebelum migrasi | ya | ya |

Akibatnya bagi karyawan: tiga minuman itu **hilang dari aplikasi karyawan** dan tidak bisa diklaim atau
dipesankan untuk Tim · rapat; tamu tetap bisa memesannya dari buku menu. Bila tidak cocok, centang
"Menu biasa" pada minuman itu di Menu.

### Sebelum dan sesudah migrasi dijalankan

| | Sebelum `202612030001` dijalankan (kode baru sudah naik) | Sesudah |
| --- | --- | --- |
| Aplikasi karyawan | Seperti kemarin: 15 minuman | Hanya minuman Menu biasa (12) |
| Tablet GA, input cepat | Seperti kemarin: semua minuman untuk Tamu dan Tim · rapat; ada tulisan kecil "Menampilkan Buku tamu / Menu biasa" | Tamu: Buku tamu (15); Tim · rapat: Menu biasa (12) |
| Buku menu tamu | Seperti kemarin: 15 minuman | Hanya minuman Buku tamu (15, sama) |
| Catat manual | Daftar semua minuman | Daftar mengikuti jenis; "Lainnya" tetap ada |
| Menu (admin) | Cari, saringan, tambah, ubah, sembunyikan jalan; **kedua centang tampil tercentang tetapi belum bisa diubah**; tertulis "Menunggu migrasi 202612030003_coffee_menu_audience.sql" | Centang bisa diubah di daftar dan di panel |
| Antrean, Rekap, notifikasi, pesanan lama | Tidak berubah | Tidak berubah |
| Kesalahan 500 | Tidak ada: aplikasi memeriksa sendiri apakah kolomnya sudah ada | Tidak ada |

### Apa yang dilakukan migrasi ini pada data yang sudah ada

- **Tidak ada yang dihapus, tidak ada pesanan yang disentuh, tidak ada minuman yang ditambah.** Hanya dua
  kolom baru di `coffee_drinks` (`in_guest_book`, `in_regular_menu`, keduanya wajib isi, bawaan `true`).
- **Centang awal ditulis sekali saja.** Tiga baris di atas dimatikan di dalam blok yang juga menambah
  kolomnya, dan blok itu hanya jalan selama kolom `in_regular_menu` belum ada. Seluruh berkas satu
  transaksi, jadi "kolom ada" selalu berarti "centang awal sudah ditulis". Dijalankan lagi: bloknya
  dilewati, **centang yang sudah diubah pengelola tidak kembali**, minuman yang sudah dihapus tidak kembali.
- Dua fungsi (`coffee_submit_claim`, `coffee_submit_meeting`) diganti dengan tanda tangan yang sama dan
  satu aturan tambahan: klaim dan baris Tim · rapat butuh minuman Menu biasa, baris Tamu butuh minuman
  Buku tamu. Catat manual tetap boleh minuman menu apa pun.

Diuji di Postgres dalam memori (PGlite) dengan memainkan urutan aslinya: pesanan lama, lalu menu yang
sudah diubah pengelola (satu minuman berganti nama, satu dihapus, satu disembunyikan, satu milik
pengelola sendiri), lalu migrasi 4 di atasnya, diulang dua kali, diulang lagi setelah centang diubah,
lalu keempatnya berurutan. **794 pemeriksaan lulus, 0 gagal**
(`npx --yes --package=@electric-sql/pglite node scripts/coffee-sql-check.mjs`). **Belum diuji:** di
database Supabase asli, dan balapan sungguhan (dua transaksi bersamaan).

### Jangan

- **Jangan menjalankan lagi `202612010001_coffee.sql` atau `202612020001_coffee_menu.sql` setelah
  `202612030001`.** Keduanya memuat versi lama kedua fungsi dan akan menimpanya: centangnya tetap,
  tetapi database berhenti menjaganya (aplikasi masih menolak, penjaga kedua hilang). Bila terlanjur:
  jalankan `202612030003_coffee_menu_audience.sql` sekali lagi (aman, centang tidak berubah).

### Foto

Belum ada minuman tanpa foto. Minuman yang nanti ditambah tanpa foto digambar cangkir di atas warna
kelompoknya (Kopi atau Non-kopi) di semua layar; fotonya ditambah pemilik di **Menu → buka minumannya →
Pilih foto / Ganti foto**. Saringan **Tanpa foto** di Menu menunjukkan mana yang belum.

### Kalau harus mundur

Kode lama (sebelum F7) tetap jalan di atas database yang sudah dimigrasi, dengan satu selisih: kode lama
menampilkan ke-15 minuman di aplikasi karyawan, tetapi database menolak klaim tiga minuman khusus Buku
tamu ("Minuman ini sudah tidak ada di menu"). Bila kode harus dimundurkan lama: centang "Menu biasa"
pada ketiganya dulu (dengan kode baru), atau jalankan lagi dua blok fungsi dari
`202612020001_coffee_menu.sql`. Cara membatalkan migrasinya ada di kepala berkas SQL.

## Pembaruan 27 Nov: harga minuman

Permintaan pemilik 27 Nov 2026 (F9): "Di admin harus ada harga tiap minuman, karena untuk rekap pengeluaran
sekalian nantinya." Tiap minuman punya **harga satuan**, harganya **disimpan di tiap baris pesanan**, dan Rekap
menampilkan **Pengeluaran**. Butuh satu migrasi baru; empat migrasi sebelumnya tidak diubah.

### Yang harus dilakukan pemilik

1. **Naikkan kode.** Otomatis saat cabang ini di-push ke `main`.
2. **Jalankan `supabase/migrations/coffee/202612050001_coffee_price.sql`** di SQL Editor Supabase (salin seluruh
   isi berkas, Run). **Jalankan paling akhir** (setelah `202612030003`). Satu kali cukup; dua kali pun aman.
3. **Buka `/admin/coffee` → Menu, tinjau harga awal, dan isi tiga yang kosong** (Cappuccino Double Shot,
   Cucumber Ice, Classic Tea) serta minuman tambahan sendiri. Harga awal adalah harga promo yang tampil di
   menu mesin JS Mini pada 27 Nov 2026; ubah bila harga sebenarnya lain.

Kode dulu, baru migrasi. Aplikasi mengetahui migrasinya sendiri paling lama 30 detik kemudian.

### Harga awal (ditulis sekali oleh migrasi)

| Minuman | Harga |
| --- | --- |
| Americano, Cappuccino, Café Latte, Café Mocha, Piccolo Latte, Milk Chocolate, Dark Chocolate, Matcha Espresso, Matcha Latte | Rp 8.000 |
| Espresso | Rp 8.900 |
| Kopi Hitam, Kopi Susu | Rp 6.900 |
| Cappuccino Double Shot, Cucumber Ice, Classic Tea, dan minuman tambahan pengelola | kosong |

### Sebelum dan sesudah migrasi dijalankan

| | Sebelum `202612050001` dijalankan (kode baru sudah naik) | Sesudah |
| --- | --- | --- |
| Aplikasi karyawan dan tablet GA | Tidak berubah (tidak pernah menampilkan harga) | Tidak berubah |
| Menu (admin) | Daftar, tambah, ubah, urutan, sembunyikan jalan; kolom harga tidak tampil; kolom **Harga satuan** di panel mati dan bertuliskan "Menunggu migrasi 202612050001_coffee_price.sql"; menyimpan harga dijawab 503 dengan nama migrasi (bukan 500) | Harga tampil di daftar ("Rp 8.000" atau "Harga belum diisi"), bisa diisi di panel; saringan "Tanpa harga"; pemberitahuan "N minuman belum berharga" |
| Rekap | Angka Pengeluaran dan kolom uang bertanda "–", dengan catatan menunggu migrasi; unduhan tetap jalan (kolom harga kosong) | Pengeluaran, Harga satuan, Subtotal, dan kolom Pengeluaran di enam rincian |
| Pesanan baru | Dibuat seperti biasa, tanpa harga | Menyimpan harga minuman saat itu |
| Pesanan lama | Tidak berubah | Diberi harga minumannya **sekali** saat migrasi; yang minumannya belum berharga tetap kosong |
| Antrean, notifikasi, kuota | Tidak berubah | Tidak berubah |

### Apa yang dilakukan migrasi ini pada data yang sudah ada

- **Tidak ada yang dihapus dan tidak ada minuman yang ditambah.** Dua kolom baru yang boleh kosong:
  `coffee_drinks.price` dan `coffee_order_items.unit_price` (bilangan bulat 0 sampai 10.000.000).
- **Harga awal dan pengisian pesanan lama ditulis sekali saja**, di dalam blok yang menambah kolomnya
  (blok hanya jalan selama kolomnya belum ada; seluruh berkas satu transaksi). Dijalankan lagi: bloknya
  dilewati, **harga yang diubah pengelola tidak kembali**, dan pesanan lama tidak diberi harga yang tidak
  dimilikinya saat dibuat (mis. Classic Tea lama tetap kosong walau harganya kini diisi).
- Dua fungsi (`coffee_submit_claim`, `coffee_submit_meeting`) diganti dengan tanda tangan yang sama dan
  semua aturan yang ada (Buku tamu / Menu biasa, jatah, kunci ganda, nama tamu), ditambah satu hal:
  harga minuman saat itu ditulis di baris pesanan. Mengubah harga kemudian tidak menyentuh pesanan lama.

Diuji di Postgres dalam memori (PGlite): pesanan lama dan menu yang sudah diubah pengelola, migrasi 5 di
atasnya, diulang dua kali, diulang setelah harga diubah pengelola, kelimanya berurutan, dan database baru
dengan kelima migrasi (aturan lama, aturan Buku tamu / Menu biasa, aturan harga; Postgres dan tiruan
JavaScript sama). **1225 pemeriksaan lulus, 0 gagal**
(`npx --yes --package=@electric-sql/pglite node scripts/coffee-sql-check.mjs`). **Belum diuji:** di database
Supabase asli, dan balapan sungguhan.

### Jangan

- **Jangan menjalankan lagi `202612020001_coffee_menu.sql` atau `202612030003_coffee_menu_audience.sql`
  setelah `202612050001`.** Keduanya memuat versi lama kedua fungsi (tanpa harga): pesanan baru disimpan
  **tanpa harga** sampai `202612050001_coffee_price.sql` dijalankan lagi (aman). Harga di Menu tidak hilang.

### Kalau harus mundur

Kode lama tetap jalan di atas database yang sudah dimigrasi (kolom baru boleh kosong dan tidak dibaca).
Cara membatalkan migrasinya ada di kepala berkas SQL.
