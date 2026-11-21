# Kit Main WAM: komponen, tema, dan kerangka

Acuan untuk setiap agen yang membangun layar Main WAM. Layar **disusun dari kit ini**; jangan menulis
warna hex, ukuran huruf, bayangan, atau komponen tiruan sendiri. Butuh yang belum ada: tambahkan ke kit
(pemilik: agen UI kit) atau catat di laporan.

- Galeri hidup: `/dev-preview/wam2026/kit` (semua komponen dan statusnya; `?mode=dark`, `?aksen=%23B45309`).
- Kerangka: `/dev-preview/wam2026/kit/shell?layar=beranda|agenda|momen|saya|detail|tugas|kamera`.
- Sumber desain (gelombang 1, 22 Nov): **prototipe final** `events/2027-01-werkudara-wam/aplikasi/prototipe/prototipe-wam.html` (kelas `.ph`) dan potretnya. `DESIGN_SYSTEM.md`/`wam.css` adalah prototipe lama; nilai token kit sudah diganti ke yang final, nama tokennya tetap.
- Bahasa visual final dirangkum di bagian 2.1 (emas, Barlow Condensed kapital, siku + motif, bilah bawah datar).

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
   boleh terpotong; tombol nonaktif selalu dengan alasan di dekatnya. Kalau ruangnya kurang (dua tombol
   sejajar di kartu sempit), label membungkus jadi dua baris dan tombol meninggi; satu kata yang tetap
   tidak muat dipatah di tengah kata (terlihat, tidak disembunyikan). Di layar < 360 px lebih baik
   barisnya dibungkus (`flex-wrap: wrap`) daripada memaksa dua tombol berdampingan.
7. **Aksi berisiko** (hapus, sembunyikan, tutup Silent Meeting, kirim kabar ke semua) lewat
   `ConfirmDialog`; label aksi menyebut hasilnya ("Hapus foto", bukan "Ya").
8. **Status selalu kata** (+ ikon atau titik), tidak pernah warna saja: `StatusPill`, `Pill`.
9. **Warna kategori** (momen, emisi, awarding) hanya di kartu modulnya, maksimal satu per layar. Ikon di
   daftar dan tile tetap netral. Warna semantik hanya untuk status.
   Emisi = hijau (`--mw-emisi*`, `--mw-emisi-accent` untuk angka sorotan, `--mw-chart-emisi-1…3` tiga nuansa batang);
   kartu Jejak karbon di Beranda = list tile (ikon daun 44 tonal hijau, judul, satu baris, batang 6 px, angka di kanan).
   Jarak antar target sentuh >= 8 px dihitung dengan area ::after: baris chip yang membungkus memakai row-gap 16;
   ikon aksi bilah atas, tombol aksi Toast, dan tombol zoom mozaik berjarak 8.
10. **Teks**: bahasa Indonesia, sentence case, tanpa emoji, tanpa tanda seru. Jam `08.00–12.00`,
    tanggal `Sel, 5 Jan`, angka `1.240`, `13,6`, `93%`. Nama orang = nama panggilan.
11. **Data contoh** di galeri/tes: nama samaran (Rani, Sari, Dimas, Contoh Satu). Foto = `PhotoFill`
    (gradasi netral), bukan foto orang.
12. **Aksesibilitas**: target sentuh ≥ 44 (sudah di kit), kontras ≥ 4,5 (dicek otomatis di galeri, terang
    dan gelap), fokus terlihat, `prefers-reduced-motion` dihormati, setiap gestur geser punya tombol
    (sheet: ✕; tumpukan Momen: pengecualian yang diputuskan pemilik, 21 Nov 2026: foto hanya digeser, tanpa tombol berikutnya/sebelumnya, tanpa penghitung; panah keyboard tetap menggeser).
13. **Tanpa warna literal.** Warna hanya lewat token `--mw-*` (ukuran, bayangan, font juga). `components/main-wam/colors.test.ts`
    menggagalkan hex, `rgb()`/`hsl()`, nama warna, dan `color-mix()` dengan `white`/`black` di `src/components/main-wam` dan
    `src/app/wam/acara`; pengecualian hanya yang tercatat di daftarnya (kanvas Mozaik, perata JPEG, latar `::backdrop`).
    Butuh warna baru: tambah token terang **dan** gelap di `theme.module.css` (blok Gelap dan blok Sistem harus sama), kontras ≥ 4,5.
14. **Cincin fokus**: tema memberi `:focus-visible` 2 px `--mw-focus` (offset 2) ke semua kontrol. Jangan
    menambah cincin kedua. Isian: kotaknya yang bercincin (inset 2), kontrol di dalamnya tidak. Tujuan
    fokus lewat skrip yang bukan kontrol (judul sheet, `<main>`) diberi `tabIndex={-1}` dan tanpa cincin
    (aturan tema untuk `h1`–`h6`/`main[tabindex="-1"]`). Fokus lewat skrip setelah ketukan pakai
    `quietFocus(el)` (`ui/useModal.ts`): tanpa cincin sampai ada tombol keyboard ditekan.
