# Aturan WAM (masa pembangunan)

Acuan supaya aplikasi WAM, Admin WAM, dan super admin tetap konsisten selama masih dibangun.
Isinya aturan yang **sudah diputuskan dan sudah ada di kode** sampai 6 Nov 2026.

- Bila isi dokumen ini bertentangan dengan rancangan lama (`rancangan-pra-wam.md`,
  `spesifikasi-build-pra-wam.md`, `rancangan-admin-wam.md`), **dokumen ini yang berlaku**. Rancangan
  lama tetap disimpan sebagai riwayat dan latar.
- Setiap keputusan baru: perbarui bagian yang sesuai di sini, lalu catat singkat di
  `D:\projects\brain\keputusan.md`.
- Gaya visual umum Werkudara ada di `design-system.md`; peta folder dan kode ada di `struktur-kode.md`.

---

## 1. Cara kerja selama pembangunan

| Aturan | Rinciannya |
| --- | --- |
| Rilis | Setiap perubahan di-push ke `docs/rancangan-pra-wam` **dan** `HEAD:main` (remote `guest-experience`). Selesai berarti ketiga deploy Vercel berstatus sukses, lalu diperiksa di https://journey.werkudara.group. |
| Migrasi | Berkas di `supabase/migrations/` bertanda `LOCAL REVIEW ONLY`; **pemilik yang menjalankan** di Supabase SQL Editor. Kode harus tetap jalan sebelum migrasi diterapkan: baca kolom baru dengan cadangan (kolom belum ada → baca tanpa kolom itu, fitur baru belum tampil), dan beri pesan "menunggu migrasi …" saat menyimpan. |
| Data produksi | Mengubah data produksi (peran, HOD, sapaan, booking uji) hanya dengan persetujuan eksplisit. Pemeriksaan baca-saja boleh lewat skrip sementara (`node --env-file=.env`), lalu skripnya dihapus. |
| Server lokal | Jangan `npm run build` saat `next dev` jalan (port 3000/3001). Periksa port dulu; kalau dipakai, lewati build dan andalkan build Vercel. |
| Pemeriksaan | Sebelum commit: `npx tsc --noEmit`, `npx eslint` untuk berkas yang diubah, dan `npx vitest run` untuk bagian yang disentuh. Kegagalan lama yang tidak terkait (mis. `trip.dom.test.tsx` yang bergantung tanggal) disebut apa adanya, tidak disembunyikan. |
| Login | Password akun sungguhan tidak pernah diketik oleh asisten. Halaman yang butuh login diperiksa oleh pemilik; yang tidak sempat diperiksa disebut "belum diverifikasi". |
| Commit | Bahasa Indonesia dengan awalan Conventional Commits (`feat:`, `fix:`, `docs:`, …), lihat `AGENTS.md`. |

## 2. Data dan privasi

- Repo ini **publik**. Data pribadi (Data karyawan, Excel HR, jenis kelamin per orang, password
  bawaan) tidak pernah masuk repo, migrasi, tes, atau dokumen. Migrasi hanya berisi skema; isi data
  per orang diisi lewat aplikasi atau skrip sementara yang tidak di-commit.
- Contoh di tes memakai nama rekaan ("Contoh Satu"), bukan nama karyawan.
- Berkas privat (kartu, bukti absen online, Panduan Umum WAM) ada di R2 privat dan hanya dibuka
  lewat aplikasi yang sudah login, tidak di `public/`.
- Password bawaan akun hanya ada sebagai rahasia server.

## 3. Data karyawan dan struktur organisasi

**Data karyawan adalah satu-satunya sumber orang** untuk semua aplikasi Journey (tabel `employees`).
Super admin memegangnya; Admin WAM hanya membaca.

