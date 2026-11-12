# Rancangan: MoM WAM dikirim lewat Telegram

Status (12 November 2026): **tahap 1 sudah dibangun**. Admin WAM → Telegram punya status bot, Pasang webhook,
Pasang grup lewat tautan sekali pakai, Buat topik, Kirim contoh MoM, dan Lepas; migrasinya `202611120002_pw_telegram.sql`.
**Tahap 2 belum dibangun**: Simpan draf / Kirim MoM dari panel Notulen, kartu Gabung grup, dan undangan pribadi. Tahap 2
menunggu sesi lain selesai mengubah aturan wajib MoM. Keputusan yang masih perlu dari pemilik ada di bagian terakhir.

Revisi 12 November 2026: pemilik memilih **grup Telegram per departemen**. Pemilik yang membuat semua grup,
karyawan diarahkan masuk ke grup departemennya, lalu kepemilikan grup diserahkan ke orang lain (bukan
pemilik).

Diputuskan 12 November 2026:

- MoM dikirim ke Telegram **saat notulis menekan Kirim MoM** di aplikasi. Simpan draf tidak mengirim apa pun.
- Semua HOD dianggap punya Telegram.
- Ada **satu grup HOD bersama** ("Werkudara · HOD", berisi HOD/Lead dan BOD) untuk MoM meeting antar HOD.
  Tidak ada grup per kegiatan, karena bot Telegram tidak bisa membuat grup sendiri.

## Tujuan

- Begitu notulis mengirim MoM, isinya muncul di grup departemen yang terlibat. Karyawan tidak perlu membuka
  WAM untuk membacanya.
- Pesannya enak **diteruskan ke atasan**, baik lewat Telegram maupun WhatsApp.
- WAM membantu "memancing" karyawan memasang Telegram dan masuk grup, dan pemilik bisa melihat siapa yang
  belum.

## Prinsip untuk penerima

1. **Satu MoM = satu pesan**, di topik **📝 MoM** grup. Tidak dicicil, tidak bercampur obrolan, dan tidak ada
   pesan "tes".
2. **Bisa dibaca tanpa membuka WAM.** Judul, tanggal, ruang, peserta, keputusan, dan tindak lanjut ada di
   dalam pesan. Tautan ke WAM hanya tambahan.
3. **Netral saat diteruskan.** Tidak memakai "kamu"/"tugasmu", dan nama departemen ditulis lengkap.
4. **Perubahan tidak membunyikan HP lagi.** Pesan disunting di tempat, dengan tanda versi di bawahnya.
5. **Tidak berbunyi malam hari.** Antara 21.00 dan 07.00 WIB pesan tetap dikirim, tetapi tanpa bunyi.
6. **Tidak bergantung pada Telegram.** Yang belum masuk grup tetap dapat notifikasi WAM (lonceng dan push),
   dan MoM selalu bisa diunduh sebagai PDF atau disalin untuk WhatsApp.

## Hasil uji coba (12 November 2026)

Grup **Werkudara CoE · Center of Excellence** dibuat di akun pemilik, dengan bot sebagai satu-satunya anggota
lain. Bot berhasil mengirim satu contoh MoM yang ditandai "UJI COBA" (format HTML, tanpa pratinjau tautan).
Tampilannya di Telegram Web sesuai rancangan.

Temuan:

- Saat grup dibuat dengan bot langsung sebagai anggota, **bot tidak menerima update apa pun** (getUpdates
  kosong). ID grup diambil dari alamat Telegram Web lalu dicek lewat `getChat`. Karena itu, pemasangan grup di
  WAM harus memakai tautan `startgroup` dengan kode (bot menerima `/start@wam_werkudara_bot <kode>`), bukan
  menunggu update keanggotaan.
- Grup baru berjenis **grup biasa**. Topik (📝 MoM) baru ada setelah grup menjadi supergroup, dan saat itu ID grup
  berubah. Jadi grup diubah ke supergroup dan topiknya diaktifkan **sebelum** dipasang di WAM. Penanganan
  `migrate_to_chat_id` tetap dibuat untuk berjaga-jaga.
- Tanda ☐ tampil sebagai kotak polos, ☑ sebagai kotak centang berwarna. Keduanya terbaca jelas.

Uji tahap 1 di produksi (12 November 2026, setelah migrasi `202611120002` dijalankan), semuanya berhasil:

1. Admin WAM → Telegram membaca bot dari env Vercel, lalu **Pasang webhook** membuat statusnya aktif.
2. Grup CoE dinyalakan Topics, sehingga otomatis jadi supergroup. Bot dijadikan admin dengan empat hak saja: hapus
   pesan, undang lewat tautan, sematkan, dan kelola topik.
3. **Pasang grup** CoE lewat Cara 2 (perintah `/start@wam_werkudara_bot <kode>` di grup). Bot membalas "Grup ini
   terpasang di WAM untuk MoM Center of Excellence" dan membuat topik 📝 MoM sendiri.
4. **Kirim contoh MoM** masuk ke topik 📝 MoM.

Temuan:

- Telegram punya **label anggota (member tag) per grup** untuk admin, termasuk bot, misalnya "Notulen CoE" di
  samping nama WAM Werkudara. Ini menjawab keinginan "nama bot berbeda di tiap grup" tanpa membuat banyak bot.
  Label diisi saat bot dijadikan admin.
- Nama topik "📝 MoM" tampil dengan ikon 📝 dobel di Telegram Web, karena ikon topik juga memakai emoji yang sama.
  Kosmetik saja; bisa diganti nama topiknya jadi "MoM".

## Bot: satu bot untuk semua grup

Nama bot di Telegram berlaku sama di semua grup. Satu bot bisa masuk ke banyak grup sekaligus, jadi
**cukup satu bot** untuk 12 grup. Bot terpisah per departemen berarti 12 token, 12 webhook, dan 12 hal yang
bisa rusak, tanpa ada manfaat untuk penerima. Identitas departemen sudah terlihat dari nama grup dan kepala
setiap pesan ("📝 MoM · SM").

Isian BotFather (siap tempel):

| Isian | Usulan |
|---|---|
| Nama tampilan | **WAM Werkudara** |
| Username | **`@wam_werkudara_bot`**: dibuat 12 November 2026 di akun Telegram pemilik, dengan About, Description, dan Perintah sudah diisi |
| Foto profil | Logo Pegasus Werkudara di latar polos, seperti ikon aplikasi WAM |
| About (maks. 120 karakter) | Notulen (MoM) meeting Werkudara dari aplikasi WAM. |
| Description (layar sebelum Start) | Bot resmi WAM Werkudara. Bot ini mengirim notulen meeting (MoM) ke grup departemen dan tidak membaca obrolan. Pertanyaan: hubungi Admin WAM. |
| Perintah | `/start` Mulai · `/bantuan` Cara kerja bot |
| Privasi grup (Group Privacy) | **Tetap aktif**, sehingga bot tidak membaca obrolan grup |

Kalau di tiap grup ingin ada label khusus di samping nama bot (misalnya "Notulen SM"), Telegram punya
**gelar admin khusus** di supergroup. Ini dicoba saat uji, karena belum dipastikan bisa dipasang untuk bot.

## Grup per departemen

Pola nama: **Werkudara {singkatan} · {nama departemen}**. "Werkudara" di depan membuat semua grup muncul
bersama saat dicari, dan singkatannya terlihat walaupun nama panjang terpotong di daftar chat.

| Departemen (Data karyawan) | Nama grup | Orang |
|---|---|---|
| Sales & Marketing | Werkudara SM · Sales & Marketing | 18 |
| Center of Excellence | Werkudara CoE · Center of Excellence | 6 |
| Human Resources & General Affair | Werkudara HRGA · Human Resources & General Affair | 4 |
| Takshaka Event & Experience | Werkudara TEE · Takshaka Event & Experience | 4 |
| Business Operations | Werkudara BO · Business Operations | 4 |
| Corporate | Werkudara · Corporate | 3 |
| Strategic Sourcing | Werkudara SS · Strategic Sourcing | 3 |
| Corporate Finance Controller | Werkudara CFC · Corporate Finance Controller | 3 |
| Art & Creative Support | Werkudara ACS · Art & Creative Support | 3 |
| Accounting | Werkudara · Accounting | 3 |
| Business & Administrative Services | Werkudara BAS · Business & Administrative Services | 2 |
| Maha Raja Pratama | Werkudara MRP · Maha Raja Pratama | 2 |

