# Rancangan platform pengalaman tamu dan operasional acara

Status: rangkuman diskusi per 19 Oktober 2026, memperbarui rangkuman 15 Oktober 2026. Dokumen ini mencatat tujuan, keputusan yang sudah disepakati, usulan yang masih menunggu tinjauan, dan hal yang belum diputuskan. **Bukan** pernyataan bahwa seluruh fitur di bawah sudah tersedia atau siap digunakan pada data tamu nyata.

Visual pendukung ada di `docs/journey-platform.pen` (Pencil): papan 00 ringkasan keputusan, 01 peta platform, 02 pola tautan dan fase, 03 layar tamu, 04 layar admin, 05 design system admin, 06 tema tamu, 07 kebijakan BEO, data tamu, dan foto, 08 desain final alur tamu, 09 admin ringkasan dan panel, 10 form tamu bertahap, 11 survei Buat acara, 12 detail kegiatan, kalender, dan slide. Nama tamu, tanggal, dan angka di papan itu hanya contoh.

## Tujuan

Membuat pengalaman kunjungan yang cepat, jelas, hangat, dan berkesan sejak tamu menerima undangan hingga setelah acara. Tamu memahami acara, dapat menyampaikan kebutuhannya, tiba tanpa tersesat, menikmati pengalaman yang sesuai tema, dan memiliki alasan untuk tetap terhubung. Untuk tamu eksternal, kesan akhirnya adalah tertarik bermitra dengan Werkudara. Ajakan menjalin hubungan atau memberi ulasan tidak boleh menjadi penghalang untuk memperoleh informasi atau foto mereka.

Bagi hospitality, informasi tamu harus berubah menjadi persiapan yang bisa ditindaklanjuti, bukan sekadar jawaban formulir. Admin harus ramah, mudah dipahami, dan tidak dipenuhi tombol besar.

## Arah platform

### Satu web, banyak acara

- Semua acara berada di satu web dengan satu admin. Isi, modul, dan tampilan diatur per acara. Platform ini dipakai untuk tamu, klien, dan acara internal.
- Proyek ini (`guest-experience`) menjadi platformnya karena sudah memiliki database, admin, editor, RSVP, dan tautan personal.
- Proyek lama **dibiarkan sebagai referensi** dan tidak dipindahkan:
  - `D:\projects\your-visit-to-werkudara`: panduan rute bergambar, cerita Our Team, dua bahasa ID/EN.
  - `D:\projects\Lombok-Guidebook`: jadwal per hari, kartu "sekarang", album foto di Cloudflare R2 dengan unggah langsung. Di sana siapa pun yang memegang tautan bisa mengunggah; di platform ini unggah hanya lewat admin.
  - `D:\projects\Sales-Mistery-Bootcamp`: handbook per bab, tiket QR, denah kursi, pemindai check-in. Di sana pembaruan check-in memakai topik ntfy.sh publik dan ada profil DiSC/MBTI peserta; keduanya tidak dipindahkan ke platform ini.

### Jenis acara dan audiens

Setiap acara punya dua pilihan terpisah. **Internal bukan jenis acara tersendiri**, melainkan sakelar audiens, karena acara internal bisa berbentuk apa saja.

| Jenis | Bentuk | Eksternal | Internal |
|---|---|---|---|
| Kunjungan | Tamu datang ke kantor atau lokasi kita | Kunjungan klien, meeting mitra | Kunjungan tim internal ke kantor |
| Acara | Satu hari, tamu banyak, bisa memakai tiket dan kursi | Gala dinner klien, launching, seminar | Nyadran, annual meeting, CSR ke panti, gala internal |
| Program | Beberapa hari, jadwal per hari dan handbook | Trip klien seperti Lombok | Sales Mastery Bootcamp, retreat |

- Memilih jenis menyalakan modul yang biasanya dipakai; hospitality tetap bisa menyalakan atau mematikan modul apa pun.
- Audiens **Internal** menyembunyikan ulasan Google dan ajakan kolaborasi. Karyawan tidak diminta mengulas perusahaannya sendiri.

### Modul per tahap

| Tahap | Modul |
|---|---|
| Undang | Undangan, RSVP, tautan personal |
| Siapkan | Panduan rute, tema acara, Our Team, kontak PIC, handbook (termasuk dress code), daftar bawaan, pembagian tugas, materi |
| Sambut | Tiket QR, kursi, denah, check-in, titik kumpul dan transport |
| Jalani | Jadwal satu hari atau per hari |
| Kenang | Terima kasih, galeri acara, survei feedback, ulasan Google (eksternal saja) |
| Lanjutkan | Ajakan kolaborasi (eksternal saja) |

Modul baru yang disepakati: **titik kumpul dan transport**, **daftar bawaan**, **pembagian tugas**, dan **materi** (hanya untuk peserta). Dress code menjadi bab di Handbook, bukan modul sendiri.

