# Audit F3: tablet GA `/coffee/ga` + buku menu tamu (26 Nov 2026)

Peninjau independen. Yang diaudit: commit `1bc431eb`. Nomor baris mengacu ke commit itu (dibaca dari salinan
`git archive 1bc431eb`, bukan dari berkas kerja). Tidak ada kode yang diubah, tidak ada build, tidak ada commit.
Skill yang dipakai: `ui-ux-pro-max` (sentuhan, formulir, navigasi, aksesibilitas).

## Cara memeriksa

- Baca kode: `src/app/coffee/ga/**`, `src/components/coffee/ga/**`, `src/components/coffee/{Layer,Toast,api}.ts(x)`,
  `src/app/dev-preview/coffee/nyata/ga/**`, `src/app/api/coffee/ga/{state,meetings}/route.ts`,
  `src/lib/server/coffee/{session,meetings,people,store,rate}.ts`, `src/lib/coffee/{schemas,rooms,access,menu}.ts`,
  fungsi SQL `coffee_submit_meeting` (migrasi `202612010001_coffee.sql:187-262`), prototipe `GaPrototype.tsx`.
- Tes: `npx vitest run src/components/coffee/ga` → **4 berkas, 33 tes, semua lulus** (dijalankan dua kali: saat worktree
  masih sama dengan commit, dan sekali lagi setelah agen lain mengubah berkas F2; hasil sama).
- `curl` ke server dev 3220 tanpa sesi: `GET /api/coffee/ga/state` 401 JSON, `POST /api/coffee/ga/meetings` 401 JSON,
  `/coffee/ga` 200 berisi kerangka `loading.tsx` (pengalihan dikirim di dalam aliran, sama dengan catatan F2).
- Browser (panel bawaan, tab baru, `next dev -p 3220`, `/dev-preview/coffee/nyata/ga`, `?kosong=1`, `?lambat=1`) di
  1280×800, 1024×768, 768×1024. Tab ditutup dan server dihentikan setelahnya.
- Kontras dihitung dari token `ga.module.css:8-15`.

**Batas yang perlu diketahui:**
- Halaman asli `/coffee/ga` **dengan sesi tidak diuji** (tanpa sandi, tanpa migrasi). Penjaga 403 untuk non-GA dan
  pengalihan `?pesan=ga` hanya dibaca dari kode dan tes F0.
- **Tablet sungguhan tidak dipakai.** Keyboard layar, tarik-untuk-menyegarkan, tombol/gestur kembali Android, tekan
  lama, dan putar layar tidak bisa diuji di panel browser. Temuan yang bergantung padanya ditandai "perlu dicek di tablet".
- Sebagian besar ketukan dilakukan lewat skrip (`click` sintetis), ukuran dan posisi diukur dari DOM. Tangkapan layar
  panel terpotong di 1280 dan 1024 (panel lebih kecil dari layar tiruan), jadi tata letak di dua ukuran itu dinilai dari
  ukuran DOM (`scrollWidth`, kotak elemen), bukan dari gambar. 768×1024 dilihat langsung.
- Server tiruan menolak kiriman **sebelum** menyimpan saat "jaringan diputus", jadi "jawaban hilang di jalan" (F3-02)
  tidak bisa ditiru di pratinjau; dibuktikan dari kode klien + fungsi SQL.
- Di tengah pemeriksaan browser (±10.14) agen lain mulai mengubah berkas F2 di worktree, termasuk tiga berkas yang dipakai
  tablet: `Layer.tsx` (tambah `leavePage`, tidak mengubah perilaku lapisan di tablet; `git diff` sudah dibaca),
  `api.ts`, `coffee.module.css`. Berkas `ga/**`, API GA, dan server tidak berubah. Halaman sempat dimuat ulang sendiri
  oleh server dev (satu skrip terputus dan diulang). Temuan "terverifikasi di browser" setelah jam itu berjalan di atas
  berkas kerja; semuanya menyangkut kode `ga/**` yang masih sama dengan commit.
- `npm run typecheck` dan `npm run lint` **tidak dijalankan** (worktree sedang diubah agen lain).
- Urutan Tab papan ketik hanya dicek sekilas (tiga kali Tab di buku menu). Pembaca layar tidak dipakai.

## Temuan