15. **Teks tidak pernah dipotong diam-diam (QA UI/UX, 320 sampai 195 px).** Judul dan keterangan baris
    (`ListRow`, `StatRow`, `SessionRow`, kartu Sekarang, baris kamar) membungkus dengan `overflow-wrap: anywhere`;
    tidak ada `line-clamp` atau `text-overflow: ellipsis` pada isi yang hanya ada di situ. Pengecualian yang
    disengaja: judul notifikasi (2 baris, isi penuh ada di sheet saat diketuk), judul bilah atas, kicker/nama sapaan.
    Baris yang ujungnya tombol (`ListRow trailing={<Button>}`) menurunkan tombol ke baris bawah di bawah 300 px.
    `DayTabs` membungkus jadi 2 x 2 bila empat hari tidak muat (tiap tab minimal 44).
16. **Nama aksesibel** sebuah tautan/kartu memakai kata yang tampil (jangan `aria-label` yang menyusun ulang);
    keterangan tambahan lewat `spoken` atau `<SrOnly>` (kartu Sekarang, baris profil di Saya).

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
| (baru) | `--mw-media-on`, `--mw-media-on-2`, `--mw-media-scrim` | teks di atas foto (pil nama, tombol ⋯, pil reaksi) dan di atas gambar langsung kamera/pemindai: putih tetap di kedua mode |
| (baru) | `--mw-photo-bg`, `--mw-ph-1…6`, `--mw-ph-glow`, `--mw-ph-shade` | latar foto yang belum termuat dan placeholder netral (punya nilai gelap sendiri) |
| (baru) | `--mw-safe-top/bottom/left/right`, `--mw-nav-h`, `--mw-touch`, `--mw-column` | area aman iPhone, bilah bawah 68, sentuh 44, kolom 480 |

CSS module fitur cukup memakai `var(--mw-…)`; tidak perlu impor apa pun.

**Slot tema (KV)**, diisi admin lewat pembaca tema fondasi (`mainWamThemeInput`, tipe `MainWamThemeInput`):

| Slot | Token | Bawaan |
| --- | --- | --- |
| `accent`, `onAccent`, `onAccent2`, `accentContainer`, `onAccentContainer` | `--mw-accent*` | `#1E3A5F` … |
| `primary`, `primaryStrong`, `onPrimary`, `primaryContainer`, `onPrimaryContainer` | `--mw-primary*` | `#2F6FEB`, `#1D4ED8` … |
| `displayFont` | `--mw-display-font` (dipakai Display, Title, Headline, Stat) | Barlow Condensed |
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

**Mode terang/gelap/Sistem**: aplikasi mengikuti pilihan perangkat di Saya → Pengaturan → Tampilan
(Terang, Gelap, Sistem; bawaan Sistem = ikut HP). Disimpan per perangkat di cookie `mw_mode`
(`src/lib/main-wam/appearance.ts`, Path `/wam`, setahun); `acara/layout.tsx` membacanya di server
(`readMainWamMode`) dan memberi `mode` ke `MainWamTheme`, jadi tidak ada kedip. Mengganti pilihan
(`MainWamModeSetting`/`applyMainWamMode`) menulis cookie, mengubah `data-mw-mode` di akar dan kedua tag
`theme-color` seketika, lalu `router.refresh()`. **Semua layar mengikuti tema**, termasuk Momen: tidak ada
permukaan gelap tersendiri, **termasuk kamera Momen dan pemindai QR Absen**: bilah atas, tombol
jepret, latar di sekitar jendela bidik, placeholder sebelum kamera siap (`--mw-photo-bg`/`--mw-surface-2`), kartu
dan teks bantuan semuanya lewat token tema. Hanya isi jendela bidik (video langsung) yang alami; tanda di atasnya
(sudut bingkai QR) memakai `--mw-media-on` + bayangan token. Tidak ada lagi `--mw-camera*`, `--mw-ondark*`,
`data-mw-camera`, atau varian `ondark` (dijaga `colors.test.ts`). `screen.camera` tinggal berarti "kamera menggambar
bilahnya sendiri, kerangka tidak menggambar bilah atas dan bawah". Sheet dan konfirmasi mengikuti tema. Blok `[data-mw-mode="dark"]` dan blok Sistem di `theme.module.css` harus sama
(dijaga `colors.test.ts`). Pratinjau: `?mode=dark` pada galeri kit, atau ubah `data-mw-mode` di akar.

**Font**: Barlow Condensed 600/700/800 (tampilan) dan Plus Jakarta Sans (isi) lewat `next/font/google`
(`theme/font.ts`), di-host situs ini, fallback disesuaikan (tanpa loncatan teks). Variabel: `--mw-font-barlow`,
`--mw-font-jakarta`. Tes yang merender `MainWamTheme` perlu
`vi.mock("./font", () => ({ mainWamFontVars: "" }))` (path relatif ke berkas tes).

### 2.1 Bahasa visual prototipe final (token baru, dipakai layar)

