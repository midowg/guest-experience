# Aturan WG Coffee (`/coffee`)

Klaim jatah kopi bulanan dari mesin JumpStart di pantry, pesanan rapat untuk tamu dan tim, dan antrean
pengelola. Aturan pemakaian untuk tim; rincian teknis ada di `docs/coffee/RENCANA-PENERAPAN.md`, urutan
membuka ke karyawan di `docs/coffee/GO-LIVE.md`. Aturan kerja umum repo (rilis, migrasi, data pribadi,
pemeriksaan) tetap mengikuti `docs/aturan-wam.md` §1–§2.

## 1. Alamat dan siapa boleh apa

| Tempat | Alamat | Siapa | Untuk apa |
| --- | --- | --- | --- |
| Aplikasi karyawan | `/coffee` (Menu), `/coffee/pesanan` (Pesanan saya), `/coffee/masuk` | Semua karyawan aktif yang punya akun (akun yang sama dengan WAM, Booking Kantor, WG People) | Mengajukan klaim, melihat status, membatalkan yang belum diproses |
| Tablet GA | `/coffee/ga` (Mode GA), `/coffee/ga/masuk` (masuk khusus tablet) | Kelompok GA (kategori `dw`), Admin Booking, dan pemegang akses WG Coffee | Pesanan rapat: minuman tamu dan tim di ruangan, buku menu untuk tamu |
| Pengelola | `/admin/coffee` (Antrean), `/admin/coffee/rekap`, `/admin/coffee/menu`, `/admin/coffee/pengaturan` | Super admin, dan orang yang dicentang **WG Coffee** di Super admin → Akses admin | Membeli di mesin, menekan Selesai atau Tolak, Catat manual, Rekap, Menu, Pengaturan |

- Pengelola masuk ke admin dengan **akun karyawan sendiri**. Super admin bisa memproses, tetapi tidak
  bisa menerima notifikasi (masuknya bukan milik satu orang).
- **Tablet GA: buka `journey.werkudara.group/coffee/ga`, masuk dengan akun karyawan GA** (email kantor
  dan password yang sama dengan Journey; tidak ada akun khusus tablet). Tanpa sesi, `/coffee/ga`
  membuka `/coffee/ga/masuk`; setelah masuk langsung ke Mode GA. Password awal → "Buat password baru"
  → Mode GA. "Lupa password?" di sana kembali ke halaman masuk tablet.
- Akun yang masuk tetapi tidak berhak Mode GA melihat "Akun ini belum punya akses Mode GA. Minta
  pengelola WG Coffee." dengan tombol **Keluar dan masuk dengan akun lain** dan tautan ke aplikasi
  karyawan (tidak lagi dikembalikan diam-diam ke `/coffee`).
- **Keluar di tablet:** tombol **Keluar** di bilah atas (setelah "Aplikasi saya"), dengan konfirmasi;
  bila ada minuman yang belum dikirim, diperingatkan dulu. Notifikasi tablet itu ikut berhenti, lalu
  tablet kembali ke `/coffee/ga/masuk` tanpa data orang sebelumnya. Dari buku menu tamu tidak ada
  jalan keluar selain PIN GA; membuka `/coffee/ga/masuk` saat tablet di mode tamu kembali ke buku menu.
- Tablet GA dipasang ke layar utama dan **layarnya disematkan** (screen pinning). Mode tamu hanya
  menjaga halaman tablet, bukan bilah alamat browser.
- Kode: `src/lib/coffee/`, `src/lib/server/coffee/`, `src/components/coffee/`, `src/components/coffee-admin/`,
  `src/app/coffee/`, `src/app/api/coffee/`, `src/app/admin/coffee/`, `src/app/api/admin/coffee/`.
  Alamat dari `coffeePath`, `coffeeApi`, `coffeeAdminPath` (`src/lib/routes.ts`).

## 2. Jatah