- Jumlah orang adalah karyawan aktif per departemen utama (55 orang, 12 November 2026). Orang dengan
  pekerjaan di dua departemen (Data karyawan → Pekerjaan) diundang ke kedua grup.
- Singkatannya mengikuti aturan singkatan WAM, sama seperti di Linimasa dan Export.
- Grup ke-13: **Werkudara · HOD**, berisi semua HOD/Lead dan BOD, untuk MoM meeting antar HOD. Bot
  menyetujui permintaan gabung lewat undangan WAM hanya dari orang yang tercatat HOD/Lead (Data karyawan →
  Pekerjaan) atau BOD. HOD/Lead masuk dua grup: grup departemennya dan grup HOD.

### Pengaturan setiap grup

| Pengaturan | Nilai | Alasan |
|---|---|---|
| Jenis | Grup privat (supergroup) | Tidak bisa dicari orang luar |
| Topik (Topics) | Aktif: **📝 MoM** (tertutup, hanya admin dan bot yang menulis), **📢 Info**, **💬 Umum** | MoM tidak tenggelam di obrolan |
| Tambah anggota oleh anggota | Mati | Masuk hanya lewat undangan WAM |
| Tautan undangan umum | Mati | Undangan pribadi dari WAM yang dipakai |
| Riwayat chat untuk anggota baru | Terlihat | Karyawan baru bisa membaca MoM lama (keputusan pemilik) |
| Batasi penyimpanan konten | Mati | MoM memang boleh diteruskan |
| Deskripsi grup | "Grup resmi {departemen} Werkudara. MoM meeting masuk otomatis dari WAM di topik 📝 MoM." | |
| Foto grup | Logo Werkudara dengan warna atau singkatan departemen | Mudah dibedakan di daftar chat |

Hak bot sebagai admin (seminimal mungkin):

- **Undang lewat tautan**: untuk undangan pribadi dan menyetujui permintaan gabung.
- **Kelola topik**: untuk menulis di topik 📝 MoM yang tertutup.
- **Sematkan pesan**: untuk pesan selamat datang.
- **Keluarkan anggota**: hanya kalau pemilik memilih karyawan nonaktif dikeluarkan otomatis.
- Tidak perlu: ubah info grup, tambah admin, anonim.

## Masuk grup (karyawan)

Yang "memancing" ada di WAM, karena semua karyawan sudah memakai WAM:

1. Kartu di Beranda: **"Gabung grup Telegram Sales & Marketing"**, dengan dua langkah:
   - **Pasang Telegram**: tautan ke Play Store / App Store, dan langkah ini dilewati kalau sudah punya.
   - **Minta gabung**: membuka undangan pribadi orang itu ke grupnya.
2. Telegram menampilkan "Minta bergabung". Bot langsung menyetujui karena undangan itu milik karyawan
   departemen tersebut. Orang yang memakai undangan tanpa izin ditolak.
3. Kartu berubah menjadi **"Sudah di grup ✓ (sebagai @raja)"**. Orang dengan dua departemen melihat dua baris.
4. Kartunya tetap muncul (bisa diciutkan, tidak bisa ditutup) sampai semua grup orang itu sudah dimasuki.
   Lonceng WAM mengingatkan paling banyak sekali sehari, dan pemilik bisa mengirim pengingat dari Admin WAM.

Aturan undangan:

- Satu undangan per orang per grup, jenis "minta gabung", berlaku 7 hari dan dibuat ulang saat diketuk lagi.
- Bot hanya menyetujui permintaan yang datang lewat undangan WAM yang masih berlaku, milik karyawan aktif
  departemen itu, dan belum terpakai orang lain. Permintaan lain ditolak, dan Admin WAM melihatnya di daftar
  "Permintaan ditolak".
- Saat disetujui, WAM mencatat akun Telegram orang itu (ID dan nama) di karyawan tersebut. Kalau yang masuk
  ternyata orang lain, pemilik melihat nama Telegram-nya di daftar anggota dan bisa mengeluarkannya.
- Anggota yang masuk tanpa undangan WAM (misalnya ditambahkan langsung oleh owner) muncul sebagai
  **"Belum dikenali"** sampai dicocokkan dengan karyawan di Admin WAM.
