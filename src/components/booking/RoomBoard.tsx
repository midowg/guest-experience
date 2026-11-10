"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, Clock, DoorOpen, Lock, Minus, Plus, Users, XCircle } from "lucide-react";
import { availability, DURATIONS, endOf, nextStart, officeDateOr, type Availability, type OfficeBooking, type RoomSearch } from "@/lib/booking/rules";
import { clockLabel, dayLabel, durationLabel, slotTimes, wibTime, type Person, type Room } from "@/lib/pra-wam/appraisal";
import { largestCapacity } from "@/lib/pra-wam/room-fit";
import { bookingPath } from "@/lib/routes";
import { BookDialog, type BookDraft } from "./BookDialog";
import { RoomGrid } from "./RoomGrid";
import { facilityIcon } from "./icons";
import css from "./booking.module.css";

/**
 * Ruangan, time first (11 Nov 2026), as the booking apps people know work (Google Calendar,
 * Outlook's Room Finder, Robin): the person sets when, how long and how many, every room answers
 * "free until …" or why not, free rooms first, and one tap books it. Below, every room's day on one
 * grid (Skedda, Eptura): tap an empty half hour to book from there.
 */
export function RoomBoard({ date, today, dates, prev, next, rooms, bookings, people, meId, departments, now: serverNow, openRoom, editing, askedStart, askedMinutes }: {
  date: string; today: string; dates: string[]; prev: string | null; next: string | null;
  rooms: Room[]; bookings: OfficeBooking[]; people: Person[]; meId: string; departments: string[]; now: string;
  /** Open the form at once: "1" for any room, or a room's id. */
  openRoom?: string; editing?: OfficeBooking;
  /** From the address (Beranda's "Pakai sekarang", a reload): the start and length to search for. */
  askedStart?: string; askedMinutes?: number;
}) {
  const router = useRouter();
  const [now, setNow] = useState(serverNow);
  useEffect(() => { const timer = setInterval(() => setNow(new Date().toISOString()), 60_000); return () => clearInterval(timer); }, []);
  const [saved, setSaved] = useState<string | null>(null);

  const starts = useMemo(() => slotTimes().slice(0, -1).filter(time => new Date(`${date}T${time}:00+07:00`) > new Date(now)), [date, now]);
  const firstStart = nextStart(date, new Date(serverNow));
  const [search, setSearch] = useState<RoomSearch>(() => ({
    date, people: null,
    start: askedStart && starts.includes(askedStart) ? askedStart : firstStart ?? "07:00",
    minutes: askedMinutes && DURATIONS.includes(askedMinutes as (typeof DURATIONS)[number]) ? askedMinutes : 60,
  }));
  const start = starts.includes(search.start) ? search.start : starts[0] ?? search.start;
  const ask = { ...search, date, start };
  const closed = !starts.length;

  const largest = largestCapacity(rooms);
  const answers = rooms.map(room => ({
    room,
    answer: availability(room, bookings.filter(item => item.roomId === room.id), ask, { now: new Date(now), largest, departments }) as Availability,
  })).sort((a, b) => Number(b.answer.ok) - Number(a.answer.ok));
  const freeCount = answers.filter(item => item.answer.ok).length;

  const draft = (roomId: string, from = start, minutes = search.minutes): BookDraft =>
    ({ roomId, date, start: from, end: endOf(from, minutes), title: "", description: "", participants: [], audience: "internal", externalNote: "" });
  const [form, setForm] = useState<{ draft: BookDraft; editId?: string; whereKnown: boolean } | null>(() => {
    if (editing) return { editId: editing.id, whereKnown: true, draft: { roomId: editing.roomId, date, start: wibTime(editing.startsAt), end: wibTime(editing.endsAt), title: editing.title, description: editing.description, participants: (editing.participants ?? []).map(person => person.id), audience: editing.audience, externalNote: editing.externalNote } };
    if (openRoom) { const known = rooms.some(room => room.id === openRoom); return { whereKnown: known, draft: draft(known ? openRoom : "") }; }
    return null;
  });
  const go = (to: string) => router.push(bookingPath.rooms({ date: to, start: search.start, menit: String(search.minutes) }));
  const setPeople = (value: number | null) => setSearch(current => ({ ...current, people: value == null ? null : Math.max(1, Math.min(value, 200)) }));

  return <>
    <div className={css.head}>
      <div><h1>Ruangan</h1><p className={css.lead}>Atur waktunya, lalu pilih ruangan yang tersedia.</p></div>
    </div>

    <section className={css.finder} aria-label="Cari waktu">
      <div className={css.finderDay}>
        <Link href={prev ? bookingPath.rooms({ date: prev }) : "#"} className={css.iconBtn} aria-label="Hari sebelumnya" aria-disabled={!prev}><ChevronLeft size={20} aria-hidden /></Link>
        <span className={css.dateName} aria-live="polite">{date === today && <span className={css.dateToday}>Hari ini · </span>}{dayLabel(date)}</span>
        <Link href={next ? bookingPath.rooms({ date: next }) : "#"} className={css.iconBtn} aria-label="Hari berikutnya" aria-disabled={!next}><ChevronRight size={20} aria-hidden /></Link>
        <input type="date" className={css.dateInput} aria-label="Pilih tanggal" value={date} min={dates[0]} max={dates.at(-1)} onChange={event => event.target.value && go(officeDateOr(event.target.value, today))} />
      </div>

      <div className={css.finderRow}>
        <div className={css.field}>
          <label className={css.label} htmlFor="find-start"><Clock size={18} aria-hidden />Mulai</label>
          <select id="find-start" className={css.control} value={start} disabled={closed} onChange={event => setSearch(current => ({ ...current, start: event.target.value }))}>
            {closed ? <option>Hari ini sudah tutup</option> : starts.map(time => <option key={time} value={time}>{clockLabel(time)}</option>)}
          </select>
        </div>

        <div className={css.field}>
          <span className={css.label} id="find-length">Berapa lama</span>
          <div className={css.segments} role="group" aria-labelledby="find-length">
            {DURATIONS.map(minutes => <button key={minutes} type="button" className={css.segment} aria-pressed={search.minutes === minutes}
              onClick={() => setSearch(current => ({ ...current, minutes }))}>{durationLabel(minutes)}</button>)}
          </div>
        </div>

        <div className={css.field}>
          <span className={css.label} id="find-people"><Users size={18} aria-hidden />Berapa orang</span>
          <div className={css.stepper} role="group" aria-labelledby="find-people">
            <button type="button" className={css.iconBtn} aria-label="Kurangi orang" disabled={search.people == null} onClick={() => setPeople(search.people != null && search.people > 1 ? search.people - 1 : null)}><Minus size={18} aria-hidden /></button>
            <span className={css.stepperValue} aria-live="polite">{search.people ?? "Semua"}</span>
            <button type="button" className={css.iconBtn} aria-label="Tambah orang" onClick={() => setPeople((search.people ?? 1) + 1)}><Plus size={18} aria-hidden /></button>
          </div>
        </div>
      </div>
    </section>

    {saved && <p className={css.noteOk} role="status"><CheckCircle2 size={18} aria-hidden />{saved}</p>}

    <section className={css.section} aria-labelledby="find-result">
      <h2 id="find-result">{closed ? "Hari ini sudah tutup" : <>{freeCount ? `${freeCount} ruangan tersedia` : "Tidak ada ruangan tersedia"} · {clockLabel(start)}–{clockLabel(endOf(start, search.minutes))}</>}</h2>
      {!rooms.length && <p className={css.note}>Belum ada ruangan yang bisa dibooking. Bagian administrasi menambahkannya di Admin WAM → Ruang dan denah.</p>}
      <ul className={css.rooms}>{answers.map(({ room, answer }) =>
        <li key={room.id} className={answer.ok ? css.room : css.roomOff}>
          <div className={css.roomHead}>
            <span className={css.roomIcon}><DoorOpen size={24} aria-hidden /></span>
            <div className={css.roomTitle}>
              <h3>{room.name}</h3>
              <ul className={css.facts}>
                {room.capacity != null && <li><Users size={16} aria-hidden />Muat {room.capacity} orang</li>}
                {room.facilities.map(name => <li key={name}>{facilityIcon(name)}{name}</li>)}
              </ul>
            </div>
          </div>
          <div className={css.roomFoot}>
            {answer.ok
              ? <span className={css.chipFree}><CheckCircle2 size={14} aria-hidden />Tersedia sampai {clockLabel(answer.until)}</span>
              : <span className={answer.why === "khusus" ? css.chipWarn : css.chipTaken}>{answer.why === "khusus" ? <Lock size={14} aria-hidden /> : <XCircle size={14} aria-hidden />}{answer.text}</span>}
            {answer.ok && <button type="button" className={css.btn} onClick={() => setForm({ whereKnown: true, draft: draft(room.id) })}><CalendarPlus size={18} aria-hidden />Booking</button>}
          </div>
        </li>)}</ul>
    </section>

    {rooms.length > 0 && <RoomGrid date={date} rooms={rooms} bookings={bookings} now={now} departments={departments} selected={closed ? null : { start, minutes: search.minutes }}
      onPick={(roomId, from) => { setSearch(current => ({ ...current, start: from })); setForm({ whereKnown: true, draft: draft(roomId, from, 60) }); }} />}

    {form && <BookDialog key={`${form.editId ?? "baru"}-${form.draft.roomId}-${form.draft.start}`} initial={form.draft} editId={form.editId} whereKnown={form.whereKnown}
      rooms={rooms} dates={dates.includes(form.draft.date) ? dates : [form.draft.date, ...dates]}
      people={people} meId={meId} departments={departments} now={now}
      onClose={() => { setForm(null); if (editing || openRoom) router.replace(bookingPath.rooms({ date })); }}
      onSaved={(message, savedDate) => { setForm(null); setSaved(message); router.replace(bookingPath.rooms({ date: savedDate })); router.refresh(); }} />}
  </>;
}
