# Audit F1: pengelola `/admin/coffee` (25 Nov 2026)

Peninjau independen. Yang diaudit: commit `fde85bf1` (dibaca lewat `git show fde85bf1:<path>`). Nomor baris di bawah
mengacu ke commit itu. Tidak ada kode yang diubah, tidak ada build. Skill yang dipakai: `ui-ux-pro-max`
(aksesibilitas, sentuhan, formulir, tabel, navigasi).

## Cara memeriksa

- Baca kode: `src/app/admin/coffee/**`, `src/components/coffee-admin/**`, `src/app/dev-preview/coffee/nyata/admin/**`,
  penjaga `src/lib/server/admin-session.ts`, `src/proxy.ts`, `src/lib/routes.ts`.
- Tes: `npx vitest run src/components/coffee-admin src/app/admin/coffee` → 4 berkas, 30 tes, semua lulus.
- Reproduksi balapan: tes sementara di luar repo (scratchpad, tidak masuk worktree) yang menjalankan `CoffeeAdminApp`
  asli dengan server tiruan yang diberi jeda. Dijalankan saat `coffee-admin/**` masih sama dengan commit.
- Browser (panel bawaan, `next dev -p 3220`, `/dev-preview/coffee/nyata/admin`): 1440×900, 768×1024, 375×812, 320×640.
  Tab ditutup dan server dihentikan setelahnya.

**Batas yang perlu diketahui:**
- Saat cek browser berjalan, agen lain sudah mengubah `coffee-admin/**` di worktree (tombol "Batalkan catatan").
  Jadi browser menampilkan commit + perubahan yang sedang dikerjakan, dan data contoh sempat ter-reset sekali karena
  hot reload. Temuan browser yang berasal dari perubahan itu ditandai **(WIP)**; sisanya sudah dicocokkan dengan kode commit.
- Halaman asli `/admin/coffee*` dengan sesi admin **tidak diuji** (tanpa sandi, tanpa migrasi). Penjaga halaman hanya dibaca.
- Unduhan CSV/Excel: hanya alamatnya yang dicek.
- Zoom 200%: tidak diuji langsung; pada 1440 px setara lebar 720 px (tata letak HP), yang dicek di 375 dan 320.
- Pembaca layar sungguhan tidak dipakai; penilaian a11y dari DOM, fokus, dan peran.
- Perbandingan dengan prototipe: kata-kata kunci dicocokkan dengan sampel (`grep`), bukan baris demi baris.
- Mode gelap tidak diuji.

## Temuan

