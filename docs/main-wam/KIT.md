# Kit Main WAM: komponen, tema, dan kerangka

Acuan untuk setiap agen yang membangun layar Main WAM. Layar **disusun dari kit ini**; jangan menulis
warna hex, ukuran huruf, bayangan, atau komponen tiruan sendiri. Butuh yang belum ada: tambahkan ke kit
(pemilik: agen UI kit) atau catat di laporan.

- Galeri hidup: `/dev-preview/main-wam/kit` (semua komponen dan statusnya; `?mode=dark`, `?aksen=%23B45309`).
- Kerangka: `/dev-preview/main-wam/kit/shell?layar=beranda|agenda|momen|saya|detail|tugas|kamera`.
- Sumber desain: `DESIGN_SYSTEM.md`, `prototipe/wam.css`, `PANDUAN_PROTO.md` §6 dan §9–§10.7, `komponen.html`.

| Folder | Isi | Impor |
| --- | --- | --- |
| `src/components/main-wam/theme/` | token CSS, `MainWamTheme`, font | `@/components/main-wam/theme` |
| `src/components/main-wam/ui/` | komponen dasar | `@/components/main-wam/ui` |
| `src/components/main-wam/shell/` | kerangka (bilah atas/bawah), tata letak layar | `@/components/main-wam/shell` |

## 1. Aturan pakai (baca dulu)

1. **Server atau klien.** Komponen tanpa status (Button, Card, ListRow, Pill, Banner, …) tidak memakai
   `"use client"`, jadi halaman server boleh memakainya langsung. Yang berstatus (Segmented, Switch,
   SwitchRow, Sheet, ConfirmDialog, Toast, shell) adalah komponen klien.
2. **Ikon.** `lucide-react`. Dari komponen server kirim **elemen**: `icon={<House />}` (fungsi tidak
   bisa menyeberang ke komponen klien). Dari komponen klien boleh `icon={House}`. Kit mengatur ukuran
   dan `aria-hidden`.
3. **Handler** (`onClick`, `onChange`) hanya dari komponen klien. Dari server pakai `href`.
4. **Alamat** selalu dari `mainWamPath` / `mainWamApi` (`src/lib/routes.ts`). `href` di kit memakai
   `next/link` (tanpa muat ulang penuh, di-prefetch); `external` untuk alamat luar (tab baru).
5. **Judul halaman (h1) ada di bilah atas shell.** Isi layar mulai dari `h2` (`SectionHeader`,
   `<Text as="h2">`).
6. **Satu tombol primary per layar.** Aksi lain secondary, tonal, atau text. Label 1–2 kata, tidak
   boleh terpotong; tombol nonaktif selalu dengan alasan di dekatnya.
7. **Aksi berisiko** (hapus, sembunyikan, tutup Silent Meeting, kirim kabar ke semua) lewat
   `ConfirmDialog`; label aksi menyebut hasilnya ("Hapus foto", bukan "Ya").
8. **Status selalu kata** (+ ikon atau titik), tidak pernah warna saja: `StatusPill`, `Pill`.
9. **Warna kategori** (momen, emisi, awarding) hanya di kartu modulnya, maksimal satu per layar. Ikon di
   daftar dan tile tetap netral. Warna semantik hanya untuk status.
10. **Teks**: bahasa Indonesia, sentence case, tanpa emoji, tanpa tanda seru. Jam `08.00–12.00`,
    tanggal `Sel, 5 Jan`, angka `1.240`, `13,6`, `93%`. Nama orang = nama panggilan.
11. **Data contoh** di galeri/tes: nama samaran (Rani, Sari, Dimas, Contoh Satu). Foto = `PhotoFill`
    (gradasi netral), bukan foto orang.
12. **Aksesibilitas**: target sentuh ≥ 44 (sudah di kit), kontras ≥ 4,5 (dicek otomatis di galeri, terang
    dan gelap), fokus terlihat, `prefers-reduced-motion` dihormati, setiap gestur geser punya tombol
    (sheet: ✕; tumpukan Momen: ketuk sisi foto / tombol).

## 2. Tema dan token

`<MainWamTheme theme={…} mode="light">` sudah dipasang di `src/app/wam/acara/layout.tsx` (fondasi). Semua
token adalah CSS custom property di bawah satu akar `[data-main-wam]` (kelas `.root` di
`theme/theme.module.css`), jadi tidak bocor ke Pra WAM.

