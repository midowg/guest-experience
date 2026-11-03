# Spesifikasi build Pra WAM

Status: siap dipakai untuk mulai build, dengan keputusan terbuka di bagian 10. Dibuat 3 November 2026.
Dasar: `docs/rancangan-pra-wam.md` (fungsi dan keputusan), desain Penpot file **PRAWAM** halaman
03–06 (layar dan alur per peran), acuan eksekusi 2 Nov 2026, kalender Pra WAM, dan data karyawan v2.

## 1. Cakupan build pertama (Pra WAM)

Masuk:
- **Appraisal: booking ruang (dibangun paling dulu).** Periode appraisal 28 Okt–20 Nov 2026 sudah
  berjalan. Semua orang yang masuk bisa memesan ruang; jadwal ruang menampilkan siapa memesan apa.
  Rincian di bagian 1a.
- Login email + password untuk semua peran, password awal seragam yang bisa dilewati/diganti.
- Tampilan sesuai peran: peserta, lead unit, panitia, BOD, admin.
- Peserta: Beranda, Notifikasi, Agenda, Detail sesi, Ajukan ganti jadwal, Absen QR, Dokumen,
  Survei, Profil dan pengaturan. Ponsel utama, desktop ikut (layout lebar).
- Panitia: Dashboard, Peserta & profil, Buat/ubah sesi, Pilih ruang lewat denah, Cetak QR absen,
  Pengumuman, Survei, Tinjau permintaan jadwal (desktop dan ponsel).
- BOD: Ringkasan (perlu perhatian, akses cepat), Profil peserta, Hasil survei, Akun; baca saja.
- Admin: Pusat pengaturan, Acara & modul, Akun & akses (NIP, email, unit dan jabatan, peran, reset
  password, impor), Unit & lead, Izin MCP.

Tidak masuk build pertama: semua fitur WAM (rundown, pairing kamar/tim, kartu kamar), form
personalisasi, notulen/MoM dan tindak lanjut, log audit sebagai layar (datanya tetap dicatat),
master ruang & denah sebagai layar admin (ruang diisi lewat seed dulu), notifikasi WhatsApp/email,
koneksi MCP sungguhan (layar izin ada; server MCP di fase berikutnya).

## 1a. Appraisal: booking ruang

**Ruang** (seed, dari aplikasi Werkudara Room Booking): CFC Ananta Room, Nagapadma, Vasuki (jenis
`utama`); Limasan, Pantry, Main Office, Komunal (jenis `area`). Kapasitas `null` sampai diketahui.
Kolom `bookable` menentukan ruang yang muncul di form (menunggu jawaban soal area).

**Form** (`/pra-wam/appraisal/pesan`):
- Nama kegiatan, wajib, maks. 120 karakter. Saran saat mengetik = daftar baku di pengaturan modul
  ditambah judul booking yang pernah ada (distinct, urut paling sering), disaring per huruf ketik.
- Tanggal: Senin–Jumat, di dalam periode appraisal, tidak di masa lalu.
- Jam mulai dan selesai: 09.00–18.00 WIB, kelipatan 30 menit, hari yang sama, selesai > mulai,
  durasi maks. 240 menit. Jam lewat pada hari ini tidak bisa dipilih.
- Ruang: hanya yang `bookable`; status per jam terpilih (kosong / terpakai + nama pemesan).
- Deskripsi: opsional, maks. 500 karakter.
- Partisipan: chip departemen dari `org_units`; memilih chip menampilkan anggota unit itu
  (`unit_members` + `employees.active`) sebagai chip saran; cari nama lintas departemen. Pemesan
  otomatis ikut. Maks. 15 partisipan (mengikuti aturan Room Booking lama).

**Berebut (aturan server):**
1. Server memvalidasi ulang semua aturan di atas dengan jam server, bukan jam perangkat.
2. Insert dijaga database: `exclude using gist (room_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where (status = 'aktif')`.
   Pelanggaran (`23P01`) diubah jadi pesan "Ruang baru saja dipesan <nama>, <jam>" plus usulan:
   jam kosong terdekat di ruang yang sama dan ruang lain yang kosong di jam sama. Isian form tetap.
