# Audit F2: aplikasi karyawan `/coffee` (26 Nov 2026)

Peninjau independen. Yang diaudit: commit `0a9dce10`. Nomor baris mengacu ke commit itu. Tidak ada kode yang diubah,
tidak ada build, tidak ada commit. Skill yang dipakai: `ui-ux-pro-max` (aksesibilitas, sentuhan, navigasi, formulir).

## Cara memeriksa

- Baca kode: `src/app/coffee/**` (tanpa `ga`), `src/components/coffee/*` (tanpa `prototype/`, `ga/`),
  `src/lib/coffee/setup.ts`, `public/coffee/sw.js`, route manifest, `src/app/dev-preview/coffee/nyata/`,
  `src/app/api/coffee/{state,claims,claims/[id]}`, `src/lib/server/coffee/{session,claims,store}.ts`,
  hook masuk di `src/components/booking/BookingAuth.tsx`.
- Tes: `npx vitest run src/components/coffee src/app/coffee src/lib/coffee` → **20 berkas, 155 tes, semua lulus**
  (awalan `src/components/coffee` ikut menjalankan `coffee-admin/**`). Tidak ada berkas tes di `src/app/coffee`.
  Saat dijalankan, worktree masih sama dengan commit (belum ada berkas F3).
- `curl` ke server dev 3220: penjaga halaman dan API tanpa sesi, header `sw.js` dan manifest, `next` di halaman masuk.
- Browser (panel bawaan, `next dev -p 3220`, `/dev-preview/coffee/nyata` dan varian `?layar=`, `?sebagai=`, `?riwayat=`,
  `?akses=`): 375×812, 320×640, 390×844, desktop 1024. Tab ditutup, server dihentikan setelahnya. Konsol: tanpa galat.
- Kontras dihitung dari token `coffee.module.css:6-9`.

**Batas yang perlu diketahui:**
- Halaman asli `/coffee*` **dengan sesi tidak diuji** (tanpa sandi, tanpa migrasi). Masuk, keluar, 401, dan pindah tab
  dengan `routing="history"` hanya dibaca dari kode. Temuan F2-01 dibuktikan lewat simulasi di pratinjau (lihat barisnya).
- Pratinjau memakai `routing="memory"` dan server tiruan tanpa jeda; "jawaban hilang di jalan" tidak bisa ditiru di sana.
- Pasang ke layar utama, SW aktif, halaman offline, Lighthouse: **tidak diuji** (tidak ada perangkat). Penilaian PWA dari
  isi berkas dan aturan browser.
- Teks 200% tidak diuji langsung (lebar setara 320 px dicek). `prefers-reduced-motion` hanya dibaca dari CSS.
  Pembaca layar sungguhan tidak dipakai. Nama panjang ditiru dengan mengganti teks judul di DOM.
- `npm run typecheck` dan `npm run lint` **tidak dijalankan** (worktree sedang diubah agen F3).
- Pukul 09.45 agen F3 mengubah `src/components/coffee/Layer.tsx` (prop `rootClass`/`panelClass`) dan `api.ts`
  (`request` diekspor) di worktree. Sebagian cek browser berjalan setelah itu. Kedua perubahan tidak mengubah perilaku
  F2 (sudah dibandingkan dengan `git diff`), jadi temuan di bawah berlaku untuk commit.

## Temuan