| ID | Tingkat | Berkas:baris | Yang salah | Cara mengulang | Saran perbaikan | Status (26 Nov, setelah perbaikan) |
| --- | --- | --- | --- | --- | --- | --- |
| F3-01 | **Tinggi** (gestur: perlu dicek di tablet) | `GaApp.tsx:45,85-91,145-149`; `ga.module.css:18,289` (tanpa `overscroll-behavior`) | **Mode tamu hanya ada di memori halaman.** Memuat ulang atau meninggalkan halaman saat tamu memegang tablet (a) membuang semua pilihan tamu dan minuman yang belum dikirim, dan (b) mendarat di **Beranda GA**: semua pesanan rapat hari ini (nama tamu/instansi lain, PIC), lalu daftar karyawan lewat Pesanan baru, dan tautan "Aplikasi saya". Satu-satunya penghalang adalah pertanyaan bawaan browser ("Muat ulang situs?"), yang tidak menyebut apa pun soal pesanan. Tarik-untuk-menyegarkan tidak dimatikan (`overscroll-behavior` = `auto` di `html` dan `body`, diukur), padahal sampul dan halaman buku tidak bergulir, jadi tarikan ke bawah langsung menjadi gestur muat ulang di Chrome Android. Tombol/gestur kembali juga meninggalkan halaman (lihat F3-06). | Terverifikasi di browser: Pesanan baru → ruangan + PIC → Serahkan ke tamu → buka buku → pindah alamat/muat ulang: tool browser harus memaksa lewat pertanyaan `beforeunload`, dan yang tampil setelahnya Beranda GA, bukan sampul. `getComputedStyle(html/body).overscrollBehaviorY` = `auto`. Gestur tarik dan kembali di tablet asli **belum diuji**. | Simpan mode tamu di `sessionStorage` (draf: ruangan, PIC id+nama, tamu; baris yang belum dikirim; pilihan tamu) dan pulihkan saat halaman dimuat: muat ulang kembali ke **sampul**, bukan Beranda. `overscroll-behavior: none` pada `html`/`body` selama tablet GA terbuka. Tes: render ulang `GaApp` dengan penyimpanan terisi → hanya buku menu di DOM. | **Diperbaiki.** Mode tamu, ruangan/PIC, baris GA yang belum dikirim, dan pilihan tamu disimpan di `sessionStorage` (`ga/hold.ts`) + cookie `coffee_ga_tamu`; halaman yang dimuat saat cookie itu ada **tidak membawa data GA sama sekali** (`page.tsx`: tanpa `gaState`) dan langsung membuka buku menu; tanpa simpanan → sampul terkunci. Selama mode tamu `useGa` tidak membaca apa pun. `overscroll-behavior: none` di `html`/`body`/`.book`, menu konteks dan seret gambar ditahan, tanpa seleksi teks. Tes: `GaApp.dom.test.tsx` "F3-01 …" (3), `page.test.tsx`, `model.test.ts`, `layout.test.ts`. Dicek di browser 1280×800: muat ulang paksa → buku menu dengan pilihan utuh, HTML server tanpa data GA. **Gestur tarik di tablet asli belum diuji.** |
| F3-02 | Sedang | `GaApp.tsx:108-111,113-130`; `useGa.ts:79-80`; SQL `:217-225` | **Jawaban Kirim yang hilang di jalan + pesanan diubah = minuman hilang diam-diam.** Kunci kiriman dipertahankan setelah galat jaringan (benar untuk coba ulang yang sama), tetapi GA boleh mengubah pesanan sebelum menekan Kirim lagi: menambah minuman, mengubah jumlah, bahkan "Ubah data" lalu mengganti ruangan/PIC (`begin` mempertahankan kunci yang ada). Bila kiriman pertama sebenarnya sudah tersimpan, fungsi SQL mengembalikan pesanan lama untuk kunci yang sama **tanpa membandingkan isinya**; tablet menampilkan "Pesanan terkirim ke pengelola." dan mengosongkan panel. Minuman tambahan tidak pernah sampai ke pengelola. Yang terlihat hanya layar Terkirim yang memuat isi versi server (mudah terlewat). Kebalikan dari F2-02. | Dibaca dari kode (tidak bisa ditiru di pratinjau). Urutan: Kirim 3 minuman, sinyal putus setelah permintaan sampai → "Tidak dapat terhubung" → tambah 2 minuman → Kirim → "terkirim", layar Terkirim berisi 3. | Setelah galat jaringan: baca ulang `state` dulu; bila pesanan dengan kunci itu sudah ada (server perlu mengembalikan kunci atau klien mencocokkan lewat jawaban idempoten), tampilkan sebagai terkirim dan tawarkan sisanya sebagai Tambah lagi. Paling sederhana: bila jawaban sukses memuat jumlah baris/isi yang berbeda dari yang dikirim, jangan kosongkan panel; katakan "Kiriman pertama sudah masuk (3 minuman). 2 minuman berikut belum terkirim" dan kirim sisanya dengan `parentId`. Ganti kunci bila draf (ruangan/PIC) berubah. Tes untuk urutan di atas. | **Diperbaiki.** Kunci terikat pada isi persis (`printOf`): isi berubah = kunci baru. Setelah jawaban hilang, status dibaca saat itu juga dan kiriman yang ternyata sampai tampil sebagai terkirim; bila pesanan diubah sesudahnya, tablet mencari kiriman pertama dulu ("Kiriman sebelumnya ternyata sudah masuk sebagai #T-…"), sisanya dikirim sebagai Tambah lagi; bila belum bisa memastikan, tidak mengirim. Server: sidik isi (`request_print`) disimpan, kunci yang sama dengan isi lain → 409 `COFFEE_KEY_REUSED` (SQL + `fake-db.ts` + jalur 23505). Tes: "F3-02 …" (4), `meetings.test.ts`. |
| F3-03 | Sedang | `GaApp.tsx:58,63-69,174` (`onHome={toHome}`), `93-96,100-103` | **Minuman yang belum dikirim bisa terbuang tanpa pertanyaan.** Pesan status dibuat saat GA tidak sedang menulis (punya `onOpen`), lalu tetap tampil (ditolak menetap; pesan lain 6 detik) ketika GA mulai menulis pesanan. Mengetuknya membuka layar Terkirim; dari sana **Ke beranda** / **Beranda** memanggil `toHome` langsung (mengosongkan `lines`), dan **Tambah lagi / Buat pesanan pengganti** memanggil `startRound` (`setLines([])`). Aturan "tidak membuang isian tanpa bertanya" hanya dijaga di jalur `leave`. | Terverifikasi di browser 1280: kirim pesanan → kotak Pratinjau "Tolak" → pesan ditolak muncul → Buat pesanan pengganti → ketuk 3 minuman → ketuk pesan ditolak → layar "Pesanan ditolak" → Ke beranda: langsung Beranda, tanpa "Buang pesanan yang belum dikirim?", 3 minuman hilang. | Hitung `onOpen` saat diketuk (baca `writing.current` di dalam handler), bukan saat pesan dibuat; dan/atau `Sent` memakai `leave` serta `startRound` bertanya dulu bila `lines.length > 0`. Tes: pesan lama diketuk saat ada baris → tidak pindah layar. | **Diperbaiki.** Pesan status tidak membuka layar lain bila saat diketuk ada pesanan yang sedang ditulis; `Sent` → Beranda / Tambah lagi dan tombol kembali selalu lewat pertanyaan bila ada baris. Tes: "F3-03 …", "F3-06 …". |
| F3-04 | Sedang (keputusan pemilik) | `ExitDialog.tsx:12-24`; `GuestBook.tsx:45`; `rancangan-kopi-kantor.md:134,177`; `RENCANA-PENERAPAN.md:403` | **Keluar dari buku menu tanpa PIN.** Tombol "Mode GA" bergambar gembok tampil di setiap halaman tamu; satu ketukan + "Ya, mode GA" membuka layar GA: nama, jabatan, dan BU **semua karyawan aktif** (pencarian PIC / anggota tim), semua pesanan rapat hari ini (instansi tamu lain), dan "Aplikasi saya" (aplikasi pribadi petugas: jatah, riwayat, Keluar). Penilaian jujur: cukup selama petugas GA berdiri di samping tablet; tidak cukup untuk alur yang justru dirancang ("Tamu berikutnya memilih": tablet berpindah tangan di meja rapat tanpa petugas). Rancangan masih menulis "memakai PIN GA"; "tanpa PIN" adalah **anggapan** rencana no. 7, belum jawaban pemilik. Server tetap aman (tamu memakai sesi GA, bukan hak baru), yang terbuka adalah data di layar dan kemampuan mengirim pesanan atas nama PIC mana pun. | Terverifikasi di browser: Mode GA → Ya, mode GA (setelah 450 ms) → Input cepat lengkap dengan daftar orang. Escape, ketuk luar, dan "Tetap di buku menu" bertahan di buku (lulus). | Tanyakan pemilik. Bila PIN: 4 angka milik tablet/petugas, diperiksa server (bukan dibandingkan di browser), dengan batas coba. Bila tetap tanpa PIN: minimal tekan-tahan 2 detik pada tombol keluar atau tombol tanpa label di pojok, dan tulis di `docs/aturan-coffee.md` bahwa tablet tidak ditinggal. Di luar aplikasi: pasang sebagai PWA + sematkan layar (screen pinning) Android. | **Diperbaiki (keputusan PM: PIN GA).** PIN 4 angka diatur pengelola di Pengaturan (`PUT /api/admin/coffee/settings/pin`), disimpan sebagai hash scrypt bergaram + rahasia server di `coffee_settings.ga_pin_hash`, tidak pernah dikirim ke klien (hanya `gaPin`/`pin`: sudah atau belum). Tablet: papan angka (tombol 64 px, 4 titik, tanpa kolom teks), diperiksa `POST /api/coffee/ga/pin` (penjaga GA, origin, 10 coba/10 menit per akun + batas per alamat, satu kalimat untuk semua salah). Belum diatur → pertanyaan seperti semula + pengingat di Beranda. Tes: `pin.test.ts`, `coffee-guards.test.ts` (2), `coffee-admin-guards.test.ts`, `SettingsView.dom.test.tsx` (2), "F3-04 …" (3). Dicek di browser. |
| F3-05 | Sedang | `api.ts:31-37` (dipakai `ga/api.ts`); `useGa.ts:34-51,57,69-87`; `GaApp.tsx:171` | **Kelas F2-03 dan F2-07 terulang di tablet.** (a) Tanpa batas waktu: Kirim pada koneksi yang menggantung = "Mengirim…" selamanya, tombol kembali diabaikan (`if (sending) return`), baris terkunci; hanya muat ulang yang menolong (dan itu membuang pesanan). Satu pembacaan `state` yang menggantung membuat `reading` tetap 1, semua tik berikutnya dilewati. (b) Pembacaan yang gagal itu diam: tablet tetap menampilkan "Diproses" tanpa tanda bahwa statusnya basi; tidak ada banner tidak tersambung dan tidak ada tombol segarkan. | Dibaca dari kode. Di pratinjau: "Putuskan jaringan" hanya terlihat saat menekan Kirim. | Ikut perbaikan F2 di `request` (batas waktu ±15 detik = galat jaringan, kunci tetap). Pastikan agen F2 juga menerapkannya ke `useGa` (hook terpisah dari `useCoffee`): lepaskan `reading` saat batas waktu, banner "Tidak tersambung. Status mungkin belum terbaru · Coba lagi". | **Diperbaiki.** `useGa` memakai batas waktu yang sama (`within`, 17 dtk; `request` 15 dtk), banner "Tidak tersambung… · Coba lagi", baca ulang saat `online` dan tiap 15 dtk selama banner tampil. Tes: "F3-05 …" (2). Banner dicek di browser 1024×768. |
| F3-06 | Sedang (perlu dicek di tablet) | `GaApp.tsx:41` (layar hanya di state); `Layer.tsx:16,84-91` (`PHONE` ≤ 760 px) | **Tombol/gestur kembali tidak dikenal aplikasi.** Lima layar tablet tidak punya entri riwayat; lapisan hanya memasang entri di ≤ 760 px, jadi di tablet (768 ke atas) tidak sama sekali. Kembali dari Input cepat, dari dialog Ubah, atau dari buku menu = meninggalkan `/coffee/ga` (ke `/coffee` milik petugas, karena "Mode GA" adalah tautan biasa). Melanggar aturan rumah "back Android bekerja"; di mode tamu menjadi jalan keluar (F3-01). | Dibaca dari kode: tidak ada `pushState`/`popstate` di `ga/**`; `history.length` tidak bertambah saat pindah layar atau masuk mode tamu (diukur: tetap 2). | Satu entri riwayat per layar (state `{ gaScreen }`), `popstate` = `leave()`/tutup dialog; di mode tamu `popstate` dipasang kembali (tetap di buku). `Layer`: pakai entri riwayat juga di tablet (mis. `pointer: coarse`), bukan hanya lebar ≤ 760. | **Diperbaiki, perlu dicek di tablet.** Satu entri riwayat milik tablet: tombol kembali menutup dialog, mundur satu layar (lewat pertanyaan bila ada minuman), dan di buku menu tidak berbuat apa-apa; di Beranda meninggalkan halaman seperti biasa. Tes: "F3-06 …" (2). `history.back()` dicek di browser (mode tamu tetap di buku). |
| F3-07 | Sedang (perlu dicek di tablet) | `LineDialog.tsx:11,88-97`; `NewOrder.tsx:12,78-94`; `layout.tsx:9` | **Keyboard layar kemungkinan menutupi nama yang harus dipilih.** Hanya 4 nama yang ditawarkan (PIC + 3 pertama menurut abjad), jadi mengetik adalah jalur biasa, bukan pengecualian. Hasil pencarian berada **di bawah** kolom: di dialog 768×1024 kolom "Nama anggota tim" di y 606-658 dan chip di 714-770; di 1024×768 dialog berakhir di y ≈ 622+ dan separuh bawah layar tertutup keyboard. Chrome Android tidak mengecilkan tata letak saat keyboard muncul (hanya viewport visual), jadi chip tertutup dan dialog tidak bisa digulir lebih jauh. Sama untuk daftar PIC di Pesanan baru. Catatan F3 sendiri menyebut risikonya dan memindahkan fokus awal ke judul; itu hanya menunda. | Posisi diukur di browser (768×1024). Keyboard layar tidak bisa dimunculkan di panel. | `interactiveWidget: "resizes-content"` di `viewport` halaman GA, dan/atau hasil pencarian di **atas** kolom / dialog menempel ke atas saat kolom difokuskan (`scrollIntoView({ block: "start" })`). Tampilkan lebih dari 4 nama dalam daftar bergulir. | **Diperbaiki sebagian, perlu dicek di tablet.** Nama berada tepat di bawah kolom (8 px, diukur), blok kolom+nama naik ke atas saat kolom difokuskan (`raiseOnFocus`), dan `interactiveWidget: "resizes-content"` di viewport. Keyboard layar tidak bisa dimunculkan di panel; daftar tetap 4 nama. Tes: `QuickInput.dom.test.tsx` "F3-07". |
| F3-08 | Sedang | `GuestBook.tsx:69-73` (`key={index}`, `turn` memakai tanda `view` yang tidak berubah) | **Ketuk ganda "Hapus" menghapus dua pilihan tamu.** Setelah baris pertama hilang, baris berikutnya naik ke bawah jari; ketukan kedua mengenainya. Penjaga 450 ms tidak menolong karena layar tidak berganti. Persis kelas cacat yang ingin dicegah `useSettled`. Tamu lain kehilangan pilihannya tanpa tahu. | Terverifikasi di browser: 4 pilihan → dua klik beruntun (30 ms) pada "Hapus" baris pertama → tersisa 2. | Tanda `useSettled` ikut `picks.length`, atau "Hapus" lewat konfirmasi kecil di baris ("Hapus? Ya / Tidak") / tombol Urungkan. Beri `key` tetap per pilihan. | **Diperbaiki.** Pilihan punya id sendiri; penjaga ketuk ganda ikut jumlah pilihan. Tes: `GuestBook.dom.test.tsx` "F3-08". |
| F3-09 | Rendah | `GaApp.tsx:147`; `GuestBook.tsx:39,87`; `QuickInput.tsx:31,36,49,69,110` | **Pesanan penuh (40 baris) gagal diam-diam.** (a) "Serahkan ke tamu" tetap bisa ditekan; buku menu terbuka dengan `max = 0`, tamu memilih minuman, mengatur gula, menekan "Pilih minuman ini", dan tidak terjadi apa-apa (tanpa pesan). (b) Ubin minuman tetap tampak aktif; ketukan untuk minuman baru diabaikan, keterangannya hanya kalimat kecil di kaki panel (bukan `role="status"`). | Terverifikasi di browser: 40 baris → Serahkan ke tamu → Kopi Susu → Pilih minuman ini: tetap di halaman yang sama. Ubin Dark Chocolate diketuk: tetap 40 baris. | Matikan "Serahkan ke tamu" saat penuh (dengan alasan), atau buku menu langsung menampilkan "Meja ini sudah penuh". Ubin `aria-disabled` + pesan saat diketuk; kalimat batas jadi `role="status"`. | **Diperbaiki.** "Serahkan ke tamu" mati saat 40 baris; ketukan yang tidak menambah apa-apa dijawab "Tidak ditambahkan: pesanan sudah penuh…" (`role="status"`); buku menu dengan sisa 0 menulis "Pesanan untuk meja ini sudah penuh" dan tidak menawarkan "Pilih minuman ini". Tes: "F3-09 …" (3). |
| F3-10 | Rendah | `QuickInput.tsx:34` | Penggabungan baris tidak memeriksa takaran es. Untuk minuman yang hanya dingin (Cucumber Ice), ketukan baru ("es Normal") menambah jumlah baris yang sudah diubah ke "es Sedikit"/"Ekstra". | Terverifikasi: Cucumber Ice → Ubah → es Sedikit → Simpan → ketuk ubin lagi → satu baris "es Sedikit" berjumlah 2. | Tambah `&& line.ice === base.ice` (atau bandingkan `optionsLabel`). | **Diperbaiki.** Penggabungan juga membandingkan takaran es. Tes: "F3-10". |
| F3-11 | Rendah | `ga.module.css:344,440` | **Tegak (768×1024): kolom "Nama Anda" tidak terlihat sebagai kolom.** Kolom hanya bergaris bawah; bilah "Pilih minuman ini" yang menempel di bawah menutupi garis itu (kolom y 862-914, bilah 904-1000). Yang terlihat: label, ruang kosong, lalu tombol. Tamu tidak tahu ada tempat mengetik. | Terverifikasi (tangkapan layar 768×1024, halaman Cappuccino). | Beri kolom kotak penuh di tata letak tegak, atau `padding-bottom` pada halaman sebesar tinggi bilah; cek lagi dengan Es dipilih (halaman lebih panjang). | **Diperbaiki.** Tegak: kolom "Nama Anda" berkotak penuh dan berjarak dari bilah tombol (diukur 768×1024: kolom 832–884, bilah 904–1000). Tes: `layout.test.ts` "F3-11". |
| F3-12 | Rendah | `meetings.ts:19` (tanpa saring `manual`); `store.ts:90-96` (`manual` tidak ikut); `model.ts:100-111`; SQL `:239` | **Catatan manual pengelola tampil di tablet sebagai pesanan rapat biasa.** Kartunya menawarkan "Tambah lagi", yang selalu ditolak server (`COFFEE_PARENT_CLOSED`, induk manual); tablet baru menawarkan "kirim sebagai pesanan baru" setelah Kirim pertama gagal. Catatan manual tanpa ruangan tampil sebagai kartu dan baris "Status per ruangan" tanpa nama. | Dibaca dari kode (server tiruan tidak punya catatan manual). | Kirim `manual` di `MeetingOrder` dan pakai di `nextDraft` (manual = pesanan pengganti), atau saring catatan manual dari `gaState`. Ruangan kosong: tulis "Tanpa ruangan". | **Diperbaiki.** `MeetingOrder.manual`; catatan manual tidak menawarkan Tambah lagi ("Pesanan baru"), bertuliskan "Dicatat manual oleh …", ruangan kosong = "Tanpa ruangan". Tes: "F3-12", `model.test.ts`. |
| F3-13 | Rendah | `GaApp.tsx:63-69`; `Toast.tsx:24-28` | (a) Pesan **ditolak** yang seharusnya menetap ditimpa pesan berikutnya (mis. pesanan lain selesai) dan ikut hilang 6 detik kemudian. (b) Bila dua pesanan diputuskan dalam satu pembacaan, hanya yang pertama disebut (kelas F2-19; di tablet bersama beberapa ruangan ini lebih mungkin). Status di kartu Beranda tetap benar. | (a) Terverifikasi: Tolak #T-0115 → pesan menetap → Selesai #T-0114 → pesan diganti → kosong setelah 6 detik. (b) dibaca dari kode. | Antrekan pesan; penolakan tidak boleh ditimpa pesan biasa. "2 pesanan sudah diputuskan" bila lebih dari satu. | **Diperbaiki.** Pesan ditolak tidak ditimpa pesan biasa (yang datang kemudian menunggu giliran); beberapa keputusan sekaligus = satu pesan berisi semuanya. Tes: "F3-13 …" (2). |
| F3-14 | Rendah | `ga.module.css:290,345,340,75,82` | Kontras penanda (bukan teks): garis fokus buku menu **emas di kertas 2,21:1** (< 3:1; di sampul hitam 8,3:1, baik); kolom "Nama Anda" saat fokus hanya garis bawah emas 2 px tanpa `outline`; garis pilihan buku yang belum dipilih 2,17:1; garis chip/pilihan/kartu GA `--line` 1,37:1 (kelas F2-14). Teks semuanya lulus (tabel di bawah). | Dihitung dari token; `outline` diukur di browser (`rgb(201,163,91)` pada tombol "Es"). | Di atas kertas pakai `--book-ink` untuk garis fokus (emas tetap untuk ornamen); garis pilihan buku ≥ .55 opasitas; chip/pilihan GA pakai `--field-line`. | **Diperbaiki.** Garis fokus di kertas memakai tinta buku; garis pilihan buku 60 %; chip/pilihan GA `--field-line`; kolom nama fokus bertinta. Tes: `layout.test.ts` "F3-14" (kontras dihitung). |
| F3-15 | Rendah | `NewOrder.tsx:111-112`; `parts.tsx:42-49` | "Jumlah orang" hanya bisa diisi dengan mengetuk + satu per satu (0 sampai 500): 25 tamu = 25 ketukan, tanpa tekan-tahan dan tanpa mengetik. Sama dengan prototipe, tetapi melawan prinsip "GA tidak boleh lebih repot dari sticky note". | Dibaca dari kode; dicoba di browser. | Angka di tengah bisa diketik (`inputMode="numeric"`), atau tekan-tahan mengulang. | **Belum.** Jumlah orang masih + satu per satu. |
| F3-16 | Rendah | `store.ts:30`; `api.ts:63`; `GaApp.tsx:136` | Dua pesan galat menyuruh "Muat ulang halaman": `COFFEE_KEY_REUSED` (409) dan galat tak dikenal. Di tablet, memuat ulang membuang seluruh pesanan yang sedang ditulis; padahal untuk 409 tablet sudah mengganti kunci dan Kirim berikutnya akan berhasil. | Dibaca dari kode. | Di tablet ganti kalimatnya: "Tekan Kirim lagi." (tanpa muat ulang). | **Diperbaiki.** Kalimat 409 tidak lagi menyuruh muat ulang; di tablet ditambah "Tekan Kirim lagi." Galat tak dikenal (`errorText`) masih menyebut muat ulang. |
| F3-17 | Rendah | `GuestBook.tsx:31-32,91-92`; `Sent.tsx:64`; `parts.tsx:46` | A11y kecil: (a) memilih tab Kopi/Non-kopi memindahkan fokus dari tab ke wadah halaman (`useEffect` pada `group`), pengguna papan ketik kehilangan tempat; (b) `aria-live` pada seluruh `<ol>` Perkembangan membacakan ulang semua langkah saat status berubah; (c) `<output aria-live>` di tiap penghitung + `aria-live` pada total = dua pengumuman per ketukan. | Dibaca dari kode; (a) fokus diukur di browser (`spread`). | (a) fokus hanya saat `view` berganti; (b) satu kalimat `role="status"` terpisah; (c) cukup total yang diumumkan. | **Sebagian.** (a) fokus tidak lagi pindah saat tab Kopi/Non-kopi ditekan (tes "F3-17"). (b), (c) belum. |
| F3-18 | Rendah | `src/app/coffee/ga/page.tsx:19-23` | Semua `ServiceError` dari `gaState` (bukan hanya 503 menunggu migrasi) menjadi layar "belum dibuka" dengan rincian teknis, tanpa Coba lagi (kelas F2-11 / F1-22). | Dibaca dari kode. | Ikut perbaikan F2-11. | **Diperbaiki.** 503 → "belum dibuka" (nama migrasi hanya untuk pemegang akses); galat lain → "Belum bisa memuat" + Coba lagi. Tes: `page.test.tsx`. |
| F3-19 | Rendah (perlu dicek di tablet) | `ga.module.css:25,289`; `parts.tsx:25` | Tekan lama pada foto minuman di buku menu kemungkinan membuka menu konteks Chrome ("Buka gambar di tab baru", "Unduh"): tidak ada `-webkit-touch-callout: none`, `draggable={false}`, atau penahan `contextmenu`. Tidak membuka data, tetapi mengeluarkan tamu dari buku. | Dibaca dari kode. | Foto sebagai `background-image` atau `pointer-events: none` pada `img` di dalam tombol; tahan `contextmenu` di `.book`. | **Diperbaiki, perlu dicek di tablet.** `contextmenu` dan seret ditahan di buku, `pointer-events: none` + `draggable={false}` pada foto, `-webkit-touch-callout: none`. |
| F3-20 | Rendah | `ga.module.css:71,367,383,447` dan warna mentah; `Sent.tsx:6` vs `parts.tsx:23`; `GaPreview.tsx:8` | Kerapian: `.ga .input` ditulis dua kali (bagian "added to the prototype" menimpa bagian atas, belum dilebur); `.ga .names` dan `@keyframes drop` tidak dipakai; warna mentah di samping token (`#F6F1E8`, `#B9A98F`, `#3A3A3A`, `#A8A29A`, `#fff`; kelas F1-23); dua komponen foto (`Photo`, `DrinkPhoto`); `layout.test.ts` hanya membaca teks CSS (target di denah dan pesan tidak dijaga). | Dibaca dari kode. | Rapikan saat menyentuh berkasnya. | **Belum.** Kerapian CSS dan dua komponen foto. |

