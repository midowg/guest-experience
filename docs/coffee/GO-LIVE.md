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
     urut, PIN, dan akses tidak berubah. 325 pemeriksaan aturan lulus (jatah 4/2/2 per bulan WIB, kunci
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
8. **Siapkan tablet GA.** Masuk dengan akun petugas, buka `/coffee/ga`, **pasang ke layar utama, lalu
   sematkan layarnya** (screen pinning). Mode tamu hanya menjaga halaman tablet; tanpa disematkan, tamu
   masih bisa mengetik alamat lain di browser.
9. **Uji dengan akun asli (belum pernah dilakukan).**
   - Masuk dari `/coffee` → kembali ke halaman yang dituju.
   - Ajukan klaim di HP → muncul di Antrean pengelola dalam 10 detik.
   - Pengelola tekan Selesai, lalu coba Tolak pada klaim lain → berubah di HP dalam 15 detik.
   - Batalkan klaim yang belum diproses → jatah kembali.
   - Keluar di HP → layar "Kamu sudah keluar".
   - Karyawan biasa membuka `/coffee/ga` → kembali ke `/coffee` dengan keterangan.
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
