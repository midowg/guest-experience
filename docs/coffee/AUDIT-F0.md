# Audit F0 Werkudara Coffee (fondasi) — 25 Nov 2026

Peninjau independen (bukan penulis F0). Yang ditinjau: commit `5cf95e28` di cabang `feat/werkudara-coffee`.
Tidak ada kode yang diubah oleh peninjau. Kolom **Status** diisi sesudahnya oleh agen perbaikan (commit
`fix(coffee): temuan audit fondasi …`); lihat juga "Sesudah perbaikan" di akhir berkas.

## Cara meninjau (apa adanya)

- **SQL hanya dibaca.** `psql` tidak terpasang, Docker terpasang tetapi daemon-nya mati, tidak ada Postgres tertanam
  di `node_modules`. Migrasi `202612010001_coffee.sql` **tetap belum pernah dijalankan di Postgres mana pun**. Database
  remote dan `.env` tidak disentuh.
- Dijalankan: `npx vitest run src/lib/coffee src/lib/server/coffee src/app/api/coffee src/app/api/admin/coffee`
  → **15 berkas, 92 tes, semua lulus**. `npx eslint` pada empat folder itu dan `npx tsc --noEmit` → bersih.
- Satu skrip percobaan di luar repo (vite-node, scratchpad) dipakai untuk memastikan perilaku zod (temuan V-1).
- Tidak diuji: browser, balapan jatah sungguhan, PostgREST sungguhan (batas baris, embed, kode galat).

## Temuan

Tingkat: Kritis / Tinggi / Sedang / Rendah. "perlu dicek" = belum bisa dipastikan dari kode saja.