Ringkas: latar biru-es (`#EEF3FB`) / biru-hitam (`#050914`); kartu putih / kaca biru tua dengan garis tipis;
**emas** untuk aksi dan keadaan "sekarang"; biru `--mw-primary` (prototipe `--cy`) untuk ikon, tautan, simpul garis;
angka dan judul **Barlow Condensed 800 kapital**; label kecil kapital berjarak huruf lebar (`.cap`);
isi **Plus Jakarta Sans**. Sudut kartu 22 (kartu sesi 28), tombol 16, pil penuh.

| Token baru | Terang | Gelap | Pakai untuk |
| --- | --- | --- | --- |
| `--mw-gold`, `--mw-on-gold` | `#E0A200`, `#0B1638` | `#F5C542`, `#0B1638` | tombol primary, titik live, tab aktif, batang progres, lencana |
| `--mw-gold-ink` | `#7A5200` | `#F5C542` | **teks/ikon emas di atas permukaan** (kontras ≥ 4,5:1); jangan pakai `--mw-gold` untuk teks |
| `--mw-gold-soft`, `--mw-gold-line` | emas 16 % / 55 % transparan | sama | latar dan garis lembut berwarna emas |
| `--mw-glow` | tanpa | cahaya emas | bayangan tombol/titik emas di mode gelap |
| `--mw-surface-raised` | putih | `#0A1330` | kartu emas, sheet, dialog |
| `--mw-select-bg/fg`, `--mw-seg-on-bg/fg` | tinta / putih | emas / tinta | chip terpilih, segmen terpilih |
| `--mw-eco-grad-1/2`, `--mw-on-eco`, `--mw-eco-bar` | hijau tua | hijau tua | kartu Jejak karbon |
| `--mw-motif-{konstelasi,kontur,sirkuit,radar,matriks,orbit,busur}` | `url(/wam/kit/…-terang.svg)` | `…-gelap.svg` | motif sudut Kit Visual (aset di `public/wam/kit`) |
| `--mw-elev-card`, `--mw-elev-hero` | bayangan tipis | cahaya biru/emas | kartu biasa dan kartu emas |
| `--mw-radius-20/22/28` | 20/22/28 | sama | daftar, kartu, kartu emas dan sheet |
| `--mw-type-cap`, `--mw-type-cap-lg`, `--mw-type-hero` + `--mw-ls-cap`, `--mw-ls-cap-tight` | Barlow 700 12/14 px, 76 px | sama | label kapital (selalu bersama `text-transform: uppercase`) dan angka hero |

Gelar lama tetap: `--mw-type-display/title/headline/stat-*` sekarang Barlow Condensed (judul kapital lewat
`<Text>`, TopBar, SectionHeader, Sheet). `--mw-nav-h` jadi 68. Slot tema admin tidak berubah: `primary` mengatur
biru (ikon, tautan, fokus), `accent` kartu acara; **emas tetap** (identitas WAM), bukan slot. `displayFont` baru:
`barlow-condensed` (bawaan) atau `plus-jakarta-sans`.

**Komponen baru** (`ui/Brand.tsx`, `ui/Card.tsx`; ada di galeri bagian "Prototipe"):

- `<EyebrowLabel tone="muted|gold|ink" large icon>`: label kapital kecil ("SELAMAT PAGI", "SEDANG BERLANGSUNG").
- `<PulseDot />`: titik emas berdenyut (diam saat Kurangi gerak).
- `<BracketCard motif="konstelasi">` atau `<Card variant="gold" bracket motif>`: kartu emas dengan dua siku biru dan motif sudut, untuk "yang sedang terjadi" (sesi di Beranda). `Card motif="matriks|kontur|…"` memberi motif tanpa siku; `Card variant="eco"` kartu hijau Jejak karbon.
- `<NetworkMotif name place="bottom|top|fill" fade />`: motif jaringan sebagai latar blok/layar (dekoratif).
- `<SegmentDots total current done label fill />`: segmen hari (header Beranda) dan progres misi (`fill`).
- `<BigNumber value unit size="hero|xl|l|m" tone="gold" />`: angka Barlow dengan satuan kapital ("340 POIN").
- `<KeyValue label value />` + `<KeyValueRow>`: petak label-nilai (.kv/.tele).
- `<TopBar title eyebrow>` (judul tab besar dengan label di atasnya) dan `<TopBar variant="home" dayDots={{ total, current, label }}>`; shell meneruskan `greeting.dayDots`.
- `Pill tone="gold"`, `IconBox tone="gold"`, `Text variant="hero|cap|cap-lg"`, `Text color="gold"`.

Perubahan perilaku komponen lama (API tetap): Button primary = emas berteks gelap, tinggi 52; `tonal` = garis emas;
`secondary` = garis; `text` = teks emas. FilterChip terpilih = tinta (terang) / emas (gelap). Pill = huruf kapital kecil;
`StatusPill live` = emas. Badge = emas. Banner `info` = panel bertepi emas. Switch aktif = emas. Segmented terpilih = putih / emas.
SessionRow: jam Barlow, simpul biru, baris live emas. IconBox netral = biru 14 %. Bilah bawah datar tanpa pil: tab aktif tinta + titik emas.