Nama token = nama prototipe dengan awalan `--mw-`:

| Prototipe (`wam.css`) | Kit | Contoh |
| --- | --- | --- |
| `--color-X` | `--mw-X` | `--mw-text-2`, `--mw-surface`, `--mw-primary-container`, `--mw-on-error-container` |
| `--color-event-accent*` | `--mw-accent*` | `--mw-accent`, `--mw-on-accent`, `--mw-on-accent-2`, `--mw-accent-container` |
| `--text-X` + `--ls-X` | `--mw-type-X` + `--mw-ls-X` | `font: var(--mw-type-body-small)` |
| `--space-N`, `--radius-N`, `--elev-N` | `--mw-space-N`, `--mw-radius-N`, `--mw-elev-N` | `gap: var(--mw-space-12)` |
| `--motion-*`, `--ease-*` | `--mw-motion-*`, `--mw-ease-*` | `transition: background-color var(--mw-motion-press)` |
| (baru) | `--mw-media-on`, `--mw-media-on-2`, `--mw-media-ink`, `--mw-ondark-fill` | teks/isian di atas layar gelap Momen dan kamera |
| (baru) | `--mw-safe-top/bottom/left/right`, `--mw-nav-h`, `--mw-touch`, `--mw-column` | area aman iPhone, bilah bawah 64, sentuh 44, kolom 480 |

CSS module fitur cukup memakai `var(--mw-…)`; tidak perlu impor apa pun.

**Slot tema (KV)**, diisi admin lewat pembaca tema fondasi (`mainWamThemeInput`, tipe `MainWamThemeInput`):

| Slot | Token | Bawaan |
| --- | --- | --- |
| `accent`, `onAccent`, `onAccent2`, `accentContainer`, `onAccentContainer` | `--mw-accent*` | `#1E3A5F` … |
| `primary`, `primaryStrong`, `onPrimary`, `primaryContainer`, `onPrimaryContainer` | `--mw-primary*` | `#2F6FEB`, `#1D4ED8` … |
| `displayFont` | `--mw-display-font` (dipakai Display, Title, Headline) | Plus Jakarta Sans |
| `images.splash`, `.homeHeader`, `.pattern`, `.mosaic` | `--mw-image-splash`, `--mw-image-home-header`, `--mw-image-pattern`, `--mw-image-mosaic` (`url("…")` atau `none`) | `none` |
| `images.icon` | tidak ke CSS (manifest) | – |

Pengamanan (`theme/tokens.ts`, `resolveTheme`): warna hanya `#RGB`/`#RRGGBB`; setiap pasangan teks harus
≥ 4,5:1 (dan `primary` ≥ 3:1 di putih untuk ikon/fokus), kalau tidak **seluruh kelompok** kembali ke
bawaan; gambar hanya `https:` atau path situs ini tanpa tanda kutip/kurung; font hanya kunci di
`DISPLAY_FONTS`. Nilai yang ditolak dicatat di konsol (pengembangan) dan di `resolveTheme(…).warnings`
(bisa dipakai pratinjau Admin WAM). Memberi `accent` saja cukup: teksnya dipilih otomatis (putih atau
gelap).

Font judul baru: muat lewat `next/font` di `theme/font.ts`, tambah kuncinya ke `DISPLAY_FONTS`, dan
petakan di `DISPLAY_FONT_VARS` (`MainWamTheme.tsx`). Tanpa itu, kunci ditolak.

**Mode gelap**: token disiapkan (`mode="dark"` / `"system"`, DESIGN_SYSTEM §1.6) dan lolos cek kontras,
tetapi layar belum dirancang untuknya. Aplikasi memakai `mode="light"`. Layar Momen bukan "mode gelap":
shell memberi `data-mw-tone="dark"` (latar `--mw-viewer`) dan komponen memakai varian `tone="dark"` /
`variant="ondark"`.

**Font**: Plus Jakarta Sans lewat `next/font/google` (`theme/font.ts`), variable font satu berkas,
di-host situs ini, fallback disesuaikan (tanpa loncatan teks). Tes yang merender `MainWamTheme` perlu
`vi.mock("./font", () => ({ mainWamFontVars: "" }))` (path relatif ke berkas tes).

