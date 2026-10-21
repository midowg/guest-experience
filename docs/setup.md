# Panduan setup

Proyek Supabase: `eizhomocgggmwsydhrow`. Aplikasi di-deploy ke Vercel.

## 1. Environment

Salin `.env.example` menjadi `.env.local`, lalu isi dari Supabase Dashboard → Project Settings → API keys.

| Variabel | Sumber | Catatan |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Boleh terlihat publik. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable/anon key | Boleh terlihat publik. Dibatasi oleh RLS. |
| `SUPABASE_SECRET_KEY` | Secret/service-role key | **Rahasia.** Hanya di server. Jangan pernah diberi awalan `NEXT_PUBLIC_`. |
| `RATE_LIMIT_SECRET` | Buat sendiri, acak minimal 32 karakter | Menyamarkan identitas jaringan pada pembatasan laju. |
| `ADMIN_PASSWORD` | Buat sendiri, minimal 8 karakter | **Rahasia.** Password bersama untuk masuk ke `/admin`. Mengganti nilainya mengeluarkan semua sesi. |
| `ADMIN_SESSION_SECRET` | Buat sendiri, acak minimal 32 karakter | **Rahasia.** Menandatangani cookie sesi admin. |
| `SUPER_ADMIN_PASSWORD` | Opsional, minimal 8 karakter, berbeda dari `ADMIN_PASSWORD` | **Rahasia.** Password super admin, yang bisa menyembunyikan acara dari admin biasa. |

`.env*` sudah masuk `.gitignore`, kecuali `.env.example` yang hanya berisi template. Jangan mengirim kunci apa pun melalui chat. `NEXT_PUBLIC_SITE_URL` adalah alamat publik situs (di produksi `https://invitation.werkudara.group`). Dipakai untuk gambar pratinjau tautan WhatsApp dan isi QR undangan. Bila kosong, Vercel memakai domain produksinya, dan lokal memakai `http://localhost:3000`.

Di Vercel, isi semuanya pada Project Settings → Environment Variables untuk **Production** (dan Preview jika kelak digunakan), lalu deploy ulang. Variabel `NEXT_PUBLIC_*` dibekukan pada saat build, sehingga perubahan nilainya memerlukan build/deploy baru. Tanpa variabel ini, aplikasi menampilkan status "belum terhubung" dan **tidak** memakai data contoh. Lihat [rencana deployment berbasis tag](deployment.md); workflow deploy belum dibuat.

## 2. Migrasi database

Instalasi baru: jalankan seluruh migrasi `supabase/migrations/` menurut nama berkas secara berurutan. Untuk instalasi yang sudah berjalan, terapkan hanya berkas migrasi yang belum diterapkan, termasuk `202610110001_personal_invitations.sql` bila ingin memakai undangan per tamu. Jangan jalankan ulang seed karena bisa menimpa konten yang sudah diedit. **Migrasi personal belum diterapkan oleh perubahan kode ini**; tinjau dan minta izin tersendiri sebelum menerapkannya ke Supabase remote.

Tinjau isinya sebelum diterapkan. Setelah disetujui, jalankan melalui Supabase Dashboard → SQL Editor, atau Supabase CLI. Migrasi membuat tabel acara, rundown, pertanyaan survei, RSVP, feedback, audit, dan pembatasan laju, lengkap dengan Row Level Security.

Yang dijamin skema ini:
- Tamu anonim hanya membaca acara berstatus `published`.
- Database menolak pembacaan RSVP/feedback langsung oleh anon. Panel dan API admin aplikasi dilindungi password admin (lihat bagian 3).
- Tidak ada izin tulis langsung dari browser; penulisan hanya lewat fungsi transaksional yang diperiksa.
- Pertanyaan survei yang sudah menerima jawaban tidak dapat diubah.

## 3. Login admin dan log akses