Catatan (bukan temuan):
- Sampul memuat logo emas, bingkai garis emas, kalimat abu "Ketuk untuk membuka", dan tombol "Mode GA" di pojok. Rancangan
  menulis "hanya logo"; prototipe yang disetujui punya keempatnya (`GaPrototype.tsx:861-868`), jadi ini sesuai prototipe.
  "Mode GA" adalah istilah internal yang terbaca tamu; bila F3-04 diubah, pertimbangkan tombol tanpa kata.
- Nama tamu dibatasi 40 huruf hanya oleh `maxLength` di kolom. Agen yang sedang menambah nama tamu per minuman ke server
  perlu batas yang sama di `meetingSchema` dan di SQL, dan nama itu ikut F3-01 (hilang saat muat ulang) sampai tersimpan.
- Tablet hanya membaca ulang selama ada pesanan `diproses`, saat kembali ke depan, dan saat ke Beranda (selisih 8, sudah
  dicatat). Beranda yang dibiarkan terbuka tanpa pesanan menunggu tidak melihat kiriman tablet lain.
- Notifikasi sistem F4 bisa muncul di atas buku menu (sudah dicatat pelaksana); putuskan sebelum F4.
- Ketukan dalam 450 ms pertama setelah layar berganti diabaikan tanpa tanda (terverifikasi: "Pilih minuman ini" 50 ms
  setelah halaman minuman terbuka tidak berbuat apa-apa). Wajar sebagai penjaga; tidak ditemukan ketukan sah yang hilang
  selain itu (10 ketukan beruntun pada satu ubin = 10 minuman).