3. Tidak ada status tentative; booking langsung `aktif`. Batal = `status = 'batal'`, slot langsung bebas.
4. Batas adil: booking aktif per pemesan per hari ≤ `max_per_day` (usulan 4), dicek di server.
5. Partisipan yang bentrok dengan booking aktif lain: peringatan sebelum simpan, tidak ditolak.
6. Ubah booking = cek ulang yang sama, dengan booking itu sendiri dikecualikan.

**Halaman** `/pra-wam/appraisal`: tab Jadwal ruang (tanggal, ruang × jam, blok berisi pemesan +
kegiatan; ponsel: daftar per ruang) dan tab Booking saya (dipesan / diikuti, ubah, batal). Detail
`/pra-wam/appraisal/[id]`. Partisipan hanya dikirim ke klien bila yang melihat pemesan, partisipan,
panitia, BOD, atau admin.

## 2. Keputusan yang sudah final

| Hal | Keputusan |
|---|---|
| Lokasi kode | Di repo Journey (Next.js 16, Supabase, R2), pola modul seperti Friday Sharing |
| Data karyawan | Memakai tabel bersama `employees` yang sudah ada (migrasi `202611030001`), ditambah NIP dan unit-jabatan |
| Email | `panggilan@werkudara.com`, unik, bisa diubah admin |
| Password awal | Sama untuk semua, disimpan sebagai rahasia server, tidak ditulis di repo; ganti bisa dilewati |
| BOD | Pak Fadli (CEO) dan Pak Bagus (Managing Director); baca saja, jangkauan paling luas |
| Lead | Yulia: BAS + BU MRP; Sofyan: CoE + ACS |
| Absen | QR statis per sesi, dicetak; jendela 30 menit sebelum mulai sampai 30 menit setelah selesai |
| Ruang | Dipilih panitia lewat denah; peserta hanya melihat nama ruang |
| Tema | Biru Werkudara + kuningan Hospitality, Lora + Nunito, token di Penpot `Hospitality/Terang` dan `Gelap` |
| Wording | Nama "Pra WAM", kalimat "Satu aplikasi untuk setiap langkah menuju WAM 2027" |

## 3. Arsitektur

- **Rute peserta, lead, BOD:** `/pra-wam/...` (satu aplikasi, menu mengikuti peran).
- **Rute panitia:** `/pra-wam/panitia/...`. **Rute admin:** `/pra-wam/admin/...`.
  Semua alamat dibangun di `src/lib/routes.ts` (aturan Journey; tes penjaga menolak path manual).
- **Login:** akun per orang, terpisah dari login admin Journey yang memakai password bersama.
  Keputusan: **Supabase Auth email + password**. Akun dibuat admin lewat service role (tanpa
  pendaftaran umum), dikaitkan ke `employees.id`. Sesi bertahan di perangkat ("sekali masuk").
  Reset password mengirim tautan ke email masing-masing orang.
- **Data:** semua tabel baru dikunci RLS, diakses hanya lewat server (service role), seperti tabel
  Journey lain. Hak akses diperiksa di server per permintaan, bukan di tampilan.
- **Berkas dokumen:** R2 (sudah dipakai Journey), izin dicek saat unggah dan unduh.
- **QR absen:** isi QR adalah alamat `https://<domain>/pra-wam/absen/<token>`. Kamera ponsel biasa
  langsung membuka aplikasi; pemindai di dalam aplikasi tetap ada (layar Scan QR). Token acak per
  sesi, disimpan sebagai hash. Cetak A5 memakai `qrcode` + `pdf-lib` yang sudah ada.
- **Zona waktu:** WIB (Asia/Jakarta), mengikuti pola zona waktu acara di Journey.

## 4. Database (migrasi baru)

