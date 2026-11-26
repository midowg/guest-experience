# Rancangan Kopi Kantor (JumpStart)

Status: **sudah diterapkan dan sudah dibuka** dengan nama **WG Coffee** (nama aplikasi sejak 26 Nov 2026; cabang `feat/werkudara-coffee`); aturan pemakaian di
`docs/aturan-coffee.md`, langkah membuka di `docs/coffee/GO-LIVE.md`. Dokumen ini tinggal catatan rancangan awal. Desain ada di **Penpot, file `werkudara-coffee`** (4 November 2026),
dengan halaman berurutan sesuai alur prototype: 00 Sampul & alur, 01 Fondasi, 02 Komponen (49), 03 Foto produk,
10 GA · Pesanan rapat, 11 Tamu · Buku menu, 20 Karyawan · Aktivasi, 21 Karyawan · Klaim, 30 HR · Antrean & rekap,
31 HR · Karyawan & aktivasi. Desain lama di pen.dev (`docs/desain/kopi-pantry.pen`) tidak pernah tersimpan ke disk
dan hilang; dibangun ulang dari riwayat sesi.

Foto minuman (AI sementara, `docs/desain/`): Kopi Susu `generated-13`, Cappuccino `generated-5`, Café Latte
`generated-1`, Café Mocha `generated-14`, Piccolo Latte `generated-6`, Matcha Espresso `generated-9`, Cappuccino
Double Shot `generated-16`, Americano `generated-2`, Kopi Hitam `generated-12`, Espresso `generated`, Matcha Latte
`generated-17` (panas), Milk Chocolate `generated-15`, Dark Chocolate `generated-7`, Cucumber Ice `generated-8`,
Classic Tea `generated-3`. (`generated-4`, `-10`, `-11` = versi lama yang diganti.)

## Cara kerja JumpStart saat ini (fakta dari pemilik)

- JumpStart adalah vendor mesin kopi. Kantor menyetor saldo (± Rp 2,5 juta) untuk jatah karyawan.
- **HR memesan lewat aplikasi web JumpStart** (`jumpstart.id/outlet/menu`, login nomor HP + OTP +
  reCAPTCHA) memakai saldo itu, lalu memberi tahu pemesan bahwa minuman tinggal diambil di mesin.
  Karena itulah klaim karyawan "di-ACC HR": HR yang membeli.
- Tamu selalu punya **PIC** (karyawan). GA membawa menu foto ke tamu dan mencatat pilihan di sticky
  note; PIC lalu memberi tahu HR, mis. "A pesan kopi 5" (5 tamu). HR mencatat bahwa tamu itu dibawa A.
- Karyawan masih meminta lewat WhatsApp. Laporan sering terlupa, sehingga rekap sulit.

## Tujuan

**Setiap permintaan dan pembelian tercatat otomatis**, HR tidak perlu mengingat atau merekap manual.
Sistem menjadi lapisan permintaan + pencatatan di sekitar aplikasi JumpStart.

Di luar cakupan:
- Setoran saldo ke JumpStart tidak masuk sistem.
- Sistem **tidak** tersambung ke aplikasi atau mesin JumpStart. Tidak ada API resmi; mengotomatiskan
  login ber-OTP/reCAPTCHA melanggar ketentuan mereka. HR tetap memesan manual di aplikasi JumpStart.

## Prinsip (keputusan pemilik, 2 November 2026)

1. **Menu dan opsi mengikuti menu kertas di kantor** (foto 3 halaman): 15 minuman, Panas/Es,
   gula 6 tingkat (Tanpa, Sedikit, Setengah, Kurang, Normal, Ekstra), takaran es (Sedikit, Normal,
   Ekstra). Menu aplikasi JumpStart tidak dijadikan acuan.
2. **GA tidak boleh jadi lebih repot** dari sticky note: satu pesanan tamu, beberapa minuman, sekali kirim.
3. **Karyawan klaim semudah mungkin**: pilih minuman → atur → ajukan.
4. **Prioritas utama: rekap HR rapi dan siap diambil** (unduh Excel/CSV) untuk diolah sendiri.

## Rekap HR (yang harus tersedia)

Satu baris per minuman, kolom tetap dan konsisten:
tanggal, jam diajukan, nomor pesanan, jenis (Klaim / Tamu), nama pemesan, kelompok
(Karyawan/GA/Intern), jabatan, BU, PIC (untuk tamu), nama tamu/instansi, jumlah tamu, minuman,
suhu, gula, takaran es, status (Diajukan/Dipesan/Ditolak/Batal), alasan tolak, dipesan oleh (HR),
jam dipesan, klaim ke-berapa bulan ini.