| Hal | Aturan |
| --- | --- |
| Siapa mengatur apa | **Super admin** (Data karyawan → Ubah karyawan): BOD, Admin WAM, HOD departemen, lead BU, Business Unit, Atasan langsung, Jenis kelamin. **Admin WAM** (Akun dan peran): hanya mencentang **Panitia**; struktur tampil baca-saja dengan catatan "Diatur super admin di Data karyawan". Server menolak (403) admin biasa yang mencoba mengubah BOD, Admin WAM, HOD, atau lead BU. |
| HOD | Bukan peran yang dicentang. Seseorang HOD selama ia memimpin minimal satu departemen (`pw_leads`, jenis `departemen`). Boleh lebih dari satu departemen, dan boleh memimpin departemen di luar departemennya sendiri (mis. Sofyan: CoE dan Art & Creative Support). |
| Lead BU | Terpisah dari HOD (`pw_leads`, jenis `bu`), mis. Yulia: HOD BAS dan Maha Raja Pratama, lead BU MRP. Lead BU dihitung masuk BU yang ia pimpin (BU sendiri + BU yang dipimpin) di filter dan daftar. |
| BOD | Tidak boleh merangkap HOD, lead BU, Panitia, atau Admin WAM. Saat seseorang dijadikan BOD, kepemimpinannya dihapus lebih dulu. |
| Business Unit | Kode tetap: **MRP, WNS, TEE, NMU, WNN** (urutan ini dipakai untuk mengurutkan). Bawaan WNS. Kode office yang sama dengan BU ikut mengisi BU (Takshaka → TEE, Maha Raja Pratama → MRP). |
| Departemen | Nama departemen di Data karyawan. Label di layar: "Departemen", bukan "Unit". |
| Atasan langsung | Kolom `reports_to`, hanya untuk cabang di dalam tim. Kosong berarti tempat biasa: di bawah HOD departemennya. |
| Hapus karyawan | Lewat konfirmasi. Ditolak bila orangnya sudah punya data aplikasi (akun, booking, jawaban); pilihannya: nonaktifkan. |
| Daftar | Kolom: Karyawan · Departemen & jabatan (mis. "CoE as HOD", chip GA/Intern/Lead BU) · Business Unit · Kontak · Status · Aksi. Filter Departemen dan Business Unit; urut BU lalu nama. Tambah dan Ubah memakai **satu lembar** dengan satu tombol Simpan. |

**Tab Struktur** (dibangun dari Data karyawan saja, `src/lib/org.ts`):

1. BOD di atas (Pak Bagus, Managing Director; Pak Fadli, CEO).
2. Kantor direksi: orang di departemen BOD (Corporate, mis. Pak Adiel, Chief of Staff) dan siapa pun yang atasannya BOD.
3. Kartu per departemen, urut BU lalu nama: HOD-nya, termasuk HOD dari departemen lain (label "HOD · dari …"), lalu orang-orangnya sebagai pohon.
4. Sub-grup tanpa lead di departemen besar, dibaca dari kata di jabatan (`SUB_GROUPS`). Sekarang hanya Sales & Marketing: **Business Solutions**, **Creative & Content**, **Commercial** (aturan pertama yang cocok yang dipakai). Orang yang jabatannya tidak cocok tetap langsung di bawah HOD.

Sumber pengisian HOD 6 Nov 2026: halaman tim werkudara.com/team, dicek pemilik. Halaman itu lebih
lama dari Data karyawan, jadi **departemen tetap mengikuti Data karyawan**.

## 4. Nama dan sapaan

| Tempat | Yang tampil |
| --- | --- |
| Aplikasi peserta (`/wam`): nama rekan di mana pun (peserta booking, pemesan ruang, notifikasi, Rekan, daftar hadir, dokumen, ringkasan BOD) | **Nama panggilan**. Bila panggilan kosong: kata pertama nama lengkap. |
| BOD, HOD, dan lead BU | **"Pak/Bu" + nama panggilan**, otomatis dari Struktur. Pak/Bu dari Jenis kelamin (L/P) di Data karyawan; bila belum diisi, tanpa sapaan. HOD baru otomatis ikut. |
| Diri sendiri (sapaan Beranda, bilah atas) | Nama panggilan tanpa Pak/Bu. Profil tetap menampilkan nama lengkap. |
| Admin WAM, super admin, Data HR, kartu admin | **Nama lengkap**, supaya orangnya jelas. |

- Pencarian di pemilih peserta mencari nama panggilan dan nama lengkap.
- Inisial avatar mengabaikan Pak/Bu ("Pak Bagus" → "B…").
- Aturannya ada di `src/lib/pra-wam/call-name.ts` (`callName`); daftar orang server
  (`listPeople`) memberi `name` = nama panggilan dan `fullName` = nama lengkap. Tampilan admin wajib
  memakai `fullName`.

## 5. Peran dan hak akses

- Peran aplikasi: **peserta** (semua akun), **panitia**, **BOD**, **admin** (Admin WAM). HOD dan lead
  BU berasal dari Struktur, bukan peran.
- Hak akses selalu diperiksa di server. Tampilan hanya menyembunyikan; server tetap menolak.
- Admin WAM (`/admin/wam`) dibagi dua (8 Nov 2026): **tim CoE** mengatur akun dan Panitia, acara dan
  modul, Apa itu WAM, ruang dan denah, serta Akses MCP; **HR** khusus data kuesioner (Kuesioner:
  isi, progres, rekap, ekspor, Data HR, kamar). Super admin memegang data rahasia (Data karyawan,
  struktur, NIP) di `/admin/super/…` dan tidak ditampilkan dalam presentasi aplikasi.

## 6. Book ruang