| ID | Tingkat | Berkas:baris | Yang salah | Cara mengulang | Saran perbaikan | Status (26 Nov, setelah perbaikan) |
| --- | --- | --- | --- | --- | --- | --- |
| F2-01 | **Tinggi** | `CoffeeApp.tsx:145-151`, `Layer.tsx:96`, `api.ts:56-59` | **Keluar di HP tidak sampai ke halaman masuk.** `signOut` memanggil `location.assign(/coffee/masuk)`, lalu `setAccount(false)` menutup lembar Akun; pembersihan `Layer` memanggil `history.back()` (entri riwayat milik lembar, hanya ≤ 760 px). `history.back()` itu membatalkan navigasi yang baru dimulai. Hasil: sesi sudah dihapus di server, tetapi layar tetap menampilkan nama, jatah, dan pesanan orang itu seolah masih masuk, sampai ada panggilan API berikutnya (401). Di HP bersama, orang berikutnya melihat data orang sebelumnya. Di desktop (> 760 px) tidak terjadi. | Terverifikasi lewat simulasi di pratinjau 375: buka lembar Akun, jalankan `location.assign('/dev-preview/coffee/nyata?layar=masuk')` lalu klik **Keluar** (jalur komponen asli; hanya `assign` yang ditambahkan karena server tiruan tidak berpindah halaman). Setelah 3 detik alamat tetap `/dev-preview/coffee/nyata`, judul "Halo, Rina (contoh)". Diulang dua kali, hasil sama. **Perlu dicek sekali dengan sesi asli di HP.** | Jangan tutup lembar setelah keluar berhasil (biarkan "Keluar…" sampai halaman berganti; hapus `setLeaving(false); setAccount(false)` di jalur sukses), atau pakai `location.replace` setelah entri lembar dibuang. Tambah tes: setelah `signOut` selesai, `history.back` tidak dipanggil. | **Diperbaiki.** Keluar yang berhasil tidak lagi menutup lembar: layar langsung diganti "Kamu sudah keluar" (tanpa nama, jatah, pesanan), `Layer` tidak memanggil `history.back()` saat halaman sedang ditinggalkan (`leavePage()`), dan pindah halaman memakai `location.replace`. Sesi berakhir (401) memakai jalur yang sama. `CoffeeApp` diberi `key` id orang. Tes: `CoffeeApp.dom.test.tsx` "F2-01 …" (3), `api.dom.test.tsx`. **Belum dicek dengan sesi asli di HP.** |
| F2-02 | Sedang | `DrinkSheet.tsx:27`, `CoffeeApp.tsx:169`, `useCoffee.ts:55-57,66-67,78-82` | **Jawaban yang hilang di jalan bisa menjadi klaim ganda.** Kunci hanya hidup selama satu lembar terbuka. Bila permintaan sampai ke server tetapi jawabannya tidak kembali, lembar menampilkan "Tidak dapat terhubung"; `end()` membaca ulang sekali (gagal juga, diam), dan setelah itu tidak ada pembacaan lagi karena layar belum tahu ada klaim `diproses` (polling hanya jalan bila ada yang menunggu). Karyawan menutup lembar, membukanya lagi (kunci baru), Ajukan → klaim kedua, jatah terpakai dua. | Dibaca dari kode; tidak bisa ditiru di pratinjau (server tiruan menolak sebelum menyimpan). Urutan: sinyal putus tepat setelah kirim → galat → tutup lembar → sinyal kembali → buka minuman yang sama → Ajukan. | Setelah galat jaringan pada Ajukan/Batalkan: baca ulang status saat `online` dan beberapa kali dengan jeda, sebelum mengizinkan kiriman baru; atau simpan kunci per minuman sampai ada jawaban pasti (2xx/4xx) walau lembar ditutup. Tambah tes "jawaban hilang lalu lembar dibuka lagi = satu klaim". | **Diperbaiki.** Kunci disimpan di `useCoffee` per minuman + opsi sampai ada jawaban pasti (2xx/4xx); galat jaringan, batas waktu, dan 5xx memakai kunci yang sama walau lembar ditutup. Setelah jawaban hilang status dibaca saat itu juga; klaim yang ternyata sampai langsung tampil. Tes: "F2-02 …" (3). |
| F2-03 | Sedang | `api.ts:33`, `DrinkSheet.tsx:44,50`, `Layer.tsx:82-87`, `useCoffee.ts:46,66` | **Tidak ada batas waktu permintaan.** (a) Ajukan pada koneksi yang menggantung: tombol "Mengirim…" selamanya, X mati, Escape/ketuk luar/tombol kembali ditolak (entri riwayat dipasang lagi). Karyawan terkunci di lembar sampai browser menyerah. (b) Satu pembacaan `state` yang menggantung membuat `reading.current` tetap 1: semua tik polling dan pembacaan saat kembali ke aplikasi dilewati sampai halaman dimuat ulang. | Dibaca dari kode. Tes yang ada hanya memakai jeda pendek. | `AbortSignal.timeout(±15 dtk)` di `request`; batas waktu dianggap galat jaringan (kunci yang sama untuk coba lagi). Lepaskan `reading` saat batas waktu lewat. | **Diperbaiki.** `request` dibatalkan setelah 15 dtk (`AbortController`), dan `useCoffee` melepas panggilan apa pun setelah 17 dtk (`within`), jadi lembar bisa ditutup dan polling jalan lagi. Pesan: "Server terlalu lama menjawab…". Tes: "F2-03 …" (3), `api.dom.test.tsx`. |
| F2-04 | Sedang | `pwa.ts:28`, `routes.ts:1011`, `manifest.webmanifest/route.ts:18-19`, `sw.js:11-14` | **Halaman pertama aplikasi tidak dikendalikan service worker.** Manifest: `start_url`/`scope` = `/coffee`; SW: scope `/coffee/`. Akibat: (1) *Pasang*: tidak terhalang (Chrome tidak lagi mensyaratkan SW), **perlu dicek di perangkat**. (2) *Offline*: membuka aplikasi dari ikon tanpa sinyal jatuh ke halaman galat browser, bukan "Sinyalnya hilang"; halaman offline buatan sendiri hanya muncul di `/coffee/pesanan` dan halaman masuk, padahal pintu masuknya `/coffee`. (3) *F4*: di `/coffee`, `navigator.serviceWorker.ready` tidak pernah selesai dan `controller` kosong; `clients.matchAll()` di `notificationclick` tidak melihat jendela `/coffee` tanpa `includeUncontrolled: true` (klik notifikasi membuka jendela kedua). Langganan push sendiri tetap bisa (lewat `getRegistration(scope)`, pola `PushSwitch.tsx:17`). | Dibaca dari kode dan aturan scope SW; `curl` menunjukkan `sw.js` tanpa header `Service-Worker-Allowed`. | **Rekomendasi:** tambah header `Service-Worker-Allowed: /coffee` untuk `/coffee/sw.js` di `next.config.ts`, daftarkan dengan `scope: COFFEE_PATH`, dan batasi handler `fetch` ke alamat aplikasi. Lakukan **sebelum rilis** (registrasi lama ber-scope `/coffee/` akan menang untuk sub-halaman bila sudah terpasang). Bila tidak diubah: F4 wajib memakai `getRegistration(coffeePath.scope) ?? register(...)`, bukan `.ready`, dan `matchAll({ includeUncontrolled: true })`. | **Diperbaiki.** Header `Service-Worker-Allowed: /coffee` untuk `/coffee/sw.js` (`next.config.ts`), `coffeePath.scope = "/coffee"`, handler `fetch` hanya untuk alamat aplikasi, registrasi lama `/coffee/` dilepas (`coffeeWorker()` di `pwa.ts`). Header dicek dengan `curl`. Tes: `layout.test.ts` "F2-04 …" (2), `Parts.dom.test.tsx` "F2-04 …" (2). **Belum diuji di perangkat** (panel browser agen menolak semua pendaftaran SW). |
| F2-05 | Sedang (perlu dicek di tablet) | `manifest.webmanifest/route.ts:21` | `orientation: "portrait"` berlaku untuk seluruh scope `/coffee`, termasuk `/coffee/ga` (F3, dirancang 1024×768 mendatar). Tablet yang memasang aplikasi akan terkunci tegak. | Dibaca dari manifest; tidak diuji di tablet. | Hapus `orientation` (atau `"any"`); kunci tegak cukup lewat tata letak HP. | **Diperbaiki.** `orientation` dihapus dari manifest. Tes: `layout.test.ts` "F2-05". |
| F2-06 | Sedang | `CoffeeApp.tsx:130-138,89-94`, `useCoffee.ts:78-82` | **Batal yang kalah balapan tidak pernah dijelaskan.** Pengelola menekan Selesai, karyawan (layar masih "Diproses") menekan Batalkan → 409. Pesan menetap "Tidak bisa dibatalkan · Pengajuan ini sudah diproses…" langsung ditimpa pesan "Silakan ambil di mesin" dari pembacaan ulang (`end()` → `refresh` → `onDecided`). Karyawan yang baru saja membatalkan tidak diberi tahu bahwa batalnya gagal dan jatahnya terpakai. Tes `CoffeeApp.dom.test.tsx:169` menerima salah satu dari dua pesan, jadi tidak menjaga ini. | Terverifikasi di browser 375: Ajukan Café Latte → kotak Pratinjau "Pengelola: Selesai diproses" → Batalkan pengajuan → Batalkan. Pesan dicatat tiap 120 ms: hanya "Silakan ambil di mesin…" yang pernah terlihat. | Bila pesan menetap (galat) sedang tampil, jangan timpa dengan pesan keputusan untuk pesanan yang sama; atau gabungkan: "Tidak bisa dibatalkan: Café Latte sudah diproses Dewi. Silakan ambil di mesin." Perketat tes. | **Diperbaiki.** Satu pesan menetap: "Tidak bisa dibatalkan · <minuman> sudah diproses <nama> sebelum sempat dibatalkan, jadi jatahnya terpakai. Silakan ambil di mesin pantry." (versi ditolak: jatah tidak berkurang). Pembacaan ulang tidak mengumumkan pesanan itu lagi. Tes diperketat. |
| F2-07 | Sedang | `useCoffee.ts:55-57`, `coffee.module.css` (tidak ada banner) | **Gagal membaca status itu diam.** Saat menunggu "Selesai" dan HP kehilangan sinyal, layar tetap "Menunggu pengelola" tanpa tanda apa pun. Aturan rumah: "banner saat offline", "pesan jelas + Coba lagi". Tidak ada juga cara menyegarkan manual (tarik untuk menyegarkan); di iPhone yang dipasang ke layar utama satu-satunya cara adalah keluar-masuk aplikasi. | Dibaca dari kode; di pratinjau "Putuskan jaringan" lalu tunggu: tidak ada tanda (galat hanya muncul saat Ajukan/Batalkan). | Banner tipis "Tidak tersambung. Status mungkin belum terbaru. · Coba lagi" setelah pembacaan gagal atau `offline`, hilang saat pembacaan berikutnya berhasil. | **Diperbaiki.** Banner "Tidak tersambung. Status mungkin belum terbaru. · Coba lagi" setelah pembacaan gagal atau `offline`; selama banner tampil status dibaca tiap 15 dtk dan saat `online`; hilang saat berhasil. Tes: "F2-07 …" (2). |
| F2-08 | Rendah | `src/lib/coffee/setup.ts:21-27`, `masuk/page.tsx:13-14`, `BookingAuth.tsx:37` | `safeCoffeeNext` meloloskan ruas titik: `/coffee/../admin`, `/coffee/%2e%2e/api/...`, `/coffee/../wam`. Browser meluruskannya menjadi alamat aplikasi lain di situs yang sama. **Bukan** pengalihan ke situs luar (`//evil`, `/\evil`, `https://…`, spasi, `/coffeeshop` ditolak dengan benar), tetapi melanggar janji fungsi ("never another app") dan memungkinkan tautan masuk yang mendarat di halaman/unduhan lain. Juga lolos: `/coffee/sw.js`, `/coffee/manifest.webmanifest`, `/coffee/drinks/x.jpg`. | Terverifikasi: `curl "/coffee/masuk?next=/coffee/../admin"` → `CoffeeLogin` menerima `next: "/coffee/../admin"`. `new URL("/coffee/../admin", origin).pathname` = `/admin`. Pengalihan setelah masuk sungguhan tidak dijalankan. | Tolak `..`, `.` sebagai ruas, `%2e`, `%2f`, `%5c`, `//` di dalam jalur; atau luruskan dulu dengan `new URL(value, "http://x")` lalu cek `pathname`. Lebih ketat: daftar putih (`home`, `orders`, `ga`, `gaDenied`). Tambah kasus tes. | **Diperbaiki.** Hanya `/coffee` + ruas huruf/angka/`-`/`_` (tanpa titik, `%`, ruas kosong), dan hasil `new URL` harus sama. Tes: `setup.test.ts` "F2-08" (30 kasus). |
| F2-09 | Rendah | `api.ts:56-59`, `masuk/page.tsx:14` | Keluar yang gagal dikirim (tanpa sinyal, 5xx) ditelan: aplikasi tetap pindah ke halaman masuk, yang langsung mengalihkan kembali ke `/coffee` karena sesi masih hidup. Orang mengira sudah keluar. | Dibaca dari kode. | Bila permintaan keluar gagal karena jaringan, tetap di lembar dengan pesan "Belum bisa keluar. Periksa jaringan lalu coba lagi." | **Diperbaiki.** Keluar yang gagal dikirim (tanpa jawaban atau 5xx) tetap di lembar: "Belum bisa keluar. Periksa jaringan lalu coba lagi." Tes: "F2-09", `api.dom.test.tsx`. |
| F2-10 | Rendah | `OrdersScreen.tsx:26-27`, `CurrentOrder.tsx:27-34,69-74` | Tanpa pengajuan yang menunggu, klaim terbaru selalu tampil penuh. Klaim yang selesai minggu lalu tetap berjudul "Silakan ambil di mesin", lencana "Siap diambil", langkah "Ambil di mesin pantry · Sekarang", lengkap dengan denah. Setelah pergantian bulan pun begitu. | Terverifikasi di `?riwayat=1&layar=pesanan` (klaim 1,5 jam lalu tampil "Sekarang"); tidak ada batas waktu di kode. | Tampilkan "siap diambil" hanya untuk klaim selesai hari ini (WIB) atau beberapa jam terakhir; selebihnya masuk "Sebelumnya" dan layar memakai keadaan kosong yang mengajak. Perlu keputusan pemilik soal batasnya. | **Diperbaiki, batasnya perlu disetujui pemilik.** "Siap diambil · Sekarang" hanya untuk klaim yang diputuskan hari ini (WIB); selebihnya "Tidak ada pesanan hari ini" + Sebelumnya. Tes: "F2-10 …" (2). |
| F2-11 | Rendah | `CoffeeScreen.tsx:19-23`, `CoffeeAuth.tsx:147-158` | Semua `ServiceError` dari `myState` (bukan hanya 503 menunggu migrasi) menjadi layar "Werkudara Coffee belum dibuka", termasuk gangguan database sesaat. Semua karyawan melihat "Rincian untuk admin: …" (nama berkas SQL atau pesan galat), tanpa tombol coba lagi. Kelas yang sama dengan F1-22. | `?layar=tunggu` di 320 (tangkapan layar). Pemetaan galat dibaca dari kode. | Layar "belum dibuka" hanya untuk 503; galat lain: "Belum bisa memuat. Coba lagi" + tombol. Rincian teknis hanya untuk `state.pengelola`/super admin, atau ke log. | **Diperbaiki.** "Belum dibuka" hanya untuk 503; galat lain "Belum bisa memuat" + Coba lagi. Nama migrasi hanya untuk pemegang akses Coffee. Tes: `CoffeeScreen.test.tsx`, `Parts.dom.test.tsx`. |
| F2-12 | Rendah | `coffee.module.css:160,175` | Di 320×640 dengan Es dipilih, isi lembar 647 px dalam panel 589 px: tombol "Ajukan klaim" terpotong di bawah dan harus digulir di dalam lembar. | Terverifikasi di 320×640: Café Latte → Es (`scrollHeight` 647, `clientHeight` 589). | `.sheetFoot { position: sticky; bottom: 0; background: var(--cream); }`, atau rapatkan jarak di `@media (max-height: 700px)`. | **Diperbaiki.** Kaki lembar menempel di bawah (`position: sticky`); di layar pendek baris "Dikirim ke pengelola" disembunyikan. Dicek di browser 320×640 dengan Es: tombol di 548–600 px. Tes: `layout.test.ts` "F2-12". |
| F2-13 | Rendah | `Layer.tsx:32-36`, `Toast.tsx:32`, `coffee.module.css:158,194` | Pesan di atas (z-index 50) tampil di atas tirai lembar (40) tetapi berada di bagian yang `inert`: tombol tutupnya tidak bisa ditekan dan isinya tidak diumumkan pembaca layar selama lembar/pertanyaan terbuka. Pesan galat menetap menutupi kepala lembar sampai lembar ditutup. Galat memakai `role="status"` (sopan), bukan `alert`. | Terverifikasi di 390: Ajukan → langsung buka minuman lain; pesan "Pengajuan terkirim." tampil di atas lembar (tangkapan layar). `inert` dicek di DOM. | Gambar wadah pesan di luar bagian yang di-`inert` (portal sendiri, dikecualikan di `settle()`), atau tutup pesan saat lembar dibuka. | **Sebagian.** Membuka lembar/pertanyaan menutup pesan yang sedang tampil (tes "F2-13"). Pesan yang datang saat lembar sudah terbuka masih berada di bagian `inert`; `role="alert"` untuk galat belum. |
| F2-14 | Rendah | `coffee.module.css:173,221` (`--line`), `127-128` | (a) Garis chip pilihan yang belum dipilih dan simpul garis waktu memakai `--line`: 1,37:1 terhadap permukaan (batas komponen seharusnya ≥ 3:1; kelas F1-17, yang di admin diperbaiki dengan `--field-line`). (b) Tab bawah yang aktif hanya dibedakan warna (hijau 6,1:1 vs cokelat 6,9:1, kecerahan hampir sama); aturan rumah: jangan andalkan warna saja. | Dihitung dari token; tab dilihat di tangkapan layar 375. | Chip: `border-color: var(--field-line)` (3,34:1). Tab aktif: tambah penanda (garis/pil di belakang ikon, atau ikon terisi) dan bobot huruf. | **Diperbaiki.** Chip dan simpul garis waktu memakai `--field-line` (3,34:1); tab aktif diberi pil di belakang ikon + huruf tebal. Tes: `layout.test.ts` "F2-14" (kontras dihitung). |
| F2-15 | Rendah | `SetupSteps.tsx:39-41`, `CoffeeAuth.tsx:50-62` | Fokus tidak dipindahkan saat langkah berganti tanpa muat halaman: "Nanti saja"/"Sudah, lanjut" di Atur sekali dan "Masuk" di layar selamat datang menghapus tombol yang ditekan, fokus jatuh ke `<body>`; kolom Email tidak difokuskan. | Dibaca dari kode (tidak ada penanganan fokus); di browser `activeElement` = BODY setelah langkah berganti (klik lewat skrip, jadi bukan bukti penuh). | Fokuskan judul langkah (`tabIndex={-1}`) atau kolom pertama saat langkah berganti. | **Diperbaiki.** Fokus pindah ke judul langkah (Atur sekali) dan ke kolom Email / tombol Masuk. Tes: `Parts.dom.test.tsx` "F2-15 …" (2). |
| F2-16 | Rendah | `MenuScreen.tsx:63` | `<ul role="tabpanel">` menghapus peran daftar, sehingga `<li>` di dalamnya tanpa induk daftar (ARIA tidak sah; jumlah minuman tidak diumumkan). | Terverifikasi di DOM: `UL:tabpanel`. | Bungkus: `<div role="tabpanel" …><ul className={css.grid}>…</ul></div>`. | **Diperbaiki.** `<div role="tabpanel"><ul>…`. |
| F2-17 | Rendah (keputusan kata) | `CurrentOrder.tsx:79` | "Siapa pun yang lebih dulu membuka akan **membelikannya**." Keputusan 25 Nov: klaim tidak menyebut "membelikan" tetapi "Diproses" ("siapa pun yang lebih dulu membuka memprosesnya"). Kalimat ini berasal dari prototipe (`CoffeePrototype.tsx:517`), jadi selisihnya ada di prototipe juga. Kata lain lulus (lihat di bawah). | `grep -i membeli`. | "…Siapa pun yang lebih dulu membuka akan memprosesnya." Tanyakan pemilik bila ragu. | **Diperbaiki.** "…akan memprosesnya." Tes: "F2-17". Prototipe tidak diubah. |
| F2-18 | Rendah | `useCoffee.ts:62-75`, `DrinkSheet.tsx:33,80-81` | Aplikasi yang dibiarkan terbuka di depan melewati pergantian bulan tetap memakai `me.month`/`left` lama: tombol mati "Jatah habis. Kembali Selasa, 1 Desember" pada 1 Desember, karena tanpa pengajuan menunggu tidak ada pembacaan. Pulih saat aplikasi ditinggal lalu dibuka lagi. | Dibaca dari kode. | Baca ulang saat lembar minuman dibuka bila `wibMonth(now) !== me.month` atau data lebih tua dari beberapa menit. | **Diperbaiki.** Membuka lembar minuman setelah bulan WIB berganti membaca ulang status. Tes: "F2-18". |
| F2-19 | Rendah | `CoffeeApp.tsx:89-90` | Bila dua pengajuan diputuskan dalam satu pembacaan, pesan hanya menyebut yang pertama. | Dibaca dari kode. | "2 pengajuan sudah diputuskan. Lihat Pesanan saya." bila lebih dari satu. | **Diperbaiki.** "2 pengajuan sudah diputuskan · Lihat hasilnya di Pesanan saya." Tes: "F2-19". |
| F2-20 | Rendah | `Layer.tsx` (seluruhnya), `api.ts:67-76`, `coffee.module.css:233-237,258` | Kerapian: `Layer` dan `newKey` adalah salinan dari `coffee-admin` (dua tempat untuk satu aturan; perbaikan F2-01/F2-13 harus dicek di keduanya). Warna mentah di samping token (`#F6F1E8`, `#fff`, `rgba(...)`; kelas F1-23). | Dibaca dari kode. | Satukan inti `Layer` (tampilan lewat kelas, seperti yang sedang dilakukan F3) dan `newKey` di `src/lib/coffee/`. | **Belum.** `Layer` dan `newKey` masih dua salinan; warna mentah belum dijadikan token. |

