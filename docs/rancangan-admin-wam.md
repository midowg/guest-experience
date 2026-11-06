# Rancangan refaktor tampilan Admin WAM dan Kelola acara

> **Aturan yang berlaku sekarang ada di [`aturan-wam.md`](aturan-wam.md).** Bila isi berkas ini berbeda, `aturan-wam.md` yang dipakai; berkas ini disimpan sebagai riwayat.

Status: rencana, belum dikerjakan. 5 Nov 2026.
Acuan: gambar "Teams" (WhatsApp 5 Nov 08.38). Yang diambil adalah polanya, bukan merek atau isinya:
- sidebar kiri di atas kanvas abu;
- panel konten putih;
- judul besar dengan aksi di kanan;
- tab bergaris bawah;
- toolbar cari dan filter;
- kartu orang;
- linimasa jam.

Desain: Penpot, file PRAWAM, halaman **"07 · Konsol admin (rencana)"**. Isinya:
- **A1–A10:** Admin WAM.
- **K1–K6:** Kelola acara.
- **M1–M3:** HP.

A2 sudah disetujui pemilik pada 5 Nov.

Keputusan pemilik:
- Cakupan: **Admin WAM** (`/admin/wam`, untuk HR) **dan Kelola acara** (`/wam/manage`, untuk panitia).
- Aksi utama memakai **biru utama**, satu per layar. Selain itu netral seperti acuan. Supaya sama dengan aplikasi WAM, birunya mengikuti design system PRAWAM, yaitu Biru Werkudara `#1551A0`, bukan `#2F6FEB`.
- Akun dan peran tampil sebagai **kartu** secara bawaan, dan bisa diganti ke **tabel**.

Aturan desain tetap mengikuti `brain/aturan/desain-ui.md`:
- font Plus Jakarta Sans;
- netral `#F6F7F9` / `#FFFFFF` / `#E4E7EC`;
- radius 12 untuk tombol, 16 untuk kartu, 24 untuk panel;
- target sentuh ≥ 44 px.

## 1. Pola bersama

| Bagian | Isi |
|---|---|
| Kanvas | Latar abu `#F6F7F9`. Panel konten putih dengan radius 24, jarak 12 dari tepi. |
| Sidebar (lebar 248) | **Atas:** identitas, yaitu logo WAM, "Admin WAM" atau "Kelola acara", dan nama yang masuk; ada tombol ciutkan. **Kolom Cari (Ctrl K):** lompat ke halaman atau ke orang. **Tengah:** grup menu yang bisa dilipat, dengan ikon Lucide 20 dan badge jumlah yang menunggu. **Bawah:** "Buka aplikasi WAM" atau "Kembali ke aplikasi", lalu Keluar. |
| Kepala halaman | Breadcrumb kecil (Admin WAM / Akun dan peran), judul 28/800, dan aksi di kanan (1 tombol biru + tombol garis). |
| Tab | Tab bergaris bawah untuk sub-bagian satu halaman. Tiap tab punya URL sendiri, jadi bisa di-bookmark. |
| Toolbar seksi | Judul seksi di kiri. Di kanan: Cari, Filter (popover), dan ganti tampilan Kartu/Tabel. Pilihan tampilan diingat per halaman. |
| Kartu orang | Foto profil atau inisial, nama, jabatan, dan pill status di pojok kanan atas. Di bawahnya dua kolom kecil (Unit, Peran), lalu email, lalu tombol detail (→). |
| Linimasa | Baris = ruang atau kegiatan, kolom = jam 09.00–18.00. Ada pilihan Hari/Minggu, dan blok berisi judul dan durasi. |
| HP (< 1024 px) | Sidebar menjadi laci dari kiri lewat hamburger, seperti sekarang. Panel selebar layar, toolbar turun baris, kartu satu kolom, dan linimasa digeser ke samping. |

Komponen baru ditaruh di `src/components/console/`:
- `ConsoleShell`, `PageHeader`, `PageTabs`, `SectionToolbar`, `ViewToggle`, `PersonCard`, `DayTimeline`.

