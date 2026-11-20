# Go-live untuk tim internal

Tujuan: versi baru (branch `feat/platform-lengkap`) online di `https://journey.werkudara.group` dan dipakai **tim Werkudara dulu**. Fitur lanjutan (pengumuman, kalender, tiket, galeri R2, Program, BEO) menyusul setelah tahap ini stabil.

## 0. Keadaan saat panduan ini ditulis (20 Okt 2026)

- Domain sudah online di Vercel dan menjalankan `main` lama (`e4a6029`).
- **Di versi lama, `/admin` terbuka tanpa login.** Siapa pun yang tahu alamatnya bisa melihat dan mengekspor data tamu. Versi baru menutup ini dengan login password.
- Versi baru ada di branch `feat/platform-lengkap` (belum di-push, sekitar 20 commit di atas `main`).
- Uji lokal terakhir: lint, typecheck, 338 tes, build, dan uji SQL semua migrasi di PostgreSQL sementara: **lulus**.

## 1. Database Supabase

Terapkan migrasi yang belum ada, **urut nama berkas**, lewat Supabase Dashboard → SQL Editor (salin seluruh isi berkas → Run). Setiap berkas dibungkus `begin … commit`.

| Berkas | Isi |
|---|---|
| `202610110001_personal_invitations.sql` | Undangan per tamu |
| `202610200001_admin_access_log.sql` | Log akses admin |
| `202610200002_event_timezones.sql` | Zona WIB/WITA/WIT |
| `202610200003_guest_operations.sql` | Nomor WA, pendamping, impor, status kirim/dibuka |
| `202610200004_rsvp_needs.sql` | RSVP bertahap: rombongan, makanan, akses, opsi foto |
| `202610200005_admin_roles.sql` | Super admin dan acara tersembunyi |
| `202610200006_admin_modules.sql` | Modul yang boleh dipakai admin biasa |
| `202610200007_admin_templates.sql` | Templat yang tampil di Buat acara (bawaan: Kunjungan klien, Trip klien) |
| `202610210001_event_beo.sql` | BEO hospitality: jumlah disiapkan, status, dan riwayat revisi |
| `202610210002_gallery_photos.sql` | Galeri foto acara di R2 (boleh menunggu sampai bucket siap) |
| `202610210003_tickets_checkin.sql` | Tiket QR untuk tamu undangan personal dan check-in di pintu masuk |
| `202610210004_short_links.sql` | Kode pendek acara (`/AB23CD`) dan token tamu 8 karakter (`/AB23CD/k7q2mx9p`). Acara dan undangan lama langsung mendapat kode |
| `202610210005_staff_members.sql` | Daftar Tim Werkudara untuk mengisi PIC |
| `202610220001_studio_poster.sql` | Templat "Poster sesi / festival" dan modul Studio Poster boleh diatur untuk admin biasa (Studio Poster sendiri tetap jalan tanpa migrasi ini) |
| `202610220002_poster_designs.sql` | Pustaka desain poster ("Simpan sebagai desain baru") |
| `202610220003_card_publish.sql` | Kartu (Studio Poster) bisa dipublikasikan tanpa penyelenggara, pengantar, dan lokasi |
| `202610260001_eguide_publish.sql` | E-Guide (buku panduan tamu) bisa dipublikasikan tanpa penyelenggara, pengantar, dan lokasi; templat "E-Guide destinasi" boleh ditampilkan untuk admin biasa |
| `202610270003_donations.sql` | Donasi CSR: tabel donasi, bucket privat `bukti-donasi` untuk bukti transfer, dan halaman CSR bisa dipublikasikan tanpa lokasi. Sebelum migrasi ini, halaman CSR tampil tanpa tombol Donasi dan tab Donasi masuk menampilkan "menunggu migrasi" |
| `202610280001_donation_recipient.sql` | Friday Sharing: kolom penerima di tiap donasi, untuk menu **Donasi → Pembagian** dan laporan per panti. Sebelum migrasi ini, Donasi masuk tetap berjalan, hanya Pembagian yang menampilkan "menunggu migrasi" |
| `202611040001_pra_wam_appraisal.sql` | Pra WAM tahap 0: akun per orang (`pw_accounts`), 7 ruang dari Werkudara Room Booking (`pw_rooms`, area belum bisa dipesan), dan booking ruang appraisal dengan penjaga bentrok di database. Butuh `202611030001_employees.sql` lebih dulu. Sebelum migrasi ini, `/pra-wam` menampilkan "menunggu migrasi" |
| `202611040002_pra_wam_roles.sql` | Pra WAM tahap 1: kolom NIP di Data karyawan (boleh kosong, unik bila diisi) dan peran Panitia, BOD, Admin Pra WAM (`pw_roles`). BOD awal Pak Fadli dan Pak Bagus diisi otomatis bila namanya sudah ada di Data karyawan. Sebelum migrasi ini, semua orang tampil sebagai peserta dan kolom NIP tidak bisa diisi |
| `202611040003_pra_wam_events_units.sql` | Pra WAM tahap 1b: acara Pra WAM 2026 (aktif, modul Appraisal menyala) dan WAM 2027 (disiapkan), serta unit (departemen dan BU) dengan anggota, jabatan, dan lead. Unit diisi lewat Admin WAM (`/admin/wam/unit`) → Impor unit dan jabatan. Sebelum migrasi ini, Appraisal tetap terbuka dan chip partisipan memakai kolom departemen |
| `202611040004_pra_wam_sessions.sql` | Pra WAM tahap 2: sesi (11 forum dari kalender masuk sebagai draf tanpa jam), peserta sesi, dokumen di R2 (`pra-wam/dokumen/…`), dan `pw_room_holds`: satu penjaga ruang bersama untuk booking appraisal dan sesi, diisi trigger. Booking aktif yang sudah ada ikut dimasukkan. Sebelum migrasi ini, Agenda hanya berisi booking appraisal dan menu Dokumen menampilkan "menunggu migrasi" |
| `202611040005_pra_wam_attendance.sql` | Pra WAM tahap 3: token QR statis per sesi (`pw_sessions.qr_token`, disimpan apa adanya supaya bisa dicetak ulang, hanya dibaca server) dan kehadiran (`pw_attendance`, satu baris per orang per sesi, scan atau manual). Sebelum migrasi ini, halaman absen menampilkan "menunggu migrasi" |
| `202611040006_pra_wam_announcements.sql` | Pra WAM tahap 4a: pengumuman panitia (semua, satu sesi, atau unit) dan notifikasi di aplikasi dengan tanda dibaca. Kabar sesi (terbit, pindah jadwal, batal) dikirim otomatis. Sebelum migrasi ini, sesi tetap tersimpan tanpa kabar, dan menu Notifikasi menampilkan "menunggu migrasi" |
| `202611040007_pra_wam_schedule_requests.sql` | Pra WAM tahap 4b: peserta mengajukan ganti jadwal dari halaman sesi; panitia menyetujui (sesi dipindah bila ruang kosong dan jadwal belum berubah sejak diajukan, semua peserta diberi tahu) atau menolak dengan catatan. Sebelum migrasi ini, tombol ajukan tidak tampil dan menu Permintaan menampilkan "menunggu migrasi" |
| `202611040008_pra_wam_about.sql` | WAM: teks "Apa itu WAM?" di Beranda yang ditulis admin (`pw_about`, satu baris). Sebelum migrasi ini, Beranda menampilkan teks bawaan dari tanggal acara dan editor di Admin WAM → Apa itu WAM menampilkan "menunggu migrasi" |
| `202611040009_pra_wam_room_plan.sql` | WAM: ruang pas dengan jumlah orang dan denah. `pw_rooms` dapat `min_people` (paling sedikit orang, mis. 4 supaya ruang besar tidak dipakai one-on-one) dan `plan_key` (spot di denah, satu spot satu ruang), plus `pw_app_settings` (satu baris: denah tampil di Book atau tidak). Diatur di Admin WAM → Ruang dan denah (`/admin/wam/ruang`). Sebelum migrasi ini, denah tetap tampil, ruang ditaruh di denah menurut namanya, hanya kapasitas dan "Bisa dibooking" yang bisa disimpan, dan sakelar denah serta minimal orang menampilkan "menunggu migrasi" |
| `202611040010_pra_wam_photos_reset_requests.sql` | WAM: foto profil per akun (`pw_accounts.photo_key`, WebP kecil di R2 `pra-wam/foto/…`) dan Lupa password sebagai permintaan ke admin (`pw_reset_requests`, satu permintaan terbuka per akun), ditangani di Admin WAM → Permintaan reset password (`/admin/wam/permintaan-reset`). Sebelum migrasi ini, foto tidak bisa disimpan (inisial tampil) dan form Lupa password menyarankan menghubungi admin langsung |
| `202611040011_wam_questionnaire.sql` | WAM: kuesioner personal (dari mockup Cerita Kita): form dengan nama dan alamat yang diatur HR (bawaan Kuesioner, `/wam/kuesioner`, status draf), 6 bagian dan 55 pertanyaan awal, jawaban per orang, bagian anonim tanpa kolom orang (hanya tanda terima), password HR (hash scrypt) dan log aksesnya. Dikelola di Admin WAM → Kuesioner. Sebelum migrasi ini, kartu kuesioner tidak tampil dan Admin WAM menampilkan "menunggu migrasi" |
| `202611040012_wam_hr_access.sql` | WAM: Data HR dibuka dengan email WAM orang di daftar akses (`cq_forms.hr_access`, diatur super admin), bukan password bersama; log akses mencatat pelakunya (`cq_hr_access_log.actor_employee_id`). Sebelum migrasi ini, tidak ada yang bisa membuka Data HR |
| `202611040013_wam_cards.sql` | WAM: kartu karakter kuesioner (tahap 2), tanpa blockchain: level dan peluang (`cq_tiers`), karakter dan aturan skornya (`cq_cards`, `cq_card_rules`), latar/aksen/stiker (`cq_card_parts`), kartu tiap orang dengan nomor, DNA unik, dan catatan undian (`cq_person_cards`). Isi awal dari mockup: 8 karakter, 31 aturan, 5 level, 26 bagian tampilan. Gambar diunggah di Admin WAM → Kuesioner → Kartu ke R2 privat (`pra-wam/kartu/…`); tanpa gambar kartu digambar warna polos. Sebelum migrasi ini, kuesioner jalan seperti biasa tanpa kartu dan tab Kartu menampilkan "menunggu migrasi" |
| `202611050003_pra_wam_self_check_in.sql` | WAM: absen mandiri "Saya hadir" di Detail sesi, selain scan QR dan catatan panitia. Peserta memilih **di kantor** (`method = 'offline'`, sekali ketuk) atau **online lewat Zoom** (`'online'`, wajib tangkapan layar meeting di R2 privat `pra-wam/absen/<sesi>/<orang>/…`, kunci di `pw_attendance.proof_key`). Jendela sama dengan QR (30 menit sebelum mulai sampai 30 menit setelah selesai), satu baris per orang per sesi. Panitia dan BOD melihat cara hadir dan bukti di QR dan daftar hadir. Butuh `202611040005`. Sebelum migrasi ini, scan QR dan catatan panitia tetap jalan; tombol "Saya hadir" menjawab "menunggu migrasi" untuk kedua pilihan |
| `202611050004_pra_wam_booking_sessions.sql` | WAM: setiap booking ruang aktif otomatis jadi **sesi terbit** (jenis Rapat, dibuat atas nama pemesan, peserta = pemesan + partisipan), tampil di Kelola acara → Sesi bagian Terbit dengan label "Dari booking" dan di agenda peserta, lengkap dengan QR absen, "Saya hadir", dan dokumen. Kolom `pw_sessions.booking_id` (unik, ikut terhapus bersama booking). Trigger menyamakan sesi tiap kali booking disimpan atau partisipannya berubah; membatalkan booking membatalkan sesinya (dan sebaliknya); menghapus booking menghapus sesinya. Penjaga ruang tidak dihitung dua kali: booking yang punya sesi tidak menulis hold sendiri, hold-nya dipegang sesi. Booking aktif yang belum lewat langsung dibuatkan sesi (aman diulang). Butuh `202611040001`, `202611040003`, `202611040004`. Sebelum migrasi ini, booking jalan seperti biasa tanpa sesi |
| `202611200001_main_wam_settings_rundown.sql` | Main WAM (fondasi, `docs/main-wam/KONTRAK.md`): pengaturan satu baris `mw_settings` (mode acara `pra`/`uji`/`semua`, modul, tema, info acara), penguji `mw_testers`, panduan `mw_guides`, rundown `mw_sessions` + riwayat `mw_rundown_log` + absen `mw_attendance`, kelompok dan kelompok kegiatan, lantai kamar di atas pembagian kamar HR (`mw_stay_room_details`), perjalanan dan kursi, metadata notifikasi `mw_notes` di atas `pw_announcements` (dengan nada `tone` pengumuman). Setiap kunci asing berindeks; absen manual tetap ada bila pencatatnya dihapus dari Data karyawan. Mode bawaan `pra`: Main WAM tersembunyi. Sebelum migrasi ini Pra WAM jalan seperti biasa dan Main WAM menampilkan "menunggu pembaruan sistem" |
| `202611200002_main_wam_momen.sql` | Main WAM: foto Momen (`mw_photos`, kunci R2 `main-wam/momen/…`, tampil 5 detik setelah dikirim, `client_id` agar antrean offline tidak mengirim dua kali), hati, laporan, foto yang sudah dilihat, ubin Mozaik. Butuh `202611200001` |
| `202611200003_main_wam_modules.sql` | Main WAM: Voting Awarding (kategori, nominasi, satu suara per orang per kategori; trigger menolak suara di luar jendela atau untuk diri sendiri) dan Silent Meeting (pertanyaan per sesi; masukan tanpa orang dan tanpa waktu; trigger menolak masukan saat ditutup). Butuh `202611200001`, `202611200002` |
| `202611200101_main_wam_peserta_indexes.sql` | Main WAM, peserta: indeks kelompok kegiatan per orang (Kelompok & kamar). Hanya indeks; aplikasi jalan tanpa migrasi ini. Butuh `202611200001` |
| `202611200201_main_wam_momen_area.sql` | Main WAM, Momen dan Mozaik: kolom `mw_photos.tile_key`, fungsi tumpukan dan galeri (keyset), hitungan per sesi, Laporkan foto (laporan ke-3 menyembunyikan foto untuk semua sampai panitia memutuskan), penempatan dan versi Mozaik. Bucket R2 butuh aturan lifecycle untuk `tmp/` (KONTRAK §10). Butuh `202611200001`, `202611200002`. **Pasang bersama `202611200301`** |
| `202611200301_main_wam_panitia.sql` | Main WAM, panitia: versi baris sesi untuk Rundown live (dua panitia tidak saling menimpa), simpan perubahan rundown dalam satu transaksi + riwayat, log dan keputusan Moderasi Momen. Butuh `202611200001`, `202611200002`. **Pasang bersama `202611200201`**: tanpa ini, foto yang ditahan karena 3 laporan tidak bisa diputuskan panitia |
| `202611200401_main_wam_modul.sql` | Main WAM, modul: kirim, buka, tutup, dan rekap Silent Meeting di basis data (tanpa orang, tanpa waktu, tidak bisa dibuka lagi; rekap diacak setelah ditutup), persetujuan pemenang Awarding oleh BOD hanya setelah voting tutup. Butuh `202611200003` |
| `202611200501_main_wam_admin.sql` | Main WAM, Admin WAM → isi acara: anggota kelompok, impor kelompok dan kelompok kegiatan, kursi perjalanan, Hapus sesi (ditolak bila sesi sudah punya absen, foto, masukan, atau suara; pakai Batalkan), Geser jam dengan versi. Fungsi saja, tanpa perubahan tabel. Butuh `202611200001`, `202611200002`, `202611200003` |
| `202611200601_main_wam_kuis.sql` | Main WAM, Kuis live (modul `kuis`, `docs/rancangan-kuis-wam.md` §8a): kuis dan tautan layar besar (hanya sha256 kuncinya), pengendali per kuis, soal 4 pilihan per level, permainan dengan soal yang dibekukan, pemain dengan alias tokoh atau Tokoh misterius bernomor (`mw_quiz_join`), satu jawaban per orang per soal, total yang dijumlah dari jawaban (`mw_quiz_board`); menambah jenis notifikasi `kuis` di `mw_notes`. Butuh `202611200001`. Modul `kuis` tetap mati sampai dinyalakan di Pengaturan. Sebelum migrasi ini Kuis live menjawab "menunggu pembaruan sistem" |
| `202611200602_main_wam_visibility.sql` | Main WAM tersembunyi dari Journey (KONTRAK §14): `admin_settings.main_wam_shown` (bawaan tidak) + kapan dan oleh siapa. Super admin menampilkannya di Super admin → Halaman utama. Sebelum migrasi ini Main WAM dianggap tersembunyi (menu Admin WAM tanpa Main WAM, `/wam` tidak mengalihkan, notifikasi Main WAM hanya ke penguji yang dipilih namanya). Butuh `202610200006`. Aman diulang |
| `202611200603_admin_wam_acara.sql` | Dua pintu admin dan Panitia WAM (KONTRAK §15): `wam_acara` (**Admin WAM 2026**, `/admin/wam2026`) masuk cek `admin_grants.apps`, terpisah dari Admin Pra WAM (`wam`); tabel `pw_event_staff` (panitia per acara, seksi sebagai label, khusus server). Main WAM membaca panitia dan penguji dari sini, bukan dari peran panitia/admin Pra WAM. Tidak ada yang disalin: sesudah migrasi Panitia WAM kosong dan tidak ada yang memegang Admin WAM 2026 kecuali super admin. Sebelum migrasi ini hanya super admin yang membuka Admin WAM 2026, dan Main WAM tanpa panitia (hanya penguji di daftar). Butuh `202611130012`, `202611160050`, dan `pw_events`. Aman diulang. Uji SQL: `tests/backend/admin-wam-acara-check.sql` |
| `202611220001_main_wam_panitia_tab.sql` | Main WAM: modul Silent Meeting dimatikan di pengaturan yang sudah ada (Silent Meeting bagian Pra WAM; bisa dinyalakan lagi di Admin WAM 2026 → Pengaturan). Aman diulang; tidak menyentuh tabel Silent Meeting. Salinan: `main-wam-update-panitia.sql` |