**Pembaruan 20 Okt — modul Persiapan tamu (sudah dibangun).** Daftar bawaan dan dress code digabung ke satu modul opsional berisi **kartu kustom** (maksimal 8): setiap kartu punya ikon, judul, keterangan, dan daftar centang (maksimal 15 baris). Admin bisa mulai dari contoh *Dress code*, *Yang perlu dibawa*, *Yang kami siapkan* (kaos, topi, goodie bag), atau *Kartu kustom* untuk hal lain seperti cuaca, alas kaki, atau obat pribadi. Bagian ini nonaktif secara bawaan dan tidak tampil selama belum ada kartu. Disimpan di JSONB acara, jadi tidak memerlukan migrasi.

### Domain, halaman depan, dan fase

- Sementara memakai `invitation.werkudara.group`. Nanti diganti ke nama yang lebih cocok (belum ditentukan); domain lama tetap aktif sebagai alias agar tautan yang sudah dibagikan tidak mati. Domain diatur di Vercel dan DNS, tidak tertulis di kode.
- Halaman depan menjadi **sambutan umum** Werkudara, bukan menampilkan satu acara. Tamu selalu masuk lewat tautan acaranya. Saat ini halaman depan masih menampilkan satu acara yang ditandai tayang (`src/app/page.tsx`).
- **Fase acara** (sebelum acara, hari H, sesudah acara) berganti otomatis dari tanggal acara dan dapat diubah hospitality. Fase menentukan apa yang tamu lihat lebih dulu. Tampilannya akan digambar dan ditinjau dulu sebelum dibangun.

### Pola tautan

| Untuk | Tautan | Status |
|---|---|---|
| Semua tamu | `/e/{slug}` | Sudah ada |
| Satu tamu | `/e/{slug}/i/{kode}` | Sudah ada |
| Tiket tamu | `/e/{slug}/i/{kode}/tiket` | Perlu dibuat |
| Pilih kursi (mode B) | `/e/{slug}/i/{kode}/kursi` | Perlu dibuat |
| Setelah acara | `/e/{slug}/galeri` | Perlu dibuat |
| Admin acara | `/admin/events/{id}` | Sudah ada |
| Admin modul baru | `/admin/events/{id}/kursi`, `/checkin`, `/galeri`, `/beo` | Perlu dibuat |

## Alur tamu

1. **Sebelum acara:** layar pertama menunjukkan identitas acara, tempat, tanggal/waktu, ringkasan singkat, dan tindakan penting, dengan konfirmasi kehadiran sebagai tindakan utama. Bagian berikutnya harus tampak dapat dijelajahi agar halaman tidak terkesan berhenti di layar pertama. Informasi rinci disajikan bertahap, bukan sebagai formulir panjang atau rangkaian pop-up.
2. **Dua cara masuk:** tautan umum dan tautan personal per tamu menggunakan pengalaman acara yang konsisten. Tautan personal dapat mengenali tamu; tautan umum tidak mengasumsikan identitas. Informasi acara dan perjalanan tetap dapat dibaca tanpa memaksa pengisian RSVP.
3. **Konfirmasi dan kebutuhan tamu:** RSVP mudah ditemukan. Tindakan untuk menyampaikan kebutuhan makanan dan aksesibilitas terlihat sejak awal, menuju bagian **Pengalaman kunjungan** yang juga memuat cerita konsep acara. Cerita tampil lebih dulu; isian kebutuhan opsional berada di bawahnya dalam dua panel lipat terpisah (makanan dan akses). Tiap panel ringkas saat tertutup dan memuat kotak centang saat dibuka agar pilihan jamak jelas. Pilihan makanan dapat dipilih lebih dari satu (misalnya vegetarian sekaligus alergi kacang); “Tidak ada kebutuhan khusus” tidak dapat digabung dengan pilihan lain. Kolom keterangan bebas hanya muncul untuk “Lainnya”; jika memilih alergi, tamu tetap perlu menyebutkan alergennya. Pilihan aksesibilitas ditanyakan terpisah, misalnya “Saya menggunakan kursi roda” atau “Kebutuhan akses lain”. Tanyakan bantuan yang diperlukan, bukan diagnosis atau bukti disabilitas. Penerimaan jawaban berarti dicatat untuk ditinjau, bukan jaminan otomatis bahwa semua kebutuhan dapat dipenuhi.
4. **Perjalanan ke lokasi:** panduan perjalanan merupakan modul tersendiri yang dapat ditampilkan atau disembunyikan per acara. Ringkasan awal cukup menunjukkan lokasi dan akses ke panduan lengkap; rute, foto titik belok, peta, serta catatan kedatangan tersedia saat dibutuhkan. Untuk acara di luar kantor (misalnya nyadran atau CSR), titik kumpul dan transport menggantikan atau melengkapi panduan rute.
5. **Tema acara:** hospitality mengisi judul konsep, cerita singkat, dan foto pendukung. Pengantar singkat tampil pada layar awal tamu dan cerita yang lebih lengkap ada di bagian **Pengalaman kunjungan**. Tujuannya membuat tamu penasaran tanpa menyembunyikan informasi praktis yang mereka butuhkan. Deskripsi konsep adalah informasi dari hospitality untuk dibaca tamu, **bukan** jawaban yang diisi tamu. Konten tidak boleh menjanjikan fasilitas yang belum pasti tersedia.
6. **Our Team:** modul terpisah dari panduan perjalanan, dengan sakelar tampil sendiri per acara. Admin dapat memakai konten bersama, menyalin lalu menyesuaikan, atau membuat sendiri; perubahan sumber tidak otomatis mengubah acara tayang. Konten serta izin foto perlu diverifikasi sebelum tayang.
7. **Tiket dan kursi:** lihat bagian *Tiket, kursi, denah, dan check-in*.
8. **Setelah acara:** galeri memiliki tautan umum per acara (`/e/{slug}/galeri`), bukan halaman khusus per tamu. Halaman dibuka dengan ucapan terima kasih, lalu galeri. Tamu dapat melihat foto yang sudah tayang dan mengunduh versi aslinya **tanpa wajib memberi ulasan**. Ajakan ulasan Google bersifat sukarela, dapat dilewati, dan hanya untuk acara eksternal. Ajakan kolaborasi tampil di akhir halaman, hanya untuk acara eksternal.
9. **Beberapa bahasa:** struktur pengalaman tetap sama saat bahasa berganti. Bahasa awal dapat dipilih admin per acara; tamu tetap dapat menggantinya. Label antarmuka diterjemahkan oleh sistem, sedangkan cerita tema, deskripsi acara, panduan perjalanan, dan Our Team memiliki konten per bahasa yang disetujui. Kekosongan terjemahan harus terlihat di admin; jangan menampilkan teks bahasa utama seolah sudah diterjemahkan.

