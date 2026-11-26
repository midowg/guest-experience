# Rencana penerapan Werkudara Coffee (25 Nov 2026)

> Nama aplikasi sejak 26 Nov 2026: WG Coffee

Aplikasi sungguhan dari tiga prototipe yang sudah disetujui. Cabang `feat/werkudara-coffee` (worktree
`.claude/worktrees/coffee`). **Admin dulu, lalu karyawan, lalu tablet GA, lalu push.** Tidak ada push, commit ke
`main`, `npm run build` saat `next dev` jalan, atau migrasi yang dijalankan agen: pemilik yang menjalankan migrasi.

Acuan yang wajib dibaca tiap agen sebelum mulai:
- Aturan produk: `docs/rancangan-kopi-kantor.md` (bagian 25 Nov menggantikan yang lama).
- Gambaran besar (UI, kata, alur): `src/components/coffee/prototype/` (`CoffeePrototype`, `GaPrototype`,
  `PengelolaPrototype`, `store.ts`), `src/lib/coffee/menu.ts`, `src/lib/coffee/rooms.ts`. **Prototipe tidak diubah
  dan tidak dihapus**; komponen asli dibuat baru di sebelahnya dan menyalin CSS/markup yang perlu.
- Pola repo: `docs/aturan-hr.md`, `docs/standar-admin.md`, `docs/contracts.md`, `AGENTS.md` (Next 16.4: baca
  `node_modules/next/dist/docs/` sebelum menulis route/layout), `D:\projects\brain\aturan\desain-ui.md`.
- Aturan kerja: dua kali gagal dengan cara yang sama = berhenti dan lapor PM. Lapor apa adanya (yang belum diuji disebut).

---

## 0. Keputusan yang sudah ada (dipakai, bukan ditanyakan lagi)

| Hal | Keputusan |
| --- | --- |
| Alamat | Karyawan `/coffee`, tablet GA `/coffee/ga`, pengelola `/admin/coffee`. `/coffee/hr` (alamat lama di rancangan) dialihkan ke `/admin/coffee`. |
| Akun | Akun karyawan Journey (cookie yang sama dengan WAM, Booking, WG People). Halaman masuk sendiri. |
| Akses | Karyawan = karyawan aktif yang punya akun. Mode GA = kelompok GA + pemegang akses Coffee. Pengelola = grant admin `coffee` (baru, seperti `hr`), super admin selalu. |
| Jatah | Per bulan kalender WIB: karyawan 4, GA 2, intern 2 (konstanta + tabel pengaturan). Tamu tanpa batas, dicatat atas nama PIC. "Tim · rapat" tanpa jatah, dicatat atas nama orangnya. Ditolak/batal tidak memakai jatah. Boleh lebih dari satu pengajuan menunggu selama jatah masih ada. |
| Pengelola | Membeli manual di JumpStart (tidak pernah diotomatiskan), "Selesai diproses", Tolak wajib catatan, Urungkan dalam jendela singkat, Catat manual, Rekap + CSV + .xlsx sungguhan (lembar Detail + Ringkasan), kolom rancangan + Ruangan. |
| Status | `diproses` → `selesai` / `ditolak` / `batal`. Kata di layar: Diproses, Selesai, Ditolak, Batal. |
| Notifikasi | Web push (PWA): pesanan baru → semua pengelola; selesai/ditolak → pemesan (klaim) atau GA + PIC (rapat). Cadangan: status langsung di aplikasi lewat polling. |
| Ruangan | Dari denah Pra WAM (`src/lib/pra-wam/floor-plan.ts`, kunci di `src/lib/coffee/rooms.ts`) + "Lainnya". |
| Tidak ada | WhatsApp, kode ambil, sambungan ke JumpStart, PIN, "pilih nama". Foto tetap gambar AI, dipindah ke path publik yang benar. |

---

## 1. Temuan di repo (yang dipakai ulang)

**Perhatian: WG People ada di `/people`, bukan `/hr`** (`/hr` hanya redirect di `next.config.ts`). Kodenya tetap bernama `hr`.

| Hal | Di mana | Dipakai untuk Coffee |
| --- | --- | --- |
| Sesi karyawan | `src/lib/server/pra-wam/session.ts`: `currentMember()` (cache per request; cek akun aktif + `session_version`), `requireApiMember()` (401 "Sesi berakhir…"), tipe `Member { id, name, nickname, department, position, mustChangePassword, roles, category }` | Dipakai apa adanya. Tidak membuat cookie baru. |
| Penjaga halaman karyawan | `src/lib/server/hr/session.ts`: `requireHrPage(here)`, `hrAdminActor()` | Salin jadi `src/lib/server/coffee/session.ts` (`requireCoffeePage`, `coffeeActor`). |
| Halaman masuk | Hook `useSignIn`, `useForgot`, `useNewPassword` di `src/components/booking/BookingAuth.tsx`; tampilan sendiri di `src/components/hr/HrAuth.tsx`; halaman `src/app/people/{masuk,lupa-password,password-baru}/page.tsx` (`safePraWamNext`, hanya alamat aplikasi sendiri boleh jadi `next`) | Hook dipakai verbatim; tampilan baru `CoffeeAuth.tsx` mengikuti layar "welcome/login" prototipe. |
| Kerangka aplikasi HP | `src/app/people/layout.tsx` (metadata, manifest, `generateViewport`), `(app)/layout.tsx`, `(app)/HrScreen.tsx` (satu layar server, pindah tab di browser), `src/components/hr/HrFrame.tsx` (`history.pushState`, daftar SW, `#wg-layer` untuk sheet), `src/lib/hr/tabs.ts` | Pola yang sama dengan dua tab: Menu, Pesanan saya. |
| PWA | `src/app/people/manifest.webmanifest/route.ts` (`force-static`, `id/start_url/scope`), `public/people/sw.js` (install → `skipWaiting`, halaman offline, halaman pribadi tidak di-cache), ikon `public/people/icon-*.png` | Manifest + SW sendiri, scope `/coffee/`. |
| Web push | `src/lib/pra-wam/push.ts` (`pushSubscriptionSchema`, `pushEndpointSchema`, `PushPayload`, `keyBytes`, `pushSupport`, `deviceLabel`), `src/lib/server/pra-wam/push.ts` (`sendPush`, `schedulePush` dengan `after()`, hapus 404/410), `src/app/api/wam/push/route.ts`, handler `push`/`notificationclick` di `public/wam/sw.js`, tabel `pw_push_subscriptions` (migrasi `202611080001`), env `WAM_VAPID_PUBLIC_KEY`/`WAM_VAPID_PRIVATE_KEY`/`WAM_VAPID_SUBJECT`, paket `web-push` sudah terpasang | Skema dan helper murni diimpor verbatim. Pengiriman ditulis ulang kecil di `src/lib/server/coffee/push.ts` (tabel sendiri, tanpa topik/jam senyap), kunci VAPID yang sama. |
| Grant admin | `src/lib/admin-access.ts` (`ADMIN_APPS`, `adminAppLabels`, `adminAppHints`, `areas`, `areaOfPath`, `mayOpenArea`, `showsAppCard`, `ADMIN_HR_MIGRATION`), `src/lib/server/admin-actor.ts` (`currentAdmin`, `AdminActor`, pesan 23514 "menunggu migrasi"), `src/lib/server/admin-session.ts` (`requireAdminPage`, `requireApiAdmin`), `src/proxy.ts` (gerbang pertama + `ADMIN_PATH_HEADER`), UI `src/components/admin/super/AdminGrants.tsx` (membaca `ADMIN_APPS`, jadi kotak centang muncul sendiri), migrasi `202611200703_admin_grants_hr.sql` | Tambah `coffee` di semua tempat itu. |
| Bingkai admin | `src/components/hr-admin/{HrAdminFrame,HrAdminNav,sections,Flash}.tsx`, `ConsoleShell`/`PageHeader`/`Pill`/`FilterChips` dari `@/components/console`, halaman `src/app/admin/hr/*/page.tsx` (pola `requireAdminPage` → `isSupabaseConfigured` → data atau `ServiceError 503` sebagai `Notice`) | Disalin: `CoffeeAdminFrame`, `CoffeeAdminNav`, `sections.ts`. `Flash` diimpor dari `hr-admin`. |
| Kartu aplikasi | `src/lib/server/standalone-apps.ts` (`StandaloneApp`, jumlah menunggu) | Kartu "Werkudara Coffee" dengan jumlah antrean. |
| API | `src/lib/server/http.ts`: `handle`, `success`, `checkOrigin`, `readJson(request, maxBytes)`, `validate(zod)`, `enforceRateLimit(request, scope, limit)`, `databaseError`; `ServiceError(status, message, fieldErrors?)` di `config.ts`; `createPrivilegedClient()`; unduhan GET memakai `sameOriginRead` (`src/lib/server/pra-wam/hr-lock.ts`) | Dipakai apa adanya. Bentuk jawaban `{ ok, data, message }`. |
| Ekspor | `writeXlsx(sheets: SheetOut[])` di `src/lib/server/xlsx-write.ts` (sel teks = inline string, angka = sel angka); `csvCell` di `src/lib/server/responses.ts` (aman dari formula, BOM, `\r\n`); contoh route `src/app/api/admin/wam/questionnaire/table/route.ts` | Dipakai apa adanya. |
| Data karyawan | `src/lib/employees.ts`: `category` = **`karyawan` / `dw` / `intern`** (`asCategory`; "ga" jadi "dw" di migrasi `202611130006`), `business_unit`, `position`, `nickname`. Peran `ga` di `pw_roles` = "Admin Booking" (staf administrasi), `src/lib/pra-wam/roles.ts` | Kelompok jatah GA = kategori `dw` (lihat pertanyaan 1). |
| Kode pendek | `src/lib/short-code.ts`: `EVENT_CODE = /^[A-HJKMNP-Z2-9]{6}$/` (tanpa I, L, O) | "COFFEE" memuat O, jadi tidak pernah bisa jadi kode acara; segmen statis `/coffee` juga menang atas `/[code]`. Tidak ada daftar slug cadangan di repo; cukup dikunci dengan tes. |
| Alamat | `src/lib/routes.ts` + tes penjaga di `src/lib/routes.test.ts` (alamat tidak boleh ditulis tangan di luar `routes.ts`; `dev-preview` dikecualikan) | Semua alamat Coffee di `routes.ts`. |
| Data langsung | Tidak ada Supabase Realtime di browser (RLS menutup semua untuk anon). Pola repo: ambil ulang saat `visibilitychange` + timer (`ClockInFlow.tsx`) | **Polling**, bukan realtime. |
| RPC atomik | `pw_save_booking` (migrasi `202611040001`): `pg_advisory_xact_lock(hashtext(...))`, `raise exception 'KODE'`, `set search_path = public, pg_temp` | Pola yang sama untuk jatah. |
| Migrasi | `supabase/migrations/YYYYMMDDNNNN_nama.sql`, baris pertama `-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.`, catatan ROLLBACK, `begin; … commit;`, RLS nyala, `revoke all … from public, anon, authenticated`, `grant … to service_role`. Kode harus tetap jalan sebelum migrasi (jawab 503 "menunggu migrasi …") | Sama. Nomor terakhir sekarang `202611300003`; cek lagi sebelum menulis. |
| Tes | vitest dua proyek (`vitest.config.ts`): `*.test.ts` node, `*.dom.test.tsx` jsdom. Server diuji dengan tiruan Supabase di memori (`src/lib/server/hr/leave.test.ts`) | Sama. |
| Pratinjau | `src/app/dev-preview/hr-admin/page.tsx`: komponen asli dengan data contoh, `notFound()` di produksi | Dipakai untuk verifikasi di browser sebelum migrasi dijalankan. |

---

## 2. Model data

Awalan tabel `coffee_`. Semua tabel: RLS nyala, hanya `service_role`. Nama orang, jabatan, BU, kelompok **disalin ke baris
pesanan saat dibuat**, supaya rekap bulan lalu tidak berubah ketika Data karyawan berubah.

### Migrasi F0: `202612010001_coffee.sql`

```
coffee_settings            satu baris (id smallint primary key default 1 check (id = 1))
  quota_karyawan smallint not null default 4 check (between 0 and 60)
  quota_ga       smallint not null default 2 check (between 0 and 60)
  quota_intern   smallint not null default 2 check (between 0 and 60)
  updated_at timestamptz, updated_label text (<= 120)
  -- insert baris awal di migrasi

sequence coffee_claim_no, coffee_meeting_no

coffee_orders              satu baris per pengajuan: satu klaim, atau satu kiriman rapat (tiap "Tambah lagi" = baris baru)
  id uuid pk default gen_random_uuid()
  kind text check (kind in ('klaim','rapat'))
  number integer not null                         -- K-418 / T-0113; tambahan rapat memakai nomor induknya
  round smallint not null default 1 check (between 1 and 50)
  parent_id uuid references coffee_orders(id)     -- rapat tambahan → kiriman pertama
  employee_id uuid not null references employees(id)   -- klaim: pemesan; rapat: PIC
  person_name text, person_group text check (in ('karyawan','ga','intern')), person_position text, person_bu text
  room text (<= 80), room_spot text (<= 40), guest text (<= 120), guest_count smallint check (null or between 1 and 500)
  status text not null default 'diproses' check (in ('diproses','selesai','ditolak','batal'))
  reject_note text check (null or char_length(btrim) between 3 and 300)
  processed_by uuid references employees(id) on delete set null, processed_label text (<= 120), processed_at timestamptz
  created_by uuid references employees(id) on delete set null, created_label text (<= 120)   -- pemesan, GA, atau pengelola (manual)
  manual boolean not null default false
  ordered_at timestamptz not null default now()   -- boleh mundur untuk Catat manual
  quota_month text not null check (~ '^\d{4}-\d{2}$')   -- bulan WIB dari ordered_at, diisi fungsi
  idempotency_key uuid unique                     -- dari browser; kirim dua kali = satu baris
  created_at timestamptz not null default now()
  unique (kind, number, round)
  check: kind = 'klaim' → person_group not null, room/guest null, round = 1
         status = 'ditolak' → reject_note not null
  index coffee_orders_waiting   (ordered_at) where status = 'diproses'
  index coffee_orders_quota     (employee_id, quota_month) where kind = 'klaim' and status in ('diproses','selesai')
  index coffee_orders_day       (ordered_at desc)
  index coffee_orders_person    (employee_id, ordered_at desc)

coffee_order_items         satu baris per jenis minuman dalam pengajuan (klaim: tepat satu, qty 1)
  id uuid pk, order_id uuid not null references coffee_orders(id) on delete cascade
  for_whom text check (in ('klaim','tamu','tim'))
  employee_id uuid references employees(id) on delete set null   -- tim: orangnya; klaim: pemesan; tamu: null
  person_name text, person_group text, person_position text, person_bu text   -- tim saja
  drink_slug text not null (<= 40)   -- slug dari src/lib/coffee/menu.ts, atau 'lainnya' (hanya Catat manual)
  drink_other text (<= 60)           -- wajib bila 'lainnya'
  temperature text check (in ('panas','es')), sugar text check (in 6 tingkat), ice text check (in 3 tingkat)
  qty smallint not null default 1 check (between 1 and 50), sort smallint not null default 0
  index coffee_order_items_order (order_id)

alter admin_grants: check apps diperluas dengan 'coffee'
  -- salin daftar dari migrasi terakhir yang menyentuh admin_grants_apps_check (sekarang 202611200703) lalu tambah 'coffee'
```

