import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, CalendarCheck, ChevronLeft, ChevronRight, DoorOpen, Handshake } from "lucide-react";
import { BookingList } from "@/components/booking/BookingList";
import css from "@/components/booking/booking.module.css";
import { dayLabel, wibDate } from "@/lib/pra-wam/appraisal";
import { managesFacilities } from "@/lib/pra-wam/roles";
import { bookingPath } from "@/lib/routes";
import { officeDay } from "@/lib/server/booking/bookings";
import { requireMemberPage } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kelola" };

const shift = (date: string, days: number) => {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
};

/**
 * Kelola, for the administration staff (role "ga") and Admin WAM: every booking of one day, any
 * day, with the full name of the booker, to cancel when a room is needed. Anyone else finds no page.
 */
export default async function ManageBookings({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const asked = (await searchParams).date;
  const member = await requireMemberPage(bookingPath.manage(asked));
  if (!managesFacilities(member)) notFound();
  const today = wibDate(new Date().toISOString());
  const date = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && !Number.isNaN(Date.parse(asked)) ? asked : today;
  const day = await officeDay(date, member);
  const own = day.bookings.filter(item => !item.isSession);
  return <>
    <div><h1>Kelola booking</h1><p className={css.lead}>Semua booking ruangan pada satu hari, dari aplikasi ini dan dari WAM.</p></div>

    <form method="get" className={css.dateBar}>
      <Link href={bookingPath.manage(shift(date, -1))} className={css.iconBtn} aria-label="Hari sebelumnya"><ChevronLeft size={20} aria-hidden /></Link>
      <span className={css.dateName}>{date === today ? "Hari ini · " : ""}{dayLabel(date)}</span>
      <Link href={bookingPath.manage(shift(date, 1))} className={css.iconBtn} aria-label="Hari berikutnya"><ChevronRight size={20} aria-hidden /></Link>
      <input type="date" name="date" className={css.dateInput} aria-label="Pilih tanggal" defaultValue={date} />
      <button type="submit" className={css.btnQuiet}>Lihat</button>
      {date !== today && <Link href={bookingPath.manage()} className={css.btnQuiet}>Hari ini</Link>}
    </form>

    <dl className={css.stats}>
      <div className={css.stat}><span className={css.statIcon}><CalendarCheck size={20} aria-hidden /></span><div><dt>Booking</dt><dd>{own.length}</dd></div></div>
      <div className={css.stat}><span className={css.statIcon}><Building2 size={20} aria-hidden /></span><div><dt>Dari aplikasi ini</dt><dd>{own.filter(item => item.source === "kantor").length}</dd></div></div>
      <div className={css.stat}><span className={css.statIcon}><Handshake size={20} aria-hidden /></span><div><dt>Eksternal</dt><dd>{own.filter(item => item.audience === "eksternal").length}</dd></div></div>
      <div className={css.stat}><span className={css.statIcon}><DoorOpen size={20} aria-hidden /></span><div><dt>Ruangan terpakai</dt><dd>{new Set(day.bookings.map(item => item.roomId)).size} / {day.rooms.length}</dd></div></div>
    </dl>

    <BookingList manage bookings={day.bookings} rooms={day.rooms} empty="Tidak ada booking pada hari ini." />
  </>;
}