- "Lainnya" diketik persis nama ruangan terdaftar ("Vasuki Room") diperlakukan sebagai ruangan itu (klien dan
  `roomSpot` di server sepakat). Baik.

## Yang diperiksa dan lulus

- **Penjaga**: `page.tsx` memanggil `requireGaPage` sebelum `gaState`; kedua API GA `requireApiGa()` baris pertama;
  tulis memakai `checkOrigin`, batas laju per alamat (300) dan per orang (60/10 menit), `readJson` 20 KB, `validate`
  dengan `meetingSchema`. Tanpa sesi: 401 JSON (curl). Tidak ada id "siapa saya" dari badan permintaan (`actor_id` dari
  sesi). Tidak ada endpoint direktori terpisah untuk GA.
- **Direktori ke GA**: `gaState` hanya mengirim `id, name, position, bu` karyawan **aktif** (`people.ts:13`,
  `meetings.ts:25`); tanpa email, kategori, panggilan, atau jatah. PIC di pesanan hanya `id + name`; baris tim membawa
  kelompok/jabatan/BU orangnya (untuk GA, wajar).
- **Buku menu**: komponen tidak menerima `api` maupun `people`; selama mode tamu DOM hanya berisi buku (diukur: tanpa
  bilah atas, tanpa kotak Pratinjau, tanpa pesan status; tombol yang ada hanya "Mode GA" dan isi buku). Pesan status yang
  datang saat mode tamu tidak digambar (baru tampil setelah kembali ke GA). Escape tidak berbuat apa-apa; Tab tetap di
  dalam buku. Kata: "Anda", tanpa jatah/gratis/karyawan selain nama PIC; tidak ada WhatsApp.