| ID | Tingkat | Berkas:baris | Yang salah | Cara mengulang | Saran perbaikan | Status (26 Nov, setelah perbaikan) |
| --- | --- | --- | --- | --- | --- | --- |
| F1-01 | **Tinggi** | `QueueCard.tsx:99`, `useQueue.ts:79-82`, `CoffeeAdminApp.tsx:148-152` | Klik ganda pada "Selesai diproses" menyelesaikan **dua** pesanan. Kartu hilang seketika (optimistis), kartu berikutnya naik tepat ke bawah kursor/jari, klik kedua mengenai tombol Selesai kartu itu. Pesanan kedua tercatat selesai padahal belum dibeli, dan pemesannya diberi tahu selesai. Pesan hanya menyebut pesanan terakhir. | Terverifikasi di browser 1440: selesaikan pesanan rapat sehingga dua klaim berurutan, klik ganda Selesai pada Café Latte → Café Latte **dan** Matcha Latte masuk "Baru diproses", antrean kosong. Berlaku juga di HP (tombol selebar kartu). | Tahan aksi antrean ±600-800 ms setelah satu kartu diproses (abaikan klik pada kartu lain), atau biarkan kartu di tempatnya sebagai baris "Selesai · Urungkan" selama beberapa detik sebelum hilang, supaya tidak ada tombol yang bergeser ke bawah kursor. Tambah tes. | Diperbaiki. Setelah satu kartu keluar dari antrean, Selesai pada kartu lain diabaikan 700 ms (`CLICK_GUARD_MS`); tidak ada pesan, tidak ada kiriman. Tes + browser 768. |
| F1-02 | **Tinggi** | `useQueue.ts:46-60`, `79-86`, `26-29` | Pembacaan antrean yang **mulai saat Selesai/Tolak masih dikirim** tidak dibuang (epoch hanya membuang pembacaan yang mulai sebelum aksi). (a) Bila server menjawab dengan keadaan sebelum aksi tersimpan: kartu muncul lagi, lalu `processed()` menambahkannya ke "Baru diproses" tanpa menghapusnya dari antrean → pesanan ada di dua tempat; menekan Selesai lagi menghasilkan "sudah diproses orang lain" padahal dirinya sendiri. (b) Bila server menjawab dengan keadaan sesudah aksi: `processed()` menambah hitungan sekali lagi → "Selesai" hari ini +2. Pulih sendiri pada pembacaan berikutnya (≤ 10 detik). | Terverifikasi dengan tes sementara: `finish` diberi jeda, `visibilitychange` dikirim saat masih menunggu. Hasil (a): 3 kartu padahal seharusnya 2, pesan "Selesai diproses" tampil; (b): Selesai 2 → 4. Di dunia nyata: polling 10 detik atau kembali ke tab jatuh di tengah POST (jaringan lambat). | Simpan himpunan id yang sedang diproses; saring id itu dari hasil setiap pembacaan, dan jangan terapkan pembacaan selama ada aksi yang belum dijawab (baca ulang sekali setelah aksi selesai). `processed()` juga harus menghapus pesanan dari `waiting` dan tidak menambah hitungan bila pesanan sudah ada di `recent`. | Diperbaiki. Pembacaan yang kembali selagi ada aksi dikirim dibuang (`sending`), antrean dibaca sekali setelah aksi terakhir dijawab; `processed()` menghapus dari antrean dan tidak menghitung dua kali. Tes dua arah. |
| F1-03 | Sedang | `coffee-admin.module.css:17`, `395-397`, `RecapView.tsx:153-158` | Di HP, Rekap dengan "Rentang lain" melebar ke samping: judul rentang (`white-space: nowrap`) memaksa kolom `.view` (grid tanpa `minmax(0,1fr)`) menjadi 408 px di dalam kotak 271 px. Seluruh halaman ikut melebar, teks dan kartu angka terpotong di kanan. Melanggar "tanpa geser ke samping di 320 px". | Terverifikasi di 320: Rekap → Filter → Dari tanggal 31/10/2026 → Lihat hasil. `scrollWidth` 433 pada layar 320. Hitungannya sama untuk 375. | `.view, .stack { grid-template-columns: minmax(0, 1fr); }` dan `.filterBar > span { flex: 1; }`. Tambah cek 320 dengan rentang lintas bulan. | Diperbaiki. `.view`/`.stack` satu kolom `minmax(0, 1fr)`, judul rentang `flex: 1` + elipsis. Browser 320 rentang lintas bulan: `scrollWidth` 320. |
| F1-04 | Sedang | `CoffeeAdminApp.tsx:91`, `141-147`, `QueueView.tsx:57-59` | `undoing` hanya menyimpan satu id. Menekan Urungkan pada pesanan kedua mengaktifkan lagi tombol pesanan pertama yang masih dikirim; tekan lagi → permintaan ganda → 409 dan pesan galat setelah yang pertama berhasil. Tombol Urungkan di pesan juga hanya mati selama `undoing` terisi. | Terverifikasi dengan tes sementara: dua Urungkan berurutan, tombol pertama `disabled=false`, `reopen` terpanggil `s-1, s-4, s-1`. | Jadikan `undoing` sebuah himpunan id (atau kunci per pesanan di `useQueue`). | Diperbaiki. `undoing` himpunan id di `useQueue`; kiriman kedua untuk pesanan yang sama ditolak di hook. |
| F1-05 | Sedang | `coffee-admin.module.css:293-294` (tata letak 761-1359 px) | Di 768 px antrean tetap dua kolom (kolom kanan 272 px). Kartu tinggal ±250 px: baris rapat pecah satu kata per baris ("Americano / · / Panas / · gula / Normal"), nama orang menumpuk. Standar admin §9 minta 768 bersih; catatan F1 sendiri mengakui 768 tidak dicek. | Terverifikasi di 768×1024, halaman Antrean, kartu rapat contoh. | Pindah ke satu kolom (ringkasan di atas, seperti HP) sampai ±1100 px, atau beri `.lines li` tata letak HP di bawah 1024 px. | Diperbaiki. Sampai 1100 px antrean satu kolom (angka hari ini di atas, Baru diproses di bawah). Browser 768: kartu 703 px. |
| F1-06 | Sedang | `coffee-admin.module.css:33` (tombol 40), `48` (36), `53` (40), `132` (kolom 40), `157` dan `166` (36) | Di atas 760 px semua target lebih kecil dari 44 px (aturan rumah: minimal 44). Tablet sentuh 768-1024 px terkena langsung. Terukur di 1440 dan 768: Selesai/Tolak/Salin/JumpStart/Catat manual 40 px, Urungkan 36 px. HP (≤ 760) sudah 44-56 px, tidak ada yang kurang. | Ukur `getBoundingClientRect()` tombol di 768. | Naikkan tinggi minimum ke 44 px di semua lebar, atau setidaknya pada `@media (pointer: coarse)`. | Diperbaiki. Semua target ≥ 44 px di semua lebar, termasuk tombol konsol di kepala halaman. Diukur di 1440 dan 768: tidak ada yang di bawah 44. |
| F1-07 | Sedang | `Layer.tsx:66`, `ManualSheet.tsx:110-117` | Catat manual tertutup tanpa bertanya saat isinya sudah diketik: Escape, klik di luar panel, tombol kembali HP, atau tab bawah. Semua isian hilang. Klik di luar juga menutup saat sedang menyimpan. | Buka Catat manual, isi nama dan minuman, tekan Escape. | Bila formulir sudah berubah, tanya dulu ("Buang isian?"), atau simpan drafnya selama sesi. Abaikan klik di luar saat `busy`. | Diperbaiki. Isian yang sudah berubah ditanya dulu ("Buang isian catatan ini?") untuk Escape, klik di luar, X, Batal, tombol kembali HP; tidak menutup saat menyimpan. |
| F1-08 | Sedang | `ManualSheet.tsx:18` | `newKey()` jatuh ke UUID tetap `00000000-0000-4000-8000-000000000000` bila `crypto.randomUUID` tidak ada (halaman lewat http non-localhost, browser lama). Semua catatan manual lalu memakai kunci yang sama. Akibat di server **perlu dicek** (bergantung cara F0 memperlakukan kunci ganda: catatan kedua bisa dianggap kiriman ulang dan tidak tersimpan, padahal layar bilang tersimpan). | Buka admin lewat `http://<ip>:port` (bukan https), catat manual dua kali. Tidak dijalankan. | Cadangan dari `crypto.getRandomValues`, atau tolak menyimpan dengan pesan jelas bila kunci tidak bisa dibuat. | Diperbaiki. Tanpa `randomUUID`: kunci dari `crypto.getRandomValues`, terakhir `Math.random`; tidak ada kunci tetap. (Server kini memperlakukan kunci sama sebagai kiriman ulang, jadi kunci tetap memang berbahaya.) |
| F1-09 | Rendah | `QueueCard.tsx:99`, `RefuseDialog.tsx:21-25`, `SettingsView.tsx:85` | Fokus hilang ke `<body>` setelah aksi: Selesai (kartunya hilang), Tolak (dialog mengembalikan fokus ke tombol yang sudah tidak ada), Simpan jatah (formulir dipasang ulang lewat `key`). Pengguna papan ketik mulai lagi dari atas halaman. | Terverifikasi: setelah Selesai dan setelah Simpan jatah `document.activeElement` = BODY. | Pindahkan fokus ke kartu berikutnya atau ke judul antrean; jangan pasang ulang `QuotaForm` setelah menyimpan. | Diperbaiki. Fokus pindah ke daerah antrean setelah Selesai/Tolak; formulir jatah tidak dipasang ulang setelah Simpan. |
| F1-10 | Rendah | `Layer.tsx:31-64`, `coffee-admin.module.css:177` | Dialog/panel tidak mengunci gulir latar (`body` tetap `overflow: visible`) dan latar tidak `inert`; `aria-modal` saja. Jebakan Tab tidak menarik fokus kembali bila fokus sudah di luar panel. Di desktop tombol kembali browser mengganti bagian di belakang dialog yang tetap terbuka. | Terverifikasi: dialog Tolak terbuka, `overflow` body `visible`, tidak ada `[inert]`. Tab/Shift+Tab di dalam dialog berputar dengan benar, Escape menutup dan fokus kembali ke tombol Tolak. | Kunci gulir saat lapisan terbuka, beri `inert` pada kerangka, dan tutup lapisan pada `popstate` di semua lebar. | Diperbaiki. Lapisan digambar lewat portal: gulir latar dikunci, selain lapisan teratas `inert`, Tab menarik fokus kembali, tombol kembali menutup lapisan di semua lebar; lapisan boleh bertumpuk. |
| F1-11 | Rendah | `RefuseDialog.tsx:21-25` | Tolak tanpa catatan: galat muncul (`role="alert"`) tetapi fokus tetap di tombol Tolak, tidak pindah ke kolom catatan. | Terverifikasi di 1440 dengan papan ketik. | Fokuskan textarea saat validasi gagal. | Diperbaiki. Fokus ke kolom catatan saat validasi gagal. (Tanpa tes khusus.) |
| F1-12 | Rendah | `CoffeeAdminApp.tsx:219-228`, `coffee-admin.module.css:366` | Di HP pesan menutupi tombol kartu (Salin, JumpStart, Tolak, sebagian Selesai) selama 6 detik; pesan galat menetap sampai ditutup. Wadah pesan bukan area hidup yang sudah ada sebelum isinya (peran dipasang bersama isi), jadi pengumuman pembaca layar tidak terjamin (**perlu dicek** dengan pembaca layar). Pesan "Pesanan baru masuk" juga menimpa pesan yang masih memuat Urungkan. | Terverifikasi di 375 setelah Catat manual: pesan berada di atas baris aksi kartu pertama. | Pesan satu baris yang lebih pendek di HP, atau taruh di atas (di bawah bilah atas); jadikan wadahnya `aria-live` tetap; jangan timpa pesan ber-Urungkan dengan pesan informasi. | Diperbaiki sebagian. Di HP pesan tampil di bawah bilah atas; "Pesanan baru masuk" tidak menimpa pesan ber-Urungkan. Wadah `aria-live` tetap belum diubah (perlu dicek dengan pembaca layar). |
| F1-13 | Rendah | `RecapView.tsx:59`, `186` | Pembaruan diam-diam tidak diam: setiap `version` naik (pesanan baru, aksi apa pun) saat Rekap di layar, seluruh isi diredupkan ke opasitas 0,6 (kontras teks abu turun ke 2,4:1) sampai jawaban datang. | Buka Rekap, tekan "Tambah klaim contoh", tunggu polling. Dibaca dari kode; kedipnya tidak teramati karena server tiruan menjawab seketika. | Redupkan hanya saat filter berganti (`!hit`), bukan saat data yang sama dibaca ulang. | Diperbaiki. Redup hanya saat filter berganti. |
| F1-14 | Rendah | `CoffeeAdminApp.tsx:100-108` | Pengaturan tidak pernah dibaca ulang setelah pertama kali dimuat: jatah dan daftar pemegang akses bisa basi sepanjang sesi, dan Simpan menimpa perubahan pengelola lain. Bila pembacaan gagal saat hanya Catat manual yang membutuhkannya, tidak ada percobaan ulang dan baris jatah diam-diam tidak muncul. | Dibaca dari kode. | Baca ulang saat bagian Pengaturan dibuka lagi dan saat Catat manual dibuka. | Diperbaiki. Pengaturan dibaca ulang tiap kali bagian itu atau Catat manual dibuka; isian yang belum disimpan tidak ditimpa. |
| F1-15 | Rendah | `useQueue.ts:66`, `46-56` | Polling tidak menunggu permintaan sebelumnya. Bila satu pembacaan lebih lama dari 10 detik, dua jawaban bisa tiba terbalik: yang lama menimpa yang baru dan `known` mundur, sehingga "Pesanan baru masuk" bisa muncul dua kali. | Dibaca dari kode; tidak diulang. | Lewati tik bila masih ada pembacaan berjalan, atau beri nomor urut pada tiap pembacaan. | Diperbaiki. Tik dilewati selama pembacaan masih berjalan; jawaban lama tidak menimpa yang baru (nomor urut). |
| F1-16 | Rendah | `RecapView.tsx:198-205` | `role="tablist"` berisi `<span>` (bukan tab) dan kedua tab sama-sama `tabindex=0` tanpa panah kiri/kanan. | Terverifikasi di DOM: kedua tab `tabIndex` 0. | Keluarkan catatan dari tablist; roving tabindex + panah, atau pakai tombol biasa dengan `aria-pressed`. | Diperbaiki. Tablist hanya berisi tab, satu perhentian Tab, panah kiri/kanan. |
| F1-17 | Rendah | `coffee-admin.module.css:9`, `132` | Garis kolom isian (`--line-strong`) hanya 1,96:1 terhadap putih; batas komponen seharusnya ≥ 3:1. Semua teks lulus (terendah 4,75:1, lihat tabel kontras). | Dihitung dari token. | Gelapkan campuran `--line-strong` (±45% teks) untuk input dan chip. | Diperbaiki. `--field-line` untuk kolom isian dan chip; terukur 3,9:1 terhadap putih. |
| F1-18 | Rendah | `SettingsView.tsx:27-38` | Jatah boleh disimpan 0 tanpa konfirmasi; itu menutup klaim satu kelompok mulai klaim berikutnya. | Terverifikasi di 375: Karyawan 4 → 0 → Simpan jatah langsung tersimpan. | Konfirmasi singkat bila ada nilai yang menjadi 0 (atau turun). | Diperbaiki. Konfirmasi bila ada jatah yang menjadi 0. |
| F1-19 | Rendah | `PersonPicker.tsx:18` | Hanya 8 nama pertama tampil tanpa tanda bahwa masih ada yang lain; kolom nama kena periksa ejaan (garis merah). | Terlihat di tangkapan layar Catat manual. | Tulis "Ketik untuk mempersempit" bila hasil terpotong; `spellCheck={false}`. | Diperbaiki. "n nama lagi. Ketik untuk mempersempit.", `spellCheck={false}`. (Tanpa tes khusus.) |
| F1-20 | Rendah | `ManualSheet.tsx:98`, `172` | Jumlah tamu tidak dicek di klien (pecahan, > 500): galat server hanya muncul di banner bawah, bukan di bawah kolomnya. | Dibaca dari kode. | Tambah `shown("guestCount")` di bawah kolom. | Diperbaiki. Jumlah tamu dicek di klien, galat di bawah kolomnya. |
| F1-21 | Rendah | `DetailTable.tsx:99` | "Jam diproses" hanya jam; pesanan yang diproses di hari lain terbaca seolah hari yang sama. Baris tabel Detail tidak punya sel kepala baris. | Dibaca dari kode. | Tampilkan tanggal bila berbeda hari; jadikan sel Nama `<th scope="row">`. | Diperbaiki di tabel layar (tanggal bila beda hari, Nama = kepala baris). Berkas CSV/Excel tidak diubah (lihat R-2 di audit F0). |
| F1-22 | Rendah | `CoffeeAdminNav.tsx:43-51` | Keadaan "menunggu migrasi" menampilkan nama berkas SQL ke pengelola, tanpa langkah berikutnya, dan di HP tanpa tab bawah. | Terverifikasi di `?tunggu=1`, 375. | Kalimat awam ("Werkudara Coffee belum disiapkan. Hubungi super admin."), rincian teknis hanya untuk super admin. | Ditunda: perlu kalimat dari pemilik dan pembedaan super admin di layar "menunggu". |
| F1-23 | Rendah | `coffee-admin.module.css:41`, `146`, `209`, `330` | Warna mentah (`#fff`, `rgba(...)`) di samping token. | `grep` → 5 baris. | Pakai `--cs-on-primary` / token bayangan. | Diperbaiki sebagian: `#fff` diganti token; bayangan `rgba(...)` dibiarkan (konsol belum punya tokennya). |
| F1-24 | Rendah | `RecapView.tsx:51`, `QueueCard.tsx:35` | `kept` bertambah satu entri per kata cari tanpa batas; `setTimeout` salin tidak dibersihkan. Tidak berdampak nyata. | Dibaca dari kode. | Batasi `kept` (mis. 20 terakhir). | Ditunda: tidak berdampak nyata. |
| W-01 | Catatan **(WIP)**, bukan `fde85bf1` | `DetailTable.tsx` di worktree, `coffee-admin.module.css:26`, `237` | Tombol "Batalkan catatan" yang sedang ditambahkan memuat `.srOnly` (`position: absolute`) di dalam tabel Detail. Karena `.tableBox` tidak `position: relative`, elemen itu lolos dari kotak gulir dan halaman melebar: `scrollWidth` 2351 pada 1440. Di kolom "Baru diproses" (300 px) labelnya juga menimpa teks. | Terverifikasi di browser 1440: Rekap → Detail. Dengan `position: relative` pada `.tableBox`, `scrollWidth` kembali 1425. | `.tableBox { position: relative; }` (akar masalahnya ada di CSS F1), dan beri baris "Baru diproses" ruang untuk label yang lebih panjang. | Diperbaiki di commit perbaikan F0: `.tableBox` relatif, baris "Baru diproses" memberi tombol barisnya sendiri; di HP tombol di bawah teks baris. |

