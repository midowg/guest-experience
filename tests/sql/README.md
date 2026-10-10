# Uji kebijakan database

Memeriksa bahwa migrasi benar-benar melindungi data tamu, bukan hanya terlihat benar saat dibaca. Dijalankan pada PostgreSQL sementara; tidak pernah menyentuh Supabase.

```bash
docker run -d --rm --name gh-pgtest -e POSTGRES_PASSWORD=testonly -p 55433:5432 postgres:17-alpine
docker exec -i gh-pgtest psql -U postgres -v ON_ERROR_STOP=1 -q < tests/sql/harness.sql
docker exec -i gh-pgtest psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/202610090001_guest_experience.sql
docker exec -i gh-pgtest psql -U postgres -v ON_ERROR_STOP=1    < tests/sql/policies.sql
docker stop gh-pgtest
```

Lolos bila baris terakhir berbunyi `ALL POLICY CHECKS PASSED`. Gunakan database kosong setiap kali; data sisa menyebabkan kegagalan palsu.

`harness.sql` hanya menyediakan tiruan `auth.users`, `auth.uid()`, dan peran Supabase agar migrasi dapat dijalankan di PostgreSQL biasa. Berkas ini khusus pengujian.

## Yang diperiksa (24 asersi)

**Publikasi** — isian wajib ditolak bila kosong; draft tetap tersembunyi dari publik.

**Pengiriman tamu** — RSVP tersimpan pada acara terbit; kunci yang sama dengan isi sama tidak menggandakan baris; kunci yang sama dengan isi berbeda ditolak; acara belum terbit menolak RSVP; honeypot ditolak; nilai rating di luar rentang ditolak.

**Pembatasan laju** — percobaan ketiga benar-benar diblokir dalam jendela dua.

**Akses anonim** — hanya acara terbit yang terbaca; RSVP dan feedback ditolak; penulisan langsung dari browser ditolak.

**Akun bukan admin** — tidak memperoleh akses lebih dari tamu anonim dan tidak dapat memublikasikan.

**Admin** — membaca draft, RSVP, dan pertanyaan survei.

**Integritas survei** — pertanyaan yang sudah menerima jawaban tidak dapat diubah diam-diam.

## Temuan dari pengujian ini

`consume_rate_limit` semula memakai variabel bernama `current_time`, yang bentrok dengan fungsi bawaan SQL dan membuat pembatasan laju gagal saat dijalankan. Diperbaiki menjadi `now_ts`. Kesalahan ini tidak terlihat dari membaca kode.
