-- Aman dijalankan ulang: setiap pernyataan memakai bentuk if-not-exists atau replace.
-- Sebelumnya tidak demikian, sehingga menjalankan ulang membatalkan seluruh transaksi
-- dan pengisian kolom ikut gagal.
-- Menayangkan satu acara di halaman utama, sehingga tamu cukup membuka domain tanpa slug.
-- Galeri foto disimpan di dalam kolom content yang sudah berbentuk jsonb, jadi tidak
-- memerlukan tabel baru.
begin;

-- Acara yang dibuat sebelum galeri dan foto latar ada perlu kolom ini, agar editor dan
-- halaman tamu tidak menemui nilai yang hilang. Nilai default menjaga tampilan lama:
-- tanpa foto latar, teks di kiri bawah seperti sebelumnya.
update public.events
set content = content
  || case when content ? 'gallery' then '{}'::jsonb else jsonb_build_object('gallery', '[]'::jsonb) end
  || case when content ? 'hero' then '{}'::jsonb else jsonb_build_object('hero', jsonb_build_object(
       'url', '', 'alt', '', 'srcset', '[]'::jsonb, 'focus', 'center', 'text_position', 'left')) end
where not (content ? 'gallery') or not (content ? 'hero');

-- Galeri lama belum punya daftar ukuran; foto tetap tampil memakai berkas aslinya.
update public.events
set content = jsonb_set(content, '{gallery}', (
  select coalesce(jsonb_agg(case when item ? 'srcset' then item else item || jsonb_build_object('srcset', '[]'::jsonb) end), '[]'::jsonb)
  from jsonb_array_elements(content->'gallery') as item
))
where jsonb_typeof(content->'gallery') = 'array'
  and exists (select 1 from jsonb_array_elements(content->'gallery') as item where not (item ? 'srcset'));

-- Satu baris saja: acara mana yang sedang tayang. Dikunci oleh check agar tidak ada
-- baris kedua yang membuat "sedang tayang" menjadi ambigu.
create table if not exists public.site_settings (
  id boolean primary key default true check (id),
  featured_event_id uuid references public.events(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.site_settings (id, featured_event_id) values (true, null) on conflict (id) do nothing;

alter table public.site_settings enable row level security;
-- Tamu perlu tahu acara mana yang tayang; isinya hanya satu ID, bukan data pribadi.
drop policy if exists settings_read on public.site_settings;
create policy settings_read on public.site_settings for select to anon, authenticated using (true);
revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;
grant all on public.site_settings to service_role;

-- Hanya acara yang sudah dipublikasikan yang boleh ditayangkan di halaman utama,
-- supaya draft tidak pernah bocor lewat domain utama.
create or replace function public.set_featured_event(p_event uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare event_status text;
begin
  if not public.is_event_admin() then raise exception 'FORBIDDEN'; end if;
  if p_event is not null then
    select status into event_status from public.events where id = p_event;
    if not found then raise exception 'NOT_FOUND'; end if;
    if event_status <> 'published' then raise exception 'EVENT_CLOSED'; end if;
  end if;
  update public.site_settings set featured_event_id = p_event, updated_at = clock_timestamp() where id;
  return p_event;
end $$;
revoke all on function public.set_featured_event(uuid) from public, anon;
grant execute on function public.set_featured_event(uuid) to authenticated;

-- Acara yang ditarik kembali menjadi draft atau diarsipkan tidak boleh tetap tayang.
create or replace function public.clear_featured_when_unpublished() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'published' then
    update public.site_settings set featured_event_id = null, updated_at = clock_timestamp()
    where id and featured_event_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists events_unpublished_clears_featured on public.events;
create trigger events_unpublished_clears_featured after update of status on public.events
  for each row execute function public.clear_featured_when_unpublished();

-- Dokumen acara yang sedang tayang, mengikuti aturan baca yang sama dengan event_documents.
create or replace view public.featured_event with (security_invoker = true) as
select d.* from public.event_documents d
join public.site_settings s on s.featured_event_id = d.id
where d.status = 'published';
grant select on public.featured_event to anon, authenticated, service_role;

commit;