## Yang diperiksa dan lulus

- **Penjaga halaman**: ketiga `page.tsx` memanggil `requireAdminPage()` sebagai baris pertama, sebelum membaca data atau
  merender apa pun. Penjaga itu memeriksa sesi dan, untuk admin perorangan, izin area dari alamat (`areaOfPath` →
  `coffee`), dengan `notFound()` bila tidak berhak. `loading.tsx` hanya menampilkan "Memuat Werkudara Coffee".
  Lapisan kedua di `src/proxy.ts`. **Tidak diuji dengan sesi sungguhan.**
- **`next`**: dibentuk `proxy.ts` dari `pathname + search` milik permintaan itu sendiri; F1 tidak menambah pengalihan baru.
  Cara halaman login memakai `next` di luar lingkup F1 (**perlu dicek** di audit login bila belum).
- **XSS**: tidak ada `dangerouslySetInnerHTML`; nama, catatan, dan "Lainnya" dirender sebagai teks. Dicoba di browser:
  nama minuman `<img src=x onerror=alert(1)>…` tampil sebagai teks, tidak ada elemen yang tersisip.
- **Data ke klien**: hanya data bagian itu (antrean, rekap, pengaturan). `holders` membawa `id` yang hanya dipakai sebagai
  `key`; boleh dibuang, bukan kebocoran.
