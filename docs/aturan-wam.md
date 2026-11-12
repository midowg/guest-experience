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
- **Email login = email di Data karyawan** (10 Nov 2026). Satu database: email yang diubah admin
  (Akun) atau super admin (Data karyawan) langsung ikut ke akun login. Login juga mencari akun lewat
  email Data karyawan, jadi orang tetap bisa masuk walau email akun loginnya masih yang lama, dan
  sesudah password benar email akun login ikut disamakan (`signInAddress`). Nama panggilan tidak
  dipakai untuk login.
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
| Ubah ruang (admin) | Admin WAM → Ruang dan denah → Ubah: **Nama ruang** bisa diganti (2–60 karakter, tidak boleh sama dengan ruang lain; booking lama ikut nama baru), kapasitas, minimal orang, fasilitas, Bisa dibooking, Khusus departemen, Spot di denah. Dibuka dari spot denah yang sudah berisi ruang: langsung mengubah ruang itu (tanpa dropdown pilih ruang); hanya spot kosong yang menanyakan "Taruh ruang di spot ini". |
| Tanggal lewat (catatan) | Sejak 10 Nov 2026 hari yang sudah lewat **di dalam periode** (mulai 28 Okt) bisa dibooking sebagai **catatan meeting yang sudah terjadi** (mis. evaluasi SM tanggal 2). Saat dipilih muncul konfirmasi "Tanggal sudah lewat · Ya, catat"; semua jam hari itu terbuka; bentrok ruang tetap dicek; **tidak ada undangan atau notifikasi**; Meeting HOD/Lead dan ITEM tidak tersedia (tidak ada yang bisa menjawab). Kalender Timeline yang diketuk di hari lewat membuka hari itu. Jam yang sudah lewat **hari ini** tetap tidak bisa (`isRecordDate`, `bookingClock`). |
| ITEM | "Booking sebagai: Pribadi \| HOD/Lead \| **ITEM**" (untuk HOD/Lead). ITEM = sinkronisasi antar departemen: pilih departemen lain, yang diundang **hanya HOD dan Lead** departemen itu (Terima/Tolak seperti Meeting HOD), nama kegiatan otomatis "ITEM: HRGA x CoE" dari singkatan departemen sendiri dan yang dipilih (`itemTitle`). Keluar dari ITEM mengembalikan nama sebelumnya. |
| Pemesan di Linimasa | Baris kedua item booking di Kelola acara → Jadwal sesi (Linimasa, tampilan Hari dan Minggu) dan Ringkasan: **singkatan departemen - nama panggil · jam** (mis. "SM - Raja · 11.00–12.30"), tanpa kata "Booking". Di tampilan Minggu ruangnya ditambahkan di belakang ("SM - Raja · 11.00–12.30 · GMSM Room"). Departemen satu kata tetap utuh (`bookerLabel`, `departmentShort`). |
| Ringkasan = Linimasa Hari | Kalender "Sesi hari ini" di Kelola acara → Ringkasan memakai isi yang sama dengan Linimasa · Hari untuk hari ini: semua sesi yang tidak batal (draf abu-abu, sesi yang melintas hari ikut), booking per ruang dengan baris "singkatan departemen - nama · jam". Judulnya membuka Linimasa · Hari. Angka "Sesi hari ini" tetap menghitung sesi terbit. |
| Export Linimasa | Tombol **Export** di Linimasa (panitia/admin): minggu atau hari yang sedang tampil, hanya sesi terbit yang punya jam. **PDF** (A4) dan **Excel** (satu baris per jam, dengan pemesan) diunduh; **Teks** untuk WhatsApp bisa diubah dulu, lalu Salin atau Kirim ke WhatsApp. Format teks: `meeting tanggal 10`, lalu `- Nama \| *Ruang* \| 11.00 - 12.30 (2 pax) & …` (singkatan departemen pemesan ditulis setelah nama kegiatan, mis. "Appraisal team SM", kecuali nama sudah berakhir dengan singkatan itu; nama dan tempat yang sama di hari itu digabung), diakhiri `update per dd/mm/yyyy HH.MM WIB`. Pax = jumlah peserta sesi (pemesan ikut). `GET /api/wam/sessions/export?format=pdf\|xlsx\|text&rentang=&tanggal=` (`src/lib/pra-wam/schedule-export.ts`). |
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

## 7b. Notulen (MoM)

Sejak 11 Nov 2026 (migrasi `202611110002_pw_session_minutes.sql`), aturan di `src/lib/pra-wam/minutes.ts`.

| Hal | Aturan |
| --- | --- |
| Wajib | Setiap meeting **terbit** dengan jam, **kecuali one-on-one** (2 orang atau kurang) dan **Acara**, wajib punya MoM setelah selesai. Yang tidak wajib tetap boleh diisi. |
| Siapa menulis | **Semua yang ikut meeting** (pemesan dan partisipan), juga panitia/admin. Yang menyimpan pertama tercatat sebagai pencatat (notetaker); perubahan berikutnya dicatat "diubah …". Bisa ditulis sejak meeting dimulai. |
| Isi | Di aplikasi (bukan berkas): **Ringkasan**, **Keputusan**, dan **Tindak lanjut** (tugas, PIC dari peserta meeting, tenggat, selesai/belum). Lampiran tetap lewat Materi sesi. |
| Siapa membaca | Yang ikut, panitia, BOD, admin, dan **HOD/Lead departemen pemesan** (untuk meeting dari booking). HOD/Lead itu bisa membuka detail meeting walau tidak ikut, hanya baca: absen, unggah, dan permintaan jadwal tetap hanya untuk peserta/panitia. |
| Tindak lanjut | Dicentang selesai oleh yang ikut meeting atau **PIC-nya**. |
| Tampil di | Detail sesi (panel Notulen); **Agenda**: kotak "Notulen belum diisi" berisi meeting milik orang itu yang sudah selesai tanpa MoM; **Jadwal sesi** (panitia dan BOD): kolom MoM sudah/belum; **Ringkasan** panitia: kartu "MoM belum masuk". |
| Sebelum migrasi | Panel bilang menunggu pembaruan sistem; tidak ada yang dihitung "belum". |

### MoM lewat Telegram (tahap 1, 12 Nov 2026)

Rancangan lengkapnya ada di `docs/rancangan-mom-telegram.md`. Tahap 1 memakai migrasi `202611120002_pw_telegram.sql` (belum dijalankan).

