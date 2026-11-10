import Link from "next/link";
import { ArrowUpRight, CalendarCheck, CalendarPlus, Car, CheckCircle2, CircleDot, DoorOpen, MapPinned, Video, Zap } from "lucide-react";
import { BookingList } from "@/components/booking/BookingList";
import css from "@/components/booking/booking.module.css";
import { availability, endOf, nextStart, roomNow } from "@/lib/booking/rules";
import { clockLabel, isWorkday, wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import { largestCapacity } from "@/lib/pra-wam/room-fit";
import { bookingPath } from "@/lib/routes";
import { myOfficeBookings, officeDay } from "@/lib/server/booking/bookings";
import { memberDepartments } from "@/lib/server/pra-wam/appraisal";
import { requireMemberPage } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beranda" };

const soon = [
  { name: "Mobil", icon: <Car size={26} aria-hidden /> },
  { name: "Zoom", icon: <Video size={26} aria-hidden /> },
  { name: "Kegiatan", icon: <MapPinned size={26} aria-hidden /> },
];

/**
 * Beranda: what can be booked (big icons); "Pakai sekarang", the rooms free from the next half
 * hour, booked in one tap for 30 minutes or an hour (Joan's "Meet now"); the rooms in use now; and
 * the person's next bookings.
 */
export default async function BookingHome() {
  const member = await requireMemberPage(bookingPath.home);
  const now = new Date();
  const today = wibDate(now.toISOString());
  const [day, mine, departments] = await Promise.all([officeDay(today, member), myOfficeBookings(member, today), memberDepartments(member.id).catch(() => [])]);
  const upcoming = mine.filter(item => new Date(item.endsAt) > now).slice(0, 3);
  const start = isWorkday(today) ? nextStart(today, now) : null;
  const largest = largestCapacity(day.rooms);
  const usesOf = (roomId: string) => day.bookings.filter(item => item.roomId === roomId);
  const quick = start ? day.rooms.map(room => ({ room, answer: availability(room, usesOf(room.id), { date: today, start, minutes: 30, people: null }, { now, largest, departments }) }))
    .flatMap(({ room, answer }) => answer.ok ? [{ room, until: answer.until }] : []) : [];
  const inUse = isWorkday(today) ? day.rooms.flatMap(room => { const state = roomNow(usesOf(room.id), now); return state.busy ? [{ room, busy: state.busy }] : []; }) : [];

  return <>
    <div className={css.hello}>
      <div><h1>Halo, {member.nickname || member.name}</h1><p>Mau booking apa hari ini?</p></div>
      <Link href={bookingPath.rooms()} className={css.helloBtn}><CalendarPlus size={20} aria-hidden />Booking ruangan</Link>
    </div>

    <ul className={css.tiles}>
      <li><Link href={bookingPath.rooms()} className={css.tile}>
        <span className={css.tileIcon}><DoorOpen size={26} aria-hidden /></span>
        <ArrowUpRight size={20} aria-hidden className={css.tileArrow} />
        <span><span className={css.tileName}>Ruangan</span><br /><span className={css.tileHint}>{day.rooms.length} ruangan</span></span>
      </Link></li>
      {soon.map(item => <li key={item.name}><div className={`${css.tile} ${css.tileSoon}`}>
        <span className={css.tileIcon}>{item.icon}</span>
        <span><span className={css.tileName}>{item.name}</span><br /><span className={css.tileHint}>Segera hadir</span></span>
      </div></li>)}
    </ul>

    {start && day.rooms.length > 0 && <section aria-labelledby="quick-title" className={css.section}>
      <div><h2 id="quick-title"><Zap size={20} aria-hidden className={css.titleIcon} />Pakai sekarang</h2>
        <p className={css.lead}>Ruangan yang kosong mulai {clockLabel(start)}.</p></div>
      {quick.length ? <ul className={css.list}>{quick.map(({ room, until }) => {
        const room60 = endOf(start, 60) <= until;
        return <li key={room.id} className={css.itemRow}>
          <div className={css.itemMain}><h3>{room.name}</h3>
            <span className={css.chipFree}><CheckCircle2 size={14} aria-hidden />Kosong sampai {clockLabel(until)}</span></div>
          <div className={css.itemActs}>
            <Link href={bookingPath.rooms({ date: today, new: room.id, start, menit: "30" })} className={css.btnQuiet}>30 mnt</Link>
            {room60 && <Link href={bookingPath.rooms({ date: today, new: room.id, start, menit: "60" })} className={css.btn}>1 jam</Link>}
          </div>
        </li>;
      })}</ul> : <p className={css.note}>Semua ruangan sedang terisi mulai {clockLabel(start)}. Lihat jam lain di Ruangan.</p>}
    </section>}

    {inUse.length > 0 && <section aria-labelledby="busy-title" className={css.section}>
      <h2 id="busy-title">Sedang dipakai</h2>
      <ul className={css.list}>{inUse.map(({ room, busy }) => <li key={room.id} className={css.itemRow}>
        <div className={css.itemMain}><h3>{room.name}</h3><p className={css.itemMeta}><span>{busy.title} · {busy.mine ? "Booking saya" : busy.bookedBy.name}</span></p></div>
        <span className={css.chipTaken}><CircleDot size={14} aria-hidden />Sampai {clockLabel(wibTime(busy.endsAt))}</span>
      </li>)}</ul>
    </section>}

    <section aria-labelledby="mine-title" className={css.section}>
      <div className={css.head}><h2 id="mine-title">Booking saya berikutnya</h2>
        {mine.length > upcoming.length && <Link href={bookingPath.mine} className={css.btnQuiet}><CalendarCheck size={18} aria-hidden />Lihat semua</Link>}</div>
      <BookingList bookings={upcoming} rooms={day.rooms} empty="Belum ada booking. Mulai dari Ruangan." />
    </section>
  </>;
}
