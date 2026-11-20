"use client";

import { useState } from "react";
import {
  Bell, CalendarClock, Camera, Check, Ellipsis, EyeOff, Footprints, Globe, Heart, Images, ImagePlus, Leaf, MapPin, Megaphone, QrCode, ScanLine,
  Search, Send, Share, ShieldAlert, Trash2, Trophy, UserCheck, Users, WifiOff, CalendarCog, Lock, X,
} from "lucide-react";
import {
  ActionBar, Avatar, Badge, Banner, DayTabs, SelectField, TextField, Button, Card, CardHead, Chip, ChipRow, ConfirmDialog, Divider, EmptyState, FilterChip, IconBox, IconButton, List, ListRow,
  Pill, PhotoFill, ProgressBar, SectionHeader, Segmented, SessionList, SessionRow, Sheet, ShortcutGrid, ShortcutTile, Skeleton, SkeletonGroup, Spinner,
  StackPreview, StatRow, StatusPill, Switch, SwitchRow, TagChip, TagChipRow, Text, TextLink, ToastPreview, TopBar, useToast, STATUS_PILLS, type SessionStatus,
} from "@/components/main-wam/ui";
import { BottomNav } from "@/components/main-wam/shell";
import css from "./gallery.module.css";

/*
 * Every Main WAM kit component and its states on one 390-wide page, for checking against the
 * prototype (prototipe/komponen.html, png/_komponen.png) and for the feature agents to copy from.
 * Sample people are made up (Rani, Sari, Dimas); placeholders stand in for photos.
 */

const SWATCHES = [
  "bg", "surface", "surface-2", "outline", "outline-2", "outline-strong", "text-1", "text-2", "text-3",
  "primary", "primary-strong", "primary-container", "success", "success-container", "warning", "warning-container", "error", "error-container",
  "momen", "momen-container", "emisi", "emisi-container", "awarding", "awarding-container", "accent", "accent-container", "inverse-surface",
] as const;

const TYPES = [
  ["display", "Display 40/48 · 800"], ["title", "Title 28/36 · 700"], ["headline", "Headline 22/28 · 700"], ["subtitle", "Subtitle 17/24 · 600"],
  ["body", "Body 15/22 · 400"], ["body-strong", "Body strong 15/22 · 600"], ["body-long", "Body long 15/24 · 400"], ["body-small", "Body small 13/18 · 400"],
  ["label-lg", "Label large 15/20 · 600"], ["label", "Label 13/18 · 600"], ["caption", "Caption 12/16 · 500"], ["caption-strong", "Caption strong 12/16 · 600"],
  ["stat-xl", "48"], ["stat-l", "32"], ["stat-m", "20"],
] as const;

function Col({ id, title, sub, children }: { id: string; title: string; sub?: string; children: React.ReactNode }) {
  return <section id={id} className={css.col} aria-labelledby={`${id}-h`}>
    <div className={css.colHead}><h2 id={`${id}-h`}>{title}</h2>{sub && <p>{sub}</p>}</div>
    {children}
  </section>;
}
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className={css.group}><span className={css.label}>{label}</span>{children}</div>;
}