## Tiket, kursi, denah, dan check-in

- Tiket **gratis**; tidak memakai payment gateway. Skala maksimal sekitar **500 peserta** per acara.
- Tiket QR terbit setelah tamu konfirmasi hadir dan terikat pada satu orang. Tamu yang mendaftar lewat tautan umum mendapat kode personal setelah RSVP.
- **Kursi** dipilih per acara:
  - **Mode A, panitia yang menentukan**: panitia menaruh tamu di denah. Disarankan untuk gala dan annual meeting.
  - **Mode B, tamu memilih sendiri**: tamu memilih kursi kosong. Kursi dikunci di database saat disimpan; bila dua orang memilih kursi yang sama hampir bersamaan, yang kedua diminta memilih kursi lain.
- **Denah** berupa gambar ruangan yang diunggah, lalu ditandai posisi meja dan kursinya. Editor denah yang digambar bebas tidak termasuk cakupan.
- **Check-in** memakai pemindai QR di ponsel petugas, dengan pencarian nama bila tamu tidak membawa QR. Pemindai tetap bisa dipakai saat sinyal putus dan menyinkronkan data setelah tersambung lagi.
- **Tiket wajib disimpan.** Setelah konfirmasi, tamu memilih minimal satu cara:
  - unduh gambar tiket (PNG), dibuat di browser tamu;
  - unduh PDF, dibuat di browser tamu;
  - kirim ke WhatsApp: tamu mengisi nomor tujuan, aplikasi WhatsApp tamu terbuka dengan pesan berisi **tautan tiket**, dan tamu sendiri yang menekan kirim.
- Batasan yang disepakati: pengiriman lewat WhatsApp tidak otomatis dan tidak melampirkan gambar; pengiriman otomatis memerlukan WhatsApp Business API berbayar dan tidak termasuk cakupan. "Wajib" berarti tombol Selesai baru berfungsi setelah satu cara dipilih; aplikasi tidak bisa memastikan berkas benar-benar tersimpan di ponsel tamu.
- Nomor WhatsApp hanya disimpan bila tamu mencentang izin, agar panitia bisa mengirim ulang tiket dari admin.

## Foto dan penyimpanan

- Berkas foto (asli, versi layar, thumbnail) disimpan di **Cloudflare R2**. Supabase hanya menyimpan data foto: keterangan, urutan, status tayang, dan alamat berkas.
- Bucket R2 dibuat baru khusus platform ini oleh pemilik, terpisah dari foto Lombok.
- Foto diunggah langsung dari browser ke R2 dengan tautan unggah sementara, sehingga berkas besar tidak melewati server Vercel. Versi kecil dibuat di browser sebelum diunggah.
- Unggah hanya lewat admin. Foto baru berstatus **menunggu tinjauan**, lalu hospitality menandai **siap tayang** atau **disembunyikan** dan menerbitkan galeri. Foto tidak tayang otomatis setelah diunggah. Gagal unggah harus terlihat jelas dan bisa dicoba lagi.
- Pilihan per galeri: izinkan unduh foto asli, **galeri terbatas** (khusus peserta), dan tampilkan ajakan ulasan Google.
- Galeri CSR dan acara lain yang melibatkan anak atau kelompok rentan **menunggu persetujuan** pengelola sebelum ditampilkan. Wajah anak dan penghuni tidak ditampilkan tanpa izin.
- Foto lokasi pada undangan tetap terpisah dari foto dokumentasi acara. Foto yang sudah ada di Supabase Storage (foto pembuka dan foto lokasi) tetap di sana dulu.

