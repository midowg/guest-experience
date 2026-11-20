# Aturan WG People (`/hr`)

Aplikasi HR karyawan, **terpisah dari WAM** (diputuskan 20 Nov 2026). Namanya **WG People** (21 Nov 2026,
pilihan pemilik; sebelumnya "HR Werkudara"); alamatnya tetap `/hr` supaya yang sudah terpasang di HP tidak putus. Mulai dengan absensi; cuti,
lembur DW, dan lainnya menyusul di aplikasi yang sama. Aturan kerja umum repo (rilis, migrasi,
data pribadi, pemeriksaan) tetap mengikuti `docs/aturan-wam.md` §1–§2.

## 1. Aplikasi

| Hal | Aturan |
| --- | --- |
| Alamat | Karyawan: `/hr` (Beranda), `/hr/riwayat`, `/hr/pengajuan`, `/hr/profil`, `/hr/masuk`, `/hr/lupa-password`, `/hr/password-baru` (`hrPath`, `hrApi`). Admin: **Admin HR** di Journey Admin, `/admin/hr` (`hrAdminPath`, `hrAdminApi`, `src/components/hr-admin/`). |
| Akun | Akun karyawan yang sama dengan WAM dan Booking Kantor (satu email, satu password, satu cookie), tapi halaman masuknya sendiri. Komponen masuk dipakai bersama Booking (`BookingAuth`, `app="hr"`). |
| Tampilan | "Hangat dan tenang" (21 Nov 2026, dengan skill desain design-taste-frontend, awesome-design-md, ui-ux-pro-max): netral hangat seperti kertas (`#F7F3EE`) dan **satu aksen tanah liat** `#A84B26` (gelap: `#EE9B74`), permukaan datar bergaris tipis tanpa bayangan, Plus Jakarta Sans dengan tebal sedang, status tetap hijau/kuning/merah dan selalu dengan kata. Token `--hr-*` di `src/components/hr/hr.module.css`, terang dan gelap. Admin HR memakai bingkai konsol Journey Admin seperti Admin WAM 2026. |
| Seperti aplikasi HP | Mengikuti Apple HIG (21 Nov 2026, riset Talenta, Factorial, Personio, BambooHR, Deputy, Jibble, Connecteam, Homebase, Workday). **Menu bawah** Beranda · Riwayat · Pengajuan · Profil (`src/lib/hr/tabs.ts`, `HrFrame`), ikon terisi dan berwarna tanah liat untuk yang aktif. **Menu utama tanpa bar atas**: judul besar di halaman (Beranda: sapaan dan tanggal). **Halaman detail** (satu hari, satu pengajuan, Data wajah, Titik kantor) punya bar: panah kembali, judul di tengah, paling banyak satu aksi di kanan (mis. Revisi); menu bawah tetap terlihat. **Lembar** (sheet) untuk tugas: absen, daftar wajah, Ajukan revisi; selalu **Batal** di kiri (Kirim di kanan untuk revisi), aplikasi di belakangnya diredupkan dan tidak bisa disentuh (inert), Escape dan tombol kembali HP menutupnya, fokus kembali ke tombol pembukanya. Menutup lembar menghentikan prosesnya: jawaban yang datang terlambat tidak membuka kamera lagi (bila absen sudah tercatat, muncul pesan). Kembali dari detail mengembalikan posisi gulir, saringan, dan fokus ke baris pembukanya. Konfirmasi Keluar, Hapus data wajah, dan Batalkan pengajuan lewat lembar tanya dari bawah. Pindah menu **tidak memuat ulang** (`history.pushState`); detail dan lembar menambah satu langkah riwayat, jadi tombol kembali HP menutupnya; mengetuk menu yang sedang dibuka kembali ke akarnya. Data dimuat sekali lalu diperbarui diam-diam saat menu dibuka lagi, aplikasi kembali ke depan, hari berganti, atau zona waktu HP berubah (ViewerZone `soft`: tanpa memuat ulang layar). Diaudit 21 Nov 2026 oleh tiga agen (UX/HIG, aksesibilitas WCAG 2.2 AA, kode) dan temuannya diterapkan. Komponen: `screens.tsx` (layar), `ui.tsx` (blok dasar), `ClockInFlow.tsx` (data, riwayat, langkah absen), `app.module.css`. |
| Satu tombol, satu tempat | Beranda: kartu status (jam, Masuk → Pulang, satu tombol lebar Absen masuk/pulang), "Perlu perhatian" hanya bila ada yang perlu dilakukan (lupa absen pulang, absen ditolak), Minggu ini (tujuh hari, ketuk untuk detail). Riwayat: daftar per minggu dengan saringan Semua / Perlu dicek / Di luar kantor; ketuk hari → detail, Revisi di bar detail. Pengajuan: Menunggu / Selesai, **Ajukan** di samping judul, ketuk → detail dengan perjalanan Dikirim → keputusan, Batalkan pengajuan di detail. Profil: Data wajah, Titik kantor, Cara absen, Zona waktu, **Keluar** sendiri di bawah. |
| Ikon | Figur "W" mengangkat tangan dengan kepala bulat (orang + huruf W), krem dan peach di atas tanah liat (`public/hr/icon-*.png`, `WgMark.tsx` untuk halaman masuk). |
| Pasang di HP | PWA sendiri: manifest `/hr/manifest.webmanifest`, service worker `/hr/sw.js` (scope `/hr/`), ikon tanah liat di `public/hr/` (warna tema `#F7F3EE`). Model wajah disimpan service worker setelah unduhan pertama. |
| Izin browser | `Permissions-Policy` membuka kamera dan lokasi untuk situs ini saja di `/hr` (`next.config.ts`). |
| Pengelola | **Admin HR** di Journey Admin: super admin, atau orang yang dicentang **WG People** di Super admin → Akses admin (`admin_grants.apps` `hr`, migrasi `202611200703_admin_grants_hr.sql`). Kartu WG People di beranda admin menunjukkan jumlah absen yang perlu dicek. Peran `hr` di `pw_roles` (migrasi `202611200702`) tidak dipakai lagi sejak 20 Nov 2026. |
| Data | Tabel `pw_offices`, `pw_face_profiles`, `pw_daily_attendance` (migrasi `202611200701`, nama `pw_` dipertahankan). Kode: `src/lib/hr/`, `src/lib/server/hr/`, `src/components/hr/`, `src/app/hr/`, `src/app/api/hr/`. |

