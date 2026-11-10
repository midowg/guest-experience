"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, CircleDot, DoorOpen, Lock, Users } from "lucide-react";
import { officeDateOr, roomNow, type OfficeBooking } from "@/lib/booking/rules";
import { clockLabel, dayLabel, draftHours, roomDay, roomKeptFrom, wibTime, type Person, type Room } from "@/lib/pra-wam/appraisal";
import { bookingPath } from "@/lib/routes";
import { BookDialog, type BookDraft } from "./BookDialog";
import { facilityIcon } from "./icons";
import css from "./booking.module.css";

const HOURS = ["07", "10", "13", "16", "19", "22"];

/**
 * Ruangan: every bookable room on one day, as cards. Each card says in a word whether the room is
 * free (with a colour too), draws its day from 07.00 to 22.00, lists who has it, and books it.
 */
export function RoomBoard({ date, today, dates, prev, next, rooms, bookings, people, meId, departments, now: serverNow, openRoom, editing }: {
  date: string; today: string; dates: string[]; prev: string | null; next: string | null;
  rooms: Room[]; bookings: OfficeBooking[]; people: Person[]; meId: string; departments: string[]; now: string;
  /** Open the form at once: "1" for any room, or a room's id. */
  openRoom?: string; editing?: OfficeBooking;
}) {
  const router = useRouter();
  const [now, setNow] = useState(serverNow);
  useEffect(() => { const timer = setInterval(() => setNow(new Date().toISOString()), 60_000); return () => clearInterval(timer); }, []);
  const [saved, setSaved] = useState<string | null>(null);
  const blank = (roomId: string): BookDraft => ({ roomId, date, ...draftHours(date, new Date(now)), title: "", description: "", participants: [], audience: "internal", externalNote: "" });
  const [form, setForm] = useState<{ draft: BookDraft; editId?: string } | null>(() => {
    if (editing) return { editId: editing.id, draft: { roomId: editing.roomId, date, start: wibTime(editing.startsAt), end: wibTime(editing.endsAt), title: editing.title, description: editing.description, participants: (editing.participants ?? []).map(person => person.id), audience: editing.audience, externalNote: editing.externalNote } };
    if (openRoom) return { draft: blank(rooms.some(room => room.id === openRoom) ? openRoom : "") };
    return null;
  });
  const closed = new Date(now) >= new Date(`${date}T22:00:00+07:00`);
  const go = (to: string) => router.push(bookingPath.rooms({ date: to }));

  return <>
    <div className={css.head}>
      <div><h1>Ruangan</h1><p className={css.lead}>Pilih ruangan yang kosong, lalu tekan Booking.</p></div>
      <button type="button" className={css.btn} disabled={closed} onClick={() => setForm({ draft: blank("") })}><CalendarPlus size={20} aria-hidden />Booking ruangan</button>
    </div>

    <div className={css.dateBar}>
      <Link href={prev ? bookingPath.rooms({ date: prev }) : "#"} className={css.iconBtn} aria-label="Hari sebelumnya" aria-disabled={!prev}><ChevronLeft size={20} aria-hidden /></Link>
      <span className={css.dateName} aria-live="polite">{date === today && <span className={css.dateToday}>Hari ini · </span>}{dayLabel(date)}</span>
      <Link href={next ? bookingPath.rooms({ date: next }) : "#"} className={css.iconBtn} aria-label="Hari berikutnya" aria-disabled={!next}><ChevronRight size={20} aria-hidden /></Link>
      <input type="date" className={css.dateInput} aria-label="Pilih tanggal" value={date} min={dates[0]} max={dates.at(-1)} onChange={event => event.target.value && go(officeDateOr(event.target.value, today))} />
      {date !== today && dates.includes(today) && <Link href={bookingPath.rooms({ date: today })} className={css.btnQuiet}>Hari ini</Link>}
    </div>

    {saved && <p className={css.noteOk} role="status"><CheckCircle2 size={18} aria-hidden />{saved}</p>}

    <p className={css.legend} aria-hidden>
      <span><i className={css.swFree} />Kosong</span>
      <span><i className={css.swBusy} />Dipakai</span>
      <span><i className={css.swMine} />Booking saya</span>
      <span><i className={css.swPast} />Sudah lewat</span>
    </p>

    {!rooms.length && <p className={css.note}>Belum ada ruangan yang bisa dibooking. Bagian administrasi menambahkannya di Admin WAM → Ruang dan denah.</p>}
    <ul className={css.rooms}>{rooms.map(room => {
      const uses = bookings.filter(item => item.roomId === room.id);
      const segments = roomDay(date, uses, new Date(now));
      const state = date === today ? roomNow(uses, new Date(now)) : null;
      const kept = roomKeptFrom(room, departments);
      return <li key={room.id} className={css.room}>
        <div className={css.roomHead}>
          <span className={css.roomIcon}><DoorOpen size={24} aria-hidden /></span>
          <div className={css.roomTitle}>
            <h2>{room.name}</h2>
            <ul className={css.facts}>
              {room.capacity != null && <li><Users size={16} aria-hidden />{room.minPeople && room.minPeople > 1 ? `${room.minPeople}–${room.capacity}` : room.capacity} orang</li>}
              {room.facilities.map(name => <li key={name}>{facilityIcon(name)}{name}</li>)}
            </ul>
          </div>
        </div>

        {state
          ? state.busy
            ? <span className={css.chipBusy}><CircleDot size={14} aria-hidden />Dipakai sampai {clockLabel(wibTime(state.busy.endsAt))}</span>
            : <span className={css.chipFree}><CheckCircle2 size={14} aria-hidden />{state.next ? `Kosong sampai ${clockLabel(wibTime(state.next.startsAt))}` : "Kosong"}</span>
          : <span className={uses.length ? css.chip : css.chipFree}>{uses.length ? `${uses.length} booking` : "Kosong seharian"}</span>}

        <div>
          <div className={css.bar} role="img" aria-label={uses.length ? `Terpakai: ${uses.map(item => `${clockLabel(wibTime(item.startsAt))} sampai ${clockLabel(wibTime(item.endsAt))}`).join(", ")}` : "Kosong seharian"}>
            {segments.map(segment => <span key={segment.from} style={{ flexGrow: segment.to - segment.from, flexBasis: 0 }}
              className={segment.kind === "busy" ? (segment.booking.mine ? css.segMine : css.segBusy) : segment.kind === "past" ? css.segPast : css.segFree} />)}
          </div>
          <div className={css.hours} aria-hidden>{HOURS.map(hour => <span key={hour}>{hour}</span>)}</div>
        </div>

        {uses.length
          ? <ul className={css.uses}>{uses.map(item => <li key={item.id} className={item.mine ? css.useMine : css.use}>
            <span className={css.useTime}>{clockLabel(wibTime(item.startsAt))}–{clockLabel(wibTime(item.endsAt))}</span>
            <span>{item.title}<br /><span className={css.useWho}>{item.mine ? "Booking saya" : item.bookedBy.name}{item.audience === "eksternal" ? " · Eksternal" : ""}</span></span>
          </li>)}</ul>
          : <p className={css.empty}>Belum ada booking.</p>}

        <div className={css.roomFoot}>
          {kept ? <span className={css.chipWarn}><Lock size={14} aria-hidden />{kept}</span> : <span />}
          <button type="button" className={css.btn} disabled={!!kept || closed} onClick={() => setForm({ draft: blank(room.id) })}><CalendarPlus size={18} aria-hidden />Booking</button>
        </div>
      </li>;
    })}</ul>

    {form && <BookDialog key={`${form.editId ?? "baru"}-${form.draft.roomId}`} initial={form.draft} editId={form.editId} rooms={rooms} dates={dates.includes(form.draft.date) ? dates : [form.draft.date, ...dates]}
      people={people} meId={meId} departments={departments} now={now}
      onClose={() => { setForm(null); if (editing || openRoom) router.replace(bookingPath.rooms({ date })); }}
      onSaved={(message, savedDate) => { setForm(null); setSaved(message); router.replace(bookingPath.rooms({ date: savedDate })); router.refresh(); }} />}
  </>;
}