## 3. Kerangka (shell)

`MainWamShell` dipasang sekali di `src/app/wam/acara/(app)/layout.tsx`. Yang digambar dibaca dari alamat
(`mainWamScreen`, `src/lib/main-wam/screen.ts`), bukan dari halaman:

| Tingkat | Bilah atas | Bilah bawah |
| --- | --- | --- |
| `akar` Beranda | sapaan, nama (h1), "Hari ke-2 dari 4", lonceng (satu-satunya) | ya |
| `akar` lain | judul besar (h1); bilah ringkas muncul setelah judul tergulir | ya |
| `detail` | ‹ Kembali + judul (h1), lengket, garis saat tergulir | ya, tab induk menyala |
| `tugas` | ✕ Tutup + judul | tidak (pakai `ActionBar`) |
| `tugas` + gelap (kamera) | tidak ada (kamera punya bilahnya) | tidak |

Momen (`dark`) membuat latar, bilah atas, dan bilah bawah gelap. ‹/✕ kembali ke layar sebelumnya bila
ada riwayat di aplikasi, kalau tidak ke `back.href` (dibuka dari notifikasi atau QR). Toast
(`ToastProvider`) ada di shell, di atas bilah bawah. Area aman iPhone (atas, bawah, kiri, kanan) sudah
diberi padding. Di layar ≥ 600 px aplikasi tetap satu kolom selebar ponsel (480) di tengah; sheet dari
kanan mulai 1024 px. Kembali ke aplikasi setelah > 60 detik di latar: `router.refresh()` (angka lonceng).

Yang bisa dilakukan layar:

```tsx
import { ScreenContent, ScreenSection, Stack, ShellActions, ShellChrome } from "@/components/main-wam/shell";

<ScreenContent>                      {/* margin 16, antar-bagian 24 (.wam-content); flush = tanpa margin samping */}
  <ShellActions>                     {/* 0–2 tombol di ujung bilah atas (muncul setelah layar dimuat) */}
    <IconButton icon={<Share />} label="Bagikan" onClick={…} />
  </ShellActions>
  <ScreenSection>…</ScreenSection>   {/* kepala + isi, jarak 8 */}
  <Stack>…</Stack>                   {/* kartu berjarak 12 */}
</ScreenContent>
<ShellChrome hideTopBar />           {/* layar dengan bilah sendiri (pemindai QR); CSS saja, tanpa kedip */}
<ShellChrome hideNav />              {/* layar tugas yang alamatnya belum ditandai tugas */}
```

Lencana tab: `<MainWamShell badges={{ momen: 12, saya: "dot" }}>` (fondasi). `BottomNav` bisa dirender
sendiri untuk pratinjau (`current`, `tone`, `badges`).

## 4. Komponen

Semua dari `@/components/main-wam/ui`. Prop `href`/`onClick`/`external` (ActionProps) membuat komponen
menjadi tautan atau tombol; tanpa keduanya ia hanya tampilan.

### Tombol

| Komponen | Prop utama | Kapan |
| --- | --- | --- |
| `Button` | `variant`: `primary` · `secondary` · `tonal` · `text` · `danger` · `danger-outline` · `danger-text` · `ondark`; `size` `l` (48) / `m` (40, sentuh 44); `block`; `icon`; `loading` + `loadingLabel`; `disabled`; `type`; `href` | aksi. `loading`: spinner, klik diabaikan, fokus tetap (aria-busy), submit tidak terkirim dua kali |
| `IconButton` | `icon`, **`label`** (wajib, nama yang dibacakan), `variant` `standard` · `tonal` · `filled` · `onmedia` · `ondark`, `size` 44/56, `pressed` (+ `liked` = hati merah), `badge` (angka atau `"dot"`) | aksi tanpa teks. Sertakan jumlah di `label` ("Notifikasi, 3 belum dibaca") |
| `TextLink` | `href`/`onClick`, `chevron` | "Lihat semua", "Semua" |

```tsx
<Button block icon={<QrCode />}>Absen</Button>
<Button variant="tonal" size="m" href={mainWamPath.moments()}>Lihat</Button>
<Button loading={saving} loadingLabel="Menyimpan…" type="submit">Simpan</Button>
```

