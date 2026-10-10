-- Perbaikan: melengkapi acara yang belum punya kolom foto latar.
--
-- Mengapa perlu: migrasi 202610090002 pernah dijalankan sebelum bagian 'hero' ada di
-- dalamnya. Saat dijalankan ulang, `create table site_settings` gagal karena tabelnya
-- sudah ada, dan karena satu transaksi, pengisian kolom ikut dibatalkan. Akibatnya
-- tabel pengaturan terbentuk tetapi acara tidak pernah mendapat kolom 'hero'.
--
-- Berkas ini hanya mengisi nilai yang hilang dan aman dijalankan berulang kali.
-- Acara yang sudah punya foto latar tidak disentuh.
begin;

-- Nilai default mempertahankan tampilan sekarang: tanpa foto latar, teks di kiri bawah.
update public.events
set content = content || jsonb_build_object('hero', jsonb_build_object(
      'url', '', 'alt', '', 'srcset', '[]'::jsonb, 'focus', 'center', 'text_position', 'left'))
where not (content ? 'hero');

update public.events
set content = content || jsonb_build_object('gallery', '[]'::jsonb)
where not (content ? 'gallery');

-- Foto galeri lama belum punya daftar ukuran; tanpa ini editor menolak menyimpan.
update public.events
set content = jsonb_set(content, '{gallery}', (
  select coalesce(jsonb_agg(case when item ? 'srcset' then item else item || jsonb_build_object('srcset', '[]'::jsonb) end), '[]'::jsonb)
  from jsonb_array_elements(content->'gallery') as item
))
where jsonb_typeof(content->'gallery') = 'array'
  and exists (select 1 from jsonb_array_elements(content->'gallery') as item where not (item ? 'srcset'));

-- Batas ukuran dan tipe berkas: pemeriksaan menemukan bucket terbentuk tanpa keduanya,
-- jadi ditegaskan di sini. Server tetap memeriksa isi berkas, ini lapis tambahan.
update storage.buckets
set public = true,
    file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/avif']
where id = 'event-photos';

commit;

-- Hasil yang diharapkan: kolom "kurang_hero" dan "kurang_gallery" bernilai 0.
select count(*) filter (where not (content ? 'hero'))    as kurang_hero,
       count(*) filter (where not (content ? 'gallery')) as kurang_gallery,
       count(*)                                          as total_acara
from public.events;
