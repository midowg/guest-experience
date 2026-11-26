# Audit F5 Werkudara Coffee: menyeluruh + QA, termasuk audit F4 push (26 Nov 2026)

Peninjau independen (bukan penulis fase mana pun). Yang diaudit: cabang `feat/werkudara-coffee`, HEAD `1035e910`
(`a123aa03..HEAD`, 11 commit, 230 berkas). Tidak ada kode aplikasi yang diubah, tidak ada build, tidak ada commit, tidak
ada migrasi yang dijalankan. Skill yang dipakai: `ui-ux-pro-max` (aksesibilitas, sentuhan, tata letak, formulir).

Arti kolom **Blokir rilis?**: "rilis" = push ke `main` produksi **dengan kedua migrasi belum dijalankan**. Temuan yang
tidak memblokir push tetapi wajib beres sebelum langkah berikutnya ditandai "tidak (wajib sebelum …)".

## Cara memeriksa (apa adanya)

- **Dibaca baris demi baris:** kedua migrasi, `src/lib/server/coffee/**`, ke-20 route di `src/app/api/coffee/**` dan
  `src/app/api/admin/coffee/**`, semua `page.tsx`/`layout.tsx` Coffee, `public/coffee/sw.js`, `usePush.ts`, `pwa.ts`,
  `ga/hold.ts`, `ExitDialog.tsx`, `PushBar.tsx`, `NotifySetup.tsx`, `notify.ts`, `http.ts`, `admin-session.ts`,
  bagian Coffee di `admin-access.ts`, `admin-actor.ts`, `standalone-apps.ts`, `next.config.ts`.
- **Gerbang mutu (dijalankan penuh):**
  - `npx vitest run` → **493 berkas lulus, 4387 tes lulus, 2 dilewati, 0 gagal** (85,6 dtk). Tidak ada tes yang berkedip kali ini.
  - `npx tsc --noEmit -p .` → keluar 0, tanpa galat.
  - `npx eslint` pada sembilan folder Coffee → keluar 0, tanpa galat dan tanpa peringatan.
- **Service worker dijalankan** di luar repo (skrip node di scratchpad, `self` tiruan seperti `sw.test.ts`) untuk
  membuktikan F5-01.
- **`curl` ke server dev port 3220** tanpa sesi: ke-20 route (GET dan tulis, dengan `Origin` yang benar) → semuanya
  **401**; `/admin/coffee` → 307 ke login; `/coffee/hr` → 307 ke `/admin/coffee`; `sw.js` 200 dengan
  `Service-Worker-Allowed: /coffee` dan `Cache-Control: no-cache, max-age=0`; API `Cache-Control: no-store`.
- **Browser** (panel bawaan, tab baru, `next dev -p 3220`): tiga pratinjau `/dev-preview/coffee/nyata…`, rincian di
  bagian F. Tab ditutup, cookie/simpanan pratinjau dihapus, server dihentikan (port 3220 kosong).
- **Git:** `git fetch guest-experience main`, `git merge-tree --write-tree HEAD guest-experience/main`.

**Yang tidak diuji (jujur):**
- **SQL tetap belum pernah dijalankan di Postgres mana pun** (tidak ada `psql`/Docker; aturan: agen tidak menjalankan
  migrasi). Kedua migrasi hanya dibaca. Uji balapan jatah belum pernah dilakukan.
- **Tidak ada halaman asli yang dibuka dengan sesi** (karyawan, GA, admin): tanpa sandi, tanpa migrasi. Matriks
  route × peran hanya terverifikasi langsung untuk "tanpa sesi"; peran lain lewat tes yang ada
  (`coffee-guards.test.ts`, `coffee-admin-guards.test.ts`, `session.test.ts`, `admin-access.test.ts`).
- **Tidak ada push sungguhan, service worker sungguhan, izin notifikasi, HP, atau tablet.** Panel browser tidak bisa
  mendaftarkan SW. Semua keadaan push dilihat dengan perangkat tiruan (`?notif=`).
- Unduhan CSV/Excel, pembaca layar, keyboard layar, mode gelap, zoom 200%: tidak diuji.

## Temuan

> **Status perbaikan (26 Nov 2026, setelah audit):** kolom terakhir tabel ini. Diperbaiki: F5-01 sampai F5-06, F5-08,
> F5-09, F5-10. Sebagian: F5-07, F5-12. Dibiarkan: F5-13, F5-14. Dicatat: F5-11. Daftar rilis dan catatan rollback di
> bagian H **sudah digantikan** oleh `docs/coffee/GO-LIVE.md` (kunci PIN kini 30 detik naik bertahap, bukan 10 menit;
> nomor baris migrasi berubah). Yang tetap belum pernah dilakukan: menjalankan SQL, akun asli, perangkat asli, push sungguhan.