**Main WAM: jalankan semua berkasnya sekaligus, berurutan, dalam satu kali jalan:** `202611200001` → `0002` → `0003` → `0101` → `0201` → `0301` → `0401` → `0501`. Berkas-berkasnya saling bergantung (0003 butuh 0001–0002; 0401 butuh 0003; 0501 butuh 0001–0003; 0201 dan 0301 harus terpasang bersama). Selama Main WAM bermode `pra` (bawaan), tidak ada yang berubah untuk peserta. Jangan memasang sebagian lalu berhenti: fitur yang migrasinya belum ada menjawab "Fitur ini menunggu pembaruan sistem", dan foto yang ditahan laporan tidak bisa diputuskan bila 0201 terpasang tanpa 0301.

Cek hasilnya (hanya membaca). Semua kolom harus `true`:

```sql
select
  to_regclass('public.event_invitations') is not null as "110001",
  to_regclass('public.admin_access_log')  is not null as "200001",
  coalesce((select prosrc like '%Asia/Makassar%' from pg_proc where proname = 'save_event' limit 1), false) as "200002",
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='event_invitations' and column_name='open_count') as "200003",
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='rsvps' and column_name='party_size') as "200004",
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='events' and column_name='admin_hidden') as "200005",
  to_regclass('public.admin_settings') is not null as "200006",
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='admin_settings' and column_name='enabled_templates') as "200007",
  to_regclass('public.event_beo') is not null as "210001",
  to_regclass('public.gallery_photos') is not null as "210002",
  to_regclass('public.event_tickets') is not null as "210003",
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='events' and column_name='code') as "210004",
  to_regclass('public.staff_members') is not null as "210005",
  coalesce((select pg_get_constraintdef(oid) like '%poster-sesi%' from pg_constraint where conname = 'admin_settings_enabled_templates_check'), false) as "220001",
  to_regclass('public.poster_designs') is not null as "220002",
  coalesce((select prosrc like '%kartu%' from pg_proc where proname = 'save_event' limit 1), false) as "220003",
  coalesce((select prosrc like '%eguide%' from pg_proc where proname = 'save_event' limit 1), false) as "260001",
  to_regclass('public.donations') is not null and exists (select 1 from storage.buckets where id = 'bukti-donasi' and not public) as "270003",
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='donations' and column_name='recipient_id') as "280001";
```