| Hal | Aturan |
| --- | --- |
| Besarnya | Per bulan kalender (WIB): karyawan **4**, GA **2**, intern **2**. Bisa diubah pengelola di Pengaturan. |
| Yang dihitung | Klaim berstatus Diproses dan Selesai. **Ditolak dan Batal tidak memakai jatah.** |
| Lebih dari satu | Boleh ada beberapa klaim menunggu selama jatah masih ada. |
| Pesanan rapat | Tanpa jatah. Minuman tamu dicatat atas nama PIC, minuman tim atas nama orangnya. |
| Tempat menghitung | Satu tempat saja: fungsi database `coffee_submit_claim` (dikunci per orang per bulan), jadi dua ketukan cepat tidak lolos bersama. |

## 3. Status

| Status | Arti | Yang bisa dilakukan |
| --- | --- | --- |
| Diproses | Menunggu pengelola membeli di mesin | Pemesan: **Batalkan** (jatah kembali). Pengelola: Selesai atau Tolak |
| Selesai | Sudah dibeli; "Silakan ambil di mesin" | Pengelola yang memproses: **Urungkan** dalam 5 menit |
| Ditolak | Tidak bisa diproses; catatan wajib diisi dan dibaca pemesan | Pengelola yang memproses: Urungkan dalam 5 menit |
| Batal | Dibatalkan pemesan, atau catatan manual yang dibatalkan pengelola | Tidak ada |

- Pembelian di JumpStart selalu dilakukan orang, tidak pernah otomatis.
- Dua pengelola menekan pada pesanan yang sama: satu yang menang, yang lain mendapat "sudah diproses orang lain".
- "Tambah lagi" pada pesanan rapat hanya di hari yang sama dan memakai PIC dan ruangan kiriman pertama.

## 4. Catat manual

Untuk kopi yang sudah dibeli tanpa lewat aplikasi (HP mati, tamu mendadak). Pengelola → Antrean → **Catat manual**.

- Langsung berstatus Selesai dan bertanda "Dicatat manual" di Rekap.
- Klaim manual **tetap memakai jatah** orangnya dan ditolak bila jatahnya habis.
- Tanggal paling lama awal bulan lalu, tidak boleh di masa depan.
- Salah catat: **Batalkan catatan** (barisnya tetap ada sebagai Batal, dengan siapa dan kapan; jatah kembali).
- Catat manual tidak mengirim notifikasi ke siapa pun.

## 5. Tablet GA dan PIN GA

- **Serahkan ke tamu** membuka buku menu. Selama itu tablet tidak memuat data GA sama sekali (tidak ada
  pesanan, tidak ada daftar karyawan), juga setelah dimuat ulang.
- Keluar dari buku menu memakai **PIN GA** (4 angka). PIN diatur pengelola di `/admin/coffee` →
  Pengaturan; yang disimpan hanya sidik acaknya, PIN tidak pernah dikirim ke tablet.
- **PIN salah:** yang benar tidak dihitung. Setelah **5 kali salah** tablet menunggu **30 detik**, lalu
  1 menit, 5 menit, dan paling lama 15 menit; layar menyebut lama tunggunya. Selama menunggu, PIN yang
  benar pun belum diterima. Satu jam tanpa salah, hitungan mulai dari awal lagi.
- **Lupa PIN atau tablet terkunci:** pengelola menyimpan PIN baru di Pengaturan. Itu langsung membuka
  kunci; petugas masuk dengan PIN baru.
- Jangan mengganti `RATE_LIMIT_SECRET` di server setelah PIN diatur. Bila terpaksa diganti, simpan PIN baru.

## 6. Notifikasi

| Kabar | Yang diberi tahu |
| --- | --- |
| Klaim baru, pesanan rapat baru | Semua pengelola (pemegang akses yang masih aktif), kecuali pengirimnya |
| Selesai / Ditolak (klaim) | Pemesan |
| Selesai / Ditolak (rapat) | Petugas GA pengirim dan PIC |
| Catat manual, Batalkan catatan, Urungkan, batal oleh pemesan | Tidak ada |

- Menyalakan: karyawan di Atur sekali atau Akun → Notifikasi; tablet di bilah atas; pengelola di atas
  Antrean. Mematikan di tempat yang sama (tablet: **Matikan** di samping "Notifikasi aktif").