| Hal | Aturan |
| --- | --- |
| Jam | Ruang kantor 07.00–22.00, Senin–Jumat, kelipatan 30 menit, paling lama 4 jam per booking, paling banyak 4 booking per orang per hari (`appraisalRules`). |
| Di luar kantor | Pilihan di dalam form booking (bukan di halaman Book). Tanpa ruang; nama tempat wajib; boleh akhir pekan, 00.00–23.30, dan lebih dari 4 jam; tempat tidak dikunci. |
| Partisipan | **Tanpa batas jumlah**: semua karyawan boleh diundang. "Pilih semua …" memilih semua yang tampil (semua departemen, satu departemen, atau hasil cari) dan bisa dibatalkan lagi; "Hapus semua pilihan" mengosongkan semuanya. Pemilih langsung terbuka di departemen pengguna. |
| Kecocokan ruang | Jumlah orang = pemesan + partisipan. Ruang punya kapasitas dan minimal orang (mis. Limasan 50, minimal 20), supaya rapat berdua tidak memakai ruang besar. Aturan yang sama dipakai form dan server (`src/lib/pra-wam/room-fit.ts`). |
| Melebihi kapasitas | Hanya **ruang terbesar** yang boleh diisi lebih dari kapasitasnya (mis. 56 orang di Limasan), dengan peringatan dan centang **"Ya, saya yakin"** sebelum simpan. Server menolak tanpa centang itu. Ruang lain yang terlalu kecil tetap tidak bisa dipilih. |
| Bentrok | Ruang yang keburu diambil: isian tetap tersimpan, lalu ditawarkan jam atau ruang lain. Partisipan yang sudah ada di booking lain: peringatan, lalu "Tetap simpan". |
| Booking = sesi | Setiap booking otomatis menjadi sesi terbit (agenda, Saya hadir, dokumen). Ubah atau batal lewat booking. |
| Sebagai HOD | HOD memilih "Booking sebagai: Pribadi \| HOD". Sebagai HOD, yang dipilih departemen, dan HOD departemen itu menjadi partisipan. Ruang langsung terkunci. HOD yang diundang menjawab **Terima/Tolak** di notifikasi atau detail booking. Ubah jam atau ruang berarti semua menjawab ulang; batal booking berarti meeting batal. Tidak ada menu atau tab Meeting HOD tersendiri. |
| Tampilan | Kalender hanya kalender; Denah hanya denah. Kartu ruang punya satu status: Kosong / Sisa X jam / Penuh / Sudah lewat. Desktop: Hari / Minggu / Bulan. Minggu = satu ruang, Senin–Jumat; tombol ruang turun baris, tidak boleh melebarkan kartu. Bulan = Minggu–Sabtu, per hari maks. 3 booking + "+N lagi", Semua ruang atau satu ruang; tanggal membuka harinya (data lewat `GET /api/wam/appraisal?from=&to=`, maks. 6 minggu). |
| Denah | Di dalam kotak hanya kursi; nama dan spesifikasi muncul saat diketuk (kartu tip yang bisa ditutup ×). Ruang aktif bergaris biru; yang tidak bisa dipilih pudar dan tidak bisa diketuk. Ketuk ruang lain untuk mengganti pilihan. Di desktop denah tampil melintang (landscape). Tanpa legenda dan tanpa indikator keterisian. |

## 7. Absen

- **Satu cara per sesi.** Sesi dari booking: hanya tombol "Saya hadir" (scan QR ditolak). Sesi buatan
  panitia: hanya scan QR ("Saya hadir" ditolak server).
- Jendela absen: 30 menit sebelum mulai sampai 30 menit setelah selesai.
- "Saya hadir · di kantor" langsung tercatat; "Saya hadir · online" wajib unggah tangkapan layar Zoom.
- BOD tidak absen. Daftar hadir diberi label cara absen: Scan QR, Saya hadir · di kantor,
  Saya hadir · online, Dicatat panitia.

## 7a. Notifikasi

- Setiap notifikasi di aplikasi (pengumuman, kabar sesi terbit/berubah/batal, Meeting HOD,
  pengingat kuesioner) tersimpan di daftar Notifikasi (lonceng) **dan** dikirim ke HP sebagai Web
  Push bagi orang yang mengaktifkannya (8 Nov 2026). Mengetuk notifikasi membuka halaman Notifikasi.
- Diaktifkan per HP di **Pengaturan → Notifikasi di HP** (Aktifkan, Kirim tes, Matikan). Satu orang
  boleh beberapa HP; HP yang dimatikan atau sudah tidak dikenal layanan push dihapus otomatis.
- Android (Chrome) dan browser desktop didukung. iPhone hanya iOS 16.4 ke atas dan hanya saat WAM
  dibuka dari ikon di layar utama, bukan dari Safari.
- Kirim push tidak pernah menggagalkan yang memicunya: tanpa kunci, sebelum migrasi, atau saat
  layanan push gagal, notifikasi di aplikasi tetap ada. Push dikirim setelah respons selesai.