## Admin

- Admin dibuat **ramah dan ringkas**: daftar yang mudah dipindai, satu tindakan utama per layar, editor bertahap, dan pratinjau ponsel di samping editor. Hindari pengisian ulang konten bersama untuk setiap acara.
- Daftar acara dikelompokkan per fase (draf, sebelum acara, hari H, sesudah acara). Kartu acara menandai pekerjaan yang belum selesai.
- Membuat acara dimulai dengan memilih jenis dan audiens.
- Setiap menu memiliki:
  - kotak **Untuk apa**: satu sampai dua kalimat dengan bahasa sehari-hari;
  - label **Diisi oleh**: hospitality, panitia, atau petugas lapangan;
  - contoh isian di setiap kolom;
  - bilah **Kesiapan tayang** yang menyebut langkah yang belum selesai.
- Saat pilihan lebih dari dua: setiap pilihan memiliki ikon, satu kalimat penjelasan, satu pilihan bertanda **Disarankan**, kotak bantuan ("Ragu? Pilih …"), dan ikon tanya untuk istilah seperti BEO atau RSVP.
- Ikon memakai satu keluarga (Lucide); satu makna satu ikon di seluruh admin. Status selalu memakai kata atau ikon, tidak pernah warna saja.
- Tombol dan kolom isian setinggi minimal 48px.
- Panduan bergambar singkat per peran (hospitality, panitia, petugas lapangan) disiapkan setelah layar admin stabil.
- Data lama dipertahankan meski sebagian konten lama nantinya tidak lagi ditampilkan. Perubahan struktur data direncanakan secara aditif; jangan menjalankan ulang seed, menghapus data, atau menerapkan migrasi remote tanpa pemeriksaan dan izin tersendiri.

**Usulan, menunggu tinjauan** (papan 05):

- Font **Nunito** untuk admin dan halaman tamu (keputusan 21 Okt): membulat, ramah, dan jelas di ukuran kecil. Tema hanya boleh mengganti font judul.
- **Warna per tahap**: Persiapan magenta, Tamu biru, Hari H oranye, Sesudah acara hijau, Pengaturan abu. Warna diambil dari warna sekunder brand Werkudara; kuning tetap khusus untuk "perlu perhatian".

## Tampilan tamu dan tema

- Admin memakai satu design system tetap. Tampilan tamu memakai **tema** yang dipilih per acara.
- Tema awal: **Werkudara** (bawaan), **Pulang ke Rumah Nenek**, **Malam Apresiasi**, **Khidmat**, dan **Segar**.
- **Bisa diatur per acara:** tema, warna aksen (hanya yang lolos uji kontras untuk tema itu), gaya pembuka (foto penuh, editorial, atau polos), font judul dari daftar tema, sudut (persegi atau lembut), serta foto dan teks tema.
- **Dikunci di semua tema:** urutan dan navigasi halaman, letak dan ukuran tombol utama, ukuran teks isi minimal 15px di ponsel, kontras teks minimal WCAG AA (lapisan redup di atas foto tidak dapat dimatikan), logo Werkudara, dan keluarga ikon.
- Tema baru dibuat oleh tim desain, bukan oleh hospitality. Saran tema awal per acara: Kunjungan memakai Werkudara atau Rumah Nenek, gala memakai Malam Apresiasi, nyadran memakai Khidmat, CSR memakai Segar.
- Penyesuaian per acara tidak boleh diam-diam mengubah tema sumber atau acara lain yang sudah tayang.

## Admin: ringkasan, panel, dan survei Buat acara

Disepakati 19 Oktober setelah tinjauan tata letak editor yang terlalu panjang (papan 09 dan 11).