Catatan (bukan temuan):
- Tanpa sesi, `/coffee` dan `/coffee/pesanan` menjawab **200** berisi kerangka `loading.tsx`, lalu pengalihan dikirim di
  dalam aliran (`<meta http-equiv="refresh" content="1;url=/coffee/masuk?next=…">` + pengalihan klien), bukan 307.
  Tidak ada data yang ikut terkirim. Ini akibat `loading.tsx` berada di atas penjaga; catatan F2 menulis "mengalihkan".
- `mustChangePassword` tidak dipaksa di halaman aplikasi maupun API ("Nanti saja" memang boleh; sama dengan WG People).
- Font aplikasi Source Sans 3 (prototipe yang disetujui), bukan Plus Jakarta Sans dari aturan rumah.

## Yang diperiksa dan lulus

- **Penjaga**: `CoffeeScreen` memanggil `requireCoffeePage` sebelum membaca data; `password-baru` juga. Ketiga API
  karyawan: `requireApiMember()` baris pertama, tulis memakai `checkOrigin`, id `z.uuid()`, `readJson` berbatas, batas
  laju per orang. Tanpa sesi: `/api/coffee/state` 401 JSON, `DELETE /api/coffee/claims/abc` 401 (dicek dengan `curl`).
- **Milik orang lain**: `myState` dan `cancelClaim` selalu menyaring `employee_id = member.id`; tidak ada id dari badan
  permintaan. Batal milik orang lain = 409 yang sama dengan "sudah diproses".