Semua migrasi mengikuti aturan repo: header "LOCAL REVIEW ONLY", `begin/commit`, RLS aktif,
`revoke` dari public/anon/authenticated, `grant` ke service_role, tes `tests/backend/*-check.sql`.

| Tabel | Kolom utama | Catatan |
|---|---|---|
| `employees` (ubah) | `+ nip text null` unik bila terisi; indeks unik `lower(email)` bila tidak kosong | Tabel bersama sudah ada |
| `org_units` | id, kind (`departemen`/`bu`), name, code | 12 departemen + 3 BU |
| `unit_members` | employee_id, unit_id, job_title, is_lead, is_primary | Banyak-ke-banyak; satu utama per jenis |
| `pw_accounts` | employee_id, auth_user_id, must_change_password, password_changed_at, last_login_at | Kaitan akun login ↔ karyawan |
| `pw_admin_roles` | employee_id, role (`super_admin`) | Admin aplikasi (lintas acara) |
| `pw_events` | id, name, kind (`pra_wam`/`wam`), start_date, end_date, timezone, status, modules jsonb | Pra WAM aktif, WAM disiapkan |
| `pw_members` | id, event_id, employee_id, status | Unik event + employee |
| `pw_member_roles` | member_id, role (`peserta`/`panitia`/`bod`) | Satu orang bisa beberapa peran |
| `pw_rooms` | id, name, kind (`utama`/`area`), floor, capacity null, facilities text[], map jsonb (x, y, w, h), bookable, sort_order | Seed 7 ruang dari Room Booking |
| `pw_room_bookings` | id, event_id, room_id, title, description, starts_at, ends_at, booked_by (employee), status (`aktif`/`batal`), cancelled_by, cancelled_at, created_at, updated_at | `btree_gist` + exclusion constraint ruang × jam untuk status aktif; check jam 09–18 WIB, kelipatan 30 menit, hari sama |
| `pw_room_booking_participants` | booking_id, employee_id | PK keduanya; pemesan ikut tercatat |
| `pw_sessions` | id, event_id, title, kind, starts_at, ends_at, room_id, owner_employee_id, status (`draf`/`terbit`/`batal`), qr_token_hash, published_at | Jendela absen dihitung dari jam sesi |
| `pw_session_participants` | session_id, member_id | Dasar agenda dan izin dokumen |
| `pw_schedule_requests` | id, session_id, member_id, from_starts_at, to_starts_at, to_room_id, reason, status (`diajukan`/`disetujui`/`ditolak`), reviewed_by, reviewed_at | Cek ulang bentrok saat disetujui |
| `pw_attendance` | session_id, member_id, checked_in_at, method (`qr`/`manual`), recorded_by | Unik sesi + member |
| `pw_documents` | id, event_id, session_id null, uploaded_by, title, file_key, mime, size | Tanpa sesi = dokumen umum |
| `pw_announcements` | id, event_id, title, body, audience jsonb, scheduled_at, sent_at, created_by | Penerima: semua / sesi / unit |
| `pw_notification_receipts` | announcement_id, member_id, read_at | Hitungan "dibaca" |
| `pw_surveys`, `pw_survey_questions`, `pw_survey_responses`, `pw_survey_answers` | sesuai acuan | Satu respons per orang per survei |
| `pw_audit_logs` | id, actor_employee_id, action, entity, entity_id, before, after, created_at | Semua perubahan admin dan panitia |
| `pw_mcp_grants` | employee_id, scope jsonb, granted_by, revoked_at | Layar izin; server MCP fase berikutnya |

Awalan `pw_` membedakan tabel Pra WAM/WAM dari tabel undangan Journey (`events`, `rsvps`, dst.).

## 5. Hak akses (diperiksa di server)