- **Editor menampilkan ringkasan, bukan semua form.** Setiap bagian tampil sebagai kartu: ikon, judul, satu baris isi saat ini, status (Lengkap, Perlu dilengkapi, Opsional, atau Belum disimpan), dan tombol **Ubah**.
- **Ubah membuka panel** di samping (desktop) atau **bottom sheet** (ponsel) berisi form bagian itu saja, tanpa pindah halaman. Panel ditutup dengan **Selesai**.
- **Satu tombol Simpan** di bilah bawah yang selalu terlihat menyimpan semua perubahan. Kartu yang diubah ditandai Belum disimpan sampai disimpan.
- **Daftar isi** per tahap: menu samping di desktop; di ponsel baris pintasan tahap dan tombol Daftar isi.
- **Kesiapan tayang** di atas ringkasan menyebut langkah yang belum selesai dan membuka panelnya langsung.
- **Buat acara** berupa survei 4 langkah di dialog (desktop) atau layar penuh (ponsel):
  1. Acara apa: 8 templat (Kunjungan klien, Gala dinner, Seminar/launching, Annual meeting, Nyadran, CSR/kegiatan sosial, Pelatihan/bootcamp, Trip klien), **Salin dari acara sebelumnya** (isi tersalin, data tamu dikosongkan), atau **Mulai dari draf kosong**. Templat terpilih menyebut apa saja yang termasuk.
  2. Untuk siapa, bahasa awal, cara mengundang, nama acara, waktu, dan lokasi (Kantor Werkudara mengisi alamat dan rute; Tempat lain diisi nanti).
  3. Modul yang dibutuhkan (sudah dipilihkan sesuai templat; fitur yang belum ada ditandai Segera). Bila RSVP aktif: perkiraan jumlah tamu (angka awal BEO), batas konfirmasi, dan PIC hospitality. Titik kumpul ditanyakan bila lokasi bukan kantor dan acara butuh transport.
  4. Ringkasan: bagian yang tampil, isi awal yang sudah ditulis (dalam Indonesia dan English), pratinjau tema, dan daftar **Setelah ini, lengkapi**. Isi awal adalah contoh yang perlu ditinjau.
- **Keputusan 20 Okt — isian kosong, pilihan jelas.** Semua kolom teks di survei dan di draf baru **dimulai kosong**; draf baru tidak lagi berisi konten contoh. Jawaban yang bisa ditebak (sapaan, isi undangan, penutup, judul dan cerita pengalaman, momen, pesan terima kasih, judul dan peran kontak, teks ulasan) tampil sebagai **chip** di bawah kolom: sekali klik mengganti isinya, dan tautan **Kembalikan teks sebelumnya** muncul bila teks yang sudah diketik tertimpa. Chip diambil dari lembar *Isi awal templat*, dengan kalimat templat terpilih di urutan pertama. Kolom yang tidak bisa ditebak (nama acara, alamat, nama PIC, rundown, catatan kedatangan) menampilkan **contoh kalimat** abu-abu. Lokasi punya tombol **Pakai alamat kantor Werkudara** yang mengisi nama tempat, alamat, dan tautan Maps sekaligus.
- **Sudah dibangun (20 Okt).** Templat mengatur jenis, audiens, tema, bagian yang tampil, kartu persiapan awal (judul saja), dan tiga pertanyaan survei standar bila survei dipilih. Salinan acara memindahkan rundown, batas RSVP, dan pembukaan survei mengikuti tanggal baru. Modul yang belum ada (tiket dan kursi, check-in, galeri acara) ditandai *Segera*.
- **Keputusan rapat 20 Okt (sore) — sederhanakan.** Uji internal menunjukkan alur terlalu panjang dan pilihan tema membingungkan. Fokus sekarang: **acara hosting klien** dengan templat siap pakai **Kunjungan klien** dan **Trip klien**; templat lain disembunyikan dan bisa dimunculkan super admin (*Templat Buat acara* di dashboard super admin, migrasi `202610200007`). **Buat acara jadi 2 langkah**: pilih templat dari galeri miniatur → nama, waktu, dan lokasi. Audiens, bahasa, cara mengundang, kalimat, dan modul tidak lagi ditanyakan; semuanya mengikuti templat dan bisa diubah di editor. **Tema ikut templat**: blok *Jenis, audiens, dan tampilan* hanya untuk super admin. **Editor dipendekkan**: bagian yang belum dipakai acara dilipat di *Bagian lain yang bisa ditambahkan*, dan panelnya punya sakelar *Tampilkan bagian ini di undangan*. Draf kosong hanya untuk super admin.
- **Lombok Guidebook** dipakai ulang sebagai **struktur templat Trip klien**, tanpa data pribadi tamu, setelah modul jadwal per hari dan handbook tersedia.

## Form tamu bertahap

Disepakati 19 Oktober (papan 10).

- Di halaman undangan, RSVP dan survei tampil sebagai **kartu ringkas**. Form dibuka di **bottom sheet** (ponsel) atau **dialog** (desktop), hanya satu sheet per form, bukan rangkaian pop-up.
- RSVP dibagi 4 langkah: hadir atau tidak; data diri (terisi dari undangan personal); kebutuhan makanan dan akses; periksa lalu kirim (persetujuan dan opsi foto). Setelah terkirim, kartu menjadi **Anda terkonfirmasi** dengan tombol Ubah jawaban.
- Pilihan makanan jamak, akses, dan opsi foto **butuh migrasi database**; keputusan kapan migrasi dilakukan masih terbuka.

## Wording dan bahasa