Migrasi bersifat menambah. Versi lama yang masih online tetap berjalan setelah migrasi diterapkan, jadi urutannya aman: **database dulu, baru kode**.

## 2. Variabel di Vercel

Vercel → Project → Settings → Environment Variables, lingkup **Production**. Isi nilainya langsung di kolom Vercel (tanpa tanda kutip, karena tanda kutip hanya dibutuhkan di berkas `.env` lokal).

| Variabel | Status | Catatan |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | sudah ada | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sudah ada | |
| `SUPABASE_SECRET_KEY` | sudah ada | Rahasia |
| `RATE_LIMIT_SECRET` | sudah ada | Rahasia, acak ≥ 32 karakter |
| `ADMIN_PASSWORD` | **baru** | ≥ 8 karakter. Password bersama admin biasa |
| `ADMIN_SESSION_SECRET` | **baru** | Acak ≥ 32 karakter |
| `SUPER_ADMIN_PASSWORD` | **baru, opsional** | ≥ 8 karakter, beda dari `ADMIN_PASSWORD` |
| `NEXT_PUBLIC_SITE_URL` | periksa | `https://journey.werkudara.group` |

Gunakan password **berbeda** dari yang dipakai di laptop untuk development. Tanpa `ADMIN_PASSWORD` dan `ADMIN_SESSION_SECRET`, admin di produksi **terkunci** (aman, tetapi tidak bisa dipakai).