**Fungsi (semua `language plpgsql`, `set search_path = public, pg_temp`, `revoke all … from public, anon, authenticated`,
`grant execute … to service_role`):**

- `coffee_submit_claim(p_employee uuid, p_item jsonb, p_at timestamptz, p_manual boolean, p_actor uuid, p_actor_label text, p_key uuid) returns uuid`
  1. Bila `p_key` sudah ada → kembalikan id baris itu (idempoten).
  2. Baca `employees` (aktif, kategori, nama, jabatan, BU) dan `coffee_settings` **di dalam fungsi** (satu sumber kebenaran).
     Tidak aktif → `COFFEE_NOT_EMPLOYEE`.
  3. `bulan := to_char(p_at at time zone 'Asia/Jakarta', 'YYYY-MM')`;
     `perform pg_advisory_xact_lock(hashtext('coffee:' || p_employee || ':' || bulan))`.
  4. Hitung klaim `status in ('diproses','selesai')` orang itu di bulan itu; `>= jatah` → `raise exception 'COFFEE_QUOTA_FULL'`.
  5. Sisipkan pesanan (`number = nextval('coffee_claim_no')`; manual → `status 'selesai'`, `processed_*` = aktor) dan satu item.
- `coffee_submit_meeting(p_order jsonb, p_items jsonb, p_key uuid) returns uuid`: idempoten; PIC dan orang "tim" harus karyawan
  aktif (`COFFEE_NOT_EMPLOYEE`); `p_order.parent_id` terisi → kunci baris induk, `number` = milik induk, `round` = maks + 1;
  kalau tidak `nextval('coffee_meeting_no')`; sisipkan pesanan + semua item dalam satu transaksi. Tanpa jatah.
- `coffee_reopen(p_order uuid, p_actor uuid, p_actor_label text, p_window_seconds integer) returns void` (Urungkan):
  kunci baris; harus `status in ('selesai','ditolak')`, `manual = false`, diproses aktor yang sama
  (`processed_by is not distinct from p_actor and processed_label = p_actor_label`), dan `processed_at > now() - jendela`,
  kalau tidak `COFFEE_UNDO_EXPIRED`. Untuk klaim yang tadinya `ditolak`: ambil kunci jatah yang sama lalu cek jatah lagi
  (`COFFEE_QUOTA_FULL` bila sudah terisi sementara itu). Kembalikan ke `diproses`, kosongkan `processed_*` dan `reject_note`.

**Tanpa fungsi (satu pernyataan sudah atomik):**
- Selesai / Tolak: `update … set status, processed_* where id = $1 and status = 'diproses' returning …`; nol baris = sudah
  diproses orang lain → 409. Dua pengelola menekan bersamaan: hanya satu yang menang.
- Batal oleh pemesan: `update … set status = 'batal' where id = $1 and employee_id = $me and kind = 'klaim' and status = 'diproses'`.

**"Klaim ke-n" tidak disimpan**: dihitung saat dibaca (urutan `ordered_at` di antara klaim `diproses`/`selesai` orang itu pada
bulan itu), supaya tolak/batal/urungkan tidak meninggalkan nomor yang salah. Fungsi murni `claimNumbers()` di `src/lib/coffee/quota.ts`.

### Migrasi F4: `202612010002_coffee_push.sql`

`coffee_push_subscriptions`: salinan persis bentuk `pw_push_subscriptions` (`employee_id`, `endpoint` unik, `p256dh`, `auth`,
`device`, `created_at`, `last_sent_at`, indeks per `employee_id`). Tabel sendiri karena langganan terikat ke service worker
`/coffee/`, bukan `/wam/`.

---

## 3. Logika bersama, server, dan API

### 3.1 `src/lib/coffee/` (murni, dipakai browser dan server, semuanya diuji)

| Berkas | Isi |
| --- | --- |
| `menu.ts` (sudah ada, ditambah) | Tambah `drinkBySlug`, `drinkLabel(slug, other?)` ("Lainnya" bila kosong), `OTHER_DRINK = "lainnya"`. `MONTHLY_QUOTA` tetap sebagai nilai awal. |
| `rooms.ts` (sudah ada) | Tetap. Tambah `roomSpot(name)` → kunci denah atau null. |
| `types.ts` | `Status`, `OrderKind = "klaim" \| "rapat"`, `ItemFor = "klaim" \| "tamu" \| "tim"`, `QuotaGroup`, `Drinkline`, `MyOrder`, `QueueOrder`, `QueueItem`, `RecapRow`, `CoffeeSettings`, `Processor`. Label: `STATUS_LABEL`, `KIND_LABEL` ("Klaim", "Tamu", "Tim · rapat"), `orderNo(kind, number, round)` → `K-418`, `T-0113`, `T-0113-2`. |
| `schemas.ts` | zod 4: `drinklineSchema` (slug harus ada di `DRINKS`; suhu harus termasuk `temperatures` minuman; es diabaikan/dinormalkan "Normal" bila panas), `claimSchema { slug, temperature, sugar, ice, key: uuid }`, `meetingSchema { room (1–80), spot?, picId: uuid, guest? (≤120), guestCount? (1–500), parentId?: uuid, items: 1–40 × { for: "tamu"\|"tim", personId? (wajib bila tim), slug, temperature, sugar, ice, qty 1–50 }, key }`, `rejectSchema { note: 3–300 }`, `manualSchema { kind: "klaim"\|"tamu"\|"tim", employeeId, date, time, slug \| "lainnya", other?, temperature, sugar, ice, qty?, room?, guest?, guestCount? }`, `settingsSchema { karyawan, ga, intern: int 0–60 }`, `recapQuerySchema { dari, sampai (YYYY-MM-DD, rentang ≤ 366 hari), jenis?, status?, q? (≤80) }`. Pesan zod dalam bahasa Indonesia ("Pilih minuman.", "Tulis catatan untuk pemesan, minimal 3 huruf.", "Pilih PIC tamu.", "Tulis nama minumannya.", "Tanggal dan jam tidak boleh di masa depan."). |
| `quota.ts` | `quotaGroupOf(category)` (`karyawan`→karyawan, `dw`→ga, `intern`→intern), `quotaFor(group, settings)`, `wibMonth(iso)`, `wibDay(iso)`, `monthRange(month)`, `countsForQuota(status)`, `usedInMonth(orders, month)`, `claimNumbers(orders)` → Map id → n. |
| `access.ts` | `opensGaMode({ category, roles, holdsCoffee })`, `processorLabel({ name, nickname, superAdmin })` ("Dewi", "Super admin"; lihat pertanyaan 3). |
| `recap.ts` | `expandRows(orders)` (satu baris per minuman, qty dipecah), `DETAIL_HEAD` (22 kolom persis prototipe: Tanggal, Jam diajukan, Nomor pesanan, Jenis, Nama, Kelompok, Jabatan, BU, PIC, Tamu/instansi, Jumlah tamu, Ruangan, Minuman, Suhu, Gula, Takaran es, Status, Catatan tolak, Diproses oleh, Jam diproses, Klaim ke-, Dicatat manual), `detailCells(row)`, `summarize(rows, people, settings)` (total, per orang, per PIC, per BU, per minuman; hanya `diproses`/`selesai` yang dihitung), `summarySheet(summary, title)`, `filterRows(rows, query)`. Dipindah dari `PengelolaPrototype.tsx` (`storeRows`, `summarize`, `summarySheet`, `detailCells`). |
| `copy-text.ts` | `claimText(order)`, `meetingText(order)`: teks "Salin rincian" untuk JumpStart, persis prototipe. |
| `notify.ts` | `pushFor(event, order)` → `PushPayload` (judul, isi, url, tag) untuk: klaim baru, rapat baru, selesai, ditolak. |
| `tabs.ts` | `COFFEE_TABS = ["menu", "pesanan"]`, `coffeeTabPaths`, `tabOf(path)` (pola `src/lib/hr/tabs.ts`). |

Tes: `quota.test.ts` (batas bulan WIB 31 Des 23.59 vs 1 Jan 00.00 WIB, ditolak/batal tidak dihitung, nomor klaim setelah
pembatalan), `schemas.test.ts` (minuman tak dikenal, Espresso es ditolak, Cucumber Ice panas ditolak, tim tanpa orang, qty 0,
`lainnya` tanpa nama), `recap.test.ts` (qty 3 = 3 baris, tamu masuk BU PIC, ringkasan PIC menghitung tamu sekali per rapat,
klaim ditolak tidak punya "Klaim ke-"), `copy-text.test.ts`, `access.test.ts`, `tabs.test.ts`, `notify.test.ts`.

### 3.2 `src/lib/server/coffee/` (`import "server-only"`)

| Berkas | Fungsi |
| --- | --- |
| `session.ts` | `requireCoffeePage(here)` (→ `coffeePath.login(here)`), `requireGaPage(here)` / `requireApiGa()` (403 "Mode GA hanya untuk tim GA dan pengelola Werkudara Coffee."), `holdsCoffeeGrant(employeeId)` (baca `admin_grants.apps`), `coffeeActor()` → `{ employeeId: string \| null, label }` dari `currentAdmin()` (pola `hrAdminActor`). |
| `store.ts` | `COFFEE_MIGRATION = "202612010001_coffee.sql"`, `missing(error)` (kode `42P01`, `PGRST205`, `42883`, `PGRST202`, atau pesan memuat `coffee_`), `waitingForMigration()` → `ServiceError(503, "Werkudara Coffee menunggu migrasi 202612010001_coffee.sql.")`, `coffeeError(error)` yang memetakan: `COFFEE_QUOTA_FULL` → 409 "Jatah bulan ini sudah habis.", `COFFEE_NOT_EMPLOYEE` → 422 "Karyawan tidak ditemukan atau sudah tidak aktif.", `COFFEE_UNDO_EXPIRED` → 409 "Sudah lewat batas waktu untuk mengurungkan.", lainnya → `databaseError`. Pembaca baris → tipe `src/lib/coffee/types.ts`. |
| `settings.ts` | `readSettings()` (sebelum migrasi: nilai `MONTHLY_QUOTA`), `saveSettings(input, actor)`. |
| `claims.ts` | `myState(member)` → `{ me: { id, name, group, quota, used, left, month }, orders: MyOrder[] (bulan ini + 20 terakhir, dengan `claimNo`), ga, pengelola }`; `submitClaim(member, input)`; `cancelClaim(member, id)` (0 baris → 409 "Pengajuan ini sudah diproses, tidak bisa dibatalkan."). |
| `meetings.ts` | `gaState(member)` → `{ today: MeetingOrder[], people: { id, name, position, bu }[] (karyawan aktif), rooms }`; `submitMeeting(member, input)`. |
| `queue.ts` | `queue()` → `{ waiting: QueueOrder[] (terlama dulu), recent: 6 terakhir diproses, today: { diproses, selesai, ditolak }, now }`; `waitingCount()`; `finishOrder(id, actor)`; `rejectOrder(id, note, actor)` (0 baris → 409 "Pesanan ini sudah diproses orang lain. Antrean diperbarui."); `reopenOrder(id, actor)` (jendela `UNDO_WINDOW_SECONDS = 300`); `recordManual(input, actor)` (klaim lewat `coffee_submit_claim` dengan `p_manual`, jadi jatah tetap dijaga; tamu/tim lewat `coffee_submit_meeting` berstatus selesai; tanggal paling lama awal bulan lalu). |
| `recap.ts` | `recapRows(query)` (halaman 1000 baris sampai habis, pola `.range`), `recap(query)` → `{ rows, summary, title }`, `recapFiles(query)` → `{ csv: string, xlsx: Buffer }` (`writeXlsx([{ name: "Detail", … }, { name: "Ringkasan", … }])`, `csvCell`). |
| `people.ts` | `activePeople()` (id, nama, panggilan, jabatan, BU, kelompok) untuk pemilih orang; `holders()` (pemegang grant `coffee`, untuk Pengaturan dan penerima push). |
| `push.ts` (F4) | `pushPublicKey()`, `saveSubscription(employeeId, …)`, `removeSubscription`, `sendCoffeePush(employeeIds, payload)`, `scheduleCoffeePush` (`after()`), `notifyNewOrder(order, exceptEmployeeId)`, `notifyDecided(order)`. Tidak pernah melempar: tanpa kunci/migrasi, pesanan tetap tersimpan. |