- **Semua teks sistem** (pertanyaan form, tombol, judul langkah, pesan) diambil dari **satu kamus per bahasa** dengan kunci tetap; komponen tidak memuat teks langsung. Wording resmi tim cukup mengganti isi kamus.
- Draf kamus ada di `docs/wording-draf.xlsx`: sheet Antarmuka tamu (teks sistem ID dan EN) dan Isi awal templat (isi contoh per templat dan pertanyaan survei). Semua baris berstatus Draf sampai ditinjau tim. Teks dalam kurung kurawal, misalnya `{nama}`, diganti otomatis dan harus ada di kedua bahasa.
- Admin tetap berbahasa Indonesia; kamus dua bahasa untuk tampilan tamu.
- **Sudah dibangun (20 Okt).** Kamus dibuat dari lembar xlsx dengan `npm run wording` (`scripts/wording-from-xlsx.mjs` menulis `src/lib/wording/dictionary.ts` dan `template-content.ts`; jangan mengubah keduanya manual). Variabel berbahasa Indonesia di kolom ID (`{nama}`, `{waktu}`) dipetakan otomatis ke nama yang dipakai kode (`{name}`, `{when}`). Teks English yang kosong memakai teks Indonesia.
- Setiap acara punya pilihan **bahasa halaman tamu**: Bahasa Indonesia saja, **Dua bahasa** (tombol ID/EN di bagian atas halaman, pilihan tamu diingat di browser), atau English saja. Isi acara diterjemahkan di blok **Bahasa & terjemahan**; hanya teks yang sudah diisi dalam Bahasa Indonesia yang muncul untuk diterjemahkan. Bila ada teks yang belum diterjemahkan, halaman English menampilkan catatan bahwa sebagian informasi hanya tersedia dalam Bahasa Indonesia, dan kartu editor berstatus Perlu dilengkapi.
- **Form RSVP bertahap sudah dibangun (20 Okt)**: kartu di halaman, form di sheet (bawah layar di ponsel, dialog di desktop) dengan langkah Hadir/pendamping → Data diri → Kebutuhan → Periksa. Tamu yang tidak hadir melewati langkah kebutuhan. Kebutuhan makanan: Vegetarian, Alergi makanan (dengan alergennya), Lainnya; akses: Kursi roda, Pendamping, Juru bahasa isyarat, Lainnya; plus tombol *Tidak ada kebutuhan khusus*. Langkah terakhir berisi persetujuan dan opsi *jangan tampilkan foto saya*. Pendamping hanya untuk tautan personal, sampai batas per undangan. Survei feedback memakai pola kartu + sheet yang sama. Semua teks memakai kamus (ID/EN). Sampai migrasi `202610200004_rsvp_needs.sql` diterapkan, langkah kebutuhan hanya menanyakan alergi seperti sebelumnya.

## Detail kegiatan, pengingat, dan slide

Dari evaluasi rapat Lombok Guidebook, 19 Oktober (papan 12). Diterapkan pada modul Program dan templat Trip klien; berguna juga untuk rundown acara satu hari.

- **Hanya info yang belum diketahui.** Jam, nama kegiatan, dan lokasi sudah terlihat di daftar, jadi tidak diulang besar. Kegiatan **dibuka di tempat** (tanpa sheet atau layar baru) dan hanya menampilkan:
  - di daftar: **"Kenali lebih dekat: {cuplikan}"**, satu frasa yang membuat tamu ingin membuka, misalnya "tradisi suku Sasak";
  - saat dibuka: kotak **Tahukah Anda?** berisi ringkasan 2–3 kalimat tentang tradisi, keistimewaan tempat, atau alasan kita memilihnya, ditulis untuk tamu;
  - lokasi dan durasi sebagai keterangan kecil.
- **Tambahan opsional.** Cerita lengkap (tautan **Selengkapnya**) dan tautan ke halaman PDF presentasi (**Hal. N presentasi**) hanya tampil bila diisi. Di admin, keduanya berada di bagian **Tambahan (opsional)** yang tertutup secara bawaan, karena belum tentu dipakai hospitality.
- **Pengingat lewat kalender.** Tombol **Tambahkan ke kalender** menyimpan semua kegiatan atau hari ini saja ke kalender ponsel (berkas .ics) dengan pengingat yang bisa dipilih, misalnya 30 menit sebelumnya. Kalender tidak berubah otomatis bila jadwal diubah; halaman mengabarkan perubahan dan tamu menyimpan ulang.
- **Kartu Berikutnya** pada hari H menampilkan kegiatan berikutnya dan berapa menit lagi, selama halaman dibuka.
- **Notifikasi push** (termasuk kabar perubahan jadwal) adalah tahap berikutnya: butuh penjadwal di server, tabel langganan, dan di iPhone tamu harus menambahkan web ke layar utama. WhatsApp otomatis tidak termasuk karena butuh WhatsApp Business API berbayar.
- **Slide terkait.** Bila diisi, tautan `#page=N` membuka PDF presentasi versi tamu di halaman terkait. Deck untuk tamu tidak boleh berisi harga atau catatan internal, karena siapa pun yang membuka tautan bisa melihat seluruh PDF.

## Kebijakan operasional dan data — usulan, menunggu tinjauan

Disusun untuk skala platform ini (acara di bawah 500 orang, tamu eksternal dan internal, admin dengan password bersama). Angka hari dan bulan adalah usulan awal. Ini bukan nasihat hukum; sebaiknya dicek terhadap UU Pelindungan Data Pribadi (UU No. 27 Tahun 2022) dan kebijakan perusahaan sebelum dipakai.

