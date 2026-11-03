# Rancangan Pra WAM & WAM (Werkudara Annual Meeting)

Status: rancangan, belum diimplementasikan. Diperbarui 3 November 2026.

Sumber, urut dari yang paling mengikat:
1. `Acuan_Eksekusi_Aplikasi_PraWAM_WAM_UseCase_ERD.pdf` (2 Nov 2026): use case, alur, contoh layar,
   ERD, aturan implementasi. **Ini pegangan tim**; rancangan ini mengikutinya.
2. `Kalender_PraWAM_WAM_Okt2026_Jan2027.pdf`: tanggal forum dan tenggat (dari
   `Timeline_Rencana_Kerja_2027_Revisi_WAM_4-7_Jan.xlsx`, sheet Timeline).
3. `2026 - Data karyawan per-2026.xlsx`: jumlah dan sebaran karyawan (dipakai hanya untuk ukuran
   data dan nama departemen; nama orang di desain tetap simulasi).
4. `Presentasi_PraWAM_WAM_Referensi_Visual.pdf`: konsep visual awal dan koneksi MCP.

Desain ada di **Penpot** (design.penpot.app), project **PRAWAM**, file **PRAWAM**:
- `01 · Design system`: papan `DS · Fondasi` (warna, tipografi, bentuk, ikon, token) dan
  `DS · Komponen`. Token di panel Tokens, tema `Mode/Terang` dan `Mode/Gelap`.
- `02 · Semua layar (arsip)`: semua layar dalam satu halaman (lihat bagian Layar).
- Prototipe per peran, masing-masing halaman sendiri dengan urutan dan alurnya sendiri
  (keputusan 3 Nov 2026):
  - `03 · Peserta (ponsel)`: 13 layar (tanpa pengalih acara WAM), alur "Peserta (ponsel)".
  - `04 · Panitia`: 8 layar desktop + 3 layar ponsel (pairing kamar WAM dikeluarkan), alur
    "Panitia (desktop)" dan "Panitia (ponsel)".
  - `05 · BOD`: 6 layar; Ringkasan BOD paling lengkap (Perlu perhatian, Akses cepat, Tanya data
    MCP), alur "BOD (ponsel)" dan "BOD (desktop)".
  - Semua layar Masuk memakai logo pegasus Werkudara dan satu layar Masuk yang sama untuk semua
    peran.
  - `06 · Admin`: Masuk → Pusat pengaturan → Acara & modul → Akun & akses → Unit & lead → Izin MCP,
    alur "Admin". Pusat pengaturan merangkum semua yang bisa diatur admin.
  - Setiap halaman peran dibuka dengan papan **`00 · Panduan · <peran>`** di paling atas: tujuan
    peran, daftar fungsi dengan nomor layar, alur langkah demi langkah, cara mencoba prototipe, dan
    aturan penting. Panduan ini bacaan pertama untuk atasan dan tim.

`docs/desain/pra-wam-mockup.html` adalah mockup awal (masih hijau, sebelum acuan eksekusi); Penpot
yang berlaku.

Catatan kerja Penpot MCP: buka Penpot di panel browser Claude (tab latar ditidurkan browser), file
hanya dibuka di satu tempat, dan plugin hanya bisa menyunting halaman yang sedang dibuka.

## Tujuan

Satu aplikasi internal untuk dua acara: **Pra WAM** (rangkaian forum November–Desember 2026) dan
**WAM 2027** (4–7 Januari 2027). Mobile adalah tampilan utama peserta dan BOD; panitia bekerja
utamanya di desktop dan memakai mobile di lapangan.

- **Peserta**: agenda personal, info acara, dokumen dan jadwal, absen QR, survei, profil sederhana.
- **Panitia**: kelola peserta, sesi, pairing kamar/tim, dokumen, permintaan jadwal, survei,
  pengumuman, pengaturan; pantau kesiapan.