## 3. Kerangka (shell)

`MainWamShell` dipasang sekali di `src/app/wam/acara/(app)/layout.tsx`. Yang digambar dibaca dari alamat
(`mainWamScreen`, `src/lib/main-wam/screen.ts`), bukan dari halaman:

| Tingkat | Bilah atas | Bilah bawah |
| --- | --- | --- |
| `akar` Beranda | sapaan, nama (h1), "Hari ke-2 dari 4", lonceng (satu-satunya) | ya |
| `akar` Panitia (`/kelola`, hub) | judul besar "Panitia" (h1) | ya, tab Panitia menyala; juga di Rundown live, Absen, Pengumuman, Moderasi |
| `akar` lain | judul besar (h1); bilah ringkas muncul setelah judul tergulir | ya |
| `detail` | ‹ Kembali + judul (h1), lengket, garis saat tergulir. Judul kosong (P04): hanya ‹, h1 tersembunyi dari `screen.label` | ya, tab induk menyala |
| `tugas` | ✕ Tutup + judul | tidak (pakai `ActionBar`) |
| `tugas` kamera (`screen.camera`) | tidak ada (kamera punya bilahnya sendiri, mengikuti tema) | tidak |

Tumpukan foto Momen: kartu depan di tengah (margin kiri = kanan, 24 px dari tepi layar; kartu belakang miring bergeser -5 sampai 5 px, sudutnya tetap di dalam layar). Delapan emoji di bawah foto polos tanpa kartu, tersusun 4 × 2 di tengah dengan jarak merata; baris itu membungkus menurut lebar barisnya sendiri (container query): 4 kolom, 3 kolom di bawah 200 px, 2 di bawah 144 px (ruang untuk tiga baris), target tetap 44. Satu reaksi per orang: ketuk memilih, ketuk lagi membatalkan, emoji lain mengganti. Di dalam foto kiri bawah: pil tiga avatar bertumpuk rapat + jumlah reaksi, satu tombol yang membuka rincian (chip Semua + per emoji, nama, singkatan departemen, emoji). Judul tab Momen = "Terbaru"; tombol Foto di kanan atas (kata Foto jadi nama tersembunyi di bawah 320 px).

Momen mengikuti tema seperti tab lain (tidak ada bilah atau latar gelap tersendiri). ‹/✕ kembali ke layar sebelumnya bila
ada riwayat di aplikasi, kalau tidak ke `back.href` (dibuka dari notifikasi atau QR). Toast
(`ToastProvider`) ada di shell, di atas bilah bawah. Area aman iPhone (atas, bawah, kiri, kanan) sudah
diberi padding. Di layar ≥ 600 px aplikasi tetap satu kolom selebar ponsel (480) di tengah, dan sheet tetap
di dalam kolom itu (dari bawah, selebar kolom; T-M03). Di bawah 240 px (zoom 200 %) bilah bawah hanya ikon;
katanya tetap untuk pembaca layar. Tautan "Lewati ke isi" setinggi 44. Kembali ke aplikasi setelah > 60 detik
di latar: `router.refresh()` (angka lonceng).

Juga dari shell (fondasi):
- `ScreenFailed({ reset })`: tampilan `(app)/error.tsx` (galat tak terduga di layar mana pun), di dalam
  kerangka, dengan "Coba lagi" (`router.refresh()` + `reset`) dan "Ke Beranda".
- `SignInFirst`: dipasang `(app)/layout.tsx` untuk orang yang belum login di mode `pra`/`uji`; tidak
  menggambar apa pun dan membawa ke login WAM dengan alamat persis (audit M6).

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

Tab ke-5 **Panitia** (ikon `clipboard-list`, ujung kanan setelah Saya): `<MainWamShell committee>` (layout memberi `showsCommitteeTab(viewer)`, hanya untuk peran panitia); `BottomNav committee`; daftar tab `mainWamTabsFor(committee)`. Bilah 5 tab tetap rapi dan setiap tab ≥ 44 di 320, 360, 390, 412 px (64 × 64 di 320). `DevFrame` memberinya otomatis untuk `peran=panitia`.

Lencana tab: `<MainWamShell badges={{ momen: 12, saya: "dot" }}>` (fondasi). `BottomNav` bisa dirender
sendiri untuk pratinjau (`current`, `tone`, `badges`).

## 4. Komponen

Semua dari `@/components/main-wam/ui`. Prop `href`/`onClick`/`external` (ActionProps) membuat komponen
menjadi tautan atau tombol; tanpa keduanya ia hanya tampilan.

### Tombol