`/admin` dan semua `/api/admin/*` memerlukan **password admin** dari `ADMIN_PASSWORD`. Tanpa `ADMIN_PASSWORD` (minimal 8 karakter) dan `ADMIN_SESSION_SECRET` (minimal 32 karakter) panel **terkunci** dan halaman login menampilkan petunjuk pengaturan. Setelah masuk, sesi berlaku 12 jam (cookie httpOnly `wk_admin`). Percobaan login dibatasi 5 per 10 menit per IP.

Pemeriksaan berlapis: `src/proxy.ts` menolak permintaan tanpa sesi, lalu setiap halaman dan route admin memeriksa sesi lagi.

Setiap login berhasil, password salah, dan keluar dicatat di tabel `admin_access_log` (migrasi `202610200001_admin_access_log.sql`) dan dapat dilihat di **Log akses** (`/admin/akses`): waktu, IP, perkiraan kota/wilayah/negara dari header Vercel, browser dan OS, serta **ID perangkat** acak yang tersimpan di cookie `wk_device` (berlaku 2 tahun). Perangkat yang pertama kali berhasil masuk diberi tanda **Perangkat baru**. Keterbatasan yang perlu dipahami:
- Password dipakai bersama, jadi log menunjukkan perangkat dan lokasi, bukan nama orang.
- Browser tidak dapat membaca nomor seri, MAC, atau kode perangkat keras laptop. ID perangkat berganti bila cookie dihapus, memakai mode penyamaran, atau browser lain.
- Lokasi berasal dari IP (perkiraan) dan hanya tersedia saat berjalan di Vercel. Di lokal kolom lokasi kosong.
- Sebelum migrasi log diterapkan, login tetap berjalan tetapi belum tercatat; halaman Log akses memberi peringatan.
- Log hanya bisa ditambah oleh server (tanpa izin ubah/hapus). Hapus catatan lama secara manual lewat SQL Editor bila diperlukan.

Bila password bocor: ganti `ADMIN_PASSWORD` di Vercel lalu deploy ulang; semua sesi lama otomatis tidak berlaku.

**Super admin (migrasi `202610200005_admin_roles.sql`).** Login dengan `SUPER_ADMIN_PASSWORD` di halaman login yang sama memberi peran super admin (lencana *Super admin* di bilah atas, dicatat di Log akses). Setelah login, super admin langsung masuk ke **Dashboard super admin** (`/admin/super`, juga lewat tautan di bilah atas): ringkasan jumlah acara, pencarian, saringan Terlihat/Disembunyikan, sakelar *Terlihat oleh admin* per acara, dan pilih banyak acara untuk disembunyikan atau ditampilkan sekaligus. Panel acara biasa tetap bisa dibuka; di sana acara tersembunyi hanya diberi label. Admin biasa yang membuka `/admin/super` mendapat halaman tidak ditemukan.

**Modul untuk admin biasa (migrasi `202610200006_admin_modules.sql`).** Di bagian *Modul admin* dashboard super admin, setiap modul acara punya sakelar *Boleh/Mati*: Pengalaman kunjungan, Rundown, Lokasi, Panduan rute bergambar, Galeri foto lokasi, Persiapan tamu, Our Team, RSVP, Tautan per tamu, Kontak PIC, Dua bahasa/English, Survei feedback, Ulasan Google, dan Ajakan kolaborasi. Modul yang dimatikan tidak tampil di editor maupun survei Buat acara untuk admin biasa, dan dibuang dari draf baru (templat, draf kosong, atau salinan). Server menolak penyimpanan yang menyalakan modul itu. Acara lama yang sudah memakainya tetap utuh dan diberi catatan; admin boleh mengubah atau mematikannya, tetapi tidak menyalakannya lagi. Halaman tamu tidak terpengaruh, dan super admin tetap bisa memakai semua modul. Acara tersembunyi tidak muncul di daftar admin biasa, tidak bisa dibuka, disalin, atau diubah lewat API oleh mereka (dijawab *tidak ditemukan*). Halaman tamu tidak berubah: acara yang dipublikasikan tetap bisa dibuka lewat tautannya. Penanda sembunyi disimpan di baris acara, di luar konten, sehingga menyimpan acara tidak mengubahnya; setiap sembunyi/tampil tercatat di `event_audit`. Tanpa `SUPER_ADMIN_PASSWORD` tidak ada super admin. Mengganti atau menghapus password ini mengakhiri sesi super admin tanpa mengeluarkan admin biasa.