| ID | Tingkat | Berkas:baris | Yang salah | Cara mengulang | Saran perbaikan | Blokir rilis? | Status (setelah perbaikan, 26 Nov 2026) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F5-01 | **Tinggi** | `public/coffee/sw.js:72` (data.url tetap alamat asli saat netral), `:79-92` (`notificationclick`) | **Mengetuk notifikasi di tablet yang sedang dipegang tamu membuka aplikasi pribadi petugas atau admin.** Di mode tamu teks notifikasi memang dinetralkan, tetapi `data.url` tetap alamat aslinya. Saat diketuk, SW mencari jendela dengan area yang sama; tablet hanya punya jendela `/coffee/ga` (area `ga`), jadi untuk alamat area `app` atau `admin` ia memanggil `clients.openWindow(...)`. Hasil: jendela baru `/coffee/pesanan` (klaim pribadi petugas: nama, jatah, riwayat, tautan Mode GA dan Pengelola, Keluar) atau `/admin/coffee` (antrean semua orang bila browser itu juga masuk admin). Catatan F4 "mengetuknya tidak mengeluarkan tablet dari buku menu" hanya benar untuk notifikasi pesanan rapat. Pemegang akses Coffee otomatis punya Mode GA, jadi "Klaim baru" di tablet adalah kasus biasa. Tes `sw.test.ts:108` malah mengunci perilaku ini ("never the tablet's window for the employee app") tanpa kasus mode tamu. | **Terverifikasi** dengan menjalankan `sw.js` (cookie `coffee_ga_tamu=1`, satu jendela `/coffee/ga`): push ber-`url` `/coffee/pesanan` → tampil "Werkudara Coffee · Ada pembaruan pesanan.", klik → `openWindow("https://…/coffee/pesanan")`, tidak ada yang difokuskan. Sama untuk `/admin/coffee`. Untuk `/coffee/ga?pesanan=…` hanya fokus (benar). | Di `notificationclick`: hitung `guestHolds(windows)` lagi; bila ya, **jangan pernah `openWindow`**: fokuskan jendela tablet bila ada, selain itu tidak berbuat apa-apa. Tambahan: saat `quiet`, simpan `data.url = TABLET`. Tambah dua tes (klaim pribadi dan klaim baru saat mode tamu → `opened` kosong). | tidak (push mati sampai migrasi 2). **Wajib sebelum migrasi 2 dijalankan / tablet dipakai dengan tamu.** | **Diperbaiki.** Di mode tamu `notificationclick` tidak pernah `openWindow` dan tidak mengirim pesan apa pun: jendela tablet hanya difokuskan. Notifikasi yang tampil di mode tamu hanya menyimpan alamat tablet. `sw.test.ts`: tes lama yang mengunci perilaku salah diganti, 4 tes baru (semua jenis notifikasi, tanpa jendela, banyak jendela, tanpa `cookieStore`). Belum dicoba di tablet asli (GO-LIVE langkah 10.5). |
| F5-02 | Sedang | `src/lib/server/admin-actor.ts:172-182` | **Pesan "menunggu migrasi" menyebut migrasi yang salah.** Galat 23514 diperiksa berurutan: kuesioner → wellbeing → wam_acara → hr → coffee. Bila orang yang dicentang Coffee sudah memegang salah satu dari empat akses itu (justru kasus HR: pemegang WG People), super admin membaca "Akses WG People menunggu migrasi 202611200703_admin_grants_hr.sql…", padahal migrasi itu sudah lama jalan dan yang kurang adalah `202612010001_coffee.sql`. Ini terjadi tepat di jendela "aplikasi sudah dideploy, migrasi belum". | Dibaca dari kode (urutan `if`). Di produksi sebelum migrasi 1: Super admin → Akses admin → orang yang punya WG People → centang Werkudara Coffee → Simpan. | Periksa dari yang terbaru (coffee dulu, lalu hr, wam_acara, …), atau tentukan dari aplikasi yang baru ditambahkan dibanding grant tersimpan. Satu tes di `admin-actor`. | tidak (disarankan sebelum push: satu baris pindah) | **Diperbaiki.** Urutan dibalik (coffee → hr → wam_acara → wellbeing → kuesioner). **Temuan tambahan saat menulis tes:** cabang 23514 tidak pernah tercapai, karena `missing()` mencocokkan teks `admin_grants` yang juga ada di nama batasan (`admin_grants_apps_check`), sehingga yang tampil selalu "Akses admin per orang menunggu migrasi 202611130012". Kini 23514 diperiksa lebih dulu. Tes baru `admin-actor.test.ts`. |
| F5-03 | Sedang (**perlu dicek** di Chrome asli) | `src/components/coffee/usePush.ts:45-57`, `pwa.ts:20-33` | Di **admin**, `coffeeWorker()` pertama kali dipanggil saat "Nyalakan notifikasi" ditekan (halaman admin di luar scope, tidak mendaftar SW saat dimuat, dan `device.current()` hanya dipanggil bila izin sudah `granted`). `register()` selesai sebelum worker aktif; `pushManager.subscribe()` langsung sesudahnya menurut spesifikasi ditolak bila belum ada worker aktif. Akibat yang diduga: tekan pertama gagal dengan "Notifikasi belum bisa dinyalakan di perangkat ini. Coba lagi.", tekan kedua berhasil. Aplikasi karyawan dan tablet tidak terkena (mendaftar saat halaman dibuka). `navigator.serviceWorker.ready` tidak bisa dipakai di admin (tidak pernah selesai di luar scope). | Tidak bisa diuji (panel menolak SW). Di Chrome asli: browser yang belum pernah membuka `/coffee`, masuk admin, `/admin/coffee` → Nyalakan notifikasi → Izinkan. | Di `registration()` tunggu worker aktif: bila `!found.active`, tunggu `statechange` → `activated` pada `found.installing ?? found.waiting` (dengan batas waktu). | tidak (wajib dicek di langkah uji perangkat no. 1) | **Diperbaiki menurut tes; belum dicek di Chrome asli.** `subscribe()` menunggu worker aktif (`activeCoffeeWorker`: `statechange` → `activated`, paling lama 10 dtk) di ketiga tempat (satu `browserDevice`). Tes di `Parts.dom.test.tsx`. GO-LIVE langkah 10.1. |
| F5-04 | Sedang | `src/lib/coffee/schemas.ts:150` (`coffeePushSchema`), `src/lib/server/coffee/push.ts:62-69,95-104`, route `push` dan `push/test` | **Alamat push bebas + jumlah perangkat tanpa batas.** (a) Karyawan mana pun yang masuk boleh menyimpan alamat `https://` apa saja; server lalu melakukan POST ke sana (`webpush.sendNotification`), dan "Kirim notifikasi tes" menjawab berhasil/gagal → bisa dipakai menyuruh server memanggil host mana pun dan menebak apakah host itu menjawab (SSRF buta; isi terenkripsi, jawaban tidak dikembalikan). (b) 30 simpan per 10 menit per orang tanpa batas total: satu orang bisa menumpuk ribuan baris; `select … limit(2000)` tanpa urutan lalu bisa memotong perangkat penerima lain, dan `after()` mengirim ke semuanya (batas 8 dtk tiap perangkat). Lebih ketat daripada WAM (yang menerima `http` juga), tetapi tetap terbuka. | Dibaca dari kode. Butuh sesi karyawan + kunci VAPID + migrasi 2, jadi tidak dijalankan. | Daftar putih host layanan push (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.notify.windows.com`, `web.push.apple.com`); tolak IP literal dan port selain 443. Batas perangkat per orang (mis. 10: hapus yang tertua saat menyimpan). | tidak (disarankan sebelum migrasi 2) | **Diperbaiki.** Daftar izin host (`isPushServiceUrl`: FCM, Mozilla, `*.push.apple.com`, `*.notify.windows.com`; https, tanpa port lain, tanpa bagian masuk) diperiksa saat menyimpan dan lagi sebelum mengirim; paling banyak 5 perangkat per orang (kolom baru `updated_at`, yang paling lama tidak dipakai diganti); penerima dibaca per orang, berurutan, tanpa `limit(2000)`; tes kirim selalu menjawab sama, apa pun jawaban layanan push. WAM tidak punya daftar izin untuk dipakai ulang. |
| F5-05 | Sedang | `src/app/api/coffee/ga/pin/route.ts:11,24-25`, `src/lib/server/coffee/rate.ts:19-24` | **Tamu bisa mengunci petugas di buku menu 10 menit, berulang-ulang.** 10 percobaan PIN per akun per 10 menit; percobaan yang **benar** juga dihitung. Tamu mengetik 10 PIN asal (±30 detik) → petugas yang PIN-nya benar pun mendapat 429 "Terlalu sering… Tunggu sepuluh menit". Tidak ada jalan pulih selain menunggu (menyimpan PIN baru di admin tidak mengosongkan hitungan; menghapus data situs menghapus sesi juga). Sisi baiknya: tidak ada jalan pintas ke data GA. | Dibaca dari kode; di pratinjau batas ini tidak ditiru. | Hitung hanya yang salah (konsumsi setelah `checkGaPin` gagal, atau kunci terpisah untuk gagal), dan tulis kalimat khusus di dialog ("Terlalu banyak PIN salah. Tunggu 10 menit, atau minta pengelola…"). Minimal: tulis di aturan pemakaian tablet. | tidak | **Diperbaiki.** Hanya PIN salah yang dihitung; 5 salah → kunci 30 dtk, lalu 1, 5, 15 menit (pesan menyebut lama tunggu); satu jam tanpa salah mulai dari awal; pengelola menyimpan PIN baru membuka kunci. Tiap percobaan dicatat dulu dengan satu penulis yang menang (tabel baru `coffee_pin_tries` di migrasi 1), jadi kiriman serentak tidak lolos bersama. Akun terkunci dijawab sebelum batas per alamat (60) dan per akun (30) disentuh. Laju jangka panjang 5 percobaan per 15 menit: 10.000 PIN ≈ 3 minggu mengetik tanpa henti. |
| F5-06 | Rendah | `src/components/coffee/ga/hold.ts:71` (`max-age=43200`), `src/app/coffee/ga/page.tsx:30-33` | Cookie mode tamu hidup 12 jam dan hanya ditulis ulang saat isi buku berubah. Tablet yang ditinggal di mode tamu lebih dari 12 jam lalu dimuat ulang menerima halaman **dengan** data GA dari server (pesanan hari ini, daftar karyawan di muatan halaman); `sessionStorage` baru mengembalikan buku menu setelah gambar pertama (Beranda GA sempat tampil). | Dibaca dari kode. | Tulis ulang cookie berkala selama mode tamu (mis. saat `visibilitychange` dan tiap jam), atau perpanjang umurnya. | tidak | **Diperbaiki.** Cookie ditulis ulang tiap 30 menit dan saat tablet dilihat lagi (`visibilitychange`, `pageshow`) selama buku terbuka. Tes di `GaApp.dom.test.tsx`. |
| F5-07 | Rendah | `usePush.ts:73-82` (hanya dipanggil dari Keluar di `/coffee` dan di `/admin/coffee`), `GaApp.tsx` (tanpa Keluar, tanpa Matikan) | Langganan perangkat tetap milik orang sebelumnya bila sesi berakhir tanpa lewat tombol Keluar milik Coffee: sesi kedaluwarsa/401, Keluar dari WAM / WG People / Booking (sesi yang sama), Keluar admin dari halaman di luar `/admin/coffee`, reset password. Sampai orang berikutnya membuka Coffee di browser itu, perangkat masih menerima notifikasi orang lama (nama panggilan pemroses + minuman). Tablet GA tidak punya cara mematikan notifikasi sama sekali ("Notifikasi aktif" hanya tulisan). | Dibaca dari kode; tulisan tanpa tombol terlihat di browser (1024×768, `?notif=on`). | Hapus semua langganan Coffee orang itu saat logout di server dan saat password direset; beri tablet tombol "Matikan". | tidak | **Sebagian.** Tablet punya "Matikan"; sesi berakhir (401) di aplikasi karyawan melepas langganan; halaman masuk Coffee melepas langganan yang tertinggal (kecuali ada pengelola yang masih masuk admin di browser itu); ganti dan reset password menghapus semua langganan Coffee orang itu di server. **Masih terbuka:** Keluar dari WAM / WG People / Booking atau dari admin di luar `/admin/coffee` belum menghentikan notifikasi sampai Coffee dibuka lagi di perangkat itu. |
| F5-08 | Rendah | `src/lib/server/coffee/recap.ts:47` | Lembar Detail kini 23 kolom ("Nama tamu"), daftar lebar masih 22 angka: mulai kolom ke-11 lebar bergeser satu (Jumlah tamu selebar 24, Minuman 20, dst.). Isi benar, hanya lebar. | Terverifikasi: `DETAIL_HEAD` = 23 unsur, `widths` = 22. | Sisipkan satu lebar (mis. 16) setelah "Tamu/instansi"; tes panjang `widths === DETAIL_HEAD.length`. | tidak | **Diperbaiki.** Lebar diberikan per nama kolom (kolom tanpa lebar tidak lolos kompilasi); tes membaca 23 lebar dari berkas .xlsx. |
| F5-09 | Rendah | `src/components/coffee-admin/PushBar.tsx:27-28`, bilah atas `GaApp.tsx` | Fokus jatuh ke `<body>` setelah "Nyalakan notifikasi" dan "Matikan" (tombolnya diganti/dihapus). Kelas temuan F1-09. | Terverifikasi di browser: admin 1440 dan tablet 1280, `document.activeElement` = BODY setelah keduanya. | Pindahkan fokus ke tombol pengganti atau ke teks status (`tabIndex={-1}`). | tidak | **Diperbaiki.** Fokus pindah ke tombol pengganti (admin, tablet) atau ke baris status (lembar Akun, dan admin bila tidak ada tombol tersisa). Dilihat di browser: admin 375 dan tablet 1024. |
| F5-10 | Rendah (tampilan) | `PushBar.tsx`, `coffee-admin.module.css` (`.pushBar`), `CoffeeApp.tsx:264`, `SetupSteps.tsx` | (a) Admin di HP (375): baris "Nyalakan notifikasi" setinggi 143 px di atas Antrean dan tidak bisa ditutup; keadaan diblokir 191 px (bisa ditutup). (b) Lembar Akun: "Keluar" berada di atas kotak Notifikasi (aksi keluar di tengah, bukan terakhir); di 320×640 dengan tautan Mode GA + Pengelola kotak Notifikasi berada di bawah lipatan (lembar bergulir, masih terjangkau). (c) Langkah Atur sekali tetap berjudul "Izinkan notifikasi" saat keadaannya diblokir / belum tersedia / iPhone belum dipasang (tombolnya sudah benar "Mulai pesan"). | Terlihat di browser (375, 320). | (a) versi ringkas di ≤ 760 px: ikon + "Nyalakan notifikasi" satu baris, atau bisa ditutup dan diingat per perangkat; (b) Notifikasi di atas Keluar; (c) judul mengikuti keadaan ("Notifikasi"). | tidak | **Diperbaiki.** (a) di ≤ 760 px tawaran menjadi satu baris: 57 px (tadinya 143), terukur di browser; keadaan aktif dibuat satu baris juga, **belum terlihat di browser** (halaman pratinjau admin berhenti di "Memuat halaman" pada dua percobaan terakhir). (b) Notifikasi di atas Keluar, terlihat di 375×812. (c) judul langkah "Notifikasi" bila izin tidak bisa diminta. |
| F5-11 | Rendah | `src/lib/server/coffee/push.ts:132-137,156,183` | "Sekali per kabar" dicatat **sebelum** dikirim. Bila pengiriman gagal seluruhnya (layanan push tidak menjawab, fungsi dihentikan), kabar itu tidak pernah diulang. Diterima selama polling menjadi cadangan; perlu diketahui saat menelusuri "notifikasi tidak masuk". Tabel `coffee_push_sent` tumbuh ±2–3 baris kecil per pesanan dan ikut terhapus bersama pesanannya: tidak perlu pembersihan. | Dibaca dari kode. | Cukup dicatat di dokumen. | tidak | **Dicatat** di `docs/aturan-coffee.md` §6 dan GO-LIVE. Tambahan: baris `coffee_push_sent` yang lebih dari 30 hari dihapus setiap kali ada kabar baru. |
| F5-12 | Rendah | `docs/` | Butir dokumen F5 belum ada: `docs/aturan-coffee.md` tidak ada; `docs/rancangan-kopi-kantor.md:3` masih "Status: rancangan, belum diimplementasikan"; ringkasan `brain/projects/` belum. | `ls docs/aturan-coffee.md` → tidak ada. | Tulis setelah perbaikan audit ini. | tidak | **Sebagian.** `docs/aturan-coffee.md` dan `docs/coffee/GO-LIVE.md` ditulis; status di `rancangan-kopi-kantor.md` diperbarui. Ringkasan `brain/projects/` belum (di luar worktree ini). |
| F5-13 | Rendah | `public/dev/coffee/*.jpg`, `src/components/coffee/prototype/**` | 15 foto di `public/dev/coffee` identik (md5) dengan `public/coffee/drinks` dan ikut ke produksi (232 KB, gambar AI, tidak sensitif). Prototipe (±3.000 baris) ikut dikompilasi walau rutenya 404 di produksi. Data contoh prototipe memakai alamat `…@werkudara.com` rekaan dengan nama "Contoh …". | `md5sum` kedua folder: sama. | Biarkan sampai prototipe dihapus; saat itu hapus `public/dev/coffee`. | tidak | **Dibiarkan.** Sudah dicoba: memindahkan prototipe ke `/coffee/drinks` membuat `routes.test.ts` gagal (alamat Coffee hanya boleh dari `routes.ts`), jadi perlu `coffeePath.photo` + impor di tiga berkas prototipe, lebih dari sekadar konstanta path. Hapus bersama prototipe. |
| F5-14 | Rendah | `supabase/migrations/202612010001_coffee.sql:387-389` | Nomor migrasi bertanggal 1 Des padahal hari ini 26 Nov: migrasi lain yang ditulis sesudahnya dengan nomor `202611…` terurut **sebelum** Coffee. Bila salah satunya menyentuh `admin_grants_apps_check`, daftar tulis-tangan di sini bisa membuang aplikasi itu (S-7 audit F0 tetap berlaku). **Saat ini aman:** `guest-experience/main` = `a123aa03`, migrasi terakhir di main `202611300003`, tidak ada cabang lokal maupun remote yang punya migrasi ≥ `202612010001` selain cabang ini, dan batasan terakhir di main (`202611200703`) = daftar di sini tanpa `'coffee'`. | `git ls-tree` semua cabang; `grep admin_grants_apps_check`. | Jalankan cek di daftar rilis (langkah 2) tepat sebelum migrasi 1. | tidak | **Dibiarkan** (cek di GO-LIVE langkah 2). Catatan: karena tabel `coffee_pin_tries` ditambahkan, baris daftar aplikasi kini di baris 404, bukan 389. |

Tidak ada temuan Kritis. Tidak ada temuan yang memblokir push ke `main` selama kedua migrasi belum dijalankan.

## A. Audit F4 push

**Migrasi `202612010002_coffee_push.sql` (dibaca, tidak dijalankan).** Sintaks: tidak ditemukan salah. `create table
if not exists` + `create index if not exists` → aman dijalankan ulang. RLS nyala tanpa policy; `revoke all … from
public, anon, authenticated`; `grant` hanya `service_role` (`coffee_push_sent` tanpa `update`, memang tidak dipakai).
FK: `employee_id → employees on delete cascade`, `order_id → coffee_orders on delete cascade` (jadi **harus setelah
migrasi 1**; dijalankan lebih dulu → gagal bersih, satu transaksi). Indeks: unik `endpoint`, indeks `employee_id`,
kunci utama `(order_id, event, stamp)`. `stamp` ≤ 40: nilai yang dipakai `toISOString()` 24 huruf. Pertumbuhan: F5-11.

**`push.ts`.** Penerima: klaim/rapat baru → `holders()` (pemegang grant yang masih aktif) kecuali pengirim; keputusan
klaim → pemesan; keputusan rapat → `created_by` + PIC, masing-masing dengan teks dan alamat sendiri; penekan tombol
dikecualikan; karyawan nonaktif disaring lagi saat kirim. Pesanan dibaca ulang saat kirim (yang sudah diurungkan atau
catatan manual tidak dikabarkan). Balapan: hanya `insert` yang berhasil yang mengirim (kunci utama); Selesai → Urungkan
→ Selesai memakai cap baru. `after()` dibungkus `try/catch` dan jatuh ke kirim langsung di luar permintaan; tanpa kunci
VAPID tidak ada yang dijadwalkan. Tidak ada jalur yang melempar ke pemanggil (`later`, `sendCoffeePush` menelan dan
mencatat). 404/410 dihapus, gagal lain hanya dicatat dengan kode status (tanpa alamat perangkat). Isi notifikasi: nama
depan pemesan (hanya ke pengelola), minuman, ruangan, jumlah, nama panggilan pemroses; **tidak** ada nama tamu,
instansi, jabatan, BU, atau isi catatan tolak (dicocokkan dengan `notify.ts` dan tesnya). Ukuran muatan < 300 byte.
Catatan: lihat F5-04 (alamat bebas, jumlah perangkat), F5-07 (langganan tertinggal), F5-11.

**Endpoint.** Ketiga route push: penjaga sesi sebagai baris pertama (`requireApiMember`; admin: `requireApiAdmin` +
aktor `person`, super admin 409), `checkOrigin` di semua tulis, `readJson` berbatas (3–4 KB), zod, batas per alamat
(300) dan per orang (30 simpan, 10 tes) per 10 menit. Orangnya selalu dari sesi. Menghapus hanya milik sendiri
(`eq employee_id`). **Bajak-membajak:** menyimpan alamat yang sama memindahkan perangkat ke penyimpan terakhir; untuk
merebut perangkat orang lain penyerang harus tahu alamat push-nya (rahasia, tidak pernah dikirim ke klien lain) dan
hasilnya hanya membuat korban berhenti menerima (kunci tidak cocok), bukan membaca notifikasinya. Diterima.
`DELETE` tanpa batas laju (wajar).

**`sw.js`.** `safeUrl` hanya meloloskan alamat situs sendiri di bawah `/coffee` atau `/admin/coffee` (URL diluruskan
dulu, jadi `/coffee/../x` gugur); jendela yang sudah terbuka tidak dinavigasi, hanya difokuskan dan diberi pesan
bertipe `coffee:open` (halaman hanya menerima jalur yang diawali `/` dan memutuskan sendiri: `tabOf`, `go("antrean")`,
id pesanan dicocokkan dengan daftar hari ini). Tidak ada `caches`; `fetch` hanya menjawab navigasi yang gagal dengan
halaman statis. `skipWaiting` + `clients.claim` + `max-age=0`: versi baru langsung berlaku. Teks netral mode tamu:
benar (cookie lewat `cookieStore`, cadangan "ada jendela tablet"); **yang bocor adalah kliknya: F5-01.**

**Keadaan UI** (browser, perangkat tiruan): belum aktif → aktif → tes → mati berjalan di aplikasi karyawan (375, 320);
diblokir, iPhone belum dipasang, tidak didukung, belum tersedia menampilkan kalimat yang benar dan tanpa tombol yang
tidak berbuat apa-apa; admin: `account`, `not-ready` (menyebut nama kunci), `denied` (bisa ditutup, 44×44); tablet:
tombol 172×48 di bilah atas, ditolak → pesan menetap. Tidak ada geser ke samping, tidak ada galat konsol.

## B. Sapuan keamanan seluruh fitur

| Hal | Hasil | Bukti |
| --- | --- | --- |
| Penjaga route | Lulus | 20 route: baris pertama `requireApiMember` / `requireApiGa` / `requireApiAdmin`; `curl` tanpa sesi → 401 semuanya. Area admin `coffee` lewat `areaOfPath` + `opensHere`; tanpa header jalur → ditolak (`mayOpenArea(null)` = false). |
| IDOR | Lulus | Klaim: `employee_id = member.id` di baca dan batal; id URL `z.uuid()`; tidak ada "siapa saya" dari badan permintaan. Admin: semua pemegang grant memang boleh semua pesanan. GA: `parentId` dicek di SQL (hari ini, bukan ditolak/batal/manual). |
| Origin/CSRF | Lulus, sesuai konvensi repo | `checkOrigin` di semua tulis, `sameOriginRead` di unduhan. |
| Validasi dan batas | Lulus | zod + `readJson` 200 B–20 KB; batas laju per alamat dan per orang untuk klaim, rapat, PIN, push. Selesai/Tolak/Urungkan/Catat manual tanpa batas laju (admin, wajar). |
| Bocor galat | Lulus | `failure()` hanya mengirim pesan `ServiceError`; galat lain kalimat umum 503. Nama migrasi hanya ke pemegang akses. |
| Cache | Lulus | `no-store` di semua jawaban API dan unduhan; semua halaman `force-dynamic`. |
| PIN GA | Lulus dengan F5-05 | scrypt + garam 16 byte + rahasia server, `timingSafeEqual`, tidak pernah dikirim; satu kalimat untuk semua salah. **Tanpa `RATE_LIMIT_SECRET` (≥ 32 huruf): setiap klaim, kiriman rapat, simpan push, dan cek/simpan PIN menjawab 503 "Perlindungan formulir belum tersedia…"** (bukan terbuka). **Mengganti rahasia itu membuat PIN lama tidak cocok lagi** tanpa pemberitahuan: pengelola harus menyimpan PIN baru. |
| Cookie `coffee_atur` | Lulus | Penanda tampilan saja (path `/coffee`, lax, tanpa `secure`), tidak dipercaya untuk hak. |
| Cookie `coffee_ga_tamu` | Lulus dengan F5-06 | Hanya "1", path `/`, lax, bisa ditulis JS (memang harus). Dihapus/dipalsukan tamu? Menghapusnya butuh alat pengembang atau hapus data situs (yang juga menghapus sesi → halaman masuk, tanpa data). Dipalsukan untuk mengunci GA: tablet terbuka di sampul; jalan pulih = PIN GA (atau pertanyaan bila PIN belum diatur); lupa PIN = pengelola menyimpan PIN baru. Cookie hanya menjaga `/coffee/ga`: **alamat lain (`/coffee`, `/admin/coffee`) tetap terbuka bagi siapa pun yang memegang tablet dan bisa mengetik alamat**, jadi tablet harus dipasang sebagai aplikasi + layar disematkan (daftar rilis). |
| dev-preview | Lulus | Keenam `page.tsx` di `src/app/dev-preview/coffee/**` (termasuk `nyata`, `nyata/admin`, `nyata/ga`) memanggil `notFound()` bila `NODE_ENV === "production"`; komponen pratinjau hanya dirender dari halaman itu. Tidak diuji di build produksi (dilarang build). |
| Rahasia / data asli | Lulus | Tidak ada kunci, token, nomor telepon, atau nama asli di contoh/fixture ("… (contoh)", "Contoh …"). Foto: gambar AI ≤ 17 KB. Lihat F5-13. |
| Kode klien | Lulus | Tidak ada `createPrivilegedClient` atau `server-only` di komponen; tidak ada `dangerouslySetInnerHTML`. |

## C. Dua migrasi sebagai satu rilis

- **Urutan:** `202612010001_coffee.sql` lalu `202612010002_coffee_push.sql` (FK ke `coffee_orders`). Terbalik → gagal bersih.
- **Dijalankan ulang:** keduanya aman (`if not exists`, `create or replace function`, `on conflict do nothing`, batasan
  `drop … if exists` lalu `add`). Karena `create table if not exists`, versi lama tabel tidak akan diperbarui; tidak
  relevan selama belum pernah dijalankan.
- **Tabel yang ada:** `employees` hanya dirujuk (FK tanpa `on delete` pada pemesan/PIC: karyawan yang punya pesanan
  tidak bisa dihapus, sejalan dengan pesan 409 yang sudah ada). Kolom yang dibaca fungsi (`full_name`, `position`,
  `business_unit`, `category`, `active`) ada di migrasi main. `admin_grants`: batasan diganti dengan daftar main + `'coffee'`
  (cocok, lihat F5-14); `add constraint` gagal hanya bila ada baris berisi aplikasi di luar daftar (tidak mungkin dengan
  batasan sekarang).
- **Bacaan SQL migrasi 1 (ulang, penuh):** tidak ditemukan salah sintaks, nama variabel PL/pgSQL yang bertabrakan dengan
  kolom, atau tanda tangan `revoke/grant` yang tidak cocok. Tetap hanya bacaan.
- **Hanya aplikasi yang dideploy, migrasi belum:**
  - `/coffee`, `/coffee/pesanan`, `/coffee/ga`: layar "Werkudara Coffee belum dibuka" (503 dari `myState`/`gaState`;
    nama migrasi hanya untuk pemegang akses, yang belum ada). Halaman masuk tetap berfungsi (sesi bersama).
  - Semua API Coffee: 503 "Werkudara Coffee menunggu migrasi 202612010001_coffee.sql." (tes penjaga yang ada).
  - `/admin/coffee*`: bingkai + pemberitahuan menunggu migrasi; hanya super admin yang bisa membukanya.
  - Push: `pushInfo` → "belum tersedia"; tidak ada yang dijadwalkan atau gagal.
  - **Aplikasi lain tidak terpengaruh:** kartu "Werkudara Coffee" muncul di beranda admin (super admin) tanpa angka
    (`coffeeWaitingCount().catch(() => null)`), satu permintaan gagal yang ditelan per muat beranda. `routes.ts`,
    `next.config.ts` (dua redirect `/coffee/hr`, satu header untuk `/coffee/sw.js`), `EventList.tsx` (satu baris) hanya menambah.
  - **Akses admin:** kotak "Werkudara Coffee" sudah tampil. Dicentang sebelum migrasi → batasan lama menolak (23514) →
    super admin membaca 503 "Akses Werkudara Coffee menunggu migrasi 202612010001_coffee.sql. Sampai itu, hanya super
    admin yang bisa membukanya." dan **tidak ada yang tersimpan** (centang lain pada simpan yang sama ikut batal). Bila
    orangnya sudah memegang Kuesioner/Wellbeing/WAM/WG People, kalimatnya menyebut migrasi yang salah: **F5-02**.
- **Hanya migrasi 1 yang jalan:** semuanya berfungsi tanpa push ("belum tersedia" / nama migrasi 2 untuk pengelola).

## D. Kesiapan merge

- `git fetch guest-experience main` → `a123aa03`, **sama dengan dasar cabang** (`git merge-base` = `a123aa03`): main
  tidak punya commit baru sejak cabang dibuat. Merge = fast-forward 11 commit.
- `git merge-tree --write-tree HEAD guest-experience/main` → keluar 0, **tanpa konflik**.
- Berkas bersama yang diubah cabang ini (tidak ada perubahan tandingan di main): `src/lib/routes.ts` (+95),
  `src/lib/admin-access.ts` (+8/−2), `next.config.ts` (+6), `src/lib/server/standalone-apps.ts` (+15/−3),
  `src/lib/server/admin-actor.ts` (+3/−1), `src/components/admin/events/EventList.tsx` (+1), tes `routes.test.ts`,
  `admin-access.test.ts`, `short-code.test.ts`. `src/proxy.ts` dan `package.json` tidak disentuh (tanpa dependensi baru).
- `main` lokal (`d134eaf3`) tertinggal dari remote dan tidak punya commit yang belum di-push.
- **Ulangi `git fetch` tepat sebelum push:** sesi lain biasa mendorong langsung ke main; cabang lain (mis.
  `feat/main-wam`) juga menyentuh `routes.ts` dan `admin-access.ts`.

## E. Gerbang mutu

| Perintah | Hasil |
| --- | --- |
| `npx vitest run` | 493 berkas, 4387 lulus, 2 dilewati, 0 gagal |
| `npx tsc --noEmit -p .` | 0 galat |
| `npx eslint <9 folder Coffee>` | 0 galat, 0 peringatan |

## F. QA browser

**Muat ulang terus-menerus (laporan F4): tidak terulang.** Yang diperiksa pada server baru di port 3220 dan tab baru:
`curl` tanpa cookie dan dengan `coffee_ga_tamu=1; coffee_atur=1` → 200 tanpa `Location`/`Set-Cookie`/pengalihan (hanya
`/coffee` asli tanpa sesi yang memuat `meta refresh` ke halaman masuk, memang begitu); di browser `document.cookie`
kosong, **tidak ada service worker terdaftar** di `localhost:3220`, `localStorage`/`sessionStorage` kosong;
`performance.timeOrigin` tetap sama selama pengamatan dan halaman berumur > 8 detik tanpa dimuat ulang; log server dev
tanpa galat. Satu hal yang tercatat: saat pertama dibuka panel melaporkan ukuran layar **0×0** (panel tersembunyi);
setelah ukuran layar diatur, semuanya normal. Penyebab kejadian di F4 **tidak ditemukan** (bukan cookie, bukan SW, bukan
pengalihan); dugaan tersisa: keadaan panel/HMR pada server lama. Playwright tidak diperlukan.

| Layar | Ukuran | Yang dilakukan | Hasil |
| --- | --- | --- | --- |
| Karyawan `/nyata` | 375×812, 320×640 | Menu; lembar Akun dengan `?notif=` (bawaan, on, denied, ios-install, unsupported, not-ready), `?akses=1`; Nyalakan → Kirim tes → Matikan; Atur sekali (bawaan, denied, ios-install + iphone, not-ready); Café Latte → Ajukan (dua klik) → satu klaim K-418 → "Pengelola: Selesai" → pesan "Silakan ambil di mesin" | `scrollWidth` = lebar layar; target Tutup 44×44, lainnya ≥ 48; konsol bersih. Catatan F5-10 (b), (c). |
| Admin `/nyata/admin` | 1440×900, 768×1024, 375×812 | Antrean dengan `?notif=` (bawaan, on→Matikan, account, not-ready, denied); Rekap dan Pengaturan dibuka (tautan unduh membawa filter; kolom PIN `password` + `numeric`) | Tidak ada geser ke samping (1425/1440 = bilah gulir); tombol baris notifikasi 44–48 px; konsol bersih. Target < 44 px yang terukur hanya milik `ConsoleShell` (menu konsol bersama, di luar Coffee). F5-09, F5-10 (a). |
| Tablet `/nyata/ga` | 1280×800, 1024×768, 768×1024 | Bilah atas (bawaan, on, denied → pesan); Nyalakan; Pesanan baru → ruangan + PIC → Serahkan ke tamu → DOM hanya buku ("Mode GA", "Ketuk untuk membuka"), tanpa bilah atas; muat ulang paksa → tetap buku, HTML server tanpa nama PIC/instansi; PIN 9999 → "PIN tidak cocok. Coba lagi."; 1234 → kembali ke Input cepat; cookie dan simpanan terhapus | Tidak ada target < 48 px; tombol PIN 104×64; `scrollWidth` = lebar; konsol hanya memuat peringatan browser soal `beforeunload` tanpa gestur (akibat klik skrip). F5-09. |

Tidak diulang di browser (sudah diaudit F1–F3 dan dijaga tes): Tolak, Urungkan, Catat manual, 409, Tambah lagi, jaringan
putus. Urutan Tab papan ketik tidak diperiksa ulang.

## G. Sapuan kata

- `grep` di kode Coffee non-prototipe, non-tes: **tidak ada** "HR membelikan", "membelikan", "WhatsApp"/"WA", "gratis".
- "Anda" hanya di buku menu tamu (`GuestBook.tsx`); "kamu" di aplikasi karyawan dan di kalimat notifikasi; admin
  memakai "kamu" juga ("Kamu masuk sebagai Dewi"), konsisten. Tablet GA tidak menyapa.
- "Contoh" / "(contoh)" hanya di `sample.ts`, `pushSample.ts`, `fixtures.ts`, `fake-db.ts`, tes, dan prototipe.
- Tidak ditemukan sisa bahasa Inggris di teks layar; alamat tulisan tangan dijaga `routes.test.ts` (lulus).
- Satu catatan kata: F5-10 (c).

## Temuan lama: contoh "Diperbaiki" yang dicek ulang, dan semua "Ditunda"

**Dicek ulang dan memang beres** (kode sekarang): S-3 (dua `if`), S-4 (indeks `coffee_orders_processed`), Q-1
(`missing()` hanya kode), L-1 (`limitCoffeePerson` + 300), B-3 (kalimat batal), S-1 (data putaran pertama disalin di
SQL), F2-04 (header `Service-Worker-Allowed`, `curl`), F2-05 (tanpa `orientation`), F2-08 (`safeCoffeeNext`), F3-01
(muat ulang → buku menu, browser), F3-04 (PIN, browser), F1-03/F1-05/F1-06 (768 dan 375 bersih, target ≥ 44).
**Tidak ada yang perlu dibuka lagi.**

| Ditunda / belum | Wajib sebelum produksi dipakai orang? |
| --- | --- |
| **SQL belum pernah dijalankan + uji balapan jatah** (semua audit) | **Ya.** Jalankan kedua berkas di Postgres uji dan uji 20 permintaan serentak sebelum migrasi produksi. |
| A-1: siapa "GA" (`dw` + Admin Booking + pemegang akses boleh Mode GA, pesanan tim tanpa jatah, daftar karyawan) | **Ya, keputusan pemilik** sebelum `/coffee/ga` diumumkan. |
| S-7: cek `admin_grants_apps_check` | **Ya**, saat menjalankan migrasi 1 (daftar rilis langkah 2). |
| Halaman asli dengan sesi tidak pernah dibuka; push tidak pernah terkirim; perangkat asli | **Ya**, langkah uji di daftar rilis. |
| F2-10 ("Siap diambil" hanya hari yang sama), tiga keputusan terbuka F4 (netral di mode tamu, PIC ke `/coffee`, batal tidak menarik notifikasi) | Perlu persetujuan pemilik; tidak menahan. |
| S-5 (jam aplikasi vs database), B-4 (catat manual untuk yang sudah nonaktif), R-2 (sel angka di Detail), R-3 (`limit(5000)`), Q-2, F1-22, F1-24, F2-13 (sisa), F2-20, F3-15, F3-17 (b,c), F3-20 | Tidak. Boleh setelah rilis. R-2 sebaiknya ditanyakan ke HR saat rekap pertama. |

## H. Serah terima ke pemilik

### Daftar rilis (urut)

0. **Sebelum push:** `git fetch guest-experience main`; pastikan masih fast-forward (atau merge dan jalankan ulang tiga
   gerbang). Push. Setelah deploy, tanpa migrasi: `/coffee` menampilkan "belum dibuka", aplikasi lain normal. Jangan
   mencentang Werkudara Coffee di Akses admin dulu (akan ditolak; lihat F5-02 untuk kalimatnya).
1. **Uji SQL di database uji** (belum pernah dijalankan): jalankan `202612010001_coffee.sql` lalu
   `202612010002_coffee_push.sql` pada salinan yang punya `employees` dan `admin_grants`; uji balapan jatah (20 klaim
   serentak untuk satu orang bersisa 1 → tepat 1 berhasil), Tambah lagi (`T-xxxx-2`), Urungkan klaim ditolak saat jatah penuh.
2. **Produksi, cek batasan:** `select pg_get_constraintdef(oid) from pg_constraint where conname = 'admin_grants_apps_check';`
   harus berisi tepat `acara, friday_sharing, your_visit, wam, kuesioner, tv, wellbeing, wam_acara, hr`. Bila ada yang lain,
   berhenti dan tambahkan ke baris 389 migrasi 1 dulu.
3. **Jalankan migrasi 1** (`202612010001_coffee.sql`). Cek: `/admin/coffee` terbuka untuk super admin (antrean kosong),
   `/coffee` menampilkan menu, Pengaturan menampilkan jatah 4/2/2.
4. **Perbaikan F5-01 sudah masuk?** Baru sesudah itu **jalankan migrasi 2** (`202612010002_coffee_push.sql`).
5. **Lingkungan server:** `WAM_VAPID_PUBLIC_KEY`, `WAM_VAPID_PRIVATE_KEY` (sudah dipakai WAM; `WAM_VAPID_SUBJECT`
   opsional), `RATE_LIMIT_SECRET` (≥ 32 huruf; **jangan diganti setelah PIN diatur**, kalau diganti simpan PIN baru).
6. **Akses:** Super admin → Akses admin → centang **Werkudara Coffee** untuk tiap pengelola (HR/admin). Mereka masuk
   admin dengan **akun karyawan** sendiri (super admin tidak bisa menerima notifikasi). Pemegang akses otomatis bisa Mode GA.
7. **PIN GA:** `/admin/coffee` → Pengaturan → PIN GA (4 angka) → beri tahu petugas GA.
8. **Tablet GA:** masuk dengan akun petugas, buka `/coffee/ga`, **pasang ke layar utama dan sematkan layar (screen
   pinning)**: mode tamu hanya menjaga halaman tablet, bukan bilah alamat browser.
9. **Uji dengan sesi asli** (belum pernah dilakukan): masuk → kembali ke tujuan; ajukan klaim di HP → muncul di antrean
   ≤ 10 dtk; Selesai / Tolak → berubah di HP ≤ 15 dtk; Batalkan; Keluar di HP (layar "Kamu sudah keluar"); karyawan
   biasa membuka `/coffee/ga` → kembali ke `/coffee` dengan pesan; Catat manual + Batalkan catatan; Rekap + unduh CSV
   dan Excel (buka di Excel, cek 23 kolom); dua pengelola menekan Selesai bersamaan → satu menang.
10. **Uji push di perangkat asli:** delapan langkah di "Catatan pelaksanaan F4" (`RENCANA-PENERAPAN.md`), ditambah:
    (a) admin di browser yang belum pernah membuka `/coffee`: apakah "Nyalakan notifikasi" berhasil pada tekan pertama
    (F5-03); (b) **mode tamu: ketuk notifikasi "Ada pembaruan pesanan." saat notifikasi itu berasal dari klaim pribadi
    petugas atau dari klaim baru → tablet harus tetap di buku menu** (F5-01).
11. **Keputusan pemilik:** siapa GA (A-1), batas "Siap diambil" (F2-10), tiga keputusan terbuka F4.
12. Baru setelah itu bagikan `/coffee` ke karyawan.

### Catatan rollback

- **Kode:** cabang ini hanya menambah; `git revert` rentang `a123aa03..1035e910` (atau deploy ulang commit main
  sebelumnya) aman kapan saja. Tabel yang sudah dibuat tidak mengganggu kode lama. Bila ada orang yang sudah diberi
  akses `coffee`, kode lama membuang nilai yang tidak dikenalnya saat membaca (`tidyGrant`; **perlu dicek** sekali di
  Akses admin setelah revert) dan batasan baru tetap menerima simpanan lama.
- **Mematikan push saja:** tidak perlu rollback; cukup `drop table coffee_push_sent, coffee_push_subscriptions`
  (aplikasi kembali ke "belum tersedia", polling tetap jalan). Jangan mengosongkan `WAM_VAPID_*`: WAM memakainya.
- **Migrasi 2:** `drop table public.coffee_push_sent; drop table public.coffee_push_subscriptions;`
- **Migrasi 1** (data pesanan hilang; ekspor Rekap dulu): urutan di kepala berkas: empat `drop function`, `drop table
  coffee_order_items, coffee_orders, coffee_settings`, dua `drop sequence`, `update admin_grants set apps =
  array_remove(apps, 'coffee')`, lalu pasang lagi batasan `202611200703` tanpa `'coffee'`. Migrasi 2 harus di-drop lebih
  dulu (FK ke `coffee_orders`).
- **Tablet terkunci di buku menu:** PIN GA; lupa → pengelola menyimpan PIN baru; 10 PIN salah → tunggu 10 menit (F5-05).

## Templat §5 (seluruh aplikasi)

| Sisi | Hasil | Bukti |
| --- | --- | --- |
| Keamanan | Lulus di server; **gagal di satu jalur layar tamu (F5-01)**; catatan F5-04, F5-05, F5-07 | bagian A dan B |
| Data dan jatah | Lulus menurut bacaan dan tes tiruan; **tidak diuji di Postgres** | bagian C |
| UX vs prototipe | Lulus; kontrol push baru rapi di semua lebar; catatan F5-10 | bagian F |
| Rasa aplikasi | Lulus | bagian F |
| A11y | Lulus dengan F5-09; pembaca layar tidak diuji | bagian F |
| HP dan tablet | Lulus 320/375/768/1024/1280/1440 (layar tiruan) | bagian F |
| Tes | Lulus penuh | bagian E |
| Kode vs konvensi | Lulus; F5-08, F5-13 | bagian D, G |
| Sesi asli, perangkat, push sungguhan, SQL | **Tidak diuji** | "Yang tidak diuji" |

## Putusan

**Boleh di-push ke `main` dengan kedua migrasi belum dijalankan: YA**, dengan syarat:

1. `git fetch` diulang tepat sebelum push dan hasilnya masih fast-forward dari `a123aa03` (bila main sudah maju: merge,
   lalu jalankan ulang vitest, tsc, eslint).
2. `/coffee` **belum diumumkan** dan tidak ada yang mencentang akses Coffee sampai migrasi 1 jalan. Selama itu fitur
   ini mati dengan rapi: semua halaman "belum dibuka / menunggu migrasi", semua API 503, aplikasi lain tidak berubah
   selain satu kartu dan satu kotak centang baru di admin.
3. Disarankan (tidak wajib) ikut dalam push yang sama: **F5-02** (kalimat migrasi yang benar), karena hanya berguna di
   jendela sebelum migrasi.

**Belum boleh:** menjalankan migrasi di produksi sebelum SQL diuji di database uji (belum pernah dijalankan sama
sekali); menjalankan migrasi 2 atau memakai tablet dengan tamu sebelum **F5-01** diperbaiki; mengumumkan ke karyawan
sebelum langkah 9–11 daftar rilis.

Urutan perbaikan: F5-01 → F5-02 → F5-03 (cek di Chrome asli) → F5-04 → F5-05 → F5-08 → F5-06, F5-07, F5-09, F5-10 →
dokumen (F5-12).
