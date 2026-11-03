# Rancangan Pra WAM (menuju Werkudara Annual Meeting)

Status: rancangan, belum diimplementasikan. Sumber: `Presentasi_PraWAM_WAM_Referensi_Visual.pdf`
(6 slide konsep, data simulasi), 3 November 2026.

Desain utama ada di **Penpot** (design.penpot.app), project **PRAWAM**, file **PRAWAM**:
- Halaman `01 · Design system`: papan `DS · Fondasi` (warna, tipografi, bentuk, ikon, token) dan
  `DS · Komponen` (semua komponen `DS / …`). Token ada di panel Tokens, tema `Mode/Terang` dan `Mode/Gelap`.
- Halaman `02 · Layar`: P1 Beranda peserta, P2 Agenda saya, P3 Detail sesi, K1 Beranda panitia,
  K2 Tinjau permintaan, B1 Ringkasan BOD, M1 Akses MCP (desktop admin).

`docs/desain/pra-wam-mockup.html` adalah mockup awal (masih hijau); Penpot yang berlaku.

Catatan kerja Penpot MCP: tab Penpot harus tetap terlihat (tab di latar ditidurkan browser dan
sambungan putus), file hanya dibuka di satu tempat, dan plugin hanya bisa menyunting halaman yang
sedang dibuka.

## Tujuan

Pra WAM adalah rangkaian rapat persiapan menuju WAM, acara tahunan Werkudara. Aplikasi ini membantu
tiga pihak:

- **Peserta** tahu agenda pribadinya, membuka materi, check-in, mengajukan perubahan, mengisi survei.
- **Panitia** mengatur jadwal, menindaklanjuti permintaan, membagikan info, dan mencatat notulen (MoM).
- **BOD** melihat ringkasan: kehadiran, hasil survei, keputusan dan tindak lanjut rapat.

Fokus pertama: **Pra WAM**. WAM memakai fondasi yang sama dan menambah modul kamar dan tim.

## Yang dipelajari dari PDF referensi

| Slide | Isi | Masuk ke rancangan |
|---|---|---|
| 01 Konsep aplikasi | Tiga peran (Peserta, Panitia, BOD); dashboard 64 peserta / 52 hadir / 3 perlu keputusan | Peran & hak akses, beranda panitia |
| 02 Untuk peserta | Agenda saya + Scan QR absen, info kegiatan, kamar & tim, kebutuhan pribadi | Beranda & agenda peserta, profil |
| 03 Panitia & BOD | Prioritas tindakan, pairing kamar, cari peserta, kirim info | Beranda panitia |
| 04 Peserta & panitia | Detail sesi + upload materi + ajukan ganti jadwal; panitia setujui/tolak dengan cek bentrok; survei | Detail sesi, tinjau permintaan, survei |
| 05 Untuk BOD | Profil detail peserta (baca saja), hasil survei per departemen | Ringkasan BOD |
| 06 Koneksi MCP | ChatGPT/Claude membaca data aplikasi (peserta, agenda, absensi, survei, MoM), akses baca saja | Fase 3 |

Tambahan dari saya (tidak ada di PDF, perlu disetujui): **Notulen / MoM per sesi** sebagai modul inti
Pra WAM, karena Pra WAM adalah rapat dan MoM disebut sebagai sumber data di slide 06.

## Tema Hospitality

Hospitality dipakai sebagai cara melayani, bukan hiasan. Tiga prinsip:

1. **Disambut.** Peserta dibuka dengan sapaan dan satu hal terpenting saat itu (sesi berikutnya).
2. **Dilayani.** Setiap permintaan punya status yang jelas, seperti meja resepsionis:
   diterima → ditinjau → selesai.
3. **Tidak dibuat bingung.** Satu tujuan per layar, bahasa sehari-hari, tidak ada istilah sistem.

Bahasa visual: kertas surat hotel. Putih porselen, **biru Werkudara sebagai satu-satunya warna
utama** (keputusan 3 Nov 2026), **kuningan sebagai aksen sekunder Hospitality** (garis tipis, kartu
kunci, sorotan, tombol Concierge). Judul memakai huruf berkait (Lora) untuk sapaan dan judul halaman.
Teks lain memakai Nunito seperti seluruh Journey. Motif yang dipakai sebagai isi, bukan ornamen:

- Kartu kamar berbentuk **kartu kunci** (nomor kamar besar). Muncul di WAM.
- Agenda tampil sebagai **itinerary** (kolom jam di kiri).
- Bantuan panitia bernama **Concierge** (tanya, ajukan perubahan, laporkan kendala).

Token warna (sumber: token Penpot `Hospitality/Terang` dan `Hospitality/Gelap`; nanti tema
`hospitality` di `src/lib/themes.ts`, corners `soft`):

| Token | Terang | Gelap |
|---|---|---|
| color.bg.app / surface | `#FAFAF7` / `#FFFFFF` | `#0E1218` / `#161C24` |
| color.surface-soft / line | `#EAF0F8` / `#DDE3EA` | `#1D2530` / `#2A3340` |
| color.text / text-muted | `#1E2733` / `#5B6573` | `#E8ECF2` / `#9AA4B2` |
| color.primary (biru Werkudara) | `#1551A0` (hover `#0F3F80`) | `#8DB6F2` (teks gelap di atasnya) |
| color.hero (kartu utama) | `#1551A0` | `#17345F` |
| color.secondary (kuningan) | `#A9813F`, garis `#D6BF92` | `#D9BE8A` |
| color.secondary-soft / on-secondary-soft | `#F6EEDD` / `#6E5321` | `#2E2616` / `#E8D3A8` |
| success / warning / danger | `#2E7D4F` / `#8F5600` / `#9A273D` | `#7BCB98` / `#E8B566` / `#F2A0AE` |

Token dasar: radius 8/12/16/18/24/pill, spasi kelipatan 4, target sentuh 44, tombol 48, ikon 20/16,
layar 390 × 844, huruf Lora (display) + Nunito (isi), ukuran 40/28/25/21/17/15/14/13/12/11.

Kuningan di atas putih kontrasnya di bawah 4,5:1, jadi tidak dipakai untuk teks kecil; teks di atas
kuningan lembut memakai `#6E5321`. Status selalu memakai ikon + teks, tidak hanya warna.

## Peran dan hak akses

| Data | Peserta | Panitia | BOD |
|---|---|---|---|
| Agenda & sesi | Miliknya | Semua, ubah | Semua, baca |
| Materi | Baca, unggah ke sesinya | Semua | Baca |
| Check-in | Diri sendiri (QR) | Pindai & koreksi | Rekap |
| Permintaan ganti jadwal | Ajukan, lihat status | Setujui / tolak | Rekap |
| Notulen (MoM) | Baca setelah dibagikan | Tulis, bagikan | Baca semua |
| Profil & kebutuhan | Miliknya, ubah | Yang diperlukan untuk pengaturan | Baca (sesuai izin peserta) |
| Survei | Isi | Buat, lihat hasil | Lihat hasil |
| Kamar & tim (WAM) | Miliknya | Atur | Baca |

Profil berisi data pribadi (alergi, tidur, MBTI). Peserta melihat sendiri apa yang dibagikan ke BOD,
dan bisa menyembunyikan isian non-operasional (hobi, MBTI, warna favorit).

## Modul

| Modul | Pra WAM | WAM | Fondasi Journey yang dipakai ulang |
|---|---|---|---|
| Agenda per sesi | Ya | Ya | `agenda`, zona waktu event |
| Lokasi & ruang | Ya | Ya | `location`, Panduan lokasi |
| Check-in QR | Ya | Ya | `event_tickets`, `/admin/checkin` |
| Materi sesi | Ya | Ya | Unggah foto/dokumen (baru: dokumen) |
| Permintaan ganti jadwal | Ya | Ya | Baru |
| Notulen / MoM | Ya | Opsional | Baru |
| Pengumuman / info | Ya | Ya | Baru (notifikasi di halaman) |
| Survei | Ya | Ya | `feedback` (diperluas: pilihan ganda) |
| Profil & kebutuhan | Ya | Ya | `rsvp_needs` (diet, akses) diperluas |
| Kamar & tim | Tidak | Ya | Baru |
| Ringkasan BOD | Ya | Ya | Baru |

## Alur utama

**Peserta**: buka tautan pribadi → Beranda (sapaan + sesi berikutnya) → Check-in di ruang → buka
materi → setelah sesi: baca MoM, isi survei. Perlu pindah jam: Detail sesi → Ajukan ganti jadwal →
status tampil di Beranda sampai diputuskan.

