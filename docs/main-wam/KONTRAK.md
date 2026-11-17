# Kontrak Main WAM (fondasi)

Kontrak kerja untuk semua agen yang membangun **Main WAM**: aplikasi selama acara WAM 2026
(4–7 Jan 2027, Kota Batu) di dalam aplikasi WAM Journey (`/wam`), dengan akun yang sama, tersembunyi
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
| Halaman | `src/app/wam/acara/` | `layout.tsx` (tema), `not-found.tsx`, `masuk/` (O02), `(app)/layout.tsx` (gate + kerangka), `(app)/**` semua layar |
| API peserta | `src/app/api/wam/acara/**` | per area (§6) |
| Admin | `src/app/admin/wam/main/**`, `src/app/api/admin/wam/main/**` | Admin WAM → Main WAM |
| Logika murni | `src/lib/main-wam/*.ts` (fondasi), `src/lib/main-wam/<area>/` (agen) | tipe, aturan, data contoh; dites vitest |
| Server | `src/lib/server/main-wam/*.ts` (fondasi), `src/lib/server/main-wam/<area>/` (agen) | `server-only`, Supabase, R2 |
| Komponen | `src/components/main-wam/{ui,theme,shell}` (UI KIT), `dev/` (fondasi), `<area>/` (agen) | |
| Admin komponen | `src/components/admin/wam/main-wam/` (fondasi), `.../main-wam/<isi|modul>/` (agen E, D) | |
| Pratinjau | `src/app/dev-preview/main-wam/<area>/` | tanpa login, 404 di produksi |
| Migrasi | `supabase/migrations/202611200001–0003_*.sql` + `tests/backend/main-wam-check.sql` | fondasi |

## 2. Arsitektur rute

**Keputusan:** Main WAM berada di `/wam/acara/...` sebagai segmen biasa di bawah layout WAM yang sudah
ada (`src/app/wam/layout.tsx`), dengan layout sendiri:

```
src/app/wam/layout.tsx              (sudah ada) service worker, WamNavigator, manifest, tema Pra WAM
├─ (app)/...                        Pra WAM, tidak berubah (kecuali / → lihat di bawah)
└─ acara/layout.tsx                 tema Main WAM (MainWamTheme dari pengaturan)
   ├─ not-found.tsx                 404 netral: "Halaman tidak ditemukan" → Kembali ke WAM
   ├─ masuk/page.tsx                O02 Masuk (tanpa kerangka, tanpa gate)
   └─ (app)/layout.tsx              gate + MainWamShell (bilah atas, 4 tab, toast)
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

**`/wam` saat Main WAM menyala.** Beranda Pra WAM (`src/app/wam/(app)/page.tsx`) memanggil
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

- **Penguji** = role `admin` (Admin WAM) + role `panitia` + daftar `mw_testers` yang dipilih admin
  (`isTester`, `src/lib/main-wam/access.ts`).
- **Belum login**: mode `semua` → `mainWamPath.login(here)`; mode lain → login Pra WAM (`praWamPath.login(here)`),
  supaya tampilan Main WAM tidak sampai ke orang yang belum tentu penguji. Kembali ke alamat persis
  (penting untuk QR absen).
- **Modul mati tidak meninggalkan jejak**: halaman modul 404, API modul 404, tidak ada kartu, aksi, atau baris.

**Fungsi gate** (`src/lib/server/main-wam/gate.ts`) — panggil di baris pertama:

| Fungsi | Untuk | Hasil |
| --- | --- | --- |
| `requireMainWamPage(here)` | setiap halaman | `{ viewer, settings }`; belum login → login; bukan untuknya → `notFound()` |
| `requireModulePage(module, here)` | halaman modul | + modul mati → `notFound()` |
| `requireActionPage(action, here)` | alat peran (panitia, BOD) dan aksi modul | + bukan perannya atau modul mati → `notFound()` |
| `requireMainWamApi()` | setiap API | 401 tanpa sesi, 404 bila Main WAM bukan untuknya |
| `requireModuleApi(module)` | API modul | + 404 bila modul mati |
| `requireActionApi(action)` | API peran/aksi | + 403 bukan perannya, 404 modul mati |

Layout `(app)` juga memeriksa gate (tidak menggambar kerangka untuk orang yang bukan haknya), tetapi
**bukan satu-satunya**: layout tidak dirender ulang saat navigasi (dokumen Next 16 `authentication.md`,
"Layouts and auth checks"). Tes `src/app/wam/acara/acara-pages.test.ts` gagal bila ada `page.tsx` di
`acara/(app)` tanpa `require*Page(` atau `route.ts` di `api/wam/acara` (selain `tema`) tanpa `require*Api(`.

**Hak per peran** (`mainWamCan(who, action)`, `moduleAllows`), peserta adalah dasar semua orang; peran tidak mengubah tab:

| Aksi | Peserta | Panitia | Admin | BOD | Modul |
| --- | --- | --- | --- | --- | --- |
| `absen` (scan QR) | ya | ya | ya | tidak | absen |
| `foto` (Momen) | ya | ya | ya | ya | — |
| `silent-kirim` | ya | ya | ya | tidak | silent |
| `voting` | ya | ya | ya | tidak | voting |
| `kelola` (Rundown live, Absen manual, Pengumuman, Moderasi) | tidak | ya | ya | tidak | — (Absen manual butuh `absen`) |
| `silent-kontrol` (buka/tutup) | tidak | ya | ya | tidak | silent |
| `ringkasan` (Ringkasan BOD, Kehadiran) | tidak | tidak | tidak | ya | — |
| `awarding-setujui` | tidak | tidak | tidak | ya | voting |
| `silent-rekap` | tidak | tidak | tidak | ya | silent |

Akses MCP tetap seperti sekarang (`mayUseMcp`, `mcpAccessOf`); di Main WAM hanya tautan kecil di Saya BOD.

## 4. Data

### 4.1 Tabel (awalan `mw_`, semua server-only: RLS on, revoke `public, anon, authenticated`, grant `service_role`)

| Tabel | Isi | Catatan |
| --- | --- | --- |
| `mw_settings` (1 baris) | `mode`, `modules` jsonb, `module_config` jsonb (`survei.formSlug`, `mozaik.columns/rows`), `theme` jsonb (`colors`, `displayFont`, `images[slot] = {key, version, mime}`), `event_name`, `venue`, `hotel`, `check_in_at`, `check_out_at`, `contacts` jsonb (`kamar`, `perjalanan`, `umum` = employee id), `groups_published_at`, `carbon` jsonb (tagihan hotel sesudah acara) | tanggal acara dibaca dari `pw_events` (kind `wam`), satu sumber dengan hitung mundur Pra WAM |
| `mw_testers` | penguji tambahan | |
| `mw_sessions` | rundown: `title`, `kind` (`sesi`/`makan`/`perjalanan`), `status` (`draf`/`terbit`/`batal`), `starts_at`, `ends_at` (boleh kosong = 30 menit), `place`, `map_guide_id`, `dresscode`, `bring`, `lineup` jsonb, `meal`, `contact_id`, `uses_attendance`, `required`, `optional`, `module` (`silent`/`voting`/`survei`), `description`, `sort`, `qr_token`, `changed_at/by` | makan tidak boleh pakai absen; wajib harus pakai absen. **Setiap sesi terbit = tag foto** (`mw_photos.session_id`; kosong = Umum) |
| `mw_rundown_log` | riwayat perubahan: `changes` jsonb `[{field, from, to}]`, `notified`, `recipients`, `changed_by`, `changed_at` | "diubah Dimas · 10.20" |
| `mw_attendance` | `(session_id, employee_id)` unik, `method` `qr`/`manual`, `recorded_by` | |
| `mw_groups`, `mw_group_members` | kelompok (nomor, nama), anggota (satu kelompok per orang), satu koordinator | tampil ke peserta setelah `groups_published_at` |
| `mw_activity_groups`, `mw_activity_group_members` | kelompok kegiatan per sesi (`pos`/`angkot`/`meja`/`lain`), satu per orang per sesi | |
| `mw_stay_room_details` | `floor`, `note` per kamar | **kamar = pembagian kamar HR** (`cq_stay_rooms`/`cq_stay_members`, Admin WAM → Kuesioner → Kamar, kapasitas 1–8, terbit lewat `rooms_published_at`) |
| `mw_trips`, `mw_trip_seats` | langkah berangkat/pulang (`kumpul`/`kereta`/`bus`/`tiba`/`lain`), kursi/kendaraan per orang, `distance_km`, `vehicles` (Jejak karbon) | |
| `mw_guides` | panduan: `slug`, `kind` (`denah`/`hotel`/`dresscode`/`tata_tertib`/`lain`), `title`, `body` teks, berkas opsional di R2 `main-wam/panduan/…`, `published` | |
| `mw_notes` | metadata notifikasi Main WAM di atas `pw_announcements`: `kind`, `link` (`/wam/acara…`), `pinned_until` (pengumuman penting), `audience` jsonb | |
| `mw_photos` | `owner_id`, `client_id` (idempoten per HP), `audience` (`semua`/`kelompok` + `group_id`), `session_id`, `file_key`/`thumb_key` (R2 `main-wam/momen/…`), ukuran, `taken_at`, `created_at`, `visible_at` (= +5 detik), `status` (`tampil`/`ditinjau`/`disembunyikan`), `hidden_*` | kelompok yang punya foto tidak bisa dihapus |
| `mw_photo_hearts`, `mw_photo_reports`, `mw_photo_seen` | hati; laporan (unik per pelapor, `lainnya` wajib catatan, `unhidden_at` = "Tampilkan lagi" untuk pelapor); foto yang sudah dilihat | |
| `mw_mosaic_tiles` | ubin → foto (satu foto satu ubin) | |
| `mw_award_categories`, `mw_award_nominees`, `mw_award_votes`, `mw_award_approvals` | kategori (`voting`/`juri`/`otomatis`, jendela, diumumkan), nominasi (orang/foto/label), satu suara per orang per kategori (bisa diubah), persetujuan BOD | trigger: suara hanya di jendela kategori voting terbit, tidak untuk diri sendiri (orang atau pemilik foto), jam server |
| `mw_silent_questions`, `mw_silent_feedback`, `mw_silent_participation` | satu pertanyaan per sesi, `override` `buka`/`tutup`, `auto_close`; masukan **tanpa orang, tanpa waktu**, id acak; partisipasi = HMAC orang + jumlah kiriman | trigger: masukan hanya saat dibuka (aturan sama dengan `silentState`) |

**Memakai ulang atau membuat baru:**
- **Rundown: tabel baru `mw_sessions`, bukan `pw_sessions`.** Pra WAM membaca `pw_sessions` tanpa
  saringan acara di banyak tempat (Kelola acara → Jadwal sesi untuk panitia/BOD, Timeline untuk
  `forum`/`acara`, TV, wajib MoM, ekspor, Arsip MoM). Penanda fase berarti mengubah ±20 kueri Pra WAM
  dan risiko bocor. Yang "gratis" dari `pw_sessions` hanya tabel absen dan token QR; logikanya tetap
  dipakai ulang (jendela absen 30 menit, `newQrToken`, `sessionQrPdf`, pemindai `CheckInScanner`).
- **Kamar: pakai ulang pembagian kamar HR** (sudah ada, sudah diisi HR, penghuni bebas sampai
  kapasitas). Main WAM hanya menambah lantai/catatan.
- **Notifikasi dan pengumuman: pakai ulang `pw_announcements` + `pw_notification_receipts`** (satu kotak
  masuk, status dibaca, Web Push yang ada), dengan event WAM 2027 dan `mw_notes` untuk jenis, tautan,
  sematan, audiens. Tidak ada topik push baru (Pengaturan Pra WAM tidak berubah); pemetaan di
  `notePushTopic`: pengumuman dan jadwal → `pengumuman` (selalu, juga jam tenang), absen/silent/voting/
  survei/kamar/foto disembunyikan → `forum` (tidak di jam tenang), hati → lonceng saja.
- **Login, sesi, password, push, foto profil**: semua dipakai ulang lewat `praWamApi` (§5).
- **R2**: helper `src/lib/server/r2.ts` (`presignUpload`, `verifyUpload`, `presignDownload`, `readObject`,
  `removeObjects`). Prefix: `main-wam/momen/` (B), `main-wam/panduan/` (E), `main-wam/tema/` (fondasi).
- **Survei**: tanpa tabel; `module_config.survei.formSlug` menunjuk kuesioner (`cq_forms`) yang sudah ada.
- **Jejak karbon**: tanpa tabel isian; dihitung dari peserta, kamar-malam (kamar HR × malam), perjalanan
  (`distance_km`, `vehicles`), porsi (sesi `makan`), dan `mw_settings.carbon` (tagihan hotel, diisi di admin).

### 4.2 Tipe (`src/lib/main-wam/types.ts`)

`MainWamMode`, `MainWamModule` (`absen voting silent survei mozaik karbon`), `ModuleSwitches`,
`ModuleConfig`, `MainWamThemeSettings`, `MainWamThemeInput` (yang diterima `<MainWamTheme>`),
`THEME_IMAGE_SLOTS` (`splash homeHeader pattern mosaic icon`), `MainWamEventInfo`, `MainWamContacts`,
`CarbonInputs`, `MainWamSettings`, `MainWamRole`, `MainWamViewer` (`id`, `name` = nama panggilan,
`fullName`, `department`, `photo`, `roles`, `tester`, `group`, `room`), `ViewerGroup`, `ViewerRoom`,
`MwPerson`, `MwSession`, `LineupItem`, `RundownChange`, `MwAttendance`, `MwGroup`, `MwActivityGroup`,
`MwTrip`, `MwTripSeat`, `MwGuide`, `NoteKind`, `AnnouncementAudience`, `MwNotification`, `MwPhoto`,
`PhotoAudience`, `PhotoStatus`, `ReportReason` (+ `reportReasonLabels`), `MwAwardCategory`,
`MwAwardNominee`, `MwAwardApproval`, `MwSilentQuestion`. Tipe khusus area ditaruh di folder area.

### 4.3 Logika murni bersama (`src/lib/main-wam/`, semuanya dites)

| Berkas | Fungsi |
| --- | --- |
| `access.ts` | `mainWamGate`, `opensMainWamHome`, `isTester`, `mainWamRole`, `mainWamCan`, `moduleAllows`, `liveForEveryone` |
| `rundown.ts` | `sessionEnd`, `isRunning`, `byStart`, `eventDates`, `eventDay`, `eventDayLabel` ("Hari ke-2 dari 4"), `agendaDay`, `sessionsOfDay`, `nowAndNext`, `checkInWindow`, `checkInState`, `nowCard` (kartu Sekarang), `autoTag` (tag kamera), `tagChoices`, `dayWord`, `timeRange` |
| `home-card.ts` | `pickHomeCard` (pengumuman penting > Silent Meeting dibuka > voting dibuka > hari berangkat > survei; modul mati dibuang) |
| `module-state.ts` | `silentState`, `silentClosesAt`, `silentRecapReady` (≥ 5), `votingState` |
| `modules.ts` | `moduleInfo`, `moduleOn`, `activeModules` |
| `screen.ts` | `mainWamScreen(pathname)` (tab, level akar/detail/tugas, judul, kembali, gelap), `mainWamTabs`, `showsBottomBar`, `showsBell` — dibaca shell UI KIT |
| `notify.ts` | `notePushTopic`, `noteIcon`, `announcementKind` |
| `greeting.ts` | `homeGreeting`, `salam` |
| `settings.ts` | `defaultSettings`, `settingsFromRow`, `settingsInputSchema`, `settingsPatch`, nama migrasi |
| `rows.ts` | pemetaan baris → tipe + daftar kolom (`SESSION_COLUMNS`, …) |
| `theme-image.ts` | skema unggah KV, `themeInputOf` |
| `sample.ts` | data contoh (§7) |

### 4.4 Server bersama (`src/lib/server/main-wam/`)

| Berkas | Fungsi |
| --- | --- |
| `settings.ts` | `readMainWamSettings()` (bawaan saat gagal/sebelum migrasi), `mainWamSettingsState()`, `saveMainWamSettings`, `writeSettingsColumns` (untuk E: info acara, carbon, groups_published_at, contacts), `testerIds`, `listTesters`, `addTester`, `removeTester` |
| `viewer.ts` | `mainWamViewer()`, `viewerOf(member)`, `groupOf`, `roomOf`, `testsMainWam` |
| `gate.ts` | §3, plus `mainWamHomeTarget`, `redirectToMainWam`, tipe `MainWamContext` |
| `people.ts` | `mainWamPeople()` (nama panggilan, departemen, foto), `personOf(id)` |
| `read.ts` | `allSessions`, `shownSessions`, `sessionById`, `rundownLog`, `attendanceOf`, `listGroups`, `activityGroups`, `listTrips`, `seatsOf`, `listGuides`, `guideBySlug`, `guideFileKey`, `photoById`, `photosForEveryoneSince`, `awardCategories`, `awardApprovals`, `votedCategories`, `silentQuestions`, `silentFeedbackCount` — semuanya `{ data, migrated }` |
| `notes.ts` | `sendMainWamNote` (lonceng + push, hanya ke yang Main WAM-nya menyala), `trySendMainWamNote`, `mainWamAudience`, `resolveAudience`, `myMainWamNotifications`, `pinnedForMe`, `markMainWamRead` |
| `theme.ts` | `mainWamThemeInput()`, `startThemeImage`, `confirmThemeImage`, `removeThemeImage`, `themeImageFile` |
| `errors.ts` | `mwMissing`, `mwWaiting`, `mwFail`, tipe `Read<T>` |

Pembaca dasar tidak memeriksa siapa yang meminta; pemanggil sudah lewat gate dan menyaring sendiri
(mis. peserta tidak melihat draf, kelompok hanya setelah terbit, foto `kelompok` hanya anggota).

## 5. Alamat

Semua sudah ada di `src/lib/routes.ts` — **jangan menambah sendiri**. Butuh alamat baru: minta agen
fondasi (atau PM), sebut di laporan. Pemetaan layar ke kerangka ada di `screen.ts`.

**Halaman `mainWamPath`** (`/wam/acara…`)

| Area | Kunci → alamat (layar) |
| --- | --- |
| A | `home` / (P01/P02, B01, K01) · `login(next)` /masuk (O02) · `onboarding` /mulai (O03) · `notifications` /notifikasi (N01) · `agenda(hari?)` /agenda (P03) · `session(id)` /agenda/{id} (P04) · `me` /saya (P05/P05B) · `groupRoom` /saya/kelompok (L01) · `travel(arah?)` /saya/perjalanan (L03) · `guides` /saya/panduan, `guide(slug)` (L04) · `settings` /saya/pengaturan (S02) |
| B | `moments({lihat, sesi, foto})` /momen (M01–M03) · `camera({sesi, untuk})` /momen/kamera (U01–U05, O04) · `gallery({lihat, sesi})` /momen/galeri (M05) · `mosaic(tandai)` /momen/mozaik (M06) |
| C | `rundownLive(hari?)` /kelola/rundown (K02, K03 sheet) · `attendanceManual(sesi?)` /kelola/absen (K05) · `announce` /kelola/pengumuman (K06) · `moderation(lihat?)` /kelola/moderasi (K08) · `attendanceSummary(hari?)` /ringkasan/kehadiran (B02) |
| D | `scan` /absen (A01, A05) · `checkIn(token)` /absen/{token} (A02–A04; isi QR cetak) · `silentMeeting(sesi?)` /silent-meeting (T01–T03) · `awards` /awarding (V01) · `awardCategory(id)` /awarding/{id} (V02) · `silentRecap` /ringkasan/silent-meeting (B05) · `awardApproval` /ringkasan/awarding (B06) |

**API `mainWamApi`** (`/api/wam/acara…`)

| Area | Kunci |
| --- | --- |
| fondasi | `themeImage(slot, v)` (publik) |
| A | `home`, `agenda`, `session(id)`, `notifications`, `guideFile(id)`; login/password/push/foto profil tetap `praWamApi` |
| B | `photos(filter)`, `photoStart`, `photoConfirm`, `photosSeen`, `photo(id)`, `photoFile(id, ukuran)`, `photoHeart(id)`, `photoReport(id)`, `mosaic` |
| C | `rundownSession(id)`, `rundownLog`, `attendance(sesiId)`, `announcements`, `announcement(id)`, `moderation`, `moderatePhoto(id)`, `summary` |
| D | `checkIn(token)`, `sessionQr(sesiId)`, `silent`, `silentFeedback`, `silentControl(id)`, `silentRecap`, `awards`, `vote(id)`, `approveAward(id)` |

**Admin** `mainWamAdminPath` (`/admin/wam/main/…`): `settings` (fondasi) · `rundown`, `groups`,
`activityGroups`, `rooms`, `travel`, `guides` (E) · `awards`, `silent` (D).
`mainWamAdminApi` (`/api/admin/wam/main/…`): `settings`, `testers`, `tester(id)`, `themeImageStart`,
`themeImageConfirm`, `themeImage(slot)` (fondasi) · `sessions`, `session(id)`, `groups`, `group(id)`,
`groupMembers(id)`, `activityGroups`, `activityGroup(id)`, `roomDetail(roomId)`, `trips`, `trip(id)`,
`tripSeats(id)`, `guides`, `guide(id)`, `guideFileStart`, `guideFileConfirm`, `eventInfo` (E) ·
`awardCategories`, `awardCategory(id)`, `awardNominees(id)`, `silentQuestions`, `silentQuestion(id)` (D).
Bagian menu Admin WAM sudah terdaftar di `sections.ts` (grup "Main WAM": Pengaturan, Isi acara dengan tab
Kelompok/Kamar/Perjalanan/Panduan, Modul acara dengan tab Silent Meeting); tab halaman:
`mainWamContentTabs`, `mainWamModuleTabs` (`src/components/admin/wam/main-wam/tabs.ts`). Area admin
`/admin/wam/main` termasuk hak akses admin "Admin WAM" (`areaOfPath` → `wam`); setiap API admin memanggil
`requireApiAdmin()` (dites `sections.test.ts`).

## 6. Pembagian berkas dan nomor migrasi

Setiap agen hanya menulis di foldernya. Placeholder fondasi (bertanda `PLACEHOLDER (fondasi)` atau
`SLOT (fondasi)`) boleh diganti isinya oleh pemiliknya; **nama ekspor dan props slot tetap**.

| Agen | Layar | Folder milik | Migrasi | Uji SQL |
| --- | --- | --- | --- | --- |
| **A peserta/handbook** | O02, O03, P01/P02 (Beranda + kartu kontekstual), P03, P04, P05/P05B, L01, L03, L04, N01, S02 | `src/app/wam/acara/(app)/{page.tsx,loading.tsx,agenda,saya,notifikasi,mulai}/**`, `src/app/wam/acara/masuk/**`, `src/components/main-wam/peserta/**`, `src/lib/main-wam/peserta/**`, `src/lib/server/main-wam/peserta/**`, `src/app/api/wam/acara/{beranda,agenda,notifikasi,panduan}/**`, `src/app/dev-preview/main-wam/peserta/**` | `202611200101–0199` | `tests/backend/main-wam-peserta-check.sql` |
| **B Momen + Mozaik** | M01–M06, U01–U05, O04 | `src/app/wam/acara/(app)/momen/**`, `src/components/main-wam/momen/**`, `src/lib/main-wam/momen/**`, `src/lib/server/main-wam/momen/**`, `src/app/api/wam/acara/{momen,mozaik}/**`, `src/app/dev-preview/main-wam/momen/**` | `0201–0299` | `main-wam-momen-check.sql` |
| **C panitia + BOD** | K01 (kartu), K02, K03, K05, K06, K08, B01 (kartu Ringkasan), B02 | `src/app/wam/acara/(app)/{kelola/rundown,kelola/absen,kelola/pengumuman,kelola/moderasi,ringkasan/kehadiran}/**`, `src/components/main-wam/panitia/**`, `src/lib/main-wam/panitia/**` (mis. hitung Jejak karbon), `src/lib/server/main-wam/panitia/**`, `src/app/api/wam/acara/{kelola/rundown,kelola/absen,kelola/pengumuman,kelola/moderasi,ringkasan}/**`, `src/app/dev-preview/main-wam/panitia/**` | `0301–0399` | `main-wam-panitia-check.sql` |
| **D modul** | A01–A05, T01–T03, V01–V02, B05, B06, aksi modul di P04, admin Awarding + Silent Meeting | `src/app/wam/acara/(app)/{absen,silent-meeting,awarding,ringkasan/silent-meeting,ringkasan/awarding}/**`, `src/components/main-wam/modul/**`, `src/lib/main-wam/modul/**`, `src/lib/server/main-wam/modul/**`, `src/app/api/wam/acara/{absen,silent-meeting,awarding,kelola/qr}/**`, `src/app/admin/wam/main/{awarding,silent-meeting}/**`, `src/components/admin/wam/main-wam/modul/**`, `src/app/api/admin/wam/main/{awarding,silent-meeting}/**`, `src/app/dev-preview/main-wam/modul/**` | `0401–0499` | `main-wam-modul-check.sql` |
| **E Admin WAM konten** | Admin: Rundown, Kelompok (+ kegiatan, terbitkan), Kamar (lantai), Perjalanan (+ kursi), Panduan (+ berkas), info acara (hotel, check-in/out, kontak, tagihan hotel) | `src/app/admin/wam/main/{rundown,kelompok,kamar,perjalanan,panduan}/**`, `src/components/admin/wam/main-wam/isi/**`, `src/lib/main-wam/admin/**`, `src/lib/server/main-wam/admin/**`, `src/app/api/admin/wam/main/{sesi,kelompok,kelompok-kegiatan,kamar,perjalanan,panduan,info-acara}/**`, `src/app/dev-preview/main-wam/admin/**` | `0501–0599` | `main-wam-admin-check.sql` |
| fondasi | gate, layout, pengaturan, tema KV | lihat §1 | `0001–0099` | `main-wam-check.sql` |

**Slot lintas area** (sudah dibuat, berisi `return null`):

| Slot | Pemilik | Dipasang oleh | Props |
| --- | --- | --- | --- |
| `BerandaPanitia` (`components/main-wam/panitia/BerandaPanitia.tsx`) | C | A, Beranda di bawah Sekarang | `{ context: MainWamContext; now: Date }` |
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
- Pratinjau fondasi: `/dev-preview/main-wam/fondasi?layar=beranda|agenda|momen|saya&peran=…`,
  `/dev-preview/main-wam/fondasi/pengaturan?mode=…&migrasi=belum`.

## 8. Aturan kerja bersama

- **Sebelum migrasi**: baca dengan pembaca fondasi (`migrated: false` → tampilkan "menunggu pembaruan
  sistem" yang ramah, bukan galat); penulis melempar `mwWaiting(migrasi)`.
- **Waktu**: semua jam WIB lewat `rundown.ts` (`wibDate`, `wibTime`, `wibInstant`); aturan jendela
  (absen, Silent Meeting, voting) memakai jam server; basis data mengulang aturan voting dan Silent Meeting.
- **Nama**: rekan = `name` (nama panggilan) dari `mainWamPeople`/`personOf`; admin = `fullName`.
- **Notifikasi**: selalu `sendMainWamNote`/`trySendMainWamNote` (jangan menulis `pw_announcements` sendiri).
  Kabar tentang satu sesi memakai `tag` `sesi-<id>` supaya menggantikan kabar sebelumnya.
- **Foto Momen**: unggah dua langkah seperti foto MoM (server memberi kunci + presigned PUT dengan tipe dan
  ukuran ditandatangani, browser PUT ke R2, server cek byte awal); `client_id` dari HP untuk antrean offline;
  file disajikan lewat server (`photoFile` → URL sementara), R2 tetap privat.
- **Silent Meeting**: masukan tidak pernah disimpan atau di-log bersama orang; partisipasi pakai
  `HMAC-SHA256(WAM_SESSION_SECRET, "mw-silent\0" + questionId + "\0" + employeeId)` (hex 64); BOD baru
  melihat rekap dari 5 masukan dan 5 orang; urutan acak.
- **Voting**: rahasia, bukan anonim; hanya agregat yang keluar dari server, perolehan sementara tidak
  ditampilkan ke peserta.
- **Tampilan**: komponen UI KIT, token `--mw-*`, tanpa hex di komponen; target sentuh ≥ 44; status
  selalu kata; gestur geser punya tombol; `loading.tsx` per layar; detail dalam sheet bila cocok.
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
| 13 | Silent Meeting tanpa orang, tanpa waktu, id v4; partisipasi HMAC terpisah; ambang 5 | ambang industri 5 (Microsoft Viva Glint, Culture Amp); UUIDv7/stempel waktu membocorkan (RFC 9562); RISET §7 |
| 14 | Foto: `client_id` unik per pemilik, `visible_at` = +5 detik, indeks keyset `(visible_at, id)` | antrean offline tanpa foto ganda (RISET §3); Batalkan 5 detik; tanpa OFFSET (use-the-index-luke) |
| 15 | Gambar KV lewat situs (publik, alamat berversi, cache immutable) | splash tampil sebelum login; R2 tetap privat; ganti gambar = alamat baru |
| 16 | `/wam` → Main WAM dengan pengalihan di Beranda Pra WAM; Pra WAM di `?versi=pra` | Pra WAM tidak dihapus; mode bawaan tidak mengubah apa pun (dites) |
| 17 | Admin Main WAM di bawah `/admin/wam/main`, hak akses "Admin WAM" | tanpa grant/migrasi baru; tab-halaman agar menu tidak membengkak |

## 10. Belum diputuskan / perlu tindak lanjut

- **Manifest dan ikon PWA Main WAM**: slot `icon` sudah ada di tema; manifest `/wam` masih Pra WAM.
  iOS tidak mengganti ikon setelah dipasang (RISET §5): tetapkan ikon sebelum mengajak peserta memasang.
- **Push otomatis saat Silent Meeting/voting dibuka oleh jam** (tanpa aksi panitia) butuh pemicu
  terjadwal (cron); saat ini kabar hanya bisa dikirim saat panitia bertindak.
- **Cache pengaturan lintas permintaan** (tag + `revalidateTag`) belum dipakai: satu kueri per permintaan
  cukup untuk ±120 orang.
- **Offline untuk panduan dan data pribadi** (RISET §12) perlu persetujuan, karena `sw.js` sengaja tidak
  menyimpan halaman pribadi.
- **Uji SQL lama yang gagal** (bukan Main WAM, juga gagal tanpa migrasi Main WAM): `pra-wam-appraisal`,
  `pw-tv`, `pw-tv-playlist`, `pw-tv-welcome`, `rsvp-needs`, `wam-cards`, `wam-questionnaire`.