## 3. Kode

1. Push branch `feat/platform-lengkap` ke GitHub.
2. Buka Pull Request ke `main` dan tinjau daftar perubahannya.
3. Merge. Vercel men-deploy `main` ke Production. Pastikan di Vercel → Deployments bahwa deployment baru berstatus *Ready*.

## 4. Uji setelah online (± 15 menit)

Kerjakan di browser biasa, lalu ulangi bagian tamu di ponsel.

- [ ] `https://journey.werkudara.group/admin` mengarah ke halaman login; tanpa password tidak bisa masuk.
- [ ] Login dengan `ADMIN_PASSWORD` berhasil; **Log akses** mencatat login itu (IP, kota, perangkat).
- [ ] Login dengan `SUPER_ADMIN_PASSWORD` masuk ke **Dashboard super admin**.
- [ ] Login dengan `ADMIN_PASSWORD`: kartu WAM di **Semua acara** membuka **Admin WAM** (`/admin/wam`); `/admin/super/wam` dialihkan ke sana, dan **Data karyawan** tetap tidak bisa dibuka.
- [ ] `/dev-preview` menampilkan halaman tidak ditemukan (khusus development).
- [ ] Buka acara lama di editor: kartu ringkasan tampil, panel bisa dibuka, **tanpa menyimpan**.
- [ ] Buat satu acara uji lewat **Buat acara** (audiens **Internal**, status draf), simpan, lalu pratinjau.
- [ ] Publikasikan acara uji, buka `/e/<slug>` di ponsel: pembuka, jadwal, lokasi, dan form RSVP bertahap tampil.
- [ ] Kirim satu RSVP uji; jawaban muncul di tab RSVP dan di CSV.
- [ ] Tautan per tamu: tambah satu tamu uji, salin tautan, buka; status *Dibuka* tercatat.
- [ ] Hapus atau arsipkan acara uji setelah selesai.

