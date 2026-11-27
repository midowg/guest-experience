# Migrasi Supabase

Semua migrasi ada di folder ini, satu folder per aplikasi (aturan 27 Nov 2026):

| Folder | Isi |
|---|---|
| `journey/` | Acara, undangan, admin inti, super admin, halaman utama |
| `karyawan/` | Data karyawan bersama (`employees`, jabatan, BU) |
| `wam/` | Aplikasi Pra WAM (`pra_wam_*`, `pw_*`, kuesioner, kartu tokoh) |
| `wam-2026/` | Aplikasi selama acara WAM 2026 (`main_wam_*`) |
| `tv/` | TV kantor / signage (`pw_tv_*`) |
| `booking/` | Booking Kantor |
| `wlm/` | WLM (wellbeing) |
| `people/` | WG People (HR: absensi, cuti) |
| `coffee/` | Werkudara Coffee |
| `refleksi/` | Refleksi Leader |

## Aturan

1. **Hanya di sini.** File migrasi baru selalu di `supabase/migrations/<aplikasi>/`, tidak di folder lain,
   tidak di `docs/`, dan tidak langsung di `supabase/migrations/` tanpa folder.
2. **Nama file tetap** `YYYYMMDDNNNN_nama_singkat.sql`. Nomor waktunya unik di **semua** folder, karena urutan
   menjalankan migrasi mengikuti nomor itu lintas folder, bukan per folder. Sebelum membuat nomor baru, lihat
   nomor terakhir di **semua** folder. (Empat nomor sudah terpakai dua kali sebelum aturan ini: 202611250001,
   202611260001, 202611270001, 202611280001. Karena sudah dijalankan, namanya tidak diubah.)
3. **Aplikasi baru = folder baru**, lalu tambahkan barisnya di tabel di atas.
4. Migrasi tetap **dijalankan pemilik** di Supabase SQL Editor, urut nomor. Uji lokal:
   `tests/backend/run-migrations-local.sh` (Docker) mengambil semua folder sekaligus, urut nomor.
5. `supabase db push` dari Supabase CLI hanya membaca file langsung di folder ini, jadi tidak dipakai
   untuk proyek ini.

`src/lib/migrations-layout.test.ts` menjaga aturan 1 dan 2.