| ID | Tingkat | Berkas:baris | Yang salah | Skenario gagal | Saran perbaikan | Status (25 Nov, setelah perbaikan) |
| --- | --- | --- | --- | --- | --- | --- |
| B-1 | Tinggi | `supabase/migrations/202612010001_coffee.sql:255`, `src/lib/server/coffee/queue.ts:77-99`, `claims.ts:63` | Catat manual tidak bisa dikoreksi sama sekali. `coffee_reopen` menolak `manual`, Selesai/Tolak hanya untuk `diproses`, Batal hanya milik pemesan dan `diproses`. Tidak ada hapus/batal untuk pengelola. | Pengelola salah pilih orang (atau salah bulan) di Catat manual klaim. Baris langsung `selesai`: satu jatah orang itu hilang sebulan dan rekap salah; hanya bisa dibetulkan lewat SQL. | Izinkan pencatatnya membatalkan catatan manual (mis. `coffee_reopen` versi manual → status `batal`, dalam jendela yang sama atau sampai akhir hari), atau aksi "Batalkan catatan" khusus pengelola. Perlu keputusan pemilik. | Diperbaiki. Keputusan PM: pengelola mana pun boleh **Batalkan catatan** (hanya catatan manual, lewat konfirmasi). `coffee_cancel_manual` di migrasi yang sama: status `batal`, `processed_*` = siapa dan kapan membatalkan (`created_*` tetap pencatatnya), jatah bebas lagi, di Rekap tertulis "Dibatalkan". Route `POST …/orders/[id]/batalkan`, tombol di "Baru diproses" dan Rekap → Detail. |
| V-1 | Sedang | `src/lib/coffee/schemas.ts:75,101` | `manualSchema.superRefine` memanggil `manualAt()` walau `date`/`time` sudah gagal regex; `new Date(...).toISOString()` melempar `RangeError`. `safeParse` ikut melempar, `handle()` menjawab **503** "Layanan belum dapat memproses…" tanpa `fieldErrors`. Sudah dibuktikan: `time: "aa:bb"` dan `date: "2026-13-45"` → `RangeError: Invalid time value`. | Formulir Catat manual dikirim dengan jam kosong (`""`) → 503 umum, bukan 422 "Jam tidak dikenali." di kolomnya. | Di `superRefine`, lewati cek masa depan bila `Number.isNaN(Date.parse(...))`; atau buat `manualAt` tidak melempar. Tambah tes jam kosong dan tanggal mustahil. | Diperbaiki. Cek masa depan dilewati bila tanggal/jam bukan tanggal/jam; `isoDate` satu cek (satu pesan). 422 dengan `fieldErrors`. |
| B-2 | Sedang | `src/lib/server/coffee/queue.ts:113-123`, `schemas.ts:96` | Catat manual tamu/tim: kirim ganda tidak ditangani. `key` opsional (tanpa kunci = dua baris). Dengan kunci, dua kiriman bersamaan bertemu di indeks unik → `23505` → `coffeeError` → `databaseError` → 409 **"Slug atau ID sudah digunakan. Gunakan nilai berbeda."** (`claims.ts:52` dan `meetings.ts:43` menangani 23505; `recordManual` tidak). | Pengelola mengetuk "Simpan" dua kali pada jaringan lambat: dapat pesan soal "Slug", atau dua pesanan rapat `selesai` yang sama. | Wajibkan `key` di `manualSchema`; di `recordManual` tangani `23505` seperti `submitMeeting` (cari baris berkunci itu, kembalikan). | Diperbaiki. `key` wajib; kunci yang sama mengembalikan catatan pertama (pesan dibuat dari yang tersimpan); cabang `23505` mencari baris berkunci itu. Kunci cadangan tetap di sheet diganti kunci acak. |
| S-1 | Sedang | `202612010001_coffee.sql:193-201`, `src/lib/server/coffee/meetings.ts:33-36` | "Tambah lagi": fungsi hanya mengambil `number` dari induk. PIC, ruangan, tamu, jumlah tamu **dipercaya dari klien** untuk tiap putaran; status dan tanggal induk tidak dicek. | (a) Putaran 2 dikirim dengan `picId`/`room` lain → satu nomor `T-0113` tercatat atas dua PIC/ruangan. (b) `parentId` pesanan bulan lalu atau yang ditolak → `T-0113-2` muncul sebulan kemudian. | Di `coffee_submit_meeting`, bila `parent_id` terisi salin `employee_id`, `room`, `room_spot`, `guest`, `guest_count` dari baris akar dan abaikan kiriman klien; tolak (`COFFEE_INVALID`) bila akar bukan hari WIB yang sama. | Diperbaiki. Dengan `parent_id`, PIC, ruangan, titik, tamu, jumlah tamu disalin dari putaran pertama; kiriman klien tidak dibaca. Ditolak (`COFFEE_PARENT_CLOSED`, 409) bila putaran pertama bukan hari ini (WIB), ditolak/batal, atau catatan manual. |
| R-1 | Sedang | `src/lib/coffee/recap.ts:99-105`, `src/lib/server/coffee/recap.ts:25` | "Tamu (orang)" per PIC memakai `guestCount` dari **baris pertama yang ditemui** per rapat. Baris datang terbaru dulu, jadi yang dipakai putaran terakhir. | `T-0113` (5 tamu) lalu "Tambah lagi" tanpa jumlah tamu → ringkasan PIC mencatat **0 tamu**. Fixture tes memberi 5 pada kedua putaran, jadi tidak tertangkap. | Ambil nilai terbesar per rapat (atau nilai putaran 1); lebih baik lagi diselesaikan di sumbernya lewat S-1. Tambah tes putaran 2 tanpa `guestCount`. | Diperbaiki. Tamu per rapat = nilai terbesar di antara putarannya; fixture putaran berbeda. |
| A-1 | Sedang (keputusan) | `src/lib/coffee/access.ts:9-11`, `src/lib/server/coffee/session.ts:33,43-47`, `meetings.ts:17-28` | Mode GA terbuka untuk **semua** kategori `dw`, peran `ga` (Admin Booking), dan pemegang grant. Siapa pun di antaranya bisa memesan "Tim · rapat" tanpa batas untuk siapa saja, termasuk dirinya, dan membaca direktori karyawan aktif (id, nama, jabatan, BU). Sesuai anggapan 1 di rencana, belum dijawab pemilik. | Seorang DW dengan jatah 2 mengirim pesanan rapat berisi satu baris tim atas namanya sendiri setiap hari: jatah tidak pernah berkurang. | Pastikan dengan pemilik apakah `dw` = tim GA. Bila tidak, sempitkan ke peran/daftar khusus. Minimal: tandai di antrean bila pengirim = orang di baris tim. | Ditunda: menunggu keputusan pemilik (siapa GA). |
| L-1 | Sedang | `src/app/api/coffee/claims/route.ts:13`, `ga/meetings/route.ts:13`, `src/lib/server/http.ts:78-86` | Batas laju dihitung **per IP publik** (di luar Vercel: satu kunci untuk semua). Aplikasi ini dipakai seisi kantor dari satu Wi-Fi/NAT: 30 klaim per 10 menit untuk seluruh kantor. Mengikuti pola repo (`hr-absen` juga 30), tetapi di sini bebannya serentak. | Senin 08.00, 40 orang mengajukan kopi dalam 10 menit dari Wi-Fi kantor: orang ke-31 mendapat 429 "Tunggu sepuluh menit". | Tambah batas per orang (`coffee-klaim:${member.id}`, mis. 20) dan naikkan batas per IP (mis. 300), seperti `admin-login` yang memakai dua kunci. | Diperbaiki. Batas per orang (`limitCoffeePerson`: klaim 20, rapat 60 per 10 menit) + batas per alamat dinaikkan ke 300. |
| S-2 | Rendah | `202612010001_coffee.sql:124-127,138-141,184-187`, `claims.ts:53-54`, `meetings.ts:43` | Kunci idempoten dicari global: tidak diikat ke orang, jenis, atau isi. Kunci yang cocok mengembalikan baris itu apa pun pemiliknya/statusnya. Tidak bocor untuk klaim (`answer()` hanya melihat milik sendiri → 404), tetapi: kunci klaim lama yang sudah `batal` dikembalikan sebagai "Pengajuan terkirim."; Catat manual dengan kunci lama mengembalikan pesanan lama dengan pesan berisi minuman baru (`queue.ts:124-129`). | Klien (F2) memakai ulang kunci setelah batal → pengguna melihat sukses padahal yang kembali klaim yang dibatalkan. | Di SQL cocokkan juga `employee_id` dan `kind`; bila baris berkunci itu `batal`/`ditolak`, jawab galat khusus. F2: kunci baru tiap kali sheet dibuka. | Diperbaiki. Kunci dicocokkan dengan jenis, orang (klaim), dan manual/bukan; kunci milik baris `ditolak`/`batal` atau milik kiriman lain → `COFFEE_KEY_REUSED` (409). |
| S-3 | Rendah (perlu dicek) | `202612010001_coffee.sql:188` | `jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) …`: SQL tidak menjamin urutan evaluasi `OR`. Bila bagian kedua dihitung untuk non-array, Postgres melempar 22023, bukan `COFFEE_INVALID`. | `p_items` berupa objek → 503 umum, bukan 422. Dari aplikasi tidak terjadi (zod menjamin array). | Pisah jadi dua `if`. | Diperbaiki. Dua `if` terpisah. |
| S-4 | Rendah | `202612010001_coffee.sql:75-78`, `queue.ts:47-48` | Tidak ada indeks untuk `processed_at`. `queue()` (dipolling tiap 10 detik per pengelola) mengurutkan semua baris `selesai`/`ditolak` menurut `processed_at` dan menghitung hari ini. | Setelah setahun, tiap polling memindai seluruh tabel. Lambat laun, bukan salah hasil. | `create index coffee_orders_processed on coffee_orders (processed_at desc) where status in ('selesai','ditolak')`. | Diperbaiki. Indeks `coffee_orders_processed`. |
| S-5 | Rendah | `queue.ts:79` vs `202612010001_coffee.sql:258` | `processed_at` Selesai/Tolak diisi jam server aplikasi; jendela Urungkan dibandingkan dengan `now()` database. | Jam berbeda beberapa detik → `undoable` di layar dan keputusan database tidak sepakat di tepi 5 menit (tombol ada, jawaban 409). | Biarkan database yang mengisi (`processed_at` lewat RPC kecil atau default), atau terima selisihnya dan sebut di dokumen. | Ditunda (F5): perlu RPC baru untuk Selesai/Tolak; selisih jam server aplikasi vs database hanya terasa di tepi 5 menit (tombol ada, jawaban 409). **26 Nov, uji PGlite:** jendela memang dihitung dari `now()` database terhadap `processed_at` kiriman aplikasi (295 detik diterima, 301 detik ditolak); tidak diubah. |
| S-6 | Rendah | `202612010001_coffee.sql:91-99,72` | Aturan yang hanya dijaga zod: slug harus ada di menu, `lainnya` hanya untuk manual, klaim tepat satu item `qty 1`, item rapat hanya `tamu`/`tim`. Tabel hanya ditulis `service_role`, jadi bukan lubang, tetapi tidak ada lapis kedua. | Kode server lain kelak memanggil fungsi tanpa zod → `lainnya` masuk klaim biasa. | Di `coffee_submit_claim`: `if not is_manual and p_item->>'slug' = 'lainnya' then raise 'COFFEE_INVALID'`. | Diperbaiki sebagian: `lainnya` ditolak fungsi untuk klaim bukan manual. Aturan lain (slug harus ada di menu, bentuk item) tetap hanya di zod. |
| S-7 | Rendah (cek sebelum dijalankan) | `202612010001_coffee.sql:290-292` | Daftar `admin_grants_apps_check` ditulis tangan. **Sudah dicek: nama batasan dan isinya cocok dengan `202611200703` + `'coffee'`, dan tidak ada cabang lokal lain yang mengubahnya sesudah itu.** Risiko tersisa: bila sebelum migrasi ini dijalankan ada migrasi lain yang menambah aplikasi admin, daftar ini menghapusnya dari batasan (atau gagal bila sudah ada baris yang memakainya; seluruh migrasi batal karena satu transaksi). | Cabang lain menambah `'x'` dan dijalankan dulu → migrasi Coffee gagal di baris 291. | Sebelum menjalankan: `select pg_get_constraintdef(oid) from pg_constraint where conname = 'admin_grants_apps_check'` dan bandingkan. | Ditunda: dicek pemilik saat menjalankan migrasi (perintah di kolom saran). **26 Nov, uji PGlite:** di atas migrasi `202611200703` yang asli, batasan sesudah migrasi = daftar lama + `'coffee'`; `coffee` diterima, nama asal tetap ditolak. Cek di produksi tetap wajib (GO-LIVE langkah 2). |
| B-3 | Rendah | `queue.ts:82-85` | Selesai/Tolak pada pesanan yang **dibatalkan pemesannya** menjawab "Pesanan ini sudah diproses orang lain." | Karyawan membatalkan klaim sementara pengelola membeli; pengelola menekan Selesai dan diberi tahu "diproses orang lain", padahal dibatalkan (dan minuman sudah dibeli). | Baca status baris: `batal` → "Pengajuan ini sudah dibatalkan pemesannya." | Diperbaiki. "Pengajuan ini sudah dibatalkan pemesannya. Antrean diperbarui." |
| B-4 | Rendah | `202612010001_coffee.sql:129-131` | Catat manual memakai cek `e.active` yang sama. | Karyawan keluar tanggal 20, klaim WhatsApp-nya tanggal 5 belum dicatat → tidak bisa dicatat lagi (422). | Untuk `p_manual`, izinkan karyawan tidak aktif; atau terima sebagai batasan dan tulis di dokumen. | Ditunda: pemilih nama hanya menawarkan karyawan aktif, jadi mengubah SQL saja tidak berguna; diterima sebagai batasan sampai ada keputusan. |
| R-2 | Rendah | `src/lib/coffee/recap.ts:49-54`, `src/lib/server/coffee/recap.ts:43-47` | Lembar Detail: semua sel teks. "Jumlah tamu" dan "Klaim ke-" tidak bisa dijumlah, "Tanggal" (`25/11/2026`) terurut sebagai teks; "Jumlah tamu" berulang di tiap baris minuman tamu; "Jam diproses" tanpa tanggal. | HR menjumlah kolom Jumlah tamu di Excel → 5 tamu × 5 minuman = 25. | Di .xlsx kirim angka sebagai `number`; tulis jumlah tamu hanya di baris pertama rapat atau jelaskan di kepala kolom; tambah tanggal diproses bila berbeda hari. | Ditunda (F5): mengubah bentuk lembar Detail (sel angka, jumlah tamu sekali per rapat) perlu persetujuan HR atas kolomnya. |
| R-3 | Rendah (perlu dicek) | `queue.ts:48,65`, `people.ts:13` | `.limit(5000)` dan `.limit(2000)`: PostgREST Supabase bawaannya memotong di 1000 baris. | Lebih dari 1000 pesanan diproses dalam sehari (tidak realistis sekarang) → angka "hari ini" salah diam-diam. | Pakai `select("id", { count: "exact", head: true })` untuk hitungan. | Ditunda (F5): tidak realistis sekarang (> 1000 pesanan diproses sehari). |
| A-2 | Rendah | `src/lib/server/coffee/session.ts:55-56`, `202612010001_coffee.sql:256` | Super admin (dan kata sandi bersama sebelum migrasi grant) tidak punya `employeeId`; "pemroses yang sama" hanya label "Super admin". | Dua orang memakai sesi super admin: yang satu bisa mengurungkan milik yang lain. | Terima dan catat; atau larang Urungkan lintas sesi dengan id sesi. | Diterima: sesi super admin dipakai bersama; dicatat, tidak diubah. |
| A-3 | Rendah | `src/lib/server/coffee/people.ts:26-27`, `session.ts:27-31` | `holders()` dan `holdsCoffeeGrant()` menelan galat database menjadi "tidak ada". | Database tersendat: Pengaturan menampilkan "belum ada pemegang akses"; pemegang grant ditolak Mode GA (403) tanpa alasan sebenarnya. | `holders()`: lempar galat selain "tabel belum ada". | Diperbaiki sebagian: `holders()` melempar galat selain "tabel belum ada". `holdsCoffeeGrant()` tetap menjawab "tidak" saat ragu (aman: menolak akses). Belum ada tes khusus. |
| Q-1 | Rendah | `src/lib/server/coffee/store.ts:18-19` | `missing()` menganggap galat apa pun yang pesannya memuat `coffee_` (selain 23xxx) sebagai "menunggu migrasi". | Hak akses salah (`42501 permission denied for table coffee_orders`) atau kolom salah ketik (`42703`) tampil sebagai "menunggu migrasi" padahal migrasi sudah jalan. | Batasi ke kode `42P01`, `PGRST205`, `42883`, `PGRST202`. | Diperbaiki. `missing()` hanya dari kode `42P01`, `PGRST205`, `42883`, `PGRST202`. |
| Q-2 | Rendah | `src/lib/server/coffee/fake-db.ts`, `meetings.ts:17`, `202612010001_coffee.sql:132,209,224` | Kerapian: tiruan database berada di folder produksi tanpa akhiran `.test` (pola repo: tiruan di dalam berkas tes); parameter `_member` tidak dipakai; pemetaan kategori → kelompok ditulis tiga kali di SQL (dan sekali lagi di JS). | Kategori baru ditambah → empat tempat harus diubah bersama. | Fungsi SQL kecil `coffee_group(category)`; pindahkan `fake-db.ts` ke `__tests__`/akhiran `.test-util.ts`. | Ditunda (F5): kerapian; `coffee_group()` berarti satu fungsi SQL lagi yang belum pernah dijalankan. |