- **Kata GA**: "Diproses", "pengelola (HR dan admin yang punya akses)", tidak ada "HR membelikan" (`grep`). "Tidak
  memotong jatah" hanya di layar GA.
- **Batas**: 40 baris dan 50 per baris sama dengan `meetingSchema` dan SQL (55 ketukan pada satu ubin = baris 50 + baris
  5; baris ke-41 ditahan); jumlah tamu 0-500 (0 = tidak dikirim).
- **Tamu vs Tim · rapat**: tim wajib memilih orang (galat `role="alert"`, fokus ke kolom), `personId` hanya dikirim
  untuk tim; mengubah baris ke Tamu membuang orangnya; es hanya untuk Es; minuman satu suhu tanpa pilihan suhu.
- **Kirim**: tiga ketukan saat `?lambat=1` = satu pesanan; selama mengirim baris, "Serahkan ke tamu", dan kembali
  terkunci; galat jaringan mempertahankan baris dan kunci (lihat F3-02 untuk celahnya); 409 induk tertutup → minuman
  tetap, Kirim berikutnya jadi pesanan baru.
- **Tambah lagi / Pesan pengganti**: aturan klien (`nextDraft`: induk ada di daftar hari ini dan `diproses`/`selesai`)
  sama dengan aturan server, kecuali catatan manual (F3-12). Terverifikasi: setelah ditolak tombol menjadi "Pesan
  pengganti" / "Buat pesanan pengganti" dengan ruangan, PIC, dan tamu yang sama.
