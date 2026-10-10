-- Menghapus acara beserta seluruh isinya, termasuk jawaban tamu.
--
-- Penghapusan dibungkus fungsi agar dapat diperiksa haknya dan dicatat, bukan dibuka
-- sebagai izin delete langsung dari browser. Jawaban tamu ikut terhapus permanen melalui
-- foreign key `on delete cascade`, jadi antarmuka wajib menyatakan hal itu sebelum
-- pengguna menekan tombol.
begin;

create or replace function public.delete_event(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare target public.events; rsvp_count integer; feedback_count integer;
begin
  if not public.is_event_admin() then raise exception 'FORBIDDEN'; end if;

  select * into target from public.events where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  -- Acara yang sedang tayang tidak boleh lenyap diam-diam dari halaman utama;
  -- pengelola harus menghentikan tayangnya lebih dulu, sebagai langkah sadar.
  if exists (select 1 from public.site_settings where id and featured_event_id = p_id) then
    raise exception 'EVENT_IS_FEATURED';
  end if;

  select count(*) into rsvp_count from public.rsvps where event_id = p_id;
  select count(*) into feedback_count from public.feedback_submissions where event_id = p_id;

  delete from public.events where id = p_id;

  return jsonb_build_object('slug', target.slug, 'rsvps', rsvp_count, 'feedback', feedback_count);
end $$;
revoke all on function public.delete_event(uuid) from public, anon;
grant execute on function public.delete_event(uuid) to authenticated;

commit;
