# Panduan setup

Proyek Supabase: `eizhomocgggmwsydhrow`. Aplikasi di-deploy ke Vercel.

## 1. Environment

Salin `.env.example` menjadi `.env.local`, lalu isi dari Supabase Dashboard → Project Settings → API keys.

| Variabel | Sumber | Catatan |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Boleh terlihat publik. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable/anon key | Boleh terlihat publik. Dibatasi oleh RLS. |
| `SUPABASE_SECRET_KEY` | Secret/service-role key | **Rahasia.** Hanya di server. Jangan pernah diberi awalan `NEXT_PUBLIC_`. |
| `RATE_LIMIT_SECRET` | Buat sendiri, acak minimal 32 karakter | Menyamarkan identitas jaringan pada pembatasan laju. |

`.env*` sudah masuk `.gitignore`, kecuali `.env.example` yang hanya berisi template. Jangan mengirim kunci apa pun melalui chat. `NEXT_PUBLIC_SITE_URL` tercantum di template tetapi saat ini tidak digunakan aplikasi.

Di Vercel, isi keempatnya pada Project Settings → Environment Variables untuk **Production** (dan Preview jika kelak digunakan), lalu deploy ulang. Variabel `NEXT_PUBLIC_*` dibekukan pada saat build, sehingga perubahan nilainya memerlukan build/deploy baru. Tanpa variabel ini, aplikasi menampilkan status "belum terhubung" dan **tidak** memakai data contoh. Lihat [rencana deployment berbasis tag](deployment.md); workflow deploy belum dibuat.

## 2. Migrasi database

Instalasi baru: jalankan seluruh migrasi `supabase/migrations/` menurut nama berkas secara berurutan. Untuk instalasi yang sudah berjalan, terapkan hanya berkas migrasi yang belum diterapkan, termasuk `202610110001_personal_invitations.sql` bila ingin memakai undangan per tamu. Jangan jalankan ulang seed karena bisa menimpa konten yang sudah diedit. **Migrasi personal belum diterapkan oleh perubahan kode ini**; tinjau dan minta izin tersendiri sebelum menerapkannya ke Supabase remote.

Tinjau isinya sebelum diterapkan. Setelah disetujui, jalankan melalui Supabase Dashboard → SQL Editor, atau Supabase CLI. Migrasi membuat tabel acara, rundown, pertanyaan survei, RSVP, feedback, audit, dan pembatasan laju, lengkap dengan Row Level Security.

Yang dijamin skema ini:
- Tamu anonim hanya membaca acara berstatus `published`.
- Database menolak pembacaan RSVP/feedback langsung oleh anon, tetapi **API dan panel aplikasi kini tanpa login**, sehingga data tersebut dapat dibaca siapa pun yang mengakses aplikasi.
- Tidak ada izin tulis langsung dari browser; penulisan hanya lewat fungsi transaksional yang diperiksa.
- Pertanyaan survei yang sudah menerima jawaban tidak dapat diubah.

## 3. Akses pengelolaan tanpa login

Sesuai keputusan pemilik, buka `/admin` langsung tanpa akun. Header email/logout dihapus; `/admin/login` mengarah ke `/admin`. Tidak ada batas akses internal: pada domain publik siapa pun bisa membaca data RSVP, mengekspor kontak, mengunggah foto, mengubah dan menghapus acara. Origin check dan URL yang tidak ditautkan bukan autentikasi.

Operasi database memakai service-role client **hanya di server**. Jangan pernah membagikan secret key ke browser. Migrasi 007 memberi RPC pengelolaan izin service_role; aturan publikasi, pertanyaan terjawab dan larangan menghapus acara featured tetap berlaku. Audit baru tanpa sesi mempunyai actor_id null dan tidak bisa mengidentifikasi orang yang melakukan tindakan. Akun/keanggotaan lama tidak dihapus otomatis.

**Repository publik maupun privat tidak membatasi akses ke deployment.** URL Preview Vercel juga dapat membuka panel dan API admin. Jangan menyimpan data pribadi nyata bila akses publik ini belum diterima oleh penyelenggara dan pihak terkait. Jika nanti diperlukan akses internal sungguhan, pasang autentikasi atau gerbang akses yang melindungi halaman **dan API**, bukan hanya menyembunyikan URL.

Jika branch `dev` dan `master` memakai satu project Supabase, perubahan undangan, unggahan, dan data tamu pada Preview akan langsung memengaruhi Production. Jangan menguji aksi hapus atau mengirim data RSVP contoh ke database bersama.