## Yang diperiksa dan lulus

**SQL (dibaca baris demi baris; tidak dijalankan).** Tidak ditemukan salah sintaks: tipe, `check`, indeks parsial,
`for item, place in select value, ordinality … with ordinality`, `make_interval(secs => …)`, tanda tangan di
`revoke`/`grant` cocok dengan definisi fungsi, tidak ada nama variabel PL/pgSQL yang bertabrakan dengan nama kolom.
Nama argumen RPC di JS cocok dengan SQL. Kolom di `ORDER_COLUMNS` semuanya ada. RLS nyala tanpa policy, `revoke all`
dari `public, anon, authenticated` untuk tabel, sequence, fungsi; `grant` hanya `service_role`. Fungsi bukan
`security definer` dan memakai `set search_path = public, pg_temp`. Bulan WIB:
`to_char(at_time at time zone 'Asia/Jakarta', 'YYYY-MM')` benar. Kunci jatah: `pg_advisory_xact_lock` per orang+bulan
diambil **sebelum** hitung (pernyataan baru, jadi melihat baris yang sudah commit di READ COMMITTED), kunci idempoten
dicek lagi setelah kunci; `coffee_reopen` memakai kunci yang sama untuk klaim ditolak dan mengunci baris `for update`;
tidak ada urutan kunci yang bisa saling mengunci. Selesai/Tolak/Batal = satu `update … where status = 'diproses'`
(yang pertama menang). `on delete`: pemesan/PIC tanpa aturan (hapus karyawan ditolak, sejalan dengan pesan 409 di
`src/lib/server/employees.ts:104-107`), item cascade, `processed_by`/`created_by`/item `employee_id` set null.