- **Data di `/api/coffee/state`**: `me` (id sendiri, nama panggilan, kelompok, jatah), pesanan sendiri, `ga`,
  `pengelola`. Pemroses hanya `processedLabel` (nama panggilan / "Super admin"), tanpa id. Tidak ada data orang lain.
- **`next`**: `//evil`, `https://…`, `\`, spasi, `/coffeeshop`, halaman masuk/lupa/password ditolak (kecuali F2-08).
- **Cookie `coffee_atur`**: hanya penanda tampilan per perangkat (path `/coffee`, `samesite=lax`, tanpa `secure`), tidak
  dipercaya untuk hak apa pun. Di pratinjau tidak ditulis (benar).
- **Service worker**: tidak menyimpan apa pun (`caches` tidak dipakai), hanya menjawab navigasi yang gagal dengan
  halaman statis; tidak ada HTML atau jawaban API yang tersimpan, jadi tidak ada data orang lain setelah keluar.
  `skipWaiting` + `clients.claim`: versi baru langsung berlaku. `sw.js` dilayani `max-age=0`.
- **Manifest**: `id`, `name`, `short_name`, `start_url`, `scope`, `display: standalone`, warna, tiga ikon (192, 512,
  maskable 512; ukuran berkas dicek: 192×192, 512×512, 512×512, apple 180×180), `application/manifest+json`.
- **Kirim ganda**: dua ketukan cepat = satu permintaan (tes + browser); tiga kartu diketuk beruntun = satu lembar (yang
  terakhir). Galat jaringan: lembar tetap terbuka, kunci sama dipakai lagi, berhasil setelah tersambung (browser 390).
- **Jatah**: angka di kartu, lembar, dan lembar Akun ikut jawaban server setelah ajukan/batal/tolak; jatah habis →
  pemberitahuan + tombol mati dengan alasan dan tanggal kembali; GA 2×, intern 2×.
- **Minuman satu suhu**: baris Suhu hilang; takaran es hanya untuk Es; es tidak dikirim untuk panas (tes).
- **Polling vs aksi**: pembacaan yang mulai sebelum atau kembali selama aksi dibuang, dibaca sekali setelah aksi
  terakhir; polling hanya saat ada yang diproses dan aplikasi terlihat (tes). Lihat F2-03 untuk yang menggantung.
- **Batal**: lewat pertanyaan (`alertdialog`, fokus awal "Tidak jadi"); tombol kembali HP menutup pertanyaan tanpa
  meninggalkan halaman dan fokus kembali ke "Batalkan pengajuan"; klik ganda "Batalkan" = satu permintaan.
- **Lembar**: gulir latar terkunci, selain lembar `inert`, Tab berputar di dalam, Escape menutup, fokus kembali ke kartu
  (papan ketik, desktop). Setelah Ajukan fokus mendarat di `<main>`. Muat ulang saat lembar terbuka tidak merusak riwayat.
- **Papan ketik**: tab Kopi/Non-kopi satu perhentian + panah kiri/kanan; kartu minuman tombol; garis fokus 3 px.
- **Lebar 320 / 375 / 390 / 1024**: `scrollWidth` = lebar layar di Menu, Pesanan saya, lembar, Atur sekali, Masuk,
  Belum dibuka; tidak ada target di bawah 44 px (diukur); kolom isian 17 px / 52 px; nama sangat panjang membungkus.
- **Area aman**: bilah atas, tab bawah, lembar, pesan, dan halaman masuk memakai `env(safe-area-inset-*)`.
- **Kata**: "Diproses", "kamu", tidak ada WhatsApp, tidak ada "HR membelikan" secara harfiah (lihat F2-17),
  sentence case, tanpa huruf besar berjarak. Kalimat kosong mengajak ("Belum ada pesanan… Lihat menu").
- **Gerak**: `prefers-reduced-motion` mematikan animasi dan transisi di `.theme *` (termasuk lapisan).
- **XSS**: tidak ada `dangerouslySetInnerHTML`; catatan tolak dan nama dirender sebagai teks.
- **Alamat**: semua dari `routes.ts` (kecuali konstanta pratinjau `HERE`).

### Kontras (token `coffee.module.css`, mode terang saja)

| Pasangan | Rasio |
| --- | --- |
| Teks kedua `#6B5546` di krem / permukaan / `--soft` / `--no-c` | 6,48 / 6,86 / 5,65 / 5,57 |
| Putih di hijau `#2F6B5A` (tombol utama) | 6,23 |
| Hijau `#2F6B5A` di krem / permukaan (tautan, tab aktif) | 5,79 / 6,13 |
| Hijau tua `#245446` di `#DCEFE8` (pil selesai, chip terpilih) | 7,22 |
| Menunggu `#9A4A1C` di `#FDEBDD` / di krem | 5,37 / 5,79 |
| Ditolak `#9A273D` di `#F5E1E5` / di permukaan; putih di `#9A273D` | 6,14 / 7,57 / 7,69 |
| Garis kolom isian `--field-line` di permukaan (bukan teks) | 3,34 |
| Garis chip/kartu `--line` di permukaan / krem (bukan teks) | 1,37 / 1,29 (F2-14) |