| Komponen | Prop utama | Kapan |
| --- | --- | --- |
| `Button` | `variant`: `primary` · `secondary` · `tonal` · `text` · `danger` · `danger-outline` · `danger-text`; `size` `l` (48) / `m` (40, sentuh 44); `block`; `icon`; `loading` + `loadingLabel`; `disabled`; `type`; `href` | aksi. `loading`: spinner, klik diabaikan, fokus tetap (aria-busy), submit tidak terkirim dua kali. Tinggi minimum 48/40; label yang tidak muat membungkus (tombol meninggi), tidak dipotong |
| `IconButton` | `icon`, **`label`** (wajib, nama yang dibacakan), `variant` `standard` · `tonal` · `filled` · `onmedia`, `size` 44/56, `pressed` (+ `liked` = hati merah), `badge` (angka atau `"dot"`) | aksi tanpa teks. Sertakan jumlah di `label` ("Notifikasi, 3 belum dibaca") |
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
| `ListRow` | `icon` atau `leading` (Avatar), `title` (≤ 2 baris), `sub`, `value`, `trailing` (Pill, Badge, Switch), `chevron` (bawaan saat bisa diketuk), `disabled`, `spoken` | baris menu, info, pengaturan |
| `StatRow` | `icon`, `title`, `sub`, `value`, `unit`, `status` (Pill), `href`/`onClick`, `spoken` | Ringkasan BOD (maks 4). Tanpa href = statis (Jejak karbon), nilai tetap sejajar |
| `ShortcutGrid` + `ShortcutTile` | `icon`, `label`, `badge`, `badgeLabel` | Kelola panitia 2 × 2 di hub tab Panitia (satu kolom di bawah 380 px, supaya kata tidak terpotong) (Rundown live, Absen, Pengumuman, Moderasi). Nama: label lalu ", 3 laporan" tersembunyi; lencana tidak dibaca |
| `SessionList` + `SessionRow` | `start`, `end`, `title`, `place`, `status` `upcoming` · `live` · `done` · `cancelled`, `checkedIn`, `extra` (Chip Absen, StatusPill changed), `href` | Agenda. `live` menyala + "Sedang berlangsung"; `cancelled` dicoret, "Dibatalkan", tidak bisa dibuka. Di bawah 300 px (zoom 200 %): jam satu baris "08.00–12.00" dengan › di ujungnya, judul selebar baris di bawahnya, tanpa rel |
| `StackPreview` | `photos` (≤ 3, `{src}`), `title`, `sub`, `cta`, `href` | kartu Momen di Beranda (satu tautan). Saat sempit, teks lalu "Lihat" turun ke baris berikutnya |
| `PhotoFill` | `photo {src, alt}`, `tone` 1–6 | foto atau placeholder netral, mengisi kotaknya |
| `Divider` | `inset` 16/68 | garis 1 px |

**Nama aksesibel (WCAG 2.5.3, T-S05).** Nama baris dan kartu yang bisa diketuk = kata yang tampil, berurutan.
Jangan memberi `aria-label` yang menyusun ulang teks layar ("Kehadiran hari ini, 93%" padahal tampil
"Kehadiran hari ini · 93%"). Untuk keterangan tambahan pakai `spoken` (`ListRow`, `StatRow`), yang dibaca
sesudah kata yang tampil: `<ListRow title="Rani" sub="07.52 · Scan QR" spoken="ketuk untuk membatalkan" … />`.

```tsx
<List>
  <ListRow icon={<BedDouble />} title="Kamar" sub="Kamar 208 · bersama Sari" value="Lt. 2" href={mainWamPath.room} />
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
| `Chip` | `icon`, `href` | informasi ("Aula Utama", "Lt. 2"), bukan kontrol |
| `FilterChip` | `selected` (aria-pressed, centang); atau `menu` + `name` + `expanded` + `active` | saring daftar; `menu` = "Semua sesi ▾" yang membuka sheet pilihan |
| `ChipRow` | `scroll` (geser ke tepi layar) atau bungkus; `label` | deretan chip |
| `TagChip` + `TagChipRow` | `label` ("Untuk:"), `value`, `onClick`/`href`, `onClear` + `clearLabel`, `expanded` | chip bertanda di atas media (dulu "Sesi: Team building ✕" di kamera Momen; kamera sekarang tanpa chip, jadi belum dipakai layar mana pun) |
| `Segmented` | `options [{value, label, icon?, disabled?}]`, `value`, `onChange`, **`label`** | 2–4 tampilan satu daftar (Semua / Fotoku di Galeri). Radio group: panah memilih, Home/End. Lebar segmen mengikuti katanya; label yang tetap tidak muat membungkus ke baris kedua (tidak pernah "Kelompo…"), tinggi tetap ≥ 44 |
| `Switch` | `checked`, `onChange`, `label` (atau `labelledBy`) | nyala/mati langsung berlaku |
| `SwitchRow` | `title`, `sub`, `checked`, `onChange`, `inList` | sakelar berteks ("Kabari peserta"); seluruh baris bisa diketuk |

```tsx
"use client";
<Segmented label="Tampilkan foto" value={view} onChange={setView}
  options={[{ value: "semua", label: "Semua" }, { value: "saya", label: "Fotoku" }]} />
<FilterChip menu name="Sesi" expanded={picking} active={sesi !== null} onClick={() => setPicking(true)}>
  {sesi?.title ?? "Semua sesi"}