**Hak akses.** Karyawan: orangnya selalu dari sesi (`claims.ts:23,47,63-64`); zod membuang kolom asing (dibuktikan:
`employeeId`, `quota`, `group` di badan klaim hilang); batal milik orang lain → 409 tanpa membocorkan. Mode GA:
`requireApiGa()` di kedua route. Pengelola: sembilan route memanggil `requireApiAdmin()` lebih dulu; grant `coffee`
ditegakkan lewat `areaOfPath` (`src/lib/admin-access.ts:89,97`) + `opensHere` (`admin-session.ts:29-30,44`); super
admin lolos; akun/karyawan nonaktif gugur di `personActor`. Semua id URL lewat `z.uuid()`. Semua tulis memakai
`checkOrigin`; unduhan memakai `sameOriginRead`. Semua jawaban `Cache-Control: no-store`. Daftar orang hanya memuat
id, nama, panggilan, jabatan, BU, kelompok (tanpa email/telepon).

**Aturan produk.** 4/2/2 per bulan WIB dari `coffee_settings`; ditolak/batal tidak dihitung; tamu atas nama dan BU
PIC tanpa jatah; Tim · rapat atas nama orangnya tanpa jatah; Urungkan 5 menit oleh pemrosesnya, cek jatah ulang;
Catat manual lewat fungsi yang sama (jatah bulan tanggalnya), paling lama awal bulan lalu; "klaim ke-n" dihitung saat
dibaca; 22 kolom termasuk Ruangan; CSV ber-BOM, `\r\n`, `csvCell` (awalan `= + - @`), .xlsx inline string tanpa `<f>`.