| Aksi | Peserta | Lead | Panitia | BOD | Admin |
|---|---|---|---|---|---|
| Pesan, ubah, batal ruang appraisal milik sendiri | ✓ | ✓ | ✓ | ✓ | ✓ |
| Lihat jadwal ruang (pemesan + kegiatan) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Lihat partisipan booking orang lain | bila ikut | bila ikut | ✓ | ✓ | ✓ |
| Batalkan booking orang lain | – | – | ✓ | – | ✓ |
| Lihat agenda dan sesi sendiri | ✓ | ✓ | ✓ | ✓ | – |
| Lihat semua sesi | – | unitnya | ✓ | ✓ (baca) | ✓ |
| Buat/ubah/terbitkan sesi, pilih ruang, cetak QR | – | – | ✓ | – | – |
| Absen QR | sesi sendiri | sesi sendiri | koreksi manual | sesi sendiri | – |
| Ajukan ganti jadwal | ✓ | ✓ | – | – | – |
| Setujui/tolak permintaan | – | – | ✓ | – | – |
| Unggah dokumen | sesi sendiri | sesi sendiri | ✓ | – | – |
| Pengumuman dan survei (kelola) | – | – | ✓ | – | – |
| Ringkasan semua unit, profil semua peserta, hasil survei | – | unitnya | ✓ | ✓ | – |
| Akun, NIP, email, unit-jabatan, peran, izin MCP, modul acara | – | – | – | – | ✓ |

## 6. Layar → rute → desain

| Desain (Penpot) | Rute | Fungsi server utama |
|---|---|---|
| Peserta 01 Masuk / Panitia & Admin 01 Masuk desktop | `/pra-wam/masuk` | login, arahkan sesuai peran |
| Peserta 02 Buat password baru | `/pra-wam/password` | ganti password, bisa dilewati |
| Appraisal · Jadwal ruang / Booking saya | `/pra-wam/appraisal` | jadwal per tanggal, booking saya, ruang kosong sekarang |
| Appraisal · Pesan ruang | `/pra-wam/appraisal/pesan` | saran kegiatan, ketersediaan, partisipan per unit, simpan |
| Appraisal · Detail | `/pra-wam/appraisal/[id]` | ubah, batal |
| Peserta 03 Beranda | `/pra-wam` | sesi berikutnya, status permintaan, info terbaru |
| Peserta 04 Notifikasi | `/pra-wam/notifikasi` | daftar pengumuman, tandai dibaca |
| Peserta 05 Agenda | `/pra-wam/agenda` | sesi per hari milik peserta |
| Peserta 06 Detail sesi | `/pra-wam/sesi/[id]` | detail, dokumen, status absen |
| Peserta 07 Ajukan ganti jadwal | `/pra-wam/sesi/[id]/ganti-jadwal` | jadwal tersedia, kirim permintaan |
| Peserta 08–10 Scan, absen tercatat, belum dibuka | `/pra-wam/absen`, `/pra-wam/absen/[token]` | catat absen, cek jendela dan peserta |
| Peserta 11 Dokumen | `/pra-wam/dokumen` | daftar dan unggah |
| Peserta 12 Isi survei | `/pra-wam/survei/[id]` | simpan jawaban |
| Peserta 13 Profil dan pengaturan | `/pra-wam/profil` | nama panggilan, ganti password |
| Panitia 02 Dashboard | `/pra-wam/panitia` | angka, jadwal hari ini, perlu tindakan |
| Panitia 03 Peserta & profil | `/pra-wam/panitia/peserta` | cari, saring, status akun |
| Panitia 04 Buat sesi | `/pra-wam/panitia/sesi/baru`, `/sesi/[id]` | simpan draf, cek bentrok, terbitkan |
| Panitia 05 Pilih ruang | `/pra-wam/panitia/sesi/[id]/ruang` | ketersediaan ruang per jam |
| Panitia 06 Cetak QR | `/pra-wam/panitia/qr` | PDF A5 per sesi |
| Panitia 07 Pengumuman | `/pra-wam/panitia/pengumuman` | kirim/jadwalkan, hitungan dibaca |
| Panitia 08 Survei | `/pra-wam/panitia/survei` | kelola, hasil, ingatkan |
| Panitia 09–11 ponsel | rute panitia yang sama, tata letak ponsel | |
| BOD 02–06 | `/pra-wam` (tampilan BOD), `/pra-wam/peserta/[id]`, `/pra-wam/survei/hasil`, `/pra-wam/akun` | baca saja |
| Admin 02–06 | `/pra-wam/admin`, `/admin/acara`, `/admin/akun`, `/admin/unit`, `/admin/mcp` | pengaturan |