## PWA: penilaian `/coffee` di luar scope SW `/coffee/`

- **Bisa dipasang**: ya menurut aturan Chrome sekarang (manifest + ikon cukup); SW tidak menentukan. Belum diuji di HP.
- **Offline**: pintu masuk aplikasi (`/coffee`) tidak punya halaman offline sendiri. Ini kerugian yang nyata dari
  pilihan sekarang.
- **Push F4**: langganan dan pengiriman tidak terhalang; yang terkena adalah kode yang mengandalkan halaman
  terkendali (`.ready`, `controller`, `clients.matchAll()` bawaan).
- **Rekomendasi**: header `Service-Worker-Allowed: /coffee` + scope `/coffee` sebelum rilis (rincian di F2-04), dan
  hapus `orientation` (F2-05). WG People (`/people/`) kemungkinan punya celah offline yang sama; di luar lingkup.

## Templat §5

| Sisi | Hasil | Bukti |
| --- | --- | --- |
| Keamanan | Lulus, dengan F2-08 (rendah) dan F2-01 (data tertinggal di layar setelah keluar) | `curl` 401; kode penjaga; simulasi keluar |
| Data dan jatah | Lulus di klien; F2-02 (klaim ganda setelah jawaban hilang) | tes + browser; kode |
| UX vs prototipe | Sebagian: F2-06, F2-07, F2-10, F2-17 | browser 375/390 |
| Rasa aplikasi | Lulus (kerangka tetap, lembar, tombol kembali); tanpa segarkan manual dan banner offline (F2-07) | browser |
| A11y | Lulus dengan F2-13 s.d. F2-16 | DOM, papan ketik, kontras |
| HP | Lulus 320/375/390/1024; F2-12 di 320×640 | `scrollWidth`, ukuran target |
| Tes | 155 lulus; celah di bawah | `npx vitest run …` |
| Kode vs konvensi | Lulus dengan F2-20; typecheck/lint tidak dijalankan | baca kode |
| Halaman asli dengan sesi, pasang, offline, push | **Tidak diuji** | butuh sandi, migrasi, perangkat |