- **BOD**: ringkasan acara dan partisipasi, profil detail peserta (infografis), hasil survei.
  Hanya baca. Kalau BOD juga peserta, hak pribadinya sebagai peserta tetap berlaku.

Batas utama: panitia mengelola **data acara**, tetapi **tidak mengedit master personal**. Perubahan
profil sederhana disimpan terpisah dari master.

## Data nyata yang membentuk desain

**Karyawan (per 2026):** 57 orang, 12 departemen, 3 kantor/entitas (WNS, TEE, MRP).

| Departemen | Orang | Departemen | Orang |
|---|---|---|---|
| Sales & Marketing | 18 | Accounting | 4 |
| Center of Excellence | 6 | Corporate | 3 |
| Takshaka Event & Experience | 4 | Corporate Finance Controller | 3 |
| Strategic Sourcing | 4 | Art & Creative Support | 3 |
| Business Operations | 4 | Business & Administrative Services | 2 |
| Human Resources & General Affair | 4 | Maha Raja Pratama | 2 |

Kolom sumber: nama karyawan, nama panggilan, gender, department, position, office. Tidak ada nomor
karyawan atau email, jadi `employee_no` dan `auth_subject` belum bisa diisi dari file ini.

Desain memakai **57 peserta** dan nama departemen di atas. Nama orang (Nadia Putri, Maya Pratama, dst.)
tetap simulasi.

**Kalender (tanpa jam di sumber):**

| Tanggal | Agenda | Jenis |
|---|---|---|
| 6 Nov | Tema & anggaran acara | Panitia |
| 9–10 Nov | Review data departemen | Data |
| 11–12 Nov | Rekonsiliasi ACC | Keuangan |
| 13 Nov | Meeting biaya & budget | Keuangan |
| 24–27 Nov | HOD Meeting (*tanggal perlu konfirmasi; Roadmap menyebut 26–27 Nov*) | Forum |
| 24–27 Nov | CSM & prioritas CAPEX | Keuangan |
| 24 Nov–4 Des | Revenue Sync & RSM | Keuangan |
| 30 Nov–4 Des | Pengajuan & arahan BOD | Forum |
| 7–9 Des | Internal Dept Meeting | Forum |
| 10–11 Des | ITEM: antar-departemen | Forum |
| 14–16 Des | ITAM: BOD x departemen | Forum |
| 16 Des | Realisasi budget 2026 | Keuangan |
| 22–23 Des | Finalisasi laporan & materi WAM | Data |
| 29 Des | End Year Dinner | Acara |
| 4–7 Jan 2027 | **WAM 2027**: pemaparan, penetapan komitmen, awarding | Acara |

Tenggat: budget & evaluasi departemen 13 Nov; data departemen 16 Nov; data freeze, bahan HOD,
appraisal 20 Nov; teknis panitia dan final laporan/materi 23 Des.

Yang belum ada di sumber: tanggal forum "Pra WAM" tersendiri (`#REF!` di Roadmap), jam setiap
rapat, rundown WAM per hari, lokasi, dan deadline per seksi panitia.

## Nama dan wording (keputusan 3 Nov 2026)

- Nama aplikasi: **Pra WAM** (nanti berganti menjadi WAM saat acaranya tiba).
- Kalimat pendamping di layar Masuk dan materi ke atasan: **"Satu aplikasi untuk setiap langkah
  menuju WAM 2027"**.
- Teks kecil di bawah layar Masuk ponsel: "Tampilan menyesuaikan peran Anda". Desktop: "Gunakan email
  dan password akun Werkudara Anda."
- Logo: pegasus Werkudara (`werkudara_icon.png`).

## Tema Hospitality

Hospitality dipakai sebagai cara melayani, bukan hiasan:

1. **Disambut.** Beranda dibuka dengan sapaan dan satu hal terpenting saat itu (sesi berlangsung atau
   berikutnya).