</FilterChip>
```

### Isian dan hari

| Komponen | Prop utama | Kapan |
| --- | --- | --- |
| `TextField` | `label` (wajib, di atas), `optional`, `help`, `error` (kata; memberi `aria-invalid`), `icon`, `suffix` ("menit"), `search`, `multiline`, `showCount` + `maxLength`/`countMax` (angka bertitik: "90/1.000"), plus prop `<input>`/`<textarea>` biasa | form pendek (pengumuman, masukan, laporan). Isian tidak hilang saat galat. Fokus: satu cincin di kotak (inset 2 primary); isian bergalat tetap bergaris merah + lingkar merah lembut saat fokus |
| `SelectField` | `label`, `value`, `placeholder`, `onClick` (buka sheet) atau `href`, `expanded`, `error`, `help` | pilihan yang dibuka di sheet ("isian pilih") |
| `DayTabs` | `days [{key, day, date, today?, href?}]`, `current`, `onSelect` | 4 hari acara di Agenda/Rundown. Dengan `href` = tautan (`mainWamPath.agenda(n)`, aria-current), tanpa = tombol (aria-pressed) |

### Status dan data

| Komponen | Prop utama | Kapan |
| --- | --- | --- |
| `StatusPill` | `status`: `live` · `next` · `notStarted` · `done` · `notOpen` · `open` · `present` · `sent` · `approved` · `changed` · `pending` · `hidden` · `cancelled`; `children` mengganti kata ("Hadir 07.52") | status baku, kata dan warnanya tetap |
| `Pill` | `tone` `neutral` · `active` · `success` · `warning` · `error` · `momen` · `emisi` · `awarding` · `onmedia` · `primary`; `icon`; `dot`; `pulse` | status lain, 1–2 kata. Tidak pernah melebihi wadahnya: bila wadah lebih sempit, katanya membungkus |
| `Badge` | `count` (> 99 jadi "99+") atau `dot`; `label` bila berdiri sendiri | angka di ikon/tab/tile |
| `Avatar` | `name` (inisial), `photo`, `size` 24/32/40/48/64, `label` bila berdiri sendiri | orang; dekoratif bila namanya tertulis di sebelah |
| `ProgressBar` | `value`, `max`, **`label`**, `valueText` ("842 / 1.200 foto"), `icon`, `tone`, `thin`, `labelSize` `label` (13, bawaan) / `subtitle` (17, label dan nilai text/1) | kemajuan (Mozaik, kehadiran); `role="progressbar"`. `subtitle` bila kemajuannya angka utama layar (M06: "312 dari 600 foto · 52%") |
| `Text` | `variant` (15 gaya DS §2), `color` (`1` `2` `3` `primary` `success` `warning` `error` `on-accent` `on-accent-2` `media` `media-2` `inverse-2`), `as`, `clamp` (2 baris), `ellipsis` | teks lepas dengan token |

### Umpan balik dan lapisan

| Komponen | Prop utama | Kapan |
| --- | --- | --- |
| `Banner` | `tone` `info` · `offline` (ikon `cloud-off`) · `warning` · `error` · `success`; `title`; isi; `icon`; `action {label, onClick}`; `href` (seluruh banner tautan, ›). Pengumuman tersemat: `tone={note.tone}` dari `pinnedForMe` | info di atas isi layar, mendorong isi (tidak menutupi): offline, pengumuman penting, jam berubah, gagal + "Coba lagi" |
| `EmptyState` | `icon`, `title`, isi, `action` (Button), `size` `m`/`s` (di kartu), `headingLevel` | kosong, tanpa koneksi, izin ditolak |
| `Skeleton` + `SkeletonGroup` | `shape` `line` · `title` · `circle` · `box` · `photo` · `card` · `block`; `width`, `height`; grup memberi `aria-busy` + label | `loading.tsx` per bagian (bentuknya mengikuti layar) |
| `Spinner` | `size` 20/24, `label` | tunggu > 300 ms yang bukan satu bagian |
| `LoadingDialog` | `open`, `title` ("Sedang masuk", "Mengirim foto"), `loader` `pegasus` (bawaan) · `orbit` · `network` · `mini` | tunggu yang tidak boleh terputus (masuk, kirim foto, catat absen): kartu bertema + animasi kit (`public/wam/loader-*.svg`) + "Mohon tunggu sebentar" di atas latar digelapkan; dialog modal, tidak bisa ditutup pengguna |
| `Sheet` | `open`, `onClose`, `title`, `subtitle`, `footer`, `history` (bawaan true), `locked`, `initialFocus`, `flush` | detail atau form pendek di atas layar |
| `useHashSheet(id)` | `{ open, show, close }` | sheet beralamat `#id` (tautan bisa membukanya); pakai dengan `<Sheet history={false}>` |
| `ConfirmDialog` | `open`, `onCancel`, `onConfirm`, `title` (pertanyaan), `body` (akibat), `confirmLabel` (hasil), `tone` `primary`/`danger` (+ ikon), `busy` + `busyLabel` | konfirmasi aksi berisiko |
| `useToast()` | `show({ text, sub, tone, action {label, onAction}, secondary {label, onAction}, duration, timer, thumb, onTimeout })` → id; `dismiss(id)` | konfirmasi singkat. 4 dtk, 6 dtk dengan aksi. `secondary` = aksi kedua di depan `action` ("Lihat" di samping "Batalkan"); dengan dua aksi, keduanya pindah ke baris sendiri di bawah teks. Galat yang perlu tindakan = Banner |
| `ToastPreview` | tampilan statis toast | galeri |
| `TopBar` | `variant` `large` · `back` · `home`, `actions`, `sticky`, `scrolled`; `back`: `label` (nama layar untuk pembaca layar bila `title` kosong; tanpa keduanya tidak ada h1 kosong) | dipakai shell; layar biasanya tidak memakainya langsung |
| `ActionBar` | `note`, `row` | aksi utama layar tugas, lengket di bawah, dengan area aman |