## 2. Absensi

| Hal | Aturan |
| --- | --- |
| Siapa | Semua karyawan aktif yang punya akun (termasuk DW). Satu **masuk** dan satu **pulang** per hari kerja. Jam dicatat apa adanya (belum ada aturan terlambat). |
| Metode (pilot, 21 Nov 2026) | Admin HR memilih **satu metode untuk semua** di Ringkasan → Metode absen: **Wajah + gerakan** (selfie dengan 2 langkah liveness acak) atau **Foto cepat** (satu selfie langsung dicocokkan dengan foto acuan, seperti GreatDay; tanpa liveness, jadi lebih mudah ditipu foto). Setiap absen mencatat metodenya (`face_method`) supaya bisa dibandingkan. Butuh migrasi `202611270001_hr_metode_revisi.sql`; sebelum itu semua memakai Wajah + gerakan. |
| Kecocokan (%) | Skor cosine dibaca sebagai persen dengan kurva halus (`matchPercent`): ambang cocok 0,363 ≈ 76%, cocok jelas ≥ 95%. Tampil ke karyawan setelah absen dan saat ditolak ("kecocokan 18%, perlu sekitar 76%"), dan ke Admin HR. Ini skala baca, bukan peluang; keputusan tetap pada skor. |
| Wajah | Dicocokkan **di HP** (MediaPipe Face Landmarker + SFace int8 lewat onnxruntime-web, model di `public/hr/models/`). Embedding acuan **tidak pernah dikirim ke HP**; skor dihitung server. Ambang: cocok ≥ 0,363 (Sah), 0,30–0,363 Perlu dicek, di bawah 0,30 ditolak dan tidak dicatat. Kalibrasi di `/dev-preview/wajah`. |
| Liveness | Hanya metode Wajah + gerakan: server memilih 2 langkah acak per absen (kedip, toleh kiri, toleh kanan, senyum) dari nonce; HP mengirim sinyal per frame dan server menilai ulang. Tiga tatapan lurus harus satu wajah. Token berlaku 3 menit. |
| Lokasi | Di dalam bila jarak ke titik kantor terdekat ≤ radiusnya **dan** akurasi GPS ≤ 100 m. Di luar boleh dengan alasan (Event/venue, Dinas luar, WFH, Lainnya) → **Perlu dicek**. Lompatan > 300 km/jam ditandai. Web tidak bisa mendeteksi Fake GPS; selfie bukti dan tinjauan Admin HR yang menekannya. |
| Status | Sah: wajah cocok, di dalam area, wajah sudah disetujui. Perlu dicek: di luar area, GPS kurang akurat, skor rendah, wajah menunggu persetujuan, pulang tanpa masuk. Admin HR menyetujui atau menolak (alasan wajib). |
| Wajah acuan | Awal dari foto dasar **GreatDay HR** (52 diimpor 20 Nov 2026, status `impor`). Admin HR → Wajah terdaftar → **Proses foto** membaca fotonya di browser Admin HR dengan mesin yang sama → **langsung `aktif`** (pilihan pemilik untuk pilot, 21 Nov 2026; tanpa langkah Setuju; sebelum migrasi `202611270001` masih `siap`). Yang tidak ada atau tidak terbaca **daftar sendiri**: cocok dengan foto GreatDay → langsung aktif, selain itu `menunggu` Admin HR (absennya tetap tercatat sebagai Perlu dicek). Admin HR bisa "Jadikan foto acuan" dari selfie absen. |
| Selfie | 480 px, ≤120 KB, R2 privat `pra-wam/absen-harian/<karyawan>/`. **Tidak ada jadwal penghapusan**: Admin HR menekan **Hapus selfie lama** di Absen harian untuk menghapus selfie (dan embedding-nya) yang lebih dari 90 hari. |
| Tanpa wajah | Yang tidak setuju data wajah, HP rusak, atau lupa: Admin HR **Catat manual** dengan jam dan alasan. |
| Revisi (21 Nov 2026) | Karyawan mengajukan dari Absen ("Ada yang salah hari ini?" atau ikon di tiap hari riwayat sebulan): **Lupa absen** (jam), **Jam salah** (jam yang benar), **Alasan atau lokasi salah**, **Batalkan absen**; selalu dengan alasan. Maksimal 31 hari ke belakang, satu revisi menunggu per masuk/pulang; bisa dibatalkan sendiri selama menunggu ("Revisi saya"). Admin HR → **Revisi**: Setujui langsung diterapkan (lupa absen dicatat manual "(revisi)", jam/alasan diubah, batal = hapus beserta selfie), Tolak wajib alasan. Tabel `pw_attendance_requests`. |
| Hari kerja | Tanggal di zona titik kantor bila di dalam area, zona perangkat bila di luar. Jam tampil di zona pembaca (WIB/WITA/WIT). |

