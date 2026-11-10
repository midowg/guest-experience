import Link from "next/link";
import { Search } from "lucide-react";
import { BookingList } from "@/components/booking/BookingList";
import css from "@/components/booking/booking.module.css";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { bookingPath } from "@/lib/routes";
import { officeRange } from "@/lib/server/booking/bookings";
import { requireMemberPage } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Semua booking" };

type Filters = { dari?: string; sampai?: string; q?: string; ruang?: string; untuk?: string };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 41;
const shift = (date: string, days: number) => {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
};

/**
 * Kelola → Semua booking: every booking from one day to another (two weeks from today by default,
 * at most six weeks), searched by activity or name, by room, internal or eksternal. Cancelling
 * someone's asks for a reason the booker reads; changing one opens it on the schedule.
 */
export default async function AllBookings({ searchParams }: { searchParams: Promise<Filters> }) {
  const filters = await searchParams;
  const member = await requireMemberPage(bookingPath.manageBookings(filters));
  const today = wibDate(new Date().toISOString());
  const from = filters.dari && DAY.test(filters.dari) ? filters.dari : today;
  const wanted = filters.sampai && DAY.test(filters.sampai) && filters.sampai >= from ? filters.sampai : shift(from, 13);
  const to = wanted > shift(from, MAX_DAYS) ? shift(from, MAX_DAYS) : wanted;
  const { rooms, bookings } = await officeRange(from, to, member);
  const query = (filters.q ?? "").trim().toLowerCase();
  const shown = bookings.filter(item => !item.isSession)
    .filter(item => !filters.ruang || item.roomId === filters.ruang)
    .filter(item => !filters.untuk || item.audience === filters.untuk)
    .filter(item => !query || [item.title, item.bookedBy.name, item.bookedBy.fullName ?? "", item.bookedBy.department, item.externalNote].join(" ").toLowerCase().includes(query));
  return <>
    <form method="get" className={css.filters} aria-label="Saring booking">
      <div className={css.field}><label className={css.label} htmlFor="f-q"><Search size={18} aria-hidden />Cari</label>
        <input id="f-q" name="q" className={css.control} defaultValue={filters.q ?? ""} placeholder="Kegiatan, nama, departemen, tamu" /></div>
      <div className={css.field}><label className={css.label} htmlFor="f-from">Dari</label>
        <input id="f-from" name="dari" type="date" className={css.control} defaultValue={from} /></div>
      <div className={css.field}><label className={css.label} htmlFor="f-to">Sampai</label>
        <input id="f-to" name="sampai" type="date" className={css.control} defaultValue={to} /></div>
      <div className={css.field}><label className={css.label} htmlFor="f-room">Ruangan</label>
        <select id="f-room" name="ruang" className={css.control} defaultValue={filters.ruang ?? ""}>
          <option value="">Semua ruangan</option>{rooms.filter(room => room.bookable).map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
        </select></div>
      <div className={css.field}><label className={css.label} htmlFor="f-for">Untuk</label>
        <select id="f-for" name="untuk" className={css.control} defaultValue={filters.untuk ?? ""}>
          <option value="">Semua</option><option value="internal">Internal</option><option value="eksternal">Eksternal</option>
        </select></div>
      <div className={css.filterActs}>
        <button type="submit" className={css.btn}>Terapkan</button>
        <Link href={bookingPath.manageBookings()} className={css.btnQuiet}>Hapus saringan</Link>
      </div>
    </form>
    <p className={css.lead} role="status">{shown.length} booking{wanted !== to ? " · rentang dipotong menjadi enam minggu" : ""}.</p>
    <BookingList manage bookings={shown} rooms={rooms} empty="Tidak ada booking yang cocok." />
  </>;
}