Tes server (tiruan Supabase di memori, termasuk `.rpc`): `claims.test.ts`, `queue.test.ts`, `meetings.test.ts`,
`recap.test.ts`, `settings.test.ts`, `push.test.ts`. Wajib ada: jatah habis → 409; dua "Selesai" pada pesanan yang sama →
yang kedua 409; batal milik orang lain → 409/404; Urungkan oleh aktor lain atau lewat jendela → 409; sebelum migrasi → 503.

### 3.3 Alamat (`src/lib/routes.ts`, di bawah blok WG People)

```ts
export const COFFEE_PATH = "/coffee";
export const coffeePath = { home, orders: "/coffee/pesanan", ga: "/coffee/ga", login(next?), forgot: "/coffee/lupa-password",
  newPassword(next?), manifest: "/coffee/manifest.webmanifest", serviceWorker: "/coffee/sw.js", scope: "/coffee/",
  photo: (slug) => `/coffee/drinks/${slug}.jpg`, icon: (name) => `/coffee/${name}` };
export const coffeeApi = { state: "/api/coffee/state", claims: "/api/coffee/claims", claim: (id) => …,
  gaState: "/api/coffee/ga/state", gaMeetings: "/api/coffee/ga/meetings", push: "/api/coffee/push", pushTest: "/api/coffee/push/test" };
export const COFFEE_ADMIN = "/admin/coffee";
export const coffeeAdminPath = { home (Antrean), manual: "/admin/coffee?catat=1", recap: (month?) => "/admin/coffee/rekap", settings: "/admin/coffee/pengaturan" };
export const coffeeAdminApi = { queue, finish: (id), reject: (id), reopen: (id), manual, people, recap: (query), recapExport: (format, query), settings, push };
export const JUMPSTART_URL = "https://jumpstart.id/outlet/menu";
```

### 3.4 API

Semua route: `export const dynamic = "force-dynamic"`, dibungkus `handle()`, tulis = `checkOrigin(request)` + `readJson(request, batas)` + `validate()`.

**Karyawan (`requireApiMember()`):**

| Route | Metode | Masuk → keluar | Catatan |
| --- | --- | --- | --- |
| `/api/coffee/state` | GET | → `myState` | Dipakai polling. |
| `/api/coffee/claims` | POST | `claimSchema` → `{ order: MyOrder, me }`, pesan "Pengajuan terkirim." | `enforceRateLimit(request, "coffee-klaim", 30)`. 409 "Jatah bulan ini sudah habis." |
| `/api/coffee/claims/[id]` | DELETE | → `{ order, me }`, "Pengajuan dibatalkan. Jatah kamu dikembalikan." | id `z.uuid()`. |
| `/api/coffee/ga/state` | GET | → `gaState` | `requireApiGa()`. |
| `/api/coffee/ga/meetings` | POST | `meetingSchema` → `{ order }`, "Pesanan terkirim ke pengelola." | `requireApiGa()`, rate limit `"coffee-rapat"` 60. |
| `/api/coffee/push` (F4) | GET / POST / DELETE | seperti `/api/wam/push` | `pushSubscriptionSchema`, `pushEndpointSchema`. |
| `/api/coffee/push/test` (F4) | POST | → "Notifikasi tes dikirim." | rate limit 10. |

**Pengelola (`requireApiAdmin()`; `proxy.ts` sudah menjaga `/api/admin/*`, area `coffee` lewat `areaOfPath`):**

| Route | Metode | Masuk → keluar |
| --- | --- | --- |
| `/api/admin/coffee/queue` | GET | → `queue()` |
| `/api/admin/coffee/orders/[id]/selesai` | POST | → `{ order }`, "Selesai diproses." |
| `/api/admin/coffee/orders/[id]/tolak` | POST | `rejectSchema` → `{ order }`, "Ditolak. Pemesan diberi tahu beserta catatannya." |
| `/api/admin/coffee/orders/[id]/urungkan` | POST | → `{ order }`, "Dikembalikan ke antrean." |
| `/api/admin/coffee/manual` | POST | `manualSchema` → `{ order }`, mis. "Rina · Café Latte · klaim ke-3 dari 4." |
| `/api/admin/coffee/people` | GET | → `activePeople()` (dengan jatah terpakai bulan `?bulan=`) |
| `/api/admin/coffee/rekap` | GET | `recapQuerySchema` → `{ rows, summary, title }` |
| `/api/admin/coffee/rekap/export` | GET | `?format=csv\|xlsx` + filter → berkas; `sameOriginRead(request)`; nama `werkudara-coffee-<dari>_<sampai>.<ext>` |
| `/api/admin/coffee/settings` | GET / PUT | `settingsSchema` → `{ settings, holders }`, "Jatah disimpan." |
| `/api/admin/coffee/push` (F4) | GET / POST / DELETE | hanya aktor `kind: "person"` (punya `employeeId`); super admin → 409 "Masuk dengan akun karyawan untuk menerima notifikasi." |

Data langsung: **polling** `GET …/queue` tiap 10 detik selama tab terlihat + saat `visibilitychange`; aplikasi karyawan dan
tablet GA tiap 15 detik hanya selama ada pesanan `diproses`, + saat kembali ke depan. Berhenti saat tab tersembunyi.

---

## 4. Fase

Tiap fase satu agen, selesai dengan: `npx vitest run <folder fase>`, `npm run typecheck`, `npm run lint` lulus (tanpa
`npm run build` bila `next dev` sedang jalan). Verifikasi browser memakai server dev yang dijalankan PM. Sebelum migrasi
dijalankan pemilik, halaman asli menampilkan pemberitahuan "menunggu migrasi" dan UI diperiksa di `/dev-preview/coffee/nyata/*`
(komponen asli + data contoh "Contoh …" + klien API tiruan lewat prop).

### F0 Fondasi

**Buat:** `supabase/migrations/202612010001_coffee.sql`; `src/lib/coffee/{types,schemas,quota,access,recap,copy-text,notify,tabs}.ts` + tes;
`src/lib/server/coffee/{session,store,settings,claims,meetings,queue,recap,people}.ts` + tes; semua route di §3.4 kecuali push;
`public/coffee/drinks/*.jpg` (salinan dari `public/dev/coffee/`, yang lama tetap untuk prototipe).
**Ubah:** `src/lib/routes.ts` (+ `routes.test.ts`); `src/lib/coffee/{menu,rooms}.ts`; `src/lib/admin-access.ts` (`ADMIN_APPS` + `"coffee"`,
label "Werkudara Coffee", hint, `ADMIN_COFFEE_MIGRATION`, dua baris `areas` untuk `/admin/coffee` dan `/api/admin/coffee`,
`showsAppCard` kunci `coffee`) + `admin-access.test.ts`; `src/lib/server/admin-actor.ts` (pesan 23514 untuk `coffee`);
`src/lib/server/standalone-apps.ts` (kartu `coffee`, `waitingCount()`); `src/lib/short-code.test.ts` (`readEventCode("coffee")` null);
`next.config.ts` (redirect `/coffee/hr` → `/admin/coffee`).
**Selesai bila:** semua tes §3.1–3.2 lulus; setiap route menolak tanpa sesi (401), tanpa grant (403), origin asing (403), isi
salah (422 dengan `fieldErrors`); sebelum migrasi semua menjawab 503 dengan nama migrasi; kotak "Werkudara Coffee" muncul di
Super admin → Akses admin (tes `AdminGrants` yang ada tetap lulus); tes penjaga alamat lulus.
**Cek browser:** `/admin/akses` menampilkan kotak baru; `/api/coffee/state` tanpa masuk → 401 JSON.
**Jangan sentuh:** `src/lib/server/pra-wam/**`, `src/lib/server/hr/**`, `src/proxy.ts`, `src/components/**`, halaman apa pun, prototipe.

### F1 Pengelola `/admin/coffee` (pertama, permintaan pemilik)

**Buat:** `src/app/admin/coffee/{page.tsx (Antrean), rekap/page.tsx, pengaturan/page.tsx, loading.tsx}` (pola `src/app/admin/hr/page.tsx`);
`src/components/coffee-admin/`: `sections.ts` (+ tes; Antrean dengan badge, Rekap, Pengaturan; `COFFEE_ADMIN_LABEL = "Werkudara Coffee"`),
`CoffeeAdminFrame.tsx`, `CoffeeAdminNav.tsx` (`ConsoleShell`, tautan "Buka Werkudara Coffee"), `useQueue.ts` (cache + polling +
aksi optimistis yang dibatalkan saat 409), `QueueView.tsx`, `QueueCard.tsx` (klaim: nama, kelompok, titik jatah, minuman, opsi, lama
menunggu; rapat: ruangan, PIC, tamu, daftar item Tamu / Tim · rapat), `RefuseDialog.tsx`, `ManualSheet.tsx`, `PersonPicker.tsx`,
`RecapView.tsx` (filter bulan/rentang, jenis, status, cari; tab Ringkasan / Detail), `DetailTable.tsx`, `SettingsView.tsx`,
`Layer.tsx` (dialog/panel samping: Escape, jebakan fokus, fokus kembali, tombol kembali HP), `api.ts`, `coffee-admin.module.css`
(dari `pengelola-prototype.module.css`), tes `*.dom.test.tsx`; `src/app/dev-preview/coffee/nyata/admin/page.tsx`.
**Perilaku (ikut prototipe):** kartu antrean punya **Salin rincian**, **Buka JumpStart** (tab baru, `rel="noreferrer"`),
**Selesai diproses**, **Tolak** (catatan wajib, tiga alasan cepat); setelah aksi muncul pesan dengan **Urungkan**; "Baru diproses"
(6 terakhir) juga menawarkan Urungkan selama 5 menit dan hanya untuk pemrosesnya; pesanan baru masuk tanpa muat ulang + pesan
"Pesanan baru masuk"; antrean kosong: "Antrean kosong. Pesanan baru muncul di sini tanpa memuat ulang halaman."; Catat manual
tersimpan sebagai selesai dan bertanda "Dicatat manual", menolak bila jatah habis; Rekap: **Unduh CSV** dan **Unduh Excel**
(berkas sungguhan dari server, menggantikan "pratinjau Excel"); Pengaturan: jatah bisa diubah, pemegang akses dan ruangan hanya dibaca.
HP (≤ 760 px): daftar kartu, lembar dari bawah, tabel jadi daftar, tanpa geser ke samping di 320 px.
**Selesai bila:** dua jendela pengelola: aksi di satu jendela muncul di jendela lain ≤ 10 detik, dan menekan Selesai pada pesanan
yang sudah diproses menampilkan "Pesanan ini sudah diproses orang lain." tanpa merusak antrean; angka Ringkasan = jumlah baris
Detail; isi .xlsx dan CSV sama dengan tabel; standar admin §9 terpenuhi.
**Tes:** `sections.test.ts`, `QueueView.dom.test.tsx` (selesai, tolak tanpa catatan ditahan, urungkan, 409), `ManualSheet.dom.test.tsx`
(galat per kolom, jatah habis), `RecapView.dom.test.tsx` (filter, tautan unduh membawa filter).
**Cek browser:** `/dev-preview/coffee/nyata/admin` di 1440, 768, 390, 320 px, dibandingkan dengan `/dev-preview/coffee/hr`.
**Jangan sentuh:** `src/components/hr-admin/**` dan `src/components/console/**` (hanya diimpor), `src/lib/server/coffee/**` (cacat
server dilaporkan ke PM, bukan ditambal di UI), prototipe.

### F2 Karyawan `/coffee`

**Buat:** `src/app/coffee/{layout.tsx, loading.tsx, manifest.webmanifest/route.ts, masuk/page.tsx, lupa-password/page.tsx,
password-baru/page.tsx}`, `src/app/coffee/(app)/{layout.tsx, page.tsx, pesanan/page.tsx, CoffeeScreen.tsx}`;
`src/components/coffee/`: `CoffeeAuth.tsx`, `CoffeeFrame.tsx` (dua tab, `pushState`, daftar SW, lapisan sheet), `CoffeeApp.tsx`
(data, polling, sheet), `MenuScreen.tsx`, `DrinkSheet.tsx`, `OrdersScreen.tsx`, `CurrentOrder.tsx`, `PantryMap.tsx`, `SetupSteps.tsx`
(pasang + notifikasi, sekali; langkah notifikasi hanya penjelasan sampai F4), `Toast.tsx`, `api.ts`, `coffee.module.css` (dari
`coffee-prototype.module.css`), tes; `public/coffee/sw.js` (install, halaman offline; belum ada push), ikon
`public/coffee/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png`; `src/app/dev-preview/coffee/nyata/page.tsx`.
**Perilaku (ikut prototipe):** kartu sisa jatah "n dari 4 bulan ini"; tab Kopi / Non-kopi; sheet minuman: Panas/Es (hanya yang
tersedia), gula 6 tingkat, takaran es hanya bila Es, "Klaim ke-n dari 4", tombol **Ajukan**; jatah habis → tombol mati dengan
alasan; setelah ajukan pindah ke Pesanan saya; status: "Pengajuan sedang diproses" → "Silakan ambil di mesin" (Selesai oleh
<nama> · jam, denah Pantry, catatan es) / "Pengajuan tidak bisa diproses" (catatan + "Jatah kamu tidak berkurang.") / "Pengajuan
dibatalkan"; **Batalkan pengajuan** lewat konfirmasi; titik di tab saat ada yang diproses; perubahan status muncul sebagai toast di
atas; nomor klaim tidak tampil pada yang ditolak/batal. Tautan "Mode GA" dan "Pengelola" hanya untuk yang berhak (`state.ga`,
`state.pengelola`).
**Selesai bila:** bisa dipasang (manifest sah, SW aktif di scope `/coffee/`); pindah tab tanpa permintaan jaringan; ajukan →
muncul di antrean pengelola; selesai/tolak di admin → berubah di HP ≤ 15 detik tanpa muat ulang; kirim ganda (ketuk dua kali,
jaringan lambat) = satu klaim.
**Tes:** `CoffeeAuth.dom.test.tsx`, `DrinkSheet.dom.test.tsx`, `CoffeeApp.dom.test.tsx` (jatah habis, batal, pembaruan status),
`tabs.test.ts`.
**Cek browser:** 390×844 dan 320 px; bandingkan dengan `/dev-preview/coffee`; Lighthouse PWA "installable".
**Jangan sentuh:** `src/components/hr/**`, `src/components/booking/BookingAuth.tsx` (hanya diimpor), `public/people/**`,
`public/wam/**`, `public/sw.js`, admin F1.