- **Salin rincian**: teks polos dari `orderText`; tidak ada HTML.
- **409**: "Pesanan ini sudah diproses orang lain. Antrean diperbarui." tampil, kartu hilang, sisa antrean utuh (browser + tes).
- **Rekap**: bulan → `dari`/`sampai` benar (`monthEnd` memakai UTC, Februari kabisat aman); batas 366 hari sama dengan
  skema server; rentang terbalik menahan permintaan dan mematikan unduhan; tautan unduh membawa filter yang sama
  (dicek setelah mengganti tanggal); 34 minuman + 1 ditolak = 35 baris Detail; `?bulan=` divalidasi di server.
- **Pengaturan**: 61 dan kosong ditolak dengan pesan di bawah kolom, tombol mati sampai ada perubahan.
- **Navigasi**: pindah bagian tanpa muat ulang, judul tab ikut, tombol kembali berjalan mundur; di HP tombol kembali
  menutup sheet tanpa meninggalkan halaman (dicek dengan `?alamat=1` di 320).
- **HP 375 dan 320**: Antrean, Rekap (bulan penuh), Detail (daftar, bukan tabel), Pengaturan, sheet Catat manual, sheet
  filter: `scrollWidth` = lebar layar, tidak ada target di bawah 44 px, kolom isian 16 px / 48 px.
