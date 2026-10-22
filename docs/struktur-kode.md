# Struktur kode

Peta singkat supaya perubahan berikutnya mudah dicari dan tidak merusak bagian lain.

## Folder utama

| Lokasi | Isi |
| --- | --- |
| `src/app/` | Halaman dan rute (Next.js App Router). `[code]/` untuk tamu (alamat pendek), `e/` untuk alamat lama yang dialihkan, `_guest/` berisi pencarian dan perenderan halaman tamu yang dipakai keduanya, `admin/` untuk panitia (`admin/acara/[ref]` per acara), `api/` untuk API, `dev-preview/` untuk cek tampilan tanpa login (404 di produksi). |
| `src/components/guest/` | Tampilan tamu: `EventExperience` (halaman undangan), panel per fase, RSVP, tiket, galeri. |
| `src/components/poster/` | Studio Poster untuk tamu: `PosterCanvas` (poster DOM berskala), `PosterStudio` (Edit/Simpan/Unduh), `layout.ts` (ukur dan tata teks), `export.ts` (canvas → PNG/PDF/Bagikan), `draft.ts` (draf di IndexedDB). |
| `src/components/admin/` | Tampilan admin, dibagi per fitur (lihat bawah). `admin.module.css` dipakai bersama. |
| `src/components/ui/` | Komponen dasar bersama: `Button`, `ButtonLink`, `Field`, `Notice`. |
| `src/lib/` | Logika tanpa tampilan: tipe (`types.ts`), validasi (`validation.ts`), format waktu, tema, kamus wording, dan **alamat (`routes.ts`)**. |
| `src/lib/server/` | Kode server saja (Supabase, R2, sesi admin). Tidak boleh diimpor komponen browser. |
| `supabase/migrations/` | Skema database, berurutan menurut nama. |
| `tests/backend/` | Uji SQL lokal per migrasi (`*-check.sql`), dijalankan `run-migrations-local.sh` dengan Docker. |

### `src/components/admin/`

| Folder | Isi |
| --- | --- |
| `shared/` | `AdminShell` (kerangka dan navigasi), `api.ts` (`adminRequest`), `PhotoField`, tombol login/keluar |
| `editor/` | Editor acara: `EventEditor` (menu, form, simpan), `kit.ts` (alat bersama), `editor-model.ts` (daftar blok dan status), `blocks/` (satu berkas per blok form), `PhonePreview` + `LivePreviewFrame` (pratinjau ponsel dalam iframe), `StaffPicker`, `JourneyEditor`, `TranslationEditor`, `HeroPreview`, `editor.module.css` |
| `events/` | Daftar acara, Buat acara, galeri templat, hapus acara |
| `invitations/` | Undangan per tamu, tautan umum dan QR |
| `responses/` | Daftar RSVP dan feedback |
| `beo/` | BEO, halaman cetak, dan PDF |
| `checkin/` | Papan check-in, pemindai QR, konfirmasi tiket |
| `gallery/` | Galeri foto R2 |
| `super/` | Dashboard super admin (Tim Werkudara, templat, visibilitas, modul) |

## Alamat: selalu lewat `src/lib/routes.ts`

Setiap path dibangun oleh fungsi di `routes.ts`: `eventPath`, `invitationPath`, `ticketPath`, `galleryPath`, `calendarPath`, `adminEventPath`, `adminApi`, dan `guestApi`. Tes `routes.test.ts` gagal bila ada path yang ditulis manual di berkas lain (`"/e/…"`, `` `/admin/events/…` ``, `/api/…`).

Untuk mengganti bentuk alamat, cukup ubah `routes.ts` dan rute di `src/app/`.

## Pratinjau ponsel di editor

`PhonePreview` memuat `/admin/pratinjau-langsung` di iframe 390×844 dan mengirim draf lewat `postMessage` (kontrak pesan di `src/lib/live-preview.ts`). Iframe dipakai agar halaman tamu berjalan di lebar ponsel sungguhan: media query, `position: fixed`, dan scroll tidak bercampur dengan halaman admin. Peta bagian undangan ↔ blok editor ada di `blockOfArea`/`areaOfBlock`.

## Menambah blok baru di editor