### F3 Tablet GA `/coffee/ga` + buku menu tamu

**Buat:** `src/app/coffee/ga/{layout.tsx (viewport tablet), page.tsx}` (di luar grup `(app)`, tanpa kerangka HP);
`src/components/coffee/ga/`: `GaApp.tsx`, `Home.tsx`, `FloorMap.tsx` (dari `PLAN_SPOTS`, `BUILDING`), `NewOrder.tsx`,
`QuickInput.tsx`, `LineDialog.tsx`, `Sent.tsx`, `GuestBook.tsx`, `ExitDialog.tsx`, `ga.module.css` (dari
`ga-prototype.module.css`), tes; `src/app/dev-preview/coffee/nyata/ga/page.tsx`.
**Perilaku (ikut prototipe):** beranda dengan denah "Ruangan dengan pesanan" berwarna status; pesanan baru cukup ruangan + PIC
(tamu/instansi dan jumlah opsional; "Lainnya" diketik); input cepat: ketuk minuman + jumlah, tanda Tamu / Tim · rapat (tim wajib
memilih orangnya), bawaan Panas · gula Normal, ubah per baris; **Serahkan ke tamu** membuka buku menu (sampul hitam logo emas,
halaman krem, tab Kopi/Non-kopi); pilihan tamu kembali sebagai baris Tamu dan **GA yang mengirim**; keluar dari buku menu lewat
konfirmasi; layar terkirim dengan status langsung; **Tambah lagi** memakai ruangan/PIC yang sama (`parentId`). Buku menu tidak
menampilkan data karyawan dan tidak memanggil API apa pun.
**Selesai bila:** kiriman muncul di antrean pengelola sebagai satu kartu rapat; "Tambah lagi" muncul sebagai `T-xxxx-2`; rekap
mencatat tamu atas nama dan BU PIC, tim atas nama orangnya; karyawan biasa membuka `/coffee/ga` → dialihkan ke `/coffee` dengan
pesan; API GA menolak non-GA (403).
**Tes:** `QuickInput.dom.test.tsx`, `GuestBook.dom.test.tsx` (tidak ada nama karyawan di DOM, keluar butuh konfirmasi),
`GaApp.dom.test.tsx` (kirim, tambah lagi, status berubah).
**Cek browser:** 1024×768 mendatar dan 768×1024 tegak; sentuh ≥ 48 px; bandingkan dengan `/dev-preview/coffee/ga`.
**Jangan sentuh:** `src/lib/pra-wam/floor-plan.ts` dan `src/components/pra-wam/**` (hanya diimpor), F1, F2 kecuali tautan Mode GA.

### F4 Web push ujung ke ujung

**Buat:** `supabase/migrations/202612010002_coffee_push.sql`; `src/lib/server/coffee/push.ts` + tes; `src/app/api/coffee/push/route.ts`,
`push/test/route.ts`, `src/app/api/admin/coffee/push/route.ts`; `src/components/coffee/usePush.ts` (izin, `pushSupport`,
`keyBytes`, langganan pada registrasi `/coffee/sw.js`), `NotifySetup.tsx`.
**Ubah:** `public/coffee/sw.js` (handler `push` dan `notificationclick` seperti `public/wam/sw.js`; klik membuka `url` dari
payload, hanya alamat situs sendiri); `claims.ts`, `meetings.ts`, `queue.ts` memanggil `notifyNewOrder` / `notifyDecided` lewat
`after()`; `SetupSteps.tsx`, tablet GA, dan `CoffeeAdminNav` mendapat tombol "Nyalakan notifikasi".
**Aturan kirim:** klaim/rapat baru → semua pemegang grant `coffee` kecuali pengirimnya, `url` `/admin/coffee`, `tag` nomor
pesanan; selesai/ditolak → pemesan (klaim) atau pengirim GA + PIC (rapat), `url` `/coffee/pesanan` atau `/coffee/ga`; Catat
manual dan Urungkan tidak mengirim. iPhone: hanya setelah dipasang ke layar utama (tampilkan petunjuk, bukan galat). Izin
ditolak → aplikasi tetap jalan dengan polling.
**Selesai bila:** Android Chrome dan desktop menerima keempat jenis; langganan mati (404/410) terhapus; tanpa kunci VAPID atau
sebelum migrasi tidak ada aksi yang gagal; isi notifikasi tidak memuat data selain nama panggilan, minuman, ruangan.
**Tes:** `push.test.ts` (penerima benar, pengirim dikecualikan, gagal kirim tidak melempar), `notify.test.ts`.
**Jangan sentuh:** `src/lib/server/pra-wam/push.ts`, `public/wam/sw.js`, tabel `pw_push_subscriptions`.

### F5 Audit menyeluruh + QA

Tanpa fitur baru. Peninjau (bukan penulis fasenya) menjalankan templat §5 untuk seluruh aplikasi, lalu:
- **Keamanan:** tabel route × (tanpa sesi, karyawan biasa, GA, pengelola, super) dengan hasil yang diharapkan, diuji satu per
  satu; `checkOrigin` di semua tulis; batas `readJson`; rate limit; id dari URL selalu `z.uuid()`; tidak ada id karyawan dari
  badan permintaan yang dipercaya untuk "siapa saya"; ekspor aman dari formula; RLS dan grant di kedua migrasi; buku menu tamu
  tidak bisa mencapai data karyawan.
- **Data:** uji balapan jatah (20 permintaan serentak untuk satu orang dengan sisa 1 → tepat 1 berhasil; dijalankan pemilik/PM
  di database uji setelah migrasi), pergantian bulan WIB, urungkan setelah jatah terisi.
- **A11y:** keyboard penuh, fokus terlihat, dialog/sheet menjebak dan mengembalikan fokus, kontras ≥ 4,5:1, status tidak hanya warna, `prefers-reduced-motion`.
- **Kinerja:** polling berhenti saat tersembunyi; foto minuman berukuran wajar (≤ 60 KB, `loading="lazy"`, `width/height`); tidak ada muat ulang penuh antar layar.
- **Kata:** sama dengan prototipe dan rancangan; "kamu" untuk karyawan; tidak ada "HR membelikan"; pesan galat menyebut cara memperbaikinya.
- **Dokumen:** tulis `docs/aturan-coffee.md` (pola `docs/aturan-hr.md`), perbarui `docs/rancangan-kopi-kantor.md` (status), ringkasan untuk `brain/projects/`.
- Daftar cek rilis untuk pemilik: jalankan dua migrasi, beri grant `coffee`, cek kunci VAPID, bagikan `/coffee`.

---

## 5. Templat audit per fase

Peninjau mengisi satu salinan per fase. Tiap baris: **Lulus / Gagal / Tidak diuji** + bukti (berkas:baris, perintah, tangkapan layar).

| Sisi | Yang diperiksa |
| --- | --- |
| Keamanan | Setiap route baru punya penjaga sesi yang benar (`requireApiMember` / `requireApiGa` / `requireApiAdmin`) sebagai baris pertama. Tulis memakai `checkOrigin`. Masukan lewat `validate()` + zod, batas panjang ada. Tidak ada rahasia, id, atau data orang lain di jawaban. Tabel baru: RLS nyala, hanya `service_role`. Tidak ada `createPrivilegedClient` di komponen klien. |
| Data dan jatah | Jatah hanya diputuskan di `coffee_submit_claim`. Ditolak/batal tidak dihitung. Bulan dihitung WIB. Kirim ganda = satu baris. Dua pengelola bersamaan = satu pemenang. Salinan nama/BU ada di baris. Angka ringkasan cocok dengan detail. |
| UX vs prototipe | Layar, urutan, dan kata sama dengan prototipe terkait (sebut selisih satu per satu dan alasannya). Setiap aksi punya status (menyimpan, berhasil, gagal + coba lagi). Aksi berisiko lewat konfirmasi. Kosong mengajak, bukan galat. |
| Rasa aplikasi | Kerangka tetap; tidak ada muat ulang penuh; data dari cache lalu diperbarui diam-diam; formulir dan detail di sheet/panel; tombol kembali HP menutup sheet; kerangka per bagian saat memuat. |
| A11y | Label terlihat di semua kolom; tombol ikon bernama; urutan fokus; Escape; `role="status"`/`alert` pada pesan; target sentuh ≥ 44 px (≥ 48 px di tablet GA); teks isian ≥ 16 px. |
| HP dan tablet | 1440, 1024, 768, 390, 320 px: tidak ada geser ke samping, tidak bertumpuk; area aman (notch, bilah bawah). |
| Tes | Tes baru ada untuk aturan yang ditambahkan; `npx vitest run`, `npm run typecheck`, `npm run lint` lulus; sebutkan yang tidak diuji dan mengapa. |
| Kode vs konvensi | Alamat hanya di `routes.ts`; komentar bahasa Inggris singkat seperti berkas lain; CSS modules; tidak ada dependensi baru; tidak menyentuh berkas di luar daftar fase; nama contoh "Contoh …"; tidak ada data asli di repo. |
| Laporan | Daftar berkas berubah, tes yang dijalankan, yang gagal/dilewati/belum diuji, pertanyaan untuk pemilik. |

---

## 6. Pertanyaan untuk pemilik (dengan anggapan yang dipakai)

1. **Siapa "GA"?** Data karyawan tidak lagi punya kategori GA (sejak 13 Nov jadi `dw`, Daily Worker). Anggapan: kelompok jatah
   GA (2) = kategori `dw`; Mode GA terbuka untuk kategori `dw`, peran "Admin Booking" (`pw_roles.ga`, staf administrasi), dan
   pemegang akses Coffee.
2. **Jatah pengelola/HR sendiri?** Anggapan: mengikuti kategori masing-masing, klaim lewat `/coffee` seperti karyawan lain; boleh memproses klaim sendiri.
3. **Nama pemroses yang dilihat pemesan.** Prototipe: "Dewi (HR)". Sistem tidak tahu siapa HR. Anggapan: nama panggilan saja ("Selesai oleh Dewi"); super admin tampil "Super admin".
4. **Batas Urungkan.** Anggapan: 5 menit, hanya oleh orang yang memprosesnya.
5. **Catat manual mundur sampai kapan?** Anggapan: paling lama awal bulan lalu; klaim manual tetap ditolak bila jatah bulan itu habis.
6. **GA boleh membatalkan pesanan rapat yang masih diproses?** Prototipe tidak punya. Anggapan: tidak; salah kirim ditolak pengelola.
7. **Keluar dari buku menu tamu.** Anggapan: konfirmasi saja (seperti prototipe), tanpa PIN.
8. **Bahasa aplikasi karyawan.** Anggapan: Indonesia saja (WG People bawaannya English).
9. **Pintu di halaman utama Journey dan kartu di beranda admin.** Anggapan: kartu admin ya; pintu di `journey.werkudara.group` belum (menunggu pengumuman).
10. **Kunci VAPID.** Anggapan: memakai kunci WAM yang sudah ada di server (`WAM_VAPID_*`), tanpa kunci baru.
11. **Database uji.** Anggapan: tidak ada untuk agen; UI diperiksa di `/dev-preview/coffee/nyata/*`, uji balapan jatah dijalankan setelah pemilik menjalankan migrasi.
12. **Double shot, printer thermal, "Sudah saya ambil", foto asli.** Anggapan: di luar versi pertama.

---

## Catatan pelaksanaan F0 (25 Nov 2026)

F0 selesai di cabang `feat/werkudara-coffee`. Yang berbeda dari rencana, dan yang perlu diketahui fase berikutnya:

**Sudah dicek sebelum menulis migrasi:** migrasi terakhir memang `202611300003`, jadi nama `202612010001_coffee.sql` dipakai apa
adanya; daftar `admin_grants_apps_check` disalin dari `202611200703_admin_grants_hr.sql` lalu ditambah `'coffee'`.

**Belum diuji (apa adanya):**
- Migrasi **belum pernah dijalankan** di Postgres mana pun (aturan: agen tidak menjalankan migrasi). Tiga fungsi SQL
  (`coffee_submit_claim`, `coffee_submit_meeting`, `coffee_reopen`) hanya ditinjau dengan dibaca; tes server memakai tiruan
  di memori (`src/lib/server/coffee/fake-db.ts`) yang menulis ulang aturan yang sama dalam JavaScript. Salah ketik SQL baru
  ketahuan saat pemilik menjalankan migrasi; uji balapan jatah (F5) tetap wajib.
- Cek browser F0 (`/admin/akses` menampilkan kotak baru, `/api/coffee/state` 401) tidak dilakukan: agen tidak menjalankan
  server dev. Gantinya tes: `AdminGrants.dom.test.tsx` tetap lulus, dan 401/403/422/503 tiap route ada di
  `src/app/api/coffee/coffee-guards.test.ts` dan `src/app/api/admin/coffee/coffee-admin-guards.test.ts`.