## 4. Menjalankan secara lokal

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint
npm run typecheck
npm test
npm run build
```

Halaman `/dev-preview` adalah pemeriksaan tampilan untuk pengembangan dan tidak dapat diakses pada build produksi.

## 5. Alur penggunaan

1. Buka `/admin` (tanpa login).
2. Buat acara, isi undangan, rundown, lokasi, dan pengaturan.
3. Periksa `/admin/events/<id>/preview` — menampilkan versi tersimpan, pengiriman dinonaktifkan.
4. Ubah status menjadi **Dipublikasikan** dan simpan.
5. Bagikan tautan `/e/<slug>` kepada tamu.
6. Pantau jawaban di tab RSVP dan Feedback; unduh CSV bila diperlukan.

Mengubah slug membuat tautan lama tidak berlaku. Semua waktu memakai WIB.

### Undangan per tamu

Acara lama tetap memakai mode **Tautan umum**. Untuk undangan individual, pilih **Tautan per tamu** pada editor, simpan, lalu buka tab **Undangan tamu** untuk menambah nama sapaan satu per satu (maksimal 1000 per acara). Salin tautan aktif setiap tamu dan bagikan secara individual; jangan kirim daftar tautan. Halaman `/e/<slug>` tetap menampilkan informasi acara, tetapi RSVP umumnya disembunyikan. Undangan individual memakai `/e/<slug>/i/<token>`: siapa pun yang memegang tautan dapat melihat jawaban sebelumnya dan mengubah RSVP sampai batas penutupan. Ini **bukan** verifikasi identitas ataupun check-in di lokasi. Cabut tautan untuk menonaktifkannya; terbitkan ulang untuk mengganti token lama tanpa menghapus RSVP.

**Penting:** `/admin` dan API pengelolaannya tetap tanpa login. Siapa pun di domain publik dapat membaca nama, token, dan data RSVP, membuat/mencabut tautan, atau mengubah acara. Token acak hanya mengaitkan jawaban ke undangan; token tidak membuat data rahasia selama admin publik. Feedback tetap anonim dan tidak diikat ke tamu. Formulir saat ini menanyakan *alergi makanan*, bukan seluruh pantangan diet.

Untuk kembali ke alur umum, ubah mode menjadi **Tautan umum** dan simpan. Data undangan serta jawaban personal lama tetap tersimpan dan diberi label berbeda pada RSVP/CSV; tautan personal berhenti berlaku saat mode umum aktif. Mengaktifkan kembali mode personal memungkinkan tautan aktif dipakai lagi, kecuali sudah dicabut atau diterbitkan ulang. Jangan menghapus acara bila ingin menjaga data RSVP. Migrasi personal perlu diterapkan sebelum mode ini dipakai; jika belum, pengelolaan tautan dan RSVP personal akan gagal.

## 6. Spesifikasi foto

| Keperluan | Ukuran | Rasio | Catatan |
|---|---|---|---|
| Foto latar pembuka | 2400 × 1500 px | 16:10 mendatar | Beri ruang lapang untuk teks |
| Foto lokasi Werkudara | 1600 × 1000 px | 16:10 mendatar | Tampil di bawah peta; dipotong ke 4:3 di ponsel |

Foto lokasi dapat diisi lebih dari satu. Satu foto tampil diam; dua atau lebih bergantian otomatis dan dapat dihentikan tamu.

Batas teknis: maksimal **8 MB**, format JPG, PNG, WebP, atau AVIF. Ukuran berkas yang ideal 300 KB–1,5 MB; JPG kualitas 80% sudah sangat baik.

Foto yang diunggah dikecilkan otomatis oleh server menjadi beberapa ukuran, sehingga tamu di ponsel hanya mengunduh yang sesuai layarnya. Foto dari tautan luar tidak dikecilkan — siapkan ukurannya sendiri.

Dua hal yang memengaruhi hasil:
- **Hindari foto yang terlalu ramai** untuk latar, karena teks dibaca di atasnya.
- **Jangan menaruh objek penting di tepi**, karena bagian itu terpotong di layar ponsel. Gunakan pratinjau di editor untuk memeriksanya, dan atur posisi teks ke kiri atau tengah sesuai fotonya.

Keterangan foto bersifat opsional. Isi hanya bila memang ada yang perlu disampaikan, misalnya kredit atau penjelasan singkat. Hanya galeri yang tampil sebagai foto lokasi; field foto lokasi lama tidak lagi dirender, tetapi data dan file lamanya tidak dihapus.

### Pratinjau pembuka
Pilih HP (390×844) atau Desktop (1440×900). Preview menggunakan komponen dan stylesheet yang sama dengan halaman tamu dalam viewport tersendiri, lalu diperkecil agar muat editor. Ini mengikuti perubahan lokal, sedangkan menu Preview tersimpan mengikuti data yang telah disimpan. Aktifkan **Atur foto** untuk menyeret foto atau memakai slider horizontal/vertikal/zoom (1–3×). Reset berlaku untuk perangkat aktif saja. Ganti foto mereset framing. Klik Simpan untuk menerapkan pengaturan; tidak ada perubahan pada berkas foto asli.

### Ulasan Google opsional
Tombol di penutup mengarah ke ulasan Google Werkudara, bukan survei internal. Dari profil bisnis Google yang dikelola, gunakan Minta ulasan/bagikan tautan ulasan. Tempel URL resmi, periksa tautan, aktifkan tombol, simpan/publikasikan. Ulasan berada di Google dan dapat tampil publik; Google mungkin meminta login. Semua tamu mendapat tautan yang sama, tidak disaring berdasarkan skor feedback. Matikan pilihan dan simpan jika tidak ingin tombol tampil.

## 7. Hal yang belum tersedia

- **Pembersihan tabel pembatasan laju terjadwal.** Fungsi `purge_expired_request_limits()` tersedia, tetapi penjadwalnya belum dipasang. Baris kedaluwarsa juga dihapus setiap kali fungsi dipanggil.
- **Kebijakan retensi data tamu.** Perlu ditetapkan penyelenggara sebelum acara berjalan.

## 8. MCP Supabase (khusus pengembangan)

`.mcp.json` berisi server read-only yang dibatasi ke proyek ini. Autentikasi lewat `/mcp` → Supabase → Authenticate di terminal. Ini terpisah dari koneksi aplikasi dan tidak menggantikan variabel environment.