**Sesudah migrasi `202611200603` (dua pintu admin, langkah pemilik):**

1. Super admin → **Akses admin**: centang **Admin WAM 2026** untuk tim WAM (orang per orang). Pemegang Admin Pra WAM tidak
   otomatis mendapatkannya; tanpa centang ini `/admin/wam2026` 404 untuk mereka.
2. Admin WAM 2026 → **Panitia WAM** (`/admin/wam2026/panitia`): tambahkan panitia acara WAM beserta seksinya (BOD tidak
   bisa). Panitia dan admin Pra WAM tidak lagi menjadi panitia atau penguji Main WAM karena perannya.
3. Admin WAM 2026 → **Pengaturan → Penguji**: tambahkan orang lain yang ikut mencoba Main WAM (di luar Panitia WAM).
   Pemegang Admin WAM 2026 yang ingin mengendalikan kuis dari HP di mode `uji` juga perlu ada di penguji atau Panitia WAM.
4. Tautan lama `/admin/wam/main/...` tetap jalan (dialihkan ke `/admin/wam2026/...`).

- [ ] Login sebagai pemegang Admin Pra WAM saja: menu tanpa Main WAM, `/admin/wam2026` 404, `/admin/wam/main/kuis` dialihkan lalu 404.
- [ ] Login sebagai pemegang Admin WAM 2026 saja: `/admin/wam` 404, `/admin/wam2026` terbuka, Panitia WAM bisa ditambah.