**Selisih dari rencana:**
1. `src/components/admin/events/EventList.tsx` disentuh satu baris (`appLooks.coffee`: huruf "C" di atas warna gelap).
   Tipe di sana menuntut tampilan untuk setiap kunci `StandaloneApp`, jadi kartu baru tidak lolos `tsc` tanpanya. Belum ada
   logo; F2 boleh menggantinya dengan `logo: coffeePath.icon("icon-192.png")`.
2. Alamat: tambah `coffeePath.gaDenied` (`/coffee?pesan=ga`, tujuan `requireGaPage` untuk yang tidak berhak; F2 menampilkan
   pesannya). `coffeeAdminApi.people` adalah fungsi `(month?)`, bukan teks. `/coffee/hr` dan `/coffee/hr/*` dialihkan
   sementara (`permanent: false`).
3. Kode galat database tambahan: `COFFEE_NOT_FOUND` (404, pesanan induk atau pesanan yang diurungkan tidak ada) dan
   `COFFEE_INVALID` (422, isi yang lolos dari zod tetapi ditolak fungsi, mis. waktu di masa depan).
4. `manualSchema` punya `key` opsional (kirim ganda = satu baris). `meetingSchema.spot` diterima tetapi tidak dipercaya:
   server mengisi `room_spot` dari nama ruangan (`roomSpot`). Catat manual "tim": orang itu sendiri dicatat sebagai PIC.
5. `readSettings()` mengembalikan nilai awal sebelum migrasi (sesuai rencana), tetapi `GET /api/admin/coffee/settings`
   memakai `readSettings(true)` supaya menjawab 503 seperti route lain.
6. `queue(actor)` menerima aktor dan menandai `undoable` pada "Baru diproses" (pemrosesnya sendiri, belum lewat 5 menit,
   bukan catat manual). `today.diproses` = semua yang menunggu; `selesai`/`ditolak` = yang **diproses** hari ini (WIB).
   Jawaban Selesai/Tolak/Urungkan/Catat manual berisi pesanan lengkap (`claimNo`, `quota`, `used`, `undoable`).
7. Membatalkan klaim orang lain menjawab 409 dengan kalimat yang sama seperti "sudah diproses" (tidak membocorkan ada/tidaknya).
8. `coffeeActor()` membaca nama panggilan dari `employees` (aktor admin hanya membawa nama lengkap); tanpa nama panggilan
   dipakai kata pertama nama. Super admin: `employeeId null`, label "Super admin".
9. Rekap: "Klaim ke-" dihitung dari seluruh klaim bulan terkait, bukan hanya rentang yang dibuka. Putaran rapat
   (`T-0113`, `T-0113-2`) dihitung satu rapat, dan jumlah tamu dihitung sekali per rapat. Orang di baris rekap yang sudah
   tidak aktif tetap masuk ringkasan. Lembar Ringkasan menulis angka sebagai sel angka.
10. Baris rapat juga menyimpan `person_group` PIC; `person_name` wajib isi. Batas waktu: fungsi menolak `ordered_at` lebih
    dari 5 menit di depan.
11. Berkas tambahan: `src/lib/coffee/fixtures.ts` (data contoh tes logika murni), `src/lib/server/coffee/fake-db.ts`,
    `session.test.ts`, dan dua tes penjaga route. `push.ts`/`push.test.ts` memang bagian F4.

**Untuk F1 (admin/pengelola):**
- Tipe jawaban ada di `src/lib/coffee/types.ts`: `QueueState`, `QueueOrder` (kartu klaim: `person`, `claimNo`, `quota`,
  `used`; rapat: `room`, `person` = PIC, `guest`, `items[].for`), `RecapRow`, `CoffeeSettings`, `CoffeePerson`.
  `GET …/people` menjawab `{ people, month }`; `GET …/rekap` `{ rows, summary, title }`; `GET/PUT …/settings`
  `{ settings, holders }`. Teks "Salin rincian": `orderText(order)` di `copy-text.ts`.
- 409 pada Selesai/Tolak = "Pesanan ini sudah diproses orang lain. Antrean diperbarui."; pada Urungkan = "Sudah lewat
  batas waktu untuk mengurungkan." atau "Jatah bulan ini sudah habis."; 503 = menunggu migrasi (tampilkan sebagai `Notice`).
- `recapQuerySchema` meminta `dari` dan `sampai` (YYYY-MM-DD, WIB, paling lama 366 hari); halaman Rekap menerjemahkan
  `?bulan=` ke rentang itu. Tautan unduh: `coffeeAdminApi.recapExport("csv" | "xlsx", filter)` (GET biasa, tanpa fetch).
- Foto minuman: `coffeePath.photo(slug)` (`public/coffee/drinks/`). Tes penjaga di `routes.test.ts` menolak alamat
  `/coffee…` yang ditulis tangan di luar `routes.ts` (kecuali `dev-preview`).
- Kutipan jatah per orang di ringkasan memakai jatah bulanan; untuk rentang lebih dari sebulan F1 perlu memutuskan cara menampilkannya.

---

## Catatan pelaksanaan F1 (25 Nov 2026)

F1 (pengelola, `/admin/coffee`) selesai di cabang `feat/werkudara-coffee`. Tidak ada berkas F0 (`src/lib/server/coffee/**`,
`supabase/migrations/**`, API) yang diubah; tidak ditemukan cacat server yang menghalangi F1.

**Belum diuji (apa adanya):**
- Halaman asli `/admin/coffee`, `/rekap`, `/pengaturan` **belum pernah dibuka setelah masuk admin**: agen tidak memakai
  sandi admin. Yang dicek: ketiganya terkompilasi dan mengalihkan ke `/admin/login?next=…` tanpa sesi (307), API menjawab 401.
  Tampilan "menunggu migrasi" (bingkai + `Notice`) dilihat lewat `/dev-preview/coffee/nyata/admin?tunggu=1`, yang memakai
  komponen yang sama (`CoffeeAdminWaiting`), bukan lewat jalur server yang sesungguhnya.
- Unduh CSV / Excel: hanya alamatnya yang diuji (membawa filter yang sama); berkasnya butuh sesi admin dan migrasi.
- "Dua jendela pengelola ≤ 10 detik" diuji dengan server tiruan (tombol pratinjau), bukan dua sesi asli.
- Salin rincian: panel browser agen menolak izin clipboard, jadi yang terlihat di browser hanya "Gagal salin"; jalur
  berhasil diuji di tes (`QueueView.dom.test.tsx`).
- Lebar 768 px tidak dicek terpisah (1440, 375, 320 dicek; di bawah 1024 px menu menjadi laci bawaan `ConsoleShell`).

**Selisih dari rencana:**
1. **Satu layar, bukan tiga halaman terpisah.** `CoffeeAdminApp.tsx` (baru) memegang Antrean, Rekap, dan Pengaturan sekaligus
   di dalam `ConsoleShell`. Ketiga `page.tsx` tetap ada (alamat langsung, data awal dari server), tetapi pindah bagian hanya
   mengganti alamat (`history.pushState`, seperti `HrFrame`) tanpa memuat ulang: tautan menu `ConsoleShell` (yang berupa
   `<a href>`) dicegat di `CoffeeAdminApp`. Sebelum JavaScript siap, tautan itu tetap bekerja sebagai tautan biasa.
   Bagian yang belum pernah dibuka dimuat lewat API dengan kerangka per bagian; yang sudah dibuka tampil dari simpanan
   lalu diperbarui diam-diam.
2. **Warna mengikuti konsol admin, bukan hijau prototipe.** Tata letak, isi, dan kata mengikuti prototipe; warna memakai
   token `--cs-*` (biru Werkudara sebagai satu warna utama, status ok/warn/bad bersama), sesuai `docs/standar-admin.md` §8.
   Tanda "Rapat" dan "Tim · rapat" memakai teal, bukan ungu. Font ikut admin. Kepala halaman memakai `PageHeader` konsol.
3. **HP:** bilah atas dan laci menu milik `ConsoleShell` tetap ada; bilah tab bawah prototipe (Antrean, Rekap, Catat,
   Lainnya) ditambahkan di ≤ 760 px. Judul halaman tetap tampil di HP (prototipe menyembunyikannya).
4. **Pesan aksi:** `Flash` dari `hr-admin` tidak dipakai karena tidak punya tombol; pesan dibuat sendiri (dengan
   **Urungkan**). Berhasil hilang sendiri 6 detik; galat tetap sampai ditutup. Membuka sheet/dialog menutup pesan yang tersisa.
   Kalimat pesan tidak menyebut "notifikasi terkirim" (push baru ada di F4).
5. **Rekap:** pilihan bulan = 12 bulan terakhir; tanggal Dari/Sampai bebas (paling lama 366 hari, dicek sebelum bertanya ke
   server), bulan menjadi "Rentang lain" bila bukan satu bulan penuh. Status menambah "Batal". Setiap perubahan filter
   bertanya ke server (pencarian menunggu 300 ms). **Rentang lebih dari satu bulan: "Per orang" hanya menampilkan jumlah
   klaim, tanpa titik jatah, dengan satu kalimat keterangan.** Titik jatah hanya digambar untuk jatah 1–8.
   Detail menampilkan 100 baris sekaligus ("Tampilkan … baris lagi"); di HP berupa daftar. Filter tidak ditulis ke alamat.
6. **Catat manual:** "Lainnya" pada Ruangan membuka kolom nama ruangan (opsional). Jumlah 1–50 (prototipe 30), mengikuti
   skema F0. Baris jatah di bawah nama membaca `…/people?bulan=` dan `…/settings`; penolakan server (409) tampil di sheet.
7. **Salin rincian** yang ditolak browser menampilkan "Gagal salin" (prototipe diam).
8. Berkas di luar daftar rencana: `CoffeeAdminApp.tsx`, `format.ts`, `sample.ts` (server tiruan di memori untuk pratinjau
   dan tes; nama contoh ditulis "Rina Putri (contoh)" supaya nama depan tetap terbaca di baris pendek),
   `src/app/dev-preview/coffee/nyata/admin/AdminPreview.tsx`. `?layar=rekap|pengaturan`, `?alamat=1` (alamat ikut berubah
   seperti halaman asli), dan `?tunggu=1` ada di halaman pratinjau.

**Untuk F2 (karyawan):**
- `Layer.tsx` (dialog/sheet: Escape, jebakan fokus, tombol kembali HP) dan `usePhone()` bisa diimpor dari
  `src/components/coffee-admin/Layer.tsx`; kelasnya ada di `coffee-admin.module.css` dan membaca token `--cs-*`, jadi di
  aplikasi karyawan perlu CSS sendiri.
- Pola klien: `api.ts` mendefinisikan tipe klien dan dioper sebagai prop; `sample.ts` menjadi contoh server tiruan untuk
  `/dev-preview/coffee/nyata` dan tes.
- Tes yang berkedip: `src/components/main-wam/ui/modal.dom.test.tsx` gagal 2 tes sekali saat seluruh suite dijalankan
  (lulus sendiri dan lulus pada putaran kedua); bukan bagian Coffee.

---

## Catatan perbaikan audit F0 (25 Nov 2026)

Temuan `docs/coffee/AUDIT-F0.md` diperbaiki (kolom Status di sana). Yang berubah untuk fase berikutnya:

- **Migrasi `202612010001_coffee.sql` diubah di tempat** (belum pernah dijalankan): fungsi baru
  `coffee_cancel_manual(p_order, p_actor, p_actor_label)`, indeks `coffee_orders_processed`, aturan kunci, dan Tambah lagi
  yang menyalin data putaran pertama. **Tetap belum pernah dijalankan di Postgres.**
- **Batalkan catatan** (keputusan PM): `POST /api/admin/coffee/orders/[id]/batalkan` (`coffeeAdminApi.cancelManual`), hanya
  catatan manual berstatus selesai, pengelola mana pun, tanpa batas waktu. Baris menjadi `batal`; `processed_*` = yang
  membatalkan. Rekap menulis "Dibatalkan" (`rowStatus`), batal oleh pemesan tetap "Batal". `RecapRow.orderId` baru.