Perilaku Sheet dan ConfirmDialog (`ui/useModal.ts`): `<dialog>` native + `showModal()` (halaman di
bawahnya inert); fokus pindah ke judul (ConfirmDialog: ke **Batal**) dan kembali ke pembuka saat tutup,
tanpa cincin bila dibuka dengan ketukan, dengan cincin bila dengan keyboard; Tab/Shift+Tab berputar di
dalam (radio roving yang `tabindex=-1` bukan perhentian, jadi Tab dari radio terpilih kembali ke ✕; T-M01);
sheet yang dirender bersyarat (`{open && <Sheet open …/>}`) lalu dilepas juga mengembalikan fokus ke
pembukanya bila fokus masih di dalamnya (T-K01); Esc, ✕, ketuk area redup, dan **tombol Back HP** menutup. Halaman di bawah tidak ikut tergulir.
`locked`/`busy`: tetap terbuka (Back mengembalikan entrinya). Sheet ditarik ke bawah lewat pegangan juga
menutup (HP); ✕ adalah alternatif tombolnya. Sheet mengikuti tema (terang atau gelap), juga di atas Momen.

Riwayat: setiap modal yang terbuka memegang satu entri (`{ mwSheet: key }`), lewat satu antrean bersama
untuk semua Sheet dan ConfirmDialog. Popstate hanya menutup modal yang entrinya ditinggalkan (Back
menutup yang teratas saja). Ditutup cara lain: entrinya diambil kembali sesaat kemudian; modal yang
dibuka sebelum itu memakai entri yang sama (tanpa langkah riwayat), yang dibuka saat langkah mundur
sedang berjalan menunggu langkah itu selesai. Entri yang tertinggal (misalnya pindah halaman saat sheet
terbuka) dilewati saat Back sampai di sana. Jadi **menutup satu modal lalu langsung membuka yang lain
aman**, di tick yang sama maupun sesudahnya; tidak perlu pengganjal (pengganjal `afterModal` sudah
dicabut):

```tsx
// Menu sesi → Pindah tempat: cukup ganti state-nya.
<ListRow title="Pindah tempat" onClick={() => setOpen("tempat")} />   // open: "menu" → "tempat"
```

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

**Gerak dan gulir (21 Nov 2026).** Semua scrollbar disembunyikan di aplikasi (halaman dan area gulir dalam; layar tetap bisa digulir dengan sentuhan, roda, dan tombol). Pengaturan, Kurangi gerak (cookie `mw_motion`, atribut `data-mw-reduce` di akar tema) memotong semua animasi dan transisi, di atas `prefers-reduced-motion` yang tetap dihormati. Sakelar di baris yang punya keterangan sejajar dengan judul barisnya, bukan tengah dua baris.

## 5. Tes

- `colors.test.ts`: tanpa warna literal, blok Gelap = blok Sistem, kontras teks di kedua mode.
- Aksesibilitas dan tata letak sempit (fase 4): `ui/a11y.dom.test.tsx` (axe `label-content-name-mismatch`,
  Tab melewati radio roving, fokus kembali saat sheet dilepas, aturan CSS 320 px/zoom/desktop);
  `shell/failed.dom.test.tsx` (`(app)/error.tsx`, `SignInFirst`).
- Pola `*.dom.test.tsx` (vitest + testing-library, jsdom). Contoh: `ui/kit.dom.test.tsx`,
  `shell/shell.dom.test.tsx`, `theme/MainWamTheme.dom.test.tsx`; token: `theme/tokens.test.ts`.
- jsdom tidak punya dialog modal: stub `HTMLDialogElement.prototype.showModal/close` (lihat `kit.dom.test.tsx`).
- Riwayat dan modal berantai: `ui/modal.dom.test.tsx` (jsdom melangkah di riwayat secara asinkron seperti
  peramban; tunggu dengan timer nyata, mis. 40 ms, sebelum memeriksa).
- Mock `next/link` menjadi `<a>` dan `next/navigation` (`usePathname`, `useRouter`) bila merender shell.
- Toast dengan `vi.useFakeTimers()`.
- Cek tampilan: Playwright Python headless 390 × 844 @2x di halaman dev-preview.

