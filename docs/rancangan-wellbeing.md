# Wellbeing di Journey

Program wellbeing kantor (karyawan mencatat aktivitas per dimensi dan mengumpulkan poin) dipindah dari aplikasi
lama (welbeing.netlify.app, Supabase terpisah) ke Journey. Dokumen ini ringkasan publik; catatan lengkap pemilik
(termasuk data lama) ada di luar repo.

Status 17 Nov 2026: admin dan aplikasi karyawan dibangun; **belum diumumkan**. Aplikasi lama tetap dipakai sampai
versi Journey stabil.

## Keputusan

- Dibangun di dalam Journey, seperti Booking Kantor: karyawan masuk dengan **akun WAM**; akses admin diberikan per
  orang di Super admin → Akses admin (aplikasi "Wellbeing").
- Versi pertama hanya fitur yang benar-benar dipakai di aplikasi lama (dilihat dari datanya): pencatatan, riwayat,
  peringkat, periksa oleh admin, dan tambah poin ke banyak orang. **Quest, streak bonus, dan penghargaan bulanan
  ditunda** (tidak pernah dipakai). Rewards/koin semula juga ditunda; sejak 18 Nov 2026 dibangun sebagai **Hadiah**
  (lihat bagian Hadiah).
- Pencatatan **langsung dihitung**; admin memeriksa belakangan (Oke / Ubah poin / Tolak, dengan alasan yang dibaca
  karyawan). Tanggal depan ditolak.
- **Tanggal mundur (18 Nov 2026):** bawaannya **sejak program mulai** (22 Mei 2026), karena banyak karyawan sengaja
  mencatat belakangan. Admin WLM → Pengaturan → Aturan pencatatan → Boleh mundur bisa diganti "Batasi beberapa hari"
  (0–60 hari). Angka hari tetap di `wb_settings.backdate_days`; tombolnya (`backdateLimited`) disimpan di JSON
  kontrol aplikasi, jadi tidak perlu migrasi baru (memasang batas hari menunggu migrasi 202611170002).
- **Poin tidak tampil saat memilih (18 Nov 2026),** seperti aplikasi lama: daftar jenis kegiatan, detail, dan tombol
  Simpan tanpa angka poin. Poin baru terlihat setelah tersimpan (layar selesai, Riwayat, Beranda).
- Katalog kegiatan mengikuti katalog yang sedang dipakai di aplikasi lama (nama, dimensi, poin), bisa diubah admin.
- Absensi acara lewat QR diganti **Tambah poin ke banyak orang** (cara yang sudah dipakai admin).

## Peta fitur lama

| Fitur lama | Jadi |
|---|---|
| Login sendiri, ganti password | Akun WAM |
| Catat harian, olahraga, langkah, form "downgrade" | Satu tombol **Catat** (harian / olahraga) |
| Riwayat aktivitas, notifikasi | Tab **Riwayat** (status dan alasan admin) |
| Leaderboard (Overall/Steps/Quests) | **Peringkat**: bulan ini / sepanjang waktu, per dimensi |
| Profil, kartu ID, dompet koin | **Profil** (data dari akun WAM, riwayat poin) |
| Strava | Dibangun ulang (lihat di bawah) |
| Rewards, dompet koin, klaim | **Hadiah**: saldo poin, klaim diajukan lalu diputuskan admin (18 Nov 2026) |
| Quest, gacha (avatar/background reroll, petunjuk spot), QR spot, pesan antar rekan, survei, Apple Health, city tour | Ditunda / dibuang |
| Admin 15 tab | 4 menu: **Hari ini, Periksa, Karyawan, Pengaturan** |

## Cara dibangun (standar rasa aplikasi mobile)

- Satu aplikasi klien per bagian: `/wlm/[[...]]` (karyawan) dan `/admin/wlm/[[...]]` (admin). Server
  hanya memeriksa sesi; pindah menu, filter, dan detail terjadi di browser tanpa muat ulang halaman.
- Data lewat `/api/wellbeing/*` dan `/api/admin/wellbeing/*`, disimpan di cache klien (tampil dulu, diperbarui di
  latar). Formulir dan detail di lembar/panel. Komponen bersama: `src/components/app-shell/`.
- Kontrak data karyawan: `src/lib/wellbeing/app-types.ts`; aturan: `src/lib/wellbeing/rules.ts`.
- Database: tabel `wb_*` (migrasi `202611160050_wellbeing.sql`), terhubung ke `employees`. Foto bukti baru di R2
  privat (`wellbeing/<karyawan>/…`), ditampilkan dengan tautan bertanda tangan.
- Pratinjau pengembangan tanpa login: `/dev-preview/wellbeing` (data contoh; tidak ada di produksi).

## Tampilan balapan (18 Nov 2026)

