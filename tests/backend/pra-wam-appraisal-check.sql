-- Execute ONLY against the disposable PostgreSQL migration-check container.
begin;
set local role service_role;
do $$
declare
  yulia uuid; sofyan uuid; vasuki uuid; limasan uuid; first_id uuid; second_id uuid;
begin
  insert into public.employees (full_name, department) values ('Yulia Uji', 'BAS') returning id into yulia;
  insert into public.employees (full_name, department) values ('Sofyan Uji', 'CoE') returning id into sofyan;
  select id into vasuki from public.pw_rooms where slug = 'vasuki';
  select id into limasan from public.pw_rooms where slug = 'limasan';
  if (select count(*) from public.pw_rooms) <> 7 then raise exception 'rooms not seeded'; end if;

  -- Rabu 4 Nov 2026, 10.00–11.00 WIB.
  first_id := public.pw_save_booking(null, vasuki, 'Appraisal 1-on-1', '', '2026-11-04 03:00Z', '2026-11-04 04:00Z', yulia, array[sofyan], 4);
  if (select count(*) from public.pw_room_booking_participants where booking_id = first_id) <> 2 then raise exception 'booker not added as participant'; end if;

  begin perform public.pw_save_booking(null, vasuki, 'Review KPI', '', '2026-11-04 03:30Z', '2026-11-04 04:30Z', sofyan, '{}', 4); raise exception 'UNEXPECTED: overlap saved';
  exception when exclusion_violation then null; end;
  -- Back to back is fine: [10.00, 11.00) then [11.00, 12.00).
  second_id := public.pw_save_booking(null, vasuki, 'Review KPI', '', '2026-11-04 04:00Z', '2026-11-04 05:00Z', sofyan, '{}', 4);

  begin perform public.pw_save_booking(null, limasan, 'Appraisal', '', '2026-11-05 03:00Z', '2026-11-05 04:00Z', yulia, '{}', 4); raise exception 'UNEXPECTED: area booked';
  exception when raise_exception then if sqlerrm <> 'ROOM_NOT_BOOKABLE' then raise; end if; end;
  -- 08.30 WIB, before opening.
  begin perform public.pw_save_booking(null, vasuki, 'Pagi', '', '2026-11-05 01:30Z', '2026-11-05 02:30Z', yulia, '{}', 4); raise exception 'UNEXPECTED: before 09.00';
  exception when check_violation then null; end;
  -- 10.15 WIB, not on the half hour.
  begin perform public.pw_save_booking(null, vasuki, 'Seperempat', '', '2026-11-05 03:15Z', '2026-11-05 04:15Z', yulia, '{}', 4); raise exception 'UNEXPECTED: off step';
  exception when check_violation then null; end;
  -- Sabtu 7 Nov.
  begin perform public.pw_save_booking(null, vasuki, 'Sabtu', '', '2026-11-07 03:00Z', '2026-11-07 04:00Z', yulia, '{}', 4); raise exception 'UNEXPECTED: weekend';
  exception when check_violation then null; end;
  -- 5 hours.
  begin perform public.pw_save_booking(null, vasuki, 'Panjang', '', '2026-11-05 02:00Z', '2026-11-05 07:00Z', yulia, '{}', 4); raise exception 'UNEXPECTED: over 4 hours';
  exception when check_violation then null; end;

  begin perform public.pw_save_booking(null, vasuki, 'Batas', '', '2026-11-04 06:00Z', '2026-11-04 06:30Z', yulia, '{}', 1); raise exception 'UNEXPECTED: daily limit passed';
  exception when raise_exception then if sqlerrm <> 'BOOKING_DAILY_LIMIT' then raise; end if; end;
  -- Editing the one booking of the day does not count against the limit.
  perform public.pw_save_booking(first_id, vasuki, 'Appraisal 1-on-1 (ubah)', 'Ruang tenang', '2026-11-04 02:00Z', '2026-11-04 03:00Z', yulia, '{}', 1);
  if (select count(*) from public.pw_room_booking_participants where booking_id = first_id) <> 1 then raise exception 'participants not replaced'; end if;

  update public.pw_room_bookings set status = 'batal', cancelled_by = yulia, cancelled_at = now() where id = second_id;
  perform public.pw_save_booking(null, vasuki, 'Ambil slot', '', '2026-11-04 04:00Z', '2026-11-04 05:00Z', yulia, '{}', 4);
  raise notice 'PASS: overlap refused, back to back allowed, hours and limit enforced, cancel frees the slot';
end $$;
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.pw_room_bookings; raise exception 'UNEXPECTED: anon read bookings';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.pw_accounts; raise exception 'UNEXPECTED: anon read accounts';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: Pra WAM tables are server only';
end $$;
reset role;

rollback;
