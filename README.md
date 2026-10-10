# Werkudara Guest Experience

Aplikasi undangan digital untuk acara Werkudara. Tamu dapat membaca informasi acara, lokasi, dan agenda, lalu mengirim konfirmasi kehadiran serta masukan melalui tautan acara. Penyelenggara mengelola isi undangan dari `/admin`.

> **Peringatan akses:** Saat ini panel `/admin` **tidak memakai login**. Siapa pun yang dapat membuka deployment publik dapat mengakses API admin, melihat dan mengekspor data RSVP (termasuk kontak dan kebutuhan makanan), mengunggah foto, serta mengubah atau menghapus acara. Repository GitHub privat sekalipun tidak melindungi deployment. Jangan gunakan data pribadi nyata sebelum risiko ini diterima dan kebijakan penanganan datanya ditetapkan; untuk membatasi akses, lindungi **halaman dan semua API admin**, bukan hanya menyembunyikan URL.

## Teknologi dan struktur

Next.js 16 (App Router), React, TypeScript, Supabase (Postgres dan Storage), dan Vercel. Node.js **20.9 atau lebih baru** diperlukan.

| Lokasi | Kegunaan |
| --- | --- |
| `src/app/e/[slug]` | Undangan yang dapat dibuka tamu untuk acara yang dipublikasikan |
| `src/app/admin` | Editor, pratinjau, dan jawaban tamu; saat ini tanpa login |
| `src/app/api` | API acara, RSVP, feedback, foto, dan administrasi |
| `src/components` | Komponen tamu, admin, dan UI bersama |
| `src/lib` | Validasi, format WIB, akses data, dan logika server |
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

`NEXT_PUBLIC_SITE_URL` ada di `.env.example`, tetapi belum dibaca oleh aplikasi saat ini; tidak diperlukan untuk menjalankan atau deploy. Lihat [panduan setup](docs/setup.md) untuk migrasi database, Storage, dan alur editor. Migrasi tidak berjalan otomatis saat build atau deploy.

## Pemeriksaan sebelum deploy

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Perintah tersebut perlu dijalankan ulang setelah perubahan terbaru; README ini tidak mengklaim hasil pengujian yang belum diverifikasi. Build Vercel memerlukan environment yang sesuai. Acara yang masih draft tidak ditampilkan pada tautan publik; publikasi dilakukan sengaja melalui editor. Semua waktu editor mengikuti WIB.

## Deploy dari GitHub ke Vercel

Alur yang diminta: **satu branch `main` untuk pengembangan; hanya push tag rilis baru yang memicu deploy**. Integrasi Git Vercel standar dapat men-deploy push branch, sehingga syarat “hanya tag” memerlukan workflow GitHub Actions tersendiri dan penonaktifan auto-deploy branch di Vercel. Workflow tersebut **belum dibuat atau diverifikasi**. Simpan variabel aplikasi di Vercel, bukan di repository; token untuk workflow kelak disimpan di GitHub Actions Secrets. Lihat [docs/deployment.md](docs/deployment.md) untuk persiapan, batasan, dan langkah yang masih menunggu verifikasi.

> **Catatan lingkungan:** Build Preview Vercel tetap memakai `NODE_ENV=production`, bukan `npm run dev`. Jika Preview dan Production memakai Supabase yang sama, keduanya membaca dan mengubah data yang sama; Preview bukan sandbox.

## Dokumen lain

- [Setup dan penggunaan](docs/setup.md)
- [Deploy dan rollback](docs/deployment.md)
- [Checklist konten](docs/content-checklist.md)
- [Sistem desain](docs/design-system.md)