Aplikasi karyawan sifatnya kompetitif (juara bulanan dapat hadiah), jadi tampilannya mengikuti aplikasi olahraga
(Strava, Apple Fitness, Nike Run Club) tanpa meninggalkan aturan desain rumah (HIG + Material, kontras, target
sentuh, mode gelap).

- **Bulan = balapan.** Beranda dibuka dengan kartu balapan: peringkat bulan ini, sisa hari, dan **Kejar #n**
  (selisih poin ke orang tepat di atas, dengan bilah progres). Yang memimpin melihat selisih keunggulannya.
  Total sepanjang waktu tetap ada, lebih kecil.
- **Papan relatif.** "Di sekitarmu" (dua di atas, dua di bawah) di Beranda, karena papan besar membuat yang di
  bawah kehilangan semangat; orang dibandingkan dengan yang terjangkau. Di luar 30 besar, Peringkat tetap
  menampilkan baris di sekitarmu.
- **Medali** emas, perak, perunggu untuk tiga teratas (selalu dengan angka, tidak hanya warna), juara bulan lalu,
  streak dengan ajakan "catat hari ini supaya streak tidak putus", rekor pribadi di Profil, dan setelah mencatat:
  naik peringkat atau sisa poin untuk menyalip.
- **Visual:** permukaan balapan gelap ("ink") dengan satu aksen hijau-kuning ("volt"), angka papan skor Barlow
  Condensed, teks Plus Jakarta Sans. Warna utama lama (biru) bentrok dengan warna dimensi Finansial, jadi diganti.
- API: `GET /api/wellbeing/leaderboard` kini juga mengirim `near` (sekitarku) dan `ahead` (yang dikejar).

### Api streak (18 Nov 2026)

Seperti Duolingo: di Beranda (bawah grafik 7 hari) ada api di samping jumlah hari beruntun.

- **Menyala** (oranye, bergoyang pelan, dengan cahaya) bila hari ini sudah ada aktivitas yang dihitung:
  "Hari ini sudah tercatat. Lanjutkan besok."
- **Garis abu-abu saja** (seperti mati) bila hari ini belum: angka streak ikut abu-abu, "Belum tercatat hari ini."
  dan tombol Catat sekarang. Belum punya streak: "Catat hari ini untuk menyalakan api."
- Aktivitas pertama hari itu menyalakan api: layar Tercatat menampilkan "N hari beruntun · api hari ini menyala"
  dengan animasi menyala, dan api di Beranda ikut menyala. Tanpa animasi bila HP diatur mengurangi gerakan.
- Pratinjau: `/dev-preview/wellbeing?belumhariini=1` (hari ini belum tercatat).

### Halaman Peringkat (18 Nov 2026)

Halaman menampilkan beberapa saja, sisanya di **Lihat semua peringkat** (lembar bawah). Urutannya:

1. **Arena** (permukaan gelap): nama balapan ("Balapan November · Fisik"), sisa hari, hadiah bila diisi admin,
   lalu podium tiga teratas di bawah cahaya emas: #1 di tengah dengan mahkota, foto lebih besar, poin emas dan
   pil **Unggul N** (selisih dari #2). Nama lengkap, departemen, dan angka peringkat di tiap podium (bukan warna saja).
2. **Posisimu**: peringkat besar (berwarna medali bila di podium), poin, **Kejar #n** dengan bilah jarak,
   "N poin lagi ke podium", atau "Kamu memimpin, unggul N poin". Belum punya poin: ajakan dan tombol Catat.
3. **Mengejar podium**: #4 sampai #8, lalu (bila lebih ke bawah) satu di atasmu, kamu, dan satu di bawahmu.
4. **Lihat semua peringkat**: semua yang punya poin; baris "Kamu" tetap di bawah lembar dan mengantar ke posisimu.
5. Juara bulan lalu di akhir.

Sejak ini API mengirim **semua** yang punya poin di `items` (dulu 30 teratas); aplikasi yang memakai jawaban lama
tetap menampilkan baris di sekitarmu dari `near`.

## Catat dari foto (18 Nov 2026)

Karyawan tidak perlu mengetik angka: pilih **Dari foto bukti**, unggah screenshot aplikasi atau foto layar
jam, dan form terbuka sudah terisi (jenis olahraga atau Langkah harian, tanggal, langkah, kalori, durasi).
Kolom yang terisi dari foto ditandai sampai diubah; karyawan memeriksa lalu menyimpan. Foto yang sama
langsung jadi bukti. Foto yang ditambahkan di tengah form juga dibaca, tapi hanya mengisi yang masih kosong.

Setelah foto terbaca muncul **satu layar Periksa hasil foto** (17 Nov 2026): foto di atas, di bawahnya semua
hasil bacaan yang bisa langsung dikoreksi (Kegiatan dalam satu pilihan untuk olahraga dan kegiatan harian,
Tanggal, **Jam**, Kalori dan Durasi atau Jumlah langkah, Catatan/nama acara dari foto mis. "Morning Run"), lalu
Simpan. Tanpa pindah-pindah langkah.

**Jam kegiatan** (opsional) ada di semua form Catat dan terisi dari foto bila layarnya menulis jam
("at 6:05 AM", "pukul 06.05", "16/11/2026 07.10"); jam ponsel di pojok layar tidak dihitung. Jam disimpan di
kolom `wb_activities.happened_time` (migrasi `202611170002_wellbeing_time_app.sql`). Sebelum migrasi itu dijalankan,
aplikasi tetap jalan dan menyimpan tanpa jam.

- **Mesin:** Tesseract (`tesseract.js` 7.0.0) berjalan di HP karyawan. Foto **tidak dikirim** ke layanan lain
  untuk dibaca, gratis. Mesin dan model bahasa Inggris (±7 MB, dari CDN jsDelivr pada versi yang terkunci)
  diunduh sekali saat pertama dipakai, lalu tersimpan di browser.
- **Pembaca:** `src/components/wellbeing/read-proof.ts` mengubah teks foto jadi data: angka ribuan/desimal
  gaya Indonesia dan Inggris, target ("/ 10.000") dan jam layar tidak dihitung, label Indonesia/Inggris,
  tanggal hanya dalam batas hari mundur, jenis olahraga dicocokkan dengan katalog.
- **Batas:** akurasi tergantung foto (buram, miring, tulisan kecil). Yang tidak terbaca dibiarkan kosong dan
  diisi sendiri; data tetap diperiksa admin seperti biasa.

## Profil dan Riwayat (18 Nov 2026)

- Profil: rekor, lalu daftar pengaturan seperti di HP (Strava, Tema dengan pilihannya di kanan dan lembar
  pilihan Otomatis/Terang/Gelap, Keluar). Riwayat tidak lagi diulang di Profil.
- Riwayat: satu-satunya tempat riwayat, dengan chip Semua, Harian, Olahraga, Strava, dan **Dari admin**
  (poin acara kantor, koreksi, dan saldo dari aplikasi lama).

## Admin: Laporan, konfirmasi massal, kontrol aplikasi (17 Nov 2026)

- **Periksa:** centang kartu (atau tombol X, atau Pilih semua), lalu **Konfirmasi** menandai semua yang
  dipilih sebagai sudah diperiksa sekaligus, dengan Urungkan. Poin dan keputusan tidak berubah. Yang dipilih juga
  bisa langsung diunduh sebagai Excel. Kartu dalam satu baris sama tinggi dan tombolnya sama lebar.
- **Laporan** (menu baru): tiga laporan Excel (.xlsx) dengan pilihan periode (bulan ini, bulan lalu, rentang
  tanggal, semua) dan saringan: Rekap poin per karyawan, Daftar aktivitas, Poin dari admin. Angka berupa angka
  sungguhan di Excel (bisa dijumlah); lembar Keterangan mencatat periode, saringan, waktu, dan siapa yang
  mengunduh. Ada ringkasan bulan ini dan poin per dimensi.
- **Pengaturan → Aplikasi karyawan** (dikurasi: hanya yang memang perlu dikendalikan admin): pengumuman di
  Beranda (bisa ditutup karyawan, muncul lagi kalau diubah, bisa diberi tanggal akhir), teks hadiah bulan ini
  (di kartu balapan dan Peringkat), baca data dari foto aktif/mati, dan jeda pencatatan dengan pesan.
  Tidak dibuat: menyembunyikan peringkat, mengubah warna, batas foto (dibatasi database 5), Strava (belum ada).
  Disimpan di `wb_settings.app` (migrasi `202611170002_wellbeing_time_app.sql`); sebelum migrasi aplikasi
  memakai bawaan.
- Pratinjau tanpa login: `/dev-preview/wellbeing-admin` (data contoh di browser; Unduh Excel hanya di admin
  sungguhan).

## WLM: alamat, halaman masuk, Periksa, foto profil (18 Nov 2026)

- **Alamat:** aplikasi karyawan di `journey.werkudara.group/wlm` (WLM = Werkudara Life Mode, nama program di
  aplikasi lama), admin di `/admin/wlm`. Tautan lama `/wellbeing` dan `/admin/wellbeing` dialihkan ke sana
  (`next.config.ts`). API tetap `/api/wellbeing` dan `/api/admin/wellbeing`; akses admin tetap aplikasi
  "Wellbeing".
- **Halaman masuk** desain baru (18 Nov 2026), tidak lagi meniru aplikasi lama:
  - Hanya tulisan **WLM** besar (huruf angka papan skor) dalam pita lima warna dimensi, "Werkudara Life Mode",
    dan garis lima warna.
  - Warna mengikuti tema aplikasi (Otomatis / Terang / Gelap, pilihan yang sama dengan di Profil), termasuk bilah
    status HP.
  - Form di kartu, diawali satu baris kecil "Masuk dengan akun WAM" (bukan sorotan utama). Tanpa slogan, dan tanpa
    kata "karyawan" (di bawah: "Program wellbeing Werkudara", juga di kartu share).
  - Gerakan masuk sekali jalan, sekitar 2 detik, dengan CSS (Remotion untuk membuat video, terlalu berat untuk
    halaman masuk):
    - Huruf naik satu per satu, lalu kilau terang menyapu W, L, M bergantian. Warnanya tidak berubah.
    - "Werkudara Life Mode" merapat dari renggang, garis tumbuh dari tengah, lalu kartu naik.
    - Pesan salah bergetar sekali tiap mencoba.
  - Versi "wow" (18 Nov 2026), dari acuan sign-in aurora-glass dan poster brand olahraga:
    - Latar aurora lima warna dimensi yang bergeser sangat pelan, dengan butiran halus. Ikut tema: pastel di terang,
      lebih dalam di gelap.
    - Di belakang WLM ada dua baris kata besar bergaris tepi yang berjalan berlawanan arah: lima dimensi, dan
      aktivitas (lari, yoga, meditasi, menabung, berbagi, bersepeda, renang).
    - WLM berpendar lembut dalam warnanya sendiri.
    - Form di kartu kaca buram dengan tepi gradasi warna. Kolom isian tetap padat (tidak kaca di atas kaca) supaya
      kontrasnya tetap. Tombol Masuk berpendar warnanya.
  - Semua gerakan, termasuk aurora dan kata berjalan, mati bila HP diatur mengurangi gerakan.
- **Nama dan tautan:**
  - Tab bernama "WLM" saja (WLM sudah singkatan dari Werkudara Life Mode; bagian lain "Peringkat · WLM"), dengan
    ikon WLM sendiri. Judul kartu share juga "WLM".
  - Nama di layar utama HP: "WLM".
  - Tautan yang dibagikan menampilkan kartu WLM persegi (1:1, 1080 × 1080, supaya pratinjau kecil WhatsApp yang
    dipotong persegi tetap menampilkan semuanya): tulisan WLM berwarna di depan kata lima dimensi yang samar, apa
    aplikasinya, dan "Masuk dengan akun WAM".
    Hurufnya (Barlow Condensed, Plus Jakarta Sans) diambil dari Google Fonts saat gambar dibuat; bila gagal, gambar
    tetap jadi dengan huruf bawaan.
  - Ketiganya dari `src/lib/wellbeing/brand.ts` dan `src/lib/server/wlm-preview.tsx`.
- **Periksa** (admin):
  - Status jadi tab dengan jumlahnya.
  - Jenis pindah ke tombol **Filter** (menu dengan ikon).
  - Tampilan **Kartu** atau **Daftar**, diingat per perangkat. Kartu: satu susunan untuk semua (foto bukti di
    kanan, poin dan tombol di bawah, tombol sama lebar). Daftar: satu baris per aktivitas, tombol berupa ikon
    dengan nama untuk pembaca layar.
  - Di HP: Filter dan Tampilan jadi ikon di sebelah pencarian, tab "Belum diperiksa" tertulis "Belum".
  - Pintasan keyboard tidak lagi di subjudul. Ada tombol **Pintasan** (atau tekan `?`), hanya di perangkat
    dengan keyboard dan mouse.
  - Teks tidak terpotong atau keluar (18 Nov 2026, diaudit di 1024, 1280, 1440, 1920 px, Kartu dan Daftar, dengan
    nama departemen dan kegiatan sepanjang aslinya):
    - Nama dengan hari dan jam di sampingnya, departemen di bawahnya (boleh dua baris).
    - Judul kegiatan sampai dua baris, lengkapnya di tooltip.
    - Catatan karyawan tampil penuh. Pil dimensi tidak pernah terpotong.
    - Angka tetap bersama satuannya, dan titik pemisah tidak memulai baris.
    - Daftar yang sempit (laptop) memakai dua baris per aktivitas: orang, poin, dan tombol di atas; kegiatan dan
      bukti di bawah.
    - Pencarian di kiri, Filter dan Tampilan di kanan.
- **Foto profil** (Profil → foto atau baris Foto profil) memakai foto akun WAM, jadi satu foto untuk WLM, WAM,
  dan Booking Kantor. Pilihannya:
  - **Pakai kartu tokoh WAM**: kartu dipotong bulat dengan warna persona, sama dengan "Jadikan foto profil" di
    WAM.
  - **Ambil foto**: hanya di layar sentuh.
  - **Pilih dari galeri**.
  - **Hapus foto**.

  Pilihan tampil sebagai pratinjau bulat dulu (kartu dengan cincin warna rarity), baru disimpan setelah
  "Pakai foto ini". Peringkat menampilkan foto profil semua orang (inisial bila belum ada).

## Hadiah (18 Nov 2026)

Karyawan menukar poin dengan hadiah yang dipasang admin. Aplikasi lama punya rewards dan koin, tapi hanya terpakai
sekali (item permainan); fitur ini dibangun ulang sesuai keputusan pemilik:

- **Saldo, bukan peringkat.** Saldo poin = semua poin yang dihitung (total di Peringkat) dikurangi poin yang ditahan
  klaim (Diajukan, Disetujui, Diserahkan). Menukar hadiah **tidak** mengurangi total poin maupun peringkat.
- **Alur klaim.** Karyawan menekan Ajukan klaim: poin langsung ditahan. Admin memutuskan: **Setujui**, **Tandai
  diserahkan** (bisa langsung dari Diajukan), atau **Tolak** dengan alasan yang dibaca karyawan; ditolak atau
  dibatalkan (karyawan bisa Batalkan selama masih Diajukan) mengembalikan poinnya ke saldo.
- **Aturan tiap hadiah** (Admin WLM → Hadiah → Katalog): nama, keterangan, sampai 6 foto (diunggah ke storage
  Journey, urutan bisa diatur, foto pertama tampil di daftar), harga dalam poin, stok (kosong = tanpa batas), batas
  per orang, Aktif. Hadiah baru tersimpan sebagai draf sampai Aktif dinyalakan. Hadiah yang pernah diklaim tidak bisa
  dihapus, hanya dimatikan; klaim menyimpan harga dan nama saat diajukan.
- **Aman dari ketuk dua kali.** Fungsi database `wb_request_reward` mengecek aktif, stok, batas per orang, dan saldo
  dalam satu transaksi yang dikunci per orang dan per hadiah (migrasi `202611180001_wellbeing_rewards.sql`, uji di
  `tests/backend/wellbeing-rewards-check.sql`).
- **Letak di aplikasi karyawan.** Kartu saldo di Beranda (di bawah kartu balapan; muncul setelah ada hadiah aktif,
  dengan "N hadiah bisa kamu klaim" atau "Kurang N poin untuk ..."), dan baris **Hadiah & klaim saya** di Profil.
  Keduanya membuka lembar Hadiah: saldo, daftar hadiah (foto, harga, Bisa diklaim / Kurang N poin / Habis / Sudah kamu
  klaim), detail dengan galeri foto dan catatan untuk admin, lalu **Klaim saya** dengan status dan alasan.
- **Admin.** Menu **Hadiah** dengan angka klaim yang menunggu: Permintaan (Diajukan, Disetujui, Diserahkan, Ditolak &
  batal) dan Katalog.
- **Hadiah lama** dibawa sebagai draf nonaktif oleh `scripts/wellbeing-rewards-import.mjs` (setelah migrasi): Hydroflask
  Tumbler 32 Oz (100.000 poin, stok 1), Voucher Decathlon 250k (35.000, stok 4), Garmin Sport Watch (300.000, stok 1).
  Fotonya tautan lama (i.ibb.co) sampai dipindah ke R2 oleh `scripts/wellbeing-storage.mjs`. Item permainan acara
  (Avatar/Background Reroll, Reveal Spot Clues) tidak dibawa.

## Voucher re-roll (18 Nov 2026, uji coba)

Hadiah bisa berupa voucher untuk re-roll kartu tokoh di kuesioner WAM. Keputusan pemilik:

- **Jenis hadiah** di editor Hadiah (semua admin WLM):
  - **Barang**: alur biasa (diajukan, disetujui, diserahkan).
  - **Voucher re-roll tokoh**: tokoh dan rarity diundi ulang, sama seperti re-roll dari Admin WAM.
  - **Voucher re-roll Legendary**: tokoh diundi ulang, rarity pasti Legendary.
- **Tanpa persetujuan admin** (bawaan; sejak "Jenis hadiah dan voucher kode" penyerahannya bisa diubah seperti hadiah
  lain). Klaim voucher langsung berstatus Diserahkan (oleh "Otomatis") dan poinnya langsung terpotong dari saldo.
  Karyawan ditanya sekali lagi sebelum klaim, karena voucher tidak bisa dibatalkan sendiri.
- **Syarat klaim**, dicek dalam satu transaksi oleh fungsi `wb_claim_reroll`:
  - stok, batas per orang, dan saldo seperti hadiah barang;
  - kartu tokohnya sudah keluar (bukan kartu uji);
  - untuk Legendary: tempat Legendary masih ada.
- **Kuota Legendary tetap berlaku.** Kartu Legendary orang lain ditambah voucher Legendary yang belum dipakai dihitung
  terhadap batas Legendary di Admin WAM. Kalau penuh, voucher Legendary tidak bisa diklaim dan poin tidak terpotong.
  Voucher Legendary yang belum dipakai menahan satu tempat, jadi undian kartu baru tidak mengambilnya.
- **Dipakai di kartu tokoh.** Setelah klaim, tombol **Buka kartu tokoh** membuka alamat kuesioner. Di bawah kartu
  muncul **Pakai voucher Legendary** atau **Pakai voucher re-roll**, membuka dialog re-roll yang sama. Voucher bisa
  dipakai kapan saja: juga saat re-roll dari Admin WAM tutup, dan juga kalau jatah re-roll gratisnya sudah dipakai.
  Re-roll gratis tidak ikut terpakai.
- **Klaim saya** menulis "Belum dipakai" dengan tautan **Pakai di kartu tokoh**, atau "Sudah dipakai".
- **Super admin → Voucher re-roll** (menu Uji coba) menampilkan semua voucher, asal (Hadiah atau diberi manual),
  dan perubahannya (tokoh dan rarity sebelum → sesudah). Tindakannya:
  - **Batalkan voucher** (belum dipakai): poinnya kembali, klaim jadi Ditolak dengan alasan yang dibaca karyawan.
  - **Kembalikan poin** (sudah dipakai): kartu tetap, poin kembali.
  - **Kembalikan kartu**: kartu kembali ke tokoh dan rarity sebelum voucher. Hanya bisa selama kartunya belum
    berubah lagi dan tokoh lamanya belum dipakai orang lain.
  - **Beri voucher**: tanpa poin, biasa atau Legendary (Legendary hanya bila tempatnya masih ada).
- **Data:** migrasi `202611180003_wellbeing_reroll_voucher.sql` (kolom `wb_rewards.kind`, tabel
  `wb_reroll_tickets`, fungsi `wb_claim_reroll`; `wb_request_reward` menolak voucher). Sebelum migrasi dijalankan,
  Hadiah tetap jalan seperti biasa dan pilihan voucher di editor nonaktif.

## Jenis hadiah dan voucher kode (18 Nov 2026)

Keputusan pemilik: jenis hadiah dibuat sesuai kebutuhan, dan voucher bekerja seperti aplikasi klaim voucher pada
umumnya (kode atau link, fleksibel).

- **Jenis hadiah** di editor (Admin WLM → Hadiah → Katalog): **Barang**, **Uang** (tunai atau transfer, mis. saldo
  e-wallet), **Voucher**, **Lainnya** (kelas, pengalaman, fasilitas kantor). Di bawah Voucher, **Isi voucher**:
  - **Kode atau link**: voucher dari luar (lihat di bawah).
  - **Fitur aplikasi**: efek yang bekerja di aplikasi, dipilih di **Efek**: **Re-roll tokoh WAM** atau **Re-roll
    Legendary WAM** (voucher re-roll di atas). Efek lain bisa ditambah nanti sebagai pilihan baru di sini.
- **Kode atau link**, dipilih per voucher:
  - **Daftar kode unik**: admin menempel kode atau link, satu per baris (bisa dari spreadsheet; yang sama dilewati).
    Tiap klaim mendapat satu kode yang berbeda; sisa stok = kode yang belum diberikan. Daftar kode tampil di editor
    dengan siapa yang menerima; kode yang belum diberikan bisa dihapus.
  - **Satu kode untuk semua**: semua yang klaim mendapat kode atau link yang sama.
  - **Diisi admin saat menyerahkan**: admin mengetik kode atau link saat menekan Tandai diserahkan.
  - Isian yang diawali `https://` (atau `http://`) tampil sebagai link: **Buka link** dan **Salin link**. Selain itu
    tampil sebagai kode dengan **Salin kode**.
  - **Berlaku sampai** (opsional, WIB): setelah tanggal itu voucher tidak tampil dan tidak bisa diklaim.
    **Cara pakai** (opsional) tampil di detail dan bersama kode.
- **Penyerahan**, satu pengaturan yang sama untuk semua jenis (termasuk fitur aplikasi), dipilih per hadiah:
  - **Admin menyetujui dulu** (seperti sebelumnya): Diajukan, lalu Setujui, lalu Tandai diserahkan. Karyawan bisa
    Batalkan selama Diajukan.
  - **Langsung disetujui, admin menyerahkan**: klaim langsung Disetujui (poin ditahan). Admin tinggal menandai
    diserahkan.
  - **Otomatis, langsung diterima**: hanya untuk yang tidak perlu diserahkan tangan: voucher fitur aplikasi, dan
    voucher dengan daftar kode unik atau satu kode untuk semua. Klaim langsung Diserahkan, kode tampil atau voucher
    langsung aktif, poin terpotong. Voucher fitur aplikasi baru mulai dari Otomatis; voucher re-roll yang sudah ada
    tetap Otomatis.
  - Voucher fitur aplikasi lewat admin: tiketnya baru dibuat saat admin menandai diserahkan, jadi baru bisa dipakai
    di kartu tokoh setelah itu. Klaim re-roll Legendary yang masih menunggu admin ikut menahan satu tempat Legendary
    (seperti voucher yang belum dipakai); kalau saat diserahkan tempatnya ternyata penuh, admin diminta menolak klaim.
  - Klaim yang tidak bisa dibatalkan (langsung disetujui atau otomatis) ditanya sekali lagi sebelum dikirim.
- **Kode baru tampil setelah diserahkan.** Selama klaim belum diserahkan, kodenya tidak dikirim ke aplikasi. Klaim yang
  ditolak atau dibatalkan sebelum diserahkan mengembalikan kodenya ke daftar.
- **Aplikasi karyawan.** Setelah klaim otomatis muncul layar **Voucher diterima** dengan kode atau link. Di Klaim saya,
  voucher berkode berstatus **Siap dipakai** (atau **Berakhir** setelah lewat masa berlaku) dengan tombol **Lihat kode**.
- **Admin.** Kartu katalog menulis jenis, cara penyerahan, masa berlaku, dan "N dari M kode tersisa". Permintaan
  menampilkan kode yang diberikan. Angka di menu Hadiah sekarang = Diajukan + Disetujui (yang masih perlu ditindak).
- **Data:** migrasi `202611180004_wellbeing_reward_types.sql` (setelah 202611180003): kolom `wb_rewards.delivery`,
  `code_mode`, `shared_code`, `valid_until`, `how_to`; `wb_reward_claims.code`; tabel `wb_reward_codes`; pemicu yang
  mengembalikan kode dan yang membuat tiket re-roll saat diserahkan; `wb_request_reward` menangani semua jenis kecuali
  re-roll; `wb_claim_reroll` mengikuti penyerahan. Uji di
  `tests/backend/wellbeing-reward-types-check.sql`. Sebelum migrasi dijalankan, Hadiah jalan seperti sebelumnya dan
  pilihan Uang, Voucher kode, dan Lainnya di editor nonaktif.

## Strava

Satu aplikasi Strava API milik kantor (aplikasi yang sama dengan aplikasi lama; kuncinya `STRAVA_CLIENT_ID` dan
`STRAVA_CLIENT_SECRET` di Vercel). Tiap karyawan menyambungkan akun Strava-nya sendiri.

**Ditutup dulu (18 Nov 2026):** `STRAVA_OPEN = false` di `StravaSheet.tsx`.
- Profil menampilkan baris Strava abu-abu dengan **Segera hadir**, bukan tombol. Lembar Strava tidak dipasang
  dan aplikasi tidak bertanya ke server soal Strava.
- Catat dan Riwayat › Strava menulis "Sinkron Strava segera hadir". Aktivitas Strava dari aplikasi lama tetap
  tampil di Riwayat.
- Server Strava tetap terpasang. Buka lagi dengan `STRAVA_OPEN = true` setelah aplikasi Strava dan kuncinya siap.

Aturan Strava sejak Juni 2026:
- Pemilik aplikasi wajib berlangganan Strava.
- Aplikasi baru 1 atlet, naik sendiri ke 10; lebih dari itu lewat review.
- Data Strava seseorang hanya tampil ke orang itu kecuali ia setuju. Di WLM, Peringkat hanya total poin, dengan
  persetujuan saat menyambung.

Dibangun 18 Nov 2026:

- **Menyambung** (Profil → Strava): lembar menjelaskan apa yang dibagikan, lalu ke halaman Strava (izin
  `read,activity:read_all`).
  - Kembali ke `/api/wellbeing/strava/callback`, lalu ke Profil dengan hasilnya.
  - `state` bertanda tangan (15 menit, untuk orang yang memulai).
  - Izin aktivitas wajib dicentang.
  - Satu akun Strava untuk satu karyawan.
- **Token:** disimpan terenkripsi di `wb_strava_links` (migrasi `202611180002_wellbeing_strava.sql`), hanya
  server.
  - Refresh satu proses sekaligus; refresh token baru selalu disimpan.
  - Ditolak Strava: status **Perlu sambung ulang** di Profil.
- **Aktivitas:**
  - Webhook (`/api/wellbeing/strava/webhook`, satu per aplikasi, diaktifkan sekali dari Admin → Pengaturan → Strava)
    memasukkan aktivitas baru, diubah, atau dihapus.
  - Saat baru tersambung dan lewat **Sinkronkan sekarang**, aktivitas sejak awal bulan dibaca ulang.
  - Isi webhook tidak dipercaya: aktivitas selalu dibaca dari Strava dengan token pemiliknya, dihapus hanya kalau
    Strava bilang sudah tidak ada.
- **Poin:** kalori 1:1 (batas harian). Jenis olahraga Strava dipetakan ke katalog; sisanya Olahraga lain.
  - Keputusan admin (Ubah poin, Tolak) tidak ditimpa sinkron.
  - Poin yang berubah setelah diperiksa kembali ke Belum diperiksa.
- **Putuskan:** token dicabut di Strava (`/oauth/revoke`); aktivitas yang sudah masuk tetap dihitung.
- **Siapkan sekali:**
  1. Callback Domain aplikasi Strava = `journey.werkudara.group`.
  2. Kunci di Vercel.
  3. Migrasi.
  4. Aktifkan webhook di Admin → Pengaturan → Strava.
- **Data lama:** aktivitas dari Strava di aplikasi lama berhenti 12 Jul 2026. Dugaan: langganan pemilik aplikasi
  berhenti. Token aplikasi lama belum dipindah (karyawan menyambung ulang, atau dipindah saat peralihan).

## Pindah data lama

`scripts/wellbeing-import.mjs` membaca ekspor CSV aplikasi lama (di luar repo) dan menulis salinan ke `wb_*`:
uji kering secara bawaan, `--apply` untuk menulis. Bisa diulang (`legacy_id`): menambah yang baru, memperbarui yang
berubah, menghapus yang sudah tidak ada. Profil lama dicocokkan ke Data karyawan
(`scripts/wellbeing-match-employees.mjs`). Total poin tiap orang dibuat sama dengan aplikasi lama (tanpa data uji
Desember 2025). Token Strava baru dipindah saat peralihan.

### Storage (18 Nov 2026)

Foto bukti hasil impor awalnya tautan ke bucket publik `quest-proofs` project lama. Supaya project lama bisa
diarsipkan, `scripts/wellbeing-storage.mjs` memindahkannya ke R2 Journey:

- **Foto bukti:** tiap tautan lama di `wb_activities.photos` diunduh, dicek jenisnya dari byte awal (foto, atau
  video MP4/MOV yang dulu dipakai sebagai bukti dan sekarang diputar di aplikasi), disimpan sebagai
  `wellbeing/<karyawan>/<id tetap>.<ext>`, dicek ukurannya, lalu tautan diganti kunci baru. Daftar tautan lama ke
  kunci baru ada di `foto-pindah.csv` (folder ekspor); impor ulang memakainya supaya tautan lama tidak kembali.
  Uji kering 18 Nov: 2.167 tautan, semua masih bisa diunduh dan dikenali (2.161 foto, 6 video), total 4,5 GB.
- **Arsip (`--arsip`):** semua bucket dan berkas project lama (termasuk yang tidak dipakai aktivitas) ke R2
  `arsip/wellbeing-lama/<bucket>/<path>`, di luar `wellbeing/` sehingga tidak pernah ditampilkan. Foto bukti yang
  sudah pindah tidak disimpan dua kali. Daftar lengkap dengan sha256 di `arsip-storage.csv`.
- Tidak ada yang dihapus dari project lama oleh skrip.

## Peralihan

1. Uji di Journey dengan salinan data (aplikasi lama tetap resmi).
2. Hari H, berurutan:
   1. Aplikasi lama dikunci (tidak bisa mencatat), supaya tidak ada data baru di sana.
   2. Ekspor terakhir: `ekspor-semua.sql` di SQL Editor project lama, simpan sebagai `semua-tabel.csv`.
   3. Impor terakhir: `node --env-file=.env scripts/wellbeing-import.mjs <folder> --semua` (uji kering), cek
      `impor-laporan.md` (total tiap orang sama dengan aplikasi lama), lalu ulangi dengan `--apply`.
   4. Foto: `node --env-file=.env scripts/wellbeing-storage.mjs <folder>` (uji kering), lalu `--apply`. Selesai bila
      tertulis **tautan lama tersisa di Journey: 0**. Buka beberapa aktivitas lama di Admin Periksa: foto tampil.
      `.env` perlu `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (sama dengan Vercel).
   5. Arsip storage: pemilik mengisi sementara kunci project lama di `akses.env`, jalankan `--arsip --apply`,
      lalu kosongkan lagi `akses.env`.
   6. Arsip database: `semua-tabel.csv` (semua tabel, tanpa kolom rahasia) sudah cukup sebagai catatan. Kalau
      ingin salinan yang bisa dipulihkan utuh, unduh juga dump database (`supabase db dump` atau `pg_dump` dengan
      kata sandi database project lama). Simpan folder ekspor ini di tempat arsip kantor.
   7. Aplikasi Strava dipindah, alamat lama dialihkan ke `journey.werkudara.group/wellbeing`, lalu diumumkan.
3. Project Supabase lama: dijeda (pause) dulu setelah langkah di atas selesai, bukan langsung dihapus. Hapus hanya
   setelah beberapa minggu tanpa masalah dan arsip sudah diperiksa.