Operasi database memakai service-role client **hanya di server**. Jangan pernah membagikan secret key ke browser. Migrasi 007 memberi RPC pengelolaan izin service_role; aturan publikasi, pertanyaan terjawab dan larangan menghapus acara featured tetap berlaku. Audit acara mempunyai actor_id null karena tidak ada akun per orang. Akun/keanggotaan Supabase lama tidak dipakai lagi dan tidak dihapus otomatis.

URL Preview Vercel memakai password yang sama bila variabelnya diisi untuk Preview; tanpa variabel itu, admin di Preview terkunci.

Jika branch `dev` dan `master` memakai satu project Supabase, perubahan undangan, unggahan, dan data tamu pada Preview akan langsung memengaruhi Production. Jangan menguji aksi hapus atau mengirim data RSVP contoh ke database bersama.

## 4. Menjalankan secara lokal

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint
npm run typecheck
npm test
npm run build
```

Setelah tim mengubah `docs/wording-draf.xlsx`, jalankan `npm run wording` untuk memperbarui kamus teks tamu, lalu jalankan tes. Skrip menolak kunci ganda, teks Indonesia yang kosong, atau variabel yang tidak dikenal.

Halaman `/dev-preview` adalah pemeriksaan tampilan untuk pengembangan dan tidak dapat diakses pada build produksi.

## 5. Alur penggunaan

1. Buka `/admin` dan masuk dengan password admin.
2. Buat acara, isi undangan, rundown, lokasi, dan pengaturan.
3. Periksa `/admin/events/<id>/preview` — menampilkan versi tersimpan, pengiriman dinonaktifkan.
4. Ubah status menjadi **Dipublikasikan** dan simpan.
5. Bagikan tautan `/e/<slug>` kepada tamu.
6. Pantau jawaban di tab RSVP dan Feedback; unduh CSV bila diperlukan.

Mengubah slug membuat tautan lama tidak berlaku. Semua waktu memakai WIB.

### Undangan per tamu

Acara lama tetap memakai mode **Tautan umum**. Untuk undangan individual, pilih **Tautan per tamu** pada editor, simpan, lalu buka tab **Undangan tamu** untuk menambah nama sapaan satu per satu (maksimal 1000 per acara). Salin tautan aktif setiap tamu dan bagikan secara individual; jangan kirim daftar tautan. Halaman `/e/<slug>` tetap menampilkan informasi acara, tetapi RSVP umumnya disembunyikan. Undangan individual memakai `/e/<slug>/i/<token>`: siapa pun yang memegang tautan dapat melihat jawaban sebelumnya dan mengubah RSVP sampai batas penutupan. Ini **bukan** verifikasi identitas ataupun check-in di lokasi. Cabut tautan untuk menonaktifkannya; terbitkan ulang untuk mengganti token lama tanpa menghapus RSVP.

**Impor, WhatsApp, dan status (migrasi `202610200003_guest_operations.sql`).** Di tab Undangan tamu:
- **Impor dari Excel / Google Sheets / CSV:** salin kolom Nama, Nomor WA, dan Pendamping (0–9), tempel, periksa pratinjau (baris bermasalah dan kemungkinan duplikat ditandai), lalu impor. Maksimal 500 baris sekali impor dan 1000 tamu per acara. Dari Excel, simpan sebagai *CSV UTF-8* bila ingin mengunggah berkas.
- **Kirim via WhatsApp:** tombol membuka obrolan `wa.me` dengan pesan undangan terisi (teksnya dari kamus wording, kunci `wa.invite`, `wa.reminder`). Panitia tetap menekan Kirim di WhatsApp; aplikasi hanya mencatat *Dikirim* saat tombol diklik, bukan bukti pesan sampai. Kirim massal berjalan berurutan, satu klik per tamu, karena browser memblokir banyak tab sekaligus.
- **Kirim pengingat** menyasar tamu aktif yang belum menjawab, dengan batas RSVP bila ada.
- **Status dibuka** dicatat dari browser tamu setelah halaman tampil (sekali per sesi browser). Pratinjau link WhatsApp dan pratinjau admin tidak dihitung.
- Sebelum migrasi diterapkan, daftar tetap tampil dan tamu bisa ditambah satu per satu; nomor WA, pendamping, impor, dan status menunggu migrasi.

**Penting:** siapa pun yang memegang password admin dapat membaca nama, token, dan data RSVP, membuat/mencabut tautan, atau mengubah acara; bagikan password hanya kepada panitia yang perlu. Token acak hanya mengaitkan jawaban ke undangan. Feedback tetap anonim dan tidak diikat ke tamu. Setelah migrasi `202610200004_rsvp_needs.sql`, RSVP menanyakan jumlah pendamping (tautan personal), kebutuhan makanan dan akses, dan opsi tidak ditampilkan di foto; semuanya tampil di tab RSVP dan CSV. Sebelum migrasi itu, form hanya menanyakan alergi makanan.

Untuk kembali ke alur umum, ubah mode menjadi **Tautan umum** dan simpan. Data undangan serta jawaban personal lama tetap tersimpan dan diberi label berbeda pada RSVP/CSV; tautan personal berhenti berlaku saat mode umum aktif. Mengaktifkan kembali mode personal memungkinkan tautan aktif dipakai lagi, kecuali sudah dicabut atau diterbitkan ulang. Jangan menghapus acara bila ingin menjaga data RSVP. Migrasi personal perlu diterapkan sebelum mode ini dipakai; jika belum, pengelolaan tautan dan RSVP personal akan gagal.

### Konten e-guide opsional

Editor menyediakan pengantar kontak, jabatan dan organisasi PIC, pengantar survei, serta judul/deskripsi/teks tombol ulasan Google. Bila dibiarkan kosong, konten yang sudah ada tetap memakai tampilan dan redaksi sebelumnya. Kontak hanya tampil bila nama dan nomor diisi dan bagian Kontak diaktifkan; survei tetap memerlukan pertanyaan; ulasan Google tetap memerlukan URL HTTPS dan pilihan aktif. Survei internal bukan pesan WhatsApp kepada PIC.

Bagian **Our Team** memakai teks tetap tentang lingkungan kerja Werkudara yang inklusif. Bagian ini **nonaktif secara default** termasuk pada acara lama. Aktifkan lewat Urutan & tampilan bagian. Foto tim boleh ditambahkan kemudian melalui unggahan atau tautan HTTPS; isi deskripsi foto untuk aksesibilitas. Tanpa foto, teks tetap dapat tampil. Foto dan teks yang dipublikasikan perlu persetujuan penyelenggara. Form RSVP hanya menanyakan alergi makanan, bukan seluruh preferensi makanan atau kebutuhan aksesibilitas; arahkan kebutuhan lain kepada PIC melalui kanal kontak yang tersedia. Penambahan konten ini disimpan pada JSONB acara dan tidak memerlukan migrasi database baru.

### Program dan Trip klien (jadwal beberapa hari)

Rundown yang melewati lebih dari satu tanggal (menurut zona acara) tampil sebagai tab **Hari 1, Hari 2, …** di halaman tamu; saat Hari H, tab hari ini langsung terbuka. Di editor, setiap sesi punya bagian **Tambahan (opsional)**: lokasi kegiatan, cuplikan *Kenali lebih dekat*, isi kotak *Tahukah Anda?*, cerita lengkap, dan halaman di PDF presentasi (isi dulu *PDF presentasi* di atas daftar sesi). Durasi dihitung otomatis dari jam mulai dan selesai. Blok Kontak punya **Kontak darurat (opsional)**: nomor darurat dan rumah sakit terdekat, tampil sebagai kartu merah di bagian Kontak dan halaman Hari H. Semua isian ini disimpan di konten acara dan tidak memerlukan migrasi; terjemahan English untuk isian tambahan belum tersedia.

Halaman tamu `/e/…` menyimpan salinan terakhirnya di perangkat (service worker `public/sw.js`, hanya di produksi), sehingga jadwal tetap terbuka saat sinyal hilang. Admin dan API tidak disimpan.

### Jenis acara, tema, dan fase

Blok **Jenis, audiens, dan tampilan** di editor menentukan:

- **Jenis acara** (Kunjungan, Acara, Program). Jenis mengubah label pembuka undangan.
- **Audiens**. Acara **Internal** tidak pernah menampilkan ulasan Google maupun ajakan kolaborasi.
- **Tema** (Werkudara, Pulang ke Rumah Nenek, Malam Apresiasi, Khidmat, Segar) dan **sudut** (persegi atau lembut). Tema hanya mengganti warna, huruf judul, dan sudut; urutan halaman, tombol, ukuran teks, dan lapisan redup foto tetap sama. Nilai tema ada di `src/lib/themes.ts` dan diuji kontras WCAG AA.
- **Fase**. Bawaannya *Otomatis* menurut tanggal WIB:
  - sebelum tanggal mulai: undangan;
  - pada tanggal acara (seluruh tanggal untuk Program beberapa hari): panduan "Hari ini" dengan jadwal hari itu dan penanda sesi yang sedang berlangsung;
  - mulai keesokan hari setelah tanggal selesai: halaman terima kasih.

Hospitality dapat mengunci fase secara manual. Preview undangan menyediakan tombol untuk melihat ketiga fase.

Konten baru (Pengalaman kunjungan, panduan rute bergambar di bagian Lokasi, catatan hari H, halaman setelah acara) disimpan pada JSONB acara tanpa migrasi database. Acara lama memakai nilai bawaan: jenis Acara, audiens Eksternal, tema Werkudara, fase Otomatis, dan bagian Pengalaman kunjungan nonaktif. Galeri foto acara belum tersedia karena menunggu penyimpanan Cloudflare R2.

Untuk memeriksa tampilan secara lokal, buka `/dev-preview?fase=before|day|after&tema=werkudara|nenek|gala|khidmat|segar` (tambahkan `&audiens=internal` atau `&sudut=soft`). Halaman itu memakai foto contoh dan hanya tersedia saat pengembangan.

## 6. Spesifikasi foto

| Keperluan | Ukuran | Rasio | Catatan |
|---|---|---|---|
| Foto latar pembuka | 2400 × 1500 px | 16:10 mendatar | Beri ruang lapang untuk teks |
| Foto lokasi Werkudara | 1600 × 1000 px | 16:10 mendatar | Tampil di bawah peta; dipotong ke 4:3 di ponsel |
| Foto tim | 1600 × 1000 px | 16:10 mendatar | Opsional di Our Team; tampil satu foto tanpa carousel |

Foto lokasi dapat diisi lebih dari satu. Satu foto tampil diam; dua atau lebih bergantian otomatis dan dapat dihentikan tamu.

Batas teknis: maksimal **8 MB**, format JPG, PNG, WebP, atau AVIF. Ukuran berkas yang ideal 300 KB–1,5 MB; JPG kualitas 80% sudah sangat baik.

Foto yang diunggah dikecilkan otomatis oleh server menjadi beberapa ukuran, sehingga tamu di ponsel hanya mengunduh yang sesuai layarnya. Foto dari tautan luar tidak dikecilkan — siapkan ukurannya sendiri.

Dua hal yang memengaruhi hasil:
- **Hindari foto yang terlalu ramai** untuk latar, karena teks dibaca di atasnya.
- **Jangan menaruh objek penting di tepi**, karena bagian itu terpotong di layar ponsel. Gunakan pratinjau di editor untuk memeriksanya, dan atur posisi teks ke kiri atau tengah sesuai fotonya.

Keterangan foto bersifat opsional. Isi hanya bila memang ada yang perlu disampaikan, misalnya kredit atau penjelasan singkat. Hanya galeri yang tampil sebagai foto lokasi; field foto lokasi lama tidak lagi dirender, tetapi data dan file lamanya tidak dihapus.

### Pratinjau pembuka
Pilih HP (390×844) atau Desktop (1440×900). Preview menggunakan komponen dan stylesheet yang sama dengan halaman tamu dalam viewport tersendiri, lalu diperkecil agar muat editor. Ini mengikuti perubahan lokal, sedangkan menu Preview tersimpan mengikuti data yang telah disimpan. Aktifkan **Atur foto** untuk menyeret foto atau memakai slider horizontal/vertikal/zoom (1–3×). Reset berlaku untuk perangkat aktif saja. Ganti foto mereset framing. Klik Simpan untuk menerapkan pengaturan; tidak ada perubahan pada berkas foto asli.

### Ulasan Google opsional
Tombol di penutup mengarah ke ulasan Google Werkudara, bukan survei internal. Dari profil bisnis Google yang dikelola, gunakan Minta ulasan/bagikan tautan ulasan. Tempel URL resmi, periksa tautan, aktifkan tombol, simpan/publikasikan. Ulasan berada di Google dan dapat tampil publik; Google mungkin meminta login. Semua tamu mendapat tautan yang sama, tidak disaring berdasarkan skor feedback. Matikan pilihan dan simpan jika tidak ingin tombol tampil.

### Galeri foto acara (Cloudflare R2)
Tab **Galeri foto** di setiap acara. Sebelum R2 disiapkan, tab ini hanya menampilkan "Penyimpanan foto belum disiapkan" dan tidak mengunggah apa pun.

1. Cloudflare → R2 → **Create bucket**. Biarkan **privat** (jangan aktifkan akses publik atau r2.dev). Foto dibuka lewat alamat bertanda tangan yang berlaku beberapa jam.
2. R2 → **Manage API tokens** → buat token dengan izin **Object Read & Write**, dibatasi ke bucket itu saja.
3. Bucket → **Settings → CORS policy**, isi:
   ```json
   [{ "AllowedOrigins": ["https://invitation.werkudara.group"], "AllowedMethods": ["PUT", "GET", "HEAD"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
   ```
   Tambahkan `http://localhost:3000` hanya bila perlu menguji unggahan dari lokal.
4. Di Vercel (Production), isi `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, lalu deploy ulang.
5. Terapkan migrasi `202610210002_gallery_photos.sql`.

Alur: admin memilih banyak foto sekaligus. Browser membuat versi tampilan (sisi panjang 2048 px) dan thumbnail (480 px) dalam WebP, lalu mengunggah ketiganya langsung ke R2. Server memeriksa ukuran dan isi berkas (harus JPEG, PNG, WebP, atau HEIC). Foto baru berstatus **Menunggu tinjauan**; tamu hanya melihat foto yang **Tayang**. Setelah acara, halaman undangan menampilkan tombol galeri bila ada foto tayang. Tamu bisa mengunduh berkas asli dan meminta foto dihapus lewat WhatsApp PIC. Galeri tertutup otomatis enam bulan setelah acara.

## 7. Hal yang belum tersedia

- **Pembersihan tabel pembatasan laju terjadwal.** Fungsi `purge_expired_request_limits()` tersedia, tetapi penjadwalnya belum dipasang. Baris kedaluwarsa juga dihapus setiap kali fungsi dipanggil.
- **Kebijakan retensi data tamu.** Perlu ditetapkan penyelenggara sebelum acara berjalan.

## 8. MCP Supabase (khusus pengembangan)

`.mcp.json` berisi server read-only yang dibatasi ke proyek ini. Autentikasi lewat `/mcp` → Supabase → Authenticate di terminal. Ini terpisah dari koneksi aplikasi dan tidak menggantikan variabel environment.