### Kartu dan daftar

| Komponen | Prop utama | Kapan |
| --- | --- | --- |
| `Card` | `variant` `outline` · `tonal` · `momen` · `emisi` · `awarding` · `wellbeing` · `role` (garis primary, kartu panitia/BOD) · `accent` (warna acara); `flush`; `as`; `href`/`onClick` (seluruh kartu bisa diketuk: jangan taruh kontrol lain di dalamnya) | blok isi |
| `CardHead` | `icon`, `iconTone`, `title`, `sub`, `end` | baris kepala kartu (kartu kontekstual Beranda) |
| `IconBox` | `icon`, `tone`, `size` 40/48/64/96, `round`, `smallIcon` | ikon dalam kotak lembut |
| `SectionHeader` | `title`, `sub`, `action {label, href|onClick}`, `level` | judul bagian + "Lihat semua" |
| `List` | `inset` 68 (bawaan, sesudah ikon) · 16 · 0, `plain` (tanpa kartu, di sheet), `bleed`, `label` | wadah baris berpemisah |
| `ListRow` | `icon` atau `leading` (Avatar), `title` (≤ 2 baris), `sub`, `value`, `trailing` (Pill, Badge, Switch), `chevron` (bawaan saat bisa diketuk), `disabled` | baris menu, info, pengaturan |
| `StatRow` | `icon`, `title`, `sub`, `value`, `unit`, `status` (Pill), `href`/`onClick` | Ringkasan BOD (maks 4). Tanpa href = statis (Jejak karbon), nilai tetap sejajar |
| `ShortcutGrid` + `ShortcutTile` | `icon`, `label`, `badge`, `badgeLabel` | Kelola panitia 2 × 2 (Rundown live, Absen, Pengumuman, Moderasi) |
| `SessionList` + `SessionRow` | `start`, `end`, `title`, `place`, `status` `upcoming` · `live` · `done` · `cancelled`, `checkedIn`, `extra` (Chip Absen, StatusPill changed), `href` | Agenda. `live` menyala + "Sedang berlangsung"; `cancelled` dicoret, "Dibatalkan", tidak bisa dibuka |
| `StackPreview` | `photos` (≤ 3, `{src}`), `title`, `sub`, `cta`, `href` | kartu Momen di Beranda (satu tautan) |
| `PhotoFill` | `photo {src, alt}`, `tone` 1–6 | foto atau placeholder netral, mengisi kotaknya |
| `Divider` | `inset` 16/68 | garis 1 px |

```tsx
<List>
  <ListRow icon={<BedDouble />} title="Kelompok & kamar" sub="Kamar 208 · bersama Sari" value="Lt. 2" href={mainWamPath.groupRoom} />
</List>
<Card flush>
  <SessionList label="Sesi hari ini">
    <SessionRow start="08.00" end="12.00" title="Pemaparan departemen" place="Aula Utama" status="live" href={mainWamPath.session(id)} />
  </SessionList>
</Card>
```

### Chip, saringan, pilihan

| Komponen | Prop utama | Kapan |
| --- | --- | --- |
| `Chip` | `icon`, `tone` `default`/`dark`, `href` | informasi ("Kelompok 4", "Aula Utama"), bukan kontrol |
| `FilterChip` | `selected` (aria-pressed, centang); atau `menu` + `name` + `expanded` + `active`; `tone="dark"` | saring daftar; `menu` = "Semua sesi ▾" yang membuka sheet pilihan |
| `ChipRow` | `scroll` (geser ke tepi layar) atau bungkus; `label` | deretan chip |
| `TagChip` + `TagChipRow` | `label` ("Untuk:"), `value`, `onClick`/`href`, `onClear` + `clearLabel`, `expanded` | tag di kamera gelap ("Sesi: Team building ✕") |
| `Segmented` | `options [{value, label, icon?, disabled?}]`, `value`, `onChange`, **`label`**, `tone` | 2–4 tampilan satu daftar (Semua / Kelompokku). Radio group: panah memilih, Home/End |
| `Switch` | `checked`, `onChange`, `label` (atau `labelledBy`) | nyala/mati langsung berlaku |
| `SwitchRow` | `title`, `sub`, `checked`, `onChange`, `inList` | sakelar berteks ("Kabari peserta"); seluruh baris bisa diketuk |