## Tes yang belum ada

1. Keluar: setelah `signOut` berhasil lembar tidak ditutup / `history.back` tidak dipanggil (F2-01); keluar yang gagal (F2-09).
2. Jawaban Ajukan hilang → lembar ditutup dan dibuka lagi → tetap satu klaim (F2-02).
3. Permintaan menggantung: batas waktu, lembar bisa ditutup, polling pulih (F2-03).
4. Batal kalah balapan: pesan "tidak bisa dibatalkan" tetap terbaca (F2-06; tes baris 162-171 terlalu longgar).
5. `safeCoffeeNext`: `/coffee/../admin`, `/coffee/%2e%2e/x`, `/coffee/./masuk`, `/coffee//x`, `/coffee/sw.js`, `/COFFEE`.
6. `Layer.tsx` karyawan tidak punya tes sendiri: Escape, jebakan Tab, fokus kembali, entri riwayat HP, bertumpuk,
   `onLayerEntry` + pindah tab mengganti entri (bukan menambah).
7. `useTab` dengan `routing="history"`: `pushState` ke `/coffee/pesanan`, `popstate` kembali ke Menu, tautan dalam
   `/coffee/pesanan`, `?pesan=ga` dirapikan, judul dokumen ikut, posisi gulir per tab.
8. `useCoffee`: jawaban terbalik (`readNo`), pembacaan gagal tidak mengubah layar, dua keputusan sekaligus (F2-19),
   pergantian bulan (F2-18), timer dibersihkan saat dilepas.