2. **Dilayani.** Setiap permintaan punya status jelas: diajukan → disetujui / ditolak.
3. **Tidak dibuat bingung.** Satu tujuan per layar, bahasa sehari-hari.

Bahasa visual: kertas surat hotel. Putih porselen, **biru Werkudara satu-satunya warna utama**,
**kuningan sebagai aksen sekunder Hospitality** (garis tipis, kartu kunci kamar, sorotan, tombol
Concierge). Lora untuk sapaan dan judul, Nunito untuk teks lain. Motif sebagai isi: kartu kamar
berbentuk kartu kunci (WAM), agenda sebagai itinerary, kartu **Concierge** di Beranda untuk menghubungi
panitia (bukan tab; tab peserta mengikuti acuan).

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
Kuningan tidak dipakai untuk teks kecil di atas putih; teks di atas kuningan lembut memakai `#6E5321`.

## Peran dan hak akses (acuan halaman 01 dan 09)

Satu orang bisa punya beberapa peran per acara (`member_roles`: peserta / panitia / bod).
Backend yang membatasi akses, bukan hanya tampilan.

| Data | Peserta | Panitia | BOD |
|---|---|---|---|
| Agenda & sesi | Sesi tempat ia terdaftar + info umum | Semua, kelola | Semua, baca |
| Dokumen | Dokumen umum acara + dokumen sesinya; unggah ke sesinya | Semua | Baca |
| Absensi | Scan QR sesi sendiri | Cetak QR sesi, lihat dan koreksi absensi | Rekap |
| Permintaan jadwal | Ajukan, lihat status | Periksa bentrok, setujui / tolak | Rekap |
| Profil | Master (baca) + profil acara miliknya (ubah field yang diizinkan) | Data operasional peserta; tidak mengubah master | Profil detail sampai data personal (infografis) |
| Pairing kamar / tim | Miliknya setelah terbit | Atur manual dengan filter profil | Baca |
| Survei | Isi sesuai penugasan | Buat, terbitkan, lihat hasil | Lihat hasil |
| Pengumuman | Terima | Buat, kirim | Terima |
| Master personal | Baca miliknya | Baca saja | Baca |

## Alur kerja (acuan halaman 02)

1. **Persiapan.** Panitia membuat acara, sesi, dan daftar peserta → peserta login, memeriksa profil,
   mengonfirmasi kebutuhan → panitia mengatur pairing dan menerbitkan agenda.
2. **Ganti jadwal.** Peserta mengajukan waktu baru + alasan → panitia memeriksa bentrok waktu, ruang,
   dan peserta → setujui atau tolak. Status: **diajukan / disetujui / ditolak**. Jadwal hanya berubah
   kalau disetujui; setelah itu notifikasi ke **seluruh peserta sesi terdampak**.
3. **Saat acara.** Setiap sesi punya **QR statis** yang dibuat otomatis saat sesi terbit dan dicetak
   panitia dari menu Cetak QR absen (A5, bisa banyak sesi sekaligus), lalu ditempel di ruang
   (keputusan pemilik, 3 Nov 2026; menggantikan QR di layar yang berganti di acuan). Peserta absen
   sendiri: login → scan → sistem memeriksa bahwa ia peserta sesi itu dan waktunya dalam jendela absen
   (**30 menit sebelum mulai sampai 30 menit setelah selesai**, keputusan pemilik 3 Nov 2026), menyimpan **satu absensi per
   peserta per sesi**, menampilkan konfirmasi. Di luar jendela tampil "Absen belum dibuka".
   Catatan risiko: QR statis bisa difoto dan dibagikan, jadi orang bisa absen tanpa hadir. Penahan yang
   ada: wajib login, hanya peserta sesi, dan jendela waktu. Penahan tambahan bila perlu nanti: cek
   jaringan Wi-Fi kantor atau lokasi, atau panitia menandai yang tidak hadir.
