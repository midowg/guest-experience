# Kontrak foto — wilayah kerja dan antarmuka

> **Sebagian digantikan.** Posisi teks kini hanya `left` dan `center`, deskripsi foto
> bersifat opsional, dan pilihan fokus pemotongan dihapus dari editor. Lihat
> `revision-contract.md` untuk ketentuan yang berlaku.

Parent memiliki `src/lib/types.ts`, `validation.ts`, `seed-event.ts`, `package.json`, `supabase/**`, `docs/**`. Jangan mengubahnya; kirim usulan ke parent.

## Tipe (sudah ditetapkan di src/lib/types.ts)

```ts
type ImageSource = { width: number; url: string };
type ImageFocus = "top" | "center" | "bottom";
type HeroTextPosition = "bottom-left" | "bottom-center" | "center-left" | "center-center";
type HeroImage = { url: string; alt: string; srcset: ImageSource[]; focus: ImageFocus; text_position: HeroTextPosition };
type GalleryImage = { id; url; alt; caption; sort_order; srcset: ImageSource[] };
```

`EventRecord.hero` adalah foto latar pembuka — **satu-satunya** yang punya kontrol fokus dan posisi teks. `EventRecord.gallery` hanya untuk carousel di bagian lokasi; tidak punya fokus maupun posisi teks.

`srcset` kosong untuk foto dari tautan luar — itu sah dan harus tetap tampil normal.

## Wilayah agen

**Agen unggah** — `src/app/api/admin/photos/route.ts`, `src/lib/server/images.ts` (baru), `tests/backend/images.test.ts`.

Buat `resizeImage(bytes: Uint8Array, detectedType: string)` di `src/lib/server/images.ts`:
- Hasilkan WebP pada lebar 480, 1024, 2048 px. Jangan memperbesar foto yang lebih kecil dari target.
- Buang metadata EXIF; hormati orientasi EXIF agar foto tidak terbalik.
- Kembalikan `{ variants: { width, bytes, contentType }[] }`.
- Bila `sharp` gagal dimuat atau gagal memproses, **lempar atau kembalikan penanda gagal** — jangan diam-diam menganggap berhasil.

Endpoint mengunggah setiap varian ke bucket `event-photos`, lalu membalas `{ url, path, srcset: ImageSource[] }`. `url` tetap varian terbesar sebagai fallback. Bila pengecilan gagal, unggah berkas asli dan balas `srcset: []` **beserta pesan jujur** bahwa foto belum dioptimalkan. Pertahankan pemeriksaan magic number, batas 8 MB, nama berkas buatan server, dan `requireApiAdmin`.

**Agen tampilan tamu** — `src/components/guest/EventExperience.tsx`, `Gallery.tsx`, `guest.module.css`.

Pakai `event.hero` untuk latar pembuka, bukan lagi `gallery[0]`. Bila `hero.url` kosong, gunakan tata letak editorial seperti sekarang.
- `<img>` memakai `srcSet`/`sizes` bila `srcset` tidak kosong; tanpa itu tampil seperti sekarang.
- `object-position` mengikuti `hero.focus`.
- `.heroInner` menyesuaikan `hero.text_position` (empat posisi).
- Lapisan redup **tetap aktif pada semua posisi** dan tidak dapat dimatikan. Pada posisi tengah, redupkan area tengah secukupnya agar teks tetap terbaca di atas foto terang.
- Galeri memakai `srcset` bila ada. Tidak ada kontrol fokus di galeri.

**Agen admin** — `src/components/admin/PhotoField.tsx`, `EventEditor.tsx`, `editor-model.ts`, `admin.module.css`.

`PhotoField` menerima `srcset` dari respons unggah dan meneruskannya ke pemanggil (ubah `onChange` menjadi membawa `{ url, srcset }`). Tampilkan peringatan bila server membalas `srcset` kosong setelah unggah.

Buat kontrol foto latar di editor dengan **pratinjau berdampingan**: foto penuh di satu sisi, simulasi potongan ponsel di sisi lain, sehingga admin melihat efek pilihan fokus dan posisi teks sebelum menyimpan. Pratinjau menampilkan judul acara di atas lapisan redup agar keterbacaan terlihat nyata.

Galeri tetap seperti sekarang, hanya meneruskan `srcset`; **tanpa** kontrol fokus atau posisi teks.

Tampilkan panduan ringkas: latar 2400×1500 px, galeri 1600×1000 px, rasio 16:10, 300 KB–1,5 MB, hindari objek penting di tepi.

## Aturan kerja
Tanpa worktree — folder ini bukan repositori Git. Jangan memasang dependensi, mengubah migrasi, menyentuh berkas bersama atau wilayah agen lain, menjalankan deploy, atau mendelegasikan lagi. Setelah dua kegagalan pada pendekatan yang sama, berhenti dan tanya parent. Laporkan berkas yang diubah, tes yang dijalankan, dan keterbatasan apa adanya.