- iPhone/iPad: aplikasi dipasang dulu ke layar utama, baru notifikasi bisa dinyalakan.
- Isi notifikasi tidak pernah memuat nama tamu, instansi, jabatan, atau isi catatan tolak.
- **Tablet di mode tamu:** notifikasi apa pun hanya berbunyi "WG Coffee · Ada pembaruan pesanan."
  tanpa suara, dan mengetuknya **tidak pernah** membuka jendela lain atau mengeluarkan tablet dari buku menu.
- Perangkat milik orang yang sedang masuk. Keluar dari Coffee, ganti password, atau membuka Coffee
  setelah sesi berakhir menghentikan notifikasi di perangkat itu; setelah masuk lagi, nyalakan lagi bila
  statusnya "Belum aktif". Keluar dari WAM, WG People, atau Booking saja belum menghentikannya sampai
  Coffee dibuka lagi di perangkat itu.
  Paling banyak **5 perangkat per orang**; perangkat keenam menggantikan yang paling lama tidak dipakai.
- "Kirim notifikasi tes" selalu menjawab "dikirim". Bila tidak muncul dalam beberapa detik: Matikan,
  lalu Nyalakan lagi.
- Notifikasi hanya tambahan. Tanpa notifikasi, status tetap berubah sendiri di layar (antrean ≤ 10 detik,
  aplikasi karyawan ≤ 15 detik). Sebuah kabar dikirim sekali; bila layanan notifikasi gagal saat itu,
  kabar itu tidak diulang.
- Server hanya mengirim ke layanan notifikasi resmi browser (Chrome/Android, Firefox, Safari, Edge).

## 7. Rekap

- Satu baris per minuman, rentang paling lama satu tahun; saring jenis, status, dan kata.
- **Unduh CSV** dan **Unduh Excel** (lembar Detail 25 kolom dan Ringkasan) berisi persis baris di layar.
  Sejak 27 Nov 2026 Detail punya **Harga satuan** dan **Subtotal** (angka, bisa dijumlah di Excel), dan
  Ringkasan memuat **Pengeluaran** per blok (lihat bagian 10, "Harga minuman dan pengeluaran").
- **Ringkasan** menampilkan satu rincian dalam satu waktu, dipilih lewat "Lihat per": Karyawan (jatah
  terpakai), Minuman, PIC tamu, BU, Kelompok (Karyawan, Tim GA, Intern), Ruangan (pesanan rapat per ruang).
  Awalnya Karyawan; pilihan diingat selama Rekap terbuka. Tiap rincian punya baris Total kecuali Karyawan.
  Lembar Ringkasan di Excel tetap memuat Per orang, PIC, BU, dan minuman.
- Migrasi Coffee ada di `supabase/migrations/coffee/`.
- Nama, jabatan, BU, dan kelompok disalin ke pesanan saat dibuat, jadi rekap bulan lalu tidak berubah
  ketika Data karyawan berubah.

## 8. Data pribadi

- Rekap memuat nama karyawan, nama tamu, dan instansi tamu: hanya untuk pengelola, jangan dibagikan di luar keperluan.
- Tidak ada nomor telepon, tidak ada foto orang. Foto minuman adalah gambar buatan AI.
- Data contoh di pratinjau dan tes selalu rekaan ("Contoh …").

## 9. Opsi minuman (sejak 26 Nov 2026)

Suhu (Panas/Es), gula, dan takaran es **tidak selalu ditanya**. Pengelola mengaturnya per audiens di
`/admin/coffee` → Pengaturan → **Opsi minuman**.

| Audiens | Bawaan | Alasan |
| --- | --- | --- |
| Karyawan (klaim) | Tidak ditanya apa pun | Karyawan mengambil sendiri di mesin |
| Tim · rapat | Suhu, gula, takaran es | Disiapkan GA |
| Tamu | Suhu, gula, takaran es | Disiapkan GA; ini juga yang tampil di buku menu tamu |

