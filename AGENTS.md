<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Format commit

Gunakan subjek singkat dan jelas dalam bahasa Indonesia dengan awalan Conventional Commits, misalnya `feat: tambah formulir RSVP`, `fix: rapikan navigasi`, `refactor: sederhanakan editor`, `docs: perbarui panduan`, atau `chore: siapkan CI`. Kelompokkan perubahan berdasarkan tujuan; hindari nama agen, promosi, atau footer tambahan yang tidak diwajibkan instruksi sesi.

## Migrasi Supabase

Semua file migrasi di `supabase/migrations/<aplikasi>/` (journey, karyawan, wam, wam-2026, tv, booking, wlm,
people, coffee, refleksi; aplikasi baru = folder baru). Nama `YYYYMMDDNNNN_nama.sql` dengan nomor unik di
semua folder: cek nomor terakhir di semua folder sebelum membuat yang baru. Rincian:
`supabase/migrations/README.md`; dijaga `src/lib/migrations-layout.test.ts`. Folder `.claude/` dan
`supabase/.temp/` tidak pernah masuk git.

## Aturan WAM

Sebelum mengubah aplikasi WAM, Admin WAM, atau super admin, baca `docs/aturan-wam.md`: aturan yang
berlaku selama masa pembangunan (proses rilis, data dan privasi, struktur organisasi, nama dan
sapaan, Book ruang, absen, tampilan). Keputusan baru diperbarui di sana.