- **Kata-kata**: "Diproses" dipakai; tidak ada "HR membelikan", tidak ada WhatsApp; sentence case; tidak ada
  `text-transform: uppercase`. Antrean kosong memakai kalimat rencana.
- **Gerak**: `prefers-reduced-motion` mematikan animasi kartu, pesan, lapisan, dan kerangka.
- **Alamat**: tidak ada alamat coffee yang ditulis tangan; semua dari `routes.ts`.
- **Konsol browser**: tidak ada galat selama pengujian.

### Kontras (token konsol tema admin, mode terang)

| Pasangan | Rasio |
| --- | --- |
| Teks abu `#636d7c` di putih / `#f6f7f9` / `#f2f4f7` | 5,24 / 4,89 / 4,75 |
| Teks kedua `#5b6573` di putih / di `#e9edf2` | 5,91 / 5,03 |
| Menunggu `#8f5600` di `#fbefd9` | 5,27 |
| Putih di `#8f5600` (lencana tab) | 6,00 |
| Selesai `#276b43` di `#e3f1e8` | 5,51 |
| Ditolak `#9a273d` di `#f8e3e7` / di putih | 6,27 / 7,69 |
| Biru tua `#0f3f80` di `#eaf0f8` | 8,97 |
| Putih di biru `#1551a0` | 7,73 |
| Teal `#0b6b62` di `#e0f3f1` / di putih | 5,54 / 6,38 |
| Garis kolom isian di putih (bukan teks) | 1,96 (F1-17) |
| Teks abu saat diredupkan 0,6 (sementara) | 2,42 (F1-13) |

