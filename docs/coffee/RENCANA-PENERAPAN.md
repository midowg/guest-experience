# Rencana penerapan Werkudara Coffee (25 Nov 2026)

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