```tsx
"use client";
<Segmented label="Tampilkan foto" tone="dark" value={view} onChange={setView}
  options={[{ value: "semua", label: "Semua" }, { value: "kelompok", label: "Kelompokku" }]} />
<FilterChip menu tone="dark" name="Sesi" expanded={picking} active={sesi !== null} onClick={() => setPicking(true)}>
  {sesi?.title ?? "Semua sesi"}
</FilterChip>
```

### Isian dan hari

| Komponen | Prop utama | Kapan |
| --- | --- | --- |
| `TextField` | `label` (wajib, di atas), `optional`, `help`, `error` (kata; memberi `aria-invalid`), `icon`, `suffix` ("menit"), `search`, `multiline`, `showCount` + `maxLength`/`countMax`, plus prop `<input>`/`<textarea>` biasa | form pendek (pengumuman, masukan, laporan). Isian tidak hilang saat galat |
| `SelectField` | `label`, `value`, `placeholder`, `onClick` (buka sheet) atau `href`, `expanded`, `error`, `help` | pilihan yang dibuka di sheet ("isian pilih") |
| `DayTabs` | `days [{key, day, date, today?, href?}]`, `current`, `onSelect` | 4 hari acara di Agenda/Rundown. Dengan `href` = tautan (`mainWamPath.agenda(n)`, aria-current), tanpa = tombol (aria-pressed) |

### Status dan data

| Komponen | Prop utama | Kapan |
| --- | --- | --- |
| `StatusPill` | `status`: `live` · `next` · `notStarted` · `done` · `notOpen` · `open` · `present` · `sent` · `approved` · `changed` · `pending` · `hidden` · `cancelled`; `children` mengganti kata ("Hadir 07.52") | status baku, kata dan warnanya tetap |
| `Pill` | `tone` `neutral` · `active` · `success` · `warning` · `error` · `momen` · `emisi` · `awarding` · `onmedia` · `primary`; `icon`; `dot`; `pulse` | status lain, 1–2 kata |
| `Badge` | `count` (> 99 jadi "99+") atau `dot`; `label` bila berdiri sendiri | angka di ikon/tab/tile |
| `Avatar` | `name` (inisial), `photo`, `size` 24/32/40/48/64, `label` bila berdiri sendiri | orang; dekoratif bila namanya tertulis di sebelah |
| `ProgressBar` | `value`, `max`, **`label`**, `valueText` ("842 / 1.200 foto"), `icon`, `tone`, `thin` | kemajuan (Mozaik, kehadiran); `role="progressbar"` |
| `Text` | `variant` (15 gaya DS §2), `color` (`1` `2` `3` `primary` `success` `warning` `error` `on-accent` `on-accent-2` `media` `media-2` `inverse-2`), `as`, `clamp` (2 baris), `ellipsis` | teks lepas dengan token |

### Umpan balik dan lapisan

| Komponen | Prop utama | Kapan |
| --- | --- | --- |
| `Banner` | `tone` `info` · `offline` · `warning` · `error` · `success`; `title`; isi; `icon`; `action {label, onClick}`; `href` (seluruh banner tautan, ›) | info di atas isi layar, mendorong isi (tidak menutupi): offline, pengumuman penting, jam berubah, gagal + "Coba lagi" |
| `EmptyState` | `icon`, `title`, isi, `action` (Button), `size` `m`/`s` (di kartu), `tone` `dark`, `headingLevel` | kosong, tanpa koneksi, izin ditolak |
| `Skeleton` + `SkeletonGroup` | `shape` `line` · `title` · `circle` · `box` · `photo` · `card` · `block`; `width`, `height`; grup memberi `aria-busy` + label | `loading.tsx` per bagian (bentuknya mengikuti layar) |
| `Spinner` | `size` 20/24, `label` | tunggu > 300 ms yang bukan satu bagian |
| `Sheet` | `open`, `onClose`, `title`, `subtitle`, `footer`, `history` (bawaan true), `locked`, `initialFocus`, `flush` | detail atau form pendek di atas layar |
| `useHashSheet(id)` | `{ open, show, close }` | sheet beralamat `#id` (tautan bisa membukanya); pakai dengan `<Sheet history={false}>` |
| `ConfirmDialog` | `open`, `onCancel`, `onConfirm`, `title` (pertanyaan), `body` (akibat), `confirmLabel` (hasil), `tone` `primary`/`danger` (+ ikon), `busy` + `busyLabel` | konfirmasi aksi berisiko |
| `useToast()` | `show({ text, sub, tone, action {label, onAction}, duration, timer, thumb, onTimeout })` → id; `dismiss(id)` | konfirmasi singkat. 4 dtk, 6 dtk dengan aksi. Galat yang perlu tindakan = Banner |
| `ToastPreview` | tampilan statis toast | galeri |
| `TopBar` | `variant` `large` · `back` · `home`, `tone`, `actions`, `sticky`, `scrolled` | dipakai shell; layar biasanya tidak memakainya langsung |
| `ActionBar` | `note`, `row` | aksi utama layar tugas, lengket di bawah, dengan area aman |

