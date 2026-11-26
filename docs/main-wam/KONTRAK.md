# Kontrak Main WAM (fondasi)

Kontrak kerja untuk semua agen yang membangun **Main WAM**: aplikasi selama acara WAM 2026
(5–8 Jan 2027, Kota Batu) di dalam aplikasi WAM Journey (`/wam`), dengan akun yang sama, tersembunyi
sampai admin menyalakannya. Ditulis agen fondasi, 17 Nov 2026.

- Acuan produk: brief tim (§5 keputusan produk), `D:\projects\events\2027-01-werkudara-wam\aplikasi\`
  (`ANALISA_FITUR_16NOV.md` = keputusan terakhir, `SPEC_LAYAR.md` bagian revisi paling atas, prototipe).
- Aturan repo tetap berlaku: `AGENTS.md`, `docs/aturan-wam.md`, `docs/struktur-kode.md`.
- Komponen dasar, token tema, dan kerangka: `docs/main-wam/KIT.md` (agen UI KIT).
- Bila dokumen ini bertentangan dengan kode fondasi, **kode yang benar**; laporkan supaya kontrak diperbaiki.

**Aturan emas**
1. Berkas bersama hanya diubah agen fondasi: `src/lib/routes.ts`, `src/lib/main-wam/{types,settings,access,rundown,screen,home-card,modules,module-state,notify,rows,greeting,theme-image,sample}.ts`,
   `src/lib/server/main-wam/*.ts` (bukan subfolder), migrasi `20261120000x`, layout `src/app/wam/acara/**/layout.tsx`,
   `src/components/admin/wam/sections.ts`. Butuh perubahan di sana: tulis di laporanmu, jangan ubah sendiri
   (kecuali mendesak; sebutkan di laporan).
2. Setiap halaman Main WAM memanggil gate di baris pertama; setiap API juga (§3). Ada tes yang memeriksanya.
3. Semua alamat sudah ada di `routes.ts` (§5). Jangan menulis path dengan tangan.
4. Tabel baru atau kolom baru: migrasi sendiri di nomor urut areamu (§6), dengan cadangan "menunggu migrasi".

---

## 1. Peta

| Lapisan | Lokasi | Isi |
| --- | --- | --- |
| Halaman | `src/app/wam/acara/` | `layout.tsx` (tema dan `theme-color`, hanya bila Main WAM tampil untuk orangnya), `not-found.tsx`, `masuk/` (O02), `(app)/layout.tsx` (gate + kerangka), `(app)/error.tsx` (galat layar di dalam kerangka), `(app)/**` semua layar |
| API peserta | `src/app/api/wam/acara/**` | per area (§6) |
| Admin | `src/app/admin/wam2026/**`, `src/app/api/admin/wam2026/**` | Admin WAM 2026, pintu sendiri (§15) |
| Logika murni | `src/lib/main-wam/*.ts` (fondasi), `src/lib/main-wam/<area>/` (agen) | tipe, aturan, data contoh; dites vitest |
| Server | `src/lib/server/main-wam/*.ts` (fondasi), `src/lib/server/main-wam/<area>/` (agen) | `server-only`, Supabase, R2 |
| Komponen | `src/components/main-wam/{ui,theme,shell}` (UI KIT), `dev/` (fondasi), `<area>/` (agen) | |
| Admin komponen | `src/components/admin/wam-acara/` (fondasi: `sections.ts`, `WamAcaraNav`, `WamAcaraFrame`, `WamAcaraHome`, `StaffAdmin`, Pengaturan), `.../wam-acara/<isi|modul|kuis>/` (agen E, D, F) | |
| Pratinjau | `src/app/dev-preview/wam2026/<area>/` | tanpa login, 404 di produksi |
| Migrasi | `supabase/migrations/202611200001–0003_*.sql` + `tests/backend/main-wam-check.sql` | fondasi (0003 milik modul) |

## 2. Arsitektur rute

**Keputusan:** Main WAM berada di `/wam/acara/...` sebagai segmen biasa di bawah layout WAM yang sudah
ada (`src/app/wam/layout.tsx`), dengan layout sendiri:

```
src/app/wam/layout.tsx              (sudah ada) service worker, WamNavigator, manifest, tema Pra WAM
├─ (app)/...                        Pra WAM, tidak berubah (kecuali / → lihat di bawah)
└─ acara/layout.tsx                 tema Main WAM (MainWamTheme), hanya untuk yang boleh melihat Main WAM (M6)
   ├─ not-found.tsx                 404 Main WAM untuk penguji/mode semua; selain itu 404 situs biasa
   ├─ masuk/page.tsx                O02 Masuk (tanpa kerangka, tanpa gate)
   └─ (app)/layout.tsx              gate + MainWamShell (bilah atas, 4 tab + tab Panitia untuk panitia, toast); error.tsx di dalamnya
      ├─ page.tsx                   Beranda            ├─ momen/...    B
      ├─ agenda/..., saya/...       A                  ├─ kelola/...   C
      ├─ notifikasi/, mulai/        A                  ├─ ringkasan/.. C, D
      └─ absen/, silent-meeting/, awarding/  D
```

Alasan:
- **Satu origin dan satu cakupan `/wam`**: cookie sesi WAM, service worker dan PWA yang sudah terpasang,
  izin kamera (`Permissions-Policy` di `next.config.ts` hanya untuk `/wam/*`), dan `WamNavigator`
  (navigasi tanpa muat ulang + prefetch tautan `/wam/*`) langsung berlaku. Tidak ada yang dibangun ulang.
- **Bukan root layout kedua**: perpindahan antar root layout memaksa muat ulang penuh (dokumen Next 16,
  `route-groups.md`). Layout bertingkat biasa tidak.
- **Kerangka terpisah dari Pra WAM**: `(app)` Pra WAM menggambar `PraWamShell`; Main WAM menggambar
  `MainWamShell` di `acara/(app)/layout.tsx`. Tema Main WAM menimpa warna latar Pra WAM hanya selama
  Main WAM tampil (`MainWamTheme`, `body:has([data-main-wam])`).
- **Bukan Proxy**: memutuskan mode butuh baca database; Proxy hanya untuk pemeriksaan optimistis
  (dokumen Next 16 `16-proxy.md`). Keputusan dibuat di server component dan route handler.
- `acara` ditambahkan ke `reservedSlugs` kuesioner (`/wam/[slug]`), dan `/wam/acara/masuk` tidak boleh
  menjadi `next` sesudah login (`safePraWamNext`).

**`/wam` saat Main WAM menyala** (dan hanya bila super admin sudah menampilkan Main WAM di Journey, §14). Beranda Pra WAM (`src/app/wam/(app)/page.tsx`) memanggil
`redirectToMainWam()` sebelum apa pun: mode `semua` → semua orang (juga yang belum login) ke `/wam/acara`;
mode `uji` → penguji yang login ke `/wam/acara`; mode `pra` → tidak berubah. Pra WAM tetap bisa dibuka
lewat `praWamPath.homePra` (`/wam?versi=pra`) dan semua alamat Pra WAM lainnya. Karena Beranda Pra WAM
punya `loading.tsx`, pengalihan dikirim sebagai pengalihan streaming (meta refresh + RSC), sama dengan
perilaku pengalihan login yang sudah ada.

## 3. Mode, penguji, gate, modul

| Mode (`mw_settings.mode`) | `/wam` | `/wam/acara/*` |
| --- | --- | --- |
| `pra` (bawaan) | Pra WAM untuk semua | penguji: terbuka lewat alamatnya (untuk menyiapkan isi); lainnya: 404 |
| `uji` | penguji → Main WAM; lainnya Pra WAM | penguji saja; lainnya 404 |
| `semua` | semua → Main WAM | semua orang |

- **Penguji** = **Panitia WAM** (`pw_event_staff` acara WAM, §15) + daftar `mw_testers` yang dipilih admin
  (`isTester`, `src/lib/main-wam/access.ts`). Sejak 20 Nov 2026 peran `panitia` dan `admin` di `pw_roles` (milik Pra WAM)
  tidak lagi membuat seseorang penguji: panitia atau admin Pra WAM yang tahu `/wam/acara` mendapat 404 di mode
  `pra`/`uji` kecuali namanya di daftar penguji atau di Panitia WAM.
- **Belum login**: mode `semua` → `mainWamPath.login(here)`; mode lain → login Pra WAM (`praWamPath.login(here)`),
  supaya tampilan Main WAM tidak sampai ke orang yang belum tentu penguji. Kembali ke alamat persis
  (penting untuk QR absen).
- **Modul mati tidak meninggalkan jejak**: halaman modul 404, API modul 404, tidak ada kartu, aksi, atau baris.

**Fungsi gate** (`src/lib/server/main-wam/gate.ts`) — panggil di baris pertama:

| Fungsi | Untuk | Hasil |
| --- | --- | --- |
| `requireMainWamPage(here)` | setiap halaman | `{ viewer, settings }`; belum login → login; bukan untuknya → `notFound()`. `viewer.room` hanya diisi untuk `here` di bawah `/wam/acara/saya` (null di tempat lain) |
| `requireModulePage(module, here)` | halaman modul | + modul mati → `notFound()` |
| `requireActionPage(action, here)` | alat peran (panitia, BOD) dan aksi modul | + bukan perannya atau modul mati → `notFound()` |
| `requireMainWamApi()` | setiap API | 401 tanpa sesi, 404 bila Main WAM bukan untuknya |
| `requireModuleApi(module)` | API modul | + 404 bila modul mati |
| `requireActionApi(action)` | API peran/aksi | + 404 bukan perannya **atau** modul mati (satu jawaban untuk "bukan untukmu", §9 #4; audit L10) |

**Tidak ada apa pun dari Main WAM sebelum gate (audit M6).** `mainWamShown()` (gate.ts) = mode `semua`, atau
penguji yang sudah login. Hanya bila benar: `acara/layout.tsx` memasang tema (warna, KV, `theme-color`), dan
`not-found.tsx` memakai tampilan Main WAM; bila salah, layar apa adanya dan 404 situs biasa. Belum login di
mode `pra`/`uji`: `(app)/layout.tsx` tidak menggambar kerangka, layar, atau `loading.tsx`, hanya
`SignInFirst` (kit shell) yang membawa ke login WAM dengan alamat persis. KV (`mainWamApi.themeImage`)
juga mengikuti aturan ini (§5).

Layout `(app)` juga memeriksa gate (tidak menggambar kerangka untuk orang yang bukan haknya), tetapi
**bukan satu-satunya**: layout tidak dirender ulang saat navigasi (dokumen Next 16 `authentication.md`,
"Layouts and auth checks"). Tes `src/app/wam/acara/acara-pages.test.ts` gagal bila ada `page.tsx` di
`acara/(app)` tanpa `require*Page(` atau `route.ts` di `api/wam/acara` (selain `tema`) tanpa `require*Api(`.

**Peran Main WAM** (20 Nov 2026, §15): `mainWamRolesOf(peran akun, diPanitiaWam)` (`access.ts`, dipakai `viewerOf` dan
`testsMainWam`) = peran akun **tanpa** `panitia` dan `admin` Pra WAM, ditambah `panitia` bila orangnya di Panitia WAM. BOD
tetap dari peran BOD akun. Jadi "panitia" di bawah ini selalu berarti Panitia WAM, dan "admin" Pra WAM di Main WAM sama
dengan peserta.

**Hak per peran** (`mainWamCan(who, action)`, `moduleAllows`), peserta adalah dasar semua orang; peran tidak mengubah empat tab pertama. **Tab ke-5 "Panitia"** (`showsCommitteeTab`, `access.ts`) di ujung kanan, setelah Saya, hanya untuk **Panitia WAM** (dicek di server oleh layout; bukan peserta, BOD, atau panitia/admin Pra WAM). Isinya hub `/wam/acara/kelola` (`mainWamPath.committee`, gate `kelola`): Sedang berjalan, Kelola 2×2, Perlu perhatian; Rundown live, Absen, Pengumuman, dan Moderasi adalah layar di bawahnya, tombol kembalinya ke hub, tab Panitia menyala. Beranda panitia = Beranda peserta (tanpa kartu panitia):

**Modul disembunyikan di aplikasi (24 Nov 2026, permintaan pemilik).** `APP_HIDDEN_MODULES = ["silent", "voting"]` (`src/lib/main-wam/modules.ts`): `readMainWamSettings` (sisi aplikasi: peserta, panitia, BOD) memaksa saklar dua modul itu mati lewat `appModules()`, apa pun isi pengaturannya. Hasilnya seperti modul mati: halaman 404, API 404, tanpa kartu Beranda, tanpa aksi di Detail sesi, tanpa entri Kelola. Admin tetap membaca saklar apa adanya (`mainWamSettingsState`): saklar modul, Silent Meeting, Awarding (kategori, nominasi, persetujuan pemenang) tetap jalan dan tersimpan; di Modul acara dua saklarnya diberi keterangan "Disembunyikan di aplikasi untuk sementara". Menyalakan lagi: kosongkan konstanta itu.

| Aksi | Peserta | Panitia WAM | BOD | Modul |
| --- | --- | --- | --- | --- |
| `absen` (absen: yang dilihat peserta hanya "Hadir 07.52"; scan QR disembunyikan, no. 41) | ya | ya | tidak | absen |
| `foto` (Momen) | ya | ya | ya | — |
| `silent-kirim` | ya | ya | tidak | silent (**mati bawaan**: Silent Meeting dipakai di Pra WAM, bukan Main WAM) |
| `voting` | ya | ya | tidak | voting (**disembunyikan di aplikasi**, lihat di bawah) |
| `kelola` (Rundown live, Absen manual, Pengumuman, Moderasi) | tidak | ya | tidak | — (Absen manual butuh `absen`) |
| `silent-kontrol` (buka/tutup) | tidak | ya | tidak | silent |
| `awarding-setujui` | tidak | tidak | ya | voting |

Akses MCP tetap seperti sekarang (`mayUseMcp`, `mcpAccessOf`); di Main WAM hanya tautan kecil di Saya BOD.

## 4. Data

### 4.1 Tabel (awalan `mw_`, semua server-only: RLS on, revoke `public, anon, authenticated`, grant `service_role`)

Setiap kunci asing tabel fondasi (0001, 0002) punya indeks yang diawali kolomnya (audit L1, dites
`main-wam-check.sql`). Setiap migrasi Main WAM menulis revoke per tabel/fungsi sendiri. Audit L2 (`alter default privileges`)
sengaja tidak dipasang: itu mengubah perilaku semua migrasi tim lain di proyek Supabase yang sama (keputusan PM).

| Tabel | Isi | Catatan |
| --- | --- | --- |
| `mw_settings` (1 baris) | `mode`, `modules` jsonb, `module_config` jsonb (`survei.formSlug`, `mozaik.columns/rows`), `theme` jsonb (`colors`, `displayFont`, `images[slot] = {key, version, mime}`), `event_name`, `venue`, `hotel`, `check_in_at`, `check_out_at`, `contacts` jsonb (`kamar`, `perjalanan`, `umum` = employee id), `groups_published_at`, `carbon` jsonb (tagihan hotel sesudah acara) | tanggal acara dibaca dari `pw_events` (kind `wam`), satu sumber dengan hitung mundur Pra WAM |
| `mw_testers` | penguji tambahan | |
| `mw_sessions` | rundown: `title`, `kind` (`sesi`/`makan`/`perjalanan`), `status` (`draf`/`terbit`/`batal`), `starts_at`, `ends_at` (boleh kosong = 30 menit), `place`, `map_guide_id`, `dresscode`, `bring`, `lineup` jsonb, `meal`, `contact_id`, `uses_attendance`, `required`, `optional`, `module` (`silent`/`voting`/`survei`), `description`, `sort`, `qr_token`, `changed_at/by` | makan tidak boleh pakai absen; wajib harus pakai absen. **Setiap sesi terbit = tag foto** (`mw_photos.session_id`; kosong = Umum) |
| `mw_rundown_log` | riwayat perubahan: `changes` jsonb `[{field, from, to}]`, `notified`, `recipients`, `changed_by`, `changed_at` | "diubah Dimas · 10.20" |
| `mw_attendance` | `(session_id, employee_id)` unik, `method` `qr`/`manual`, `recorded_by` | absen manual baru wajib menyebut pencatat (trigger); pencatat dihapus → `recorded_by` null, absennya tetap (audit L1) |
| `mw_groups`, `mw_group_members` | kelompok (nomor, nama), anggota (satu kelompok per orang), satu koordinator | tampil ke peserta setelah `groups_published_at` |
| `mw_activity_groups`, `mw_activity_group_members` | kelompok kegiatan per sesi (`pos`/`angkot`/`meja`/`lain`), satu per orang per sesi | |
| `mw_stay_room_details` | `floor`, `note` per kamar | **kamar = pembagian kamar HR** (`cq_stay_rooms`/`cq_stay_members`, Admin WAM → Kuesioner → Kamar, kapasitas 1–8, terbit lewat `rooms_published_at`) |
| `mw_trips`, `mw_trip_seats` | langkah berangkat/pulang (`kumpul`/`kereta`/`bus`/`tiba`/`lain`), kursi/kendaraan per orang, `distance_km`, `vehicles` (Jejak karbon) | |
| `mw_guides` | panduan: `slug`, `kind` (`denah`/`hotel`/`dresscode`/`tata_tertib`/`lain`), `title`, `body` teks, berkas opsional di R2 `main-wam/panduan/…`, `published` | |
| `mw_notes` | metadata notifikasi Main WAM di atas `pw_announcements`: `kind`, `link` (`/wam/acara…`), `pinned_until` (pengumuman penting), `tone` (`info`/`warning`, kosong = aturan `noteTone`), `audience` jsonb | |
| `mw_photos` | `owner_id`, `client_id` (idempoten per HP), `audience` (`semua`/`kelompok` + `group_id`; **foto baru selalu `semua`**: tidak ada lagi "Untuk: Kelompokku", kolom ini hanya untuk foto lama), `session_id`, `file_key`/`thumb_key` (R2 `main-wam/momen/…`), ukuran, `taken_at`, `created_at`, `visible_at` (= +5 detik), `status` (`tampil`/`ditinjau`/`disembunyikan`), `hidden_*` | kelompok yang punya foto tidak bisa dihapus |
| `mw_photo_reactions` (migrasi `202611210001`), `mw_photo_hearts` (lama, tidak dibaca/ditulis lagi), `mw_photo_reports`, `mw_photo_seen` | reaksi: satu emoji per orang per foto (`photo_id`+`employee_id` kunci, `emoji` 1–16 karakter; daftar yang boleh ada di `lib/main-wam/momen/reactions.ts`, dicek server); hati lama; laporan (unik per pelapor, `lainnya` wajib catatan, `unhidden_at` = "Tampilkan lagi" untuk pelapor); foto yang sudah dilihat. Daftar siapa bereaksi apa: fungsi `mw_photo_reactors(photo, viewer)` (migrasi `202611230001`, hanya service-role; baris kosong bila viewer tidak boleh melihat foto itu) | |
| `mw_mosaic_tiles` | ubin → foto (satu foto satu ubin) | |
| `mw_award_categories`, `mw_award_nominees`, `mw_award_votes`, `mw_award_approvals` | kategori (`voting`/`juri`/`otomatis`, jendela, diumumkan), nominasi (orang/foto/label), satu suara per orang per kategori (bisa diubah), persetujuan BOD | trigger: suara hanya di jendela kategori voting terbit, tidak untuk diri sendiri (orang atau pemilik foto), jam server |
| `mw_silent_questions`, `mw_silent_feedback`, `mw_silent_openers` | satu pertanyaan per sesi, `opened_at`/`closed_at` (Buka/Tutup sekarang, masing-masing sekali; tutup final), `finalized_at` + `feedback_count`/`opener_count` (diisi saat tutup final); masukan **tanpa orang, tanpa waktu**, id acak; pembuka = HMAC orang, sekali per pertanyaan, tanpa waktu, dihapus saat tutup final | `mw_silent_state` (sama dengan `silentState`); trigger: masukan dan pembuka hanya saat dibuka, tutup tidak bisa dibatalkan, pertanyaan/sesi/topik tetap setelah dibuka, jam sesi digeser setelah tutup tidak membuka lagi; FK sesi `restrict` |

**Memakai ulang atau membuat baru:**
- **Rundown: tabel baru `mw_sessions`, bukan `pw_sessions`.** Pra WAM membaca `pw_sessions` tanpa
  saringan acara di banyak tempat (Kelola acara → Jadwal sesi untuk panitia/BOD, Timeline untuk
  `forum`/`acara`, TV, wajib MoM, ekspor, Arsip MoM). Penanda fase berarti mengubah ±20 kueri Pra WAM
  dan risiko bocor. Yang "gratis" dari `pw_sessions` hanya tabel absen dan token QR; logikanya tetap
  dipakai ulang (jendela absen 30 menit, `newQrToken`, `sessionQrPdf`, pemindai `CheckInScanner`).
- **Kamar: pakai ulang pembagian kamar HR** (sudah ada, sudah diisi HR, penghuni bebas sampai
  kapasitas). Main WAM hanya menambah lantai/catatan.
- **Notifikasi dan pengumuman: pakai ulang `pw_announcements` + `pw_notification_receipts`** (satu kotak
  masuk, status dibaca, Web Push yang ada), dengan event WAM 2026 dan `mw_notes` untuk jenis, tautan,
  sematan, audiens. Tidak ada topik push baru (Pengaturan Pra WAM tidak berubah); pemetaan di
  `notePushTopic`: pengumuman dan jadwal → `pengumuman` (selalu, juga jam tenang), absen/silent/voting/
  survei/kamar/foto disembunyikan → `forum` (tidak di jam tenang), reaksi → lonceng saja (belum dikirim).
- **Login, sesi, password, push, foto profil**: semua dipakai ulang lewat `praWamApi` (§5).
- **R2**: helper `src/lib/server/r2.ts` (`presignUpload`, `verifyUpload`, `presignDownload`, `readObject`,
  `removeObjects`). Prefix: `main-wam/momen/` (B; unggahan sementara di `tmp/main-wam/momen/`, §8, §10),
  `main-wam/panduan/` (E), `main-wam/tema/` (fondasi).
- **Survei**: tanpa tabel; `module_config.survei.formSlug` menunjuk kuesioner (`cq_forms`) yang sudah ada.
- **Jejak karbon**: tanpa tabel isian; dihitung dari peserta, kamar-malam (kamar HR × malam), perjalanan
  (`distance_km`, `vehicles`), porsi (sesi `makan`), dan `mw_settings.carbon` (tagihan hotel, diisi di admin).
  **Per peserta (24 Nov 2026, pola Pra WAM):** `lib/main-wam/peserta/carbon-saya.ts` (murni) menghitung jejak tiap orang dari faktor yang sama (`CARBON_FACTORS`): kereta km × 0,0164 dari kursinya di `mw_trip_seats`, bus km × 0,89 dibagi isi bus, kamar = malam × 62,7 dibagi penghuni kamar HR-nya, makan = porsi sesi `makan` terbit × 1,9. Masukan yang belum ada dihitung sebagai asumsi yang dinyatakan: leg tanpa daftar kursi dihitung untuk semua (tanda ≈, "tiketmu belum terdata"), kamar belum terbit memakai rata-rata hotel per peserta, tagihan hotel masuk dibagi rata. Tanpa tabel/migrasi baru. `loadCarbon` (server) mengembalikan `{ mine, overall }`: kartu Beranda memakai `mine` (kg, "perkiraanmu"); halaman memuat kartu pribadi (angka, banding rata-rata, sumber, tips) lalu "Detail keseluruhan" (total acara, peserta, rata-rata, sumber acara, Katalog emisi). Privasi: hanya angka sendiri dan agregat, tanpa nama orang lain. Pratinjau: `/dev-preview/wam2026/peserta/jejak-karbon` (`?detail=1 ?cara=1 ?saya=belum ?tiket=belum ?tanpa=1 ?status=belum`, label "Contoh").
  **Kalkulator seperti Pra WAM (24 Nov 2026, revisi pemilik "untuk emisi dibuat saja seperti Pra WAM"):** halaman Jejak karbon sekarang kalkulator: kartu hijau total (mengikuti ketikan, "Belum disimpan"), "Hitung jejakmu" (ubin: Perjalanan, Kamar, Makan dari data acara bertanda "Dari data acara"; Botol plastik, Laptop, Isi daya HP isian peserta; "Berangkat sendiri?" membuka sheet: dari, naik mobil/motor/kereta/lainnya, jarak 1–3.000 km, pulang-pergi, menggantikan kursi rombongan; "Ikut rombongan" mengembalikan), Simpan, lalu "Dari mana asalnya" (kini 4 bagian, Perangkat berwarna emas `--mw-gold-ink`), "Langkah kecil" (tiga kebiasaan sama dengan Pra WAM), "Detail keseluruhan" dan Katalog emisi (13 faktor + tautan sumber). Satu sumber kebenaran: `CARBON_FACTORS` WAM 2026 = tabel Pra WAM (`src/lib/pra-wam/carbon.ts`) + air/LPG/sampah; perjalanan/makan/botol/perangkat dihitung fungsi Pra WAM (`carbonParts`, `calculatorTiles`), skema isian = `carbonAnswerInputSchema` (batas sama: 50 botol, 72 jam, 20 kali, 3.000 km), tes paritas menjaganya. Penyimpanan: satu baris `pw_settings` per orang, kunci `mwc_` + 32 hex SHA-256 dari id karyawan (bukan nama, tidak bertabrakan dengan baris `carbon_` Pra WAM yang untuk perjalanan lain), **tanpa migrasi**; bila tabel belum ada: "menunggu pembaruan sistem", hitungan tetap jalan. API `PUT mainWamApi.carbon` (`/api/wam/acara/karbon`, modul `karbon`, batas 40 per 10 menit, Origin dicek). Pengisian dibuka sampai seminggu setelah hari terakhir acara (`carbonFormOpen`). Pratinjau: `?isi=1|sendiri ?sendiri=1 ?tutup=1 ?simpan=menunggu`.

### 4.2 Tipe (`src/lib/main-wam/types.ts`)

`MainWamMode`, `MainWamModule` (`absen voting silent survei mozaik karbon kuis`), `ModuleSwitches`,
`ModuleConfig`, `MainWamThemeSettings`, `MainWamThemeInput` (yang diterima `<MainWamTheme>`),
`THEME_IMAGE_SLOTS` (`splash homeHeader pattern mosaic icon`), `MainWamEventInfo`, `MainWamContacts`,
`CarbonInputs`, `MainWamSettings`, `MainWamRole`, `MainWamViewer` (`id`, `name` = nama panggilan,
`fullName`, `department`, `photo`, `roles`, `tester`, `group`, `room`), `ViewerGroup`, `ViewerRoom`,
`MwPerson`, `MwSession`, `LineupItem`, `RundownChange`, `MwAttendance`, `MwGroup`, `MwActivityGroup`,
`MwTrip`, `MwTripSeat`, `MwGuide`, `NoteKind`, `AnnouncementAudience`, `MwNotification`, `MwPhoto`,
`NoteTone` (`info`/`warning`), `PinnedNote`, `PhotoAudience`, `PhotoStatus`, `ReportReason` (+ `reportReasonLabels`), `MwAwardCategory`,
`MwAwardNominee`, `MwAwardApproval`, `MwSilentQuestion`. Tipe khusus area ditaruh di folder area.

### 4.3 Logika murni bersama (`src/lib/main-wam/`, semuanya dites)

| Berkas | Fungsi |
| --- | --- |
| `access.ts` | `mainWamGate`, `opensMainWamHome`, `isTester`, `mainWamRole`, `mainWamCan`, `moduleAllows`, `liveForEveryone` |
| `rundown.ts` | `sessionEnd`, `isRunning`, `byStart`, `eventDates`, `eventDay`, `eventDayLabel` ("Hari ke-2 dari 4"), `agendaDay`, `sessionsOfDay`, `nowAndNext`, `checkInWindow`, `checkInState`, `nowCard` (kartu Sekarang), `autoTag` (tag kamera), `tagChoices`, `dayWord`, `timeRange` |
| `home-card.ts` | `pickHomeCard` (pengumuman penting > Silent Meeting dibuka > voting dibuka > hari berangkat > survei; modul mati dibuang); kandidat pengumuman membawa `tone` |
| `module-state.ts` | `silentState` (tutup final), `silentClosesAt` (selalu akhir sesi sampai ditutup), `silentRecapReady` (≥ 5), `SilentResult`, `silentShownCount` (jumlah hanya setelah tutup final, ≥ 5 masukan dan ≥ 5 pembuka), `votingState` |
| `modules.ts` | `moduleInfo`, `moduleOn`, `activeModules` |
| `screen.ts` | `mainWamScreen(pathname)` (tab, level akar/detail/tugas, judul, `label` untuk judul kosong, kembali, `camera` = menggambar bilahnya sendiri), `mainWamTabs`, `showsBottomBar`, `showsBell` — dibaca shell UI KIT. P04 tanpa judul (label "Detail sesi"); B06 "Awarding" |
| `notify.ts` | `notePushTopic`, `noteIcon`, `announcementKind`, `noteTone` (pilihan panitia; selain itu `warning` untuk jadwal atau judul yang menyebut perubahan: berubah, diubah, pindah, mundur, batal, ditunda…) |
| `greeting.ts` | `homeGreeting(now, name, event, role?)` (panitia: "Hari ke-2 dari 4 · Panitia"), `salam` |
| `settings.ts` | `defaultSettings`, `settingsFromRow`, `settingsInputSchema`, `settingsPatch`, nama migrasi |
| `rows.ts` | pemetaan baris → tipe + daftar kolom (`SESSION_COLUMNS`, …) |
| `theme-image.ts` | skema unggah KV, `themeInputOf`, `themeImageAudience` (siapa boleh mengambil slot di mode itu) |
| `sample.ts` | data contoh (§7) |

### 4.4 Server bersama (`src/lib/server/main-wam/`)

| Berkas | Fungsi |
| --- | --- |
| `settings.ts` | `readMainWamSettings()` (bawaan saat gagal/sebelum migrasi), `mainWamSettingsState()`, `saveMainWamSettings`, `writeSettingsColumns` (untuk E: info acara, carbon, groups_published_at, contacts), `testerIds`, `listTesters`, `addTester`, `removeTester` |
| `viewer.ts` | `mainWamViewer(settings?)` (ringan: identitas, peran, penguji, kelompok; `room` null), `viewerOf(member)`, `groupOf` (satu kueri), `viewerRoom(id)` (kamar, cache per permintaan; hanya untuk layar yang menampilkannya), `testsMainWam` |
| `gate.ts` | §3, plus `mainWamShown`, `mainWamHomeTarget`, `redirectToMainWam`, tipe `MainWamContext` |
| `people.ts` | `mainWamPeople()` (nama panggilan, departemen, foto), `personOf(id)`, `mainWamEventPeople()` (akun WAM aktif + set `bod`/`panitia`/`admin`), `mainWamAttendees()` = **orang acara**: akun WAM aktif kecuali BOD (satu definisi untuk absen, Kehadiran, "Hadir 96 dari 120"; audit R5) |
| `read.ts` | `allSessions`, `shownSessions`, `sessionById`, `rundownLog`, `attendanceOf`, `listGroups`, `activityGroups`, `listTrips`, `seatsOf`, `listGuides`, `guideBySlug`, `guideFileKey`, `photoById`, `photosForEveryoneSince`, `awardCategories`, `awardApprovals`, `votedCategories`, `silentQuestions`, `silentResults` (jumlah pertanyaan yang sudah tutup final saja; tampilkan lewat `silentShownCount`) — semuanya `{ data, migrated }` |
| `notes.ts` | `sendMainWamNote` (lonceng + push, hanya ke yang Main WAM-nya menyala; `tone` opsional), `trySendMainWamNote`, `mainWamAudience`, `resolveAudience`, `myMainWamNotifications` (100 terbaru menurut waktu pengumuman, audit S8), `pinnedForMe` → `PinnedNote[]` dengan `tone` (kueri sendiri, tidak pernah terpotong), `markMainWamRead` |
| `theme.ts` | `mainWamThemeInput()`, `startThemeImage`, `confirmThemeImage`, `removeThemeImage`, `themeImageBytes` (disimpan di memori per kunci R2), `mayOpenThemeImages` |
| `errors.ts` | `mwMissing` (juga PGRST200 untuk embed tabel `mw_`), `mwWaiting` (503 "Fitur ini menunggu pembaruan sistem. Hubungi tim CoE."; nama migrasi hanya ke log server), `mwFail`, tipe `Read<T>` |
| `survey.ts` (milik A) | `surveyFor`: berkas bersama milik A, dipakai Beranda (A) dan aksi P04 (D). Aturan murninya di `src/lib/main-wam/peserta/survey.ts` |

`read.ts` memakai `cache()` untuk pembaca yang dipanggil berulang dalam satu render (`allSessions`, `listGroups`,
`listTrips`, `seatsOf`, `listGuides`, `awardCategories`, `awardApprovals`, `votedCategories`, `silentQuestions`,
`silentResults`). `cache()` React hanya berlaku saat render halaman; di route handler setiap panggilan membaca
ulang, jadi baca-setelah-tulis di API tetap segar.

Pembaca dasar tidak memeriksa siapa yang meminta; pemanggil sudah lewat gate dan menyaring sendiri
(mis. peserta tidak melihat draf, kelompok hanya setelah terbit, foto `kelompok` hanya anggota).

## 5. Alamat

Semua sudah ada di `src/lib/routes.ts` — **jangan menambah sendiri**. Butuh alamat baru: minta agen
fondasi (atau PM), sebut di laporan. Pemetaan layar ke kerangka ada di `screen.ts`.

**Halaman `mainWamPath`** (`/wam/acara…`)

| Area | Kunci → alamat (layar) |
| --- | --- |
| A | `home` / (P01/P02, B01, K01) · `login(next)` /masuk (O02) · `onboarding` /mulai (O03) · `notifications` /notifikasi (N01) · `agenda(hari?)` /agenda (P03) · `session(id)` /agenda/{id} (P04) · `me` /saya (P05/P05B) · `room` /saya/kamar (L01; kelompok dihapus dari aplikasi 18 Nov) · `carbon(dari?)` /jejak-karbon, `/jejak-karbon/saya` bila dibuka dari Saya (E01, modul `karbon`; semua peran) · `travel(arah?)` /saya/perjalanan (L03) · `guides` /saya/panduan, `guide(slug)` (L04) · `settings` /saya/pengaturan (S02) · `help` /saya/bantuan (halaman, bukan sheet) |
| B | `moments({lihat, sesi, foto})` /momen (M01–M03) · `camera({sesi, untuk})` /momen/kamera (U01–U05, O04) · `mosaic(tandai)` /momen/mozaik (M06) |
| C | `committee` /kelola (K01, hub tab Panitia) · `rundownLive(hari?)` /kelola/rundown (K02, K03 sheet) · `attendanceManual(sesi?)` /kelola/absen (K05), `attendanceTablet(sesi?)` /kelola/absen/tablet (K05b, Absen mode tablet, keputusan 39) · `announce` /kelola/pengumuman (K06) · `moderation(lihat?)` /kelola/moderasi (K08) |
| D | `scan` /absen (A01, A05) · `checkIn(token)` /absen/{token} (A02–A04; isi QR cetak) · `silentMeeting(sesi?)` /silent-meeting (T01–T03) · `awards` /awarding (V01) · `awardCategory(id)` /awarding/{id} (V02) |

**API `mainWamApi`** (`/api/wam/acara…`)

| Area | Kunci |
| --- | --- |
| fondasi | `themeImage(slot, v)`: mode `semua` → `splash`/`icon` publik; lainnya hanya untuk yang melihat Main WAM dan Admin WAM; `v` harus versi aktif (selain itu 404 `no-store`); cache 1 hari |
| A | `home`, `agenda`, `session(id)`, `roommate(id)`, `notifications`, `guideFile(id)`; login/password/push/foto profil tetap `praWamApi` |
| B | `photos(filter)`, `photoStart`, `photoConfirm`, `photosSeen`, `photo(id)`, `photoFile(id, ukuran)`, `photoReaction(id)` (GET daftar siapa bereaksi apa; PUT/DELETE bereaksi), `photoReport(id)`, `mosaic` |
| C | `rundownSession(id)`, `rundownLog`, `attendance(sesiId)`, `attendanceFace` (POST, Absen mode tablet), `announcements`, `announcement(id)`, `moderation`, `moderatePhoto(id)`, `summary` |
| D | `checkIn(token)`, `sessionQr(sesiId)`, `silent`, `silentFeedback`, `silentControl(id)`, `silentRecap`, `awards`, `vote(id)`, `approveAward(id)` |

**Admin** `mainWamAdminPath` (`/admin/wam2026/…`): `settings` (fondasi) · `rundown`, `groups`,
`activityGroups`, `rooms`, `travel`, `guides` (E) · `awards`, `silent` (D).
`mainWamAdminApi` (`/api/admin/wam2026/…`): `settings`, `testers`, `tester(id)`, `themeImageStart`,
`themeImageConfirm`, `themeImage(slot)` (fondasi) · `sessions`, `session(id)`, `groups`, `group(id)`,
`groupMembers(id)`, `activityGroups`, `activityGroup(id)`, `roomDetail(roomId)`, `trips`, `trip(id)`,
`tripSeats(id)`, `guides`, `guide(id)`, `guideFileStart`, `guideFileConfirm`, `eventInfo` (E) ·
`awardCategories`, `awardCategory(id)`, `awardNominees(id)`, `silentQuestions`, `silentQuestion(id)` (D).
Bagian menu Admin WAM 2026 terdaftar di `src/components/admin/wam-acara/sections.ts` (Ringkasan; Persiapan:
Pengaturan, Panitia WAM; Untuk peserta: Isi acara dengan tab Rundown/Kamar/Perjalanan/Panduan/Info acara, Modul acara
dengan tab Awarding/Silent Meeting/Kuis live, Misi (§16); tab halaman: `mainWamContentTabs`, `mainWamModuleTabs`
(`src/components/admin/wam-acara/tabs.ts`). Ditambah `home` (Ringkasan) dan `committee` (`/panitia`) di
`mainWamAdminPath`, `committee` dan `committeeMember(id)` di `mainWamAdminApi`. Area admin `/admin/wam2026` dan
`/api/admin/wam2026` = hak `wam_acara` (`areaOfPath`, §15); setiap API admin memanggil `requireApiAdmin()` (dites
`src/components/admin/wam-acara/sections.test.ts`).

## 6. Pembagian berkas dan nomor migrasi

Setiap agen hanya menulis di foldernya. Placeholder fondasi (bertanda `PLACEHOLDER (fondasi)` atau
`SLOT (fondasi)`) boleh diganti isinya oleh pemiliknya; **nama ekspor dan props slot tetap**.

| Agen | Layar | Folder milik | Migrasi | Uji SQL |
| --- | --- | --- | --- | --- |
| **A peserta/handbook** | O02, O03, P01/P02 (Beranda + kartu kontekstual), P03, P04, P05/P05B, L01, L03, L04, N01, S02 | `src/app/wam/acara/(app)/{page.tsx,loading.tsx,agenda,saya,notifikasi,mulai}/**`, `src/app/wam/acara/masuk/**`, `src/components/main-wam/peserta/**`, `src/lib/main-wam/peserta/**`, `src/lib/server/main-wam/peserta/**`, `src/app/api/wam/acara/{beranda,agenda,notifikasi,panduan}/**`, `src/app/dev-preview/wam2026/peserta/**` | `202611200101–0199` | `tests/backend/main-wam-peserta-check.sql` |
| **B Momen + Mozaik** | M01–M06, U01–U05, O04 | `src/app/wam/acara/(app)/momen/**`, `src/components/main-wam/momen/**`, `src/lib/main-wam/momen/**`, `src/lib/server/main-wam/momen/**`, `src/app/api/wam/acara/{momen,mozaik}/**`, `src/app/dev-preview/wam2026/momen/**` | `0201–0299` | `main-wam-momen-check.sql` |
| **C panitia + BOD** | K01 (hub tab Panitia), K02, K03, K05, K06, K08 | `src/app/wam/acara/(app)/{kelola,kelola/rundown,kelola/absen,kelola/pengumuman,kelola/moderasi}/**`, `src/components/main-wam/panitia/**`, `src/lib/main-wam/panitia/**` (mis. hitung Jejak karbon), `src/lib/server/main-wam/panitia/**`, `src/app/api/wam/acara/{kelola/rundown,kelola/absen,kelola/pengumuman,kelola/moderasi}/**`, `src/app/dev-preview/wam2026/panitia/**` | `0301–0399` | `main-wam-panitia-check.sql` |
| **D modul** | A01–A05, T01–T03, V01–V02, B05, B06, aksi modul di P04, admin Awarding + Silent Meeting | `src/app/wam/acara/(app)/{absen,silent-meeting,awarding,ringkasan/silent-meeting,ringkasan/awarding}/**`, `src/components/main-wam/modul/**`, `src/lib/main-wam/modul/**`, `src/lib/server/main-wam/modul/**`, `src/app/api/wam/acara/{absen,silent-meeting,awarding,kelola/qr}/**`, `src/app/admin/wam2026/{awarding,silent-meeting}/**`, `src/components/admin/wam-acara/modul/**`, `src/app/api/admin/wam2026/{awarding,silent-meeting}/**`, `src/app/dev-preview/wam2026/modul/**` | `0401–0499` | `main-wam-modul-check.sql` |
| **E Admin WAM konten** | Admin: Rundown, Kamar (lantai), Perjalanan (+ kursi), Panduan (+ berkas), info acara (hotel, check-in/out, kontak, tagihan hotel) | `src/app/admin/wam2026/{rundown,kamar,perjalanan,panduan,info-acara}/**`, `src/components/admin/wam-acara/isi/**`, `src/lib/main-wam/admin/**`, `src/lib/server/main-wam/admin/**`, `src/app/api/admin/wam2026/{sesi,kelompok,kelompok-kegiatan,kamar,perjalanan,panduan,info-acara}/**`, `src/app/dev-preview/wam2026/admin/**` | `0501–0599` | `main-wam-admin-check.sql` |
| **F Kuis live** (20 Nov 2026) | kuis HP, kendali MC, layar besar, Admin WAM → Kuis live, kartu Beranda (slot `kuis`) | `src/app/wam/acara/(app)/kuis/**`, `src/app/kuis/**`, `src/components/main-wam/kuis/**`, `src/lib/main-wam/kuis/**`, `src/lib/server/main-wam/kuis/**`, `src/app/api/wam/acara/kuis/**`, `src/app/api/kuis/**`, `src/app/admin/wam2026/kuis/**`, `src/components/admin/wam-acara/kuis/**`, `src/app/api/admin/wam2026/kuis/**`, `src/app/dev-preview/wam2026/kuis/**` | `0601–0699` | `main-wam-kuis-check.sql` |
| fondasi | gate, layout, pengaturan, tema KV | lihat §1 | `0001–0099` | `main-wam-check.sql` |

**Slot lintas area** (sudah dibuat, berisi `return null`). Slot `BerandaPanitia` dihapus 18 Nov (keputusan 20): kartu panitia pindah ke hub tab Panitia (`PanitiaHub`).:

| Slot | Pemilik | Dipasang oleh | Props |
| --- | --- | --- | --- |
| `BerandaBod` (`components/main-wam/panitia/BerandaBod.tsx`) | C | A, Beranda di bawah Sekarang | sama |
| `BerandaMomen` (`components/main-wam/momen/BerandaMomen.tsx`) | B | A, Beranda setelah kartu kontekstual | sama |
| `SessionPhotos` (`components/main-wam/momen/SessionPhotos.tsx`) | B | A, Detail sesi | `{ session; context }` |
| `SessionAbsen`, `SessionModuleAction` (`components/main-wam/modul/SessionModule.tsx`) | D | A, Detail sesi | `{ session; context; now }` |

Kartu kontekstual Beranda dibangun A dari pembaca fondasi (`pinnedForMe`, `silentQuestions` +
`allSessions` + `silentState`, `awardCategories` + `votingState` + `votedCategories`, `listTrips` +
`seatsOf`, `settings.moduleConfig.survei`) lalu `pickHomeCard`. Antar area lain cukup lewat alamat
API di `routes.ts` (mis. baris Silent Meeting di Rundown live C memanggil `mainWamApi.silentControl`
milik D), tanpa mengimpor kode area lain.

## 7. Data contoh dan pratinjau

- `src/lib/main-wam/sample.ts`: orang samaran (`samplePeople`), 12 kelompok (`sampleGroup4` = Kelompok 4 ·
  Arjuno, 10 orang, koordinator Fajar), kamar 3 orang (`sampleRoom3`, 208 · Rani, Sari, Dewi) dan 5 orang
  (`sampleRoom5`), kamar BOD, rundown 4 hari (`sampleSessions`, `sampleSession(key)`,
  `sampleSessionsChanged()` = perubahan 10.20), `sampleRundownLog`, `sampleAttendance`,
  `sampleActivityGroups`, `sampleTrips`, `sampleSeats`, `sampleGuides`, `sampleNotifications`,
  `samplePhotos` (gambar picsum, khusus pratinjau), `sampleAwards`, `sampleSilentQuestion`,
  `sampleSilentFeedback`, `sampleSettings()`, `sampleViewer(peran)`, `sampleTime(waktu)` (`berangkat`,
  `pagi`, `pemaparan`, `panitia`, `silent`, `teamBuilding`, `bod`).
- `src/components/main-wam/dev/DevFrame.tsx`: layar dalam kerangka asli untuk pratinjau:
  `<DevFrame path={mainWamPath.agenda()} peran={peran} waktu={waktu}>…</DevFrame>`.
- Pratinjau fondasi: `/dev-preview/wam2026/fondasi?layar=beranda|agenda|momen|saya&peran=…`,
  `/dev-preview/wam2026/fondasi/pengaturan?mode=…&migrasi=belum`.

## 8. Aturan kerja bersama

- **Sebelum migrasi**: baca dengan pembaca fondasi (`migrated: false` → tampilkan "menunggu pembaruan
  sistem" yang ramah, bukan galat); penulis melempar `mwWaiting(migrasi)`. Peserta dan admin hanya membaca
  "Fitur ini menunggu pembaruan sistem. Hubungi tim CoE."; nama berkas migrasi hanya di log server
  (`console.warn`) dan di `docs/go-live-internal.md` (audit R13, T-A01).
- **Orang acara**: hitungan peserta (absen, Kehadiran, "Hadir x dari y", persen) selalu dari
  `mainWamAttendees()`; penerima kabar dari `mainWamAudience()`. Keduanya dari `mainWamEventPeople()`.
- **Gate ringan**: halaman dan API tidak membaca kamar. Butuh kamar di luar Saya: `viewerRoom(viewer.id)`.
- **Pengumuman tersemat**: `pinnedForMe` membawa `tone`; Banner memakai nadanya (`warning` untuk perubahan).
- **Galat layar**: `(app)/error.tsx` menangkap layar tanpa `error.tsx` sendiri, di dalam kerangka, dengan
  "Coba lagi" dan "Ke Beranda" (`ScreenFailed`).
- **Waktu**: semua jam WIB lewat `rundown.ts` (`wibDate`, `wibTime`, `wibInstant`); aturan jendela
  (absen, Silent Meeting, voting) memakai jam server; basis data mengulang aturan voting dan Silent Meeting.
- **Nama**: rekan = `name` (nama panggilan) dari `mainWamPeople`/`personOf`; admin = `fullName`.
- **Notifikasi**: selalu `sendMainWamNote`/`trySendMainWamNote` (jangan menulis `pw_announcements` sendiri).
  Kabar tentang satu sesi memakai `tag` `sesi-<id>` supaya menggantikan kabar sebelumnya.
- **Tumpukan Momen (keputusan 30, 19 Nov: tumpukan hanya foto yang belum dilihat)**: bagian di bawah ini (dua lintasan, foto yang sudah dilihat di lintasan kedua) **sudah diganti**; yang berlaku: tumpukan "Semua" hanya berisi foto yang belum dilihat (ala Instants); foto sendiri muncul sekali sebagai foto pertama. Lihat baris 30.
- *(lama, sebelum keputusan 30)* tumpukan memuat **semua** foto tampilan itu, **foto sendiri ikut** (pil "Fotomu",
  reaksi yang diterima hanya sebagai pil di dalam foto, tanpa baris reaksi cepat). Urutan dua lintasan, masing-masing terbaru dulu: foto orang lain yang belum
  dilihat, lalu yang sudah dilihat dan milik sendiri. `mw_photo_feed(…, p_unseen, p_cursor_at, p_cursor_id, p_cursor_rest, p_direction, …)`:
  `p_unseen` hanya untuk arah `older`; kursor menyebut lintasannya (`p_cursor_rest` false = belum dilihat, true = sudah/sendiri; di
  alamat API `b~…` dan `r~…`), jadi foto yang baru dilihat tidak menggeser kursor; `total` = sisa di lintasan kursor (halaman pertama:
  jumlah foto baru). Foto sendiri tidak dihitung "N foto baru" (kartu Beranda memakai `total` itu). Kartu kosong (belum ada foto
  sama sekali): "Jadilah yang pertama memotret {acara}" + tombol Ambil foto. Setelah jepret, toast "Terkirim ke {siapa}" +
  "Sesi: {sesi atau Umum}" + **Batalkan** (5 detik) + **Lihat**, yang membuka tumpukan tepat di foto itu
  (`moments({ lihat, foto })`, menunggu unggahan sampai 3 detik; bila belum masuk, Fotoku).
- **Foto Momen**: unggah dua langkah seperti foto MoM (server memberi kunci + presigned PUT dengan tipe dan
  ukuran ditandatangani, browser PUT ke R2, server cek byte awal); `client_id` dari HP untuk antrean offline;
  file disajikan lewat server (`photoFile` → URL sementara), R2 tetap privat.
  - Unggahan masuk ke `tmp/main-wam/momen/`; "simpan" menyalin ke `main-wam/momen/` (dengan
    `Cache-Control: private, max-age=31536000, immutable`) lalu menghapus unggahannya. Unggahan yang tidak pernah
    disimpan dihapus aturan lifecycle R2 (§10, audit L4).
  - Umur URL tampil per ukuran (`VIEW_POLICY`, `src/lib/server/main-wam/momen/storage.ts`, audit L5, R3):
    `besar` sama selama 5 menit dan berlaku 15 menit (foto yang disembunyikan panitia atau bukan kelompoknya lagi
    tidak bisa dibuka besar lebih dari 15 menit); `kecil` sama selama 1 jam, berlaku 2 jam (cache kisi Galeri);
    `ubin` Mozaik sama sepanjang hari (berganti 03.00 WIB), berlaku 2 hari (HP dan TV mengunduh ubin sekali sehari).
    Redirect `photoFile` boleh dipakai ulang browser 5 menit (`besar`) atau 50 menit (`kecil`, `ubin`).
    Diterima: ubin 160 px (hanya foto untuk Semua) yang sudah diterima seseorang tetap bisa dibuka sampai 2 hari
    meski fotonya disembunyikan; ubin itu hilang dari Mozaik pada polling berikutnya.
  - Klien yang menyimpan daftar lama (tumpukan dibiarkan terbuka) memuat ulang gambar yang URL-nya kedaluwarsa
    sekali lewat `photoFile` (`useFreshAddress`).
  - Hapus foto lewat API Momen hanya untuk pemiliknya; panitia lewat moderasi C (`mw_moderate_photo`, tercatat,
    pemilik diberi kabar). Foto yang masuk nominasi Awarding tidak bisa dihapus: 409 "Foto ini masuk nominasi
    Awarding, jadi tidak bisa dihapus." (FK `on delete restrict`, 23503; audit M2, M3).
  - Mozaik: ETag dihitung sebelum manifest dari `mw_mosaic_version` (sidik ubin) + sumber sel + hari ubin +
    orang. Polling yang tidak berubah dijawab 304 tanpa presign (audit R3).
- **Silent Meeting** (audit H1, H2, L3, L7, L12; migrasi 0003 + 0401):
  - **Buka dan tutup.** Dibuka otomatis di jam mulai sesi, ditutup di jam selesai. Panitia boleh "Buka
    sekarang" sebelum jam mulai dan "Tutup sekarang" sebelum jam selesai, masing-masing sekali. **Tutup
    bersifat final**: setelah tertutup (oleh panitia, oleh jam, atau sesi dibatalkan setelah mulai),
    Silent Meeting tidak bisa dibuka lagi. Aturan ini ditolak di server (`controlRefusal`) dan di DB
    (`mw_silent_control`, trigger `mw_silent_question_guard`). `mw_silent_session_moved` mencap tutup
    sebelum jam atau status sesi berubah. Aksi `otomatis` dan "Tutup otomatis" dihapus. Kabar "Silent
    Meeting dibuka" hanya untuk Buka sekarang, jadi paling banyak sekali per pertanyaan.
  - **Kiriman.** `mw_silent_send(question, topic, body)` hanya menyisipkan isi, dalam transaksinya
    sendiri. Tidak ada baris lain yang mengenali orang (HMAC, batas laju, log, notifikasi) di transaksi
    itu. Batas per orang (10 kiriman per 10 menit per pertanyaan) ada di memori tiap instans server
    (`modul/memory-limit.ts`, best effort, kunci di-hash dengan kunci acak per proses) dan tidak pernah
    ditulis ke DB.
  - **Pembuka.** Saat T01 tampil dibuka, HP mengirim permintaan terpisah (`POST mainWamApi.silent`
    `{questionId}`). `mw_silent_open` lalu meng-upsert `HMAC-SHA256(K, "mw-silent-open\0" + questionId +
    "\0" + employeeId)` (hex 64), sekali per orang per pertanyaan, hanya selama dibuka. Kuncinya
    `K = HKDF-SHA256(MW_SILENT_SECRET, atau WAM_SESSION_SECRET bila kosong; salt kosong; info
    "mw-silent-v1"; 32 byte)`. **Isi `MW_SILENT_SECRET` (≥ 32 karakter) di produksi dan jangan dirotasi
    selama acara.** Kalau dirotasi, orang yang sama terhitung dua kali.
  - **Jumlah.** Selama dibuka, tidak ada jumlah masukan atau pembuka di API mana pun (kontrol, Rundown
    live, Ringkasan BOD, admin). Yang boleh hanya status "Dibuka". Jumlah hanya dari `silentResults()`
    (`mw_silent_results`, berisi pertanyaan tertutup saja) lewat `silentShownCount`, yaitu setelah tutup
    final dan hanya bila ada ≥ 5 masukan dan ≥ 5 pembuka. Rekap BOD memakai ambang yang sama.
  - **Tutup final** (`mw_silent_finalize`, dijalankan oleh Tutup panitia, dan oleh `mw_silent_results`
    untuk yang tertutup oleh jam): semua masukan pertanyaan itu ditulis ulang dalam urutan acak dalam
    satu transaksi (satu `xmin` untuk semua, urutan fisik acak, id baru). Jumlahnya disimpan di
    pertanyaan, lalu baris pembuka dihapus.
  - **Log.** Tidak ada `console.*` atau log server yang membawa isi atau kunci. Penolakan yang wajar
    dijawab fungsi DB dengan kata (`closed`, `topic`, `invalid`, …), bukan galat. Akibatnya pernyataan
    yang gagal, beserta parameternya, tidak masuk log Postgres.
  - **Model ancaman yang tersisa.**
    - BOD, panitia, dan admin aplikasi tidak bisa menghubungkan masukan dengan orang. Jumlah tidak
      terlihat selama dibuka dan tutup itu final, jadi tidak ada selisih rekap yang bisa dipakai.
    - Admin DB yang sengaja menganalisis urutan fisik baris **selama dibuka**: tiap masukan punya
      `xmin`/`ctid` sendiri. Urutannya bisa dibandingkan dengan baris lain yang punya jam (foto, reaksi,
      absen), dan dengan baris pembuka. Pembuka bisa dicocokkan ke orang bila ia juga memegang rahasia
      server. Hasilnya hanya **dugaan** ("ditulis setelah X, Y, dan Z membuka formulir, sekitar 13.42").
      Untuk dua penulis yang mengirim berdekatan, hasilnya tidak pasti.
    - Admin DB **setelah tutup final**: urutan dan `xmin` sudah seragam, dan pembuka sudah dihapus. Versi
      baris lama masih ada di disk sampai autovacuum membersihkannya. Membacanya butuh akses superuser
      (`pageinspect`), yang tidak dimiliki pengguna Supabase biasa.
    - Log platform (Vercel, Supabase API) mencatat siapa memanggil endpoint kirim dan kapan, tanpa isi.
      Bila digabung dengan akses DB selama dibuka, dugaan di atas bisa menjadi lebih kuat. Batasi siapa
      yang memegang akses DB dan log selama acara.
    - Setelan `log_parameter_max_length_on_error` di Supabase belum diperiksa (bawaan Postgres: 0).
- **Voting**: rahasia, bukan anonim; hanya agregat yang keluar dari server. Perolehan per nominasi baru
  tampil ke BOD dan Admin WAM setelah voting ditutup (`closedTally`, `closedCounts`; audit M1), dan tidak
  pernah ke peserta. Setujui pemenang yang sama sekali lagi tidak mengirim kabar lagi (audit L3).
  **Persetujuan pemenang ada di Admin WAM 2026 → Awarding** (sejak 23 Nov 2026; layar BOD B06 di aplikasi dihapus):
  `POST /api/admin/wam2026/awarding/[id]/setujui` `{nomineeId}` (`requireApiAdmin`, `approveWinner` dengan
  penyetuju `{id: string | null, name}`; aturan `approvalRefusal`: voting setelah ditutup, juri kapan saja,
  otomatis tidak; 409/422/404). Admin perorangan dicatat dengan `employeeId`; super admin dan sandi bersama
  tanpa id, jadi `mw_award_approvals.approved_by` NULL (`MwAwardApproval.approvedBy: string | null`) dan nama
  pelaku dipakai pada kabar panitia. Pengumuman pemenang (`isAnnounced`) tetap menunggu persetujuan. Aksi
  `awarding-setujui` dan API aplikasi lama tetap ada, tanpa layar.
- **Absen QR offline**: `scannedAt` dari antrean HP diterima hanya bila ada di dalam jendela absen sesi
  itu **dan** paling lama 30 menit sebelum jam server (audit M5). Selain itu jam server yang dipakai.
  Antrean menghapus scan hanya bila server menjawab hasil, atau menolak dengan alasan tetap (404/422).
  Scan yang lain disimpan dan dicoba lagi (audit T1).
- **Tampilan**: komponen UI KIT, token `--mw-*`, tanpa hex di komponen; target sentuh ≥ 44; status
  selalu kata; gestur geser punya tombol; `loading.tsx` per layar; detail dalam sheet bila cocok.
  Nama aksesibel baris/kartu = kata yang tampil; tambahan untuk pembaca layar lewat `spoken`
  (`ListRow`, `StatRow`), bukan `aria-label` yang menyusun ulang (WCAG 2.5.3, audit T-S05).
- **Tes**: `npx vitest run src/lib/main-wam src/lib/server/main-wam src/app/wam/acara` dan folder areamu;
  `npx tsc --noEmit`; `npx eslint <berkasmu>`; uji SQL area di `tests/backend/main-wam-<area>-check.sql`.

## 9. Keputusan arsitektur (dan alasannya)

| # | Keputusan | Alasan / rujukan |
| --- | --- | --- |
| 1 | Main WAM di `/wam/acara` dengan layout bertingkat, bukan root layout atau aplikasi terpisah | sesi, SW, izin kamera, `WamNavigator` dipakai ulang; root layout ganda memaksa muat ulang penuh (Next 16 `route-groups.md`) |
| 2 | Gate di setiap halaman/API + di layout; diuji statis | layout tidak dirender ulang saat navigasi (Next 16 `authentication.md` "Layouts and auth checks"); pola DAL |
| 3 | Gate di server component/route handler, bukan Proxy | Proxy hanya untuk cek optimistis, bukan baca data lambat (Next 16 `16-proxy.md`) |
| 4 | Tersembunyi = `notFound()` (404), bukan 403 atau pengalihan | tidak membocorkan fitur; tanpa risiko lingkaran pengalihan; `forbidden()` masih eksperimental |
| 5 | Mode `pra` membuka Main WAM untuk penguji lewat alamat | admin/panitia bisa menyiapkan dan memeriksa isi sebelum mode uji; tidak ada pintu masuk untuk orang lain |
| 6 | Belum login: login Main WAM hanya di mode `semua` | tampilan acara tidak terlihat sebelum diketahui orangnya penguji |
| 7 | Rundown di `mw_sessions`, bukan `pw_sessions` | `pw_sessions` dibaca tanpa saringan acara di ±20 kueri Pra WAM; risiko bocor ke Timeline, Jadwal sesi, TV, MoM |
| 8 | Kamar = pembagian kamar HR + `mw_stay_room_details` | sudah ada dan diisi HR, tanpa input ganda |
| 9 | Notifikasi lewat `pw_announcements` + `mw_notes`, tanpa topik push baru | satu kotak masuk, status dibaca, push yang teruji; Pengaturan Pra WAM tidak berubah |
| 10 | Pengaturan satu baris dengan jsonb tervalidasi di aplikasi (`settingsFromRow`) | baris rusak tidak pernah menghentikan halaman; modul/tema bisa bertambah tanpa migrasi |
| 11 | Tanggal acara dari `pw_events` (kind `wam`) | satu sumber dengan hitung mundur Pra WAM |
| 12 | Aturan voting dan Silent Meeting juga di basis data (trigger, jam server) | integritas tidak bergantung pada UI (RISET §6, §7) |
| 13 | Silent Meeting tanpa orang, tanpa waktu, id v4; kiriman sendirian di transaksinya; pembuka HMAC dengan kunci turunan sendiri, di permintaan terpisah; ambang 5 masukan dan 5 pembuka | ambang industri 5 (Microsoft Viva Glint, Culture Amp); UUIDv7/stempel waktu membocorkan (RFC 9562); `xmin`/`ctid` menautkan baris satu transaksi (audit H1); RISET §7 |
| 18 | Tutup Silent Meeting bersifat final; tanpa jumlah selama dibuka; masukan diacak ulang saat tutup final | dibuka lagi + hitungan langsung membuka penulis satu masukan dari selisih rekap (audit H2) |
| 19 | "Bukan untukmu" selalu 404, juga untuk peran yang salah | tidak membocorkan endpoint BOD/panitia (audit L10) |
| 14 | Foto: `client_id` unik per pemilik, `visible_at` = +5 detik, indeks keyset `(visible_at, id)` | antrean offline tanpa foto ganda (RISET §3); Batalkan 5 detik; tanpa OFFSET (use-the-index-luke) |
| 15 | Gambar KV lewat situs, alamat berversi; publik hanya `splash`/`icon` di mode `semua`; versi lain 404; cache 1 hari (bukan immutable setahun); byte disimpan di memori server | splash tampil sebelum login; R2 tetap privat; KV tidak bocor sebelum peluncuran (audit M6, R9, L6, L3) |
| 16 | `/wam` → Main WAM dengan pengalihan di Beranda Pra WAM; Pra WAM di `?versi=pra` | Pra WAM tidak dihapus; mode bawaan tidak mengubah apa pun (dites) |
| 17 | Admin Main WAM di bawah `/admin/wam/main`, hak akses "Admin WAM" (**diganti 20 Nov 2026**: pintu sendiri `/admin/wam2026` dengan hak `wam_acara`, §15) | tanpa grant/migrasi baru; tab-halaman agar menu tidak membengkak |
| 21 | Tab ke-5 "Panitia" untuk panitia; kartu Kelola dan Perlu perhatian pindah dari Beranda ke hub `/wam/acara/kelola`; tab hanya untuk peran panitia (bukan admin tak-panitia) | alat panitia punya rumah sendiri dan Beranda panitia sama dengan peserta; hub tetap digerbang `kelola` seperti layar di bawahnya |
| 22 | Silent Meeting dikeluarkan dari WAM: modul `silent` mati bawaan, migrasi `202611220001` mematikannya di baris yang sudah ada; kode, tabel, dan tes tidak dihapus; modul mati tanpa jejak; Admin WAM menampilkan banner "Modul mati" | itu bagian Pra WAM, bukan Main WAM (keputusan pemilik, 18 Nov); bisa dinyalakan lagi di Pengaturan |
| 20 | Tema, KV, kerangka, dan `loading.tsx` Main WAM hanya setelah gate (`mainWamShown`); belum login di `pra`/`uji` → `SignInFirst` | tampilan acara tidak sampai ke orang yang bukan penguji (audit M6, §9 #6) |
| 21 | Gate ringan; kamar dibaca malas hanya di Saya dan turunannya; viewer memakai bacaan pengaturan milik gate | ±15 kueri dalam 6 putaran per permintaan menjadi 6 kueri dalam 3 putaran (`gate-cost.test.ts`, audit S5) |
| 22 | Satu definisi orang acara: `mainWamAttendees()` | tiga hitungan berbeda membuat "Hadir 96 dari 120" beda dengan Kehadiran B02 (audit R5) |
| 23 | Pesan "menunggu pembaruan sistem" tanpa nama migrasi | istilah teknis tidak untuk peserta/admin; nama berkas di log server (audit R13, T-A01) |
| 24 | Tanpa `alter default privileges` (audit L2 ditolak) | berlaku untuk seluruh proyek Supabase, termasuk migrasi tim lain; revoke per objek di tiap migrasi Main WAM sudah diuji (`main-wam-check.sql`) |
| 25 | **Momen disederhanakan (pemilik, 18 Nov)**: bilah atas hanya judul + tombol kamera + tombol galeri (tanpa Semua/Kelompokku dan chip sesi di tumpukan); tidak ada lagi audiens "Kelompokku" (foto baru selalu `semua`; UI dan API unggah tidak menawarkannya, `lihat=kelompok` jatuh ke Semua, kolom `audience`/`group_id` dan view SQL `kelompok` dibiarkan untuk foto lama); hati diganti **reaksi** ala WhatsApp/Telegram | lebih sedikit kontrol di layar yang dipakai sambil berjalan; reaksi lebih ekspresif dan tanpa komentar (daftar siapa bereaksi apa: lihat 29) |
| 26 | Reaksi: baris cepat (❤️ 😂 🔥 👏 😮 🙏 + "+") di bawah foto, sheet "Pilih reaksi" (±60 emoji dalam 5 kelompok), pil (emoji + jumlah) di sudut kiri bawah di dalam foto; satu orang satu reaksi (emoji lain menggantikan, ketuk lagi membatalkan); foto sendiri hanya pil yang tampil; ganda-ketuk foto = ❤️. Server: PUT/DELETE `/api/wam/acara/momen/[id]/reaksi` (emoji dari daftar tetap, 200 per 10 menit per orang), fungsi `mw_photo_react` (hanya foto yang terlihat dan bukan milik sendiri); `mw_photo_feed` mengembalikan `reactions` jsonb `[{emoji, count, mine}]` menggantikan `hearts, hearted`. Migrasi **baru** `202611210001` (yang sudah dijalankan tidak diubah); hati lama dipindah jadi ❤️ (kecuali di foto sendiri). Berkas untuk dijalankan pemilik: `D:\projects\events\2027-01-werkudara-wam\main-wam-update-reactions.sql` | satu orang satu reaksi menjaga hitungan tetap sederhana; daftar tertutup mencegah teks bebas di foto orang |
| 27 | **Kelompok dihapus dari aplikasi (pemilik, 18 Nov)**: layar "Kelompok & kamar" jadi "Kamar" (`/saya/kamar`; tanpa kelompok dan kelompok kegiatan); kartu profil Saya hanya departemen; sasaran Pengumuman tinggal semua / departemen / panitia; halaman, menu, tab, `sections.ts`, dan rute pengelola "Kelompok" di Admin WAM dihapus. Tabel dan kolom (`mw_groups`, `mw_group_members`, `mw_activity_groups`, `viewer.group`, `groups_published_at`) dibiarkan; API admin `kelompok*` masih ada tapi tanpa layar. | pemilik tidak memakai kelompok di WAM 2026 |
| 28 | **Pengaturan dirapikan, Jejak karbon kembali (pemilik, 18 Nov)**: Pengaturan = grup Aplikasi (Notifikasi, Pasang ke layar utama, Tampilan, Bahasa; tiap baris satu kalimat dan satu sheet), Akun (Ganti password), Bantuan (halaman Bantuan, Hubungi panitia), lalu versi dan Akses MCP (pindah dari Saya). Jejak karbon (E01) kembali sebagai kartu di Beranda (setelah Momen, semua peran), baris di Saya → Info acara dan baris Ringkasan BOD yang bisa diketuk, ke halaman `/jejak-karbon`: total perkiraan, ±kg per orang, sumber (Hotel, Perjalanan, Makan) dengan batang dan persen, "Cara menghitung"; tanpa pohon, penebusan, atau isian. Angka dari `carbonForEvent` (dihitung dari data acara, tanpa form); warna batang token `--mw-chart-emisi-1…3` (≥ 3:1, terang dan gelap). | revisi pemilik |
| 29 | **Momen: tanpa pilihan sesi dan kelompok, tumpukan miring, reaksi bisa dilihat siapa saja (pemilik, uji di Pixel 9 Pro)**: (a) kamera tanpa chip dan sheet sesi; foto tetap ditandai sesi yang sedang berjalan di balik layar (atau sesi dari alamat `?sesi=`), tanpa UI; (b) kelompok hilang dari Momen: pil pemilik hanya nama panggilan + jam, `ownerGroup` dihapus dari `FeedPhoto`, kunci di foto lama (`audience = kelompok`) tidak lagi digambar (kolom DB dibiarkan); (c) kartu di belakang foto depan miring acak (±2° sampai ±7°, bergeser sedikit, mengecil menurut sudut, deterministik dari id foto: `pileTilt`), foto depan lurus, kartu berikutnya meluruskan diri; reduced motion: tanpa transisi, kemiringan tetap; (d) pil reaksi menumpuk menyamping seperti kelompok avatar (maks. 4 pil lalu "+N", reaksimu selalu ikut), **satu tombol**: mengetuknya membuka sheet "Reaksi · N" (tab Semua + per emoji; baris: avatar, nama panggilan, emoji; reaksimu bertanda "Kamu" dan mengetuknya menghapus); bereaksi hanya lewat baris cepat, sheet emoji, atau ganda-ketuk. Server: `GET /api/wam/acara/momen/[id]/reaksi` → `{ reactors: [{ person, emoji, mine, at }] }` (foto yang tidak boleh dilihat = 404, 120 per 10 menit per orang, `no-store`), fungsi `mw_photo_reactors` di migrasi **baru** `202611230001_main_wam_reactors.sql` (aman diulang; salinan: `D:\projects\events\2027-01-werkudara-wam\main-wam-update-reactors.sql`). Kanvas Mozaik: foto di luar huruf dipudarkan, sel huruf yang belum terisi lebih jelas, supaya "WAM 2026" terbaca pada 52% | membalik keputusan 25 ("tanpa daftar siapa"): pemilik ingin tahu siapa yang bereaksi; satu tombol menjaga foto tetap bersih dan area ketuk ≥ 44 px; kemiringan memberi tahu masih banyak foto di belakang |
| 30 | **Momen: tumpukan hanya foto yang belum dilihat, seperti Instants di Instagram (pemilik, 19 Nov)**: (a) foto yang sudah menjadi foto depan (digeser atau dibuka) **tidak muncul lagi** di tumpukan Semua, hanya di Galeri; lintasan kedua (sudah dilihat + milik sendiri) dihapus. Foto sendiri **muncul sekali** sebagai foto pertama (pil "Fotomu") dan dianggap dilihat begitu menjadi foto depan, sama seperti foto lain. Tumpukan habis → panel "Kamu sudah lihat semua" (Ambil foto; Lihat Mozaik dicabut, lihat 33); selama panel tampil, ada polling ringan tiap 20 detik (dan saat aplikasi kembali ke depan / sinyal pulih) ke halaman pertama tumpukan: foto baru muncul sebagai "baru". "Lihat" dari toast Terkirim dan dari Galeri/Mozaik membuka mode galeri di foto itu (semua foto, termasuk yang sudah dilihat, bertanda "Sudah dilihat"); tidak masuk tumpukan reguler. (b) Penandaan dilihat: antrean `lib/main-wam/momen/seen.ts` (id masuk saat foto jadi foto depan, dikirim berkelompok ≤ 100 ke `POST momen/dilihat` tiap 3 detik, saat ke latar, saat sinyal pulih, saat layar ditutup; gagal = tetap antre dan tersimpan di localStorage `mw-momen-dilihat` sehingga tab yang ditutup tidak menghilangkan tandanya; hanya 400/404/422 dianggap final); antrean sisa kunjungan lalu menyaring foto itu dari tumpukan. (c) SQL (migrasi **baru** `202611240001_main_wam_stack_unseen.sql`, salinan: `D:/projects/events/2027-01-werkudara-wam/main-wam-update-stack.sql`, aman diulang): `mw_photo_feed` (argumen dan kolom sama) mode `p_unseen` hanya foto tanpa baris `mw_photo_seen`; foto sendiri yang belum dilihat dulu (`p_cursor_rest` = kursor masih di lintasan foto sendiri; alamat `r~…` = foto terakhir milik sendiri, `b~…` = lainnya), lalu terbaru dulu; `seen` = ada baris seen (foto sendiri tidak lagi otomatis "dilihat"); `total` = sisa tumpukan setelah kursor. Fungsi baru `mw_photo_unseen_count(viewer, group)` = "N foto baru" di Beranda: foto orang lain yang belum dilihat, foto sendiri tidak dihitung (di tumpukan dihitung). Isi ulang: foto lama diisi sebagai sudah dilihat oleh pemiliknya. Urutan: SQL dulu atau bersamaan dengan deploy; bila deploy dulu, aplikasi baru menyaring foto "seen" sendiri (SQL lama masih mengembalikan lintasan kedua) dan Beranda memakai total lama; bila SQL dulu, aplikasi lama hanya menampilkan foto belum dilihat dan foto sendiri tidak ditandai dilihat (tetap di depan) sampai deploy. (d) **Pesan/komentar di bawah foto ditunda**: tidak ada UI, kolom, atau API pesan (tes DOM memastikan tak ada field/tombol/kata komentar atau pesan); reaksi cepat (❤️ 😂 🔥 👏 😮 🙏 + "+") tetap tepat di bawah kartu foto depan dan ikut berpindah saat digeser; pil reaksi tetap menindih kiri bawah foto dengan sheet siapa bereaksi (dicek 320×568 sampai 430×932) | membalik dua-lintasan keputusan PM 18 Nov: yang sudah dilihat tidak perlu muncul lagi; stack pendek terasa selesai dan memancing ambil foto |
| 31 | **Beranda: kartu utama jadi slide maksimal 3 kartu (pemilik, 24 Nov)**: Selesai (sesi terakhir hari ini yang sudah berakhir, bukan kartu Sekarang), Sekarang (`nowView`, tidak berubah), Akan datang (sesi pertama sesudah awal kartu Sekarang di hari yang sama; tanpa kartu bila Sekarang = "Hari ini selesai" atau kosong). `homeSlides(sessions, now, view, lang)` di `lib/main-wam/peserta/home.ts` memakai daftar sesi yang sama dengan kartu Sekarang (sudah lewat `visibleSessions`, hanya `terbit`), `HomeData.slides`. Segmen indikator = jumlah kartu (disembunyikan bila 1); `NowSlides` menggambarnya ke header lewat `ShellIndicator` (slot `IndicatorSlotContext` di shell, sebelum bel). `greeting.dayDots` dan `TopBar dayDots` dihapus; "Hari ke-n dari m" jadi label terlihat. | permintaan pemilik |
| 32 | **Momen: Galeri di bilah atas kiri Foto; motif latar halaman 0,15** | permintaan pemilik (digantikan oleh 33 untuk Galerinya) |
| 33 | **Galeri dihapus (pemilik, 25 Nov; dibalik oleh 35)**: layar `/momen/galeri`, komponen `Gallery`, filter sesi di galeri, tombol Galeri di bilah Momen (kini hanya Foto di kanan atas), `mainWamPath.gallery`, dan kunci i18n/pratinjau/tes galeri hilang. Alamat lama `/wam2026/momen/galeri` (dan `/wam/acara/momen/galeri`) dialihkan ke `/wam2026/momen/mozaik` (next.config.ts). Yang diwakili Galeri dipindah: (a) **foto sendiri + status** (Antre/Gagal di HP, Ditinjau, Disembunyikan) + **Hapus foto** = bagian "Fotoku" di Mozaik (`OwnPhotos.tsx`, halaman Mozaik memuat `listFeed` view `saya`, 30 foto pertama); ketuk kotak milik sendiri di mozaik juga menawarkan Hapus foto; "Lihat foto" di strip Tandai fotoku membuka penampil di tempat; (b) **foto satu sesi** = tumpukan `?sesi=` (Detail sesi "Foto sesi ini" tetap jalan); panel "Kamu sudah lihat semua" menawarkan Ambil foto saja (tombol Lihat Mozaik dicabut atas permintaan pemilik, 25 Nov: Mozaik tidak diulang di Momen; jalurnya Beranda dan Saya). Catatan ke pemilik foto yang disembunyikan menaut ke `moments({foto})` (tumpukan menampilkan "Fotomu disembunyikan" + Hapus foto), Lihat dari kamera tanpa id ke `moments()`. Foto yang sudah dilihat kini hanya bisa dibuka ulang lewat Mozaik dan Foto sesi. | permintaan pemilik: Mozaik sudah memuat foto-foto |
| 34 | **Saya: tokoh di bawah nama (pemilik, 25 Nov)**: kartu "Tokoh WAM-mu" dihapus; satu baris kecil (swatch dua warna kartu + nama tokoh, pembaca layar: "Tokoh: …") tampil di kartu profil di bawah nama dan di atas jabatan-departemen, tanpa kata kuis dan tanpa tipe. Sumber data sama (`figureAlias`, modul `kuis` aktif); tanpa tokoh, baris tidak ada. | permintaan pemilik |
| 35 | **Galeri kembali sebagai ikon, dengan tab Fotoku dan Ditandai (pemilik, 25 Nov)**: di bilah atas Momen, tombol Galeri berupa **ikon saja** (grid, `Grid2x2`; nama bacaan dan tooltip "Galeri"; 44 px) di **kiri** tombol Foto (muat di 320 px; kata Foto menyingkir di bawah 360 px seperti sebelumnya). Rute `/wam2026/momen/galeri` kembali (`mainWamPath.gallery(tab?)`, `?tab=ditandai`; `/wam/acara/momen/galeri` ikut dialihkan oleh aturan `/wam/acara/*`; pengalihan galeri ke Mozaik dihapus). Layar: bilah atas "Galeri" dengan kembali (`screen.ts`, level detail, kembali ke Momen) dan dua tab (`Segmented`): **Fotoku** (foto buatanku, grid 3 kolom, Antre/Gagal dari antrean HP dan Ditinjau/Disembunyikan; ketuk membuka penampil "Fotomu" dengan Simpan foto dan Hapus foto) dan **Ditandai** (foto orang lain yang menandaiku lewat `mw_photo_tags`; ketuk membuka penampil dengan nama pengunggah, "Bersama kamu, <nama lain>", Simpan foto dan **Lepas tag** setelah pertanyaan, lewat `DELETE mainWamApi.missionUntag`). Keadaan kosong ramah di tiap tab; "Muat lagi" bila lebih dari 30 (kursor `t~<visible_at>~<id>`). Data server: `lib/server/main-wam/momen/tagged.ts` (`listTagged`) membaca tag aktifku (maks. 500), lalu fotonya, lalu menyaring dengan aturan akses yang sama seperti feed (`canSee`: status tampil, lewat 5 detiknya, untuk semua atau kelompokku; bukan fotoku sendiri; bukan foto yang kulaporkan); murni di `lib/main-wam/momen/tagged.ts`; API `GET /api/wam/acara/momen/ditandai?sebelum=` (gate sama dengan rute Momen lain). **Tanpa migrasi baru**: tabel `mw_photo_tags` sudah ada lewat migrasi `202611300001`; sebelum itu tab Ditandai berisi pesan "menunggu pembaruan sistem" (bukan galat) dan Fotoku tetap jalan. Bagian Fotoku di Mozaik tetap. Pratinjau `/dev-preview/wam2026/momen?layar=M05` (+ `-status`, `-kosong`, `-ditandai`, `-ditandai-kosong`, `-ditandai-banyak`, `-memuat`) | permintaan pemilik: foto buatanku dan foto yang menandaiku perlu satu tempat yang mudah dicapai dari Momen; ikon saja agar bilah atas tidak penuh |
| 36 | **Carousel sesi di Beranda selalu 3 kartu, Sekarang selalu di tengah (pemilik, 25 Nov; mengganti "maksimal 3" di 31)**: urutan tetap [Selesai] [Sekarang] [Akan datang]. Sisi tanpa sesi tidak dibuang: kartu **pengganti** kalem (kartu tonal, garis putus-putus, tanpa emas dan tombol; ikon + satu kalimat) "Belum ada sesi yang selesai" / "Tidak ada sesi berikutnya hari ini" / "Sampai jumpa besok" (bila hari berikutnya punya sesi), sehingga Sekarang tidak pernah bergeser ke tepi dan terbuka terpusat (snap center, lebar kartu ±86 %, padding 7,5 % supaya kedua tepi mengintip sama). `homeSlides` selalu mengembalikan `slots` berisi 3 tempat (`done`, `now` indeks 1, `upcoming`; sisi kosong membawa `empty`: `noDone`, `noUpcoming`, `tomorrow`); `HomeData.slides` kosong = dua pengganti (`EMPTY_SLIDES`). "Hari ini selesai" dan "Agenda belum terbit" tetap di tengah. Indikator di kepala selalu 3 segmen (pengganti redup), diketuk atau panah kiri/kanan memindah kartu; aria: tiap kartu grup berlabel, pengganti menyebut "kosong". Aturan lama tetap: tinggi semua kartu = kartu Sekarang, Selesai hanya sesi yang sudah berakhir hari ini (WIB), Akan datang sesudah Sekarang di hari yang sama, sesi yang berimpit dengan Sekarang tidak masuk. Kartu sekunder tidak diubah. | permintaan pemilik |
| 37 | **Beranda: tidak ada kartu di atas carousel (pemilik, 25 Nov)**: kartu Kuis live ("Kuis dimulai · Ikut") tidak lagi tampil di Beranda; carousel sesi jadi yang paling atas. Kuis tetap dijangkau lewat halaman Kuis (`mainWamPath.quiz`) dan tautan dari sesinya; komponen `BerandaKuis` tidak dipasang lagi. | permintaan pemilik |
| 38 | **Kuis live hanya memakai warna tema (pemilik, 25 Nov)**: HP, layar besar, dan kendali MC memakai netral (bg, surface, outline, teks), `--mw-primary` (+container) untuk waktu dan pilihan, `--mw-gold` hanya untuk peringkat atau kemenangan milikmu dan podium; hijau/merah hanya untuk benar/salah, selalu dengan ikon dan kata. Opsi A–D satu gaya (surface + outline, kotak primary-container berisi bentuk ▲◆●■ dan huruf, sama di ketiga layar); dipilih = outline primary 2 px + tint primary-container + gembok; dibuka = yang benar outline hijau + ✓ Benar, pilihanmu yang salah outline merah + ✕ Pilihanmu · Belum tepat, sisanya diredupkan lewat warna teks (tetap terbaca). Bar sebaran tint primary (netral untuk yang diredupkan) + persen. Kartu level satu gaya netral: nama + 4 titik (terisi primary), berganti lewat crossfade 300 ms, bukan putar 3D (teks tetap tajam). Timer bar tipis primary tanpa gradien; 5 detik terakhir merah + "N detik". Angka besar (nilai turun, poin, peringkat) text-1. Tanpa gradien, glow, burst, dan confetti warna-warni: confetti hanya saat juara mendarat (emas + primary, singkat, mati saat kurangi gerak, termasuk saklar Pengaturan). Avatar tokoh di surface-2 tanpa warna persona (gambar figur `.webp` membawa latar warnanya sendiri, tidak diubah); kartu tokoh lobi bercincin primary tanpa glow dan tanpa animasi napas. Layar juara: surface + outline emas + tint emas 7 % dengan chip medali kecil. Teaser babak akhir netral (surface-2). Layar besar `/kuis/{kunci}`: tema admin (warna dan font judul, tanpa gambar KV karena halaman publik), gelap bawaan, `?mode=light` untuk ruangan terang; angka dan judul pakai `--mw-display-font`. Token `--mw-kuis-a/b/c`, `--mw-kuis-medal-1…3`, `--mw-kuis-win-container`, `--mw-on-kuis-medal` dihapus; `--mw-kuis-d` dan `--mw-on-kuis` tetap untuk label Kuis di Modul dan Agenda. Tes penjaga (`kuis-tokens.test.ts`): berkas gaya kuis tanpa hex, gradien, glow, atau token modul. Logika, waktu, nilai, dan API tidak berubah. | kuis terlihat seperti aplikasi lain; peserta perlu fokus ke soal |
| 39 | **Absen mode tablet (pemilik, 25 Nov; wajah di tablet panitia, beberapa wajah sekaligus)**: (a) **Layar** `/wam2026/kelola/absen/tablet` (`mainWamPath.attendanceTablet(sesi?)`, tombol "Mode tablet" di Absen sesi), hanya Panitia WAM dengan modul Absen QR menyala (gate `kelola`, modul `absen`; selain itu 404, dites di `access.test.ts`). `screen.ts`: `camera: true`, jadi kerangka tidak menggambar bilah atas dan bawah; layar mengisi jendela (`position: fixed`), meminta Fullscreen API saat **Mulai** diketuk (tombol "Layar penuh / Keluar layar penuh" mengikuti browser; di iPhone tidak ada, layar tetap memenuhi jendela), menahan layar menyala (Wake Lock). Landscape 1024×768: kamera lebar di kiri + panel 320 px (Hadir N dari M dengan batang, Catat manual, Layar penuh, ganti kamera, Selesai), strip "Baru saja" di bawah kamera; tegak 768×1024 dan HP: panel di bawah kamera (HP: sapaan "Buka di tablet", tetap berfungsi). Gambar kamera memakai `object-fit: contain` supaya wajah di tepi tidak terpotong. (b) **Deteksi di browser** memakai mesin WG People apa adanya (`src/components/hr/faceEngine.ts`: MediaPipe Face Landmarker `numFaces = 6` lewat `loadFaceEngine({ faces })` + `readAll`, SFace int8 untuk `embed`); aplikasi WG People tidak diubah. Per wajah: harus cukup dekat (jarak mata ≥ 28 px, `MIN_EYE_DISTANCE`), menghadap (yaw ≤ 30°), dua pembacaan tajam (`MIN_SHARPNESS`) yang saling cocok (≥ 0,6) dirata-rata; yang kabur atau kecil dilewati dan kotaknya menyebut alasannya ("Mendekat", "Hadap kamera"). **Gambar kamera tidak pernah keluar dari tablet**: yang dikirim hanya angka wajah (128 angka) dan, untuk wajah yang antre offline, jamnya. (c) **Pencocokan di server satu-ke-banyak** `POST /api/wam/acara/kelola/absen/wajah` (`mainWamApi.attendanceFace`; body `{ sessionId, faces: [{ embedding, seenAt? }] }`, 1–6 wajah, 40 KB, 900 per 10 menit per panitia, Origin dicek; hanya angka, gambar atau kolom lain ditolak 422): dibandingkan dengan `pw_face_profiles` yang **sama dengan WG People**, hanya status `aktif` (bukan `siap` yang menunggu persetujuan orangnya, bukan `menunggu`) dari model `sface-2021dec-int8`, hanya untuk orang acara (akun WAM aktif termasuk BOD); angka acuan tidak pernah dikirim ke tablet. **Aturan lebih ketat dari WG People (1:1, cocok ≥ 0,363)** karena 1:N atas ±120 orang menaikkan peluang orang asing mirip seseorang: skor terbaik ≥ **0,45** (`TABLET_MATCH.min`) **dan** unggul ≥ **0,08** dari peringkat kedua (`TABLET_MATCH.margin`), konstanta bernama dan dites di `face-tablet.ts`; dua orang yang berdekatan skornya = "ragu", tidak dicatat sebagai siapa pun; satu orang tidak bisa jadi dua wajah di satu gambar (yang skornya lebih baik memegang nama, yang lain "ragu"). Nilai awal, **belum dikalibrasi** pada wajah tim sendiri. Jawaban per wajah: `dikenali` (nama panggilan, departemen, peran `peserta|panitia|bod`, `already`, `recorded`), `ragu`, `tidak-dikenali`, `belum-terdaftar` (tidak ada orang acara yang punya wajah aktif), `di-luar-jam`. (d) **Pencatatan** lewat tabel absen yang sama (`mw_attendance`, satu baris per orang per sesi, `ignoreDuplicates`): sesi harus terbit dan pakai absen (selain itu 404), jendela sama (30 menit sebelum mulai sampai 30 menit setelah selesai; di luar jendela tidak ada pencarian wajah dan tidak ada tulisan: `di-luar-jam`); wajah yang antre offline membawa jamnya hanya bila di dalam jendela dan ≤ 30 menit (`acceptedScanTime`, sama dengan QR antre). Yang sudah hadir dijawab `already` dan tidak ditulis lagi; BOD disebut namanya tapi tidak dicatat. **Kolom `method` hanya boleh `qr`/`manual` (CHECK) dan tidak ada kolom catatan, jadi absen wajah tercatat `manual` dengan `recorded_by` = panitia pemilik tablet** (tampil "Dicatat panitia", dan Batalkan hadir di Absen sesi bisa mengoreksi salah kenali); **tanpa migrasi**. Tidak ada angka wajah dari tablet yang disimpan, dan tidak ada log berisi wajah. (e) **Klien**: pelacak wajah antar frame (`matchSpots`), satu kotak per wajah dengan jawabannya (kurung emas + nama + centang = dikenali, BOD berlabel; kurung abu "Tidak dikenali"); wajah yang baru dijawab tidak dikirim lagi 20 detik (wajah tak dikenal dicoba lagi setelah 5 detik); kotak dicek tiap 2 detik apakah masih orang yang sama (bila tidak, kotak baru); satu permintaan sekaligus untuk wajah yang selesai dibaca bersamaan. Offline: angka wajah antre di `localStorage` `mw-absen-wajah-antre` (maks 40, maks 30 menit, tanpa gambar), tampil "antre" di strip dan dikirim saat sinyal kembali (15 detik atau peristiwa `online`). Keadaan: izin kamera ditolak / kamera tidak ada / sibuk / browser tidak bisa (kartu pengantar dengan Coba lagi dan Catat manual), tidak ada wajah ("Hadapkan wajah ke kamera"), belum terdaftar (Catat manual), sesi belum dibuka atau sudah ditutup (penutup di atas kamera, jam sesuai server), ganti sesi tanpa menghidupkan ulang kamera, Catat manual lewat jalur manual yang ada (`attendance`/`setPresent`, sama dengan K05). (f) **Batas yang dinyatakan di layar (kartu pengantar)**: **tidak ada pemeriksaan liveness** di mode ini (banyak wajah sekaligus, tidak ada yang diminta berkedip), jadi foto wajah yang diarahkan ke kamera bisa terbaca; panitia berdiri di dekat tablet. Wajah yang belum terdaftar di WG People tidak bisa dikenali (Catat manual). **Persetujuan data wajah: perlu dikonfirmasi pemilik.** Wajah acuan peserta berasal dari pendaftaran WG People (foto dasar GreatDay yang diproses Admin HR langsung `aktif` atas pilihan pemilik untuk pilot, atau yang didaftarkan orangnya sendiri dengan persetujuan versi `CONSENT_VERSION`), dan teks persetujuan itu ditulis untuk absen kantor; memakainya untuk absen acara di tablet panitia adalah tujuan baru. Pemilik/HR/legal harus memastikan kata-kata persetujuannya mencakup ini sebelum mode ini dipakai di acara. Pratinjau: `/dev-preview/wam2026/panitia?layar=k05t` (kamera dan wajah palsu; `&varian=intro|ditolak|tanpa-wajah|belum-terdaftar|offline|belum-dibuka|ditutup|tanpa-sesi`) | pemilik minta absen wajah memakai yang sudah dibangun untuk WG People dan Pra WAM, di tablet panitia, layar penuh, beberapa orang sekaligus; 1:N lebih berisiko salah kenali daripada 1:1, maka aturan lebih ketat, tanpa tebak nama saat ragu, dan koreksi lewat Batalkan hadir |
| 40 | **Momen: Foto baru (editor), tag tanpa batas, simpan asli di HP (pemilik, 25 Nov; prototipe disetujui "Ya, bangun")**: (a) **Alur**: rana (atau pilihan berkas dari galeri, maks 10) → layar **Foto baru** (dulu "Periksa fotomu"; `PhotoEditor`, `<dialog>` layar penuh, terbuka seketika dengan skeleton selagi bingkai dibuat) → **Kirim**. **Sign** dan **Filter** pindah dari kamera ke editor (daftarnya di (f)); kamera hanya rana, balik kamera, tombol foto dari galeri, dan kepala + ikon Galeri (catatan "Sign, warna, dan tag diatur di langkah berikutnya"). Kamera menangkap **bingkai polos** (`frameFile`: JPEG ≤ 2560 px, tanpa tanda dan warna, tidak dipotong); editor menampilkan pratinjau langsung (filter CSS + `TemplateOverlay`) di atas gambar polos (tidak merusak); efeknya baru **digambar saat Kirim** (`applyLook`: dipotong 4:5, warna dulu, lalu sign) lalu lewat jalur siap-kirim yang sama (`prepareMomenPhoto`, antrean HP, Batalkan 5 detik, deteksi misi otomatis). Beberapa foto: strip miniatur kecil menempel di bawah foto, sign/warna berlaku untuk foto terpilih, chip **Terapkan ke semua foto** di samping [Sign | Filter] (menyalin tampilan foto terpilih ke semua dan terus berlaku selama menyala; tag dan lokasi satu untuk semua). Berkas dari galeri kini juga bisa diberi sign/warna. Misi tetap kamera langsung tanpa editor. (b) **Tag tanpa batas**: `PHOTO_TAG_MAX` dan `.max()` di `photoStartSchema` dihapus (klien, API unggah; DB tidak pernah membatasi: `mw_photo_tags` satu baris per orang); server tetap menyimpan tiap orang sekali dan hanya peserta aktif. Daftar ada di **sheet Tag** (lihat tata letak di bawah): satu daftar semua orang (`listPeople`: BOD dulu lalu nama; pencarian nama atau departemen), baris = avatar (foto profil bila ada, `TagCandidate.photo`; kalau tidak, inisial berwarna dari token), nama, departemen, chip **BOD**; orang terpilih tampil sebagai chip di atas daftar (avatar kecil + nama, ketuk melepas, teks membungkus) dengan hitungan "N dipilih"; tombol Kirim menyebut jumlah foto dan tag ("Kirim · 3 foto · 7 tag"). Sheet "Ada siapa di foto ini?" (`MomenTagSheet`) beserta CSS dan kunci i18n-nya dihapus. **Tanya setiap foto** (ingatan HP `mw-momen-tag`, bawaan nyala) tetap, kini di atas daftar dalam sheet Tag: nyala = sheet Tag **terbuka sendiri** begitu editor terbuka; mati = editor tetap muncul dan sheet hanya dibuka dari alat Tag; **Tandai lokasi** pindah ke editor (hanya foto dari kamera; aturan KONTRAK 13 tidak berubah). (c) **Simpan asli di HP** (saklar baru, bawaan **nyala**, ingatan HP `mw-momen-asli`): saat **Kirim** ditekan (isyarat pengguna), bingkai **asli** (tanpa sign/warna) disimpan ke HP lewat `saveOriginal` di `saveFile.ts` (iPhone: lembar Bagikan > Simpan Gambar bila peramban menerima berkas; selain itu unduhan; nama `wam-momen-YYYYMMDD-HHMMSS.jpg`). Gagal = toast tenang "Foto asli belum bisa disimpan di HP. Fotomu tetap terkirim", tidak pernah menahan pengiriman; berkas dari galeri **tidak** disimpan ulang (saklarnya tidak tampil). Berkas asli **tidak** diunggah. (d) **Tombol**: **Kirim** (emas, selebar penuh, satu-satunya tombol di bawah, selalu terlihat), **Ulangi** = panah kembali di kiri atas (juga Esc dan tombol Back HP: kembali ke kamera, foto dibuang), Tidak ada tombol ✕/Batal: panah kembali satu-satunya jalan keluar (pemilik, 25 Nov: tempat ✕ dipakai tombol Simpan asli). (e) **Tata letak: "aplikasi posting" (pemilik menyetujui prototipe, 25 Nov; menggantikan baris alat + panel, rupa "panggung gelap/kaca", dan revisi-revisi tata letak sebelumnya)**: ikut tema aplikasi (terang atau gelap; tidak ada panggung gelap paksa, cahaya ambient, kaca, atau dock), satu layar tanpa gulir halaman di 390 x 844 dan nyaman di 360 x 640 dan 320 x 568. Dari atas: bilah atas biasa (panah = Ulangi, judul **Foto baru**, penghitung "2/4" bila banyak foto, **Simpan asli di HP** = ikon unduh di kanan atas, tonal bila nyala, tanpa untuk berkas galeri); pratinjau 4:5 bersudut 16 (mengambil sisa tinggi; banyak foto: strip miniatur 36 x 45 di bawahnya, yang tampil bercincin emas); segmented kecil **[Sign | Filter]** (kit `Segmented`) dengan chip **Terapkan ke semua foto** di kanannya bila banyak foto; **satu baris** ubin pratinjau 60 x 75 yang digeser (fotomu sendiri dengan efek itu, nama 11 px, terpilih bercincin emas); baris chip 40 px yang membungkus: **Tag orang** (terisi: "N orang ditandai" / "1 orang ditandai" (en "N people tagged" / "1 person tagged") + tumpukan avatar kecil, tonal; membuka sheet bawah ±85 % dengan saklar Tanya setiap foto, pencarian, chip terpilih, satu daftar avatar/nama/departemen/chip BOD/centang, **Selesai**; sheet ikut tema aplikasi), dan **Tandai lokasi** (toggle, hanya bila relevan); catatan privasi dan keterangan ada di `title`, tanpa teks penjelas di layar. Bawah: **Kirim** emas selebar penuh ("Kirim · 4 foto · 7 tag"), selalu terlihat. Komponen: `PhotoEditor`, `EditorTagSheet`. (f) **Filter dan Sign baru (dari prototipe `TF`, `TINT`, `tplSvg`)**: **Filter** (menggantikan Warna: Asli, Emas, Fajar, Mono): Asli · Cerah (`brightness(1.06) contrast(1.05) saturate(1.12)`) · Hangat (`sepia(.18) saturate(1.08) hue-rotate(-8deg) brightness(1.03)`) · Sejuk (`saturate(.95) hue-rotate(8deg) brightness(1.02) contrast(1.03)` + lapisan biru brand 8 %) · Pudar (`contrast(.9) saturate(.85) brightness(1.06)` + lapisan putih 6 %) · Mono (`grayscale(1) contrast(1.08)`); satu daftar resep (`camera-filters.ts`) menghasilkan filter CSS pratinjau, `ctx.filter` saat dibakar, dan cadangan per piksel langkah demi langkah (Safari < 18); lapisan warna digambar di antara filter dan sign; id lama (emas, fajar) dibaca sebagai Asli (`toCameraTone`). **Sign** (menggantikan Simpel, Emas, Jaringan, Polaroid): Tanpa · Tanda · Label · Bingkai · Film · Poster · Polaroid · Jaringan, digambar 400 x 500 dari satu daftar op (`templateLayout`: SVG pratinjau dan canvas saat dibakar sama; op baru: garis `path`, sudut bulat, garis tepi, teks diputar atau direntang), huruf Barlow Condensed dan Plus Jakarta Sans lewat variabel font aplikasi, data WAM 2026, Shaping Tomorrow, 5–8 Januari 2027, Kota Batu, dan **tanggal dan jam foto diambil** (WIB, `photoStamp`); id lama (simpel, emas) dibaca sebagai Tanpa (`toSign`). Daftar Warna/Sign lama hanya disebut di baris ini (keputusan 29–37 tidak menyebutnya). Tidak ada migrasi. | permintaan pemilik; PANDUAN_PROTO §11.1 |
| 41 | **Absen QR peserta disembunyikan; absen hanya lewat scan wajah di tablet panitia (pemilik, 26 Nov: "bukannya scan wajah pake tablet nanti, jadi tidak ada lagi cetak qr dan lainnya"; pilihan pemilik "Sembunyikan, kode tetap")**: (a) **Satu saklar**: `QR_ABSEN_VISIBLE = false` di `src/lib/main-wam/modules.ts` (bersebelahan dengan `APP_HIDDEN_MODULES`, dengan komentar keputusannya). **Menyalakan kembali** (tablet gagal di lapangan): ubah ke `true`; tidak ada yang lain, tidak ada migrasi. (b) **Yang tidak terlihat lagi saat `false`**: di Beranda kartu Sekarang tanpa kaki "Wajib absen" + tombol emas "Absen sekarang" (`nowView` menerima `qr`, bawaannya saklar: tidak ada kartu `absen`, jadi sesi yang sudah selesai tidak ditahan 30 menit lagi; kartu tetap selesai tanpa celah di 390 dan 320 px) dan di carousel; di Detail sesi tombol Absen, kunci ceklis, dan keadaan kamera pemindai; **pemindai dan penjalan antrean luring** (`AbsenQueue` tidak dipasang di kerangka); di panitia tombol "Tampilkan QR sesi" di Absen sesi dan tombol QR di Detail sesi (`moduleSlot.qr = null`); kartu izin kamera Momen tidak lagi menyebut "scan QR absen"; alasan notifikasi "Absen dibuka" di Mulai tidak ada (`onboardingNews(…, qr)`); jawaban Bantuan "Bagaimana cara absen?" dan baris admin "Pakai absen" menyebut tablet (`peserta.help.q.absen.text`; kalimat QR lama tinggal di `…textQr`); label modul "Absen QR" jadi "Absen wajah" ("Absen wajah di tablet; panitia bisa mencatat manual."); tag Agenda "Wajib absen" memakai ikon wajah. (c) **Tidak terjangkau**: `/wam2026/absen` dan `/wam2026/absen/{token}` (halaman) dan API `absen/{token}`, `kelola/qr/{sesiId}` menjawab 404 untuk semua peran, bahkan sebelum masuk, **dijaga di satu tempat** (`requireQrAbsenPage`, `requireQrAbsenApi` di `src/lib/server/main-wam/gate.ts`; dites di `gate.test.ts`, `modul-access.test.ts`, dan `acara-pages.test.ts` yang mensyaratkan gerbang). (d) **Yang tetap**: modul Absen dan "pakai absen" per sesi (Admin WAM 2026, Rundown), Absen mode tablet (keputusan 39), daftar Catat manual panitia, catatan kehadiran (`mw_attendance`; absen wajah tercatat `manual`, bisa dibatalkan panitia), aturan jendela (30 menit sebelum mulai sampai 30 menit sesudah selesai), kartu BOD "Hadir x dari y", dan baris "Hadir 07.52" di kartu Sekarang dan Detail sesi begitu tablet atau panitia mencatat orangnya (peserta tetap melihat bahwa ia terhitung); sebelum tercatat Detail sesi satu baris tenang "Absen lewat scan wajah di tablet pintu ruang" (`absen.tabletLine`, id dan en); setelah jendela tanpa catatan: "Tidak tercatat hadir · Hubungi panitia" seperti biasa. (e) **Kode QR tidak dihapus** (pemindai, halaman token, API, PDF A5, antrean luring, tesnya): tes alurnya dijalankan dengan saklar menyala (`qr: true` pada `nowView`, `absenSlot`, `moduleSlot`, `AbsenManual`, `OnboardingScreen`; `vi.mock` saklar di tes gerbang dan API), dan keadaan tersembunyi dites sendiri. Catatan: aturan "ceklis lengkap sebelum absen" hanya menjaga pemindaian QR; tablet tidak memeriksanya (kalimat di Ceklis "Wajib lengkap sebelum absen" belum diubah, perlu keputusan pemilik). Pratinjau: `/dev-preview/wam2026/peserta/beranda?hari=2&jam=10:05` (tersembunyi) dan `&qr=1` (menyala), `/dev-preview/wam2026/peserta/sesi?sesi=pemaparan&jam=07:30` (`&qr=1`, `&status=hadir`) | pemilik memutuskan absen acara hanya scan wajah di tablet panitia di pintu ruang (tanpa QR cetak dan daftar kertas), tapi ingin jalan mundur bila tablet bermasalah di lapangan: sembunyikan, kode tetap, satu saklar |

## 10. Belum diputuskan / perlu tindak lanjut

- **Manifest dan ikon PWA Main WAM**: slot `icon` sudah ada di tema; manifest `/wam` masih Pra WAM.
  iOS tidak mengganti ikon setelah dipasang (RISET §5): tetapkan ikon sebelum mengajak peserta memasang.
- **Push otomatis saat Silent Meeting/voting dibuka oleh jam** (tanpa aksi panitia) butuh pemicu
  terjadwal (cron); saat ini kabar hanya bisa dikirim saat panitia bertindak.
- **Cache pengaturan dan daftar orang lintas permintaan** (tag + `revalidateTag`, atau TTL 60 detik) belum
  dipakai. Gate kini 6 kueri per permintaan (S5); `mainWamPeople()` (nama dan foto semua orang) masih dibaca
  per permintaan di layar yang memakainya.
- **`theme-color`**: mengikuti pilihan Tampilan perangkat (Terang `#F6F7F9`, Gelap `#0E1116`, Sistem: keduanya
  menurut skema HP), dibaca server di `acara/layout.tsx`. Momen dan kamera tidak lagi gelap sendiri: seluruh chrome
  kamera dan pemindai QR mengikuti tema (hanya video langsung yang alami), jadi meta tidak berubah saat kamera dibuka.
- **`acara/error.tsx` untuk Masuk** (T-S02): Masuk belum punya batas galat sendiri; galatnya jatuh ke halaman
  galat situs.
- **Pengumuman bernada peringatan dari K06**: `NoteInput.tone` sudah ada; K06 (C) belum memberi pilihan,
  jadi nada mengikuti `noteTone` (judul yang menyebut perubahan).
- **Offline untuk panduan dan data pribadi** (RISET §12) perlu persetujuan, karena `sw.js` sengaja tidak
  menyimpan halaman pribadi.
- **Aturan lifecycle R2 untuk unggahan sementara (wajib sebelum Momen dipakai, disetel pemilik sekali).**
  Foto Momen diunggah ke `tmp/main-wam/momen/` dan baru dipindah ke `main-wam/momen/` saat disimpan. Unggahan
  yang tidak pernah disimpan (aplikasi ditutup di tengah kirim, galat jaringan, penyalahgunaan) tinggal di
  `tmp/`. Kode tidak bisa menyetel aturan bucket (token R2 aplikasi hanya baca/tulis objek), jadi pemilik
  menambah satu aturan:
  1. Dashboard Cloudflare → **R2 object storage** → pilih bucket yang dipakai aplikasi (nilai `R2_BUCKET`).
  2. **Settings** → **Object Lifecycle Rules** → **Add rule**.
  3. Nama: `hapus-unggahan-sementara`. Prefix: `tmp/` (dengan garis miring). Aksi: hapus objek setelah **1** hari.
  4. **Save changes**. Periksa di daftar aturan bahwa prefiksnya `tmp/`, bukan kosong (kosong = semua foto terhapus).
  - Lewat Wrangler (sama hasilnya): `npx wrangler r2 bucket lifecycle add <R2_BUCKET> hapus-unggahan-sementara tmp/ --expire-days 1`,
    lalu `npx wrangler r2 bucket lifecycle list <R2_BUCKET>`.
  - Cloudflare menghapus objek biasanya dalam 24 jam setelah umurnya lewat, jadi unggahan yatim hidup paling lama
    ±2 hari. Prefiks `tmp/` boleh dipakai fitur lain untuk unggahan sementara.
  - Tanpa aturan ini Momen tetap berjalan, hanya unggahan yatim tidak pernah terhapus (audit L4).
- **Kuis live: polling yang lebih murah.** Setiap polling HP menjalankan gerbang penuh (6 kueri) ditambah 1–4 kueri
  kuis; 120 HP × 1 polling per 1,5 detik ≈ 560 kueri per detik saat soal berjalan. Belum diuji beban. Pilihan bila
  terlalu berat: cache pengaturan dan peran lintas permintaan (TTL beberapa detik), tiket bermain bertanda tangan
  setelah Ikut, atau Supabase Realtime Broadcast sebagai tanda (rancangan §8).
- **Uji SQL lama yang gagal** (bukan Main WAM, juga gagal tanpa migrasi Main WAM): `pra-wam-appraisal`,
  `pw-tv`, `pw-tv-playlist`, `pw-tv-welcome`, `rsvp-needs`, `wam-cards`, `wam-questionnaire`.

---

## 11. Bahasa: Indonesia / English (agen i18n, 18 Nov 2026)

Peserta bisa memilih **Indonesia** (bawaan) atau **English** di Saya → Pengaturan → "Bahasa / Language", per
perangkat. Mengganti langsung mengubah label (konteks klien) lalu `router.refresh()` supaya yang ditulis
server (tanggal, kartu Sekarang) ikut. Tanpa muat ulang penuh.

**Keputusan:** bahasa disimpan di **cookie `mw_lang`** (`id`|`en`, setahun, `SameSite=Lax`, ditulis browser),
bukan di alamat. Alasan: satu alamat per layar (QR absen, tautan notifikasi, PWA terpasang) tidak berubah
dan tidak perlu Proxy atau pengalihan; dokumen Next 16 untuk i18n lewat sub-path memaksa semua alamat
berawalan bahasa. Tanpa dependensi baru (kamus objek biasa, ±0 KB library).

| Lapisan | Lokasi | Isi |
| --- | --- | --- |
| Kamus | `src/lib/main-wam/i18n/{id,en}.ts` (+ `id/`, `en/` per area: `common`, `peserta`, `momen`, `modul`) | `id` = sumber dan tipe kunci (`MessageKey`); `en` = `Record<MessageKey, string>`, jadi kunci yang kurang gagal di `tsc`. Kunci `area.nama`; 737 kunci |
| Fungsi | `i18n/translate.ts`, `format.ts`, `types.ts`, `active.ts` | `t(lang, key, vars)`; `{n}` = nilai; jamak `{n, plural, one {# foto} other {# foto}}` (`#` = angka); `clock/shortDate/monthName/number` per bahasa, jam selalu WIB (ID `08.00`, `Sel, 5 Jan`; EN `08:00`, `Tue, 5 Jan`); `translateKnown(lang, teks)` |
| Server | `src/lib/server/main-wam/lang.ts` | `readLang()` (cookie, `id` bila hilang/aneh/di luar permintaan), `serverT()`. Loader peserta membacanya sendiri |
| Klien | `src/components/main-wam/i18n/` | `LangProvider` (dipasang di `acara/layout.tsx`, membungkus `<div lang display:contents>` sehingga atribut `lang` mengikuti), `useLang()`, `useT()`, `useKnown()`, `<Words k="…"/>`, `LanguageSetting` |

**Aturan menulis teks baru (wajib):**
1. Tidak ada teks tetap di komponen peserta: tambahkan kunci ke `id/<area>.ts` **dan** `en/<area>.ts` (tes
   `i18n.test.ts` gagal bila kunci, variabel `{…}`, atau jamak tidak sama, bila ada teks kosong, atau teks EN
   masih sama dengan ID). Teks Indonesia tidak boleh berubah saat dipindah: tes lama membacanya.
2. Komponen klien: `const t = useT()`. Komponen server yang tidak bisa pakai hook: jadikan "use client"
   (ingat ekspor non-komponen dari berkas client menjadi referensi klien bagi importir server; pindahkan
   helper ke lib) atau `<Words k="…"/>`. Fungsi non-hook di klien: `t(activeLang(), key)`.
3. Fungsi lib murni yang menghasilkan teks menerima parameter akhir `lang: Lang = "id"` (default id, tes
   lama tidak berubah); loader/halaman server memanggil `readLang()` dan meneruskannya.
4. Teks yang ditulis server/library bersama dalam Indonesia dan tampil di layar peserta: taruh teks
   **persisnya** sebagai kunci (`srv.*`) lalu tampilkan lewat `useKnown()` / `failText` (`translateKnown`).
5. Istilah baku EN: Home, Agenda, Moments, Me; Group; Check in; Mosaic; Silent Meeting; Awarding.
6. Pratinjau: `?lang=en` lewat `previewLang(params)` (`components/main-wam/dev/lang.ts`), `Frame`/`DevFrame` menerima `lang`.

**Tetap Indonesia (belum diterjemahkan, sengaja atau belum sempat):**
- Seluruh layar **panitia, BOD, dan Admin WAM** (kecuali judul tab dan hub: "Panitia" / "Committee", kunci `shell.tab.panitia` dan `screen.committee`) (Rundown live, Absen manual, Pengumuman, Moderasi, Ringkasan,
  Kehadiran, rekap Silent Meeting, persetujuan Awarding, QR cetak); judul bilahnya juga Indonesia.
- **Isi dari admin/pengguna**: judul dan tempat sesi, urutan tampil, dress code, "yang perlu dibawa", isi Panduan,
  pengumuman, nama kelompok/kamar/lantai, judul kategori dan nominasi, pertanyaan Silent Meeting, alasan
  penyembunyian foto. Label tetap, bulan/hari, dan pesan sistem diterjemahkan.
- **Notifikasi yang ditulis server saat dikirim** (judul dan isi tersimpan Indonesia, mis. "Jadwal berubah",
  "Fotomu disembunyikan sementara"): hanya label jenis dan waktunya yang ikut bahasa.
- `metadata.title` halaman (judul tab browser), pesan validasi zod yang tidak masuk daftar `srv.*`,
  `sourceProblem` (foto profil) dan teks Pra WAM yang dipakai bersama.
- **Tampilan** (Terang/Gelap/Sistem dan catatannya, milik agen tema) dan **Bantuan** (halaman baru) belum
  dihubungkan ke kamus saat tugas ini selesai; tinggal memakai `useT()` dengan kunci baru.
- Langkah panduan pasang WAM (`lib/pra-wam/install.ts`, dipakai Pra WAM) tetap Indonesia di sumbernya; Main
  WAM menerjemahkannya lewat `translateKnown` (kunci `install.*`, dites harus persis sama dengan sumbernya).

**Berkas bersama yang diubah agen i18n (aturan emas 1), semuanya kompatibel mundur (parameter `lang` opsional):**
`src/lib/main-wam/{screen,greeting,rundown}.ts` (`mainWamScreen(path, lang)`, `homeGreeting(…, lang)`,
`eventDayLabel/dayWord/timeRange(…, lang)`), `src/lib/main-wam/peserta/*`, `acara/layout.tsx`,
`acara/(app)/layout.tsx`, `acara/not-found.tsx`. Tes: `i18n/i18n.test.ts`, `i18n/i18n.dom.test.tsx`,
`peserta/peserta.i18n.test.ts`, `server/main-wam/lang.test.ts`, `modul/modul.i18n.dom.test.tsx`, `momen/momen.i18n.dom.test.tsx`.

## 12. Mode demo (data contoh, 18 Nov 2026)

Tujuan: pemilik bisa melihat SEMUA layar Main WAM di HP dengan data contoh sebelum acara, tanpa mengisi CMS dan tanpa mengubah data nyata.

- **Bendera:** Admin WAM 2026 → Pengaturan → "Mode demo (data contoh)". Disimpan di `mw_settings.module_config.demo` (jsonb yang sudah ada; **tanpa migrasi**). Hanya `true` yang menyalakan. Bawaan mati.
- **Yang berubah saat menyala** (hanya apa yang digambar; yang tersimpan tidak ditulis ulang, Admin membaca `mainWamSettingsState`):
  - semua modul tampil menyala, kecuali Silent Meeting (milik Pra WAM, ikut pilihan tersimpan); kelompok dianggap terbit;
  - banner kecil "Mode demo · data contoh" di atas bilah atas (`MainWamShell demo`);
  - pembaca server memakai data `sample.ts` **hanya bila tabelnya kosong**: sesi (rundown), kelompok, kelompok kegiatan, perjalanan + kursi, panduan (tanpa berkas), awarding (tanpa kategori foto), riwayat rundown, absen, notifikasi + pengumuman sematan, foto Momen + reaksi + hitungan per sesi + Mozaik (isi sebagian), Ringkasan BOD, Kehadiran, Perlu perhatian, Moderasi, pengumuman terkirim, jejak karbon (tagihan contoh), hotel + kontak. Foto contoh tanpa gambar dan tanpa URL luar (`src` null, layar menggambar `PhotoFill`). Nama samaran saja.
  - Tanggal contoh digeser supaya hari ke-2 rundown contoh = hari ini (WIB), jadi "sedang berlangsung" dan "berikutnya" nyata. Tanggal acara ikut hanya selama rundown nyata kosong (`settings.sampleRundown`).
  - "Aku" di data contoh (Rani) = orang yang membuka. Daftar nama contoh bisa dicari lewat `mainWamPeople` (orang nyata tidak pernah tertimpa).
  - Tampilan Admin (Rundown, Awarding, Kelompok, dst.) **tidak pernah** memakai data contoh (`allSessionsReal`, `listGroupsReal`, `rundownLogReal`, `listGuides(true)`, `awardCategories(true)`).
- **Lihat sebagai** (Saya, kartu "Mode demo", hanya untuk penguji = admin, panitia, daftar penguji; sesuai `mainWamGate`): Peserta / Panitia / BOD, disimpan per perangkat di cookie `mw_demo_role` (Path `/`, karena API membacanya juga). `viewerOf` memakainya hanya bila demo menyala **dan** orangnya penguji; cookie orang lain diabaikan. Hasilnya: `viewer.roles` = peran pilihan (tab Panitia, Beranda, Ringkasan BOD mengikuti), `viewer.demo = { canSwitch, role, simulated, realRoles }`. Tanpa demo, `viewer.demo` tidak ada dan tidak ada yang berubah.
- **Gate (tetap benar):**
  - hak sebenarnya ada di `realRoles`; peserta biasa bukan penguji tidak pernah mendapat pengalih, jadi tidak pernah membuka halaman/API panitia atau BOD;
  - peran semu **hanya membaca**: `requireMainWamApi` menolak (403, "Contoh: tidak disimpan…") setiap permintaan tulis (yang selalu membawa `Origin`, dipaksa oleh `checkOrigin`) dari viewer `simulated`. Dipilih "diblokir dengan pesan ramah", bukan sukses palsu;
  - selama rundown contoh dipakai (`sampleRundown`), tulis dari **siapa pun** ditolak (semua id di layar milik contoh);
  - data panitia yang menyebut nama orang (Moderasi, pengumuman terkirim, daftar hadir per sesi) untuk peran semu tanpa hak asli: **contoh saja**, tanpa satu pun query nyata (`sampleOnlyFor`). Angka agregat (Ringkasan BOD, Kehadiran, Perlu perhatian) tetap membaca data agregat nyata dengan cadangan contoh.
- **Tes:** `demo.test.ts` (bendera, peran efektif, jam contoh), `server/demo-server.test.ts` (pengaturan, peran, cadangan, data nyata tetap nyata), `server/demo-gate.test.ts` (gate, tulis diblokir, tanpa demo = lama), `components/main-wam/demo/demo.dom.test.tsx` (pengalih, banner), `MainWamSettings.dom.test.tsx` (sakelar, kartu "Siapa panitia?").
- **Dipakai:** nyalakan sakelar, buka Saya → "Mode demo" → pilih peran. **Matikan sebelum acara** (sebelum mode "semua").

## 13. Kuis live (modul `kuis`, 20 Nov 2026)

Kuis pilihan ganda yang dimainkan bersama saat sesi WAM: soal di layar besar dan di HP, peserta menjawab sebagai
tokohnya. Produk: `docs/rancangan-kuis-wam.md` (§8a = yang dibangun). Agen F; migrasi `202611200601_main_wam_kuis.sql`.

- **Modul** `kuis` di `mw_settings.modules`, bawaannya mati. Modul mati: halaman dan API 404, tanpa kartu, layar besar
  "tidak ditemukan". Mode demo menyalakannya seperti modul lain, tetapi tanpa kuis contoh (kartu hanya untuk permainan
  nyata); selama rundown contoh dipakai, Ikut, jawaban, dan aksi MC ditolak seperti semua penyimpanan (§12).
- **Gerbang:** halaman `requireModulePage("kuis", …)`, API `requireModuleApi("kuis")`. Pemain = semua yang boleh melihat
  Main WAM (BOD juga). Pengendali = `mw_quiz_hosts` per kuis atau akun WAM pemegang Admin WAM 2026 (`holdsWamAcara`, §15); Panitia WAM saja dan peran admin Pra WAM tidak cukup; selain itu kendali 404 (§9 #19).
  Peran panitia saja tidak cukup.
- **Layar besar** `/kuis/{kunci}` dan `/api/kuis/{kunci}`: publik seperti TV kantor, di luar `/wam` (tanpa sesi, tanpa
  service worker), kunci acak `kuis_` + 32 byte, hanya sha256 yang disimpan, noindex dan no-referrer, hidup hanya saat
  modul menyala. Tema Main WAM (warna dan font judul dari Admin, tanpa gambar KV), gelap bawaan, `?mode=light` untuk ruangan
  terang; kanvas 1920 × 1080 yang diskalakan.
- **Rahasia sampai jam buka:** kunci jawaban, sebaran, dan skor sebuah soal hanya keluar dari server setelah
  `answerOpen` (jam buka soal + waktu soal + 2 detik, jeda tidak dihitung). Pembangun potret keadaan murni di
  `src/lib/main-wam/kuis/snapshot.ts` (dites). Nama asli hanya di podium layar besar untuk tempat yang sudah dibuka MC.
- **Notifikasi** "Kuis dimulai" saat MC membuka lobi: `trySendMainWamNote` jenis `kuis` (baru di `NOTE_KINDS` dan
  `mw_notes.kind`), topik push `pengumuman` yang sudah ada (`notePushTopic`), tanpa topik baru, dikirim setelah balasan
  (`after`).
- **Polling**, bukan Realtime: 1,5 detik selama permainan (lebih jarang saat diam) + satu permintaan tepat saat jawaban
  dibuka; HP mengirim versi (`?v=`), yang tidak berubah dijawab jamnya saja. Kueri per polling HP: gerbang (6) + 1
  (tidak berubah; 2 di lobi) sampai 4 (saat jawaban dibuka). Gerbang yang lebih murah untuk polling ini belum ada (§10).
- **Berkas bersama yang diubah agen F** (aturan emas 1): `types.ts` (`MAIN_WAM_MODULES` + `kuis`, `NOTE_KINDS` + `kuis`),
  `modules.ts`, `screen.ts` (layar tugas `/kuis/{id}` dan `/kuis/{id}/kendali`), `notify.ts`, `routes.ts` (`mainWamPath.quiz`,
  `quizControl`, `mainWamApi.quiz*`, `mainWamAdminPath.quizzes/quiz`, `mainWamAdminApi.quiz*`, `kuisScreenPath/Api`),
  `sections.ts` + `tabs.ts` (tab Kuis live di Modul acara), `theme.module.css` (token `--mw-kuis-d` dan `--mw-on-kuis`
  untuk label Kuis; token warna opsi dan medali dihapus 25 Nov, Kuis live hanya memakai warna tema, §9 #38), Beranda (`BerandaScreen` slot `kuis` di atas
  Sekarang, dipasang di `(app)/page.tsx`), N01 (ikon dan kata jenis `kuis`), `sample.ts` (modul contoh menyala).
- **Pratinjau:** `/dev-preview/wam2026/kuis?layar=hp-…|kendali-…|layar-…` (lihat berkasnya), `/dev-preview/wam2026/kuis/admin`.

## 14. Main WAM tersembunyi dari Journey (20 Nov 2026)

Keputusan pemilik: panitia dan admin Pra WAM bukan tim WAM, jadi Main WAM (termasuk Kuis live) tidak terlihat di
Journey sampai **super admin** menekan **Tampilkan WAM 2026** di Super admin → Halaman utama (`/admin/super/beranda`).
Bawaannya **tersembunyi**. Disimpan di `admin_settings.main_wam_shown` (+ `main_wam_shown_at`, `main_wam_shown_by`;
migrasi `202611200602_main_wam_visibility.sql`). Sebelum migrasi, tanpa basis data, atau saat kolom tidak terbaca: tersembunyi.
Hanya super admin yang bisa mengubahnya (`PUT /api/admin/wam2026-tampil`, `requireSuperAdmin`). Siapa dan kapan dicatat
di baris itu dan di log server.

**Sejak dua pintu admin (20 Nov 2026, §15) tombol ini hanya untuk sisi aplikasi**: ke mana `/wam` pergi dan siapa
penerima notifikasi Main WAM. Admin WAM 2026 tidak pernah disembunyikan olehnya, dan Admin Pra WAM tidak pernah berisi
Main WAM (menu, tautan, Ringkasan, pencarian), ditampilkan maupun tidak (`hiddenMainWamSections` dihapus).

Selama tersembunyi:
- **Aplikasi:** `/wam` tidak pernah mengalihkan ke `/wam/acara`, apa pun mode acaranya (`mainWamHomeTarget`). Pra WAM
  tidak punya kartu atau tautan ke Main WAM (dites). `/wam/acara/**` tetap terbuka lewat tautan langsung menurut mode
  (pra/uji: penguji; semua: semua orang).
- **Halaman utama Journey** tidak menyebut Main WAM, Kuis, atau fitur acara WAM, tersembunyi maupun ditampilkan (dites di
  `home-privacy.test.ts`).
- **Notifikasi** (`sendMainWamNote`, termasuk "Kuis dimulai"): hanya ke **penguji** (daftar `mw_testers` dan Panitia WAM,
  §15), bukan ke panitia atau admin Pra WAM karena perannya, apa pun mode acaranya. Kabarnya disimpan sebagai `pw_announcements.kind
  = 'sesi'` dengan label "Penguji WAM 2026", jadi tidak masuk daftar pengumuman terkirim Pra WAM, angka BOD, atau papan
  pengumuman TV kantor. Main WAM tidak mengirim apa pun lewat Telegram.
- Pengaturan dan Ringkasan Admin WAM 2026 menampilkan catatan bahwa Main WAM sedang tersembunyi.

Setelah ditampilkan: semuanya kembali seperti sebelumnya (§2, §3, §4.1). Tes: `src/lib/main-wam-visibility.test.ts`,
`gate.test.ts`, `foundation-server.test.ts`, `src/app/api/admin/wam2026-tampil/route.test.ts`,
`src/app/wam/pra-wam-hides-main-wam.test.ts`, `src/app/home-privacy.test.ts`, `MainWamVisibility.dom.test.tsx`.

## 15. Dua pintu admin dan Panitia WAM (20 Nov 2026)

**Nama yang terlihat** (keputusan pemilik, 20 Nov 2026): acaranya bernama **WAM 2026** (diadakan 5–8 Jan 2027). Semua
teks yang dilihat orang memakai "WAM 2026" (aplikasi acara, mode "WAM 2026 (uji)/(semua)", tombol "Buka WAM 2026" dan
"Tampilkan WAM 2026", label "Penguji WAM 2026") dan pintu adminnya **Admin WAM 2026** di `/admin/wam2026`. "Main WAM"
hanya nama internal: kode (`mainWam*`, `MainWam*`), folder `src/lib/main-wam` dan `src/components/main-wam`, tabel `mw_*`,
kolom `admin_settings.main_wam_shown`, dan dokumen ini. Kunci hak `wam_acara` dan berkas migrasi 0603 juga tetap. Alamat
aplikasi peserta tetap `/wam/acara` (di dalam lingkup PWA `/wam`).

Keputusan pemilik: panitia dan admin Pra WAM bukan tim WAM. Admin dibagi dua pintu dengan hak terpisah, dan panitia
Main WAM dipisahkan dari panitia Pra WAM. Migrasi `202611200603_admin_wam_acara.sql` (area F).

**Pintu**

| Pintu | Alamat | Hak (`admin_grants.apps`) | Isi |
| --- | --- | --- | --- |
| **Admin Pra WAM** (dulu "Admin WAM"; `PRA_WAM_ADMIN_LABEL`) | `/admin/wam/**`, `/api/admin/wam/**` (tidak berubah) | `wam` (+ `kuesioner`, `tv` seperti sebelumnya) | Akun dan peran, Kuesioner, Data karyawan (super admin), Ruang, TV, Telegram, Tema, Akses MCP. **Tidak ada Main WAM sama sekali** (menu, tautan, Ringkasan, pencarian; dites `main-wam-visibility.test.ts`, `pra-wam-hides-main-wam.test.ts`) |
| **Admin WAM 2026** (`WAM_EVENT_ADMIN_LABEL`, satu konstanta di `src/lib/admin-access.ts`) | `/admin/wam2026/**`, `/api/admin/wam2026/**` | `wam_acara` | Ringkasan, Pengaturan (mode, modul, penguji, tema), Panitia WAM, Isi acara (Rundown, Kamar, Perjalanan, Panduan, Info acara), Modul acara (Awarding, Silent Meeting, Kuis live) |

- Alamat lama `/admin/wam/main` dan `/admin/wam/main/**` dialihkan (`next.config.ts`, tidak permanen) ke alamat baru dan
  diperiksa di sana. API lama `/api/admin/wam/main/**` dihapus.
- **Siapa membuka apa** (`areaOfPath` + `mayOpenArea`, `requireAdminPage` → `notFound()`, `requireApiAdmin` → 403, pola
  yang sama untuk semua area): pemegang `wam` saja → 404/403 di semua halaman dan API Admin WAM 2026; pemegang `wam_acara`
  saja → tidak bisa membuka Admin Pra WAM; super admin → keduanya. Tidak ada yang mendapat `wam_acara` otomatis.
- **Sebelum migrasi 0603** cek `admin_grants.apps` belum mengenal `wam_acara`: menyimpan akses itu dijawab 503 "menunggu
  migrasi", Akses admin menampilkan catatan dan kotaknya terkunci (`wamAcaraMigrated`), jadi hanya super admin yang membuka
  Admin WAM 2026.
- Halaman utama admin: kartu **Main WAM** (`standaloneApps`, kunci `wam_acara`) hanya untuk pemegang `wam_acara` dan super
  admin (`showsAppCard`); kartu WAM (Pra WAM) seperti sebelumnya. Super admin punya tautan ke kedua pintu.
- Akses MCP tidak berubah: alat MCP (`src/lib/server/pra-wam/mcp-tools.ts`) tidak membaca data Main WAM (`mw_*`) sama sekali.

**Panitia WAM** (`pw_event_staff`)

- Tabel `pw_event_staff(event_id → pw_events, employee_id → employees, seksi ≤ 40, granted_at, granted_by ≤ 150)`, kunci
  `(event_id, employee_id)`, hapus berantai bila acara atau orangnya dihapus; khusus server (RLS on, revoke
  `public, anon, authenticated`, grant `service_role`). Uji SQL: `tests/backend/admin-wam-acara-check.sql`.
- Admin WAM 2026 → **Panitia WAM** (`/admin/wam2026/panitia`, `StaffAdmin`, API `mainWamAdminApi.committee`,
  `committeeMember(id)`): tambah (atau ganti seksi), ubah seksi, hapus. Seksi hanya label (saran: Acara, Kamar, Konsumsi,
  Dokumentasi, Transportasi, Perlengkapan; boleh kosong atau diketik bebas); semua seksi berhak sama. BOD ditolak (422),
  orang di luar Data karyawan aktif 404, belum ada acara WAM 409. Orang tanpa akun WAM aktif boleh dicatat, ditandai
  "Belum punya akun WAM".
- Server: `src/lib/server/main-wam/staff.ts` (`wamStaff` sekali per permintaan, satu kueri dengan `pw_events!inner(kind)`
  = `wam`; `wamStaffIds` gagal lunak untuk gerbang; `listWamStaff`, `saveWamStaff`, `removeWamStaff`, `wamAcaraMigrated`,
  `holdsWamAcara`). Sebelum migrasi: Panitia WAM kosong (Main WAM hanya punya penguji di daftar), penulisan 503.

**Di Main WAM (`/wam/acara/**`) semua yang dulu memakai `panitia`/`admin` global diganti**

| Hal | Sekarang |
| --- | --- |
| Panitia (tab Panitia, alat panitia, `mainWamCan` "kelola"/"silent-kontrol", hitungan, pengumuman "Panitia saja") | Panitia WAM acara WAM (`mainWamRolesOf`, `mainWamEventPeople().panitia`) |
| Penguji (`isTester`, mode `pra`/`uji`) | `mw_testers` + Panitia WAM |
| Pengendali kuis (`isQuizHost`, kartu "Kendalikan kuis") | `mw_quiz_hosts` per kuis + akun WAM yang memegang hak `wam_acara` (`holdsWamAcara`, padanan hak Admin WAM 2026 di sisi aplikasi; super admin tidak punya akun WAM jadi tidak termasuk). Panitia WAM saja tidak cukup |
| Penerima notifikasi Main WAM (`mainWamAudience`) | mode `semua` dan sudah ditampilkan (§14): semua akun aktif; selain itu penguji (daftar + Panitia WAM) |
| BOD | tetap dari peran BOD akun |

Pra WAM tidak berubah: panitia dan admin Pra WAM tetap dari `pw_roles` di Pra WAM, Akun dan peran, dan Admin Pra WAM.
Tes: `src/lib/admin-access.test.ts`, `src/components/admin/wam-acara/sections.test.ts` (pintu, halaman, API, pengalihan),
`AdminGrants.dom.test.tsx`, `src/lib/main-wam/access.test.ts`, `src/lib/server/main-wam/staff.test.ts`,
`demo-server.test.ts`, `foundation-server.test.ts`, `gate-cost.test.ts`, `kuis/kuis-server.test.ts`, `panitia/access.test.ts`,
`modul-access.test.ts`. Pratinjau: `/dev-preview/wam2026/admin/ringkasan`, `/dev-preview/wam2026/admin/panitia`
(`?isi=kosong`, `?migrasi=belum`, `?acara=belum`), dan halaman `/dev-preview/wam2026/admin/*` lain dalam bingkai baru.

## 16. Misi, poin, dan Peringkat (S2, 21 Nov 2026)

Keputusan pemilik: tiap peserta punya **misi** bernilai **poin**; kartu **Misi** di Beranda, halaman **Misi**, halaman **Peringkat**. Modul `misi` (mati bawaan; bukan untuk BOD, yang tidak ikut dan tidak diperingkat). Aturan poin dan radius belum final: semuanya setelan admin dengan nilai awal contoh.

| Hal | Aturan |
| --- | --- |
| Data | Migrasi `202611260001_main_wam_misi.sql`: `mw_mission_settings` (satu baris: radius bawaan 50 m, ketelitian lokasi terburuk 100 m, Peringkat terbuka), `mw_missions`, `mw_mission_completions` (satu per orang per misi, bukti foto/lokasi, status `menunggu`/`disetujui`/`ditolak`), `mw_point_entries` (catatan poin), view `mw_point_totals`. Uji SQL: `tests/backend/main-wam-misi-check.sql` (belum dijalankan, tidak ada kontainer). |
| Poin | **Catatan, bukan saldo.** Satu penyelesaian `disetujui` = satu baris catatan senilai poin misi saat itu (trigger `mw_completion_points`); status lain = tanpa baris, jadi menolak mengembalikan poin dan menyetujui lagi tidak menggandakan. Poin manual = baris `manual` dengan alasan. Mengubah poin misi tidak mengubah yang sudah diberikan. |
| Jenis | `foto`: foto langsung dari kamera (tanpa galeri), lokasi wajib; bila misi punya titik, foto harus di dalam radius. `checkin`: titik + radius wajib, dinilai di server. `sesi`: sesi terpilih; dicatat **panitia** (Admin WAM 2026 → Misi → Catat selesai) atau **otomatis dari absen** (`credit = absen`, dikreditkan saat orang itu membuka Beranda atau Misi). Misi foto bisa `review` (poin masuk setelah admin menyetujui). |
| Lokasi | HP mengirim koordinat; **server** menilai (`judgePosition`): koordinat sah, ketelitian ≤ batas, jarak ≤ radius. Koordinat misi **tidak pernah** dikirim ke HP; layar bertanya ke `POST …/cek` dan memakai jawabannya (jarak, di dalam atau tidak). Tidak melawan GPS palsu: misi yang rawan dicurangi pakai `review` atau sesi. |
| Foto misi | Dua langkah seperti Momen (`unggah` lalu `simpan`), dua JPEG (besar, kecil) lewat `prepareMomenPhoto`, ke `tmp/main-wam/misi/` lalu `main-wam/misi/`; id dari HMAC orang+misi+`clientId`; token 15 menit; posisi dinilai ulang di `simpan`. Bukan di Momen, hanya dilihat admin (alamat sementara). Kamera: **hanya aliran langsung** (`getUserMedia`), tanpa `<input type=file>`/`capture`, jadi galeri tidak bisa dipilih. |
| Peringkat | `rankPeople`: peringkat kompetisi (poin sama berbagi tempat: 1, 2, 2, 4), orang acara = `mainWamAttendees()` (tanpa BOD). Yang keluar hanya **nama panggilan, singkatan departemen, poin**, dan penanda baris sendiri; tanpa id. Admin melihat nama lengkap. Admin bisa menutup Peringkat. |
| Alamat | Halaman: `mainWamPath.missions`, `missionRank`, `missionDo(id)`. API: `mainWamApi.missions`, `leaderboard`, `missionCheck`, `missionCheckIn`, `missionPhotoStart`, `missionPhotoConfirm`. Admin: `mainWamAdminPath.missions`, `mainWamAdminApi.missions…`. Aksi `misi` di `access.ts` (peserta, panitia, admin; bukan BOD; modul `misi`). |
| Demo | Selama tabel misi **kosong** dan Mode demo menyala: lima misi contoh prototipe (dua selesai) dan 118 orang karangan (peserta ke-7, 340 poin). Kamera dan check-in demo memakai posisi contoh dan tidak menyimpan apa pun. |
| Belum | Notifikasi ke peserta saat bukti ditolak/disetujui dan saat misi baru dibuka (`NoteKind` belum punya jenis misi); panitia mencatat sesi dari aplikasi (kini lewat Admin WAM); berkas foto lama yang diganti kiriman ulang tidak dibersihkan. |

## Misi dirancang ulang: hanya foto, TNC, tag, verifikasi (24 Nov 2026, permintaan pemilik)

Semua misi baru **dikonfirmasi lewat foto**. Jenis `checkin` dan `sesi` tetap ada di kode dan Admin (tandai "lama") supaya misi yang sudah dibuat tidak rusak; tidak ada di templat dan demo. Keputusan: tidak dihapus karena Admin belum diminta memutuskan; hapus resmi setelah pemilik memastikan tidak ada yang memakainya.

- **TNC per misi** (`mw_missions.rules`, jsonb; `src/lib/main-wam/misi/rules.ts`): `foto_langsung`, `lokasi {name, latitude, longitude, radiusM}`, `tag {count, relation: bod|sebangku|sekamar|departemen_lain|siapa_saja, required}`, `pose {label, text}` (dibaca verifikator), `waktu {start, end}`, `batas_kali {times}`. Tampil sebagai chip di kartu dan daftar di sheet misi (teks dari kamus id/en). Titik lokasi tidak pernah dikirim ke HP (rules publik: nama + radius). Lokasi dan waktu pada rules juga disalin ke kolom lama (pengecekan posisi dan jam buka memakainya). Misi tanpa rules memakai kolomnya (`effectiveRules`). **`batas_kali` = jumlah kirim, foto yang ditolak dihitung** (kolom `attempts`); satu penyelesaian per orang per misi tetap (unique).
- **Templat** (`templates.ts`, 12 misi, 300 sampai 1.500 poin; paling tinggi "Foto bareng KEDUA BOD"): dipakai demo dan "Mulai dari templat" di Admin → Misi. Tempat dan jam di templat hanya contoh.
- **Poin x10 (24 Nov 2026):** semua nilai poin misi dikali 10. Batas kolom `mw_missions.points` dan `mw_point_entries.points` naik ke 100.000 (migrasi `202611300002`, LOCAL REVIEW ONLY); misi yang sudah dibuat admin tidak diubah otomatis. Angka tampil dengan pemisah ribuan sesuai bahasa ("3.400" / "3,400").
- **Daftar Misi:** tiga kelompok (Belum, Menunggu, Selesai) dengan kartu seragam (judul, ringkasan, poin, status, 3 chip TNC + "+N"). Detail, TNC lengkap, status, dan tombol hanya di sheet; hanya langkah kirim bukti yang berpindah halaman.
- **Kartu Beranda:** ringkasan (poin, "Peringkat N dari M" bila terbuka, "N dari M misi" dengan bar, aksi "Lihat misi"); tidak lagi memberi tahu misi berikutnya.
- **Tag**: langkah Kamera, Tag, Ringkasan (checklist TNC terpenuhi/belum/dinilai pemeriksa; Kirim terkunci selama ada yang belum). Calon tag hanya peserta aktif (`loadTagPool`): saran sekamar (`viewerRoom`), sebangku (`mw_trip_seats`: satu kereta, gerbong dan baris kursi sama), BOD. Server memeriksa ulang. Tag di `mw_photo_tags {photo_id, employee_id, tagged_by, created_at, removed_at}`; orang yang ditandai diberi tahu "Kamu ditandai di foto misi <judul>" **saat foto tampil (disetujui)**, dan melepas tagnya sendiri (`DELETE mainWamApi.missionUntag(photoId)`, daftar "Kamu ditandai" di halaman Misi).
- **Jalan bukti**: `dikirim` → `diperiksa` → `disetujui` | `perlu_ditinjau` | `ditolak` (`menunggu` = kata lama perlu_ditinjau). Dalam satu permintaan server: aturan yang bisa dicek tanpa AI (`checkRules`: lokasi, tag, waktu, batas kirim) dulu, pelanggaran = `ditolak` dengan alasan (`review_note`, tampil ke peserta, "Kirim ulang" selama batas ada); lalu verifikator. Hanya `disetujui` memberi poin (trigger `mw_completion_points` tidak diubah; tes SQL menegaskan status lain tanpa baris). Misi dengan `review` tidak pernah disetujui sendiri. Posisi di luar radius tetap 422 sebelum unggah (bukan baris ditolak). Hasil pemeriksaan disimpan di `check_result`. Keadaan `dikirim` dan `diperiksa` ada di tipe, tabel transisi (`canMove`) dan UI, tetapi sekarang dilewati (verifikator sinkron); dipakai bila penyedia AI nanti asinkron.
- **Verifikator** (`server/main-wam/misi/verifier.ts`): `VerifierInput {misi, aturan, foto{key,address}, lokasi, tag[], waktu}`, `VerifierResult {putusan: lolos|gagal|ragu, alasan[], skor?}`. Bawaan `manual` (selalu ragu: semua bukti masuk antrean tinjauan, tanpa layanan luar). Penyedia dipilih lewat env `MISI_VERIFIER`; `registerVerifier()` adalah titik pasang AI nanti (tanpa kunci di kode). Penyedia yang gagal = ragu.
- **Tinjauan**: `server/main-wam/misi/review.ts` (`listReviewQueue`, `decideReview`, dipakai Admin dan nanti layar panitia; belum ada layar panitia di aplikasi). Admin WAM → Misi → tab Tinjauan (`GET mainWamAdminApi.missionReview`, keputusan `PATCH missionCompletion`, penolakan wajib beralasan). Setuju: foto Momen tampil, orang yang ditandai diberi tahu, peserta diberi tahu; tolak: foto Momen dihapus.
- **Terhubung ke Momen**: bukti = tiga JPEG (besar, kecil, ubin); `momen/mission-photo.ts` menyalinnya ke `main-wam/momen/`, membuat baris `mw_photos` (audience semua, `mission_id`) dengan status `ditinjau` sampai disetujui (lalu `tampil`, `visible_at` = saat itu), dan menautkannya di `mw_mission_completions.photo_id`. Gagal di sisi Momen tidak membatalkan bukti (dicatat di log). Pembaca untuk UI Momen: `tagsOfPhotos(ids)` ("Bersama <nama>") dan `missionLabelsOf(ids)` ("Misi: <judul>").
- **Migrasi** `202611300001_main_wam_misi_foto.sql` (LOCAL REVIEW ONLY, pemilik yang menjalankan; butuh 202611200002 dan 202611260001): kolom `rules`, status baru, `attempts`, `photo_id`, `check_result`, `mw_photos.mission_id`, tabel `mw_photo_tags`. Tes `tests/backend/main-wam-misi-foto-check.sql`. Sebelum migrasi: bacaan jatuh ke kolom lama (rules dari kolom), kirim bukti baru dijawab 503 "menunggu pembaruan sistem", mode demo jalan tanpa DB.
- **Demo**: 12 misi contoh dengan satu keadaan tiap jenis (selesai, diperiksa, perlu ditinjau, ditolak, belum), `/dev-preview/wam2026/misi?layar=foto&langkah=tag|ringkas`, antrean tinjauan contoh di `/dev-preview/wam2026/admin-misi?tab=tinjauan`. Foto contoh: `public/wam/demo/foto-*.svg`.

## Ringkasan panitia dihapus (23 Nov 2026, atas permintaan pemilik)

Ringkasan BOD/panitia di aplikasi WAM 2026 tidak ada lagi: kartu "Ringkasan" di Beranda (B01), layar Kehadiran (B02), Rekap Silent Meeting (B05), dan Persetujuan Awarding (B06) di `/wam2026/ringkasan/*`. Alamat lama dialihkan ke Beranda (`next.config.ts`, `/wam2026/ringkasan/:path*` dan `/wam/acara/ringkasan/:path*`).
- Dihapus: halaman `(app)/ringkasan/**`, API `/api/wam/acara/ringkasan` dan `/api/wam/acara/silent-meeting/rekap`, `mainWamPath.attendanceSummary|silentRecap|awardApproval`, `mainWamApi.summary|silentRecap`, aksi `ringkasan` dan `silent-rekap`, komponen `BerandaBod`, `Kehadiran`, `AwardApproval`, `SilentRecapView`, `lib/main-wam/panitia/summary.ts`, `bodSummary`/`attendanceDay`/`silentRecap` di server, tautan "Lihat rekap" dan "Persetujuan awarding" di Detail sesi dan Silent Meeting.
- Tetap: Admin WAM 2026 (termasuk menu "Ringkasan"-nya), hub Panitia (Kelola), Absen manual, Awarding admin, Silent Meeting, Jejak karbon, dan API `awarding/{id}/setujui` beserta aksi `awarding-setujui` (kini tanpa layar di aplikasi). Peran BOD memakai Beranda dan Detail sesi seperti peserta, tanpa kartu Ringkasan.

## Profil teman sekamar (Kamar, 24 Nov 2026)

Di Kamar (L01) setiap teman sekamar (bukan diri sendiri) adalah tombol "Lihat profil <nama>". Diketuk, sheet terbuka langsung
(kepala dari daftar kamar, kerangka muat di dalamnya), lalu isinya datang dari `GET /api/wam/acara/kamar/[id]` (`mainWamApi.roommate(id)`).

- **Akses (server):** hanya teman dalam kamar yang sama (pairing HR yang dipakai layar Kamar, `viewerRoom`) dan masih aktif. Diri sendiri, orang
  di luar kamar, id tak dikenal, dan viewer tanpa kamar: semuanya **404** satu jawaban (tidak membocorkan keberadaan). 401 tanpa sesi. Batas 120 per 10 menit per orang.
- **Isi:** hanya yang keluar dari `colleagueOf` (src/lib/server/pra-wam/colleagues.ts): kartu tokoh dan jawaban bertanda **`rekan`**
  ("Rekan bisa lihat ini"); jawaban untuk fasilitator, HR, anonim, atau rahasia tidak pernah lewat. Jawaban dibangun ulang per kolom
  (`key`, `prompt`, `lines`), tanpa nama dan departemen (pertanyaan 1 dan 2, sudah di kepala), paling banyak 8 (`ROOMMATE_ANSWER_LIMIT`). Tanpa telepon atau email.
- **Belum mengisi / tabel belum ada:** 200 dengan `filled: false`: sheet menampilkan "Belum mengisi kuesioner" (nama, departemen, foto tetap tampil).
- **Mode demo:** tanpa kamar sungguhan, profil contoh (`sample-roommate.ts`, teman pertama terisi, kedua kosong). Pratinjau `/dev-preview/wam2026/peserta/kamar` (`sample`) memakainya tanpa login.
- **Berkas:** `src/lib/main-wam/peserta/roommate.ts` (tipe, pemangkasan), `src/lib/server/main-wam/peserta/roommate.ts` (`loadRoommate`), `src/app/api/wam/acara/kamar/[id]/route.ts`, `src/components/main-wam/peserta/saya/RoommateSheet.tsx`. Tes: `route.test.ts`, `roommate.dom.test.tsx`.

## Penampil foto (Mozaik, Fotoku) dan foto contoh demo (24 Nov 2026)

Ketuk **satu kotak** foto di Mozaik membuka sheet `PhotoViewerSheet` (`components/main-wam/momen/PhotoViewer.tsx`): foto besar 4:5, nama pengunggah (aturan Momen: "Fotomu" untuk milik sendiri, selain itu nama panggilan), sesi dan waktu, **Simpan foto**, dan ✕ (Tutup). Sheet terbuka langsung dengan kerangka; keterangan menyusul. Fotoku (deretan kecil di Mozaik, lihat keputusan 33) memakai penampil yang sama (di bawahnya status dan Hapus foto); kotak milik sendiri di mozaik juga memberi Hapus foto. Tumpukan dibuka di satu foto lewat `?foto=` (M02, dari toast atau catatan); **Simpan foto** ada di "…" (opsi foto) tumpukan.
- **Ketukan** (`MosaicCanvas`): tekan-lepas dalam 8 px dan 600 ms, satu jari atau mouse. Geser, cubit (jari kedua), pointercancel (gulir peramban), dan ketuk ganda (zoom; ketuk menunggu 260 ms) tidak membuka apa pun. Hanya sel huruf yang berfoto; jari memaafkan sampai 1,5 sel (sel hanya beberapa px di zoom 1x), mouse harus tepat. Papan ketik: panah memindah cincin ke kotak berfoto terdekat (di zoom, panah menggulir sampai cincin aktif), Enter membuka, Esc melepas; pembaca layar dikabari lewat region `aria-live`. Fokus kembali ke kanvas setelah ditutup. Logika murni: `lib/main-wam/momen/mosaic-pick.ts`.
- **Akses tidak dilonggarkan.** Sel di manifest hanya punya ubin; keterangan lewat `GET /api/wam/acara/momen/[id]` (**baru**, `PhotoDetail`: nama, sesi, waktu; aturan `canSee` yang sama dengan berkas dan reaksi; foto tersembunyi, dilaporkan, belum tampil, atau kelompok lain = 404; `no-store`). Foto besar lewat route berkas yang sudah ada; **unduh** = `GET …/berkas?ukuran=besar&unduh=1` (`mainWamApi.photoDownload`): pemeriksaan akses sama, hanya alamat bertanda tangan R2 yang menambah `Content-Disposition: attachment; filename="wam-2026-<8 huruf id>.jpg"` (`viewAddress(…, download)`), selalu berkas besar. Tanpa proxy byte, tanpa jalur baru yang melewati aturan. Panitia (moderasi) tetap boleh membuka berkas seperti sebelumnya.
- **Foto contoh** (Mode demo dan pratinjau): 24 SVG lokal `public/wam/demo/foto-01..24.svg` (adegan rekaan 4:5: aula, panggung, kereta, kebun apel Batu, gunung, makan bersama, tim berfoto, kota malam, senja; tanpa orang nyata, tanpa alamat luar, masing-masing < 15 KB). Galeri demo 24 foto (`demo-momen.ts`, `DEMO_PHOTOS`) dengan nama samaran, lima sesi/Umum, reaksi; ubin Mozaik memakai gambar yang sama (cache gambar kanvas per alamat, bukan per foto). Ubin contoh membuka penampil tanpa meminta server (keterangan rekaan dari `demoTileDetail`), unduh = berkas SVG-nya, nama `wam-2026-….svg`. Gambar yang gagal dimuat menampilkan pesan + Coba lagi, bukan blok kosong; gambar contoh tidak meminta alamat baru ke server saat gagal.
- **Perlu keputusan pemilik:** apakah peserta boleh menyimpan foto peserta lain (privasi)? Sekarang boleh untuk semua foto yang bisa dilihat (sama seperti melihatnya).

## Bilah bawah hanya di tab utama, lonceng hanya di Beranda, Detail sesi sebagai sheet pencegat, Beranda carousel (24 Nov 2026, permintaan pemilik)

- **Bilah bawah:** `showsBottomBar(screen)` = `level === "akar"`: Beranda, Agenda (tanpa id), Momen, Saya, dan Panitia (hub) untuk panitia. Setiap halaman yang berpindah dari tab (level `detail` atau `tugas`) tanpa bilah bawah, dengan ‹ atau ✕ di bilah atas; ruang bawah ikut (`.main` memakai `--mw-safe-bottom` bila tanpa bilah; motif latar turun ke dasar). Atribut `data-mw-hide-nav` dan `data-mw-nav` tetap.
- **Lonceng:** hanya di Beranda (`showsBell`); lonceng di kepala Agenda dihapus (prop `unread` AgendaScreen hilang). Notifikasi tetap dari lonceng Beranda, kartu pengumuman, dan tautan push.
- **Detail sesi:** parallel route + intercepting route (Next 16.4): slot `(app)/@sheet` dengan `(.)agenda/[id]/page.tsx` (sheet saja, di atas layar yang sedang terbuka: Beranda, Agenda, Notifikasi), `loading.tsx` slot itu berisi `SessionSheetLoading` saja (tanpa skeleton layar), `default.tsx` dan `[...catchAll]/page.tsx` mengembalikan null (sheet hilang saat berpindah), dan `(app)/default.tsx` memanggil `notFound()` (alamat tak dikenal tetap 404). Layout menerima `sheet`. Membuka `/wam2026/agenda/<id>` langsung (tautan notifikasi, muat ulang) memakai halaman penuh lama (Agenda hari sesi + sheet); keduanya memakai `SessionSheetServer`. `SessionSheetPending` (layout) memunculkan kerangka sheet seketika saat sebuah tautan sesi diketuk, sebelum alamatnya menjawab (dev tanpa prefetch). Shell memakai layar di belakang sheet (`isSessionSheetPath` + alamat terakhir yang bukan sesi) untuk bilah atas dan bawah, jadi Beranda tetap Beranda dengan bilahnya. Intercept bekerja dengan rewrite `/wam2026` karena `Next-Url` memakai pohon rute internal (diperiksa di sumber Next, bukan di aplikasi yang masuk).
- **Beranda:** slide Selesai/Sekarang/Akan datang jadi carousel: kartu 90 % lebar di tengah, tepi kartu sebelah mengintip, snap per kartu, **semua kartu sama tinggi** (kartu Sekarang yang menentukan; lintasan meregangkan kartu samping dengan CSS `align-items: stretch`, kartu samping memusatkan judul dan tempat dan menaruh "Detail sesi" di dasar; bila kartu samping lebih tinggi dari Sekarang (320 px), tinggi = yang terbesar; tinggi tidak berubah saat digeser, tanpa JS pengukur); indikator tetap di kepala. Baris "Berikutnya" di kartu Sekarang dihapus.

## Deteksi misi otomatis dari foto Momen (25 Nov 2026, permintaan pemilik)

Masalah pemilik: misi dan Momen terasa terpisah; foto Momen biasa yang kebetulan memenuhi syarat sebuah misi tidak dikenali. Sekarang arahnya dua: foto misi tetap ikut ke Momen, dan foto Momen biasa yang memenuhi syarat dikenali dan **diajukan dari foto yang sama** (tanpa unggah ulang).

**Data foto Momen (dua masukan opsional).** `photoStartSchema` (`lib/main-wam/momen/filters.ts`) menerima `tags` (tanpa batas jumlah sejak KONTRAK 40), `geo {latitude, longitude, accuracy}` dan `gallery`; ketiganya boleh kosong (HP lama, antrean lama). Antrean HP (`QueueItem.tags/geo/gallery`) membawanya di langkah unggah dan simpan.
- **Tag orang** (dulu sheet `MomenTagSheet` "Ada siapa di foto ini?", sejak 25 Nov di layar Periksa fotomu, KONTRAK 40): satu daftar semua peserta (BOD dulu, pencarian, tanpa batas jumlah), dipilih sebelum Kirim; **Tanya setiap foto** (ingatan di HP, `mw-momen-tag`, default nyala) mati = bagian tag dilipat. Foto dari galeri sekarang ikut diberi tag (satu daftar untuk semua foto dalam satu kiriman). Tag disimpan di `mw_photo_tags` yang sudah ada, orang yang ditandai diberi tahu "Kamu ditandai di sebuah foto" dan melepas tag dari halaman Misi ("Kamu ditandai" kini juga memuat foto Momen biasa, tanpa judul misi). "Bersama <nama>" pada kartu tumpukan dan penampil **belum dipasang** di sini: PhotoViewer, galeri, dan tab Ditandai dikerjakan agen lain; pembaca `tagsOfPhotos` sudah ada.
- **Tandai lokasi** (`useShareLocation`, hanya bila ada misi yang menerima deteksi): default **mati** selama peramban belum mengizinkan lokasi; bila izin sudah ada, default **aktif** dengan tanda jelas ("Lokasi aktif" + catatan "Lokasi hanya untuk mencocokkan misi. Tidak terlihat peserta lain, dan dihapus bersama fotomu."), satu ketukan mematikannya (ingatan di HP, `mw-momen-lokasi`). Izin ditolak dikatakan apa adanya dan foto jalan tanpa lokasi. Lokasi hanya dibaca saat kamera terbuka dan hanya untuk foto dari kamera (bukan galeri).

**Privasi lokasi (keputusan).** Koordinat ditulis **sekali** ke tabel sendiri `mw_photo_signals` (`geo_lat/geo_lng/geo_acc`), dibaca di **satu** tempat (`server/main-wam/misi/deteksi-store.ts`, hanya untuk mencocokkan misi), tidak ada di `mw_photos`, feed, API peserta lain, jawaban deteksi, maupun baris penyelesaian misi (yang menyimpan hanya `distance_m`). Hilang bersama foto (`on delete cascade`). RLS aktif, `revoke` dari `public, anon, authenticated`. Tes `misi-deteksi-privacy.test.ts` membaca sumber: nama kolom itu tidak boleh muncul di berkas lain. Belum ada penghapusan terjadwal setelah acara: **pemilik perlu memutuskan** apakah `mw_photo_signals` dikosongkan (mis. `update … set geo_lat=null, geo_lng=null, geo_acc=null`) sesudah 8 Jan 2027.

**Pendeteksi** (`lib/main-wam/misi/detect.ts`, murni dan deterministik; memakai `effectiveRules`, `checkRules`, `judgePosition`, tidak menggandakan logika). `detectMission(misi, foto)` menilai tiap misi foto aktif:
- `cocok`: semua aturan yang bisa dicek lolos **dan** misi punya bukti yang bisa dicek (titik lokasi, atau tag wajib); pose atau objek hanya bisa dipastikan verifikator.
- `mungkin`: tidak ada yang dilanggar tetapi ada yang tak bisa dicek (foto tanpa lokasi, lokasi terlalu kasar) atau misi hanya bergantung pada pose atau objek.
- `tidak`: ada aturan dilanggar (tag kurang atau peran salah, di luar radius, di luar jam, batas kali, bukan foto langsung/galeri) atau misi tidak bisa menerima bukti (sudah selesai, sedang ditinjau, belum buka, tutup, deteksi mati, bukan misi foto).
- Tag yang dihitung: foto boleh memuat lebih banyak orang daripada syarat; hanya yang cocok dengan hubungan (BOD, sebangku, sekamar, lintas departemen) sebanyak `count` yang dihitung (`countedTags`). Jam dinilai pada **waktu foto** (`takenAt`), tetapi misi yang sudah tutup sekarang tidak menerima.
- Mode per misi (`mw_missions.auto_detect`, null = bawaan): `mati`, `cocok` (hanya yang pasti cocok diajukan sendiri), `mungkin` (yang meragukan ikut diajukan, semuanya masuk Tinjauan). **Bawaan** aktif (`cocok`) bila misi punya titik lokasi atau tag wajib, **mati** bila hanya pose atau objek, supaya antrean Tinjauan tidak banjir; bila penyedia AI sungguhan dipasang (`MISI_VERIFIER` bukan `manual`) bawaan jadi aktif untuk semua misi foto.
- Aksi (`actionFor`): `ajukan` (cocok, mode mengizinkan, saklar peserta aktif), `saran` (selain itu yang bukan `tidak`), `lewati`. Pasangan foto dan misi yang pernah diajukan, disarankan, **ditarik**, atau **diabaikan** tidak diproses lagi.

**Diajukan otomatis, dengan kendali peserta** (`server/main-wam/misi/deteksi.ts`). Setelah `confirmUpload` menyimpan foto, `scheduleAfterMomenSaved` memakai **`after()` Next**: berjalan sesudah jawaban dikirim, Vercel menjaga fungsi hidup sampai selesai, tanpa infrastruktur latar baru; di luar permintaan (tes) tidak berjalan. Pekerjaannya: simpan sinyal (lokasi, foto langsung), simpan tag, **tunggu sampai foto tampil ke orang lain** (maks 8 detik; foto yang dibatalkan lewat Batalkan atau disembunyikan tidak diproses dan tidak mengabari siapa pun), kabari yang ditandai, jalankan pendeteksi. Galat apa pun hanya dicatat: **foto tetap tersimpan**.
- Pengajuan memakai jalan yang sama dengan kamera misi: verifikator (`runVerifier`, bawaan `manual` → `perlu_ditinjau`; `lolos` → `disetujui` kecuali misi `review`; poin hanya saat `disetujui`), tetapi dengan `photo_id` foto Momen yang sudah ada, **tanpa berkas bukti sendiri** (`proof_key` null; foto dibuka admin lewat `photo_id`). Verifikator `gagal` pada foto yang tidak diminta diajukan: diam saja (peserta tidak menerima penolakan atas sesuatu yang tidak ia kirim); pada "Ajukan" dari peserta: ditolak dengan alasan seperti biasa.
- `check_result.auto {via:"momen", photoId, status, by: otomatis|peserta, passed[], unknown[], distanceM}` menandai asalnya dan alasan deteksinya. Foto ini milik peserta: **penolakan atau penarikan tidak menghapus foto Momen**, dan persetujuan tidak mengabari ulang yang ditandai (`isFromMomen` di `verify.ts`; `review.ts`, `admin.ts`).
- Peserta diberi tahu lewat notifikasi ("Fotomu otomatis diajukan untuk misi <judul>", "+N poin, menunggu pemeriksaan"; saran: "Fotomu cocok untuk misi", sekali per foto) dan **toast** di kamera sesudah foto terkirim (polling `GET momen/[id]/deteksi` tiga kali, 6,5 s, 6 s, 8 s): "Fotomu otomatis diajukan untuk misi <judul> · +N poin · menunggu pemeriksaan" dengan **Tarik** dan **Lihat Misi**; untuk saran: **Ajukan**.
- **Tarik** (`DELETE misi/[id]/otomatis`): selama belum diputuskan (`dikirim`, `diperiksa`, `perlu_ditinjau`, `menunggu`); baris penyelesaian dihapus, foto tetap, pasangan dicatat `ditarik`. **Ajukan** (`POST misi/[id]/ajukan {photoId}`) berlaku walau saklar mati dan menjawab 409 beralasan bila foto belum memenuhi syarat; **Abaikan** (`DELETE` yang sama). Satu foto boleh memenuhi banyak misi; satu misi tetap satu penyelesaian (unik), batas per misi dan `batas_kali` tetap berlaku.
- **Saklar peserta "Deteksi misi otomatis"** (default aktif; Pengaturan, grup Misi, dan halaman Misi; `GET/PUT misi/deteksi`; `mw_misi_prefs`). Mati: hanya saran. **Sebelum migrasi, saklar tidak bisa disimpan dan aplikasi hanya menyarankan, tidak pernah mengajukan sendiri** (pilihan aman: tidak ada pengajuan otomatis tanpa jalan keluar).
- **Halaman Misi, "Dari fotomu"**: foto kecil, misi, poin, "Diajukan otomatis" atau "Saran", "Cocok" atau "Mungkin cocok", status, tombol Tarik, atau Ajukan dan Abaikan; di bawahnya saklar dan **Periksa fotoku** (`POST misi/periksa`: maks 30 foto terbaru milik sendiri yang belum pernah diperiksa; hasil sebagai pengajuan atau saran sesuai saklar; foto yang diperiksa saat tidak ada misi yang menerima deteksi tetap belum diperiksa).

**Admin.** Per misi foto: "Deteksi otomatis dari foto Momen" (Bawaan, Mati, Hanya yang pasti cocok, Termasuk yang mungkin cocok) dengan keterangan dan penjelasan bawaan; lencana di kartu misi. Antrean Tinjauan menandai pengajuan **"Otomatis dari Momen"** dan memuat "Alasan deteksi" (yang terpenuhi, yang dinilai pemeriksa, diajukan otomatis atau oleh peserta dari saran). Tidak ada layar panitia di aplikasi (belum diputuskan).

**Migrasi** `202611300003_main_wam_misi_deteksi.sql` (LOCAL REVIEW ONLY, pemilik yang menjalankan; butuh 202611300001 dan Momen): `mw_missions.auto_detect`, `mw_photo_signals`, `mw_photo_detections`, `mw_misi_prefs`. Tes `tests/backend/main-wam-misi-deteksi-check.sql` (belum dijalankan: tidak ada kontainer). **Tanpa migrasi kode tetap jalan:** misi dibaca tanpa kolom baru (rantai `MISSION_COLUMNS`, `…_RULES`, `…_BASE`), foto Momen dengan tag tetap tersimpan, lokasi tidak tersimpan sehingga misi bertitik hanya `mungkin`, misi dengan tag wajib tetap bisa `cocok` tetapi (saklar tak tersimpan) hanya disarankan; menyimpan mode deteksi di Admin dijawab "menunggu pembaruan sistem".

**Demo dan pratinjau.** Mode demo (tabel misi kosong): halaman Misi memuat "Dari fotomu" contoh (satu diajukan otomatis dengan Tarik, dua saran), editor Periksa fotomu menawarkan Tag orang dan Tandai lokasi. Pratinjau `/dev-preview/wam2026/misi?layar=kamera[&langkah=tag][&lokasi=aktif|mati|ditolak]`; editor: `/dev-preview/wam2026/momen?layar=U-editor|U-editor-memuat|U-editor-banyak|U-editor-tag|U-editor-cari|U-editor-mati|U-editor-galeri` (`&lokasi=aktif|mati|ditolak`, `&lang=en`), `?layar=toast[&jenis=saran]`, `?layar=misi` ("Dari fotomu"; `&status=kosong`, `&otomatis=mati`), `/dev-preview/wam2026/admin-misi?tab=tinjauan` (lencana dan alasan deteksi).
