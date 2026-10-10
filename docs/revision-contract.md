# Kontrak revisi — wilayah kerja

Parent memiliki `src/lib/**`, `supabase/**`, `docs/**`, `src/app/**`, `package.json`. Jangan mengubahnya; kirim usulan ke parent.

## Perubahan tipe yang sudah ditetapkan parent

```ts
type HeroTextPosition = "left" | "center";   // dulu empat posisi
type HeroImage = { url; alt; srcset; focus; text_position };  // focus TIDAK lagi diedit admin
type GalleryImage = { id; url; alt; caption; sort_order; srcset };  // alt kini opsional
```

`hero.focus` tetap ada di tipe agar data lama tetap terbaca, tetapi **tidak boleh muncul sebagai kontrol admin** dan nilainya selalu `center`. Validasi tidak lagi mewajibkan `hero.alt` maupun `gallery[].alt`.

## Bug yang harus diperbaiki

Foto lokasi (`venue_image_url`) tidak tampil ketika galeri berisi foto, karena ditulis sebagai cabang `else`. Galeri di bawah peta **khusus foto lokasi Werkudara**, jadi keduanya harus tampil bersama: `venue_image_url` dan isi galeri digabung menjadi satu rangkaian foto lokasi, tanpa menghilangkan salah satunya.

## Agen A — pengalaman tamu

Wilayah: `src/components/guest/**` saja.

1. **Perbaiki bug foto lokasi.** Gabungkan `venue_image_url` (beserta `venue_image_credit`) dengan `event.gallery` menjadi satu daftar foto lokasi di bawah peta. Satu foto tampil diam; dua atau lebih memakai carousel yang sudah ada. Jangan menduplikasi foto bila URL-nya sama.
2. **Dua posisi teks.** Ganti tabel empat posisi dengan `left` dan `center`. Keduanya tetap di bagian bawah pembuka. Lapisan redup tetap wajib dan tidak bisa dimatikan; kontras harus tetap memenuhi WCAG AA pada foto terang.
3. **Tombol kembali ke atas.** Muncul setelah tamu menggulir jauh, tersembunyi di awal, target sentuh minimal 44px, ada label aksesibel, hormati `prefers-reduced-motion`. Jangan menutupi tombol konfirmasi atau formulir di ponsel.
4. **Animasi halus.** Bagian yang muncul saat digulir boleh diberi transisi lembut. Wajib: konten tetap terbaca bila JavaScript gagal, dan seluruh animasi mati di bawah `prefers-reduced-motion`. Jangan memakai animasi yang menunda keterbacaan.
5. **Ikon.** Gunakan `lucide-react` yang sudah terpasang — satu keluarga ikon garis, konsisten dengan tema. Jangan memasang pustaka ikon baru.

`alt` kini opsional: bila kosong, gambar bersifat dekoratif (`alt=""`), jangan mengarang deskripsi.

## Agen B — editor admin

Wilayah: `src/components/admin/**` saja.

1. **Hapus dari editor:** field deskripsi foto latar (`hero.alt`), pilihan fokus pemotongan, dan field deskripsi pada tiap foto galeri. Keterangan foto (`caption`) tetap ada dan opsional.
2. **Posisi teks:** dua pilihan saja, rata kiri atau rata tengah.
3. **Pratinjau nyata:** tampilkan pratinjau foto latar yang menyerupai tampilan asli — foto, lapisan redup, judul acara, dan posisi teks terpilih. Hilangkan pratinjau potongan ponsel yang dipakai untuk memilih fokus.
4. **Galeri** diberi judul jelas sebagai foto lokasi Werkudara yang tampil di bawah peta.
5. `prepareEvent` harus memastikan `hero.focus` tetap `"center"`.

## Agen C — pengujian

Wilayah: `src/components/**/*.test.ts(x)` yang **sudah ada** dan rusak akibat perubahan tipe, plus `tests/**`. Jangan mengubah kode produksi; laporkan ke parent bila menemukan bug.

Perbarui tes yang masih memakai empat posisi atau mewajibkan `alt`. Tambahkan tes untuk: foto lokasi tetap tampil bersama galeri, dua posisi teks, dan tombol kembali ke atas. Jalankan `npx vitest run` dan laporkan apa adanya.

## Aturan kerja

Tanpa worktree — folder ini bukan repositori Git. Jangan memasang dependensi, mengubah berkas bersama atau wilayah agen lain, menjalankan migrasi/deploy/git, atau mendelegasikan lagi. Jangan menjalankan `npm run build` atau dev server; parent yang melakukannya. Verifikasi pekerjaan Anda dengan `npx tsc --noEmit` dan `npx eslint` pada berkas Anda. Setelah dua kegagalan pada pendekatan yang sama, berhenti dan tanya parent. Laporkan berkas yang diubah dan keterbatasan apa adanya.
