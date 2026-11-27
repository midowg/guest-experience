# Standar tampilan admin Journey

Disepakati 21 November 2026. Berlaku untuk semua halaman admin: Beranda, editor acara, halaman tamu dan
operasional, super admin, Admin WAM, TV, dan HR. Tujuannya satu: **orang awam bisa langsung memakainya
tanpa diajari**, di laptop maupun HP. Halaman yang dirombak mengikuti standar ini; halaman lama
menyusul satu per satu.

Acuan: pola CMS yang dikenal awam (Notion, Webflow, Shopify), pedoman UX skill `ui-ux-pro-max`
(formulir, sentuhan, navigasi, aksesibilitas), dan `brain/aturan/desain-ui.md`.

## 1. Kerangka setiap halaman

Urutan dari atas, sama di semua halaman:

1. **Header tetap**: logo, tombol Beranda (tidak muncul saat sudah di Beranda), nama orang, Keluar.
2. **Kepala halaman**: ← kembali, gambar kecil (logo aplikasi atau foto acara), judul, satu baris
   keterangan (jenis · status · terakhir disimpan), dan **satu** aksi utama di kanan.
3. **Tab** bila halaman punya beberapa bagian (bukan dropdown). Di HP tab digeser ke samping.
4. **Isi**.

Contoh yang sudah jadi: Beranda (`EventList`) dan kepala acara (`EventHeader`).

## 2. Bahasa

- Kata sehari-hari, bukan istilah teknis: "Simpan", "Terbitkan", "Buka halaman tamu",
  bukan "Submit", "Publish", "Deploy", "slug", "RSVP endpoint".
- Tombol diawali kata kerja dan menyebut bendanya: "Buat acara", "Tambah tamu", "Unduh Excel".
- Status selalu memakai kata yang sama dan warna yang sama:
  **Draf** (kuning), **Akan datang** (hijau), **Hari H** (merah muda), **Selesai** (biru),
  **Arsip** (abu-abu), **Tayang** (hijau).
- Pesan galat menyebut apa yang salah dan cara memperbaikinya, di bawah kolomnya.
- Kosong bukan kesalahan: halaman kosong mengajak ("Belum ada tamu. Tambah tamu pertama").

## 3. Daftar (acara, tamu, RSVP, foto, akun)

- Satu baris per item: gambar kecil, judul, keterangan, status, lalu aksi di kanan.
- **Klik baris = buka/kelola.** Tombol ↗ = buka di tab baru (halaman tamu, aplikasi).
- Aksi jarang dan berbahaya di menu ⋯ (Duplikasi, Arsipkan, Hapus). Hapus selalu lewat konfirmasi.
- Di atas daftar: saringan berupa chip dengan jumlahnya, kolom cari, dan tombol tambah di kanan.
- Di HP tabel menjadi daftar; kolom yang tidak penting disembunyikan, bukan digeser.

## 4. Editor (formulir)

- **Menu samping + pratinjau besar** (dipilih 22 Nov 2026, opsi D di `/dev-preview/editor-opsi`):
  menu bagian yang jelas di kiri, dikelompokkan; isi bagian yang dipilih **terbuka di dalam menunya**;
  pratinjau besar mengisi sisa layar dan selalu tampil utuh (tidak ada bagian HP yang tertinggal di
  bawah layar). Berlaku untuk semua jenis acara kecuali Kartu dan E-Guide, yang editornya memang lain.
- Di HP dan tablet: menu menjadi daftar; ketuk satu bagian, isinya terbuka sebagai **lembar penuh**
  dengan tombol "Lihat pratinjau" dan "Selesai".
- Satu kartu per bagian. Yang wajib di atas; yang jarang dipakai dilipat ("Pengaturan lanjutan").
- Setiap kolom punya **label yang terlihat**, contoh isian sebagai placeholder, dan petunjuk singkat
  bila perlu. Tidak ada kolom tanpa label.
