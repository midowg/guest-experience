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
| `202611040003_pra_wam_events_units.sql` | Pra WAM tahap 1b: acara Pra WAM 2026 (aktif, modul Appraisal menyala) dan WAM 2027 (disiapkan), serta unit (departemen dan BU) dengan anggota, jabatan, dan lead. Unit diisi lewat Super admin → Akun Pra WAM → Impor unit dan jabatan. Sebelum migrasi ini, Appraisal tetap terbuka dan chip partisipan memakai kolom departemen |
| `202611040004_pra_wam_sessions.sql` | Pra WAM tahap 2: sesi (11 forum dari kalender masuk sebagai draf tanpa jam), peserta sesi, dokumen di R2 (`pra-wam/dokumen/…`), dan `pw_room_holds`: satu penjaga ruang bersama untuk booking appraisal dan sesi, diisi trigger. Booking aktif yang sudah ada ikut dimasukkan. Sebelum migrasi ini, Agenda hanya berisi booking appraisal dan menu Dokumen menampilkan "menunggu migrasi" |
| `202611040005_pra_wam_attendance.sql` | Pra WAM tahap 3: token QR statis per sesi (`pw_sessions.qr_token`, disimpan apa adanya supaya bisa dicetak ulang, hanya dibaca server) dan kehadiran (`pw_attendance`, satu baris per orang per sesi, scan atau manual). Sebelum migrasi ini, halaman absen menampilkan "menunggu migrasi" |

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
- [ ] `/dev-preview` menampilkan halaman tidak ditemukan (khusus development).
- [ ] Buka acara lama di editor: kartu ringkasan tampil, panel bisa dibuka, **tanpa menyimpan**.
- [ ] Buat satu acara uji lewat **Buat acara** (audiens **Internal**, status draf), simpan, lalu pratinjau.
- [ ] Publikasikan acara uji, buka `/e/<slug>` di ponsel: pembuka, jadwal, lokasi, dan form RSVP bertahap tampil.
- [ ] Kirim satu RSVP uji; jawaban muncul di tab RSVP dan di CSV.
- [ ] Tautan per tamu: tambah satu tamu uji, salin tautan, buka; status *Dibuka* tercatat.
- [ ] Hapus atau arsipkan acara uji setelah selesai.

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

1. Supabase → Authentication → URL Configuration: tambahkan `https://<domain>/pra-wam/atur-password` (dan `http://localhost:3000/pra-wam/atur-password` untuk uji lokal) ke Redirect URLs.
2. Supabase → Authentication → SMTP: isi SMTP alamat pengirim kantor. SMTP bawaan Supabase hanya untuk uji dan sangat dibatasi.
3. Kolom email di Data karyawan harus berisi kotak surat yang benar-benar aktif.