- Opsi yang mati **tidak tampil** saat memesan (lembar minuman karyawan tinggal foto, nama, keterangan,
  baris jatah, dan "Ajukan klaim"), **tidak dicatat** (kosong, bukan "Panas · gula Normal" karangan),
  dan tidak ditulis di kartu status, antrean, Salin rincian, rekap, maupun notifikasi.
- Server yang memutuskan: nilai yang dikirim browser untuk opsi yang mati dibuang.
- Takaran es hanya ditanya bersama Suhu, dan hanya untuk minuman Es.
- Perubahan berlaku **mulai pesanan berikutnya**; pesanan yang sudah ada tidak berubah.
- Catat manual mengikuti jenis yang dipilih (Klaim, Tamu, Tim · rapat).

## 10. Menu (sejak 26 Nov 2026)

Pengelola mengelola minuman di `/admin/coffee` → **Menu**: tambah, ubah nama dan keterangan, Kopi atau
Non-kopi, tersedia Panas/Es, ganti foto, atur urutan, tampil di mana, sembunyikan, hapus.

**Dua menu, satu daftar (sejak 27 Nov 2026).** Sumbernya dua: **menu kertas kantor** (15 minuman, difoto
2 Nov 2026) dan **menu mesin JumpStart JS Mini di pantry** (12 minuman, dibaca 27 Nov 2026 dari
jumpstart.id/machine/2/menu; semuanya sudah ada di menu kertas). Tiap minuman punya dua centang:

| Centang | Tampil di | Bisa dipesan sebagai |
| --- | --- | --- |
| **Buku tamu** | Buku menu tamu di tablet GA; kisi minuman tablet saat "Ketuk untuk: Tamu" | Baris **Tamu** |
| **Menu biasa** | Aplikasi karyawan `/coffee`; kisi minuman tablet saat "Ketuk untuk: Tim · rapat" | **Klaim** karyawan dan baris **Tim · rapat** |

- **Bawaan pemilik:** Buku tamu = seluruh menu kertas (15). Menu biasa = yang dibuat mesin JS Mini (12),
  karena karyawan mengambil sendiri di mesin: Kopi Susu, Cappuccino, Café Latte, Café Mocha, Piccolo
  Latte, Matcha Espresso, Kopi Hitam, Americano, Espresso, Milk Chocolate, Matcha Latte, Dark Chocolate.
  Tiga minuman kertas yang tidak dibuat mesin **hanya di Buku tamu**: Cappuccino Double Shot, Cucumber
  Ice, Classic Tea. Minuman baru yang ditambah pengelola masuk keduanya kecuali centangnya dilepas.
- **Centang diubah langsung di daftar** (tanpa membuka panel) atau di panel minuman ("Masuk menu mana").
- **Server yang memutuskan**, di aplikasi dan sekali lagi di fungsi database: klaim dan baris Tim ·
  rapat butuh minuman Menu biasa, baris Tamu butuh minuman Buku tamu; selain itu ditolak "Minuman ini
  sudah tidak ada di menu".
- **Sembunyikan tetap ada, di atas kedua centang:** tersembunyi = tidak tampil dan tidak bisa dipesan
  di mana pun, tanpa mengubah centangnya (untuk yang sedang habis). Minuman **tanpa centang** juga tidak
  tampil di mana pun (daftar menandainya "Tanpa menu"). Keduanya tetap ada di riwayat dan rekap.
- **Catat manual** menawarkan daftar sesuai jenisnya (Tamu: Buku tamu; Klaim dan Tim · rapat: Menu
  biasa) plus "Lainnya"; servernya tetap menerima minuman menu apa pun untuk catatan manual.
- Kelompok tetap dua: **Kopi** dan **Non-kopi**. Tab kelompok hanya muncul bila ada minumannya di menu itu.
- Daftar Menu bisa dicari menurut nama dan disaring: Kopi, Non-kopi, Buku tamu, Menu biasa, Tanpa foto, Tersembunyi.

- **Urutan** di Menu = urutan di aplikasi karyawan, tablet GA, dan buku menu tamu.
- **Sembunyikan**: minuman tidak bisa dipesan lagi (server menolak), tetapi tetap ada di riwayat dan
  rekap. Untuk minuman yang sedang habis atau tidak dijual lagi.
