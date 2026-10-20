# Checklist konten sebelum publikasi

## Sudah bersumber
- Judul: Rapat Panitia Inti dan Koordinator.
- Penyelenggara: Panitia Hari Suci Nyepi Tahun Saka 1949 D.I. Yogyakarta.
- Senin, 12 Oktober 2026. Kedatangan 18.00 WIB, pembahasan pertama 18.10 WIB, selesai sesuai rundown 21.00 WIB.
- Lokasi PT. Werkudara dan alamat dari handbook.
- Tautan Google Earth persis yang diberikan pengguna.
- Empat topik pembahasan dan empat agenda dari DOCX.
- Ikon Werkudara asli dalam proyek.

Sumber utama: handbook DOCX lokal (tidak disertakan dalam repository publik), serta konfirmasi eksplisit tanggal pengguna. Gambar undangan lama tidak digunakan sebagai final karena hari/tanggalnya tidak sesuai. Jangan menyalin stempel/tanda tangan untuk membuat dokumen baru.

## Menunggu
- Foto kantor/pintu masuk dan denah beratribusi. Latar pembuka 2400×1500 px, galeri 1600×1000 px, rasio 16:10, maksimal 8 MB. Hindari objek penting di tepi karena terpotong di ponsel; titik fokus dapat diatur di editor.
- Petunjuk parkir/titik sambut serta narahubung bila memang diperlukan.
- Pertanyaan Guest Satisfaction yang disetujui GA.
- Tautan review Google resmi.
- Kebijakan retensi RSVP/kebutuhan makanan dan pemberitahuan privasi yang disetujui penyelenggara.

Jangan isi dengan contoh yang tampak nyata. Foto, review dan survei tidak ditampilkan jika belum ada konten/aktivasi. Simpan draft sampai konten inti diverifikasi.

## Pemeriksaan operasional
- `ADMIN_PASSWORD` dan `ADMIN_SESSION_SECRET` sudah diisi di server, password hanya dibagikan kepada panitia yang perlu, dan Log akses (`/admin/akses`) mencatat login pertama.
- Persetujuan penyelenggara untuk pemrosesan data RSVP/kontak/kebutuhan makanan dan kebijakan retensinya sudah ada sebelum menerima data nyata.
- Bila suatu saat Preview memakai Supabase yang sama dengan Production, pengujian di Preview tidak mengubah atau menghapus data produksi.
- URL acara diterbitkan dengan sengaja, tidak dari seed otomatis.
- RSVP benar-benar masuk database dan dapat dilihat admin.
- Pernyataan "konfirmasi diterima" bukan verifikasi kehadiran fisik.
- Tamu tidak dapat membaca jawaban orang lain, termasuk alergi.
- Uji tautan Google Earth pada HP; sediakan alamat teks sebagai alternatif.
- Review Google tidak ditahan hanya untuk tamu yang puas.
- Simpan perubahan dan verifikasi kembali dengan browser tamu terpisah.