**Panitia**: Beranda panitia (prioritas tindakan) → tinjau permintaan (semula vs usulan, cek bentrok
ruang & peserta) → Setujui / Tolak dengan konfirmasi → agenda peserta terkait ikut berubah dan mereka
mendapat info. Selama sesi: tulis MoM (keputusan, tindak lanjut + PIC + tenggat) → bagikan.

**BOD**: Ringkasan (kehadiran, survei, tindak lanjut terbuka per departemen) → buka sesi atau profil
peserta (baca saja).

## Layar (lihat mockup)

Peserta: Beranda · Agenda saya · Detail sesi · Ajukan ganti jadwal · Profil & kebutuhan · Survei
Panitia: Beranda panitia · Tinjau permintaan · Notulen sesi
BOD: Ringkasan · Profil peserta
WAM (fondasi sama): Kartu kamar & tim

## Fondasi teknis (usulan)

Mengikuti pola **sub khusus** Journey (seperti Friday Sharing): satu acara biasa di Supabase dengan
alamat tetap, rute tamu `/pra-wam`, admin `admin/pra-wam`, alamat diatur di `src/lib/routes.ts`.
Peserta masuk lewat **tautan pribadi** (`event_invitations`), tanpa kata sandi. Panitia memakai login
admin yang ada. BOD butuh peran baru "baca saja".

Tabel baru (perkiraan, belum final): `wam_sessions` (sesi + peserta sesi), `wam_change_requests`,
`wam_minutes` + `wam_action_items`, `wam_announcements`, `wam_profiles`, `wam_surveys` +
`wam_survey_answers`, nanti `wam_rooms` + `wam_teams` untuk WAM. Semua lewat server (service role),
sama seperti tabel Journey lain.

## MCP untuk atasan (tetap masuk cakupan)

Atasan dan tim terpilih menyambungkan Claude atau ChatGPT ke data Pra WAM lewat MCP, untuk analisis
langsung dan pemantauan admin. Layar M1 (panel admin desktop) mengatur:

- **Siapa yang punya akses**: kunci pribadi per orang, lewat Claude/ChatGPT, cakupan data, terakhir
  dipakai, status, tombol Cabut/Pulihkan.
- **Pertanyaan terbaru**: log setiap pertanyaan beserta data yang dibaca.
- **Contoh analisis**: mis. "Apa masalah yang berulang dari seluruh MoM Pra WAM?" dengan temuan dan
  rujukan dokumen. Hasil ditinjau tim sebelum menjadi laporan resmi.
- **Pemantauan admin**: permintaan menunggu, tindak lanjut lewat tenggat, kehadiran.

Aturan: akses hanya baca; setiap orang memakai kunci sendiri; semua pertanyaan tercatat; profil
pribadi (alergi, tidur, MBTI) tidak terbaca kecuali peserta mengizinkan.

## Tahapan

1. **Fase 1, Pra WAM inti**: tema Hospitality, tautan pribadi, agenda & detail sesi, check-in QR,
   materi, pengumuman, beranda panitia, kelola agenda.
2. **Fase 2, Pra WAM lengkap**: permintaan ganti jadwal + cek bentrok, notulen & tindak lanjut,
   survei, profil & kebutuhan, ringkasan BOD.
3. **Fase 3, WAM**: kamar & tim (pairing), lalu koneksi MCP baca saja untuk tim yang diberi izin.

## Pertanyaan terbuka

1. Kapan Pra WAM dan WAM berlangsung? Berapa kali rapat Pra WAM, dan apakah per departemen?
2. Apakah Pra WAM juga menginap (ada kamar), atau kamar hanya untuk WAM?
3. Berapa peserta dan departemen? Siapa saja BOD?
4. Siapa yang menulis MoM: panitia, atau notulis per departemen?
5. Isian profil mana yang wajib, dan apakah BOD boleh melihat semuanya?
6. "Hospitality" adalah tema resmi WAM tahun ini, atau hanya arah visual aplikasi?
7. Perlu versi bahasa Inggris?

## Di luar cakupan (sekarang)

- Notifikasi WhatsApp/email otomatis (fase awal cukup info di aplikasi).
- Koneksi MCP sampai fase 3; akses awal hanya baca, hasil ditinjau tim sebelum jadi laporan resmi.