- **Hapus hanya untuk minuman yang belum pernah dipesan.** Yang sudah pernah dipesan (termasuk yang
  ditolak atau dibatalkan) hanya bisa disembunyikan.
- **Ganti nama tidak mengubah masa lalu:** pesanan menyimpan nama minuman saat dipesan.
- **Foto:** JPG, PNG, atau WebP, paling besar 5 MB; dipotong persegi di tengah oleh server. Bukan SVG.
  Foto unggahan yang lama dihapus saat diganti. Minuman tanpa foto (atau yang fotonya gagal dimuat)
  digambar cangkir di atas warna kelompoknya, di semua layar.
- Perubahan terlihat pengelola saat itu juga; di aplikasi karyawan dan tablet paling lama **15 detik**
  kemudian (plus saat layarnya membaca ulang).
- "Lainnya (tulis sendiri)" tetap hanya ada di Catat manual; minuman tersembunyi masih bisa dicatat manual.

### Harga minuman dan pengeluaran (sejak 27 Nov 2026, F9)

- **Harga satuan (Rp)** per minuman diisi pengelola di Menu → buka minumannya. Rupiah penuh, 0 sampai
  10.000.000, kosong = "belum diisi". Diketik dengan titik ribuan ("8000" menjadi "8.000"); angka negatif
  dan desimal ditolak. Harga awal ditulis sekali oleh migrasi dari menu mesin JS Mini yang dibaca
  27 Nov 2026 (harga promo hari itu; pemilik yang meninjau): Americano, Cappuccino, Café Latte, Café
  Mocha, Piccolo Latte, Milk Chocolate, Dark Chocolate, Matcha Espresso, Matcha Latte Rp 8.000; Espresso
  Rp 8.900; Kopi Hitam dan Kopi Susu Rp 6.900. Cappuccino Double Shot, Cucumber Ice, Classic Tea (tidak
  dijual mesin) dan minuman tambahan pengelola kosong sampai diisi.
- **Harga tersimpan di tiap baris pesanan** saat pesanan dibuat (klaim, rapat, dan Catat manual lewat
  fungsi yang sama). Mengubah harga di Menu **tidak pernah** mengubah pesanan yang sudah masuk. Pesanan
  yang dibuat sebelum ada harga diberi harga minumannya pada saat migrasi (sekali); yang minumannya
  belum berharga, dan baris "Lainnya", tetap kosong.
- **Pengeluaran** di Rekap = jumlah harga minuman pada pesanan berstatus **Selesai** saja (catatan manual
  ikut, karena langsung Selesai). Menunggu, ditolak, dan dibatalkan tidak pernah dihitung. Minuman tamu
  dan Tim · rapat ikut dihitung (uang keluar walau tidak memakai jatah). Minuman Selesai tanpa harga
  tidak menambah apa pun dan dihitung sebagai "N minuman belum berharga, tidak terhitung" (tautan ke Menu).
- Di rincian "Lihat per": Karyawan = minuman milik orang itu (klaim dan Tim · rapat); minuman tamu
  dihitung di PIC tamu, Ruangan, dan BU. Total BU dan Minuman sama dengan angka Pengeluaran di atas.
- Di Detail, **Subtotal** hanya terisi untuk baris Selesai (satu baris = satu minuman), supaya jumlah kolom
  itu sama dengan Pengeluaran; **Harga satuan** terisi untuk semua baris yang berharga.
- Harga hanya terlihat oleh pengelola: aplikasi karyawan dan tablet GA tidak menerimanya.

## 11. Tidak ada di versi pertama

WhatsApp, kode ambil, sambungan langsung ke mesin JumpStart, pembayaran, pesan untuk hari lain,
"pilih nama" tanpa masuk, saldo jatah yang dibawa ke bulan berikutnya, notifikasi yang ditarik saat
pesanan dibatalkan, dan penghapusan otomatis pesanan lama. Yang menyusul ditambahkan ke dokumen ini.
