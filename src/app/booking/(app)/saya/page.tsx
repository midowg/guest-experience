import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { BookingList } from "@/components/booking/BookingList";
import css from "@/components/booking/booking.module.css";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { bookingPath } from "@/lib/routes";
import { myOfficeBookings } from "@/lib/server/booking/bookings";
import { listRooms } from "@/lib/server/pra-wam/appraisal";
import { requireMemberPage } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Booking saya" };

/** Booking saya: what the person booked or is invited to, from today on, from this app and from WAM. */
export default async function MyBookingsPage() {
  const member = await requireMemberPage(bookingPath.mine);
  const [bookings, rooms] = await Promise.all([myOfficeBookings(member, wibDate(new Date().toISOString())), listRooms()]);
  return <>
    <div className={css.head}>
      <div><h1>Booking saya</h1><p className={css.lead}>Dari hari ini ke depan, termasuk yang mengundangmu.</p></div>
      <Link href={bookingPath.rooms({ new: "1" })} className={css.btn}><CalendarPlus size={20} aria-hidden />Booking ruangan</Link>
    </div>
    <BookingList bookings={bookings} rooms={rooms} empty="Belum ada booking dari hari ini ke depan." />
  </>;
}