export function KitGallery() {
  const toast = useToast();
  const [segment, setSegment] = useState<"semua" | "kelompok">("semua");
  const [audience, setAudience] = useState<"kelompok" | "semua">("kelompok");
  const [filters, setFilters] = useState<string[]>(["semua"]);
  const [notify, setNotify] = useState(true);
  const [push, setPush] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [picker, setPicker] = useState(false);
  const [session, setSession] = useState("Semua sesi");
  const [dialog, setDialog] = useState<null | "danger" | "primary">(null);
  const [busy, setBusy] = useState(false);
  const [liked, setLiked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [day, setDay] = useState("2");
  const [note, setNote] = useState("");
  const toggle = (key: string) => setFilters(list => list.includes(key) ? list.filter(item => item !== key) : [...list, key]);

  return <div className={css.page}>
    <header className={css.head}>
      <h1>Kit WAM 2026</h1>
      <p>Komponen dasar (src/components/main-wam/ui) dan statusnya. Acuan: prototipe/komponen.html. Panduan: docs/main-wam/KIT.md.</p>
    </header>
    <nav className={css.toc} aria-label="Isi galeri">
      {[["warna", "Warna"], ["teks", "Teks"], ["tombol", "Tombol"], ["chip", "Chip"], ["status", "Status"], ["isian", "Isian"], ["kartu", "Kartu"], ["sesi", "Sesi"],
        ["umpan", "Umpan balik"], ["overlay", "Sheet"], ["bilah", "Bilah"]].map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
    </nav>

    <Col id="warna" title="Warna" sub="Token --mw-* (theme.module.css). Aksen acara dan warna utama bisa diganti tema (slot KV).">
      <div className={css.swatches}>
        {SWATCHES.map(name => <div key={name} className={css.swatch}><span className={css.chip} style={{ background: `var(--mw-${name})` }} /><span className={css.swatchName}>{name}</span></div>)}
      </div>
    </Col>

    <Col id="teks" title="Teks" sub="15 gaya (DS §2): <Text variant>. Minimal 12, tanpa ukuran sendiri.">
      <div className={css.type}>
        {TYPES.map(([variant, note]) => <div key={variant}>
          <Text variant={variant} as="p">{variant.startsWith("stat") ? "1.240" : "Pemaparan departemen"}</Text>
          <span className={css.cap}>{variant} · {note}</span>
        </div>)}
      </div>
    </Col>

    <Col id="tombol" title="Tombol" sub="L 48, M 40 (area ketuk 44). Satu primary per layar.">
      <Group label="Primary · L, M, ditekan (tekan lama), nonaktif, memuat">
        <div className={css.row}>
          <Button>Simpan</Button>
          <Button size="m">Simpan</Button>
          <Button disabled>Simpan</Button>
          <Button loading loadingLabel="Mengirim…">Kirim</Button>
        </div>
      </Group>
      <Group label="Secondary · Tonal · Text">
        <div className={css.row}>
          <Button variant="secondary">Batal</Button>
          <Button variant="secondary" loading loadingLabel="Memuat…">Muat</Button>
          <Button variant="tonal" icon={ScanLine}>Cari fotoku</Button>
          <Button variant="tonal" size="m">Lihat</Button>
          <Button variant="text">Lihat agenda</Button>
          <Button variant="text" disabled>Lihat agenda</Button>
        </div>
      </Group>
      <Group label="Bahaya · isi, garis, teks">
        <div className={css.row}>
          <Button variant="danger" icon={Trash2}>Hapus foto</Button>
          <Button variant="danger-outline">Sembunyikan</Button>
          <Button variant="danger-text">Keluar</Button>
        </div>
      </Group>
      <Group label="Lebar penuh, dengan ikon · coba memuat">
        <Button block icon={ScanLine} loading={loading} loadingLabel="Membuka kamera…" onClick={() => { setLoading(true); window.setTimeout(() => setLoading(false), 2000); }}>Absen</Button>
      </Group>
      <Group label="IconButton · standard, tonal, filled, ditekan (suka), nonaktif, lencana">
        <div className={css.row}>
          <IconButton icon={Bell} label="Notifikasi, 3 belum dibaca" badge={3} />
          <IconButton icon={Share} label="Bagikan" variant="tonal" />
          <IconButton icon={Send} label="Kirim" variant="filled" />
          <IconButton icon={Heart} label={liked ? "Batal suka" : "Suka"} pressed={liked} liked onClick={() => setLiked(value => !value)} />
          <IconButton icon={Ellipsis} label="Menu" disabled />
          <IconButton icon={Bell} label="Notifikasi, ada yang baru" badge="dot" />
        </div>
      </Group>
      <Group label="IconButton di atas foto (onmedia), 44 dan 56">
        <div className={css.media}>
          <IconButton icon={X} label="Tutup" variant="onmedia" />
          <IconButton icon={Camera} label="Kamera" variant="onmedia" size={56} />
        </div>
      </Group>
      <Group label="Tautan teks">
        <div className={css.row}><TextLink href="#tombol">Lihat semua</TextLink><TextLink href="#tombol" chevron>Semua</TextLink></div>
      </Group>
    </Col>

    <Col id="chip" title="Chip" sub="Chip = informasi. FilterChip = saring (aria-pressed) atau menu ▾ (membuka sheet). TagChip di kamera gelap.">
      <Group label="Chip info · tautan (ketuk 44)">
        <ChipRow>
          <Chip>Kelompok 4</Chip>
          <Chip icon={MapPin}>Aula Utama</Chip>
          <Chip icon={QrCode}>Absen</Chip>
          <Chip href="#chip">Panitia</Chip>
        </ChipRow>
      </Group>
      <Group label="FilterChip · dipilih (centang), belum, nonaktif · deret geser">
        <ChipRow scroll label="Saring kelompok">
          {[["semua", "Semua kelompok"], ["k1", "Kelompok 1"], ["k2", "Kelompok 2"], ["k3", "Kelompok 3"]].map(([key, label]) =>
            <FilterChip key={key} selected={filters.includes(key)} onClick={() => toggle(key)}>{label}</FilterChip>)}
          <FilterChip selected={false} disabled>Kelompok 9</FilterChip>
        </ChipRow>
      </Group>
      <Group label="FilterChip menu ▾ · terang (pilihan bukan bawaan = aktif)">
        <div className={css.row}>
          <FilterChip menu name="Sesi" expanded={picker} active={session !== "Semua sesi"} onClick={() => setPicker(true)}>{session}</FilterChip>
          <FilterChip menu name="Sesi" active>Team building</FilterChip>
        </div>
      </Group>
      <Group label="TagChip di kamera (mengikuti tema) · menu ▾ dan hapus ✕">
        <div className={css.camera}>
          <TagChipRow>
            <TagChip label="Untuk:" value={audience === "semua" ? "Semua" : "Kelompokku"} onClick={() => setAudience(value => value === "semua" ? "kelompok" : "semua")} />
            <TagChip label="Sesi:" value="Team building" onClick={() => {}} onClear={() => toast.show({ text: "Tag sesi dihapus", tone: "info" })} clearLabel="Hapus tag sesi, jadikan Umum" />
            <TagChip label="Untuk:" value="Kelompokku" onClick={() => {}} />
            <TagChip label="Sesi:" value="Umum" onClick={() => {}} />
          </TagChipRow>
        </div>
      </Group>
      <Group label="Segmented · terang, dengan ikon (panah kiri/kanan memilih)">
        <Segmented label="Tampilkan" value={segment} onChange={setSegment} options={[{ value: "semua", label: "Semua", icon: Globe }, { value: "kelompok", label: "Kelompokku", icon: Users }]} />
      </Group>
    </Col>

    <Col id="status" title="Status" sub="Status selalu kata (+ ikon/titik), bukan warna saja.">
      <Group label="StatusPill (preset)">
        <ChipRow>
          {(Object.keys(STATUS_PILLS) as SessionStatus[]).map(key => <StatusPill key={key} status={key} />)}
          <StatusPill status="present">Hadir 07.52</StatusPill>
        </ChipRow>
      </Group>
      <Group label="Pill · nada">
        <ChipRow>
          <Pill>Netral</Pill><Pill tone="active" dot>Sampai 15.00</Pill><Pill tone="success" icon={Check}>Beres</Pill><Pill tone="warning">2</Pill>
          <Pill tone="error" icon={EyeOff}>Dilaporkan</Pill><Pill tone="momen" icon={Images}>Momen</Pill><Pill tone="emisi" icon={Leaf}>Emisi</Pill>
          <Pill tone="awarding" icon={Trophy}>Awarding</Pill><Pill tone="primary">Fotoku</Pill><Pill tone="onmedia">Belum buka</Pill>
        </ChipRow>
      </Group>
      <Group label="Badge · angka, titik">
        <div className={css.row}><Badge count={3} label="3 baru" /><Badge count={128} label="128 baru" /><Badge dot label="Ada yang baru" /></div>
      </Group>
      <Group label="Avatar · 24, 32, 40, 48, 64 (inisial)">
        <div className={css.row}>
          <Avatar size={24} /><Avatar name="Rani" size={32} /><Avatar name="Sari Rahma" /><Avatar name="Dimas" size={48} /><Avatar name="Contoh Satu" size={64} label="Contoh Satu" />
        </div>
      </Group>
      <Group label="ProgressBar · tebal, tipis, warna modul">
        <ProgressBar label="Mozaik WAM 2026" value={842} max={1200} valueText="842 / 1.200 foto" />
        <ProgressBar label="Kehadiran hari ini" value={112} max={120} valueText="112 dari 120" tone="success" thin icon={UserCheck} />
        <ProgressBar label="Awarding" value={40} tone="awarding" valueText="40%" />
      </Group>
    </Col>

    <Col id="isian" title="Isian dan hari" sub="Label di atas, bantuan atau galat (kata) di bawah. Isian tidak hilang saat galat.">
      <Group label="TextField · biasa, opsional + satuan, galat, cari">
        <TextField label="Judul pengumuman" placeholder="Mis. Bus berangkat 06.30" help="Tampil di Beranda semua peserta." />
        <TextField label="Durasi" optional inputMode="numeric" defaultValue="30" suffix="menit" />
        <TextField label="Kode sesi" icon={QrCode} defaultValue="WAM-3X" error="Kode tidak cocok dengan sesi yang sedang berjalan." />
        <TextField label="Cari peserta" search icon={Search} placeholder="Cari nama atau kelompok" />
      </Group>
      <Group label="TextField multiline · hitungan · SelectField (membuka sheet)">
        <TextField multiline label="Masukan" placeholder="Tulis masukanmu" value={note} onChange={event => setNote(event.target.value)} maxLength={300} showCount help="Tanpa nama." />
        <SelectField label="Sesi" value={session === "Semua sesi" ? undefined : session} placeholder="Pilih sesi" expanded={picker} onClick={() => setPicker(true)} />
      </Group>
      <Group label="DayTabs · hari ini bertitik, terpilih gelap">
        <DayTabs current={day} onSelect={setDay} days={[{ key: "1", day: "Hari 1", date: "Sen, 4 Jan" }, { key: "2", day: "Hari 2", date: "Sel, 5 Jan", today: true },
          { key: "3", day: "Hari 3", date: "Rab, 6 Jan" }, { key: "4", day: "Hari 4", date: "Kam, 7 Jan" }]} />
      </Group>
    </Col>

    <Col id="kartu" title="Kartu dan daftar" sub="Kartu: surface + garis, atau tonal. Ikon kontainer netral di daftar.">
      <Group label="Card · outline, tonal, momen, peran, bisa diketuk">
        <Card><CardHead icon={CalendarClock} title="Jam berubah" sub="Team building mulai 13.30" end={<Pill tone="warning">Baru</Pill>} /><Button variant="tonal" block>Lihat</Button></Card>
        <Card variant="tonal"><Text variant="body-strong">Kartu tonal</Text><Text variant="body-small" color="2">Isi kartu di atas surface-2.</Text></Card>
        <Card href="#kartu" aria-label="Buka detail sesi Pemaparan departemen"><Text variant="subtitle">Kartu yang bisa diketuk</Text><Text color="2">Seluruh kartu satu tautan.</Text></Card>
      </Group>
      <Group label="IconBox · netral, status, kategori, 64, 96">
        <div className={css.row}>
          <IconBox icon={Footprints} /><IconBox icon={Check} tone="success" /><IconBox icon={CalendarClock} tone="warning" /><IconBox icon={ShieldAlert} tone="error" />
          <IconBox icon={Images} tone="momen" /><IconBox icon={Leaf} tone="emisi" /><IconBox icon={ImagePlus} size={64} round /><IconBox icon={Check} size={96} round tone="success" />
        </div>
      </Group>
      <Group label="SectionHeader + ListRow · tautan, tombol, nilai, avatar, nonaktif">
        <div className={css.stack}>
          <SectionHeader title="Info lainnya" sub="Kelompok, kamar, panduan" action={{ label: "Lihat semua", href: "#kartu" }} />
          <List>
            <ListRow icon={Users} title="Kelompok & kamar" sub="Kamar 208 · bersama Sari" value="Lt. 2" href="#kartu" />
            <ListRow icon={MapPin} title="Denah" sub="Hotel & fasilitas" onClick={() => toast.show({ text: "Denah dibuka", tone: "info" })} />
            <ListRow leading={<Avatar name="Dimas" />} title="Dimas" sub="Koordinator kelompok" trailing={<Pill tone="active">Kamu</Pill>} />
            <ListRow icon={Lock} title="Akses MCP" sub="Belum diberi akses" href="#kartu" disabled />
          </List>
          <List inset={16}>
            <ListRow title="Notifikasi" sub="Aktif di HP ini" trailing={<Switch checked={push} onChange={setPush} label="Notifikasi" />} />
            <ListRow title="Versi aplikasi" value="1.0" />
          </List>
        </div>
      </Group>
      <Group label="StatRow (Ringkasan BOD) · bisa diketuk dan statis">
        <List>
          <StatRow icon={UserCheck} title="Kehadiran hari ini" sub="8 orang belum absen" value="112/120" href="#kartu" />
          <StatRow icon={Trophy} title="Awarding" sub="Voting ditutup 12.00" value="5" unit="kategori" status={<Pill tone="warning">2 perlu persetujuan</Pill>} href="#kartu" />
          <StatRow icon={Lock} title="Silent Meeting" value="47" unit="masukan" href="#kartu" />
          <StatRow icon={Footprints} title="Jejak karbon" value="13,6" unit="t CO₂e" />
        </List>
      </Group>
      <Group label="ShortcutTile · Kelola 2 × 2 (lencana)">
        <Card><Text variant="subtitle" as="h3">Kelola</Text>
          <ShortcutGrid label="Kelola">
            <ShortcutTile icon={CalendarCog} label="Rundown live" href="#kartu" />
            <ShortcutTile icon={QrCode} label="Absen" href="#kartu" />
            <ShortcutTile icon={Megaphone} label="Pengumuman" href="#kartu" />
            <ShortcutTile icon={ShieldAlert} label="Moderasi" badge={3} href="#kartu" />
          </ShortcutGrid>
        </Card>
      </Group>
      <Group label="StackPreview di kartu Momen (Beranda)">
        <Card>
          <StackPreview href="#kartu" photos={[]} sub="12 foto baru" />
          <Button variant="secondary" block icon={Camera}>Ambil foto</Button>
        </Card>
      </Group>
      <Group label="Divider · penuh, inset 16">
        <Divider /><Divider inset={16} />
      </Group>
    </Col>

    <Col id="sesi" title="Sesi" sub="SessionRow di Agenda: berlangsung, selesai, sudah absen, dibatalkan.">
      <Card flush>
        <SessionList label="Sesi hari ini">
          <SessionRow start="07.00" end="08.00" title="Sarapan" place="Restoran Lantai 1" status="done" checkedIn href="#sesi" />
          <SessionRow start="08.00" end="12.00" title="Pemaparan departemen" place="Aula Utama" status="live" href="#sesi" extra={<Chip icon={QrCode}>Absen</Chip>} />
          <SessionRow start="13.30" end="15.00" title="Team building" place="Lapangan" href="#sesi" extra={<StatusPill status="changed" />} />
          <SessionRow start="15.30" end="16.30" title="Sesi foto bersama" place="Taman" status="cancelled" href="#sesi" />
          <SessionRow start="19.00" end="22.00" title="Malam keakraban dan awarding untuk semua kelompok" place="Ballroom Arjuno" href="#sesi" />
        </SessionList>
      </Card>
    </Col>

    <Col id="umpan" title="Umpan balik" sub="Toast hilang sendiri; galat yang perlu tindakan memakai Banner.">
      <Group label="Banner · info (tautan), offline, peringatan, galat + aksi, sukses">
        <Banner tone="info" title="Pengumuman penting" href="#umpan">Bus berangkat 06.30 dari lobi.</Banner>
        <Banner tone="offline" title="Kamu sedang offline">Foto dan absen dikirim otomatis saat tersambung.</Banner>
        <Banner tone="warning" icon={CalendarClock}>Jadwal hari ini diubah panitia 08.12.</Banner>
        <Banner tone="error" action={{ label: "Coba lagi", onClick: () => toast.show({ text: "Memuat ulang", tone: "info" }) }}>Gagal memuat agenda.</Banner>
        <Banner tone="success">Semua foto sudah terkirim.</Banner>
      </Group>
      <Group label="Toast · coba">
        <div className={css.row}>
          <Button variant="secondary" size="m" onClick={() => toast.show({ text: "Terkirim", timer: true, duration: 5000, thumb: <PhotoFill tone={3} className={css.ph} />,
            action: { label: "Batalkan", onAction: () => toast.show({ text: "Foto dibatalkan", tone: "info" }) }, onTimeout: () => toast.show({ text: "Foto tersimpan", tone: "success" }) })}>Terkirim · Batalkan</Button>
          <Button variant="secondary" size="m" onClick={() => toast.show({ text: "Absen tercatat · 07.55", tone: "success" })}>Sukses</Button>
          <Button variant="secondary" size="m" onClick={() => toast.show({ text: "Foto belum terkirim", sub: "Dikirim lagi saat tersambung", tone: "error" })}>Galat</Button>
        </div>
      </Group>
      <Group label="Toast · tampilan (statis)">
        <div className={css.toastBox}>
          <ToastPreview text="Absen tercatat · 07.55" tone="success" />
          <ToastPreview text="Terkirim" actionLabel="Batalkan" thumb={<PhotoFill tone={2} className={css.ph} />} timerLeft={0.6} />
          <ToastPreview text="Foto belum terkirim" sub="Dikirim lagi saat tersambung" tone="error" actionLabel="Coba lagi" />
        </div>
      </Group>
      <Group label="EmptyState · M, S">
        <Card><EmptyState icon={ImagePlus} title="Belum ada foto" action={<Button variant="tonal" size="m" icon={Camera}>Ambil foto</Button>}>Jadilah yang pertama membagikan momen hari ini.</EmptyState></Card>
        <Card><EmptyState size="s" icon={WifiOff} title="Tidak ada koneksi" headingLevel={3}>Sambungkan internet lalu coba lagi.</EmptyState></Card>
      </Group>
      <Group label="Skeleton · garis, judul, lingkaran, kotak, kartu · Spinner">
        <SkeletonGroup label="Memuat contoh">
          <div className={css.stack}>
            <div className={css.row}><Skeleton shape="circle" width={40} height={40} /><div className={css.stack} style={{ flex: 1 }}><Skeleton shape="title" width="60%" /><Skeleton width="40%" /></div></div>
            <Skeleton shape="card" />
            <div className={css.row}><Skeleton shape="box" /><Skeleton shape="block" width={120} height={32} /><Spinner label="Memuat" /></div>
          </div>
        </SkeletonGroup>
      </Group>
      <Group label="Switch · SwitchRow (seluruh baris bisa diketuk)">
        <div className={css.row}><Switch checked={notify} onChange={setNotify} label="Kabari peserta" /><Switch checked={false} onChange={() => {}} label="Nonaktif" disabled /></div>
        <Card><SwitchRow title="Kabari peserta" sub="Notifikasi ke semua peserta sesi ini" checked={notify} onChange={setNotify} /></Card>
        <List inset={16}><SwitchRow inList title="Pengingat sesi" sub="10 menit sebelum mulai" checked={push} onChange={setPush} /></List>
      </Group>
    </Col>

    <Col id="overlay" title="Sheet dan dialog" sub="Sheet dari bawah (HP) / kanan (desktop). Esc, ✕, scrim, tombol Back menutup.">
      <div className={css.row}>
        <Button variant="secondary" onClick={() => setSheet(true)}>Buka sheet</Button>
        <Button variant="secondary" onClick={() => setPicker(true)}>Pilih sesi</Button>
        <Button variant="danger-outline" onClick={() => setDialog("danger")}>Dialog hapus</Button>
        <Button variant="secondary" onClick={() => setDialog("primary")}>Dialog kirim</Button>
      </div>
    </Col>

    <Col id="bilah" title="Bilah" sub="TopBar dan BottomNav (di aplikasi digambar shell sekali; lihat /dev-preview/wam2026/kit/shell).">
      <Group label="TopBar · besar">
        <div className={css.barDemo}><TopBar title="Agenda" /></div>
      </Group>
      <Group label="TopBar · kembali, tugas (✕), dengan aksi">
        <div className={css.barDemo}><TopBar variant="back" title="Detail sesi" backHref="#bilah" actions={<IconButton icon={Share} label="Bagikan" />} /></div>
        <div className={css.barDemo}><TopBar variant="back" title="Absen" backHref="#bilah" backIcon={X} backLabel="Tutup" scrolled /></div>
      </Group>
      <Group label="TopBar · Beranda (sapaan, lonceng)">
        <div className={css.barDemo}><TopBar variant="home" kicker="Selamat pagi · Sel, 5 Jan" name="Rani" day="Hari ke-2 dari 4" actions={<IconButton icon={Bell} label="Notifikasi, 3 belum dibaca" badge={3} href="#bilah" />} /></div>
      </Group>
      <Group label="BottomNav (Beranda aktif, lencana; Momen aktif)">
        <BottomNav current="beranda" badges={{ momen: 3, saya: "dot" }} className={css.navStatic} />
        <BottomNav current="momen" className={css.navStatic} />
      </Group>
      <Group label="ActionBar · catatan + tombol">
        <div className={css.bleed}><ActionBar note="Absen dibuka 30 menit sebelum sesi."><Button block>Absen</Button><Button variant="text" block>Masukkan kode</Button></ActionBar></div>
      </Group>
    </Col>

    <Sheet open={sheet} onClose={() => setSheet(false)} title="Ubah jam" subtitle="Team building · Sel, 5 Jan"
      footer={<Button block onClick={() => { setSheet(false); toast.show({ text: "Jam disimpan · peserta dikabari", tone: "success" }); }}>Simpan</Button>}>
      <Text color="2">Jam baru langsung tampil di Agenda semua peserta.</Text>
      <List inset={16}><ListRow title="Mulai" value="13.30" /><ListRow title="Selesai" value="15.00" /></List>
      <SwitchRow title="Kabari peserta" sub="Kirim notifikasi ke 120 peserta" checked={notify} onChange={setNotify} />
    </Sheet>

    <Sheet open={picker} onClose={() => setPicker(false)} title="Pilih sesi" flush>
      <List plain inset={16} label="Sesi">
        {["Semua sesi", "Sarapan", "Pemaparan departemen", "Team building"].map(name => <ListRow key={name} title={name}
          trailing={session === name ? <Check aria-hidden /> : undefined} chevron={false} aria-current={session === name ? "true" : undefined}
          onClick={() => { setSession(name); setPicker(false); }} />)}
      </List>
    </Sheet>

    <ConfirmDialog open={dialog === "danger"} tone="danger" title="Hapus foto ini?" body="Foto hilang dari Momen dan Mozaik." confirmLabel="Hapus foto"
      busy={busy} busyLabel="Menghapus…" onCancel={() => setDialog(null)}
      onConfirm={() => { setBusy(true); window.setTimeout(() => { setBusy(false); setDialog(null); toast.show({ text: "Foto dihapus", tone: "success" }); }, 1200); }} />
    <ConfirmDialog open={dialog === "primary"} title="Kirim kabar ke 120 peserta?" body="Jam Team building berubah jadi 13.30–15.00." confirmLabel="Kirim kabar"
      onCancel={() => setDialog(null)} onConfirm={() => { setDialog(null); toast.show({ text: "Kabar terkirim", tone: "success" }); }} />
  </div>;
}