4. **Evaluasi.** Panitia menerbitkan survei acara atau sesi → peserta mengirim jawaban → BOD dan
   panitia melihat ringkasan kehadiran, profil, dan hasil survei.

Highlight pribadi di Beranda: sesi yang diikuti, waktu terdekat, kamar/tim, dokumen relevan,
permintaan jadwal, survei, dan status absen. Semua mengikuti akun yang login.

## Masuk: satu akun, email + password (keputusan 3 Nov 2026)

- Satu akun per orang untuk **Pra WAM dan WAM**; sekali masuk, sesi tetap aktif di perangkat itu.
- Masuk dengan **email + password** yang disimpan di sistem Journey.
- **Format email awal: nama panggilan + `@werkudara.com`** (huruf kecil, tanpa spasi), mis.
  `yulia@werkudara.com`. Dari data karyawan 2026: 57 email, tidak ada yang bentrok. Email bisa
  diubah **super admin**.
- **Password awal sama untuk semua akun** (keputusan pemilik, 3 Nov 2026). Nilainya dibagikan
  terpisah dan disimpan sebagai pengaturan server, **tidak ditulis di repo atau dokumen ini**.
  Setiap orang menggantinya di Pengaturan akun.
- Layar "Buat password baru" (A2) muncul saat pertama masuk tetapi **bisa dilewati** ("Lewati, atur
  nanti"); password diganti kapan saja di Pengaturan akun (keputusan pemilik, 3 Nov 2026). Ada
  "Lupa password" yang mengirim tautan reset ke email. Catatan risiko: selama password awal yang
  seragam belum diganti, siapa pun yang tahu email seseorang bisa masuk ke akunnya; super admin bisa
  memantau siapa yang masih memakai password awal (D5).
- Draf daftar akun: `Downloads\Draf_Akun_PraWAM_WAM.xlsx` (sheet Akun, Unit, Catatan). Berisi data
  pribadi, jadi tidak masuk repo.
- **Fakta saat ini:** login admin Journey (`src/app/api/auth/login/route.ts`) hanya memakai satu
  password bersama (peran admin/super), tanpa email per orang, dan `staff_members` tidak menyimpan
  email. Jadi akun per orang (email + password, peran per acara) adalah **fitur baru** di Journey,
  dan daftar email karyawan perlu disiapkan karena file data karyawan belum memuatnya.

## Fokus sekarang: prototipe Pra WAM untuk review atasan (keputusan 3 Nov 2026)

Fokus desain dan prototipe adalah **Pra WAM**, digambar sedetail mungkin dan bisa diklik di Penpot
(View mode) supaya atasan bisa mencoba alurnya lewat tautan bagikan. **WAM disembunyikan dari
prototipe** peserta, panitia, dan BOD (tanpa pengalih acara, tanpa pairing kamar); WAM hanya
muncul di Admin → Acara & modul sebagai acara "disiapkan". Fondasi data tetap siap dipakai WAM.

## Satu login, tampilan sesuai jabatan (keputusan 3 Nov 2026)

Semua orang masuk lewat **layar Masuk yang sama** (email + password). Setelah masuk, aplikasi
menyusun tampilan dari peran dan jabatan orang itu:

| Peran | Yang tampil setelah masuk |
|---|---|
| Peserta | Beranda pribadi: agenda, absen QR, dokumen, survei, profil |
| Lead unit | Seperti peserta, ditambah ringkasan unit yang ia pimpin (kehadiran, permintaan jadwal, bahan forum) |
| Panitia | Dashboard panitia: sesi, ruang, QR, peserta, pengumuman, survei |
| BOD | **Tampilan paling lengkap**: ringkasan seluruh unit dan BU, hal yang perlu perhatian BOD, profil semua peserta, hasil survei, akses MCP, dan bisa membuka dashboard panitia dalam mode baca |
| Admin | Pusat pengaturan |

Orang dengan beberapa peran (mis. peserta sekaligus lead dan panitia) mendapat satu Beranda yang
menggabungkan semuanya, dengan menu tambahan sesuai perannya; tidak perlu akun atau login kedua.
BOD punya jangkauan lihat paling luas, tetapi tetap tidak mengubah data acara (mengikuti acuan).
Antarmuka BOD dibuat paling ringkas: angka penting di atas, satu ketukan ke rincian.

## Satu aplikasi, dua versi acara: Pra WAM dan WAM (keputusan 3 Nov 2026)

Aplikasinya satu, acaranya dua (`events`: Pra WAM dan WAM 2027). Akun, profil,
departemen/BU, dokumen, dan riwayat absen Pra WAM **terbawa** ke WAM tanpa diisi ulang. Pengguna
berpindah lewat **pengalih acara** di bilah atas (Pra WAM · WAM 2027); aplikasi membuka acara yang
sedang berjalan secara otomatis. Modul yang aktif per acara diatur di pengaturan acara (mis. pairing
kamar hanya di WAM).

## Departemen, BU, jabatan, dan lead (keputusan 3 Nov 2026)

Setiap karyawan punya **departemen utama dan BU utama** dari data karyawan (BU dari kolom kantor:
WNS 51, TEE 4, MRP 2), tetapi satu orang bisa **tercatat di beberapa unit dengan jabatan berbeda**
di tiap unit. Satu baris ditandai *utama* per jenis unit; baris tambahan diatur super admin. Contoh
lead di lebih dari satu unit:

| Orang | Tanggung jawab |
|---|---|
| Yulia | Lead departemen Business & Administrative Services (BAS) dan lead BU MRP |
| Sofyan | Lead departemen Center of Excellence (CoE) dan Art & Creative Support (ACS) |

Lead unit lain belum ditentukan. Lead melihat ringkasan unitnya (kehadiran, kelengkapan profil,
permintaan jadwal, bahan forum). Usulan data: `org_units` (jenis departemen/BU, nama, kode) dan
`unit_members` (employee_id, unit_id, `job_title`, `is_lead`, `is_primary`), banyak-ke-banyak,
satu baris utama per jenis unit. Diatur super admin. Ringkasan per unit menghitung orang sekali
walaupun ia tercatat di beberapa unit.

Data karyawan versi perbaikan: `Downloads\Data_Karyawan_PraWAM_v2.xlsx` (tidak masuk repo karena
berisi data pribadi). Isinya: sheet Karyawan (NIP kosong, nama dan jabatan dirapikan, email, usulan
peran), Unit dan jabatan (118 baris), Unit, Perbaikan (4 salah ketik jabatan dan 2 spasi di nama
panggilan), dan Catatan.

**BOD (dikonfirmasi pemilik, 3 Nov 2026):** Pak Fadli (Fadli Fahmi Ali, Chief Executive Officer) dan
Pak Bagus (I Gusti Putu Yaktianuraga, Managing Director), keduanya Corporate · WNS. Keduanya juga
tetap peserta. Super admin dan panitia belum ditentukan.

## Super admin

Super admin mengelola **akun dan akses**: NIP, email, reset password ke awal, peran per acara
(peserta, panitia, BOD), unit dan jabatan (bisa lebih dari satu), dan izin MCP. Semua perubahan
tercatat di `audit_logs`.

## Data personalisasi: ditunda (keputusan 3 Nov 2026)

Form personalisasi di awal dan semua data preferensi pribadi (alergi, pantangan, AC, tidur, hobi,
olahraga, warna favorit, MBTI) **dihapus dulu** dari desain dan cakupan. Profil peserta sekarang hanya
berisi data akun: nama lengkap dan departemen/BU (dari data karyawan, terkunci), nama panggilan,
email (diatur super admin), dan ganti password. Akibatnya:

- BOD melihat profil peserta tanpa infografis personal: unit, jabatan, kehadiran, kamar/tim.
- Pairing kamar dan tim di WAM dilakukan manual oleh panitia tanpa filter preferensi.
- Field `event_profile` JSON dan daftar field tervalidasi di acuan (halaman 09) belum dipakai.

Rancangan form 4 langkah (data saya, makanan, kamar dan tidur, tentang saya; chip, bisa dilewati)
bisa dikembalikan nanti kalau personalisasi dibuka lagi.

## Pemilihan ruang meeting: khusus panitia (keputusan 3 Nov 2026)

Fitur ruang **hanya ada di panitia**. Panitia memilih ruang lewat **denah**: ruang berwarna sesuai
ketersediaan pada tanggal dan jam yang dipilih (kosong / terpakai / terlalu kecil / dipilih), lengkap
dengan kapasitas, fasilitas, dan jadwal ruang. Memilih ruang langsung mengecek bentrok, lalu sesi
tersimpan dengan ruang itu. Peserta dan BOD hanya melihat **nama ruang** di agenda dan detail sesi,
tanpa denah. Nama dan denah ruang di desain masih simulasi. Usulan data: tabel `rooms` (nama,
lantai, kapasitas, fasilitas, posisi di denah) dan `sessions.room_id`.

## Akses MCP hanya untuk akun tertentu (keputusan 3 Nov 2026)

Menu dan halaman Akses MCP **hanya tampil untuk akun yang diberi izin**, bukan untuk semua panitia.
Pemilik izin melihat kartu "Akses MCP" di halaman Akun (kunci pribadi, cara menyambungkan ke Claude
atau ChatGPT, riwayat pemakaian). Pemberian dan pencabutan izin dilakukan pengelola akses (usulan:
super admin). Usulan data: `member_permissions` atau kolom izin per akun, plus `mcp_keys` (hash
kunci, cakupan, dicabut_at) dan pencatatan ke `audit_logs`.

## Navigasi (acuan halaman 03–06)

| Peran | Perangkat | Navigasi |
|---|---|---|
| Peserta | Mobile | Beranda · Agenda · Dokumen · Profil |
| Peserta | Desktop | Bilah atas: Beranda · Agenda · Dokumen · Profil, pengalih acara, akun |
| BOD | Desktop | Bilah atas: Ringkasan · Peserta · Survei · Akun, pengalih acara |
| Panitia | Desktop | Dashboard · Peserta & profil · Jadwal sesi · Pairing kamar/tim · Dokumen meeting · Permintaan jadwal · Survei · Pengumuman · Pengaturan · (Master personal, baca saja). Akses MCP hanya untuk akun berizin |
| Panitia | Mobile | Beranda · Peserta · Jadwal · Lainnya |
| BOD | Mobile | Ringkasan · Peserta · Survei · Akun |

## Layar

Penpot halaman `02 · Layar`, diurutkan sesuai alur dari masuk sampai akses khusus (data simulasi
Kamis 26 Nov 2026). Nomor urut ada di nama layar, mis. `01 · A1 · Masuk`.

| Baris | No | Layar |
|---|---|---|
| 1 · Masuk | 01–03 | A1 Masuk (ponsel, login sederhana) · A2 Buat password baru (bisa dilewati) · E0 Masuk (desktop) |
| 2 · Peserta · ponsel | 04–15 | P1 Beranda · P11 Notifikasi · P7 Pengalih acara · P2 Agenda · P3 Detail sesi · P9 Ajukan ganti jadwal · P12 Scan QR · P5 Absen tercatat · P13 Absen belum dibuka · P8 Dokumen · P10 Isi survei · P4 Profil dan pengaturan |
| 3 · Peserta · desktop | 16–17 | E1 Beranda · E2 Agenda dan detail sesi |
| 4 · Panitia · ponsel | 18–21 | K1 Beranda · K2 Tinjau permintaan · K4 Lainnya · K3 Pairing kamar (disiapkan untuk WAM) |
| 5 · Panitia · desktop | 22–29 | D1 Ringkasan operasional · D6 Peserta & profil · D7 Buat sesi · D4 Pilih ruang lewat denah · D2 Cetak QR absen (QR statis per sesi, pratinjau A5) · D8 Pengumuman · D9 Survei · D10 Pengaturan acara (modul Pra WAM / WAM) |
| 6 · BOD | 30–34 | B1 Ringkasan · B2 Profil peserta · B4 Hasil survei · B3 Akun (kartu MCP) · E3 Ringkasan (desktop) |
| 7 · Akses khusus | 35–37 | D3 Akses MCP (hanya akun berizin) · D5 Akun & akses · D11 Unit & lead (super admin) |

Prototipe: layar dihubungkan dengan interaksi klik di Penpot (tombol utama, tab navigasi, tombol
kembali). Untuk dicoba atau direview, buka halaman peran (03–06), lalu View mode → pilih alur.
Bagikan lewat Share → Get link. Halaman 02 hanya arsip gabungan.

Admin (halaman 06) memiliki **Pusat pengaturan** yang merangkum semua yang bisa diatur: acara dan
modul, absen QR, akun dan password, peran per acara, unit dan lead, izin MCP, data karyawan, ruang
dan denah (belum digambar), dan log audit (belum digambar). Menu "Pengaturan" dikeluarkan dari
sidebar panitia; pengaturan acara sekarang wewenang admin.

Dihapus 3 Nov 2026: A3–A5 (form personalisasi) dan P6 (denah lokasi untuk peserta).
Belum digambar: kelola dokumen dan daftar permintaan jadwal versi desktop panitia, log audit,
dan beranda versi WAM (rundown 4 hari).

## Database (acuan halaman 07–08)

Model acara: **Pra WAM dan WAM masing-masing satu baris `events`**; setiap rapat atau aktivitas menjadi
`sessions`.

- Inti: `employees` (master, baca saja; **`nip` boleh kosong dulu**, unik bila terisi, menggantikan
  `employee_no` di acuan; `email` unik, bisa diubah super admin), `org_units`, `unit_members`
  (unit dan jabatan ganda), `employee_profiles` (master personal_detail JSON),
  `events`, `event_members` (unik event+employee, `event_profile` JSON, status, confirmed_at),
  `member_roles`, `sessions` (qr_token_hash statis per sesi; jendela absen dari jam sesi, bukan qr_expires_at), `session_participants` (dasar agenda dan
  akses dokumen), `groups` (kamar/tim/aktivitas, kapasitas), `group_members`.
- Fitur: `documents` (sesi kosong = dokumen umum), `schedule_requests`, `attendance`
  (unik sesi+member), `announcements`, `notification_receipts`, `audit_logs`, `surveys`,
  `survey_questions`, `survey_responses` (unik survei+member), `survey_answers`.
- Field profil tervalidasi: `allergies[]`, `hobbies[]`, `sports[]`, `favorite_color`,
  `ac_preference`, `snoring`, `noise_tolerance`, `mbti`.

## Aturan dan kriteria selesai (acuan halaman 09)

- Master terpisah: aplikasi membaca master tanpa mengubahnya. Profil acara = salinan master yang
  dikonfirmasi peserta; edit tersimpan di `event_profile` dan **memicu review pairing**.
- Relasi operasional harus dalam acara yang sama. Saat menyetujui jadwal, cek ulang bentrok dan pastikan
  jadwal awal belum diubah orang lain.
- Kapasitas grup dibatasi; satu kamar aktif per peserta dalam cakupan menginap yang sama.
- Satu respons per orang per survei; jawaban wajib sesuai tipe pertanyaan.
- Scan QR berulang tidak menggandakan absensi; QR dan peserta harus valid.
- Izin dicek saat unggah dan unduh dokumen. Angka dashboard dari data aktual.
- Persetujuan jadwal memperbarui sesi, mencatat `audit_logs`, dan mengirim notifikasi.

## MCP untuk atasan (tetap masuk cakupan)

Dari presentasi visual (slide 06), tidak ada di acuan eksekusi. Atasan dan tim terpilih menyambungkan
Claude atau ChatGPT ke data aplikasi lewat MCP untuk analisis dan pemantauan. Layar admin "Akses MCP":

- Siapa yang punya akses: kunci pribadi per orang, lewat Claude/ChatGPT, cakupan data, terakhir
  dipakai, status, Cabut/Pulihkan.
- Pertanyaan terbaru: log setiap pertanyaan beserta data yang dibaca (masuk `audit_logs`).
- Contoh analisis dengan rujukan dokumen; hasil ditinjau tim sebelum jadi laporan resmi.
- Pemantauan admin: permintaan menunggu, tenggat, kehadiran.

Aturan usulan: akses hanya baca; kunci per orang; semua pertanyaan tercatat; cakupan data diatur per
orang (profil personal hanya untuk yang diberi cakupan itu).

## Usulan tambahan (di luar acuan, perlu disetujui)

- **Notulen / MoM per sesi** dengan keputusan dan tindak lanjut (PIC + tenggat). Bisa disimpan sebagai
  `documents` jenis MoM, atau tabel sendiri kalau tindak lanjut perlu dipantau.
- **Tenggat & rentang kerja** dari kalender (mis. batas data departemen 16 Nov) tampil di Beranda
  sebagai pengingat.
- **Kartu Concierge** di Beranda peserta untuk menghubungi panitia.

## Fondasi teknis (usulan)

Acuan memakai login (`auth_subject`), bukan tautan pribadi seperti undangan Journey. Usulan: modul
baru di repo Journey (Next.js + Supabase yang sama) dengan rute sendiri, tabel mengikuti ERD acuan,
dan akses lewat server seperti tabel Journey lain. Keputusan ini perlu disepakati dulu (lihat
pertanyaan).

## Tahapan

1. **Fase 1, Pra WAM inti**: login, master + profil acara, acara & sesi Pra WAM dari kalender, agenda
   personal, dokumen, pengumuman, dashboard panitia.
2. **Fase 2**: permintaan jadwal + cek bentrok, absensi QR, survei, dashboard dan profil BOD, audit log,
   Akses MCP baca saja.
3. **Fase 3, WAM (4–7 Jan)**: pairing kamar/tim manual dengan filter profil, kartu kamar, rundown WAM.

## Pertanyaan terbuka

1. Apakah email `panggilan@werkudara.com` memang kotak surat yang aktif (untuk "Lupa password")?
   Wajib ganti password awal saat pertama masuk? Siapa saja super admin?
2. Jam dan lokasi setiap forum, tanggal forum "Pra WAM" tersendiri, tanggal HOD Meeting (24–27 atau
   26–27 Nov), dan rundown WAM per hari.
3. Siapa saja panitia dan super admin? (BOD sudah: Pak Fadli dan Pak Bagus.)
4. Field profil mana yang boleh diedit peserta, dan siapa pengelola master personal?
5. Pra WAM menginap atau tidak? (menentukan apakah pairing kamar ada di Pra WAM)
6. Usulan tambahan (MoM, tenggat, Concierge) dipakai?
7. Aplikasi dibangun di dalam repo Journey atau terpisah?
8. Pemilihan tempat: dipakai panitia saat mengatur sesi, atau peserta juga bisa memesan ruang
   (mis. untuk 1-on-1)? Denah dan daftar ruang sebenarnya?

## Di luar cakupan (sekarang)

- Notifikasi WhatsApp/email otomatis (fase awal cukup notifikasi di aplikasi).
- Pairing otomatis (acuan: pairing awal manual).
- Mengubah master personal dari aplikasi.