## Tiruan JS (`fake-db.ts`) vs SQL: yang tidak sama

1. Tidak ada cek waktu di masa depan (`at_time > now() + 5 menit` → `COFFEE_INVALID`) di klaim maupun rapat.
2. Tidak ada batas putaran (`rnd > 50`).
3. Tidak ada batasan tabel sama sekali: indeks unik `idempotency_key` dan `(kind, number, round)`, `check` panjang,
   `reject_note` 3–300, bentuk klaim, `guest_count` 1–500, `qty` 1–50, enum suhu/gula/es, `drink_other` wajib untuk
   `lainnya`, FK. Akibatnya **`23505` tidak pernah muncul**: cabang di `claims.ts:52-55` dan `meetings.ts:43-45`
   tidak pernah dijalankan tes, dan B-2 tidak terlihat.
4. Tidak ada tipe: tes mengirim `p_key: "k0"` (bukan uuid) dan lolos; di Postgres itu galat 22P02.
5. `room`, `guest`, `drink_other` tidak di-`btrim`/`nullif` seperti di SQL; label aktor tidak dipotong 120.
6. `select()` mengabaikan daftar kolom dan selalu mengembalikan semua kolom, jadi kolom salah ketik atau lupa
   diminta tidak akan ketahuan; embed `coffee_order_items(...)` tidak lewat PostgREST.