Perilaku Sheet dan ConfirmDialog (`ui/useModal.ts`): `<dialog>` native + `showModal()` (halaman di
bawahnya inert); fokus pindah ke judul (ConfirmDialog: ke **Batal**) dan kembali ke pembuka saat tutup;
Tab/Shift+Tab berputar di dalam; Esc, ✕, ketuk area redup, dan **tombol Back HP** menutup (sheet memegang
satu entri riwayat selama terbuka; ditutup cara lain, entri itu diambil kembali). Halaman di bawah tidak
ikut tergulir. `locked`/`busy`: tetap terbuka. Sheet ditarik ke bawah lewat pegangan juga menutup (HP);
✕ adalah alternatif tombolnya. Sheet selalu terang, juga di atas layar Momen.

Toast: dibacakan sopan (`role="status"`), galat langsung (`role="alert"`). Waktu berhenti selama jari,
penunjuk, atau fokus ada di toast (WCAG 2.2.1), lalu melanjutkan sisanya. Pola "Terkirim · Batalkan":

```tsx
const toast = useToast();
toast.show({
  text: "Terkirim", timer: true, duration: 5000, thumb: <PhotoFill photo={{ src: preview }} />,
  action: { label: "Batalkan", onAction: () => cancelUpload(id) },   // dalam 5 dtk: hapus
  onTimeout: () => markKept(id),                                     // waktu habis tanpa Batalkan
});
```

Sheet pilih sesi (contoh di galeri):

```tsx
<Sheet open={picking} onClose={() => setPicking(false)} title="Pilih sesi" flush>
  <List plain inset={16} label="Sesi">
    {sessions.map(s => <ListRow key={s.id} title={s.title} sub={s.time} chevron={false}
      trailing={s.id === chosen ? <Check /> : undefined} aria-current={s.id === chosen ? "true" : undefined}
      onClick={() => { choose(s.id); setPicking(false); }} />)}
  </List>
</Sheet>
```

## 5. Tes

- Pola `*.dom.test.tsx` (vitest + testing-library, jsdom). Contoh: `ui/kit.dom.test.tsx`,
  `shell/shell.dom.test.tsx`, `theme/MainWamTheme.dom.test.tsx`; token: `theme/tokens.test.ts`.
- jsdom tidak punya dialog modal: stub `HTMLDialogElement.prototype.showModal/close` (lihat `kit.dom.test.tsx`).
- Mock `next/link` menjadi `<a>` dan `next/navigation` (`usePathname`, `useRouter`) bila merender shell.
- Toast dengan `vi.useFakeTimers()`.
- Cek tampilan: Playwright Python headless 390 × 844 @2x di halaman dev-preview.

## 6. Yang belum ada di kit

Tersedia di prototipe tetapi belum dijadikan komponen (bangun di fiturmu dari token, atau minta ke agen
UI kit): NowCard (susun dari Card + StatusPill + Button), CheckboxRow, RadioRow/PickRow (sementara: List +
ListRow + `aria-current`, lihat contoh sheet pilih sesi), PhotoTile/galeri, StackViewer + kartu tumpukan, CameraScreen + ShutterButton,
QRScannerOverlay, Mozaik, Ticket, Stepper, KeyValue, NotificationRow, EmissionCard, LeaderboardRow,
AwardCard, RundownRow, tanda "diubah oleh".