## 3. Admin HR (`/admin/hr`)

| Bagian | Isi |
| --- | --- |
| Ringkasan | Angka hari ini (sudah masuk, belum absen, perlu dicek, di luar kantor, revisi menunggu), **Metode absen**, langkah persiapan yang dicentang otomatis (titik kantor, proses foto GreatDay, akses admin, bagikan aplikasi), status wajah, dan cuplikan antrean. |
| Revisi | Antrean revisi dari karyawan (terlama dulu): absen sekarang di samping yang diminta dan alasannya; **Setujui dan terapkan** atau Tolak (alasan). Di bawahnya yang baru diputuskan. Angka menunggu tampil di menu. |
| Perlu dicek | Semua absen yang menunggu, terbaru dulu: selfie di samping foto acuan, skor, alasan, jarak. Setujui/Tolak satu per satu, atau pilih beberapa lalu **Setujui yang dipilih**. Saring: di luar kantor, soal wajah, lainnya. |
| Absen harian | Semua orang per hari (‹ › geser hari), cari nama, saring (belum absen, perlu dicek, di luar kantor); ketuk kotak Masuk/Pulang untuk meninjau atau **catat manual**. **Hapus selfie lama** di sini. Setiap absen punya **Hapus absen** (untuk data uji atau salah catat): merah, paling akhir, dengan konfirmasi di tempat; selfie-nya ikut terhapus permanen. |
| Wajah terdaftar | Foto acuan per orang dengan saringan status (bawaan: Perlu tindakan), **Proses foto impor** dengan bilah progres, Setujui/Tolak wajah daftar sendiri, Minta daftar ulang. |
| Titik kantor | Tempel koordinat/link Google Maps atau "Pakai lokasi saya", radius, zona; pratinjau peta OpenStreetMap sebelum menyimpan. |

## 4. Data pribadi

- Data wajah adalah data pribadi spesifik (UU PDP): dipakai hanya setelah persetujuan eksplisit per
  orang (`CONSENT_VERSION` di `src/lib/hr/attendance.ts`; teksnya perlu dibaca HR/legal sebelum dibuka).
- Foto acuan dan selfie hanya di R2 privat, dilihat lewat link 5 menit oleh Admin HR.
- Karyawan bisa menarik persetujuan (Absen → Data wajah → Hapus): wajah acuan dan semua selfienya dihapus.
- Excel dan foto dasar GreatDay tidak pernah masuk repo (repo publik).

## 5. Menyusul

Cuti, lembur DW, dan fitur HR lain masuk sebagai menu baru di bingkai HR (`HrFrame`) dan bagian
baru di Admin HR (`src/components/hr-admin/sections.ts`), dengan aturan di dokumen ini.
