# Persiapan deploy berbasis tag

**Status: dokumentasi persiapan; workflow dan deploy belum dibuat atau diverifikasi.** Alur yang dipilih: satu branch `main` untuk perubahan biasa, sementara deployment baru terjadi ketika tag rilis baru di-push ke GitHub. Jangan menganggap push ke branch atau membuat tag lokal akan men-deploy aplikasi sebelum workflow dan konfigurasi Vercel benar-benar selesai.

## Keputusan alur

- Kerjakan, periksa, dan commit perubahan di `main`. Jangan buat branch `master`/`dev` hanya untuk target deploy.
- Rencanakan tag rilis yang jelas, misalnya `v1.0.0`, menunjuk commit yang telah diuji pada `main`. Tindakan **push tag** ke GitHub kelak menjadi pemicu workflow deploy Production. Jangan memindahkan/menggunakan ulang tag rilis untuk commit berbeda.
- Integrasi Git Vercel biasa mengikuti push branch. Untuk kebijakan **hanya tag**, nonaktifkan auto-deploy branch setelah cara resminya diverifikasi dan gunakan GitHub Actions + Vercel CLI untuk deployment berbasis tag. Jangan aktifkan dua mekanisme deploy bersamaan.
- Branch tetap satu. Jika nantinya diperlukan Preview sebelum rilis, tentukan pemicu dan batas aksesnya secara terpisah; tidak ada branch `dev` atau database uji terisolasi pada rancangan saat ini.

## Yang perlu disiapkan di GitHub dan Vercel

1. Pastikan remote GitHub adalah `https://github.com/midowg/guest-experience`, branch default `main`, dan riwayat lokal/remote tidak berbenturan. **Jangan force push.** Repository GitHub bersifat publik.
2. Buat project Vercel dengan preset Next.js. Tentukan konfigurasi Git agar push branch **tidak otomatis deploy**; verifikasi mekanisme resmi ini sebelum mengaktifkan workflow tag. Jangan mengandalkan tidak adanya domain yang diumumkan sebagai pengaman akses.
3. Simpan `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `RATE_LIMIT_SECRET`, `ADMIN_PASSWORD`, dan `ADMIN_SESSION_SECRET` di Vercel **Production**. `RATE_LIMIT_SECRET` harus acak dan panjangnya minimal 32 karakter. `NEXT_PUBLIC_SITE_URL` dari `.env.example` belum dibaca aplikasi. Variabel `NEXT_PUBLIC_*` masuk ke build browser dan perubahan nilainya memerlukan deploy baru. Jangan kirim nilai rahasia lewat chat atau commit.
4. Untuk workflow Vercel CLI berbasis tag, siapkan GitHub Actions Secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, dan `VERCEL_PROJECT_ID` setelah project Vercel tersedia. Token hanya untuk deployment CI; variabel aplikasi disimpan di Vercel. Workflow harus mengambil environment Production pada build, menjalankan pemeriksaan, lalu deploy hanya untuk tag rilis dari commit yang disetujui di `main`. Perintah dan opsi CLI harus diverifikasi terhadap dokumentasi Vercel sebelum workflow ditulis.
5. Batasi siapa yang dapat membuat/push tag rilis di GitHub dengan ruleset bila tersedia. Jangan berikan secrets deploy pada workflow pull request atau kode dari fork; hindari menjalankan build berizin token dari sumber yang tidak dipercaya.

## Database dan risiko sebelum publikasi

Tinjau migrasi `supabase/migrations/`: database baru memerlukan 001–007 secara berurutan; database yang sudah sampai 006 memerlukan hanya `202610090007_server_managed_admin.sql`. Jangan terapkan ulang seed pada database yang telah diedit. Migrasi **tidak** dijalankan otomatis saat build/deploy. Jika penyimpanan admin menghasilkan “Akses admin diperlukan”, periksa migrasi 007 dan kesesuaian `SUPABASE_SECRET_KEY` dengan project Supabase, tanpa menampilkan kuncinya.

> **Penting:** `/admin` dan semua API admin dilindungi password bersama dari `ADMIN_PASSWORD`; tanpa variabel itu panel terkunci. Setiap login tercatat di Log akses (`/admin/akses`) setelah migrasi `202610200001_admin_access_log.sql` diterapkan. Siapa pun yang memegang password dapat melihat/mengekspor data tamu dan mengubah acara, jadi bagikan secukupnya dan ganti bila ada yang keluar dari tim. Sebelum menerima data pribadi nyata, dapatkan persetujuan penyelenggara dan tetapkan kebijakan retensi.

Jika suatu saat ada Preview, jangan anggap ia lingkungan aman: bila memakai project Supabase yang sama, operasi di Preview mengubah acara, RSVP, feedback, Storage, dan featured event yang sama dengan Production. Build Preview tetap memakai `NODE_ENV=production`.

DOCX handbook, foto mentah, catatan sumber, dan `screenshots/` tetap lokal dan diabaikan Git untuk repo publik. Jangan paksa menambahkannya ke Git; periksa pula sejarah commit. Bila secret pernah terunggah, rotasi kunci—menghapus file di commit baru tidak menghapus riwayatnya.

## Pemeriksaan sebelum rilis

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Next.js 16 memerlukan Node.js minimal 20.9. Periksa commit yang akan ditandai, branch remote, variabel Vercel, migrasi, dan checklist konten sebelum membuat serta push tag rilis. Setelah workflow kelak aktif, periksa hasil GitHub Actions dan deployment Vercel. Jika deployment gagal, periksa log tanpa membocorkan secret. Rollback aplikasi dapat memakai deployment sebelumnya atau revert kode lalu membuat tag rilis **baru**; rollback aplikasi tidak memulihkan data/migrasi database.