### Tata letak layar yang mengisi tinggi (Momen)

Layar yang isinya satu objek utama (tumpukan Momen) tidak memakai angka cadangan tetap. `<main>` sudah setinggi layar;
isi layar menjadi kolom flex: bilah saringan di atas, lalu satu `stage` (kartu + baris keterangan + baris aksi) yang
dipusatkan. Kartu adalah item flex (`flex: 1 1 0`, minimal 240, maksimal 9:16 lewat `--mw-deck-max`) dan kontainer ukuran
(`container-type: size`) tempat tumpukan menghitung lebarnya (`min(lebar, tinggi / 1,25)`) dan tingginya
(`min(tinggi, lebar × 1,78)`); foto `object-fit: cover`. Di layar tinggi (412×915) kartu meninggi dan baris aksi
menempel di bawahnya; di layar sangat tinggi kartu berhenti di 9:16 dan ketiganya dipusatkan; di layar pendek
(320×568, 360×640) kartu menyusut ke 4:5 dan tidak ada yang terpotong. Layar daftar (Beranda, Agenda, Saya, Galeri)
tetap mengalir dari atas dan menggulir; ruang kosong di bawah isi pendek adalah perilaku daftar, bukan celah antar
bagian. Viewfinder kamera tetap 4:5 (foto dipotong 4:5) dan dipusatkan antara bilah dan tombol jepret.

## 6. Yang belum ada di kit

Tersedia di prototipe tetapi belum dijadikan komponen (bangun di fiturmu dari token, atau minta ke agen
UI kit): NowCard (susun dari Card + StatusPill + Button), CheckboxRow, RadioRow/PickRow (sementara: List +
ListRow + `aria-current`, lihat contoh sheet pilih sesi), PhotoTile/galeri, StackViewer + kartu tumpukan, CameraScreen + ShutterButton,
QRScannerOverlay, Mozaik, Ticket, Stepper, KeyValue, NotificationRow, EmissionCard, LeaderboardRow,
AwardCard, RundownRow, tanda "diubah oleh".

---

## 7. Bahasa (Indonesia / English)

Aturan lengkap dan keputusan: `KONTRAK.md` §11. Ringkasnya untuk yang membuat layar:

- **Jangan menulis teks Indonesia langsung di komponen peserta.** Tambah kunci di `src/lib/main-wam/i18n/id/<area>.ts`
  dan `en/<area>.ts`, lalu `const t = useT()` (`@/components/main-wam/i18n`): `t("peserta.group.more", { n: 3 })`.
  Jamak: `{n, plural, one {# photo} other {# photos}}`. Tes kamus gagal bila kunci/variabel tidak sama.
- **Komponen kit sudah berbahasa**: `StatusPill` (label dari kunci `pill.*`), `Sheet` (✕ = `ui.close`), `ConfirmDialog` (Batal),
  `Toast` (wilayah "Pemberitahuan"), `SkeletonGroup`/`Spinner` (label yang ditulis Indonesia dikenali kamus lewat
  `translateKnown`, jadi `loading.tsx` tidak perlu diubah), `DayTabs`, `SessionRow`, `StackPreview`, `BottomNav`, bilah shell. Teks yang
  kamu berikan lewat props (label, title) kamu terjemahkan sendiri sebelum memberikannya.
- Komponen server tanpa hook memakai `<Words k="ui.see" />` untuk teks biasa; untuk atribut (aria-label) jadikan komponen klien.
- Tanggal dan jam: `shortDate(lang, "2027-01-05")`, `clock(lang, "08:00")`, atau helper peserta (`hhmm(iso, lang)`, `dayOf`, `untilLabel`)
  dan rundown (`timeRange(session, lang)`, `dayWord(date, today, lang)`). Jam tetap WIB.
- **Pengaturan → Bahasa / Language**: `<LanguageSetting />` (`@/components/main-wam/i18n`), `Segmented` Indonesia | English di dalam `Card`.
- Cek tata letak: teks EN biasanya lebih pendek; yang lebih panjang ("Gathering time changed · was 05:45", "Departure · Mon, 4 Jan")
  sudah dicek di 390 px (Beranda, Agenda, Momen, Saya, Pengaturan, Perjalanan, Masuk, Kamar). Label tab bawah tetap satu kata.

## 8. Mode demo (banner dan pengalih peran)

`<MainWamShell demo>` menggambar strip "Mode demo · data contoh" (token `--mw-warning-container`) di atas bilah atas; layout nyata mengisinya dari `settings.moduleConfig.demo`, `DevFrame` dari propnya. Kartu "Lihat sebagai" (`components/main-wam/demo/DemoSwitch`, di Saya lewat prop `demo` pada `SayaScreen`) hanya muncul untuk penguji. Pratinjau: `/dev-preview/wam2026/demo?layar=saya|beranda|panitia&peran=peserta|panitia|bod`. Aturan lengkap: KONTRAK §12.