Tampilan rekap: filter bulan dan rentang tanggal; ringkasan per orang (jatah terpakai), per PIC
(jumlah tamu dan minuman), per BU, per minuman; unduh Excel (lembar Detail + Ringkasan) dan CSV.

## Peran dan jatah

| Peran | Di sistem | Jatah per bulan kalender (WIB) |
|---|---|---|
| Karyawan | Mengajukan klaim dari HP sendiri | 4 |
| Tim GA | Mengumpulkan pilihan tamu dengan tablet; untuk diri sendiri seperti karyawan | 2 |
| Intern | Mengajukan klaim dari HP sendiri | 2 |
| PIC tamu | Karyawan yang membawa tamu; pesanan tamu dicatat atas namanya | tidak memakai jatah pribadi |
| Tamu | Pilihan dicatat lewat tablet GA | tanpa batas |
| HR | Memesan di aplikasi JumpStart, menandai "sudah dipesan", melihat rekap | — |

Jatah diatur per kelompok di admin (angka di atas nilai awal). Data karyawan: nama, jabatan, BU,
kelompok jatah (diberikan pemilik).

## Alur

**Klaim karyawan/GA/intern:** ajukan dari HP → sistem cek jatah → HR dapat notifikasi → HR memesan
di aplikasi JumpStart (halaman HR menampilkan rincian minuman + tombol buka JumpStart) → HR menekan
"Sudah dipesan" → pemesan diberi tahu "silakan ambil di mesin" → jatah berkurang. HR bisa menolak
dengan alasan; jatah tidak berkurang. Bila jatah habis, klaim tidak bisa diajukan.

**Pesanan rapat (tamu + tim):** GA membawa tablet ke ruangan (pengganti menu foto + sticky note).
Mulai pesanan cukup dengan **ruangan + PIC** (tamu/instansi dan jumlah orang opsional). Dua cara isi,
GA bebas memilih:
- **Input cepat (bawaan):** GA mengetuk minuman + jumlah seperti sticky note digital; opsi bawaan
  Panas · gula Normal, bisa diubah per item.
- **Serahkan ke tamu:** tablet dibuka sebagai buku menu, tiap orang memilih sendiri.
Setiap minuman ditandai **Tamu** atau **Tim · rapat** (atasan/PIC/karyawan yang ikut rapat).
Minuman tim saat rapat **tidak memotong jatah**, tetapi dicatat atas nama orangnya. Pesanan rapat yang
masih berjalan bisa **ditambah lagi** (isi ulang) tanpa mengulang data. Satu kirim → HR membelikan
semua di JumpStart → "Sudah dibeli" → GA/PIC diberi tahu. Rekap mencatat tanggal, ruangan, PIC,
tamu, jenis (Tamu / Tim · rapat), jumlah dan jenis minuman.

**Ruangan:** CFC Ananta Room, Kaliya Limasan, Vasuki Room, Komunal Space, Lainnya (isi sendiri).
Daftar ruangan diatur di admin.

**Denah kantor (usulan pemilik, 4 November 2026):** pakai denah yang sama dengan Pra WAM
(`src/lib/pra-wam/floor-plan.ts`, `FloorPlan.tsx`; ruangan diatur super admin di `/admin/wam/ruang`), tidak membuat
denah sendiri. Dipakai di: A1 (GA memilih ruangan dengan mengetuk denah; chip tetap sebagai jalan pintas, "Lainnya"
untuk tempat di luar denah), A0 (denah kecil menandai ruangan yang punya pesanan aktif, berwarna sesuai status), dan
B4 (denah mini menandai Pantry sebagai lokasi mesin). Ruangan Coffee dipetakan: CFC Ananta Room → `ananta`,
Kaliya Limasan → `limasan`, Vasuki Room → `vasuki`, Komunal Space → `communal`; mesin → `pantry`.

**Pengambilan:** minuman tinggal diambil di mesin (Pantry); tidak ada kode ambil.

**Printer thermal dan tablet pantry: masih diperlukan** (fungsinya perlu dipastikan, lihat di bawah).

## Masuk dengan akun karyawan (keputusan pemilik, 25 November 2026)

Menggantikan "pilih nama + PIN" di bawah. Karyawan masuk dengan **akun karyawan Journey** (email kantor + password,
akun yang sama dengan WG People dan Booking Kantor; lupa password diatur ulang admin). Klaim tidak menyebut "HR
membelikan" tetapi **Diproses**: klaim masuk ke semua yang memegang akses Werkudara Coffee (HR dan admin), siapa pun
yang lebih dulu membuka memprosesnya; karyawan melihat siapa yang memproses ("Selesai oleh Dewi (HR)").
Halaman Penpot 20 (aktivasi pilih nama/PIN) dan 31 (Reset aktivasi) **sudah tidak berlaku**.