## Tes yang belum ada

1. Klik ganda / dua klik cepat pada Selesai tidak memproses kartu berikutnya (F1-01).
2. Pembacaan antrean yang jatuh di tengah Selesai: kartu tidak kembali, hitungan tidak ganda (F1-02, dua arah).
3. Dua Urungkan berurutan: tombol pertama tetap mati, `reopen` sekali per pesanan (F1-04).
4. Polling: tidak bertanya saat tab tersembunyi, bertanya saat kembali, timer dibersihkan saat dilepas, jawaban terbalik (F1-15).
5. Urungkan yang ditolak server (lewat 5 menit, jatah habis): pesan galat dan antrean dibaca ulang.
6. Tolak yang gagal karena jaringan: kartu kembali ke antrean.
7. `Layer`: Escape, jebakan Tab, fokus kembali, tombol kembali HP (tidak ada tes sama sekali untuk `Layer.tsx`).
8. `PersonPicker`: panah, Enter, Escape hanya menutup daftar (bukan sheet), mengetik ulang mengosongkan pilihan.
9. `SettingsView`: tidak ada tes (validasi 0-60, tombol mati tanpa perubahan, galat server, gagal muat + Coba lagi).
10. `DetailTable`: urut terbaru/terlama, "Tampilkan 100 baris lagi", reset saat filter berganti.
11. Rekap: cari dengan jeda 300 ms, "Hapus filter", jawaban lama yang datang terlambat tidak menimpa filter baru,
    rentang > 366 hari, `monthEnd`/`recentMonths` di pergantian tahun dan Februari.