7. Urutan: dibandingkan sebagai teks dan `null` dianggap `""` (Postgres: `null` terakhir saat naik, pertama saat turun).
8. Tidak ada batas 1000 baris PostgREST; `.range` selalu penuh.
9. Tidak ada kunci, transaksi, atau `for update`: seluruh sifat balapan (inti F0) hanya ada di SQL yang belum dijalankan.
10. Urutan cek di rapat sedikit beda (tiruan mencek semua orang tim sebelum menyisipkan; SQL menyisipkan pesanan lalu
    gagal di item dan mengandalkan rollback). Hasil akhirnya sama.

Yang sama (sudah dibandingkan): pemetaan kategori, urutan idempoten → karyawan aktif → jatah, hitungan jatah
(`klaim`, bulan, `diproses`/`selesai`), manual langsung `selesai` dengan `processed_*`, nomor/putaran/akar induk,
syarat Urungkan, cek jatah ulang untuk klaim ditolak memakai `person_group` di baris.

## Tes: yang belum ada

- SQL itu sendiri (sintaks, batasan, balapan 20 permintaan untuk sisa 1). Paling penting; wajib sebelum F2 dipakai orang.
- `manualSchema` dengan jam kosong / tanggal mustahil (V-1).
- Cabang `23505` di klaim, rapat, dan Catat manual (B-2).
- Kunci yang sama dari orang lain (harus 404, tanpa bocor) dan kunci milik klaim yang sudah batal (S-2).
- "Tambah lagi" dengan PIC/ruangan lain, induk yang ditolak, induk bulan lalu (S-1); ringkasan tamu saat putaran 2
  tanpa jumlah tamu (R-1).
