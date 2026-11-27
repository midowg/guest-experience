-- Posisi teks pembuka disederhanakan menjadi dua pilihan: rata kiri atau rata tengah.
-- Empat posisi sebelumnya dipetakan ke padanannya, sehingga acara yang sudah tersimpan
-- tidak kehilangan pilihannya. Aman dijalankan berulang.
begin;

update public.events
set content = jsonb_set(content, '{hero,text_position}',
  to_jsonb(case
    when content #>> '{hero,text_position}' in ('bottom-center', 'center-center', 'center') then 'center'
    else 'left'
  end))
where content ? 'hero'
  and coalesce(content #>> '{hero,text_position}', '') not in ('left', 'center');

commit;

-- Hasil yang diharapkan: kolom "perlu_diperbaiki" bernilai 0.
select count(*) filter (where coalesce(content #>> '{hero,text_position}', '') not in ('left', 'center')) as perlu_diperbaiki,
       count(*) as total_acara
from public.events;