- **Polling vs aksi**: pembacaan yang mulai sebelum atau kembali selama Kirim dibuang, dibaca sekali setelahnya; hanya
  saat ada yang diproses dan tablet terlihat.
- **Buang isian**: Beranda dari Pesanan baru/Input cepat bertanya (fokus awal "Lanjutkan pesanan"); "Ubah data" bolak-
  balik mempertahankan ruangan, PIC, tamu, dan baris. Celahnya di F3-03.
- **Pilihan tamu ke panel GA**: kembali sebagai baris Tamu (satu per pilihan, dengan nama bila diisi), GA yang mengirim.
- **Denah**: `ROOMS` (`ananta`, `limasan`, `vasuki`, `communal`) dan `pantry` ada di `PLAN_SPOTS`; status ditulis dengan
  kata di denah dan di daftar "Status per ruangan" (tidak hanya warna); ruangan di denah adalah tombol berpapan ketik
  dengan area sentuh ≥ 54×49 px (diukur di 1024 dan 768; kotak terlihatnya Ananta 45×38).
- **Ukuran**: 1280×800, 1024×768, 768×1024 di Beranda, Pesanan baru, Input cepat, dialog Ubah, Terkirim, sampul, menu,
  halaman minuman, terima kasih, pertanyaan keluar: `scrollWidth` = lebar layar, tidak ada elemen keluar layar, **tidak
  ada target di bawah 48 px** (diukur, termasuk tombol pesan 48×48). Nama instansi 120 huruf: terpotong elipsis di kepala
  layar, membungkus di kartu.
