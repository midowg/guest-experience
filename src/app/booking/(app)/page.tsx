import Link from "next/link";
import { ArrowUpRight, CalendarCheck, CalendarPlus, Car, CheckCircle2, CircleDot, DoorOpen, MapPinned, Video } from "lucide-react";
import { BookingList } from "@/components/booking/BookingList";
import css from "@/components/booking/booking.module.css";
import { roomNow } from "@/lib/booking/rules";
import { clockLabel, isWorkday, wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import { bookingPath } from "@/lib/routes";
import { myOfficeBookings, officeDay } from "@/lib/server/booking/bookings";
import { requireMemberPage } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beranda" };

const soon = [
  { name: "Mobil", icon: <Car size={26} aria-hidden /> },
  { name: "Zoom", icon: <Video size={26} aria-hidden /> },
  { name: "Kegiatan", icon: <MapPinned size={26} aria-hidden /> },
];

/** Beranda: what can be booked (big icons), what each room is doing now, and the next bookings of the person. */
export default async function BookingHome() {
  const member = await requireMemberPage(bookingPath.home);
  const now = new Date();
  const today = wibDate(now.toISOString());
  const [day, mine] = await Promise.all([officeDay(today, member), myOfficeBookings(member, today)]);
  const upcoming = mine.filter(item => new Date(item.endsAt) > now).slice(0, 3);
  return <>
    <div className={css.hello}>
      <div><h1>Halo, {member.nickname || member.name}</h1><p>Mau booking apa hari ini?</p></div>
      <Link href={bookingPath.rooms({ new: "1" })} className={css.helloBtn}><CalendarPlus size={20} aria-hidden />Booking ruangan</Link>
    </div>

    <ul className={css.tiles}>
      <li><Link href={bookingPath.rooms()} className={css.tile}>
        <span className={css.tileIcon}><DoorOpen size={26} aria-hidden /></span>
        <ArrowUpRight size={20} aria-hidden className={css.tileArrow} />
        <span><span className={css.tileName}>Ruangan</span><br /><span className={css.tileHint}>{day.rooms.length} ruangan siap dipakai</span></span>
      </Link></li>
      {soon.map(item => <li key={item.name}><div className={`${css.tile} ${css.tileSoon}`}>
        <span className={css.tileIcon}>{item.icon}</span>
        <span><span className={css.tileName}>{item.name}</span><br /><span className={css.tileHint}>Segera hadir</span></span>
      </div></li>)}
    </ul>

    {isWorkday(today) && day.rooms.length > 0 && <section aria-labelledby="now-title" className={css.section}>
      <h2 id="now-title">Ruangan sekarang</h2>
      <ul className={css.list}>{day.rooms.map(room => {
        const state = roomNow(day.bookings.filter(item => item.roomId === room.id), now);
        return <li key={room.id} className={css.itemRow}>
          <div className={css.itemMain}><h3>{room.name}</h3>
            {state.busy && <p className={css.itemMeta}><span>{state.busy.title} · {state.busy.bookedBy.name}</span></p>}</div>
          {state.busy
            ? <span className={css.chipBusy}><CircleDot size={14} aria-hidden />Dipakai sampai {clockLabel(wibTime(state.busy.endsAt))}</span>
            : <span className={css.chipFree}><CheckCircle2 size={14} aria-hidden />{state.next ? `Kosong sampai ${clockLabel(wibTime(state.next.startsAt))}` : "Kosong"}</span>}
        </li>;
      })}</ul>
    </section>}

    <section aria-labelledby="mine-title" className={css.section}>
      <div className={css.head}><h2 id="mine-title">Booking saya berikutnya</h2>
        {mine.length > upcoming.length && <Link href={bookingPath.mine} className={css.btnQuiet}><CalendarCheck size={18} aria-hidden />Lihat semua</Link>}</div>
      <BookingList bookings={upcoming} rooms={day.rooms} empty="Belum ada booking. Mulai dari Ruangan." />
    </section>
  </>;
}