12. `CoffeeAdminApp`: pindah bagian (`intercept`, klik dengan Ctrl dibiarkan), `?catat=1` membuka sheet dan alamat dirapikan,
    lencana jumlah menunggu di menu dan tab bawah, pesan sukses hilang 6 detik sedangkan galat menetap.
13. Catat manual: kunci idempoten tetap sama saat kirim ulang dan baru saat sheet dibuka lagi; tanggal sebelum awal bulan
    lalu; jam di masa depan.
14. Ketiga `page.tsx`: tidak ada tes bahwa `requireAdminPage` dipanggil lebih dulu dan bahwa 503 menjadi layar "menunggu".

## Daftar periksa (templat §5)

| Sisi | Hasil | Bukti |
| --- | --- | --- |
| Keamanan | Lulus (dibaca), sesi asli **tidak diuji** | `page.tsx:14` di ketiga halaman; `admin-session.ts:33-38` |
| Data dan jatah | Di luar F1 (server). Di klien: **Gagal** sementara pada hitungan hari ini | F1-02 |
| UX vs prototipe | Lulus sebagian (sampel kata), selisih di catatan F1 masuk akal | F1-07, F1-12, F1-22 |
| Rasa aplikasi | Lulus, kecuali redup saat baca ulang | F1-13, F1-14 |
| A11y | **Gagal** sebagian | F1-06, F1-09, F1-10, F1-11, F1-16, F1-17 |
| HP dan tablet | **Gagal** di 320/375 (rentang lain) dan 768 | F1-03, F1-05 |
| Tes | Lulus 30/30; cakupan kurang | daftar di atas; `typecheck` dan `lint` **tidak dijalankan** |
| Kode vs konvensi | Lulus dengan catatan kecil | F1-23; `RecapView.tsx` 320 baris, `sample.ts` (server tiruan) berada di folder komponen produksi |