## 7. Data awal (seed)

- **Karyawan:** unggah `Downloads\Data_Karyawan_Upload_Journey.xlsx` lewat Super admin → Data
  karyawan → Impor Excel. Sudah diuji dengan pembaca Journey (`employeesFromSheets`): 57 baris,
  tidak ada yang kosong. Importir saat ini **belum membaca kolom EMAIL dan NIP**; perlu perubahan
  kecil (baca kedua kolom, migrasi kolom `nip`, email dari file hanya mengisi yang masih kosong
  supaya isian admin tidak tertimpa). `unit_members` diisi dari sheet "Unit dan jabatan".
- **Akun:** dibuat untuk 57 karyawan dengan password awal dari rahasia server.
- **Peran:** semua peserta; BOD Pak Fadli dan Pak Bagus; panitia dan super admin menunggu daftar.
- **Acara:** Pra WAM (2 Nov–23 Des 2026, aktif); WAM 2027 (4–7 Jan 2027, disiapkan).
- **Sesi:** forum dari kalender sebagai **draf** (tanpa jam) sampai jam dan ruang diketahui.
- **Ruang:** 7 ruang dari Werkudara Room Booking (lihat 1a), kapasitas menunggu data.
- **Modul appraisal:** periode 28 Okt–20 Nov 2026, jam 09.00–18.00, langkah 30 menit, maks. 240
  menit, `max_per_day` 4, daftar baku nama kegiatan; disimpan di `pw_events.modules`.

## 8. Kriteria selesai

- Appraisal: dua permintaan simpan bersamaan untuk ruang dan jam yang tumpang tindih → tepat satu
  tersimpan, yang lain mendapat pesan dengan nama pemesan dan usulan jam (diuji dengan dua
  permintaan paralel dan tes SQL constraint). Jam di luar 09.00–18.00, bukan kelipatan 30 menit,
  akhir pekan, dan masa lalu ditolak server. Batal membebaskan slot. Partisipan tidak bocor ke
  orang yang tidak berhak.
- Login: email tidak dikenal dan password salah memberi pesan jelas; percobaan dibatasi; ganti
  password awal bisa dilewati; super admin bisa reset ke password awal.
- Tampilan: setelah login, menu dan Beranda sesuai peran; orang berperan ganda melihat gabungan.
- Akses: setiap rute dan API menolak peran yang tidak berhak (diuji per peran).
- Sesi: draf tidak terlihat peserta; terbit mengirim notifikasi ke peserta sesi; bentrok ruang,
  peserta, dan jam ditolak atau ditandai.
- Ganti jadwal: status diajukan tidak mengubah sesi; disetujui mengubah sesi, mencatat log, dan
  memberi notifikasi semua peserta sesi; disetujui hanya bila jadwal awal belum diubah orang lain.
- Absen: hanya peserta sesi, hanya dalam jendela 30 menit; scan ulang tidak menggandakan; di luar
  jendela tampil "Absen belum dibuka".
- QR: satu token per sesi; PDF A5 berisi nama sesi, waktu, ruang, QR, petunjuk; QR tetap berlaku
  saat sesi pindah jam/ruang.
- Dokumen: dokumen sesi hanya untuk peserta sesi; dokumen umum untuk semua anggota acara.
- Survei: satu respons per orang; hasil hanya untuk panitia dan BOD.
- Angka dashboard dan ringkasan BOD berasal dari data aktual; orang dengan banyak unit dihitung sekali.
- Semua perubahan oleh panitia dan admin tercatat di `pw_audit_logs`.
- Tampilan lolos cek 360/390 px, desktop, kontras AA, fokus keyboard (aturan `docs/design-system.md`).

## 9. Urutan build