## Alamat dan cara masuk (keputusan pemilik, 3 November 2026; cara masuk diganti 25 November)

Nama aplikasi di HP: **Werkudara Coffee**. Alamat (bahasa Inggris, mudah diingat):

| Siapa | Alamat |
|---|---|
| Karyawan / GA / intern | `journey.werkudara.group/coffee` |
| Tablet GA (rapat dan tamu) | `journey.werkudara.group/coffee/ga` |
| HR (antrean beli dan rekap) | `journey.werkudara.group/coffee/hr` |
| Pengaturan | `journey.werkudara.group/admin/coffee` |

`coffee` harus dicadangkan agar tidak bentrok dengan kode pendek acara (`/[code]`).

**Karyawan tanpa password dan tanpa email.** HR membagikan satu tautan `/coffee` ke grup WA kantor →
karyawan memilih namanya sendiri dari daftar (nama, jabatan, BU) → **membuat PIN 4 angka sendiri, atau
melewatinya** (untuk yang tidak mau ribet, mis. senior) → Install (ikon di layar utama) → izinkan
notifikasi. Seterusnya cukup ketuk ikon.

Nama yang sudah aktif **terikat ke HP pertama**. Dari HP lain:
- akun **dengan PIN**: cukup masukkan PIN untuk pindah HP;
- akun **tanpa PIN**: harus minta HR **Reset**.
Bila nama sudah dipakai orang lain, pemilik asli melihat "Nama ini sudah aktif di HP lain" dan melapor
ke HR. Setiap klaim atas nama seseorang dikirim sebagai notifikasi ke HP orang itu.

Tamu tidak punya akun atau tautan; semua lewat tablet GA. Keluar dari buku menu ke mode GA memakai PIN GA.
**Keputusan PM 26 Nov 2026 (ditegaskan):** PIN GA = 4 angka, diatur pengelola di `/admin/coffee` → Pengaturan, disimpan
hanya sebagai hash di server, diperiksa server (batas coba per akun tablet dan per alamat), tidak pernah dikirim ke
browser. Selama PIN belum diatur, keluar memakai pertanyaan konfirmasi dan Beranda GA menampilkan pengingat. Mode tamu
bertahan saat halaman dimuat ulang atau tombol kembali ditekan (tablet kembali ke buku menu, tanpa data GA).

**Notifikasi push (PWA):** klaim baru → HR; pesanan rapat dari GA → HR; "Sudah dibeli" → pemesan/GA.
Android Chrome lancar; iPhone hanya bila aplikasi dipasang ke layar utama (iOS 16.4+). Tiap orang
menekan "Izinkan notifikasi" sekali; bila ditolak, halaman HR tetap punya badge dan bunyi.

## Tema tamu: buku menu

Layar tamu di tablet bertema buku menu: sampul hitam tebal dengan hanya logo Pegasus Werkudara
berwarna emas (`docs/desain/images/werkudara-mark-emas.png`, dibuat dari `public/werkudara-mark.png`),
lalu halaman kertas krem seperti buku terbuka dengan penanda tab Kopi/Non-kopi. Emas hanya untuk
logo, garis, dan ornamen, bukan teks kecil. Layar GA (persiapan dan konfirmasi) tetap mode internal.

## Pembeda tamu dan karyawan

Tidak hanya warna: tamu nuansa kafe karamel + ikon tamu + label TAMU; karyawan aksen hijau + label
kelompok (Karyawan/GA/Intern) + sisa jatah. Struk mencetak blok hitam TAMU/KARYAWAN. Tablet tamu
tidak menampilkan data karyawan selain daftar PIC yang dipilih GA.

## Notifikasi

**Web push ke HP HR dan pemesan** (gratis, resmi), plus badge dan bunyi di halaman HR.

WhatsApp **dihapus dari cakupan untuk sekarang** (keputusan pemilik, 2 November 2026) karena belum
pasti. Catatan riset sebelumnya: jalur n8n → gateway WA tidak resmi (WAHA/Evolution API) berisiko
nomor diblokir; jalur resmi WhatsApp Cloud API berbayar. Permintaan yang masuk di luar sistem dicatat
HR lewat **Catat manual**.

**Catat manual** menggantikan form WhatsApp lama (whatsform: tanggal, nama karyawan, klaim ke-, jenis kopi).
Isinya: tanggal & jam (bisa mundur), nama karyawan (cari), jenis Klaim / Tamu / Tim · rapat (Tamu: PIC +
tamu/instansi), minuman (termasuk "Lainnya" + isian teks), suhu/gula/es; "klaim ke-" dihitung sistem, tidak dipilih.

