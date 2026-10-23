# Panduan tim: menjalankan acara hosting klien

Panduan singkat untuk tim internal Werkudara, dari membuat acara sampai galeri foto sesudahnya. Hal teknis (environment, migrasi, R2) ada di [setup](setup.md) dan [go-live internal](go-live-internal.md).

## Alamat yang mudah diingat

Setiap acara punya **kode 6 karakter**, misalnya `invitation.werkudara.group/AB23CD`. Undangan per tamu menambah 8 karakter: `invitation.werkudara.group/AB23CD/k7q2mx9p`. Kode tidak memakai huruf I, L, O, dan angka 1 atau 0, jadi tidak tertukar saat dibaca atau diketik, dan huruf kecil tetap diterima.

- Kode acara terlihat di blok **Identitas & undangan** (kartu **Tautan acara**, dengan tombol Salin) dan di tab **Daftar tamu** (tautan umum dan QR).
- Kode tidak berubah, jadi tautan yang sudah dicetak tetap berlaku.
- Tautan lama `/e/…` masih bisa dibuka dan otomatis pindah ke alamat baru.
- Halaman admin acara juga pendek: `/admin/acara/AB23CD`, `/admin/acara/AB23CD/undangan`, `/admin/acara/AB23CD/checkin`.

Masuk lewat `/admin` dengan password tim. Setiap login dicatat (waktu, IP, perkiraan lokasi, perangkat); catatannya bisa dilihat super admin di **Dashboard super admin › Log akses**.

## 1. Buat acara (± 1 menit)

1. **Buat acara**, lalu pilih templat: **Kunjungan klien** (satu hari, di kantor atau venue) atau **Trip klien** (beberapa hari, di luar kota). Templat lain hanya muncul bila super admin menyalakannya.
2. Isi nama acara, waktu mulai dan selesai, zona waktu (WIB/WITA/WIT), dan lokasi.
3. Opsional: ketuk foto/nama **PIC acara** dari tim.
4. Acara tersimpan sebagai **draf** dan belum bisa dibuka tamu.

Tema, bahasa, dan bagian undangan mengikuti templat. Semuanya bisa diubah di editor.

## 2. Lengkapi isi di editor

Editor terdiri dari tiga kolom: **menu bagian** di kiri, **form** di tengah, dan **ponsel** di kanan yang menampilkan undangan persis seperti dilihat tamu.

- Ponsel ikut berubah saat Anda mengetik, sebelum disimpan.
- Memilih bagian di menu menggulir ponsel ke bagian itu. Sebaliknya, **ketuk bagian di ponsel** untuk langsung membuka formnya.
- Di atas pratinjau ada pilihan **Ponsel / Web** (bawaannya Ponsel, karena kebanyakan tamu membuka dari HP) dan **Sebelum / Hari H / Sesudah** untuk melihat tampilan tiap tahap. Blok Hari H dan Setelah acara otomatis menampilkan tahapnya.
- Bagian yang bisa dinyalakan atau dimatikan (misalnya Rundown, Lokasi, RSVP, Kontak, Our Team, Survei, Ulasan Google) punya **switch di pojok kanan judulnya**. Bagian yang menyala diberi tanda **Aktif** di menu. Bagian yang selalu ada (misalnya Identitas, Waktu, Foto pembuka) tidak punya switch.
- Titik di menu menandai bagian yang **belum disimpan** (biru) atau **perlu diperbaiki** sebelum dipublikasikan (kuning/merah).
- Bilah di atas editor selalu terlihat saat menggulir. Isinya tombol **☰** untuk menu bagian, **Isi / Lihat** (di HP: ikon pensil untuk mengisi, ikon ponsel untuk melihat), dan tombol **Simpan**. Tombol bertuliskan *Tersimpan* (atau ikon centang di HP) bila tidak ada perubahan.
- **☰** di HP dan tablet membuka menu bagian dari kiri; ketuk bagian, atau di luar menu, untuk menutupnya. Di laptop, ☰ menyembunyikan atau menampilkan menu samping supaya form dan pratinjau lebih lebar.
- **Hapus acara** ada di bagian paling bawah menu. Untuk konfirmasi, ketik kode acara (misalnya AB23CD).
- Halaman acara lain dibuka dari tombol di bawah judul (misalnya **Edit acara ▾**): Daftar tamu, RSVP, Check-in, BEO, Galeri foto, Feedback. Di sebelahnya ada **Buka undangan** untuk melihat halaman tamu yang sudah tayang. Kembali ke daftar acara lewat ikon kotak-kotak di kepala halaman.
- Bagian yang dipakai templat tampil di menu. Bagian lain ada di lipatan **Bagian lain** di dasar menu; buka hanya bila perlu.
- **Jadwal**: acara lebih dari sehari otomatis tampil per hari (Hari 1, Hari 2, …). Setiap sesi punya **Tambahan (opsional)**: lokasi kegiatan, cuplikan "Kenali lebih dekat", kotak **Tahukah Anda?**, dan halaman PDF presentasi.
- **Kontak**: ketuk salah satu nama di **Pilih PIC dari tim**. Nama, jabatan, nomor WhatsApp, dan foto langsung terisi. Isi manual tetap bisa dipakai untuk PIC dari luar tim. Untuk trip, isi juga **Kontak darurat** dan rumah sakit terdekat.
- **Persiapan tamu**: dress code, barang yang dibawa, dan yang disiapkan untuk tamu.
- Chip di bawah kolom bisa diklik untuk mengisi kalimat yang umum dipakai.
- **Simpan**, cek di **Preview tersimpan**, lalu **Publikasikan**.