1. Tambahkan entri ke `editorBlocks` di `editor/editor-model.ts` (id, judul, tahap). Bila bagian itu bisa dimatikan super admin, petakan ke modul di `src/lib/admin-modules.ts` (`moduleBlocks`).
2. Buat `editor/blocks/NamaBlock.tsx` yang menerima `{ kit }: { kit: EditorKit }`. Baca dari `kit.event`, tulis lewat `kit.update(...)`, dan pakai `kit.control(...)` untuk kolom: id kolom harus sama dengan path data (misalnya `contact.name`), supaya ringkasan galat bisa memfokuskannya.
3. Panggil di `EventEditor.tsx`: `{block("id", "Judul", <NamaBlock kit={kit} />)}`.
4. Petakan path data ke blok di `fieldBlocks` (`editor-model.ts`) bila awalan path-nya baru.
5. Tambahkan contoh kalimat dan chip di `editor/suggestions.ts` bila perlu.

## Studio Poster

- Model di `src/lib/poster.ts`: kotak dalam piksel desain (dari Figma) per format (Post 1080×1350, Story 1080×1920). `fitText` menentukan ukuran huruf dan baris. Hasilnya dipakai **layar dan unduhan sekaligus**, sehingga keduanya sama.
- Desain bawaan ada di `src/lib/poster-presets.ts`: jenis kartu, ukuran yang disiapkan, palet awal, dan per ukuran `decor` (bentuk latar) serta posisi kotak. Latar digambar di browser dari palet sebagai SVG (data URL) memakai ikon dari `src/lib/poster-icons.ts`, yang dibuat oleh `npm run poster:icons`. Latar tidak berisi teks, karena SVG yang digambar sebagai gambar tidak bisa memakai font halaman.
- Ukuran (`posterSizes`, termasuk ukuran kertas PDF), jenis kartu (`cardTypes`), dan palet (`posterPalettes`) ada di `src/lib/poster.ts`. Kotak memakai `tone` (peran palet), sehingga satu desain berlaku di semua palet.
- Acara jenis `kartu` (`event_kind`): editornya hanya berisi blok `poster` dan `publication` (`cardBlocks` di `EventEditor.tsx`), halaman tamunya `PosterPage`, dan syarat publikasi undangan dilewati.
- **Menambah desain bawaan:** tambah objek di `posterPresets` beserta latarnya, lalu jalankan tes `src/lib/poster.test.ts`, yang memastikan setiap kotak berada di dalam format dan lolos validasi.
- **Pustaka desain** dari admin disimpan di tabel `poster_designs` (`src/lib/server/poster-designs.ts`, API `/api/admin/poster-designs`).
- Font poster hanya yang dimuat di `src/app/layout.tsx` (`posterFonts`). Font baru dari Figma harus ditambahkan di kedua tempat itu.

## Menambah isi acara baru (tanpa migrasi)

`events.content` adalah JSONB. Kunci baru tersimpan tanpa migrasi:

1. Tambah tipe di `src/lib/types.ts` (`EventRecord`).
2. Tambah skema di `src/lib/validation.ts`.
3. Isi nilai bawaan untuk acara lama di `normalizeEvent` (`src/lib/hero-framing.ts`) dan di `src/lib/seed-event.ts`.
4. Tampilkan di komponen tamu.

## Menambah tabel atau fungsi database

1. Buat `supabase/migrations/<tanggal><urut>_<nama>.sql` dengan header "LOCAL REVIEW ONLY", dibungkus `begin;`/`commit;`. Kunci akses: `enable row level security`, `revoke all … from public, anon, authenticated`, lalu `grant … to service_role`.
2. Buat `tests/backend/<nama>-check.sql`, lalu jalankan `bash tests/backend/run-migrations-local.sh` (butuh Docker).
3. Di server, tangani "migrasi belum diterapkan" (kode galat `42P01`, `PGRST205`, `42703`, `PGRST204`, `42883`): fitur menampilkan pesan "menunggu migrasi", bukan galat. Contoh: `src/lib/server/admin-settings.ts`, `beo.ts`, `gallery.ts`.
4. Tambahkan berkasnya ke tabel migrasi di `docs/go-live-internal.md`. Pemilik yang menerapkannya ke Supabase.

## Wording tamu

Semua teks sistem di halaman tamu berasal dari `docs/wording-draf.xlsx` (sheet "Antarmuka tamu"). Setelah mengubah xlsx, jalankan `npm run wording`; berkas `src/lib/wording/dictionary.ts` dibuat ulang otomatis. Placeholder memakai nama Indonesia (`{nama}`, `{acara}`, `{tautan}`, `{menit}`) atau `{n}`, `{total}`.

## Pemeriksaan sebelum commit

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
