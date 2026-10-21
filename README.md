# Werkudara Guest Experience

Aplikasi undangan digital untuk acara Werkudara. Tamu dapat membaca informasi acara, lokasi, dan agenda, lalu mengirim konfirmasi kehadiran serta masukan melalui tautan acara. Penyelenggara mengelola isi undangan dari `/admin`.

Panel `/admin` memakai password bersama dan mencatat setiap login (lihat [setup](docs/setup.md#3-login-admin-dan-log-akses)). Super admin memakai password terpisah untuk menyembunyikan acara, membatasi modul, dan memilih templat. Untuk cara pakai sehari-hari, baca [panduan tim](docs/panduan-tim.md).

## Teknologi dan struktur

Next.js 16 (App Router), React, TypeScript, Supabase (Postgres dan Storage), dan Vercel. Node.js **20.9 atau lebih baru** diperlukan.

| Lokasi | Kegunaan |
| --- | --- |
| `src/app/[code]` | Undangan tamu di alamat pendek (`/AB23CD`, `/AB23CD/k7q2mx9p`); `src/app/e/[slug]` mengalihkan alamat lama |
| `src/app/admin` | Editor, undangan tamu, RSVP, check-in, BEO, galeri, dan dashboard super admin (perlu login) |
| `src/app/api` | API acara, RSVP, feedback, foto, check-in, dan administrasi |
| `src/components` | Komponen tamu, admin, dan UI bersama |
| `src/lib` | Validasi, zona waktu WIB/WITA/WIT, kamus wording ID/EN, akses data, dan logika server |
| `supabase/migrations` | Skema, fungsi database, dan kebijakan akses |
| `docs/` | Panduan setup, deploy, desain, dan checklist konten |
| `screenshots/` | Hasil pemeriksaan tampilan lokal; diabaikan Git pada repo publik |

## Menjalankan secara lokal

```bash
npm ci
# Salin .env.example menjadi .env.local, lalu isi nilainya secara lokal.
npm run dev
```

Buka `http://localhost:3000`. Jangan commit `.env`, `.env.local`, atau kunci lain. Nama variabel yang digunakan:

| Variabel | Keterangan |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL project Supabase; terlihat oleh browser |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key; terlihat oleh browser, dibatasi RLS |
| `SUPABASE_SECRET_KEY` | Kunci server; **jangan pernah** beri awalan `NEXT_PUBLIC_` |
| `RATE_LIMIT_SECRET` | Nilai acak minimal 32 karakter untuk pembatasan laju |
| `NEXT_PUBLIC_SITE_URL` | Alamat publik situs; dipakai untuk pratinjau tautan WhatsApp, QR, dan tiket |
| `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` | Password admin (min. 8) dan rahasia sesi (min. 32); tanpa keduanya `/admin` terkunci |
| `SUPER_ADMIN_PASSWORD` | Opsional; password super admin, harus berbeda dari password admin |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Opsional; galeri foto di Cloudflare R2. Selama kosong, galeri menampilkan "penyimpanan belum disiapkan" |

Di berkas `.env` lokal, beri tanda kutip pada nilai yang mengandung `#` atau `$`. Lihat [panduan setup](docs/setup.md) untuk migrasi database, Storage, dan alur editor. Migrasi tidak berjalan otomatis saat build atau deploy.

## Pemeriksaan sebelum deploy

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Perintah tersebut perlu dijalankan ulang setelah perubahan terbaru; README ini tidak mengklaim hasil pengujian yang belum diverifikasi. Build Vercel memerlukan environment yang sesuai. Acara yang masih draft tidak ditampilkan pada tautan publik; publikasi dilakukan sengaja melalui editor. Waktu acara mengikuti zona yang dipilih di editor (WIB, WITA, atau WIT).

## Deploy dari GitHub ke Vercel

Vercel men-deploy branch `main` ke `invitation.werkudara.group`. Kerjakan perubahan di branch terpisah, buka pull request, lalu gabungkan ke `main` setelah pemeriksaan lulus. **Terapkan migrasi database lebih dulu, baru gabungkan kodenya**; kode sudah tahan bila migrasi belum ada, tetapi fitur barunya baru aktif setelah migrasi. Urutan dan cara mengecek migrasi ada di [go-live internal](docs/go-live-internal.md). Lihat juga [docs/deployment.md](docs/deployment.md).

> **Catatan lingkungan:** Build Preview Vercel tetap memakai `NODE_ENV=production`, bukan `npm run dev`. Jika Preview dan Production memakai Supabase yang sama, keduanya membaca dan mengubah data yang sama; Preview bukan sandbox.

## Dokumen lain

- [Panduan tim: menjalankan acara hosting klien](docs/panduan-tim.md)
- [Go-live internal dan daftar migrasi](docs/go-live-internal.md)
- [Struktur kode: letak bagian dan cara menambah fitur](docs/struktur-kode.md)
- [Setup dan penggunaan](docs/setup.md)
- [Deploy dan rollback](docs/deployment.md)
- [Checklist konten](docs/content-checklist.md)
- [Sistem desain](docs/design-system.md)