- **Kode galat baru** (`store.ts`): `COFFEE_KEY_REUSED` 409, `COFFEE_PARENT_CLOSED` 409 ("Pesanan awal sudah tidak bisa
  ditambah. Buat pesanan baru."), `COFFEE_NOT_MANUAL` 409, `COFFEE_ALREADY_CANCELLED` 409.
- **Kunci (F2, F3):** satu kunci uuid baru tiap kali sheet/kiriman dibuka; jangan dipakai ulang setelah batal atau ditolak
  (409). `manualSchema.key` wajib. `crypto.randomUUID` tidak ada di http biasa: pakai `newKey()` di `ManualSheet.tsx`.
- **Tambah lagi (F3):** server memakai PIC, ruangan, tamu, jumlah tamu putaran pertama; kiriman klien untuk itu tidak
  dibaca. Induk harus pesanan rapat hari ini (WIB), bukan ditolak/batal. Tablet yang dibiarkan semalam akan mendapat 409.
- **Batas kirim:** per orang (`limitCoffeePerson` di `src/lib/server/coffee/rate.ts`): klaim 20, rapat 60 per 10 menit;
  per alamat 300. Pesan 429 per orang: "Terlalu sering dalam waktu singkat. Tunggu sepuluh menit lalu coba lagi."
- Selesai/Tolak pada pesanan yang dibatalkan pemesannya: 409 "Pengajuan ini sudah dibatalkan pemesannya. Antrean diperbarui."

---

## Catatan perbaikan audit F1 (26 Nov 2026)

Temuan `docs/coffee/AUDIT-F1.md` diperbaiki (kolom Status di sana). Yang perlu diketahui F2/F3 bila memakai ulang bagian ini:

- `Layer.tsx` kini menggambar lewat **portal** di akhir `<body>` dengan tema konsol admin, mengunci gulir, memberi `inert`
  pada selain lapisan teratas, dan boleh bertumpuk (pertanyaan di atas sheet). Aplikasi karyawan yang ingin memakainya
  perlu tema sendiri di pembungkus portal.
- `useQueue`: aksi yang sedang dikirim menahan pembacaan; setelah aksi terakhir dijawab antrean dibaca sekali. Selesai
  pada kartu lain diabaikan 700 ms setelah satu kartu keluar. `undoing` = himpunan id.
- Catat manual bertanya sebelum membuang isian; Pengaturan bertanya sebelum jatah menjadi 0 dan dibaca ulang tiap dibuka.
- Semua target ≥ 44 px di semua lebar; antrean satu kolom sampai 1100 px; pesan di HP tampil di bawah bilah atas.


---

## Catatan pelaksanaan F2 (26 Nov 2026)

F2 (aplikasi karyawan, `/coffee`) selesai di cabang `feat/werkudara-coffee`. Tidak ada berkas F0/F1 yang diubah
(`src/lib/server/coffee/**`, API, `src/components/coffee-admin/**`, prototipe). Skill desain yang dipakai:
`ui-ux-pro-max` (aksesibilitas, sentuhan, navigasi) dan `design-taste-frontend` (selera; alur pembuat situsnya tidak
berlaku untuk aplikasi di dalam produk).

**Belum diuji (apa adanya):**
- Halaman asli `/coffee` dan `/coffee/pesanan` **belum pernah dibuka setelah masuk**: agen tidak memakai sandi. Yang
  dicek di browser: tanpa sesi keduanya mengalihkan ke `/coffee/masuk?next=…`, `/coffee/password-baru` juga,
  `/api/coffee/state` 401, manifest dan `sw.js` terlayani. Keadaan "belum dibuka" (sebelum migrasi) hanya dilihat lewat
  `/dev-preview/coffee/nyata?layar=tunggu` (komponen yang sama, `CoffeeWaiting`), bukan lewat jalur server sesungguhnya.
- Masuk sungguhan, lupa password sungguhan, dan password baru sungguhan tidak dikirim di browser (hanya di tes dengan
  server tiruan). Keluar hanya di tes.
- Pasang ke layar utama (Android/iPhone), layar pembuka, service worker aktif, halaman offline, dan Lighthouse
  "installable" **tidak diuji** di perangkat. Yang diuji: isi manifest, ikon ada, isi `sw.js` (tes `layout.test.ts`).
- "Ajukan → muncul di antrean pengelola" dan "selesai/tolak di admin → berubah di HP" diuji dengan server tiruan
  (kotak Pratinjau memainkan pengelola), bukan dua sesi asli. Butuh migrasi.
- Lebar yang dicek di browser: 375×812, 320×640, dan desktop 1024. 390×844 (angka rencana) tidak dicek terpisah.
- Tiga perubahan kecil dibuat setelah cek browser dan hanya dicek dengan tes: fokus pindah ke layar setelah Ajukan,
  kotak Pratinjau berada di bawah lembar, judul pesan "Tidak bisa dibatalkan". Mode gelap tidak ada (hanya terang).

**Selisih dari rencana:**
1. **Tanpa `(app)/layout.tsx`.** Kerangka (bilah atas, tab bawah) ada di `CoffeeFrame`, dipakai oleh `CoffeeApp`, supaya
   pratinjau dan tes menjalankan kerangka yang sama. Pindah tab = `history.pushState` (alamat berubah, tidak ada
   permintaan). `CoffeeApp` punya `routing="history" | "memory"` seperti admin F1.
2. **`next` setelah masuk** dicek dengan `safeCoffeeNext` (baru, `src/lib/coffee/setup.ts`), bukan `safePraWamNext`:
   yang terakhir menolak semua alamat di luar WAM/Booking/Wellbeing, jadi `/coffee/pesanan` tidak akan pernah kembali.
3. **Manifest:** `id`, `start_url`, `scope` = `/coffee` (tanpa garis miring di akhir). Dengan `/coffee/`, halaman pertama
   `/coffee` berada di luar scope dan HP menampilkan bilah browser. Service worker tetap `scope: /coffee/` (batas
   bawaan letak berkasnya), jadi `/coffee` sendiri tidak dikendalikan SW: halaman offline buatan sendiri hanya muncul di
   `/coffee/pesanan` dan halaman masuk. Push (F4) tidak terpengaruh. Bila ingin `/coffee` ikut, perlu header
   `Service-Worker-Allowed` di `next.config.ts`. (WG People memakai `/people/` untuk ketiganya; mungkin terkena hal yang
   sama, belum dicek.)
4. **Atur sekali** diingat lewat cookie `coffee_atur` (dibaca server, jadi menu tidak berkedip dulu), tampil sekali
   setelah masuk pertama, dan bisa dibuka lagi dari lembar Akun ("Pasang di layar utama"). "Pasang sekarang" memakai
   tawaran pasang milik browser bila ada; bila tidak ada, menjelaskan lewat menu ⋮. Langkah notifikasi sebelum F4
   berjudul **"Notifikasi menyusul"** dengan satu tombol "Mulai pesan" (tidak ada tombol izin yang tidak berbuat apa-apa).
5. **Layar masuk:** "welcome" hanya tampil pada HP yang belum pernah masuk (`localStorage coffee:kenal`) dan tanpa `next`.
   "Lupa password?" membuka halaman permintaan reset yang sesungguhnya (prototipe hanya menampilkan satu kalimat).
6. **Lembar Akun** (ketuk huruf di kanan atas; tidak ada di prototipe): nama, kelompok, sisa jatah, tautan Mode GA dan
   Pengelola (hanya yang berhak), Pasang di layar utama, Keluar.
7. **Pesanan saya:** semua pengajuan yang masih diproses tampil penuh, masing-masing dengan Batalkan (prototipe hanya
   yang terbaru; aturan membolehkan lebih dari satu menunggu). Di "Sebelumnya" yang selesai ditulis "Selesai"
   (kartu penuh tetap "Siap diambil") dan barisnya memuat tanggal. Klaim catat manual tampil "Klaim dicatat pengelola"
   tanpa garis waktu. Minuman "Lainnya" (catat manual) tanpa foto.
8. **Kata:** kotak "Siapa yang memproses?" diakhiri "Status di sini berubah sendiri." (prototipe: "lalu kamu diberi
   notifikasi"; push baru ada di F4). Tombol lembar: "Ajukan klaim" (prototipe), bukan "Ajukan".
9. **Pesan di atas** (toast): status berubah, pengajuan terkirim, batal, galat. Galat menetap sampai ditutup; yang lain
   6 detik. Galat saat mengajukan tampil di dalam lembar (lembar tetap terbuka, kunci yang sama dipakai untuk coba lagi).
10. **Layer sendiri** (`src/components/coffee/Layer.tsx`): salinan aturan `coffee-admin/Layer.tsx` dengan tampilan
    aplikasi karyawan; yang admin tidak disentuh. `newKey()` juga disalin ke `src/components/coffee/api.ts`.
11. **Layar lebar:** kolom 480 px di tengah (bukan bingkai HP seperti prototipe).
12. Berkas di luar daftar rencana: `Layer.tsx`, `useCoffee.ts`, `pwa.ts`, `format.ts`, `sample.ts`, `layout.test.ts`,
    `src/lib/coffee/setup.ts` + tes, `src/app/dev-preview/coffee/nyata/EmployeePreview.tsx`. `tabs.test.ts` sudah ada
    sejak F0. Logo kartu admin (`EventList.tsx`, catatan F0 nomor 1) tidak diganti.

**Untuk F3 (tablet GA + buku menu tamu):**
- Tautan "Mode GA" sudah ada di lembar Akun (`state.ga` → `coffeePath.ga`); pesan `?pesan=ga` sudah tampil di Menu.
  `/coffee/ga` berada di bawah `src/app/coffee/layout.tsx`: tema (`css.theme`: token krem/hijau, font), manifest dan
  viewport HP ikut berlaku; tablet perlu `viewport` sendiri dan boleh menimpa `min-height`/latar.
- Pola yang bisa dipakai ulang dari `src/components/coffee/`: `Layer` (lembar/dialog; `kind="dialog"`, `alert`),
  `Toast`, `useCoffee` (polling 15 detik hanya selama ada yang diproses, penjaga baca vs aksi, kirim ganda), `newKey()`
  dan `CoffeeApiError`/`request` di `api.ts`, `DrinkPhoto`, `PantryMap`, `sample.ts` sebagai contoh server tiruan.
- Tes penjaga alamat tetap berlaku; `src/components/coffee/layout.test.ts` menolak `min-height` di bawah 44 px di
  `coffee.module.css` (tablet GA butuh 48 px di CSS-nya sendiri).
- SW: lihat selisih 3. F4 menambah `push`/`notificationclick` di `public/coffee/sw.js` dan mengisi prop `notify` milik
  `CoffeeApp`/`SetupSteps` (`NotifySetup.allow()` → "granted" | "denied" | "unsupported"); pendaftaran SW ada di `pwa.ts`.

---

## Catatan pelaksanaan F3 (26 Nov 2026)

F3 (tablet GA `/coffee/ga` + buku menu tamu) selesai di cabang `feat/werkudara-coffee`. Tidak ada berkas server, API,
migrasi, admin F1, atau prototipe yang diubah. Skill desain yang dipakai: `ui-ux-pro-max` (sentuhan, aksesibilitas, tata
letak) dan `design-taste-frontend` (selera; alur pembuat situsnya tidak berlaku untuk aplikasi di dalam produk).

**Berkas F2 yang disentuh (dua, tidak mengubah perilaku yang ada):**
- `src/components/coffee/Layer.tsx`: dua prop opsional `rootClass` dan `panelClass` (tampilan lain untuk lapisan yang sama).
- `src/components/coffee/api.ts`: `request` diekspor (dipakai `ga/api.ts`).

**Belum diuji (apa adanya):**
- Halaman asli `/coffee/ga` **belum pernah dibuka setelah masuk** (agen tidak memakai sandi). Yang dicek: tanpa sesi
  dialihkan ke `/coffee/masuk?next=%2Fcoffee%2Fga`, `GET /api/coffee/ga/state` dan `POST …/meetings` menjawab 401.
  "Karyawan biasa → `/coffee?pesan=ga`" dan "non-GA → 403" hanya lewat tes F0 (`session.test.ts`, `coffee-guards.test.ts`).
- "Muncul di antrean pengelola sebagai satu kartu rapat", `T-xxxx-2`, dan rekap atas nama PIC/orangnya **tidak diuji
  dengan server asli** (butuh migrasi). Tablet diuji dengan server tiruan (`ga/sample.ts`), yang membaca kiriman dengan
  `meetingSchema` asli dan meniru aturan Tambah lagi (induk ditolak/batal/bukan hari ini → 409).
- **Tablet sungguhan tidak dipakai.** Lebar 1280×800, 1024×768, 768×1024 dicek dengan ukuran layar tiruan di panel
  browser (klik tetikus): keyboard layar, sentuhan asli, putar layar, dan area aman tidak diuji.
- Di browser: 409 "Pesanan awal sudah tidak bisa ditambah" dan "Pesan pengganti" tidak diulang (hanya di tes). Urutan
  Tab papan ketik dan kontras tidak diukur (warna sama dengan F2).
- Satu tes F2 (`CoffeeApp.dom.test.tsx`, "Sisa 2 dari 4") gagal sekali saat seluruh suite dijalankan, lulus 3× sendiri
  dan lulus pada putaran penuh kedua. Bukan bagian F3; dicatat untuk audit F2.

**Selisih dari rencana dan prototipe:**
1. **Nama tamu per minuman tidak sampai ke server.** Buku menu menanyakan "Nama Anda (opsional)", tetapi
   `meetingSchema` dan `coffee_order_items` tidak punya tempat untuk nama tamu (hanya `personId` untuk tim). Nama itu
   tampil di panel Pesanan ("Tamu · Budi") dan di layar Terkirim **hanya di tablet itu, selama halaman belum dimuat
   ulang**; pengelola dan rekap tidak melihatnya. Perlu keputusan PM: tambah kolom (mis. `guest_name`) di skema, fungsi
   SQL, dan kartu antrean sebelum migrasi dijalankan, atau hapus isian itu.
2. **Anggota tim dipilih dari daftar karyawan**, bukan diketik bebas seperti prototipe: server meminta `personId`.
   PIC ditawarkan pertama; mengetik hanya menyaring. Fokus awal dialog di judul, bukan di kolom cari (keyboard layar
   akan menutupi nama).
3. **Tambah lagi** mengirim `parentId` = kiriman pertama rapat itu. Bila kiriman pertama ditolak/batal (server menolak
   menambah), tombolnya menjadi **"Pesan pengganti" / "Buat pesanan pengganti"**: pesanan baru dengan ruangan dan PIC
   yang sama. Bila server tetap menjawab 409 (tablet basi), minuman tidak hilang: pesannya tampil, dan Kirim berikutnya
   mengirimnya sebagai pesanan baru dengan kunci baru. Kalimat di kotak ditolak: "Kabari PIC, lalu buat pesanan pengganti."
4. **Kunci kiriman:** satu kunci per kiriman; dipakai lagi untuk coba ulang setelah jaringan gagal, diganti setelah
   berhasil atau 409.
5. **Buku menu menggantikan seluruh layar GA** (bukan lapisan di atasnya): selama tamu memegang tablet, halaman tidak
   memuat bilah GA, daftar karyawan, pesanan lain, pesan status, atau kotak pratinjau. Komponennya tidak menerima API
   maupun daftar orang. Keluar lewat konfirmasi tanpa PIN (kalimat "PIN" prototipe dihapus). Tambahan kecil: **Hapus**
   pada tiap pilihan, dan berhenti menerima pilihan saat pesanan mencapai 40 baris.
6. **Ketuk ganda:** layar yang baru muncul mengabaikan ketukan selama 450 ms (`useSettled`): ubin minuman setelah
   kembali dari buku menu, tombol layar Terkirim, tiap halaman buku menu, "Ya, mode GA". Kirim yang sedang dikirim
   tidak dikirim lagi (tombol `aria-disabled`, penjaga di `useGa`).
7. **Tidak membuang isian tanpa bertanya:** kembali ke Beranda dengan minuman yang belum dikirim → "Buang pesanan yang
   belum dikirim?"; menutup/memuat ulang halaman → pertanyaan bawaan browser.
8. **Baca ulang:** tiap 15 detik hanya selama ada pesanan diproses dan tablet terlihat, saat kembali ke depan, dan
   **setiap kembali ke Beranda** (tablet lain bisa mengirim pesanan). Pesan status memakai `Toast` F2 (di atas, bukan di
   bawah seperti prototipe); ditolak menetap sampai ditutup; mengetuknya membuka status hanya bila tidak sedang menulis pesanan.
9. Tab Kopi/Non-kopi dan "Ketuk untuk" adalah tombol `aria-pressed` (bukan `tablist`/`radiogroup` tanpa panah, temuan
   F1-16). Semua target ≥ 48 px (`ga/layout.test.ts`); ketuk ganda tidak memperbesar atau menyeleksi teks.
10. **Tegak (≤ 900 px):** satu kolom, layar bergulir; panel Pesanan menempel di bawah (paling tinggi 46% layar); tombol
    Pesanan baru berdampingan dan menempel di bawah; tab buku menu di atas, tombol pilih menempel di bawah.
11. Bilah atas punya tautan **"Aplikasi saya"** (`coffeePath.home`). Tablet tidak punya tombol Keluar sendiri.
12. Berkas di luar daftar rencana: `ga/{api,useGa,model,parts,sample,testing}.ts(x)`, `ga/layout.test.ts`,
    `src/app/coffee/ga/loading.tsx`, `src/app/dev-preview/coffee/nyata/ga/GaPreview.tsx`. Pratinjau:
    `/dev-preview/coffee/nyata/ga` (`?kosong=1`, `?lambat=1`).

**Untuk F4 (web push):**
- `/coffee/ga` berada di dalam scope SW `/coffee/`, tetapi **`GaApp` belum mendaftarkan service worker** (pendaftaran
  ada di `pwa.ts`, hanya dipanggil `CoffeeApp`). Tablet perlu mendaftar sendiri sebelum bisa berlangganan.
- Tempat tombol "Nyalakan notifikasi": bilah atas (`css.topbar`, di samping "Aplikasi saya"). Jangan digambar saat
  buku menu terbuka (cabang `guest` di `GaApp.tsx` sengaja hanya berisi `GuestBook`).
- Tablet hanya punya satu alamat (`coffeePath.ga`), tanpa alamat per pesanan: klik notifikasi membuka Beranda GA.
  Bila ingin langsung ke status, tambahkan parameter (mis. `?pesanan=<id>`) dan buka `Sent` dari `GaApp`.
- Teks yang sekarang tampil sebagai pesan saat status berubah ada di `onDecided` (`GaApp.tsx`); `useGa.refresh()`
  bisa dipanggil dari pesan SW supaya layar berubah tanpa menunggu 15 detik.
- Notifikasi sistem bisa muncul di atas buku menu saat tamu memegang tablet (isi: nama panggilan, minuman, ruangan).
  Putuskan apakah itu boleh; aplikasi tidak bisa menahannya dari dalam halaman.
- `GaState`/`MeetingOrder` hanya membawa label pengirim (`sentBy`), bukan id-nya; penerima push ditentukan di server
  (`created_by` + PIC).

---

## Catatan perbaikan audit F2 (26 Nov 2026)

Temuan `docs/coffee/AUDIT-F2.md` diperbaiki (kolom Status di sana). Yang berubah untuk fase berikutnya:

- **Kunci klaim pindah ke `useCoffee`.** `DrinkSheet` mengirim pilihan saja (`ClaimChoice`); `useCoffee.claim` menambah
  kunci dan menyimpannya per minuman + opsi sampai server memberi jawaban pasti. `ClaimBody` (bentuk API) tidak berubah.
- **Batas waktu:** `request` (dipakai juga `ga/api.ts`) kini membatalkan permintaan setelah 15 detik dan melempar
  `CoffeeApiError` dengan `timeout: true` tanpa `status`. `answerUnknown(error)` = tidak ada jawaban pasti (jaringan,
  batas waktu, 5xx); `within(promise, ms)` melepas janji apa pun. `useGa` belum memakainya (lihat audit F3).
- **`useCoffee` mengembalikan** `stale`/`retry`/`retrying` (banner tidak tersambung), `gone` (401), `today` (hari WIB).
- **Keluar:** `api.signOut()` melempar bila server tidak bisa diberi tahu, dan memakai `location.replace`. Siapa pun yang
  berpindah halaman sambil sebuah `Layer` terbuka di HP harus memanggil `leavePage()` (dari `Layer.tsx`) lebih dulu,
  kalau tidak `history.back()` milik lapisan membatalkan perpindahan itu.
- **Service worker:** scope `/coffee` (`coffeePath.scope`; `coffeePath.oldScope` hanya untuk melepas registrasi lama),
  header `Service-Worker-Allowed` di `next.config.ts`, handler `fetch` hanya menjawab `/coffee` dan `/coffee/…`.
- **Keputusan yang diambil agen, perlu disetujui pemilik:** "Siap diambil · Sekarang" hanya untuk klaim yang diputuskan
  pada hari yang sama (WIB).

**Untuk F4 (web push):**
- Pendaftaran: `const registration = await coffeeWorker()` (`src/components/coffee/pwa.ts`; satu pendaftaran per muat
  halaman, tidak pernah melempar, `null` bila browser tanpa service worker), lalu `registration.pushManager.subscribe(…)`.
  Aplikasi karyawan sudah memanggilnya lewat `usePwa(live)`; **`GaApp` belum**: panggil `coffeeWorker()` di sana.
  `navigator.serviceWorker.ready` kini juga selesai di `/coffee` karena halaman itu sudah di dalam scope.
- Di `public/coffee/sw.js`: tambah `push` dan `notificationclick` di bawah handler yang ada; pakai
  `clients.matchAll({ type: "window", includeUncontrolled: true })` dan hanya buka alamat yang diawali `/coffee` atau
  `/admin/coffee`. Pertahankan pemeriksaan `pathname` di handler `fetch` dan tes `layout.test.ts` yang menjalankan berkas itu.
- Langganan milik orang sebelumnya: saat keluar (`CoffeeApp.signOut`, sebelum `api.signOut()`), hapus langganan
  perangkat itu di server, supaya orang berikutnya di HP yang sama tidak menerima notifikasi orang lain.
- Pesan dari SW ke halaman (klik notifikasi, push diterima) bisa memanggil `refresh()` milik `useCoffee` supaya layar
  berubah tanpa menunggu 15 detik; `onDecided` sudah menggabungkan beberapa keputusan dalam satu pesan.
- Panel browser agen menolak pendaftaran SW apa pun ("unknown error occurred when fetching the script"), jadi SW dan
  push hanya bisa diuji di Chrome sungguhan atau di perangkat.

---

## Catatan: nama tamu per minuman (26 Nov 2026, keputusan PM: dipertahankan)

Menutup selisih 1 di catatan F3. Nama yang diketik tamu di buku menu ("Nama Anda", opsional) kini sampai ke server:

- **Data:** kolom `coffee_order_items.guest_name` (`text`, null atau 1–40 huruf) dan `coffee_submit_meeting` mengisinya
  untuk baris `tamu` saja (dirapikan; lebih dari 40 huruf → `COFFEE_INVALID`). **Migrasi `202612010001_coffee.sql`
  diubah di tempat dan tetap belum pernah dijalankan.** `fake-db.ts` meniru aturan yang sama.
- **API:** `meetingSchema.items[].guestName` (opsional, dirapikan, paling panjang `GUEST_NAME_MAX` = 40; dibuang untuk
  baris tim). `QueueItem.guestName` ikut di jawaban antrean, `gaState`, dan kiriman.
- **Tablet GA:** `toBody` mengirim nama itu; layar Terkirim membaca nama dari jawaban server (bukan lagi simpanan
  tablet), jadi tetap ada setelah muat ulang dan di tablet lain.
- **Pengelola:** kartu antrean menulis "Tamu · Budi"; Salin rincian menulis `(Tamu · Budi)` di baris minumannya.
- **Rekap:** kolom baru **"Nama tamu"** setelah "Tamu/instansi" di tabel, CSV, dan .xlsx (Detail kini 23 kolom); kata
  pencarian juga mencocokkan nama itu. Baris dengan jumlah lebih dari satu membawa nama yang sama di tiap cangkirnya.
- Catat manual tidak punya isian nama tamu. Notifikasi (F4) **tidak** memuat nama tamu: `notify.ts` tidak diubah, dan
  aturan F4 "isi notifikasi hanya nama panggilan, minuman, ruangan" tetap berlaku.

---

## Catatan perbaikan audit F3 (26 Nov 2026)

Temuan `docs/coffee/AUDIT-F3.md` diperbaiki (kolom Status di sana). Pertanyaan pemilik no. 7 dijawab PM: **PIN GA**.

- **Migrasi `202612010001_coffee.sql` diubah di tempat lagi** (tetap belum pernah dijalankan): `coffee_settings`
  mendapat `ga_pin_hash`, `ga_pin_at`, `ga_pin_label`; `coffee_orders` mendapat `request_print`;
  `coffee_submit_meeting` menolak kunci yang sama dengan sidik isi berbeda (`COFFEE_KEY_REUSED`).
- **PIN GA:** `src/lib/server/coffee/pin.ts` (`saveGaPin`, `checkGaPin`, `gaPinSet`; hash scrypt bergaram + rahasia
  `RATE_LIMIT_SECRET`, jadi **mengganti rahasia itu membuat PIN harus diatur ulang**). API: `PUT
  /api/admin/coffee/settings/pin` (`coffeeAdminApi.gaPin`), `POST /api/coffee/ga/pin` (`coffeeApi.gaPin`; 10 coba per
  10 menit per akun, 60 per alamat; 409 bila belum diatur, 422 "PIN tidak cocok. Coba lagi." untuk semua yang salah).
  `GaState.pin` dan `SettingsData.gaPin` hanya ya/tidak. Lupa PIN = pengelola menyimpan PIN baru.
- **Mode tamu bertahan:** `ga/hold.ts` (cookie `coffee_ga_tamu`, path `/`, 12 jam; `sessionStorage` `coffee:ga:tamu`).
  `src/app/coffee/ga/page.tsx` membaca cookie itu dan tidak memanggil `gaState`. `GaApp` menerima `held`.
  Cookie berlaku per host: di komputer pengembang, mode tamu yang ditinggal terbuka di pratinjau ikut mengunci
  `/coffee/ga` di port lain sampai petugas keluar dari buku atau cookie dihapus.
- **`useGa(api, initial, onDecided, paused)`:** `paused` = mode tamu (tidak membaca apa pun, membaca sekali saat
  selesai); mengembalikan `stale`/`retry`/`retrying`; `send` mengembalikan `unsure` bila tidak ada jawaban.
- **Kunci kiriman** kini dipegang `GaApp` bersama sidik isinya (`printOf`); `MeetingOrder.manual` baru.
- **Riwayat:** `GaApp` memasang satu entri (`history.state.gaTrap`) dan menangani `popstate`. Layar baru di tablet
  cukup menambah cabang di `onBack` (GaApp), tanpa `pushState` sendiri.

**Untuk F4 (web push), tambahan:**
- Jangan daftarkan push atau gambar tombol "Nyalakan notifikasi" saat `guest` benar (cabang `guest` di `GaApp` hanya
  berisi `GuestBook`). Pesan dari SW ke halaman tidak boleh memanggil `refresh()` selama mode tamu: `useGa` sudah
  mengabaikannya (`paused`), pertahankan itu.
- Notifikasi sistem di atas buku menu tetap bisa muncul (isi: nama panggilan, minuman, ruangan). Putuskan apakah tablet
  GA menerima push sama sekali; bila ya, pertimbangkan tidak menampilkannya saat cookie `coffee_ga_tamu` ada (SW bisa
  bertanya ke klien yang terbuka lewat `postMessage`).
- Klik notifikasi di tablet membuka `/coffee/ga`; bila tablet sedang di mode tamu, halaman itu tetap membuka buku menu.
- Pengelola yang menyimpan PIN GA tidak perlu notifikasi; tidak ada peristiwa push baru dari perbaikan ini.


---

## Catatan pelaksanaan F4 (26 Nov 2026)

F4 (web push ujung ke ujung) selesai di cabang `feat/werkudara-coffee`. Skill desain yang dipakai: `ui-ux-pro-max`
(sentuhan, aksesibilitas) dan `design-taste-frontend` (selera, kata; alur pembuat situsnya tidak berlaku di dalam produk).

**Siapa diberi tahu apa** (`src/lib/server/coffee/push.ts`, kata di `src/lib/coffee/notify.ts`):

| Peristiwa | Penerima | Isi (judul · isi) | Ketuk membuka |
| --- | --- | --- | --- |
| Klaim baru | semua pemegang grant `coffee` yang masih karyawan aktif, kecuali pengirimnya | "Klaim baru" · "Rina · Café Latte" | `/admin/coffee` |
| Pesanan rapat baru (tiap kiriman, termasuk Tambah lagi) | sama | "Pesanan rapat baru" · "Vasuki Room · 4 minuman" | `/admin/coffee` |
| Selesai (klaim) | pemesan | "Silakan ambil di mesin" · "Café Latte kamu selesai diproses oleh Dewi." | `/coffee/pesanan` |
| Ditolak (klaim) | pemesan | "Pengajuan tidak bisa diproses" · minuman + "catatan dari Dewi" (isi catatan tidak ikut) | `/coffee/pesanan` |
| Selesai / Ditolak (rapat) | GA pengirim (`created_by`) dan PIC | "Pesanan rapat siap diambil" / "…tidak bisa diproses" · ruangan, jumlah, "oleh Dewi" | pengirim: `/coffee/ga?pesanan=<id>`; PIC: `/coffee` |
| Catat manual, Batalkan catatan, Urungkan, batal oleh pemesan | tidak ada | | |

Orang yang menekan tombolnya sendiri tidak diberi tahu (pengelola yang memproses klaimnya sendiri). Tidak ada nama tamu,
instansi, jabatan, BU, atau isi catatan tolak di notifikasi; tidak ada kata "HR".

**Cara kerja:**
- Kirim lewat `after()` setelah jawaban API pergi; tanpa kunci VAPID tidak ada yang dijadwalkan; semua galat ditelan dan
  dicatat (`console.error("coffee push: …")`, hanya kode status, tanpa alamat perangkat). Pesanan dibaca ulang saat
  kirim: yang sudah diurungkan tidak dikabarkan.
- **Sekali per kabar:** tabel `coffee_push_sent` (pesanan, peristiwa, cap). Kunci yang dikirim ulang = satu "Klaim baru".
  Keputusan setelah Urungkan punya cap baru (`processed_at`) dan dikabarkan lagi.
- Perangkat mati (404/410) dihapus saat dikirimi; gagal lain dicatat dan perangkatnya dibiarkan.
- **Perangkat milik orang yang sedang masuk:** menyimpan alamat yang sama memindahkannya ke orang itu (juga otomatis saat
  halaman dibuka dan perangkat sudah berlangganan); Keluar di aplikasi karyawan dan di admin menghapusnya dulu (server
  lalu browser), paling lama beberapa detik, tidak pernah menggagalkan Keluar. Satu browser = satu alamat untuk ketiga tempat.
- **Service worker** (`public/coffee/sw.js`): jendela yang sudah terbuka tidak dimuat ulang, hanya difokuskan dan diberi
  pesan (`coffee:open`); tanpa jendela, dibuka alamat aplikasi/admin saja. Setiap push juga memberi tahu jendela terbuka
  (`coffee:push`) supaya layar membaca ulang saat itu juga. Polling tetap jalan seperti sebelumnya.
- **Tablet di mode tamu (keputusan agen, perlu disetujui pemilik):** selama cookie `coffee_ga_tamu` ada, notifikasi apa
  pun di perangkat itu ditampilkan sebagai satu baris netral tanpa suara: "Werkudara Coffee · Ada pembaruan pesanan."
  (tanpa nama, minuman, ruangan, nomor). Browser yang service worker-nya tidak bisa membaca cookie (`cookieStore` tidak
  ada) dianggap mode tamu selama ada halaman `/coffee/ga` terbuka. Mengetuknya tidak mengeluarkan tablet dari buku menu:
  jendela hanya difokuskan, `GaApp` tidak mendengar pesan SW di mode tamu, dan halaman yang dimuat ulang tetap buku menu.
  Di mode tamu `GaApp` tidak menggambar tombol, tidak bertanya ke server, dan tidak mendaftarkan apa pun.
- **Keadaan yang ditangani** (kata di `pushNote`): browser tidak mendukung; izin diblokir (cara mengizinkan lagi);
  iPhone/iPad belum dipasang ("dipasang dulu ke layar utama"); server tanpa kunci atau sebelum migrasi (karyawan:
  "belum tersedia"; pengelola: nama kunci `WAM_VAPID_*` atau nama migrasi); super admin (409 "Masuk dengan akun
  karyawan untuk menerima notifikasi."). Semua tetap jalan dengan polling.
- **Tempat tombol:** Atur sekali langkah "Izinkan notifikasi" dan kotak "Notifikasi" di lembar Akun (Nyalakan, Kirim
  notifikasi tes, Matikan); bilah atas tablet GA di samping "Aplikasi saya"; baris di atas Antrean pengelola.

**Selisih dari rencana:**
1. Tabel kedua `coffee_push_sent` di migrasi yang sama (rencana hanya menyebut tabel langganan), untuk "sekali per kabar".
2. `sendCoffeePush` hanya ke karyawan aktif; `notifyNewOrder(orderId, except)` dan `notifyDecided(orderId, actor)`
   menerima id (pesanan dibaca ulang), bukan objek pesanan. Tidak ada `scheduleCoffeePush` terpisah.
3. Alamat push harus `https://` (`coffeePushSchema`); batas 30 simpan dan 10 tes per orang per 10 menit.
4. Tombol pengelola ada di atas Antrean (`PushBar`), bukan di `CoffeeAdminNav`; `CoffeeAdminNav` hanya mendapat `onLeave`
   (Keluar). `src/components/console/**` tidak disentuh.
5. PIC rapat dibawa ke `/coffee` (bukan `/coffee/pesanan`, yang hanya memuat klaim). Tablet punya `?pesanan=<id>`
   (`coffeePath.gaOrder`) yang membuka layar status pesanan itu; alamatnya dirapikan setelah dibuka.
6. Prop `notify` milik `CoffeeApp` diganti `push` (API + perangkat); `SetupSteps` tetap menerima `notify` (+ `state`).
   Tes kirim hanya ada di aplikasi karyawan (tablet dan admin tidak punya tombol tes).
7. Batal oleh pemesan tidak mengirim apa pun: notifikasi "Klaim baru" yang sudah muncul di perangkat pengelola tetap ada
   sampai ditutup. Urungkan juga tidak menarik notifikasi "Silakan ambil" yang sudah terkirim (sesuai rencana).
8. Berkas di luar daftar rencana: `usePush.ts` berisi juga `useWorkerNews`/`dropPush`; `pushSample.ts` (perangkat tiruan
   untuk pratinjau dan tes); `coffee-admin/PushBar.tsx`. Pratinjau: `?notif=on|denied|ios-install|unsupported|not-ready|account`
   di ketiga halaman `/dev-preview/coffee/nyata…`.

**Belum diuji (apa adanya):**
- **Tidak ada push sungguhan yang pernah terkirim.** Tidak ada perangkat, layanan push, izin browser, atau service worker
  asli yang dipakai. Yang diuji hanya dengan tes: isi dan penerima notifikasi, sekali per kabar, hapus perangkat mati,
  penjaga route, handler `push`/`notificationclick` (berkas `sw.js` dijalankan dengan `self` tiruan), dan keadaan UI
  dengan perangkat tiruan. `cookieStore` di service worker (mode tamu) belum pernah dijalankan di browser asli.
- **Migrasi `202612010002_coffee_push.sql` belum pernah dijalankan** di Postgres mana pun.
- **Cek tampilan di browser gagal dilakukan.** Server dev di port 3210 jalan (dicek dengan curl: `sw.js` 200 dengan
  `Service-Worker-Allowed`, keempat route push 401 tanpa sesi, `/coffee/ga?pesanan=x` mengalihkan ke halaman masuk,
  pratinjau 200), tetapi di panel browser agen setiap halaman pratinjau memuat ulang terus-menerus (±6 kali per detik),
  **juga halaman prototipe lama `/dev-preview/coffee` yang tidak disentuh F4**, sehingga tidak ada yang bisa diklik atau
  dibaca. Tidak ada berkas sumber yang berubah selama itu; penyebabnya belum diketahui (dugaan: panel dalam keadaan
  tersembunyi). Tab ditutup dan server dihentikan. Jadi tata letak tombol baru (lembar Akun 375/320 px, bilah atas
  tablet 768 px, baris di atas Antrean) **belum pernah dilihat**; perlu dicek PM atau audit F4.
- Halaman asli setelah masuk (karyawan, GA, admin) tidak dibuka (agen tidak memakai sandi).

**Daftar cek pemilik: uji push di perangkat asli** (setelah kedua migrasi dijalankan dan `WAM_VAPID_PUBLIC_KEY`,
`WAM_VAPID_PRIVATE_KEY` terisi di server; harus lewat https, bukan `localhost` di HP):
1. **Desktop (Chrome/Edge), pengelola:** masuk admin dengan **akun karyawan** yang punya grant Coffee → `/admin/coffee` →
   "Nyalakan notifikasi" → Izinkan. Dari HP lain ajukan klaim: notifikasi "Klaim baru" muncul ≤ beberapa detik, juga
   saat tab admin ditutup (browser tetap jalan). Ketuk: tab admin yang terbuka maju tanpa memuat ulang, atau terbuka baru.
   Masuk sebagai super admin: tampil keterangan "Masuk dengan akun karyawan…", tanpa galat.
2. **Android Chrome, karyawan:** buka `/coffee`, pasang, "Izinkan notifikasi". Lembar Akun → "Kirim notifikasi tes"
   muncul. Ajukan klaim, kunci layar; pengelola tekan Selesai → "Silakan ambil di mesin · … selesai diproses oleh
   <nama>". Ketuk: aplikasi terbuka di Pesanan saya. Ulangi dengan Tolak: catatan tolak **tidak** tampil di notifikasi.
3. **iPhone (iOS 16.4+):** di Safari langkah notifikasi menjelaskan "dipasang dulu ke layar utama" (tanpa tombol
   izin). Pasang → buka dari ikon → Akun → "Nyalakan notifikasi" → ulangi langkah 2.
4. **Tablet GA:** `/coffee/ga` → "Nyalakan notifikasi" di bilah atas. Kirim pesanan rapat, pengelola tekan Selesai →
   notifikasi "Pesanan rapat siap diambil"; ketuk membuka status pesanan itu. HP PIC (bila menyalakan notifikasi) ikut
   diberi tahu dan terbuka di `/coffee`.
5. **Mode tamu:** "Serahkan ke tamu", lalu pengelola memproses pesanan lain → di tablet hanya muncul "Werkudara Coffee ·
   Ada pembaruan pesanan." tanpa suara; ketuk → tetap di buku menu. Keluar dari buku (PIN) → notifikasi berikutnya
   kembali lengkap.
6. **Ganti orang:** Keluar di HP itu, masuk sebagai orang lain: notifikasi orang pertama tidak lagi masuk ke HP itu.
7. **Blokir:** tolak izin di browser → aplikasi menjelaskan cara mengizinkan lagi dan status tetap berubah sendiri.
8. **Tanpa kunci** (server uji tanpa `WAM_VAPID_*`): ajukan dan proses tetap berhasil; di admin tampil keterangan kunci.

**Untuk F5 (audit):** cek tata letak yang belum dilihat (di atas); putuskan tiga hal di "Keputusan terbuka" laporan F4
(mode tamu netral, PIC ke `/coffee`, batal tidak menarik notifikasi); pertimbangkan pembersihan `coffee_push_sent`
(tumbuh satu baris per kabar; ikut terhapus bila pesanannya dihapus).

## Catatan pelaksanaan F5: perbaikan audit akhir (26 Nov 2026)

Temuan dan statusnya per butir ada di kolom Status `AUDIT-F5.md`. Skill desain yang dipakai untuk butir tampilan
(F5-09, F5-10, tombol Matikan di tablet): `ui-ux-pro-max` (sentuhan ≥ 44/48 px, fokus, aksi keluar paling akhir).

**Yang berubah dari catatan F4 di atas:**
- **Mode tamu:** mengetuk notifikasi apa pun tidak pernah membuka jendela dan tidak memberi tahu halaman mana pun;
  jendela tablet hanya difokuskan (`public/coffee/sw.js`).
- **Alamat push** harus milik layanan push yang dikenal (`isPushServiceUrl` di `src/lib/coffee/schemas.ts`), bukan
  sekadar `https://`; diperiksa lagi sebelum setiap pengiriman. Paling banyak 5 perangkat per orang
  (`COFFEE_PUSH_DEVICES`, kolom `updated_at`). Penerima dibaca per orang, bukan satu `select … limit(2000)`.
- **Tes kirim** tidak lagi menjawab 502: jawabannya sama apa pun kata layanan push.
- **`coffee_push_sent`** dibersihkan sendiri (baris > 30 hari) setiap ada kabar baru.
- **PIN GA:** tabel baru `coffee_pin_tries` di migrasi 1 (diedit di tempat, belum pernah dijalankan); aturan di
  kepala `src/lib/server/coffee/pin.ts`. Route memanggil `pinGate` lalu `tryGaPin`, bukan `checkGaPin` + batas 10.
- **Langganan tertinggal:** `forgetLocalPush` (halaman masuk, 401), hapus di server saat ganti/reset password
  (`dropCoffeeDevices` di `src/lib/server/pra-wam/session.ts`), "Matikan" di tablet.
- **`saveGrant`:** kode 23514 diperiksa sebelum `missing()`, dari aplikasi terbaru.
- Migrasi 2 diedit di tempat: kolom `updated_at`, indeks `(employee_id, updated_at desc)`, indeks `sent_at`.

**Belum diuji (apa adanya):** kedua migrasi tetap belum pernah dijalankan; tidak ada push, service worker, atau
perangkat sungguhan; F5-03 belum dicek di Chrome asli. Di browser (pratinjau, port 3210) hanya dilihat: baris
notifikasi admin 375 px (tawaran 57 px, fokus pindah), bilah atas tablet 1024 px (Matikan 74×48, fokus pindah),
lembar Akun 375×812 (Notifikasi di atas Keluar). Keadaan "aktif" baris admin di HP setelah penyesuaian terakhir
belum terlihat: halaman pratinjau admin berhenti di "Memuat halaman" pada dua percobaan terakhir (penyebab tidak dicari).
`public/dev/coffee` dibiarkan (lihat F5-13).