## Prototype GA dan pengelola (25 November 2026)

- `/dev-preview/coffee/ga` (tablet GA): beranda dengan denah "Ruangan dengan pesanan", pesanan baru (ruangan dipilih di
  denah atau chip, PIC, tamu opsional), input cepat, ubah opsi, terkirim (status langsung), "Tambah lagi", dan buku menu
  tamu (sampul hitam logo emas). Pilihan tamu kembali ke panel GA sebagai baris Tamu, lalu GA yang mengirim.
- `/dev-preview/coffee/hr` (pengelola = HR dan admin yang punya akses): antrean klaim + rapat (Salin rincian, Buka
  JumpStart, Selesai diproses, Tolak dengan catatan, Urungkan), Catat manual, Rekap (filter, ringkasan per orang/PIC/BU/
  minuman, detail semua kolom, Unduh CSV sungguhan, pratinjau Excel), Pengaturan (lihat saja).
- Ketiga prototype memakai data contoh bersama di browser (`src/components/coffee/prototype/store.ts`), jadi klaim dari
  HP dan pesanan GA muncul di antrean pengelola dan statusnya kembali ke HP/tablet, juga antar-tab.
- Keputusan sementara di prototype (perlu dikonfirmasi): Kirim GA tanpa konfirmasi tambahan; keluar dari buku menu tamu
  cukup konfirmasi di prototipe (versi final: PIN GA, diputuskan 26 Nov 2026, lihat di atas); Catat manual menolak simpan bila jatah habis; tamu dicatat atas nama PIC
  dan masuk BU PIC.

## Prototype karyawan (25 November 2026)

`/dev-preview/coffee` (hanya dev): aktivasi + klaim, bisa diklik, tindakan HR disimulasikan lewat panel
"Skenario". Kode: `src/components/coffee/prototype/`, menu: `src/lib/coffee/menu.ts`, foto: `public/dev/coffee/`.
Hasil audit desain Penpot (skill ui-ux-pro-max, design-taste-frontend, referensi Starbucks dari awesome-design-md)
yang diterapkan:
- Satu aksen hijau untuk aplikasi karyawan (pilihan terpilih di library Penpot masih biru); sapaan "kamu" konsisten.
- Radius mengikuti `brain/aturan/desain-ui.md` (tombol 12, kartu 16, sheet 24), bukan 8 di semua tempat.
- Teks isi ≥ 15 px, label sentence case (tanpa kicker huruf besar), target sentuh ≥ 48 px.
- Masuk dengan akun karyawan Journey (revisi 25 Nov), lalu atur sekali: pasang + notifikasi.
- Status "Diproses" (bukan "HR membelikan"), info siapa yang memproses dan siapa yang menerima klaim.
- Bilah bawah Menu / Pesanan saya (riwayat dan status) dengan titik penanda pesanan berjalan; tidak ada muat ulang.
- Takaran es hanya muncul bila memilih Es; "klaim ke-n dari 4" tampil sebelum mengajukan.
- Notifikasi tampil sebagai toast di atas, tidak lagi menutupi tombol (masalah di B4 Penpot).
- Langkah pasang menampilkan petunjuk Android atau iPhone saja.
- Denah: memakai denah Pra WAM terbaru, Pantry ditandai pin; catatan es hanya untuk pesanan Es.
- Nomor klaim tidak ditampilkan pada pesanan ditolak/dibatalkan (jatah tidak terpakai).

## Belum diputuskan

- Boleh lebih dari satu pengajuan menunggu sekaligus? (prototype: boleh, jatah ikut terpotong).
- Perlu tombol "Sudah saya ambil" setelah dibeli? (prototype: tidak ada).

- Fungsi printer thermal dan tablet pantry di alur baru (mis. struk untuk GA mengambil dan mengantar
  minuman tamu ke ruang rapat?).
- Varian **double shot**: form lama punya Americano/Espresso/Café Latte/Café Mocha/Piccolo double shot sebagai
  minuman terpisah, buku menu tidak (hanya Cappuccino Double Shot). Rekomendasi: opsi "Double shot" pada minuman
  berbasis espresso. Form lama juga tidak punya Cucumber Ice dan Classic Tea.
- Reset aktivasi oleh HR: apakah riwayat klaim dan sisa jatah tetap (desain C7 menganggap tetap).
- Kolom Ruangan di rekap detail (C4/C5 belum memuatnya; alur pesanan rapat mencatat ruangan).
- Jatah HR sendiri; apakah jatah dikembalikan bila pesanan batal setelah dipesan.
- Lebar kertas printer (58/80 mm) dan perangkatnya.
- Foto minuman asli (sementara gambar AI).