- Urungkan: pesanan rapat; super admin atas miliknya sendiri; catatan manual (harus ditolak); batal oleh pemesan
  setelah diurungkan.
- Selesai/Tolak pada pesanan `batal` (B-3).
- 429 pada klaim dan rapat.
- Tes penjaga admin memalsukan `requireApiAdmin` seluruhnya (`coffee-admin-guards.test.ts:15-26`): 403 "tanpa grant"
  berasal dari tiruan. Sambungan route → `ADMIN_PATH_HEADER` → `areaOfPath` → grant hanya diuji murni di
  `admin-access.test.ts:149-159`. Tambah satu tes dengan `admin-session` asli dan header jalur.
- `COFFEE_INVALID` (waktu di depan) dan pemetaan galatnya.

## Templat §5 (ringkas)

| Sisi | Hasil | Bukti |
| --- | --- | --- |
| Keamanan | Lulus, dengan catatan A-1, L-1 | Bagian "Hak akses" di atas |
| Data dan jatah | Lulus menurut bacaan; **tidak diuji di Postgres** | SQL 108-157, 243-273; S-1, S-2 |
| Tes | Lulus (92/92), ada celah | Daftar di atas |
| Kode vs konvensi | Lulus; eslint dan tsc bersih | Q-1, Q-2 |
| UX, rasa aplikasi, a11y, HP | Tidak berlaku untuk F0 (belum ada layar) | — |

## Putusan

**F0 layak jadi dasar F1, dengan syarat.** Tidak ada temuan Kritis. Hak akses, jatah, dan ekspor benar menurut kode.
Risiko terbesar bukan satu baris tertentu: **SQL belum pernah dijalankan** dan tiruan JS tidak bisa menggantikannya
(tanpa batasan, tanpa tipe, tanpa kunci). Jangan anggap jatah aman dari balapan sampai uji 20 permintaan serentak
dijalankan di database uji.