## 3. Undang tamu (tab Undangan tamu)

- **Tautan umum dan QR**: untuk banner, meja registrasi, atau slide. Unduh QR sebagai PNG (cetak) atau SVG (desain).
- **Tautan per tamu** (ubah cara mengundang di editor bila perlu): tambah tamu satu per satu atau **impor** dari Excel/Sheets (nama, nomor WA, jumlah pendamping).
- **Kirim via WhatsApp** membuka pesan siap kirim, yang tetap dikirim manual oleh panitia. Status **terkirim**, **dibuka**, dan **menjawab** terlihat per tamu.
- Tautan per tamu bukan bukti identitas. Kirim satu per satu, jangan sebar daftar tautan di grup.

Pratinjau tautan di WhatsApp menampilkan judul, tanggal, dan tempat. Nama tamu tidak pernah ikut tampil.

## 4. Pantau jawaban (tab RSVP)

Tamu menjawab dalam beberapa langkah singkat: hadir atau tidak, pendamping, data diri, makanan, akses, dan persetujuan. Unduh CSV bila perlu diolah.

## 5. BEO untuk hospitality (tab BEO)

1. Lihat tiga angka: **perkiraan survei**, **RSVP hadir** (termasuk pendamping), dan **jumlah disiapkan**.
2. Isi jumlah porsi/pax dan catatan untuk penyedia, lalu **Tetapkan angka** (biasanya H-3).
3. Setelah ditetapkan, angka hanya berubah lewat **Revisi angka** yang wajib diberi alasan. Muncul tanda **Perlu ditinjau** bila ada RSVP masuk atau berubah setelah angka ditetapkan.
4. **Tandai final** (biasanya H-1), lalu **Tandai selesai** setelah acara.
5. **Cetak & ekspor** punya dua versi:
   - **Versi penyedia** (pita biru): jumlah porsi, makanan khusus, alergi dengan nama depan saja, jadwal layanan, dan catatan. Ini yang dikirim ke katering/venue.
   - **Versi internal** (pita merah): ditambah nama lengkap, kebutuhan akses, angka RSVP, dan riwayat revisi. **Jangan dikirim ke penyedia.**
   - Tiap versi bisa dilihat dan dicetak di halaman A4, atau langsung **Unduh PDF**.

## 6. Hari H: check-in (tab Check-in)

- Tamu undangan personal yang menjawab hadir punya **tiket QR** di tautan mereka (tombol **Lihat tiket masuk**). Minta tamu menyimpannya sebagai gambar atau PDF sebelum berangkat.
- Di Chrome atau Edge (Android/laptop): **Pindai QR tiket**. Di iPhone: buka aplikasi **Kamera**, arahkan ke QR, lalu ketuk tautannya dan **Konfirmasi check-in**. Ponsel panitia harus sudah login.
- Tamu tanpa tiket (tautan umum, ponsel mati): cari namanya di **Daftar tamu hadir**, lalu **Check-in**.
- Layar hasil menampilkan jumlah orang, **alergi**, dan **akses**, supaya penyambut langsung tahu.
- **Sudah check-in sebelumnya** berarti tiket ini sudah dipakai; periksa apakah orangnya sama. Check-in yang salah bisa dibatalkan (ikon panah balik).
- Papan check-in butuh koneksi internet.