- Kunci VAPID adalah rahasia server: `WAM_VAPID_PUBLIC_KEY`, `WAM_VAPID_PRIVATE_KEY` (opsional
  `WAM_VAPID_SUBJECT`), di `.env` lokal dan di Vercel. Tabel `pw_push_subscriptions` (migrasi
  202611080001). Mengganti kunci membuat semua HP harus mengaktifkan ulang.

## 8. Aplikasi peserta: tampilan dan interaksi

- **Rangka tetap, isi memuat di dalamnya.** Bilah atas, navigasi bawah, dan sidebar digambar sekali
  di `src/app/wam/(app)/layout.tsx`. Setiap layar punya `loading.tsx` (skeleton). Tab aktif dan
  tombol kembali dibaca dari alamat (`src/lib/pra-wam/screen.ts`), bukan diatur per halaman.
- Navigasi bawah: Beranda · Book · (+) Aksi cepat · Dokumen · Profil. BOD tanpa tombol +.
- Design system "Pra WAM · Hospitality": Poppins untuk judul dan angka, Inter untuk isi; biru
  Werkudara #006EC1 satu-satunya aksen utama, kuning #FFBA00 sekunder. Kartu putih radius 24, tombol
  pill, isian radius 16.
- **Sedikit kata.** Judul pendek; satu kalimat bantu bila perlu; tidak ada paragraf penjelasan di
  atas setiap layar. Keterangan detail muncul saat diketuk.
- Status tidak boleh hanya warna: selalu ada kata atau angka.
- Beranda (layar pertama, 8 Nov 2026): kepala di HP dua baris ringkas, "Selamat malam · Min, 8 Nov"
  kecil lalu nama lengkap tegas satu baris (dipotong … bila panjang); departemen dan jumlah sesi
  hanya di desktop. Kartu biru tidak menampilkan tombol yang belum bisa ditekan: sebelum absen
  dibuka cukup satu baris cara dan waktunya; tombol muncul saat absen dibuka.
- Notifikasi HP memakai ikon pegasus berwarna dan badge pegasus putih transparan
  (`/wam/badge-96.png`); badge Android harus transparan, kalau tidak tampil sebagai kotak putih.
- Tindakan yang berisiko (hapus, batal, melebihi kapasitas, bentrok) selalu lewat konfirmasi yang
  menyebut akibatnya; tindakan biasa tanpa konfirmasi.
- Isian tidak hilang saat terjadi galat; tombol simpan dikunci selama proses.
- Target sentuh minimal 44 px; label tersambung ke isian; galat berupa teks.

## 9. Admin WAM dan super admin: tampilan

- Keduanya memakai **bingkai konsol yang sama** (`src/components/console`: `ConsoleShell`,
  `PageHeader`, `PageTabs`, `StatCard`/`StatRow`/`Card`). Super admin: `SuperAdminFrame`, menu samping
  dikelompokkan Ringkasan · Orang · Acara · Keamanan.
- Dashboard hanya angka yang penting dan jalan pintas; detail ada di halaman masing-masing.
- Halaman dengan beberapa bagian memakai tab berupa tautan (`?tab=…`), mis. Data karyawan: Daftar
  karyawan · Struktur · Impor Excel.
- Tambah dan Ubah memakai satu lembar dari samping (desktop) atau bawah (HP), dengan satu Simpan.
  Yang dikirim hanya isian yang berubah (kosong, null, dan belum pernah diisi dianggap sama).
- Pelajaran CSS: elemen yang disembunyikan dengan `hidden` tetapi diberi `display` sendiri wajib
  punya aturan `[hidden] { display: none; }` (grup menu yang tidak menutup); satu nama kelas modul
  tidak dipakai untuk dua hal dalam satu berkas.

## 10. Kode

- Semua path dibangun lewat `src/lib/routes.ts` (tes menolak path tulis tangan).
- Aturan yang dipakai form dan server ditulis sekali sebagai fungsi murni di `src/lib/pra-wam/`
  (mis. `room-fit.ts`, `call-name.ts`, `org.ts`) dan dites di sana.
- Kode server di `src/lib/server/` (dengan `server-only`); data yang dibaca berkali-kali dalam satu
  permintaan dibungkus `cache()` (mis. `listPeople`, `listLeads`, `seniorIds`).
- Kolom baru selalu dibaca dengan cadangan sampai migrasinya pasti sudah diterapkan (lihat §1).

## Dokumen terkait

- `rancangan-pra-wam.md`: rancangan awal dan alasannya (riwayat).
- `spesifikasi-build-pra-wam.md`: spesifikasi build pertama (riwayat).
- `rancangan-admin-wam.md`: pola tampilan konsol Admin WAM dan Kelola acara.
- `rancangan-cerita-kita.md`: kuesioner, kartu, Data HR, kamar.
- `design-system.md`, `struktur-kode.md`.