- **Kosong / memuat**: `?kosong=1` mengajak ("Ketuk Pesanan baru saat masuk ke ruang rapat"); `loading.tsx` kerangka.
- **Gerak**: `prefers-reduced-motion` mematikan animasi dan transisi `.ga *` (dibaca dari CSS; titik "diproses" yang
  berdenyut ikut mati).
- **XSS**: tidak ada `dangerouslySetInnerHTML`; nama tamu, ruangan, catatan tolak dirender sebagai teks.
- **Alamat**: dari `routes.ts` (kecuali konstanta pratinjau `HERE`).

### Kontras (token `ga.module.css`)

| Pasangan | Rasio |
| --- | --- |
| Logo/garis emas `#C9A35B` di sampul `#0B0B0B` / latar `#121212` | 8,32 / 7,92 |
| **Emas di kertas `#FAF7F0`** (ornamen, garis; dan garis fokus: F3-14) | **2,21** |
| Teks buku `#1A1A1A` / `#55504A` di kertas | 16,27 / 7,46 |
| "Mode GA" dan "Ketuk untuk membuka" `#A8A29A` di hitam | 7,40 / 7,78 |
| Teks kedua `#6B5546` di krem / permukaan / `--soft` / `--emp-c` / `--no-c` | 6,48 / 6,86 / 5,65 / 5,83 / 5,57 |
| Putih di hijau `#2F6B5A`; hijau tua di `#DCEFE8` | 6,23 / 7,22 |
| Tanda Tamu `#9A4A1C` di `#FDEBDD`; ditolak `#9A273D` di `#F5E1E5` | 5,37 / 6,14 |
| Garis kolom `--field-line` di permukaan (bukan teks) | 3,34 |
| Garis chip/pilihan `--line` (bukan teks); garis pilihan buku | 1,37 / 2,17 (F3-14) |

Emas tidak dipakai untuk teks di mana pun (hanya logo, bingkai, ornamen, garis pemisah, garis fokus): sesuai rancangan.

## Templat §5

| Sisi | Hasil | Bukti |
| --- | --- | --- |
| Keamanan | Server lulus. Isolasi tamu **gagal** di sisi layar: F3-01, F3-04, F3-06 | kode penjaga, curl 401, DOM mode tamu, muat ulang |
| Data | Lulus untuk kirim ganda dan Tambah lagi; F3-02 (minuman hilang), F3-03 (terbuang tanpa tanya), F3-12 | tes, browser, SQL |
| UX vs prototipe | Sesuai prototipe; selisih yang dicatat pelaksana wajar. F3-08, F3-09, F3-11, F3-13, F3-15 | browser tiga ukuran |
| Rasa aplikasi | Pindah layar tanpa muat halaman; tanpa tombol kembali (F3-06), tanpa banner/segarkan (F3-05) | kode, browser |
| A11y | Lulus dengan F3-14, F3-17; pembaca layar tidak diuji | DOM, kontras |
| Tablet | 1280/1024/768 lulus ukuran dan target; keyboard layar F3-07 **tidak diuji** | ukuran DOM |
| Tes | 33 lulus; celah di bawah | `npx vitest run src/components/coffee/ga` |
| Kode vs konvensi | Lulus dengan F3-20; typecheck/lint tidak dijalankan | baca kode |
| Halaman asli dengan sesi, tablet asli | **Tidak diuji** | butuh sandi, migrasi, perangkat |

## Tes yang belum ada

1. Mode tamu bertahan setelah muat ulang (F3-01): `GaApp` dipasang ulang → hanya buku menu; pilihan dan baris pulih.
2. Jawaban Kirim hilang → pesanan diubah → Kirim lagi: tidak ada minuman yang hilang diam-diam (F3-02); draf berubah
   (ruangan/PIC) = kunci baru.
3. Pesan status lama diketuk saat ada baris yang belum dikirim → tidak membuang (F3-03); `Sent` → Beranda/Tambah lagi
   dengan baris tersisa.
4. Ketuk ganda "Hapus" di daftar pilihan tamu = satu pilihan terhapus (F3-08).
5. Buku menu dibuka dengan `max = 0`: ada pesan, bukan diam (F3-09); "Serahkan ke tamu" saat 40 baris.
6. Penggabungan baris: Cucumber Ice dengan es berbeda = baris baru (F3-10); baris tamu bernama tidak digabung (ada di
   kode, belum diuji); baris 50 lalu baris baru.