## Putusan

**Belum layak dipakai pengelola sungguhan sebelum F1-01 dan F1-02 diperbaiki.** Keduanya bisa menandai pesanan selesai
atau menampilkan antrean yang salah pada alur utama, dan F1-01 terjadi dengan satu klik ganda biasa. Keamanan tingkat
halaman, kata-kata, tata letak HP dasar, dan alur 409 sudah baik.

Urutan perbaikan:

1. F1-01 klik ganda memproses dua pesanan.
2. F1-02 pembacaan di tengah aksi (kartu kembali, hitungan ganda).
3. F1-03 Rekap melebar di HP dengan rentang lain (satu baris CSS), sekaligus W-01 (`.tableBox` relatif) sebelum
   "Batalkan catatan" di-commit.
4. F1-04 Urungkan ganda.
5. F1-05 dan F1-06 tablet 768 dan target 44 px.
6. F1-07 isian Catat manual hilang; F1-08 kunci cadangan.
7. Sisanya (F1-09 sampai F1-24) dan tes yang belum ada, terutama nomor 1-4 dan 7.

## Sesudah perbaikan (26 Nov 2026, agen perbaikan)

Kolom **Status** di tabel temuan diisi oleh agen perbaikan (commit `fix(coffee): temuan audit admin pengelola …`).

- **Cek browser** (`next dev -p 3210`, `/dev-preview/coffee/nyata/admin`, tab ditutup dan server dihentikan): 1440, 768,
  375, 320. Tidak ada geser ke samping (termasuk Rekap rentang lintas bulan di 320 dan Detail di 1440), tidak ada target
  di bawah 44 px di 1440 dan 768, klik ganda Selesai memproses satu pesanan, pesan di HP di bawah bilah atas, "Buang
  isian?" di atas sheet, latar terkunci dan `inert` selama lapisan terbuka. Konsol tanpa galat.
- **Tetap tidak diuji:** halaman asli dengan sesi admin, unduhan berkas, pembaca layar sungguhan, mode gelap, zoom 200%.
- **Tes yang ditambahkan** dari daftar "belum ada": 1-7 (`QueueRaces.dom.test.tsx`, `Layer.dom.test.tsx`), 9
  (`SettingsView.dom.test.tsx`), 13 sebagian (kunci), plus aturan tata letak yang dibaca dari stylesheet (`layout.test.ts`).
- **Masih belum ada:** 8 (`PersonPicker`), 10 (`DetailTable` urut dan "100 baris lagi"), 11 (cari 300 ms, jawaban lama
  Rekap, 366 hari, `monthEnd`), 12 (`intercept`, `?catat=1`, pesan 6 detik), 14 (ketiga `page.tsx`).
- Skill desain tidak dimuat oleh agen perbaikan: perubahan tampilan mengikuti saran audit ini (yang memakai
  `ui-ux-pro-max`) dan memakai kelas yang sudah ada; tidak ada arah visual baru.