Semua komponen dipakai bersama oleh kedua area. Ada dua jalur warna:
- **Admin WAM:** token admin, mode terang.
- **Kelola acara:** token `--pw-*`, ikut tema terang atau gelap aplikasi.

## 2. Admin WAM (`/admin/wam`)

Header admin yang sekarang (Werkudara · Semua acara · Keluar) diganti sidebar baru. "Semua acara" pindah ke bagian bawah sidebar.

| Menu | Rencana |
|---|---|
| Ringkasan | **Baris kartu angka:** akun aktif, belum login, reset menunggu, dan progres kuesioner. **Linimasa "Jadwal hari ini":** booking ruang dan sesi per ruang, dengan pilihan Hari/Minggu. **Daftar "Perlu tindakan".** |
| Akun dan peran | Aksi: **Buat akun** (biru). **Tab Akun:** kartu orang seperti acuan, bisa diganti ke tabel. Ada cari, dan filter peran (Peserta, Panitia, Admin WAM, BOD, HOD), unit, serta status login. **Tab Peran:** tabel penjelasan peran yang sekarang. **Tab Permintaan reset:** pindahan menu "Permintaan reset password", dengan badge jumlah. |
| Acara dan modul | Kepala halaman baru. Isinya kartu status Pra WAM dan WAM. |
| Apa itu WAM | Kepala halaman baru, dengan aksi Simpan di kanan atas. |
| Ruang dan denah | **Tab Daftar ruang:** kartu ruang berisi kapasitas, fasilitas, dan bisa dibooking atau tidak. **Tab Denah.** Aksi: Tambah ruang. |
| Kuesioner | Tab sendiri yang sekarang dijadikan tab kepala halaman: Isi · Pengaturan · Progres · Rekap · Kartu · Kamar · Ekspor · Data HR. |

Grup menu:
- **Ikhtisar:** Ringkasan.
- **Orang:** Akun dan peran.
- **Aplikasi:** Acara dan modul, Apa itu WAM, Ruang dan denah.
- **Data peserta:** Kuesioner.

## 3. Kelola acara (`/wam/manage`)

Hanya tampilan desktop yang memakai pola baru. Di HP tetap ada bilah bawah panitia, karena area ini bagian dari aplikasi WAM di HP. Tampilan BOD tidak diubah.

| Menu | Rencana |
|---|---|
| Ringkasan | Kartu angka (sesi hari ini, permintaan menunggu, hadir) dan linimasa sesi hari ini per ruang, seperti bagian bawah acuan. |
| Sesi | **Tab Daftar dan Linimasa.** Aksi: **Buat sesi** (biru). |
| Permintaan jadwal | Kepala halaman dengan badge, lalu daftar kartu. |
| Peserta | Kartu orang seperti acuan, dengan pill status kuesioner atau kehadiran. Bisa diganti ke tabel, dan ada filter unit dan status. |
| Kebutuhan peserta | Kepala halaman dan toolbar, dengan filter level baca. |
| Pengumuman | Aksi: **Kirim pengumuman** (biru). |
| Survei | Tab per survei. |

Grup sidebar:
- **Ikhtisar:** Ringkasan.
- **Jadwal:** Sesi, Permintaan.
- **Orang:** Peserta, Kebutuhan.
- **Komunikasi:** Pengumuman, Survei.

Bagian bawah sidebar: Kembali ke aplikasi.

## 3b. Denah lebih visual (revisi 5 Nov)

Acuan: gambar denah "Select Seat" (WhatsApp 5 Nov 08.26). Desainnya ada di layar A7.

- **Gambar denah:** dinding tebal biru tua, lantai ruang biru muda, area non-booking abu, celah pintu, meja, dan kursi.
- **Kursi otomatis:** jumlah dan susunan kursi dibuat otomatis dari kapasitas dan pilihan susunan ruang.
  - **Meja rapat:** kursi di dua sisi panjang. Mulai 6 orang, ada juga satu kursi di tiap ujung.
  - **Kelas:** baris kursi menghadap layar di sisi utara.
  - **Lounge:** sofa.