7. `model.ts` tanpa tes sendiri: `nextDraft`/`canAddTo` (induk tidak di daftar, induk batal, anak ditolak tetapi induk
   selesai, PIC `id` null → layar Pesanan baru), `roomStatuses`/`statusOf` (urutan menang), `toBody` (es dinormalkan,
   `personId` hanya tim), `countLabel`.
8. `useGa`: pembacaan gagal tidak mengubah layar; jawaban terbalik (`readNo`); dua keputusan sekaligus; tidak membaca saat
   tersembunyi; baca ulang saat ke Beranda; pesanan terkirim tidak diumumkan sebagai "diputuskan".
9. Pesan: ditolak menetap dan tidak ditimpa (F3-13); keputusan yang datang saat mode tamu tidak digambar di buku dan
   tampil setelah kembali.
10. 409 `COFFEE_KEY_REUSED` (tanpa induk) dan 404 induk hilang: baris tetap, Kirim berikutnya berkunci baru.
11. `NewOrder`: "Lainnya" kosong/spasi ditahan; nama = ruangan terdaftar; jumlah tamu 0 tidak dikirim; `initial` dengan
    ruangan ketikan; daftar > 4 nama menampilkan sisa.
12. `FloorMap`: Enter/Spasi memilih; ruangan tanpa titik denah tidak digambar; status dalam kata.
13. `Home`: ruangan "Lainnya" masuk "Status per ruangan"; catatan manual / ruangan kosong (F3-12).
14. `Sent`: status `batal`; catatan es; nama tamu per baris tidak bergeser bila server mengubah urutan.
15. Halaman server `src/app/coffee/ga/page.tsx`: penjaga dipanggil lebih dulu; 503 vs galat lain (F3-18).
16. Riwayat: tombol kembali menutup dialog / kembali satu layar, dan di mode tamu tetap di buku (setelah F3-06).

## Putusan

**Belum siap dipakai dengan tamu; layak lanjut ke F4 setelah F3-01 sampai F3-03 diperbaiki.** Sisi server rapi: penjaga
benar di halaman dan kedua API, direktori ke GA hanya memuat nama/jabatan/BU karyawan aktif, kirim ganda aman. Alur
GA cepat, tata letak bersih di tiga ukuran, semua target ≥ 48 px, buku menu terasa eksklusif dan emas dipakai sesuai aturan.
Yang menahan adalah janji utama fase ini, "selama tamu memegang tablet hanya buku menu yang ada": janji itu berlaku untuk
DOM, tetapi runtuh oleh satu muat ulang, satu gestur kembali, atau dua ketukan pada "Mode GA". Ditambah dua jalur tempat
minuman hilang tanpa diketahui GA.

Urutan perbaikan:
1. **F3-01** mode tamu bertahan saat muat ulang + matikan tarik-untuk-menyegarkan (lalu cek di tablet asli).
2. **F3-03** dan **F3-02** minuman terbuang / hilang tanpa diketahui.
3. **F3-04** keputusan pemilik soal PIN (rancangan masih menulis PIN); **F3-06** tombol kembali.
4. **F3-05** batas waktu dan banner tidak tersambung (bersama perbaikan F2-03/F2-07; pastikan `useGa` ikut).
5. **F3-07** keyboard layar vs daftar nama (cek di tablet dulu), **F3-08** ketuk ganda Hapus.
6. **F3-09 sampai F3-13** (penuh diam-diam, es, kolom nama tegak, catatan manual, pesan tertimpa).
7. Sisanya (F3-14 sampai F3-20) dan tes yang belum ada.

Perlu dicek pemilik/PM di tablet asli dengan sesi asli setelah migrasi: karyawan biasa → `/coffee?pesan=ga`; kirim →
satu kartu rapat di antrean, `T-xxxx-2` untuk Tambah lagi; tarik ke bawah dan tombol kembali di buku menu; tekan lama
pada foto; keyboard layar di dialog Tim · rapat dan pencarian PIC (mendatar dan tegak); putar layar di tengah pesanan.

## Setelah perbaikan (26 Nov 2026)

Kolom **Status** di tabel temuan diisi oleh agen perbaikan (commit `fix(coffee): temuan audit tablet GA …`).

- Catatan "nama tamu 40 huruf hanya `maxLength`": sudah dibatasi juga di `meetingSchema` (`GUEST_NAME_MAX`) dan di SQL
  (kolom + fungsi), commit `feat(coffee): nama tamu per minuman …`. Nama itu ikut tersimpan saat mode tamu dimuat ulang.
- Tes yang ditambahkan dari daftar "Tes yang belum ada": 1, 2, 3, 4, 5, 6, 7 (`model.test.ts`), 8 (sebagian: pembacaan
  gagal, dua keputusan, tidak membaca selama mode tamu), 9, 10 (409 isi berubah di server tiruan dan asli-tiruan), 13
  (catatan manual, ruangan kosong), 15, 16.
- **Belum ada:** `NewOrder` (11), `FloorMap` (12), `Sent` status batal dan catatan es (14), jawaban terbalik `readNo` (8).
- Dicek di browser (pratinjau, port 3210, tab baru, ditutup, server dihentikan): 1280×800 (alur serah ke tamu, tombol
  kembali dua kali di buku, muat ulang paksa → buku, PIN salah lalu benar), 768×1024 (pengingat PIN, kolom "Nama Anda",
  pertanyaan keluar tanpa PIN), 1024×768 (banner tidak tersambung + Coba lagi, dialog Tim · rapat). Tidak ada target di
  bawah 48 px dan `scrollWidth` = lebar layar di ketiganya.
- Tetap **belum diuji**: tablet sungguhan (tarik ke bawah, gestur kembali Android, tekan lama, keyboard layar, putar
  layar) dan halaman asli dengan sesi. Migrasi tetap belum pernah dijalankan.