Halaman tamu tetap bisa dibuka tanpa sinyal setelah pernah dibuka sekali, jadi jadwal trip aman di lokasi dengan sinyal lemah.

## 7. Sesudah acara: galeri foto (tab Galeri foto)

Galeri aktif setelah bucket R2 disiapkan (lihat [setup](setup.md)).

1. **Pilih foto**, bisa banyak sekaligus. Foto baru berstatus **Menunggu tinjauan** dan belum terlihat tamu.
2. Tinjau, beri keterangan bila perlu, lalu **Tayangkan**, atau **Tayangkan semua yang menunggu**. Foto yang tidak layak bisa **Disembunyikan** atau dihapus.
3. Halaman undangan sesudah acara otomatis menampilkan tombol **Lihat dan unduh semua foto**. Tamu bisa mengunduh foto asli dan meminta foto dihapus lewat WhatsApp PIC. Tindak lanjuti permintaan itu dengan menyembunyikan atau menghapus fotonya.
4. Galeri tertutup otomatis enam bulan setelah acara.

## 8. Kartu (Studio Poster): peserta membuat kartunya sendiri

Kartu adalah jenis acara khusus, **bukan undangan**. Tidak ada rundown, RSVP, maupun lokasi; isinya hanya kartu yang diisi sendiri oleh peserta, lalu diunduh dan dibagikan atau dicetak.

- **Buat kartu:** Buat acara → templat **Kartu: poster, ucapan, ID card, sertifikat**. Cukup isi nama kartu.
- **Tautannya** `invitation.werkudara.group/KODE` langsung membuka pembuat kartu.
- **Jenis kartu**, masing-masing dengan desain bawaan:

  | Jenis | Desain bawaan | Ukuran |
  |---|---|---|
  | Poster sesi | Rempah Nusantara | Post, Story, Persegi |
  | Kartu ucapan | Ucapan Hangat | Persegi, Story, Post |
  | ID card / name tag | Name Tag | ID card, A5 |
  | Sertifikat | Sertifikat Klasik | A4 landscape, A4 |
  | Kartu undangan | Undangan Sederhana | Story, Post, A5 |

- **Warna:** lima palet (Rempah, Werkudara, Malam emas, Segar, Senja). Latar bawaan dan kotak yang memakai "warna tema" ikut berganti. Nyalakan **Peserta boleh memilih warna sendiri** kalau setiap orang boleh memilih.
- **Ukuran:**
  - untuk dibagikan: Post 4:5, Story 9:16, Persegi 1:1, Landscape 16:9;
  - untuk dicetak: A4, A4 landscape, A5, ID card. PDF ukuran cetak memakai ukuran kertas sebenarnya.

  Ukuran yang tidak disiapkan desainnya diberi tanda "atur kotak sendiri".

Studio Poster juga bisa dinyalakan sebagai bagian tambahan di acara biasa (blok **Studio Poster**, tautan `KODE/poster`).

### Menyiapkan desain di Figma

1. **Ukuran frame** sama dengan ukuran kartu, misalnya 1080×1350 (Post), 1080×1920 (Story), 1080×1080 (Persegi), atau A4 1240×1754. Frame dengan rasio yang sama juga diterima dan diskalakan.
2. **Nama layer** (opsional, tapi paling cepat) untuk bagian yang boleh diganti peserta:
   - `isi_<nama>` untuk teks, misalnya `isi_judul`, `isi_nama_fasilitator`, `isi_tanggal`;
   - `foto_<nama>` untuk foto, misalnya `foto_utama`. Kotak atau lingkaran pada layer foto menjadi bingkainya.

   Supaya kolom teks selebar areanya (bukan hanya selebar teks contoh), kelompokkan teksnya dengan **kotak transparan seukuran area**, lalu beri nama grup itu `isi_…`. Teks lain, logo, garis, dan warna menjadi latar dan tidak bisa diubah peserta.