- **Simpan otomatis** dengan status yang selalu terlihat: "Menyimpan…", "Tersimpan 10.42",
  "Gagal menyimpan · Coba lagi". Tombol Simpan tetap ada untuk yang ingin yakin.
- Bagian yang belum lengkap diberi tanda di daftar bagian ("Perlu diisi"), dan Terbitkan
  menyebut apa yang masih kurang, dengan tautan langsung ke kolomnya.
- Pilihan sedikit = tombol/chip, bukan dropdown. Tanggal dan jam memakai pemilih bawaan perangkat.
- Unggah foto: seret-lepas atau ketuk, pratinjau langsung, potong/geser titik fokus.

## 5. Pratinjau seperti aslinya

- Pratinjau memakai **halaman tamu yang sebenarnya** (komponen yang sama, font, foto, warna),
  bukan gambar tiruan, dan ikut berubah saat mengetik, termasuk yang belum disimpan.
- Ukuran asli perangkat: **HP 390×844** (bawaan), tablet, dan desktop, bisa dipilih.
- Kolom yang sedang diisi disorot di pratinjau; ketuk bagian di pratinjau membuka kolomnya.
- Bisa melihat fase (Sebelum acara, Hari H, Setelah acara) dan bahasa (ID/EN).
- Tombol "Buka di tab baru" untuk melihat layar penuh.

## 6. HP

- Semua bisa dilakukan dari HP; tidak ada halaman yang perlu digeser ke samping (diuji di 320 px).
- Editor di HP: dua tab di atas, **Isi** dan **Pratinjau**; tombol Simpan/Terbitkan menempel di bawah.
- Formulir, detail, dan menu terbuka sebagai **lembar dari bawah** (bottom sheet).
- Target sentuh minimal 44 px, jarak antar target minimal 8 px.
- Teks isian minimal 16 px supaya HP tidak memperbesar layar saat mengetik.

## 7. Rasa aplikasi (bukan situs lama)

Sesuai `brain/aturan/desain-ui.md`:
- Pindah halaman tidak memuat ulang seluruh layar; kerangka tetap, isi berganti.
- Data tersimpan di cache dan diperbarui diam-diam; loading berupa kerangka per bagian.
- Setiap aksi langsung terlihat hasilnya, dengan status (menyimpan, berhasil, gagal + coba lagi).

## 8. Tampilan

- Latar abu-abu muda, kartu putih bergaris tipis, sudut 12–16 px, satu warna utama (biru Werkudara).
- Foto dan logo asli di depan; tanpa ilustrasi tiruan. Tanpa ungu, tanpa gradasi berat.
- Hover: kartu/baris naik 2 px atau berganti latar; foto membesar sedikit di dalam bingkainya.
- Gerak 150–300 ms, mati bila perangkat memakai "kurangi gerak".
- Kontras teks minimal 4,5:1; setiap tombol ikon punya nama untuk pembaca layar.

## 9. Sebelum push

- [ ] Kerangka (bagian 1) dan bahasa (bagian 2) sesuai.
- [ ] Dicek di 1440, 768, 390, dan 320 px: tidak ada geser ke samping, tidak ada yang bertumpuk.
- [ ] Semua aksi punya status; hapus lewat konfirmasi.
- [ ] Tes, lint, typecheck, dan build lulus.

## Urutan penerapan

1. Beranda — selesai (21 Nov 2026).
2. Kepala dan tab semua halaman acara — selesai (21 Nov 2026).
3. Isi editor acara: menu samping + pratinjau besar — selesai (22 Nov 2026). Simpan otomatis menyusul.
4. Tamu dan RSVP: daftar sesuai bagian 3, tambah dan ubah tamu di lembar samping — selesai (27 Nov 2026). Check-in menyusul.
5. BEO, Galeri, Survei, Donasi.
6. Super admin.
7. Admin WAM, TV, HR.