Urutan perbaikan:

1. **Sebelum pemilik menjalankan migrasi:** jalankan berkasnya di Postgres uji (kosong + tabel `employees` dan
   `admin_grants`), lalu uji balapan jatah. Sekalian masukkan perubahan SQL di bawah, supaya tidak perlu migrasi kedua:
   S-1 (salin data induk), S-3, S-4 (indeks), S-6, dan keputusan B-1.
2. **V-1** (503 pada jam/tanggal salah) dan **B-2** (kirim ganda Catat manual): keduanya langsung terasa di F1.
3. **B-1**: putuskan cara membetulkan Catat manual yang salah; F1 perlu tombolnya.
4. **L-1**: batas laju per orang, sebelum F2 dibuka untuk seisi kantor.
5. **R-1** + tes "Tambah lagi" tanpa jumlah tamu.
6. **A-1**: jawaban pemilik soal siapa GA (pertanyaan 1 di rencana).
7. Sisanya (Rendah) boleh menunggu F5: S-2, S-5, B-3, B-4, R-2, R-3, A-2, A-3, Q-1, Q-2; S-7 dicek saat menjalankan migrasi.

## Sesudah perbaikan (25 Nov 2026, agen perbaikan)

- **Tetap berlaku: SQL belum pernah dijalankan di Postgres mana pun.** Semua perubahan SQL di atas (fungsi baru
  `coffee_cancel_manual`, penyalinan data putaran pertama, aturan kunci, indeks) hanya dibaca dan ditiru di
  `fake-db.ts`. Uji di Postgres uji dan uji balapan jatah tetap wajib sebelum dipakai orang.
- Tiruan kini lebih dekat ke SQL: kunci harus uuid (22P02), waktu di depan ditolak, batas 50 putaran, teks dirapikan,
  `race = true` memunculkan `23505` di indeks unik kunci, `consume_rate_limit` benar-benar menghitung. Yang masih tidak
  ditiru: batasan tabel lain, tipe, urutan `null`, batas 1000 baris, kunci dan transaksi.
- Tes yang ditambahkan dari daftar "belum ada": jam kosong/tanggal mustahil, cabang `23505` (klaim, rapat, Catat manual),
  kunci orang lain dan kunci klaim yang sudah batal, Tambah lagi (PIC/ruangan lain, induk ditolak, induk kemarin dan
  bulan lalu), tamu saat putaran 2 tanpa jumlah, Urungkan pesanan rapat dan oleh super admin, Selesai/Tolak pada pesanan
  batal, 429 klaim dan rapat, `COFFEE_INVALID`.
- **Pembaruan 26 Nov 2026: SQL sudah dijalankan di Postgres WASM (PGlite); uji balapan sungguhan belum.** Kedua
  migrasi berjalan tanpa galat dan aman dijalankan ulang; tidak ada SQL yang perlu diperbaiki. Aturan keempat fungsi
  diuji lewat `scripts/coffee-sql-check.mjs` (325 pemeriksaan) dan hasilnya sama dengan `fake-db.ts`. Perbedaan yang
  tersisa hanya yang sudah dicatat: tiruan tidak punya batasan tabel (suhu/gula tak dikenal, catatan tolak kurang dari
  3 huruf, qty di atas 50, tamu di atas 500, `lainnya` tanpa nama → Postgres `23514`; `pic_id` bukan uuid → `22P02`),
  semuanya sudah dijaga zod sebelum sampai ke database; dan nomor rapat bisa melompat di Postgres. S-3 terbukti:
  `p_items` bukan daftar → `COFFEE_INVALID`. Belum: dua transaksi bersamaan, PostgREST, database Supabase.
- Masih belum ada: tes penjaga admin dengan `admin-session` asli dan header jalur; batal oleh pemesan
  lewat API setelah diurungkan (ditiru dengan mengubah baris).