### BEO (Banquet Event Order)

BEO adalah lembar kerja persiapan acara bagi hospitality, bukan sekadar ekspor RSVP.

- **Alur:** Draf (angka mengikuti RSVP) → Ditetapkan (H-3, bisa diubah per acara) → Revisi (setiap perubahan dicatat: versi, alasan, siapa) → Final (H-1, dikirim ke penyedia makanan) → Selesai (disimpan sebagai rekap angka).
- **Tiga angka** dibedakan: perkiraan dari atasan, konfirmasi hadir dari RSVP, dan jumlah persiapan yang ditetapkan hospitality. Jumlah persiapan tidak otomatis sama dengan RSVP. Perubahan RSVP setelah angka ditetapkan muncul sebagai "perlu ditinjau", bukan diam-diam mengganti pesanan.
- **Isi lembar:** nama acara, tanggal, jam, ruang, PIC hospitality dan PIC penyedia; tiga angka; jadwal layanan (misalnya welcome drink, makan, coffee break); jumlah meja dan denah bila memakai kursi; catatan operasional seperti AV, parkir, dan transport.
- **Yang dikirim ke penyedia makanan:** jumlah per kategori makanan tanpa nama, serta daftar alergi dengan nama depan, meja, dan alergen karena perlu penanganan per orang. Tidak berisi nomor telepon, perusahaan, atau kebutuhan akses.
- Satu tamu dapat memilih beberapa kategori makanan, jadi jumlah per kategori **tidak dijumlahkan sebagai jumlah orang unik**.
- **Hanya untuk hospitality:** rincian kebutuhan akses (misalnya pengguna kursi roda, butuh pendamping) dan riwayat revisi BEO.

### Retensi data tamu

Prinsipnya: kumpulkan seperlunya dan simpan sesingkat mungkin. Selama admin belum memakai login, masa simpan yang pendek mengurangi risiko.

| Data | Untuk apa | Disimpan sampai | Setelah itu |
|---|---|---|---|
| Kebutuhan makanan dan alergi (data kesehatan) | BEO dan penanganan di lokasi | 30 hari setelah acara | Dihapus; tersisa jumlah per kategori |
| Kebutuhan akses (data kesehatan) | Persiapan hospitality | 30 hari setelah acara | Dihapus |
| Nomor WhatsApp | Kirim ulang tiket | 30 hari setelah acara, hanya bila tamu mengizinkan | Dihapus |
| Nama dan perusahaan | Daftar tamu, kursi, check-in | 12 bulan | Dianonimkan; tersisa angka kehadiran |
| Izin dihubungi lagi (opsional) | Tindak lanjut kemitraan | 12 bulan atau sampai tamu menarik izin | Dihapus |
| Jawaban survei | Perbaikan acara | 90 hari dengan nama | Dipisahkan dari nama; rekap disimpan |
| Tautan personal | Membuka undangan dan tiket | 30 hari setelah acara | Tidak berlaku; galeri tetap lewat tautan umum |
| Rekap angka | Laporan | Tanpa batas | Tidak berisi data pribadi |

- Data kesehatan (makanan, alergi, akses) hanya bisa dilihat tim hospitality dan hanya dipakai untuk acara yang bersangkutan.
- Aplikasi mengingatkan hospitality 7 hari sebelum batas hapus dan menyediakan tombol "Bersihkan data acara" dengan ringkasan data yang akan dihapus. Ekspor CSV mencatat tanggal dan acara yang diekspor.
- Tamu dapat meminta datanya dihapus lewat PIC; hospitality menghapusnya dalam 14 hari.
- Acara internal mengikuti aturan yang sama, kecuali HR menetapkan lain. Profil peserta seperti DiSC atau MBTI tidak disimpan di platform ini.

### Izin foto

- **Tiga tingkat penggunaan:**
  - **Galeri acara** (bawaan): hanya lewat tautan acara, tidak muncul di mesin pencari.
  - **Media sosial dan promosi**: hanya dengan izin terpisah dari tamu yang terlihat jelas di foto.
  - **Anak dan kelompok rentan**: tidak dipublikasikan; galeri terbatas, izin tertulis pengelola, wajah disamarkan untuk keperluan lain.
- **Sebelum acara:** undangan menyebut bahwa acara didokumentasikan. Formulir RSVP menyediakan centang "Mohon jangan tampilkan foto saya di galeri". Petugas foto menerima daftar tamu yang memilih tidak ditampilkan.
- **Sebelum galeri terbit:** hospitality meninjau setiap foto dan menyembunyikan foto yang memalukan, foto dengan mata tertutup, foto yang memperlihatkan layar atau dokumen, serta foto tamu yang memilih tidak ditampilkan.
- **Setelah galeri terbit:** tombol "Minta foto dihapus" di galeri menuju PIC. Foto disembunyikan dalam 2 hari kerja dan dihapus dari R2. Galeri ditutup untuk tamu 6 bulan setelah acara; arsip internal mengikuti kebijakan dokumentasi perusahaan.
- Foto Our Team memerlukan persetujuan setiap karyawan yang terlihat sebelum dipakai di undangan.

