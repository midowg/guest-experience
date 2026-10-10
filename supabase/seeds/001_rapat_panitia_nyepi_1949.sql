-- Acara pertama: Rapat Panitia Inti dan Koordinator, Hari Suci Nyepi Saka 1949 DIY.
-- Sumber: "Handbook Digital Rapat Panitia Inti dan Koordinator ... .docx" dan koreksi
-- tanggal dari penyelenggara (Senin, 12 Oktober 2026).
--
-- Dibuat sebagai DRAFT. Tinjau di /admin, lalu ubah status menjadi "Dipublikasikan"
-- dan simpan. Publikasi tetap keputusan penyelenggara, bukan efek samping seed ini.
--
-- Aman dijalankan ulang: memperbarui acara dengan ID tetap di bawah, tanpa menyentuh
-- RSVP atau jawaban survei. Seluruhnya dalam satu transaksi: bila ada yang gagal,
-- tidak ada perubahan yang tersimpan. Jalankan di Supabase Dashboard -> SQL Editor.
begin;

-- 1. Isi undangan. Kolom id/slug/status/agenda disimpan terpisah oleh skema,
--    sehingga tidak dimasukkan ke dalam "content".
insert into public.events (id, slug, status, content)
values (
  '10f3a511-2331-4000-8000-000000000001',
  'rapat-panitia-nyepi-1949',
  'draft',
  jsonb_build_object(
    'title', 'Rapat Panitia Inti dan Koordinator',
    'subtitle', 'Hari Suci Nyepi Tahun Saka 1949 D.I. Yogyakarta',
    'organizer', 'Panitia Hari Suci Nyepi Tahun Saka 1949 D.I. Yogyakarta',
    'greeting', 'Om Swastyastu',
    'introduction', 'Dengan hormat, kami mengundang Bapak/Ibu/Saudara untuk hadir dalam Rapat Panitia Inti dan Koordinator. Pertemuan ini menjadi ruang bersama untuk membahas dan menyusun Buku Grand Design Launching Hari Suci Nyepi Saka 1949 DIY.',
    'closing', 'Terima kasih atas kehadiran dan kerja sama Bapak/Ibu/Saudara. Om Santi Santi Santi Om.',
    'starts_at', '2026-10-12T18:00:00+07:00',
    'ends_at',   '2026-10-12T21:00:00+07:00',
    'timezone', 'Asia/Jakarta',
    'venue_name', 'PT. Werkudara',
    'address', 'Jl. Bhinneka No. 09 RT 03/RW 07, Pondok, Condong Catur, Depok, Sleman',
    'location_url', 'https://maps.app.goo.gl/ctLcnKszth9QX83AA',
    -- Petunjuk kedatangan, foto lokasi, pertanyaan survei GA dan tautan review belum
    -- tersedia. Dikosongkan dengan sengaja; bagiannya tidak tampil sampai diisi di /admin.
    'arrival_notes', '',
    'venue_image_url', '', 'venue_image_alt', '', 'venue_image_credit', '',
    'gallery', '[]'::jsonb,
    -- Foto latar belum tersedia; undangan tampil dengan tata letak teks.
    'hero', jsonb_build_object('url', '', 'alt', '', 'srcset', '[]'::jsonb, 'focus', 'center', 'text_position', 'left'),
    'review_url', '', 'review_enabled', false,
    'rsvp_enabled', true, 'rsvp_closes_at', null,
    'feedback_enabled', false, 'feedback_opens_at', null,
    'sections', jsonb_build_array(
      jsonb_build_object('key', 'about',    'enabled', true),
      jsonb_build_object('key', 'agenda',   'enabled', true),
      jsonb_build_object('key', 'location', 'enabled', true),
      jsonb_build_object('key', 'rsvp',     'enabled', true),
      jsonb_build_object('key', 'feedback', 'enabled', true)
    ),
    'topics', jsonb_build_array(
      jsonb_build_object('title', 'Agenda kegiatan',          'description', 'Meninjau seluruh rangkaian kegiatan yang direncanakan dalam Grand Design.'),
      jsonb_build_object('title', 'Penyederhanaan kegiatan',  'description', 'Mengidentifikasi kegiatan yang dapat digabung atau disederhanakan.'),
      jsonb_build_object('title', 'Green Dharma',             'description', 'Mendiskusikan kemungkinan penggabungan kegiatan, misalnya Dharma Sadhana dan Green Dharma lintas iman.'),
      jsonb_build_object('title', 'Pemaparan koordinator',    'description', 'Koordinator menyampaikan gambaran acara, petugas, dan kebutuhan terkait.')
    )
  )
)
on conflict (id) do update
  set content = excluded.content, updated_at = now();

-- 2. Rundown. Sesi lain yang pernah ditambahkan lewat /admin dihapus agar rundown
--    persis mengikuti handbook.
delete from public.event_agenda_items
where event_id = '10f3a511-2331-4000-8000-000000000001'
  and id not in (
    '20f3a511-2331-4000-8000-000000000001',
    '20f3a511-2331-4000-8000-000000000002',
    '20f3a511-2331-4000-8000-000000000003',
    '20f3a511-2331-4000-8000-000000000004'
  );

insert into public.event_agenda_items (id, event_id, starts_at, ends_at, title, description, sort_order)
values
  ('20f3a511-2331-4000-8000-000000000001', '10f3a511-2331-4000-8000-000000000001', '2026-10-12T18:00:00+07:00', '2026-10-12T18:10:00+07:00', 'Kedatangan peserta', 'Persiapan peserta', 0),
  ('20f3a511-2331-4000-8000-000000000002', '10f3a511-2331-4000-8000-000000000001', '2026-10-12T18:10:00+07:00', '2026-10-12T19:00:00+07:00', 'Meeting', 'Sesi pembahasan pertama', 1),
  ('20f3a511-2331-4000-8000-000000000003', '10f3a511-2331-4000-8000-000000000001', '2026-10-12T19:00:00+07:00', '2026-10-12T19:30:00+07:00', 'Makan malam', 'Istirahat bersama', 2),
  ('20f3a511-2331-4000-8000-000000000004', '10f3a511-2331-4000-8000-000000000001', '2026-10-12T19:30:00+07:00', '2026-10-12T21:00:00+07:00', 'Meeting lanjutan', 'Sesi pembahasan kedua dan penutup', 3)
on conflict (id) do update
  set starts_at   = excluded.starts_at,
      ends_at     = excluded.ends_at,
      title       = excluded.title,
      description = excluded.description,
      sort_order  = excluded.sort_order;

commit;

-- Periksa hasilnya: harus satu baris, status draft, empat sesi.
select e.slug,
       e.status,
       e.content->>'title' as judul,
       (select count(*) from public.event_agenda_items a where a.event_id = e.id) as jumlah_sesi
from public.events e
where e.id = '10f3a511-2331-4000-8000-000000000001';