- Anggota yang keluar dari grup: kartunya di WAM kembali ke "Minta gabung".
- Karyawan yang dinonaktifkan atau pindah departemen masuk daftar **"Perlu dikeluarkan"**. Mengeluarkannya
  otomatis atau manual diputuskan pemilik.

## Serah terima owner grup

Urutannya per grup:

1. Pemilik membuat grup dengan akun Telegram-nya sendiri dan mengatur seperti tabel di atas.
2. Bot ditambahkan sebagai admin lewat **Admin WAM → Telegram → Pasang grup** (tautan `startgroup` sekali
   pakai). WAM langsung tahu grup ini milik departemen mana.
3. Calon owner (usulan: HOD departemen itu, lihat Data karyawan) masuk lewat undangan WAM-nya, lalu
   dijadikan **admin** oleh pemilik.
4. Pemilik menekan **Transfer kepemilikan grup** di pengaturan admin orang itu.

Syarat Telegram untuk transfer, menurut panduan pihak ketiga (dicek ulang saat uji):

- Akun pemilik sudah memakai **verifikasi dua langkah minimal 7 hari**, dan sudah masuk di perangkat itu lebih
  dari 24 jam. Jadi aktifkan verifikasi dua langkah **sekarang**, sebelum grup dibuat.
- Penerima harus sudah menjadi admin.

Setelah transfer:

- Minta owner baru tetap menjadikan pemilik dan bot sebagai admin. Owner bisa mengeluarkan siapa pun, termasuk
  bot.
- Kalau bot dikeluarkan atau haknya dicabut, WAM langsung tahu, dan Admin WAM menampilkan peringatan
  "Bot tidak lagi di grup Werkudara SM". Selama itu MoM departemen tersebut hanya lewat notifikasi WAM.
- HOD yang memimpin dua departemen menjadi owner dua grup.

## Ke mana MoM dikirim

| Meeting | Grup yang menerima |
|---|---|
| Meeting biasa, satu departemen atau lintas departemen | Grup departemen semua peserta (sekali per grup) |
| Meeting antar HOD: **Meeting HOD/Lead** atau **ITEM** (mis. HRGA x CoE) | **Grup HOD saja**, tidak ke grup departemen |
| Ditandai **Jangan kirim ke Telegram** oleh notulis | Tidak ada; hanya notifikasi WAM untuk peserta |

- "Antar HOD" mengikuti jenis yang dipilih pemesan di form booking (HOD atau ITEM), bukan ditebak dari
  daftar peserta. Dengan begitu tujuannya bisa diduga dan tidak bocor ke grup departemen.
- Di lembar Kirim MoM, tujuan tampil sebagai pilihan yang sudah tercentang sesuai aturan ini. Notulis boleh
  menghapus centang, tetapi tidak bisa menambah grup di luar aturan.

- Isi MoM terlihat oleh **seluruh anggota grup departemen**, termasuk yang tidak ikut meeting. Itu konsekuensi
  grup per departemen. Meeting yang tidak boleh dibaca satu departemen memakai **Jangan kirim ke Telegram**.
- Peserta yang belum masuk grup tetap mendapat notifikasi WAM "MoM … sudah masuk".
- Pesan pribadi dari bot ke karyawan **tidak dipakai di tahap ini**. Bot hanya bisa mengirim pesan pribadi ke
  orang yang sudah menekan Start. Ini bisa ditambahkan nanti untuk pengingat tugas PIC.

## Contoh pesan (di topik 📝 MoM)

```
📝 MoM · SM · Appraisal team SS
Sales & Marketing · Senin, 10 November 2026
11.00–12.30 WIB · CFC Ananta Room
Peserta (5): Raja Pratama, Sofyan Hadi, Kayana Putri, Dimas Arya, Nadia Sari
Notulis: Raja Pratama

Ringkasan
Penilaian kinerja tim SS kuartal 3 dibahas per orang. Target konten
Q4 naik 20%.

Keputusan
1. KPI Q4 memakai format baru dari HR.
2. Evaluasi tengah kuartal dilakukan 15 Desember.

Tindak lanjut
☐ Kirim draf KPI ke HR — Sofyan Hadi · tenggat Jum, 14 Nov
☐ Jadwalkan 1-on-1 lanjutan — Raja Pratama · tenggat Rab, 19 Nov
☑ Rekap nilai Q3 — Kayana Putri

Buka di WAM: journey.werkudara.group/wam/sessions/…
Versi 1 · dikirim 10 Nov 2026, 13.05 WIB lewat WAM
```