## Akses dan login

**Keputusan 20 Okt:** admin masuk dengan **satu password bersama** (`ADMIN_PASSWORD` di environment server), tanpa nama pengguna. Tanpa password dan secret sesi, panel terkunci. Sesi berlaku 12 jam. Halaman dan API admin dijaga dua lapis: `src/proxy.ts` dan pemeriksaan di setiap halaman/route.

Setiap login berhasil, password salah, dan keluar dicatat di **Log akses** (`/admin/akses`): waktu, IP, perkiraan kota dan negara, browser dan OS, serta ID perangkat acak di cookie browser, dengan tanda **Perangkat baru**. Nomor seri atau MAC laptop tidak bisa dibaca dari browser, jadi ID perangkat adalah pengenal terbaik yang tersedia; ia berganti bila cookie dihapus atau memakai browser lain. Karena password dipakai bersama, log menunjukkan perangkat dan lokasi, bukan nama orang. Akun admin per orang dan pembagian peran dicatat sebagai tahap lanjutan.

## Kondisi proyek saat rangkuman dibuat

- Sudah ada: acara, RSVP, tautan umum dan personal, lokasi, unggah foto lokasi dan galeri foto pada halaman acara, kontak PIC, survei feedback, dan tautan ulasan Google opsional.
- RSVP saat ini menanyakan alergi, **belum** seluruh preferensi makanan atau kebutuhan aksesibilitas.
- Perubahan lokal yang belum di-commit (branch `feat/konten-e-guide-fleksibel`): konten e-guide opsional (pengantar kontak, jabatan dan organisasi PIC, pengantar survei, judul/deskripsi/teks tombol ulasan) serta bagian Our Team yang nonaktif secara default. Tes otomatis lulus per 14 Oktober (210 tes); lint, typecheck, dan build belum dijalankan untuk perubahan itu.
- Migrasi undangan personal (`202610110001_personal_invitations.sql`) belum diterapkan ke Supabase remote menurut `docs/setup.md`; keadaan data Supabase live belum diverifikasi dalam diskusi ini.
- Belum ada: jenis acara dan audiens, fase, tema tamu, panduan rute bergambar, jadwal per hari, handbook, tiket, kursi, denah, check-in, BEO, galeri pasca-acara di R2, halaman terima kasih, ajakan kolaborasi, pustaka konten bersama, dukungan beberapa bahasa, serta login.

## Hal yang masih terbuka

- Tinjauan usulan: font admin, warna per tahap, serta kebijakan BEO, retensi data, dan izin foto.
- Tinjauan draf wording (`docs/wording-draf.xlsx`) oleh tim, termasuk istilah tradisi untuk templat Nyadran.
- Kapan migrasi database untuk form tamu bertahap (makanan jamak, akses, opsi foto) dan tiket dilakukan.
- Notifikasi push: kapan dibangun, dan siapa yang boleh mengirim kabar perubahan jadwal.
- Cara tautan per halaman untuk deck selain PDF (Google Slides, Canva).
- Nama domain baru.
- Bucket R2 baru dan kredensialnya (dibuat oleh pemilik), diperlukan sebelum galeri acara dibangun.
- Akun admin per orang dan pembagian peran (tahap lanjutan; sekarang password bersama).
- Tampilan fase otomatis (digambar dulu sebelum dibangun).
- Bahasa pertama yang didukung, penanggung jawab dan proses persetujuan terjemahan, serta perilaku saat terjemahan belum tersedia.
- Daftar pilihan makanan dan aksesibilitas final yang benar-benar dapat ditangani tim; pengaitan jawaban kebutuhan dengan RSVP pada tautan umum, cara memperbarui jawaban, dan tenggat perubahan.
- Naskah dan aset tiap tema; materi final panduan perjalanan dan Our Team, termasuk validitas rute dan kontak serta izin foto.
- Batas ukuran dan jumlah unggahan foto per acara.
- Cadangan database dan berkas foto, serta tahapan pengujian sebelum perubahan diterapkan pada data yang sudah ada.
- Urutan pembangunan. Belum ada acara dalam waktu dekat, jadi urutan mengikuti fondasi, bukan tanggal acara.

## Prinsip pelaksanaan nanti

Rancang dan uji perjalanan tamu di ponsel lebih dulu; pertahankan satu struktur untuk tautan umum dan personal, berbagai jenis acara, dan berbagai tema. Tambahkan modul tanpa menghapus data lama, uji terhadap acara lama dan baru, periksa pratinjau tiap bahasa dan tiap tema, lalu verifikasi BEO dengan cara kerja hospitality. Implementasi, migrasi, perubahan akses, dan publikasi materi atau foto memerlukan keputusan serta pemeriksaan tersendiri; dokumen ini belum mengotorisasi tindakan tersebut.