| Hal | Aturan |
| --- | --- |
| Bot | Satu bot untuk semua grup: **WAM Werkudara** (`@wam_werkudara_bot`). Token hanya di environment server (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`); rahasia webhook diturunkan dari token. |
| Grup | Satu grup per departemen Data karyawan ("Werkudara {singkatan} · {departemen}") dan satu **grup HOD** bersama. Satu departemen hanya punya satu grup aktif; memasang grup baru melepas yang lama. |
| Memasang | Admin WAM → **Telegram** (semua admin): Pasang webhook sekali, lalu **Pasang grup** per baris. Hasilnya tautan sekali pakai yang berlaku 30 menit dan menambahkan bot dengan hak admin. Untuk grup yang sudah berisi bot, kirim perintah `/start@wam_werkudara_bot {kode}` di grup itu. |
| Topik | Grup yang memakai Topics mendapat topik **📝 MoM** buatan bot (perlu hak Kelola topik). Ubah grup ke supergroup dan nyalakan Topics **sebelum** dipasang, karena ID grup berubah saat itu. |
| Pesan | Satu pesan per MoM, bisa dibaca tanpa membuka WAM dan netral saat diteruskan (tanpa "kamu"). Departemen ditulis lengkap, ada baris versi, dan panjangnya dibatasi 3.900 karakter (tindak lanjut didahulukan). Aturannya di `src/lib/pra-wam/minutes-message.ts`. |
| Uji | **Kirim contoh MoM** mengirim MoM bertanda UJI COBA ke grup itu. Kiriman MoM sungguhan dari panel Notulen menyusul di tahap 2. |

## 7a. Notifikasi

- Setiap notifikasi di aplikasi tersimpan di daftar Notifikasi (lonceng). Ke HP (Web Push) hanya
  **topik penting**, supaya tidak jadi spam, termasuk untuk atasan (8 Nov 2026). Mengetuk notifikasi
  membuka halaman Notifikasi. Aturannya di `src/lib/pra-wam/push.ts` (`pushTopicInfo`, `shouldPush`):

  | Topik | Ke HP | Bisa dimatikan |
  | --- | --- | --- |
  | Pengumuman panitia | selalu | tidak |
  | Meeting HOD (undangan perlu dijawab, pindah, tolak, batal, terjadwal) | ya | ya |
  | Sesi dari panitia (forum dan sesi baru, pindah, batal) | ya | ya |
  | Booking yang kamu ikuti pindah atau batal **kurang dari 24 jam** sebelum mulai | ya | ya |
  | Undangan booking baru (ditandai di booking ruang) | **tidak**, lonceng saja | bisa dinyalakan |
  | Jawaban permintaan jadwal | ya | ya |
  | Pengingat kuesioner | ya | ya |

  Booking yang pindah atau batal lebih dari 24 jam sebelumnya tidak dikirim ke HP. **Jam tenang**
  21.00–06.00 WIB: topik yang tidak mendesak (sesi panitia, undangan booking, jawaban permintaan,
  kuesioner) tidak dikirim ke HP. Kabar baru tentang sesi atau Meeting HOD yang sama **menggantikan**
  notifikasi sebelumnya di HP (tag `sesi-…`, `hod-…`), tidak menumpuk. Pilihan per orang ada di
  Pengaturan → Notifikasi (tabel `pw_notification_prefs`, migrasi 202611080002). Topik ditampilkan
  per peran: "Notifikasi yang muncul di HP" untuk semua, lalu **Khusus HOD** (Meeting HOD) hanya untuk HOD.
  Peserta dan panitia tidak melihat topik Meeting HOD (`pushTopicInfo[...].only`).
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

- **Tema dan mode** (9 Nov 2026). Ada dua tema, masing-masing punya mode terang dan gelap:
  **Dream Out Loud** (tema Pra WAM 2026: langit malam navy, lavender sebagai warna utama, emas
  sebagai warna kedua, teks krem, judul Lora serif, bintang halus di latar dan kartu utama) dan
  **Werkudara** (biru perusahaan, tampilan sebelumnya).
  - Tema berlaku untuk semua orang dan dipilih admin di Admin WAM → Tema aplikasi
    (`pw_app_settings.theme`, migrasi 202611090001). Bawaannya Dream Out Loud. Kalau migrasi belum
    jalan atau database gagal dibaca, aplikasi tetap terbuka dengan tema bawaan.
  - Mode tetap pilihan masing-masing di Pengaturan → Tampilan (cookie `wam_theme`). Bawaannya
    **Gelap**, karena tema Pra WAM berangkat dari mimpi di malam hari.
  - Warna hanya lewat token `--pw-*`. Tema Dream Out Loud diatur di `[data-wam-look="dream"]` pada
    `pra-wam.module.css`. Setiap token ditulis di setiap blok, dan dua blok gelapnya harus sama.
    Teks di atas warna utama memakai `--pw-on-primary`, bukan `#fff`.
- **Pengaturan berupa menu** (9 Nov 2026). Halamannya berdiri sendiri: ada judul "Pengaturan" dan
  bilah bawah, tanpa panah kembali dan tanpa kartu profil (Profil dibuka lewat foto di atas Beranda).
  - Kelompok menunya: **Aplikasi** (Install WAM, Notifikasi, Tampilan), **Akun** (Ganti password),
    **Khusus BOD** (Akses MCP) dan **Bantuan** (Apa itu WAM?, Tentang aplikasi), lalu Keluar.
  - **Install WAM** (sheet "Cara install WAM") berisi cara install WAM, bergambar, per perangkat dan browser:
    - iPhone: Safari dan Chrome.
    - Android: Chrome dan Samsung Internet.
    - Laptop: Chrome, Edge, dan Safari Mac.
    Setelah itu ada cara menyalakan notifikasi, termasuk jalan keluarnya kalau terblokir. Panduan
    langsung terbuka di perangkat yang sedang dipakai. Kalau browser menawarkan pemasangan
    (`beforeinstallprompt`), muncul tombol "Install sekarang". Langkahnya ada di
    `src/lib/pra-wam/install.ts`.
  - Setiap langkah mengikuti halaman bantuan resmi Apple, Google, Microsoft, dan Samsung (versi
    bahasa Indonesia, dicek 9 Nov 2026; daftar sumbernya ada di kepala berkas). Nama menu memakai
    nama resmi itu, dengan nama Inggris dalam kurung.
  - Samsung tidak memberi nama menu berbahasa Indonesia, jadi gambarnya memakai "Home screen".
  - Bagian gambar yang tidak terverifikasi dibuat batang abu-abu, bukan teks karangan.
  - Periksa ulang langkah-langkahnya setiap ada versi iOS atau Chrome besar.
  - **Akses MCP khusus BOD.** Di aplikasi hanya muncul di Pengaturan milik BOD (kelompok "Khusus
    BOD"), tidak di Ringkasan BOD dan tidak untuk peran lain. Pemberian dan pencabutan akses ada di
    Admin WAM → Akses MCP (`mayUseMcp`).
  - Tiap baris pendek: ikon, nama, dan keadaan sekarang (misalnya "Aktif di HP ini" atau "Gelap").
  - Diketuk, detailnya muncul di `Sheet`: dari bawah di HP, panel dari kanan di desktop. Menunya
    sama di HP dan desktop.
  - Alamat mengikuti sheet yang terbuka (`#install`, `#notifikasi`, `#tampilan`, `#password`, `#mcp`, `#tentang`). Tombol Back
    menutupnya.
  - Pengingat "masih memakai password awal" **hanya** ada di dalam Ganti password, di bawah
    formulir. Tidak ada di baris menu atau di Profil.
  - Penjelasan tiap sakelar cukup satu kalimat pendek: kapan notifikasi itu datang. Kalau bawaannya
    mati atau tidak bisa dimatikan, sebutkan.

- **Rangka tetap, isi memuat di dalamnya.** Bilah atas, navigasi bawah, dan sidebar digambar sekali
  di `src/app/wam/(app)/layout.tsx`. Setiap layar punya `loading.tsx` (skeleton). Tab aktif dan
  tombol kembali dibaca dari alamat (`src/lib/pra-wam/screen.ts`), bukan diatur per halaman.
- Navigasi bawah (9 Nov 2026): Beranda · Book · Timeline · Dokumen. Tidak ada tombol + (Aksi cepat):
  absen ada di Beranda, Book punya menunya sendiri. Tidak ada menu Profil: dibuka lewat foto di atas
  Beranda (HP) atau nama di kanan atas (desktop). Menu BOD tidak berubah (Ringkasan, Agenda, Peserta,
  Survei, Profil).
- **Timeline** (`/wam/timeline`, susunan sejak 11 Nov 2026): kalender bulanan (Senin di depan, ‹ ›
  antarbulan) berisi forum dan acara Pra WAM dari Kelola acara → Jadwal sesi, masing-masing **garis
  warna saja** (di semua ukuran layar) sepanjang tanggalnya, bertumpuk di lajur masing-masing. Nama dan
  tanggalnya ada di **legenda** di bawah kalender (hanya kegiatan di bulan yang tampil; "Sedang
  berlangsung"/"Selesai"). Draf hanya rentang rencana; rapat (booking) dan yang batal tidak masuk.
  Daftar bergaris (rail) di bawah kalender sudah tidak ada.
  Di bawah kalender (desktop: di kanannya) tampil **kartu ruang untuk tanggal yang dipilih**, awalnya
  hari ini; mengetuk tanggal mengganti daftarnya. Kartu mengikuti desain panitia: nama ruang dan tombol
  **Book**, kapasitas, bar jam buka 07.00–22.00 ("Sisa X jam" lalu tiap booking sebagai blok sendiri;
  "Penuh", "Sudah lewat", "Tutup akhir pekan"), lalu daftar booking hari itu dengan jam dan pemesan
  ("Sofyan +3"; sesi panitia "Panitia"). Yang tampil: ruang yang bisa dibooking dan ruang lain yang
  dipakai hari itu (`roomCards`, `src/lib/pra-wam/room-card.ts`; data `GET /api/wam/appraisal?date=`,
  jumlah peserta lain `others` dikirim ke semua orang, nama peserta tetap tidak). **Book** membuka
  form booking di atas halaman pada tanggal dan ruang itu (`book-form?date=&room=`); setelah tersimpan
  kartunya dibaca ulang. Tanpa tombol Book bila Book ditutup admin atau tanggal di luar periode.
  Kartu ruang yang sama juga tampil di **form booking, langkah Kapan** ("Jadwal ruang · tanggal"), ikut
  berganti saat tanggal diganti, tanpa tombol Book (ruang tetap dipilih di langkah Tempat), supaya
  tidak perlu kembali ke Timeline untuk melihat ruang yang sudah terpakai (`RoomCardList`).
  Periode booking 28 Okt–29 Des 2026 (`appraisalRules.periodEnd`).
- **Agenda** (menu bilah bawah, dulu "Book"; 9 Nov 2026): tanpa kalender dan tanpa denah. Isinya
  tombol Book ruang dan daftar Booking saya. Tanggal dipilih di kalender Timeline atau di form;
  ketersediaan ruang terlihat di langkah Tempat pada form.
- **Booking terbuka di atas halaman** (BookSheet): dari kanan di desktop, dari bawah di HP, dari
  kalender Timeline maupun Book ruang dan Ubah di Agenda; tidak pindah ke menu lain. Datanya dari
  `GET /api/wam/book-form?date=` atau `?edit=`. Setelah disimpan, sheet itu bilang tersimpan dengan
  Tutup dan Book lagi. Halaman `/wam/book/new` tetap ada untuk tautan langsung.
  Langkah Kapan: dari Timeline memakai baris tanggal dengan tanggal yang diketuk sudah terpilih;
  dari Agenda (yang tidak punya kalender) memakai kalender bulan. Akhir pekan yang dipilih
  otomatis menjadi Di luar kantor. **Nama kegiatan dipilih dari dropdown**: "Dari Timeline" (yang
  berlangsung di hari itu lebih dulu) lalu "Lainnya" (nama umum dan yang sering dipakai).
- **Ruang dan denah, diatur admin sendiri** (10 Nov 2026): Admin WAM → Ruang dan denah punya
  **Tambah ruang** (nama dan jenis; ruang baru belum bisa dibooking sampai diatur) dan, di editor
  ruang, **Khusus departemen** (centang departemen; tanpa centang = semua). Ruang khusus tampil
  "Khusus …" dan tidak bisa dipilih bagi departemen lain, dan server menolak booking-nya
  (`roomKeptFrom`, `pw_rooms.departments`, migrasi 202611100001). Departemen orang = departemen Utama
  dan pekerjaan lainnya (`employee_jobs`).
- **Fitur panitia hanya di Kelola acara** (9 Nov 2026): di aplikasi peserta tidak ada lagi Ubah
  sesi, QR dan daftar hadir, atau unggah dokumen untuk panitia. Detail sesi membawa alat panitia
  hanya bila dibuka dari Kelola acara (`?dari=kelola`, `praWamPath.managedSession`). Unggah dokumen
  umum dan materi sesi ada di Kelola acara → Dokumen (`/wam/manage/documents`).
- **Pekerjaan karyawan** (Data karyawan → Ubah karyawan, 9 Nov 2026): satu kartu per pekerjaan,
  urut Business Unit → Departemen → Posisi (HOD | Lead | Jabatan; Jabatan memilih "Di bawah" HOD
  atau Lead departemen itu). Kartu pertama Utama (disalin ke kolom `employees`); Tambah pekerjaan
  untuk posisi di BU lain. HOD/Lead tidak lagi di bagian terpisah; `pw_leads` diselaraskan dari
  kartu. Tabel `employee_jobs` (migrasi 202611090003; sebelum jalan hanya Utama yang tersimpan).
- **Agenda (Booking saya)**: tanggal terbaru di atas, yang lama di bawah (9 Nov 2026).
- **Kalender bulan di sheet booking** (dibuka dari Agenda) sama dengan kalender Timeline: garis
  forum/acara berwarna, bukan titik ketersediaan; mengetuk tanggal memilihnya (tanggal lewat atau di
  luar periode tidak bisa). Komponen bersama `TimelineMonth`.
- **Dari Timeline**, baris tanggal di sheet langsung menampilkan tanggal yang diketuk di tengah
  (DateStrip menggulir lagi saat sheet terbuka).
- **Sesi yang sudah lewat** tetap bisa dipilih di Nama kegiatan (grup "Sudah lewat"), setelah
  konfirmasi "Sesi sudah lewat · Tetap pilih".
- **Beranda**: kartu kabar di bawah carousel hanya pengumuman panitia; kabar sesi (agenda) tetap di
  lonceng.
- **Yang dibatalkan**: kabar pembatalan tidak tampil di kartu kabar Beranda; booking dan sesi yang
  dibatalkan (7 hari ke belakang ke depan) tampil di daftar Agenda, redup dan dicoret, bertanda
  "Dibatalkan", tidak bisa dibuka.
- **Meeting HOD juga untuk Lead**: Lead setara HOD untuk meeting ini. Pilihan "Booking sebagai"
  menjadi Pribadi | HOD/Lead; mengundang departemen berarti mengundang HOD dan Lead-nya.
- **Denah**: ruang 20 adalah **Mushola**; **Limasan** adalah pendopo di teras kayu di atasnya (dekat
  sungai), kunci `limasan` tetap sehingga ruang Limasan di database ikut pindah (9 Nov 2026).
- **Tile tanpa arsiran kiri**: tile (Booking saya, Kebutuhan, kutipan Survei, blok jadwal) memakai
  outline tipis di keliling tile dengan warna jenisnya, bukan garis tebal di sisi kiri. Booking
  milik sendiri bernada emas hangat.
- **Kegiatan di form booking**: forum dan acara Timeline jadi pilihan nama kegiatan ("Dari
  Timeline"), yang tanggalnya mencakup hari booking lebih dulu, kalau tidak ada yang berikutnya.
  Nama lain tetap bisa diketik.
- **Beranda: agenda berupa carousel** (9 Nov 2026), satu kartu per agenda urut waktu, terbuka di
  yang sedang berlangsung atau berikutnya (dengan absen di kartunya). Geser ke kiri untuk yang
  sudah lewat (sampai 7 hari ke belakang), ke kanan untuk yang akan datang; di desktop ada ‹ ›.
  Kartu selebar penuh; bayangan halus di tepi kiri atau kanan menandakan masih ada kartu ke arah
  itu. Di atasnya hanya tiga titik: yang menyala di tengah selama ada kartu di kedua arah,
  di ujung kiri pada kartu pertama dan ujung kanan pada kartu terakhir; titik di sebelahnya
  memindah kartu. Judul "Agenda" di kiri, titiknya kecil di pojok kanan; tanpa hitungan atau
  tombol Jadwal sesi. Kartu yang sudah lewat lebih redup.
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
- **Daftar Acara admin Journey (`/admin`), bagian Aplikasi** (10 Nov 2026): di atas Tayang/Draf, satu bagian
  "Aplikasi" untuk aplikasi mandiri di luar acara, masing-masing kartu seperti kartu acara dengan warna dan
  ikonnya sendiri: **WAM 2027** (fase, permintaan reset password, Kelola WAM / Buka aplikasi), **Booking Kantor**
  (`/booking`, Kelola booking), **TV Announcement** (`/tv`, Atur TV: alamat tiap TV, jadwal ruang, gambar dan
  durasinya, mode, QR), dan panduan **Your Visit** (`/your-visit`). Menggantikan judul "Your Visit" dan kartu WAM
  di atas daftar (`standaloneApps`).
- Halaman dengan beberapa bagian memakai tab berupa tautan (`?tab=…`), mis. Data karyawan: Daftar
  karyawan · Struktur · Impor Excel.
- Tambah dan Ubah memakai satu lembar dari samping (desktop) atau bawah (HP), dengan satu Simpan.
  Yang dikirim hanya isian yang berubah (kosong, null, dan belum pernah diisi dianggap sama).
- Pelajaran CSS: elemen yang disembunyikan dengan `hidden` tetapi diberi `display` sendiri wajib
  punya aturan `[hidden] { display: none; }` (grup menu yang tidak menutup); satu nama kelas modul
  tidak dipakai untuk dua hal dalam satu berkas.

## 9a. TV Announcement

TV kantor menayangkan kalender ruang (hari ini dan minggu ini) dan gambar pengumuman, bergantian (10 Nov 2026).
Diatur di **Admin WAM → TV Announcement**; migrasi `202611100003_pw_tv.sql`.

| Hal | Aturan |
| --- | --- |
| Alamat umum | `/tv` saja menayangkan papan yang sama untuk TV mana pun, tanpa login dan terbuka. TV yang memakainya tidak tercatat di daftar TV (admin tidak tahu TV mana yang menyala); untuk itu beri TV alamat sendiri. Gambarnya lewat `/api/tv/image/…`, jadi `image` tidak boleh jadi alamat TV. |
| Alamat TV | Tiap TV bisa punya alamat pendek sendiri yang dipilih admin, `/tv/{alamat}` (mis. `/tv/lobi`): huruf kecil, angka, dan tanda hubung, 2–40 karakter, unik (migrasi `202611100004_pw_tv_slug.sql`). **Tanpa login dan terbuka** (keputusan pemilik, 10 Nov 2026): siapa pun yang tahu atau menebak alamatnya melihat kalender ruang, termasuk nama kegiatan dan pemesan. Karena itu papan tidak boleh memuat lebih dari yang tertulis di baris Kalender. Alamat bisa diganti di admin (alamat lama langsung mati); **Hapus TV** mematikan alamatnya. TV buatan sebelum migrasi ini tetap tayang di tautan kunci panjangnya (`tv_…`, hanya sha256 yang disimpan). Paling banyak 10 TV. |
| Hitung mundur | Di kepala kalender TV (hari ini dan minggu ini), di antara tanggal dan jam, sejak 10 Nov 2026 atas permintaan panitia: kegiatan Pra WAM dari Timeline yang sedang berjalan dan **berakhir X hari lagi** (yang berakhir paling akhir, mis. "Appraisal: isi form & 1-on-1 berakhir 10 hari lagi · Jum, 20 Nov"), atau bila tidak ada yang berjalan, yang berikutnya **mulai X hari lagi**; "besok" dan "hari ini" di hari terakhir. Hanya nama dan tanggal kegiatan (papan terbuka). Di TV tegak menggantikan baris ringkasan di bawah tanggal. Tidak tampil di aplikasi peserta (keputusan pemilik). `timelineCountdown`, `TvFeed.countdown`. |
| Isi | **Sama di semua TV.** Urutannya: kalender hari ini, kalender minggu ini, lalu gambar sesuai urutan di admin, lalu mengulang. Tiap kalender bisa dimatikan dan punya durasi sendiri (5–120 detik). |
| Daftar tayangan | Sejak migrasi `202611100007_pw_tv_playlist.sql` semua yang ditayangkan adalah baris di `pw_tv_items`, dengan urutan bebas, durasi sendiri, dan bisa disembunyikan tanpa dihapus. Jenisnya: template yang datanya dari WAM (**Kalender hari ini**, **Kalender minggu ini**, **Timeline Pra WAM**, **Pengumuman panitia**; masing-masing paling banyak satu), **Teks** yang diketik admin, dan **Gambar**. Migrasi mengisi daftar dari pengaturan saat itu, jadi TV menayangkan hal yang sama seperti sebelumnya. Sebelum migrasi, TV tetap memakai urutan lama (kalender lalu gambar) dan halaman Tayangan menampilkan pengaturan lama (`playlistOf`). |
| Jadwal dan TV per baris | Tiap baris boleh dibatasi tanggal (mulai/sampai, WIB), jam (dari/sampai, boleh melewati tengah malam; jam "sampai" sudah di luar), dan TV tertentu (tanpa centang = semua TV). Baris untuk TV tertentu **tidak** tayang di alamat umum `/tv` dan di Pratinjau. Aturannya satu fungsi murni, `itemShows`, dipakai server tiap kali TV bertanya. Menghapus TV melepasnya dari baris-barisnya; baris yang hanya untuk TV itu dimatikan, bukan ditayangkan di semua TV. |
| Template dari WAM | **Timeline**: forum dan acara dari Kelola acara yang sedang berjalan dan berikutnya (nama, tanggal, jam bila sudah ada, hitung mundur). **Pengumuman**: hanya pengumuman panitia yang dikirim ke **semua peserta**, empat terakhir dalam dua minggu; pengumuman untuk unit, sesi, atau orang tertentu tidak pernah tampil, karena alamat TV terbuka. |
| Sambutan tamu | Sejak migrasi `202611100008_pw_tv_welcome.sql` (tahap 1, 10 Nov 2026). Dua jenis baris: **Sambutan tamu** (`sambutan`, template, paling banyak satu) mengambil **Kunjungan Kantor yang sudah terbit dan harinya hari ini (WIB)** dari Journey, satu tayangan per kunjungan (paling banyak 6), dan dilewati bila hari itu tidak ada kunjungan; **Sambutan tamu (diketik)** (`tamu`) untuk tamu tanpa halaman kunjungan: nama tamu dan ucapan, dijadwalkan seperti baris lain. Yang tampil **hanya** nama tamu (judul kunjungan), ucapan, foto sampul, jam, dan tempat (keputusan pemilik); itu juga yang dibuka halaman `/welcome/{slug}`-nya sendiri. Dibaca dengan klien publik (hanya yang terbit), `boardWelcomes`. Alamat TV terbuka, jadi template ini ditambahkan admin dengan sadar bahwa nama tamu terlihat. |
| Desain sambutan | Tiap baris sambutan (`sambutan` dan `tamu`) punya **desain layar** (11 Nov 2026, migrasi `202611100009_pw_tv_design.sql`; kolom `design`): **Werkudara** (bawaan): papan selamat datang kantor dari "Welcome Sign Template.pptx" (latar biru bermotif, logo, WELCOME, empat lini bisnis, werkudara.com) sebagai satu gambar, `public/wam/tv-welcome-werkudara.webp` (`TV_WELCOME_ART`; bukan di `public/tv`, karena alamat di bawah `/tv/` dijawab halaman TV), dengan nama tamu ditulis di ruang kosong tengahnya, lalu ucapan (yang diketik) atau jam dan tempat (kunjungan). Gambarnya selalu utuh 16:9; di TV tegak ia berada di tengah di atas biru yang sama. **Foto sampul kunjungan**: foto sampul digelapkan di belakang tulisan (hanya untuk template kunjungan). **Polos**: warna tema TV. Dipilih di Atur → Desain layar; pratinjau kartu mengikutinya. Sebelum migrasi semua sambutan memakai Werkudara dan pilihan lain menunggu migrasi. PPT itu hanya berisi satu desain. |
| Video YouTube | Jenis baris `video` (11 Nov 2026, migrasi `202611100010_pw_tv_video.sql`): admin menempel alamat video YouTube (watch, youtu.be, shorts, embed; `youtubeId`), yang disimpan hanya id-nya (`body`) dan namanya (`title`). TV memutarnya di pemutar YouTube sendiri (`youtube-nocookie.com`) selayar penuh, **tanpa suara** (browser hanya mau memutar sendiri bila tanpa suara), sampai selesai, lalu lanjut; pemutar memberi tahu saat selesai atau gagal (`VideoSlide`), dan video yang tidak pernah memberi tahu ditinggalkan setelah 30 menit. Video yang satu-satunya di daftar mengulang. Durasi baris tidak dipakai. Di HP hanya gambar diam dan tautan ke YouTube. TV harus tersambung ke internet dan bisa membuka YouTube. Sebelum migrasi, video tidak bisa ditambahkan. |
| Video dari berkas, dan TV tanpa video | Baris `video` juga bisa berupa **berkas yang diunggah** (11 Nov 2026): MP4 atau WebM, paling besar 200 MB, diunggah dua langkah langsung ke R2 seperti gambar (`/api/admin/wam/tv/videos/start` dan `/confirm`; dikenali dari byte awalnya, `sniffVideo`). `body` barisnya menyimpan letaknya di penyimpanan (`pra-wam/tv/video-…`), yang tidak pernah dikirim ke TV: TV meminta `/api/tv/video/{id}`, yang mengalihkan ke alamat sementara di penyimpanan (6 jam; hanya untuk baris yang tayang atau sedang mengambil alih). Diputar tanpa suara sampai selesai lalu lanjut; berkas yang gagal diputar dilewati. Menghapus barisnya menghapus berkasnya. **Per TV** (migrasi `202611100011_pw_tv_plays_video.sql`, kolom `plays_video`): di Layar TV tiap TV punya tombol "Video: diputar / dilewati"; TV yang melewati video tidak menerima baris `video` sama sekali (YouTube maupun berkas). Alamat umum `/tv` selalu memutar video. Sebelum migrasi semua TV memutar video. |
| Layar tunggu | `TvLoader` (11 Nov 2026): biru papan selamat datang, logo Werkudara (`TV_MARK`, dipotong dari biru itu) di atas cakram terang, cincin tipis berputar, dan satu baris keterangan; tanpa gerak bagi yang meminta gerak dikurangi. Tampil (1) **di atas video sampai video benar-benar berputar**, sehingga tombol play dan poster bawaan pemutar tidak pernah terlihat, dan (2) sekitar dua detik saat **Tayangkan sekarang mulai atau selesai** di TV itu (`TvFeed.takeover`). Video dibisukan lewat kode (React tidak menulis atribut `muted` yang dicari browser) dan disuruh putar berulang tiap tiga detik sampai jalan, juga lewat perintah ke pemutar YouTube; `play()` yang tidak mengembalikan apa pun (browser TV lama) ditangani. Video yang tidak mulai dalam 25 detik dilewati; bila ia satu-satunya tayangan (mis. sedang mengambil alih), layar tunggu menulis "TV ini belum bisa memulai video sendiri" dan terus mencoba. |
| Ucapan ulang tahun | Jenis baris `ultah` (11 Nov 2026, migrasi `202611100012_pw_tv_birthday.sql`), meniru kartu ulang tahun tim (Canva "WG Bday", flyer tegak): kertas krem, logo Werkudara, nama dengan tanggal dan bulan di sampingnya, foto dalam bingkai putih, "Happy Birthday, {panggilan}", ucapan, dan "Werkudara Group \| werkudara.com". Di TV mendatar foto di kiri dan tulisan di kanan; di TV tegak urutannya seperti kartu aslinya. `title` = nama lengkap, `body` = ucapan (bawaan: ucapan di kartu tim, `TV_BIRTHDAY_WISH`), `extra` = `{call, date}`, `slide_id` = foto (opsional; tanpa foto bingkai berisi logo). Ditambahkan di Tambah tayangan → Ulang tahun; otomatis **dijadwalkan pada tanggal ulang tahunnya tahun ini** (bisa diubah di Atur). Foto dipilih langsung di form Tambah tayangan → Ulang tahun (dipotong saat dipilih, pratinjau menampilkannya; ucapan dibuat dulu lalu fotonya disimpan) atau diganti lewat Atur (`uploadSlide(file, itemId)`; foto lama dihapus setelah diganti). Hiasan bunga dan tekstur kertas di kartu Canva **tidak** disalin (itu aset stok Canva); yang ditiru hanya susunan dan warnanya. Nama dan foto karyawan tampil di alamat TV yang terbuka: itu keputusan admin yang menambahkannya. |
| Ucapan ulang tahun: kartu dan potong foto | Templatnya dirombak mengikuti kartu jadi tim (11 Nov 2026): kertas terang, nama serif tebal (Playfair Display 800) dengan "Birthday" biru miring di bawahnya, tanggal besar dan bulan huruf besar ("11", "NOV"), bingkai abu berisi panel biru, "Happy Birthday {panggilan}" dan ucapan miring (Cormorant Garamond), ranting bunga putih yang digambar sendiri (`Sprig`; bunga di kartu Canva adalah aset stok dan tidak disalin). **Potong orang otomatis**: saat foto diunggah, browser admin memotong orangnya dari latarnya (`cutOutPerson`, MediaPipe Image Segmenter `@mediapipe/tasks-vision` 1.2.2, Apache-2.0; program wasm dari jsDelivr dan model `selfie_multiclass_256x256` dari penyimpanan Google diunduh saat dipakai; **fotonya tidak dikirim ke mana pun** selain ke penyimpanan Journey), dipangkas ke orangnya, disimpan sebagai WebP transparan, dan ditandai `extra.cut`. Foto yang sudah tanpa latar dipakai apa adanya. Bila pemotong gagal dimuat atau orangnya tidak dikenali, foto disimpan utuh dan admin diberi tahu. Foto terpotong berdiri di depan bingkai (kepala melewati tepi atas, seperti di kartu); foto utuh mengisi panel biru. |
| Ucapan ulang tahun: kartu tim sebagai latar | Sejak 11 Nov 2026 (keputusan pemilik: "pakai kartu jadi dulu") tayangan ulang tahun **memakai kartu tim itu sendiri**: `public/wam/tv-bday-card.webp` (`TV_BIRTHDAY_CARD`, 1131×1600) adalah kartu jadi tim yang dikosongkan (nama, tanggal, orang, dan ucapan dihapus; kertas, logo, tulisan "Birthday", bingkai, panel biru, bunga, dan kaki kartu tetap), dan `tv-bday-flowers.webp` (`TV_BIRTHDAY_FLOWERS`) bunga yang berada di depan orangnya. Kartu tampil **utuh dan tegak di tengah layar apa pun** di atas warna kertasnya (di TV mendatar ada ruang kertas di kiri-kanan). Nama (Playfair Display 800), tanggal dan bulan, orang yang sudah dipotong (kaki di tepi bawah panel, kepala melewati bingkai, di belakang bunga), "Happy Birthday …", dan ucapan (Cormorant Garamond miring) diletakkan di posisi kartu aslinya, dalam persen ukuran kartu dan `cqh`. Gambar sumbernya JPEG 1131 px, jadi tidak setajam ekspor Canva; bila tim mengekspor kartu kosong sebagai PNG, cukup ganti kedua berkas itu. Baris "kartu dan potong foto" di bawah menjelaskan pemotongan foto; susunan mendatar dan ranting gambar sendiri di baris itu sudah tidak dipakai. |
| Tayangkan sekarang | Satu baris mengambil alih TV (migrasi yang sama; `pw_tv_settings.now_item_id`, `now_until`, `now_screen_ids`): admin memilih lamanya (5, 15, 30, 60 menit, atau sampai dihentikan) dan TV-nya (tanpa centang = semua TV dan alamat umum `/tv`). Selama berjalan, TV itu hanya memutar baris tersebut, **juga bila barisnya disembunyikan atau di luar jadwalnya**; sesudahnya TV kembali ke daftar dengan sendirinya. Yang baru menggantikan yang berjalan; menghapus barisnya menghentikannya. Halaman Tayangan dan Pantauan menulis bahwa ada yang mengambil alih, dengan tombol Hentikan. Aturan murninya `takeoverOn`. API: `POST`/`DELETE /api/admin/wam/tv/now`. Sebelum migrasi, kedua fitur tidak muncul dan tayangan lain berjalan seperti biasa. |
| Pantauan | TV melaporkan ukuran layar dan tayangan yang sedang tampil tiap kali bertanya; admin melihatnya di Pantauan. **Muat ulang TV** mengisi `reload_at`; TV yang sedang menyala memuat ulang halamannya saat bertanya berikutnya (sekali per permintaan). TV yang memakai alamat umum `/tv` tidak punya nama, jadi tidak terpantau dan tidak bisa dimuat ulang dari jauh. |
| Kalender | Pemakaian ruang dari `pw_room_holds` (booking dan sesi), dibaca sekali untuk seminggu (`roomUsesBetween`). **Hari ini**: ruang lawan jam (08–18, melebar bila ada jadwal di luar itu) dengan garis "sekarang"; di TV tegak ruang jadi kolom dan jam menurun. **Minggu ini**: Senin–Jumat per kolom (Sabtu/Minggu hanya bila ada jadwal); di TV tegak per hari satu pita. Yang tampil hanya **nama kegiatan, ruang, jam, dan pemesan** ("SM - Raja", `bookerLabel`); deskripsi dan peserta tidak pernah tampil. Ruang yang tidak dipakai hari itu tidak digambar. Yang sudah selesai tetap tampil tetapi redup; "Sedang berlangsung" selalu berupa kata. Booking Di luar kantor tidak tampil. |
| Warna dan legenda | Tiap **nama kegiatan** punya satu **nomor** dan satu warna yang tetap selama seminggu dan sama di kedua kalender (`tvLegend`). Nama kegiatan ditulis **sekali** di legenda di bawah judul, di samping titik bernomor (paling banyak tiga baris, sisanya "+N lainnya"); balok jadwal memuat nomor yang sama dan diwarnai. Nomor tidak pernah berulang, jadi kegiatan tetap bisa dibedakan walau TV menampilkan dua warna mirip atau kegiatan lebih dari sembilan. Sembilan warnanya (`.c0`–`.c8` di `tv.module.css`) **sengaja bukan token tema**: aksen tema terlalu berdekatan di layar TV, jadi dipilih warna yang berjauhan. Isi balok: **harian** = pemesan dengan departemennya ("SM - Bu Andri", turun baris, tidak dipotong) dan jam kecil; **mingguan** = jam besar, lalu ruang dan pemesan dalam satu baris yang mengecil mengikuti panjangnya. Jadwal yang lewat tetap berwarna, hanya lebih redup; yang sedang berlangsung bergaris tegas dan bertanda kata "Berlangsung" atau "Kini". |
| Semua terlihat | Kalender **tidak pernah digulir atau dibagi halaman**: ruang di bawah kepala dibagi rata ke baris yang dibutuhkan data, jadi makin banyak jadwal makin kecil baris dan hurufnya (`fit`, `fitText` di `src/lib/pra-wam/tv.ts`), dengan batas huruf terkecil 1,25 % sisi pendek layar. |
| Gambar | Diunggah admin, diubah ke WebP (sisi terpanjang 2560 px) di browser, disimpan di R2 privat (`pra-wam/tv/`), dan dikirim ke TV lewat situs ini. Paling banyak 30 gambar; tiap gambar punya durasi dan bisa disembunyikan tanpa dihapus. |
| Tema | Papan memakai tema WAM yang dipilih di Admin WAM → Tema aplikasi (Dream Out Loud atau Werkudara). Modenya **Gelap** (bawaan) atau **Terang**, dipilih admin di tab Tampilan untuk semua TV (migrasi `202611100005_pw_tv_look.sql`). Warna dan huruf hanya lewat token `--pw-*`; `tv.module.css` tidak menulis warna sendiri, kecuali kartu QR (selalu hitam di atas putih) dan sembilan warna legenda (lihat Warna dan legenda). |
| Kode QR | Pilihan di tab Tampilan: tampil atau tidak, alamat yang dibuka (kosong = alamat TV itu sendiri; kalau diisi harus diawali `https://` atau `http://`), keterangan pendek, dan letak (empat sudut). QR menumpang di atas semua tayangan, jadi di sudut bawah ia menutupi sudut kalender; di sudut atas ia lebih kecil dan kepala papan (judul, jam) bergeser memberi ruang. |
| Halaman admin | **Admin TV** (`/admin/tv`, 10 Nov 2026): admin TV Announcement sendiri di luar Admin WAM, dengan login admin yang sama (`TvAdminFrame`). Empat tempat: **Pantauan** (TV mana yang menyala, sedang menayangkan apa, tombol Muat ulang TV), **Tayangan** (daftar tayangan), **Layar TV** (alamat umum dan alamat per TV), **Tampilan** (mode dan QR), plus Pratinjau. Menu TV Announcement di Admin WAM tetap ada dan mengarah ke Admin TV. API-nya tetap di `/api/admin/wam/tv/…`. **Tayangan** (ditata ulang 10 Nov 2026, mengikuti kartu konsol di `docs/rancangan-admin-wam.md` dan `brain/aturan/desain-ui.md`): tiap tayangan satu **kartu** dalam kisi berkolom (satu kolom di HP), untuk dibaca: ikon, nomor urut dan sumbernya, pil status, nama dan keterangannya tanpa dipaksa satu baris, lalu Durasi, Tayang di, dan Jadwal sebagai fakta berlabel. Di kartu hanya ada panah urutan dan **Atur**; Atur membuka kartu selebar halaman dengan semua yang lain di dalamnya: isi, durasi, jadwal, TV, lalu Simpan, Tayangkan sekarang, Sembunyikan, dan Hapus. Tiap kartu dibuka dengan **gambar pratinjau** 16:9: gambarnya sendiri untuk tayangan Gambar, atau gambaran slide untuk jenis lain (`TvPreview`, bukan tangkapan langsung; baris yang diketik menampilkan kata-katanya sendiri). Pratinjau yang sama ada di daftar template dan di form Sambutan dan Teks pada Tambah tayangan, mengikuti yang sedang diketik. Tambah tayangan satu kartu dengan pilihan Template, Sambutan, Ulang tahun, Teks, Video, Gambar. Tesnya `TvPlaylist.dom.test.tsx`; dengan `TV_PLAYLIST_HTML=<folder>` tes itu juga menulis halaman contoh untuk dilihat di browser. |
| Durasi | Durasi hanya ditanyakan di admin bila yang ditayangkan lebih dari satu (`loopCount`); satu tayangan tampil terus. |
| Layar | Papan digambar dalam satuan 1 % sisi pendek layar, jadi skala gambar sama di TV mendatar dan tegak; yang berubah susunannya. Tinggi kepala dan jarak tepi di `tv.module.css` dan `HEAD`/`PAD_*` di `TvBoard.tsx` harus diubah bersama. Gambar yang rasionya mirip layar memenuhi layar; yang lain tampil utuh. |
| Tetap segar | TV bertanya tiap 10 detik (server menyimpan jawaban 6 detik), jadi perubahan isi dan pengaturan tampil dalam sekitar seperempat menit. Jaringan putus: TV meneruskan isi terakhir. **Versi baru situs**: jawaban membawa nomor build (`version`); bila berbeda dari build halaman yang sedang terbuka, TV memuat ulang halamannya sendiri (paling sering sekali per 3 menit, `shouldReload`), jadi tampilan baru sampai ke semua TV tanpa disentuh. Halaman juga dimuat ulang pukul 03.00 WIB. Tidak memakai Supabase Realtime. |
| Browser TV lama (lite) | `/tv/lite` dan `/tv/{alamat}/lite` (11 Nov 2026): untuk TV yang browsernya terlalu tua untuk papan biasa (Next 16 butuh Chrome 111+; mis. Samsung UA50MU6100 2017 Tizen 3.0 ≈ Chromium 47, LG webOS 23 ≈ Chromium 94), sehingga `/tv` di sana kosong. Memutar **daftar tayangan TV itu** seperti papan (jadwal, TV tertentu, Tayangkan sekarang ikut): Sambutan tamu (ketiga desain), Kalender hari ini dan minggu ini (garis sekarang, Berlangsung/Kini), Teks, Gambar, Ucapan ulang tahun, Timeline Pra WAM, dan Pengumuman panitia. **Video dilewati** (tanpa script halaman tidak tahu kapan video selesai). Ditulis utuh di server sebagai HTML **tanpa script** (route handler, `src/lib/pra-wam/tv-lite.ts`) dengan CSS yang dikenal browser lama (flexbox dan posisi absolut; tanpa grid, `var()`, `gap`, `color-mix`, `inset`, container unit). **Satu tayangan per muat ulang**: `meta refresh` membuka tayangan berikutnya (`?s=` kuncinya) setelah durasinya, paling singkat 8 dan paling lama 60 detik, jadi perubahan di admin dan versi baru situs sampai paling lambat semenit; daftar berisi satu tayangan dimuat ulang tepat lewat pergantian menit. Alamat lama `?v=hari`/`?v=minggu` tetap jalan. Papan selamat datang dan kartu ulang tahun tampil utuh juga di **TV tegak** (media query bentuk layar, seperti papan biasa); kalender, Timeline, dan Pengumuman masih bersusunan mendatar. Huruf Lora, Poppins, Playfair, dan Cormorant tidak dimuat (TV memakai serif/sans bawaannya). QR tidak ada. Alamat terbuka seperti `/tv`; `lite` tidak bisa dipakai sebagai alamat TV. TV lite tidak melapor ke Pantauan. Periksa di `/dev-preview/tv/lite?isi=daftar`. |
| Tampilan HP | Di layar yang sisi pendeknya di bawah 600 px (orang memindai QR di TV; `isPhoneScreen`), alamat yang sama tampil sebagai **daftar yang bisa digulir** (`TvPhone.tsx`), bukan kalender: jam, nama kegiatan lengkap, ruang, dan pemesan beserta departemennya, dengan titik warna kegiatannya. Ada tab Hari ini / Minggu ini / Gambar dan bilah Sebelumnya · **Jeda / Putar otomatis** · Berikutnya. Menyentuh atau menggulir daftar ikut menghentikan pergantian otomatis. **Kontrol ini hanya ada di HP**; di TV tidak ada tombol jeda dan tayangan selalu berganti sendiri. QR dan tombol Layar penuh tidak tampil di HP. **HP** berarti layar sempit (di bawah 600 px), tegak, **dan** layar sentuh: banyak browser TV melaporkan 960×540, jadi ukuran saja tidak cukup. `/tv?hp=1` membuka tampilan HP di layar apa pun (untuk memeriksanya dari komputer). Ada **kolom cari** (`searchEntries`): nama pemesan, departemen, ruangan, atau kegiatan di jadwal seminggu, beberapa kata sekaligus; selama mencari, tab dan pergantian otomatis disembunyikan. |
| Layar penuh | Tombol "Layar penuh" muncul saat layar disentuh atau mouse digerakkan. Supaya terbuka sendiri saat TV menyala, pakai aplikasi kiosk atau Chrome `--kiosk` di perangkatnya; itu bukan urusan halaman. |
| Status TV | Admin melihat "Menyala" (bertanya dalam 2 menit terakhir), "Tidak terlihat", atau "Belum pernah dibuka", serta ukuran layarnya. |
| Periksa tampilan | `/dev-preview/tv` (data tiruan; `?isi=banyak`, `?isi=kosong`, `?isi=gambar`, `?isi=sambutan`) dan Admin WAM → TV Announcement → Pratinjau. |

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