- **Ruang dipilih:** diberi cincin biru dan tooltip gelap, mis. "Antareja · 4 kursi · kosong".
- **Panel samping:** tab Ruang utama / Ruang kecil / Area, daftar ruang, stepper kapasitas, dan pilihan susunan.
- **CFC Ananta Room dipindah:** sekarang ruang kecil, selebar Nagapadma, di bawah Nagapadma, dan batas bawahnya sejajar dengan Main Office di sebelah kirinya. Nagapadma dipendekkan supaya muat. Kapasitas 4 di desain hanya contoh; angka aslinya diisi admin.
  - Saat implementasi, ubah dua spot di `src/lib/pra-wam/floor-plan.ts`. Koordinatnya ditulis dalam koordinat HTML, yaitu sebelum diputar:
    - `nagapadma`: `{ x: 875, y: 710, w: 354, h: 125 }`. Setelah diputar: x 505, y 875, lebar 125, tinggi 354.
    - `ananta`: `{ x: 1235, y: 710, w: 240, h: 125 }`. Setelah diputar: x 505, y 1235, lebar 125, tinggi 240.
  - Spot lama Ananta menjadi lantai kosong.
- **Gaya hangat (revisi 2):**
  - lantai krem `#FFFBF4` di atas gedung `#F4EFE7`, dan latar `#FAF7F2`;
  - dinding `#3A3F4A` dengan sudut membulat, dan bayangan halus di ruang booking;
  - meja kayu `#D4A877`;
  - kursi lembut: utama `#7C9CC9`, kecil `#C9897A`, dipilih `#1551A0`; di Book, kosong `#7FB08F` dan terpakai `#C9C2B6`;
  - Communal Space dengan karpet, sofa, dan meja kopi; Pantry dengan meja bundar; tanaman di sudut dan lorong;
  - panggung kayu di Limasan;
  - kompas dengan jarum merah bata.
- **Layar M4 (HP, Book denah peserta):**
  - denah selebar layar dengan warna status per jam: kosong hijau, terpakai abu, dipilih biru dengan tooltip;
  - lembar bawah berisi tab jenis ruang, daftar ruang, dan tombol "Pilih …";
  - di ruang sempit, nama ditulis tegak atau dua baris, lalu kursinya digeser ke bawah.
- **Kolom Peran di tabel Akun:** hanya peran pertama yang tampil sebagai pill, sisanya diringkas jadi pill "+N". Daftar lengkapnya ada di tooltip.

## 4. Tahapan

Tiap tahap di-push sendiri dan dicek di production.

1. **Fondasi**
   - Komponen `console/*` beserta tesnya.
   - `WamAdminFrame` diganti `ConsoleShell`.
   - Semua halaman Admin WAM berganti kerangka saja: kepala halaman dan tab, datanya tetap.
2. **Admin WAM: Akun dan Ringkasan**
   - Kartu dan tabel, filter, dan tab Permintaan reset.
   - Linimasa Ringkasan.
3. **Admin WAM: sisanya**
   - Tab Ruang dan Kuesioner, Acara, Apa itu WAM.
4. **Kelola acara**
   - Sidebar desktop baru dan Ringkasan dengan linimasa.
   - Peserta sebagai kartu, Sesi dengan tab Linimasa, dan halaman lainnya dengan kepala halaman baru.
5. **Pengecekan**
   - Lebar 375 dan 1440.
   - Keyboard (tab, Ctrl K, Esc menutup laci dan popover).
   - Mode gelap Kelola acara, dan kontras ≥ 4.5:1.

## 5. Risiko dan catatan

- Sesi fork "WAM (fork)" masih aktif mengubah Kuesioner dan Kelola acara (Kebutuhan, Survei, Kamar). Supaya tidak saling timpa, tahap 3 (Kuesioner) dan 4 dikerjakan setelah sesi itu selesai, atau berkas yang disentuh dibagi lebih dulu.
- Tidak ada perubahan data atau migrasi, hanya tampilan. Linimasa memakai data booking dan sesi yang sudah ada.
- Rute lama tetap jalan. Menu "Permintaan reset password" menjadi tab, dan alamat lamanya diarahkan ke tab itu.