9. Halaman server: `CoffeeScreen` memanggil `requireCoffeePage` lebih dulu; 503 → "belum dibuka"; galat lain (F2-11);
   cookie `coffee_atur=1` → `setup=false`; `masuk` dengan sesi → alih ke `next`; `password-baru` tanpa
   `mustChangePassword` → alih. (`src/app/coffee` tanpa tes sama sekali.)
10. `api.ts`: 401 → alamat masuk membawa `next`; jawaban bukan JSON; `newKey` tanpa `randomUUID` (bentuk uuid v4, unik).
11. `pwa.ts`: tawaran pasang disimpan dan dipakai sekali; `installed` mengikuti `display-mode`.
12. `Toast`: hilang 6 detik, galat menetap, mengetuk pesan keputusan membuka Pesanan saya.
13. `OrdersScreen`/`CurrentOrder`: klaim manual ("Klaim dicatat pengelola"), "Lainnya" tanpa foto, klaim selesai lama (F2-10).
14. Manifest: tidak ada `orientation` yang mengunci tablet (F2-05); `sw.js` tidak menjawab selain navigasi.

## Putusan

**Belum siap dirilis ke karyawan; layak lanjut ke F3/F4 setelah F2-01 diperbaiki.** Dasar aplikasinya rapi: penjaga
benar, tidak ada data orang lain yang bocor lewat API atau SW, kirim ganda dan balapan baca/aksi tertangani, tata letak
bersih di 320 sampai desktop. Yang menahan: keluar di HP (F2-01), dan tiga hal seputar jaringan buruk (F2-02, F2-03,
F2-07) yang justru keadaan sehari-hari HP di kantor.