| Tahap | Isi | Siap dipakai untuk |
|---|---|---|
| 0. Appraisal ✓ | Akun, login, `pw_rooms`, booking dengan penjaga bentrok, jadwal ruang, akun dibuat super admin (migrasi `202611040001`) | Appraisal yang masih berjalan sampai 20 Nov |
| 1. Fondasi ✓ | NIP, peran Panitia/BOD/Admin (`pw_roles`, migrasi `202611040002`), ganti password awal (bisa dilewati) dan halaman Akun, reset password dan pengaturan ruang oleh super admin, panitia bisa membatalkan booking orang lain | Semua orang bisa masuk |
| 1b. Sisa fondasi ✓ | Acara Pra WAM/WAM dan modul (`pw_events`), unit dan lead dari sheet "Unit dan jabatan" (`org_units`, `unit_members`, migrasi `202611040003`), chip partisipan per unit, unit di profil, lupa password lewat email (butuh SMTP dan redirect URL di Supabase) | Tampilan lead dan BOD |
| 2. Agenda ✓ | Sesi (draf dari kalender, terbit, batal), peserta per unit atau semua, pilih ruang dengan penjaga bersama booking appraisal (`pw_room_holds`), Agenda, detail sesi, Dokumen (unggah langsung ke R2, cek isi berkas), menu Semua sesi untuk panitia dan BOD (migrasi `202611040004`). Denah visual ruang menyusul setelah denah asli tersedia | Panitia mengisi jadwal |
| 3. Absen | Token QR, cetak A5, rute absen, koreksi manual | Forum pertama berjalan |
| 4. Komunikasi | Pengumuman, notifikasi, ganti jadwal + tinjau, survei | |
| 5. Pemantauan | Dashboard panitia, ringkasan BOD, admin (akun, unit, modul, izin MCP), audit | Review atasan |

Target: tahap 1–3 selesai sebelum forum yang akan dipakai sebagai uji pertama. HOD Meeting dan
CSM & prioritas CAPEX dimulai 24 Nov 2026, jadi tahap 1–3 sebaiknya siap paling lambat sekitar
20 Nov 2026 untuk uji coba internal.

## 10. Keputusan yang memblok build

| Keputusan | Memblok | Usulan |
|---|---|---|
| Siapa super admin | Seed peran admin | Minimal satu orang tim internal |
| Siapa panitia | Tidak memblok | Diatur fleksibel oleh admin di aplikasi (keputusan pemilik) |
| Login | Sudah: Supabase Auth email + password, reset lewat email masing-masing | |
| Email asli setiap karyawan | Lupa password | Tautan reset dikirim ke email masing-masing, jadi kolom EMAIL harus berisi kotak surat yang aktif (email kantor bila ada). Format `panggilan@werkudara.com` hanya usulan. Tidak perlu membuat 57 email baru |
| Email pengirim Journey + SMTP | Lupa password, notifikasi email | Satu alamat pengirim, mis. `noreply@werkudara.com` atau `journey@werkudara.com`, dengan SMTP kantor (Google Workspace) atau layanan email. SMTP bawaan Supabase hanya untuk uji dan sangat dibatasi |
| Alamat produksi aplikasi | Isi QR yang dicetak | Domain Journey yang sudah dipakai + `/pra-wam` |
| Jam dan ruang setiap forum, denah ruang | Tahap 2 (data, bukan kode) | Panitia isi setelah fitur siap |
| Uji pertama di forum apa | Target tanggal | HOD Meeting 24 Nov atau forum sebelumnya |
| Kapasitas ruang; area boleh dipesan untuk appraisal; ruang Pak Bagus/BS/Pak Fadil/Comms di denah lama | Seed ruang tahap 0 | Tiga ruang utama dulu, area menyusul |
| Room Booking lama tetap dipakai selama appraisal? | Bentrok antar dua sistem | Selama periode appraisal, ruang dipesan hanya lewat Pra WAM; booking yang sudah ada di Room Booking dimasukkan sekali |
