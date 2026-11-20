# Aturan HR Werkudara (`/hr`)

Aplikasi HR karyawan, **terpisah dari WAM** (diputuskan 20 Nov 2026). Mulai dengan absensi; cuti,
lembur DW, dan lainnya menyusul di aplikasi yang sama. Aturan kerja umum repo (rilis, migrasi,
data pribadi, pemeriksaan) tetap mengikuti `docs/aturan-wam.md` §1–§2.

## 1. Aplikasi

| Hal | Aturan |
| --- | --- |
| Alamat | `/hr` (Absen), `/hr/kelola` (Kelola: Absen harian, Titik kantor, Akses), `/hr/masuk`, `/hr/lupa-password`, `/hr/password-baru`. Rute di `hrPath` / `hrApi` (`src/lib/routes.ts`). |
| Akun | Akun karyawan yang sama dengan WAM dan Booking Kantor (satu email, satu password, satu cookie), tapi halaman masuknya sendiri. Komponen masuk dipakai bersama Booking (`BookingAuth`, `app="hr"`). |
| Tampilan | Gaya default (`brain/aturan/desain-ui.md`): netral, satu primary biru `#2F6FEB`, terang dan gelap (`src/components/hr/hr.module.css`). Bingkai memakai kelas Booking dengan warna HR (`HrFrame`). Kelola memakai kartu konsol admin (`ConsoleTheme`). |
| Pasang di HP | PWA sendiri: manifest `/hr/manifest.webmanifest`, service worker `/hr/sw.js` (scope `/hr/`), ikon di `public/hr/`. Model wajah disimpan service worker setelah unduhan pertama. |
| Izin browser | `Permissions-Policy` membuka kamera dan lokasi untuk situs ini saja di `/hr` (`next.config.ts`). |
| Pengelola | Peran **Admin HR** (`hr`, migrasi `202611200702_pw_role_hr.sql`). Diberikan di Kelola → Akses oleh Admin HR lain, atau di Admin WAM → Akun dan peran. Admin WAM **bukan** otomatis Admin HR. |
| Data | Tabel `pw_offices`, `pw_face_profiles`, `pw_daily_attendance` (migrasi `202611200701`, nama `pw_` dipertahankan). Kode: `src/lib/hr/`, `src/lib/server/hr/`, `src/components/hr/`, `src/app/hr/`, `src/app/api/hr/`. |

## 2. Absensi

| Hal | Aturan |
| --- | --- |
| Siapa | Semua karyawan aktif yang punya akun (termasuk DW). Satu **masuk** dan satu **pulang** per hari kerja. Jam dicatat apa adanya (belum ada aturan terlambat). |
| Wajah | Dicocokkan **di HP** (MediaPipe Face Landmarker + SFace int8 lewat onnxruntime-web, model di `public/hr/models/`). Embedding acuan **tidak pernah dikirim ke HP**; skor dihitung server. Ambang: cocok ≥ 0,363 (Sah), 0,30–0,363 Perlu dicek, di bawah 0,30 ditolak dan tidak dicatat. Kalibrasi di `/dev-preview/wajah`. |
| Liveness | Server memilih 2 langkah acak per absen (kedip, toleh kiri, toleh kanan, senyum) dari nonce; HP mengirim sinyal per frame dan server menilai ulang. Tiga tatapan lurus harus satu wajah. Token berlaku 3 menit. |
| Lokasi | Di dalam bila jarak ke titik kantor terdekat ≤ radiusnya **dan** akurasi GPS ≤ 100 m. Di luar boleh dengan alasan (Event/venue, Dinas luar, WFH, Lainnya) → **Perlu dicek**. Lompatan > 300 km/jam ditandai. Web tidak bisa mendeteksi Fake GPS; selfie bukti dan tinjauan Admin HR yang menekannya. |
| Status | Sah: wajah cocok, di dalam area, wajah sudah disetujui. Perlu dicek: di luar area, GPS kurang akurat, skor rendah, wajah menunggu persetujuan, pulang tanpa masuk. Admin HR menyetujui atau menolak (alasan wajib). |
| Wajah acuan | Awal dari foto dasar **GreatDay HR** (52 diimpor 20 Nov 2026, status `impor`). Kelola → Wajah terdaftar → **Proses foto impor** membaca fotonya di browser Admin HR dengan mesin yang sama → `siap`; dipakai setelah karyawannya menyetujui di absen pertama (`aktif`). Yang tidak ada atau tidak terbaca **daftar sendiri**: cocok dengan foto GreatDay → langsung aktif, selain itu `menunggu` Admin HR (absennya tetap tercatat sebagai Perlu dicek). Admin HR bisa "Jadikan foto acuan" dari selfie absen. |
| Selfie | 480 px, ≤120 KB, R2 privat `pra-wam/absen-harian/<karyawan>/`. **Tidak ada jadwal penghapusan**: Admin HR menekan **Hapus selfie lama** di Kelola untuk menghapus selfie (dan embedding-nya) yang lebih dari 90 hari. |
| Tanpa wajah | Yang tidak setuju data wajah, HP rusak, atau lupa: Admin HR **Catat manual** dengan jam dan alasan. |
| Hari kerja | Tanggal di zona titik kantor bila di dalam area, zona perangkat bila di luar. Jam tampil di zona pembaca (WIB/WITA/WIT). |

## 3. Data pribadi

- Data wajah adalah data pribadi spesifik (UU PDP): dipakai hanya setelah persetujuan eksplisit per
  orang (`CONSENT_VERSION` di `src/lib/hr/attendance.ts`; teksnya perlu dibaca HR/legal sebelum dibuka).
- Foto acuan dan selfie hanya di R2 privat, dilihat lewat link 5 menit oleh Admin HR.
- Karyawan bisa menarik persetujuan (Absen → Data wajah → Hapus): wajah acuan dan semua selfienya dihapus.
- Excel dan foto dasar GreatDay tidak pernah masuk repo (repo publik).

## 4. Menyusul

Cuti, lembur DW, dan fitur HR lain masuk sebagai menu baru di bingkai HR (`HrFrame`) dan bagian
baru di Kelola, dengan aturan di dokumen ini.