Urutan perbaikan:
1. **F2-01** keluar di HP (lalu cek sekali dengan sesi asli).
2. **F2-04 + F2-05** scope SW dan `orientation`, sebelum ada HP/tablet yang memasang dan sebelum F4.
3. **F2-03, F2-02** batas waktu dan klaim ganda setelah jawaban hilang.
4. **F2-06, F2-07** pesan batal yang kalah balapan; banner tidak tersambung.
5. **F2-08, F2-09, F2-11** `next` berisi `..`, keluar gagal, layar "belum dibuka" untuk semua galat.
6. Sisanya (F2-10, F2-12 s.d. F2-20) dan tes yang belum ada.

Perlu dicek oleh pemilik/PM dengan sesi asli setelah migrasi: masuk → `/coffee/pesanan` kembali ke tujuan; pindah tab
dan tombol kembali (`routing="history"`); keluar di HP; pasang di Android dan iPhone; buka dari ikon tanpa sinyal.

## Setelah perbaikan (26 Nov 2026)

Kolom **Status** di tabel temuan diisi oleh agen perbaikan (commit `fix(coffee): temuan audit aplikasi karyawan …`).

- Tes yang ditambahkan dari daftar "Tes yang belum ada": 1, 2, 3, 4, 5, 6 (Escape, jebakan Tab, fokus kembali, entri
  riwayat HP, bertumpuk), 7 (pindah tab dan tombol kembali dengan `routing="history"`, judul dokumen), 8 (sebagian:
  dua keputusan, pergantian bulan), 9 (`CoffeeScreen`: penjaga dulu, 503, galat lain, cookie), 10, 11 (pendaftaran SW),
  12, 13 (klaim selesai lama), 14.
- **Belum ada:** `?pesan=ga` dirapikan dan posisi gulir per tab (7), jawaban terbalik `readNo` dan timer dilepas (8),
  halaman `masuk`/`password-baru` di server (9), tawaran pasang `beforeinstallprompt` (11), klaim manual dan "Lainnya" (13).
- Tes `CoffeeApp.dom.test.tsx` "Sisa 2 dari 4" yang sekali gagal: `toTab` membandingkan dengan catatan yang ditulis sebuah
  efek; ketukan pada Menu yang datang sebelum efek itu dianggap "tab yang sama" dan tidak berbuat apa-apa. Sekarang
  dibandingkan dengan tab yang sedang digambar. Tidak bisa diulang dengan pasti, jadi tanpa tes khusus.
- Tetap **belum diuji**: halaman asli dengan sesi (keluar di HP, masuk, pindah tab), pasang ke layar utama, SW aktif,
  halaman offline dari ikon. Itu perlu sandi, migrasi, dan perangkat.