- Format HTML Telegram: judul bagian ditebalkan, nama PIC ditebalkan, tanpa pratinjau tautan.
- Tautan ditulis sebagai teks di badan pesan, bukan hanya sebagai tombol, karena tombol belum tentu ikut saat
  pesan diteruskan.
- Telegram menandai terusan dengan "Diteruskan dari WAM Werkudara", jadi atasan tahu sumbernya resmi.
- Setelah disunting, baris terakhir menjadi "Versi 2 · diperbarui 11 Nov 2026, 09.10 WIB oleh Raja Pratama".
  Terusan lama tidak ikut berubah, jadi nomor versi membantu atasan tahu mana yang terbaru.

### MoM yang panjang

Satu pesan Telegram maksimal 4.096 karakter, padahal ringkasan dan keputusan masing-masing boleh 4.000
karakter, ditambah 30 tindak lanjut. Kalau hasilnya terlalu panjang:

- Pesan berisi kepala, **semua tindak lanjut**, dan keputusan yang dipotong rapi di akhir kalimat, ditambah
  "Lengkapnya di PDF terlampir".
- PDF MoM lengkap dikirim sebagai **satu dokumen** tepat di bawahnya. Saat MoM berubah, dokumennya diganti di
  tempat, bukan dikirim baru.
- Batas aman 3.900 karakter, dihitung dalam satuan UTF-16 karena emoji dihitung lebih dari satu.

## Alur notulis

1. Selama meeting, notulis menulis lalu menekan **Simpan draf**. Draf tidak dikirim ke mana pun.
   - Peserta lain melihat "Draf oleh Raja, belum dikirim".
   - HOD/BOD yang hanya membaca melihat "MoM sedang ditulis".
2. Setelah selesai, notulis menekan **Kirim MoM**. Lembar konfirmasi menampilkan:
   - pratinjau pesan persis seperti yang akan muncul di grup;
   - tujuannya, misalnya "Grup Werkudara SM dan Werkudara CoE, plus notifikasi WAM untuk 2 peserta yang belum
     di grup";
   - pilihan **Jangan kirim ke Telegram**;
   - peringatan kalau meeting belum selesai: "Meeting belum selesai (selesai 12.30). Tetap kirim?"
3. Setelah terkirim, panel MoM menunjukkan status per grup (terkirim atau gagal) dengan tombol **Kirim ulang
   yang gagal**.
4. Perubahan sesudahnya disimpan dengan **Simpan perubahan**. Pesan di grup disunting tanpa bunyi dan versinya
   naik.