3. **Ekspor:** pilih frame → Export → **SVG**, lalu centang **Outline text**. Kalau layer sudah diberi nama, centang juga **Include "id" attribute**.

Tanpa nama layer pun SVG tetap diterima: admin menandai bagiannya sendiri setelah mengunggah (lihat di bawah).

### Di admin (blok Studio Poster)

1. **1 · Desain:** tekan **Unggah desain dari Figma (SVG)**. Kolom terbaca otomatis dari nama layer, dan latarnya diunggah sebagai gambar.

   Kalau SVG belum punya nama layer `isi_`/`foto_`, muncul layar **ketuk bagian yang diisi peserta**:
   - pilih **Teks** atau **Foto**, lalu ketuk bagiannya di desain (ketuk lagi untuk membatalkan);
   - beri nama tiap kolom. Untuk teks yang sudah di-outline, pilih juga jumlah baris dan gaya huruf (Sans/Serif) agar ukuran hurufnya tertebak dengan benar;
   - tekan **Selesai, buat … kolom**. Bagian yang tidak diketuk tetap menjadi latar.

   Unggah lagi untuk ukuran lain (misalnya Story); kolom dengan nama yang sama digabung. Kalau tidak punya desain Figma, buka **atau pakai desain bawaan**.
2. **2 · Kolom untuk peserta:** satu baris per kolom. Ubah namanya bila perlu. Matikan **Diisi peserta** untuk teks tetap dari panitia (misalnya tautan reservasi) dan isi teksnya. Untuk kolom yang diisi peserta, petunjuk dan **Maks. huruf** boleh diubah. Batas huruf awalnya dihitung dari besar kotak di desain. Pratinjau kartu ada di sampingnya.
3. **Lanjutan** (dilipat, jarang perlu): geser kotak, ubah ukuran huruf dan warna, ukuran kartu, dan latar manual.
4. Simpan dan publikasikan, lalu bagikan tautannya: `invitation.werkudara.group/KODE` untuk acara Kartu, atau `KODE/poster` bila Studio Poster dipakai di acara biasa. Tautan selalu memakai domain publik, juga saat admin dibuka dari laptop.

   Kartu baru bisa dipublikasikan setelah migrasi `202610220003_card_publish.sql` diterapkan. Sebelum itu, simpan sebagai draf.

### Yang dilihat peserta

- **Di laptop:** form di kiri, kartu di kanan. Kartu langsung berubah saat mengetik.
- **Di HP:** kartu kecil menempel di atas, form di bawahnya.
- Foto dipilih dari perangkat, lalu bisa digeser di kartu dan di-zoom dengan slider.
- **Unduh gambar**, **PDF**, atau **Bagikan** bisa ditekan kapan saja. Kolom yang masih kosong tidak ikut tampil.

Isian dan foto peserta **tidak dikirim ke server**: semuanya tersimpan di browser HP peserta itu sendiri dan tetap ada walau halaman ditutup.

**Pustaka desain (super admin):** di blok Studio Poster, **Simpan sebagai desain baru** menyimpan latar dan kotak poster acara ini, supaya acara lain bisa memulai dari desain yang sama. Menghapus atau mengubah desain di pustaka tidak mengubah acara yang sudah memakainya. Simpan acaranya dulu kalau latarnya baru saja diunggah.

## Super admin

Menu **Dashboard super admin** (password terpisah):

- **Log akses**: catatan setiap login dan keluar.
- **Tim Werkudara**: tambah orang yang biasa menjadi PIC (nama, jabatan, nomor WhatsApp, foto). Orang yang dinonaktifkan tidak muncul di pilihan PIC. Mengubah atau menghapus data di sini tidak mengubah acara yang sudah memakai orang itu.
- **Templat Buat acara**: pilih templat yang tampil untuk tim.
- **Visibilitas**: sembunyikan acara dari admin biasa.
- **Modul**: matikan bagian acara yang tidak boleh dipakai admin biasa.

## Hal yang belum ada

Tiket untuk tamu tautan umum, check-in tanpa sinyal, denah dan pilihan kursi, dan dokumen pribadi per tamu belum dibuat. Daftar lengkapnya ada di [setup, bagian 7](setup.md#7-hal-yang-belum-tersedia).