Bila ada yang gagal: Vercel → Deployments → deployment sebelumnya → **Promote to Production** mengembalikan kode lama dalam satu klik. Migrasi database tidak perlu dibatalkan karena versi lama tetap kompatibel.

## 5. Aturan pakai selama fase internal

- Buat acara dengan audiens **Internal**; acara eksternal (klien, mitra) menunggu tahap berikutnya.
- Bagikan `ADMIN_PASSWORD` hanya ke panitia yang perlu, dan cek **Log akses** sesekali.
- Super admin dapat menyembunyikan acara dan mematikan modul yang belum ingin dipakai tim.
- Data tamu nyata mulai masuk; patuhi catatan retensi dan izin foto di `docs/rancangan-journey-tamu.md`.

## 6. Ditunda sampai fase internal stabil

Pengumuman dan kalender .ics, pratinjau tautan WhatsApp (OG image), QR undangan, halaman depan sambutan umum, tiket dan kursi, check-in, galeri dan dokumen di R2 (perlu bucket), modul Program, BEO dan pembersihan data, alur deploy berbasis tag.

### Pra WAM: lupa password

Tautan "Lupa password" dikirim Supabase Auth ke email masing-masing orang. Sebelum dipakai:

1. Supabase → Authentication → URL Configuration: tambahkan `https://<domain>/wam/reset-password` (dan `http://localhost:3000/wam/reset-password` untuk uji lokal) ke Redirect URLs.
2. Supabase → Authentication → SMTP: isi SMTP alamat pengirim kantor. SMTP bawaan Supabase hanya untuk uji dan sangat dibatasi.
3. Kolom email di Data karyawan harus berisi kotak surat yang benar-benar aktif.