5. Untuk perubahan besar ada **Kirim sebagai versi baru**: pesan baru yang membalas pesan lama ("Versi 2
   menggantikan versi sebelumnya"), sehingga semua orang mendapat notifikasi lagi.

Status MoM menjadi: tidak wajib, setelah meeting, belum diisi, **draf**, sudah dikirim. Draf belum dihitung
sebagai MoM masuk di Ringkasan dan Jadwal sesi.

## Meneruskan ke atasan

1. **HOD sudah ada di grup departemennya**, jadi MoM departemen langsung sampai ke HOD. MoM antar HOD masuk
   grup HOD, yang juga berisi BOD.
2. **Teruskan di Telegram**: pesannya sudah lengkap dan netral.
3. **Unduh PDF** di panel MoM, untuk dikirim lewat WhatsApp atau email.
4. **Salin untuk WhatsApp** di panel MoM: teks yang sama dengan format WA (`*tebal*`), dengan tombol Salin dan
   Kirim ke WhatsApp, seperti Export Linimasa.

Atasan dari departemen lain yang membuka tautan WAM tetap melihat "Sesi tidak ditemukan", kecuali aturan baca
MoM diperluas ke atasan langsung para peserta (keputusan pemilik). Isi lengkapnya tetap ada di pesan.

## Admin WAM → Telegram

- **Status bot**: nama, webhook aktif atau tidak, error terakhir, dan tombol **Pasang ulang webhook**.
- **Grup**: daftar 12 grup departemen dan grup HOD dengan status bot di dalamnya (admin, haknya lengkap, atau
  dikeluarkan), tombol **Pasang grup**, dan **Lepas**.
- **Anggota per departemen**: sudah masuk / belum / belum dikenali / perlu dikeluarkan, dengan **Ingatkan yang
  belum** (notifikasi WAM, paling banyak sekali sehari).
- **Permintaan ditolak**: siapa mencoba masuk tanpa undangan yang sah.
- Grup yang berubah menjadi supergroup berganti ID. WAM memperbaruinya sendiri.

## Keandalan

- **Simpan dulu, kirim sesudahnya.** MoM disimpan, lalu pengiriman dicatat sebagai antrean per grup dan
  dikirim setelah jawaban ke notulis (`after()` Next.js). Kalau Telegram lambat atau mati, simpan tetap
  berhasil.
- **Tidak dobel.** "Kirim MoM" hanya berlaku sekali. Server menandai terkirim dengan syarat "belum pernah
  dikirim" dalam satu perintah, dan antrean unik per (MoM, grup).
- **Bentrok penyuntingan.** Simpan membawa waktu versi yang dilihat penulis. Kalau orang lain sudah menyimpan
  lebih dulu, simpan ditolak: "Notulen sudah diubah Sofyan pukul 14.02. Muat ulang dulu."
- **Gagal dicoba lagi**: pada simpan berikutnya, lewat tombol Kirim ulang yang gagal, dan lewat cron harian
  08.00 WIB (Vercel Cron dengan `CRON_SECRET`).
- **Arti jawaban Telegram:**

| Jawaban Telegram | Tindakan |
|---|---|
| 429 terlalu cepat (`retry_after`) | Tunggu sesuai `retry_after`, lalu ulang |
| 403 bot dikeluarkan dari grup | Grup ditandai bermasalah dan muncul di Admin WAM, tidak diulang |
| 400 `migrate_to_chat_id` | ID grup diperbarui, lalu ulang |
| 400 "message is not modified" | Dianggap berhasil |
| 400 pesan yang mau disunting sudah dihapus admin | Kirim pesan baru |
| 400 topik tidak ada atau ditutup untuk bot | Kirim ke Umum, lalu peringatan di Admin WAM |
| Lainnya, atau timeout | Dicatat gagal dan diulang nanti, paling banyak 5 kali |

- **Batas kecepatan**: Telegram menyarankan sekitar 1 pesan per detik per obrolan dan 20 per menit per grup.
  Satu MoM hanya menghasilkan beberapa pesan, jadi jauh dari batas.
- **Webhook**: hanya menerima permintaan dengan header `X-Telegram-Bot-Api-Secret-Token` yang cocok. Update
  yang terkirim ulang tidak berefek dua kali. Pesan pribadi selain /start dan /bantuan dijawab singkat: "Bot ini
  hanya mengirim MoM dari WAM."

## Kasus tepi lain

| Kejadian | Penanganan |
|---|---|
| Judul, jam, atau ruang sesi diubah setelah MoM terkirim | Pesan disunting tanpa bunyi |
| Sesi dibatalkan setelah MoM terkirim | Pesan disunting dengan baris "Sesi ini dibatalkan pada …" |
| Departemen dipakai di WAM tapi belum punya grup | MoM hanya lewat notifikasi WAM. Admin WAM menampilkan "Belum ada grup" |
| Nama departemen diubah di Data karyawan | Grup terikat ke departemen lewat WAM, jadi ikut berpindah. Nama grup di Telegram diganti owner |
| Karyawan baru | Muncul di "Belum masuk" dan mendapat kartu Gabung grup di Beranda |
| Deployment preview Vercel | Webhook hanya ke produksi. Uji lokal memakai bot terpisah |
| Token bot bocor | Cabut di BotFather, ganti env, tekan Pasang ulang webhook. Grup dan anggota tetap |

## Keamanan dan privasi

- Token bot, username bot, dan rahasia webhook disimpan di env Vercel (`TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`), tidak di repo dan tidak di chat. Uji lokal memakai bot
  terpisah.
- ID dan nama Telegram karyawan adalah data pribadi. Disimpan di tabel yang hanya dibaca server (RLS service
  role) dan hanya tampil di Admin WAM.
- Telegram tidak memakai enkripsi ujung ke ujung untuk grup. Isi pesan tersimpan di server Telegram, dan
  pesan yang sudah diteruskan tidak bisa ditarik. Karena itu ada **Jangan kirim ke Telegram** per MoM, dan
  1-on-1 memang tidak punya MoM.
- Group Privacy bot tetap aktif, jadi bot tidak membaca obrolan anggota.
- Tidak perlu nomor HP karyawan.

## Data (migrasi baru, dijalankan pemilik)

`supabase/migrations/2026111200NN_pw_telegram.sql` (LOCAL REVIEW ONLY, dengan catatan ROLLBACK). Nomornya
setelah `202611120001_pw_minutes_rule.sql`, migrasi aturan wajib MoM dari sesi lain yang sedang dikerjakan.

- `pw_session_minutes` + kolom `sent_at`, `sent_by`, `version` (mulai 1), `telegram_off`: dibuat sesi lain di
  migrasi `202611120003`, bersama form MoM baru (FRM.05.00.00.027: butir agenda, hadir/tidak hadir, meeting
  berikutnya, foto) dan simpan atomik yang mempertahankan status tindak lanjut. Telegram cukup membaca kolom itu
  dan memakai titik kait "Kirim MoM" dari sesi tersebut.
- `pw_telegram_groups`: `chat_id` (PK), `title`, `scope` (`departemen` atau `hod`), `department`,
  `mom_topic_id`, `bot_status`, `added_by`, `active`.
- `pw_telegram_members`:
  - `employee_id`, `chat_id`, `telegram_user_id`, `telegram_name`, `invite_link`, `invite_expires_at`;
  - `status`: `diundang`, `bergabung`, `keluar`, `ditolak`, `belum-dikenali`;
  - `joined_at`.
  - Unik per (`employee_id`, `chat_id`).
- `pw_telegram_codes`: kode sekali pakai untuk memasang grup (`code_hash`, `scope`, `department`,
  `expires_at`, `used_at`).
- `pw_telegram_messages` (antrean): `session_id`, `chat_id`, `message_id`, `document_id`, `version`, `status`,
  `attempts`, `error`, `sent_at`. Unik per (`session_id`, `chat_id`).
- Fungsi `pw_save_minutes(...)` agar simpan MoM dan tindak lanjut terjadi dalam satu transaksi.

**Sebelum migrasi dijalankan:** MoM bekerja seperti sekarang, kartu Gabung grup dan tombol Telegram tidak
muncul, dan Admin WAM menulis "Telegram menunggu migrasi".

## Perbaikan yang ikut dikerjakan

Ditemukan saat membaca kode MoM sekarang:

- Setiap simpan menghapus lalu membuat ulang tindak lanjut, sehingga **waktu dan orang yang mencentang
  "selesai" tertimpa**. Akan dipertahankan.
- Hapus dan buat ulang itu tidak dalam satu transaksi, jadi kalau gagal di tengah tindak lanjut bisa hilang.
  Diselesaikan dengan `pw_save_minutes`.

## Berkas yang akan dibuat atau diubah

- Murni dan diuji:
  - `src/lib/pra-wam/minutes-message.ts`: pesan Telegram HTML, teks WhatsApp, pemotongan, versi, jam tenang.
  - `src/lib/pra-wam/telegram-groups.ts`: nama grup, grup tujuan MoM, aturan persetujuan undangan.
- Server:
  - `src/lib/server/telegram.ts`: klien Bot API dengan peta jawaban di atas.
  - `src/lib/server/pra-wam/telegram-groups.ts`: pasang grup, undangan, persetujuan, anggota.
  - `src/lib/server/pra-wam/minutes-delivery.ts`: antrean, kirim, sunting, kirim ulang.
  - `src/lib/server/pra-wam/minutes.ts`: draf/kirim, versi, cek bentrok, perbaikan centang.
  - `src/lib/server/pra-wam/minutes-pdf.ts`: PDF MoM dengan pdf-lib, seperti `schedule-pdf.ts`.
- API:
  - `api/telegram/webhook`;
  - `api/wam/telegram/invite`;
  - `api/wam/sessions/[id]/minutes/send` dan `…/minutes/pdf`;
  - `api/admin/wam/telegram`;
  - `api/cron/minutes`.
- Tampilan:
  - `MinutesPanel.tsx`: Simpan draf, Kirim MoM dengan pratinjau, status grup, PDF, salin WA;
  - kartu Gabung grup Telegram di Beranda WAM;
  - Admin WAM → Telegram.
- `vercel.json`: satu cron harian.
- `docs/aturan-wam.md` bagian 7b dan `brain/keputusan.md`, setelah disetujui.

## Pengujian

- Modul pesan:
  - escape `<`, `>`, `&`, baris baru, dan emoji;
  - netral (tanpa "kamu");
  - panjang maksimum dan pemotongannya;
  - tindak lanjut selesai dan belum, dengan dan tanpa tenggat;
  - jam tenang;
  - format WA.
- Grup tujuan: meeting biasa, lintas departemen, ITEM dan meeting HOD (hanya grup HOD), peserta dua
  departemen, departemen tanpa grup, centang tujuan dihapus, Jangan kirim ke Telegram.
- Undangan grup HOD: hanya HOD/Lead dan BOD yang disetujui.
- Persetujuan undangan:
  - undangan sah disetujui;
  - undangan kedaluwarsa, milik karyawan nonaktif, atau departemen lain ditolak;
  - undangan yang dipakai dua kali;
  - anggota tanpa undangan menjadi "belum dikenali".
- Klien Telegram dengan `fetch` palsu: setiap baris tabel jawaban di atas.
- Pengiriman: klik dobel menghasilkan satu kali kirim, sunting menyunting pesan yang sama, versi baru, dan
  keadaan sebelum migrasi.
- Webhook: rahasia salah ditolak, bot dikeluarkan, perpindahan supergroup, dan update yang terkirim ulang.
- Simpan: bentrok versi ditolak, centang selesai tidak tertimpa.
- Tampilan (DOM): draf ke kirim, pratinjau, status grup, kartu Gabung grup, Admin WAM → Telegram.
- Uji nyata sebelum dibuka: bot uji, satu grup uji dengan topik, dua akun uji. Gabung lewat undangan, undangan
  dipakai orang lain, kirim, sunting, versi baru, MoM panjang dengan PDF, bot dikeluarkan, lalu teruskan ke
  akun lain dan cek tampilannya. Gelar admin khusus untuk bot dan transfer owner juga dicoba di sini.

## Peluncuran bertahap

1. **Sekarang:** pemilik mengaktifkan verifikasi dua langkah di akun Telegram-nya (syarat transfer owner
   7 hari).
2. Pemilik membuat bot di BotFather dan memasukkan env di Vercel. Migrasi dijalankan.
3. Saya kerjakan kodenya dan uji dengan grup uji.
4. Pemilik membuat 12 grup departemen dan grup HOD, lalu memasang bot lewat Admin WAM → Telegram.
5. Kartu Gabung grup dibuka untuk semua karyawan, diumumkan lewat Pengumuman WAM. Progres dipantau di Admin
   WAM.
6. HOD dijadikan admin, lalu kepemilikan grup ditransfer.
7. Setelah berjalan: pengingat tugas PIC lewat pesan pribadi (tahap berikutnya).

## Belum termasuk (tahap berikutnya)

- Pengingat pagi ke PIC untuk tindak lanjut yang jatuh tempo atau terlambat, lewat pesan pribadi bot.
- Pengingat ke notulis kalau MoM belum dikirim sehari setelah meeting.
- Tombol "Tandai selesai" langsung dari Telegram.

## Keputusan yang perlu dari pemilik

1. ~~Grup Pimpinan~~ → diputuskan: satu grup HOD bersama untuk MoM antar HOD.
2. ~~MoM meeting HOD/Lead~~ → diputuskan: hanya ke grup HOD.
3. **Owner setiap grup**: HOD departemennya (usulan), atau orang lain? Siapa owner **grup HOD**? (Pemilik
   menentukan nanti. Tidak menghambat kode, karena transfer owner dilakukan manual di Telegram.)
4. **Nama**: bot "WAM Werkudara" dan pola grup "Werkudara {singkatan} · {departemen}" disetujui?
5. **Karyawan nonaktif atau pindah departemen**: dikeluarkan otomatis oleh bot, atau hanya ditandai untuk
   dikeluarkan owner?
6. **Riwayat chat** terlihat untuk anggota baru: ya atau tidak?
7. **Siapa yang boleh menekan Kirim MoM**: semua peserta (seperti menulis sekarang), atau hanya notulis pertama
   dan pemesan?
