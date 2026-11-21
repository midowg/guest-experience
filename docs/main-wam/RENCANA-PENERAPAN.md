# Rencana penerapan prototipe final Main WAM (21 Nov 2026)

Aplikasi Main WAM (`/wam/acara`) sudah dibangun dari prototipe lama (lihat `STATUS.md`). Prototipe final
(`D:\projects\events\2027-01-werkudara-wam\aplikasi\prototipe\prototipe-wam.html`, keputusan di
`D:\projects\brain\keputusan.md`, entri 21 Nov 2026) menambah dan mengubah beberapa hal. Dokumen ini membagi
pekerjaan penyelarasannya. Urutan: **admin dulu, lalu aplikasi peserta.** Semua pekerjaan tetap di cabang lokal,
belum di-push dan migrasi belum dijalankan (pemilik yang menjalankan, lihat `aturan-wam.md` §1).

## Pembagian (gelombang 1, paralel, tiap agen di cabang sendiri dari `feat/main-wam`)

| Agen | Cabang | Isi | Migrasi |
| --- | --- | --- | --- |
| S1 | `s1-persiapan` | Ceklis per agenda (teks + foto), tab H-n "Persiapan", syarat ceklis opsional (kunci absen), Detail sesi jadi bottom sheet tinggi menyesuaikan isi | `20261125xxxx` |
| S2 | `s2-misi` | Misi + poin + Peringkat: admin Misi, kartu Misi di Beranda, halaman Misi, sheet, kamera misi (tanpa galeri, lokasi wajib), peringkat | `20261126xxxx` |
| S3 | `s3-kuis` | Kuis live: builder, kontrol MC, layar besar, alur HP (soal tidak tampil di HP, pilihan tampil), skor server | `20261127xxxx` |
| S4 | `s4-ui-prototipe` | Selaraskan UI yang sudah ada: Splash/Login (+gelap, garis emas mengalir), dialog loading kit, Pengaturan (bahasa ID/EN berbendera), Saya, Katalog emisi, kartu Mozaik Beranda, Momen (satu reaksi, rincian reaksi, tata letak), scrollbar tersembunyi | `20261128xxxx` bila perlu |

## Gelombang 2 (PM)
Gabung keempat cabang ke cabang kerja bersama (`feat/main-wam-penerapan`), selesaikan konflik di berkas bersama
(`routes.ts`, `types.ts`, `modules.ts`, `sections.ts`, kamus i18n, kartu Beranda), jalankan `tsc`, `eslint`,
`vitest` penuh, tinjau silang per cabang, perbarui `STATUS.md`, `KONTRAK.md`, dan `aturan-wam.md` §11.

## Belum diputuskan pemilik (tetap pertanyaan terbuka)
- Syarat ceklis wajib sebelum absen: wajib atau hanya saran (dibuat opsional dan bisa dimatikan).
- Cara absen: QR peserta ke panitia atau pindai QR sesi.
- Aturan poin Misi, radius lokasi, isi ceklis asli dan foto dari panitia, faktor emisi (masih "perlu dicek").
- Daftar delapan reaksi Momen; singkatan departemen asli; jabatan asli.
