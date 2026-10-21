# Panduan tim: menjalankan acara hosting klien

Panduan singkat untuk tim internal Werkudara, dari membuat acara sampai galeri foto sesudahnya. Hal teknis (environment, migrasi, R2) ada di [setup](setup.md) dan [go-live internal](go-live-internal.md).

Masuk lewat `/admin` dengan password tim. Setiap login dicatat (waktu, IP, perkiraan lokasi, perangkat); lihat di menu **Log akses**.

## 1. Buat acara (± 1 menit)

1. **Buat acara**, lalu pilih templat: **Kunjungan klien** (satu hari, di kantor atau venue) atau **Trip klien** (beberapa hari, di luar kota). Templat lain hanya muncul bila super admin menyalakannya.
2. Isi nama acara, waktu mulai dan selesai, zona waktu (WIB/WITA/WIT), dan lokasi.
3. Acara tersimpan sebagai **draf** dan belum bisa dibuka tamu.

Tema, bahasa, dan bagian undangan mengikuti templat. Semuanya bisa diubah di editor.

## 2. Lengkapi isi di editor

- Bagian yang dipakai templat tampil lebih dulu. Bagian lain ada di **Bagian lain yang bisa ditambahkan**; buka hanya bila perlu.
- **Jadwal**: acara lebih dari sehari otomatis tampil per hari (Hari 1, Hari 2, …). Setiap sesi punya **Tambahan (opsional)**: lokasi kegiatan, cuplikan "Kenali lebih dekat", kotak **Tahukah Anda?**, dan halaman PDF presentasi.
- **Kontak**: isi PIC. Untuk trip, isi juga **Kontak darurat** dan rumah sakit terdekat.
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

## Super admin

Menu **Dashboard super admin** (password terpisah):

- **Templat Buat acara**: pilih templat yang tampil untuk tim.
- **Visibilitas**: sembunyikan acara dari admin biasa.
- **Modul**: matikan bagian acara yang tidak boleh dipakai admin biasa.

## Hal yang belum ada

Tiket untuk tamu tautan umum, check-in tanpa sinyal, denah dan pilihan kursi, dan dokumen pribadi per tamu belum dibuat. Daftar lengkapnya ada di [setup, bagian 7](setup.md#7-hal-yang-belum-tersedia).
