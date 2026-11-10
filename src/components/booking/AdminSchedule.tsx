"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { endOf, nextStart, type OfficeBooking } from "@/lib/booking/rules";
import { dayLabel, wibTime, type Person, type Room } from "@/lib/pra-wam/appraisal";
import { bookingPath } from "@/lib/routes";
import { BookDialog, type BookDraft } from "./BookDialog";
import { RoomGrid } from "./RoomGrid";
import css from "./booking.module.css";

const shift = (date: string, days: number) => {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
};

/**
 * Kelola → jadwal: every room's day, any day, for the administration staff. An empty half hour
 * books for someone ("Atas nama"); `editing` opens a booking to change for its booker.
 */
export function AdminSchedule({ date, today, dates, rooms, bookings, people, meId, now: serverNow, editing }: {
  date: string; today: string; dates: string[]; rooms: Room[]; bookings: OfficeBooking[]; people: Person[]; meId: string; now: string;
  editing?: OfficeBooking;
}) {
  const router = useRouter();
  const [now, setNow] = useState(serverNow);
  useEffect(() => { const timer = setInterval(() => setNow(new Date().toISOString()), 60_000); return () => clearInterval(timer); }, []);
  const [saved, setSaved] = useState<string | null>(null);
  // The admin books for anyone, so no room is closed to them here; the server checks the booker's departments.
  const everyone = [...new Set(rooms.flatMap(room => room.departments ?? []))];
  const draft = (roomId: string, start: string): BookDraft => ({ roomId, date, start, end: endOf(start, 60), title: "", description: "", participants: [], audience: "internal", externalNote: "" });
  const [form, setForm] = useState<{ draft: BookDraft; editId?: string; bookerName?: string } | null>(() => editing ? {
    editId: editing.id, bookerName: editing.mine ? undefined : editing.bookedBy.fullName ?? editing.bookedBy.name,
    draft: { roomId: editing.roomId, date, start: wibTime(editing.startsAt), end: wibTime(editing.endsAt), title: editing.title, description: editing.description, participants: (editing.participants ?? []).map(person => person.id), audience: editing.audience, externalNote: editing.externalNote },
  } : null);
  const first = nextStart(date, new Date(now));

  return <section className={css.section} aria-labelledby="admin-grid">
    <div className={css.head}>
      <h2 id="admin-grid">Jadwal</h2>
      <button type="button" className={css.btn} disabled={!first} onClick={() => first && setForm({ draft: draft("", first) })}><CalendarPlus size={18} aria-hidden />Booking atas nama</button>
    </div>
    <div className={css.dateBar}>
      <Link href={bookingPath.manage(shift(date, -1))} className={css.iconBtn} aria-label="Hari sebelumnya"><ChevronLeft size={20} aria-hidden /></Link>
      <span className={css.dateName}>{date === today && <span className={css.dateToday}>Hari ini · </span>}{dayLabel(date)}</span>
      <Link href={bookingPath.manage(shift(date, 1))} className={css.iconBtn} aria-label="Hari berikutnya"><ChevronRight size={20} aria-hidden /></Link>
      <input type="date" className={css.dateInput} aria-label="Pilih tanggal" value={date} onChange={event => event.target.value && router.push(bookingPath.manage(event.target.value))} />
      {date !== today && <Link href={bookingPath.manage()} className={css.btnQuiet}>Hari ini</Link>}
    </div>
    {saved && <p className={css.noteOk} role="status"><CheckCircle2 size={18} aria-hidden />{saved}</p>}
    {rooms.length ? <RoomGrid date={date} rooms={rooms} bookings={bookings} now={now} departments={everyone} selected={null} onPick={(roomId, start) => setForm({ draft: draft(roomId, start) })} />
      : <p className={css.note}>Belum ada ruangan yang bisa dibooking. Tambahkan di tab Ruangan.</p>}
    {form && <BookDialog key={`${form.editId ?? "baru"}-${form.draft.roomId}-${form.draft.start}`} initial={form.draft} editId={form.editId} whereKnown={!!form.draft.roomId}
      bookFor bookerName={form.bookerName} rooms={rooms} dates={dates.includes(date) ? dates : [date, ...dates]} people={people} meId={meId} departments={everyone} now={now}
      onClose={() => { setForm(null); if (editing) router.replace(bookingPath.manage(date)); }}
      onSaved={(message, savedDate) => { setForm(null); setSaved(message); router.replace(bookingPath.manage(savedDate)); router.refresh(); }} />}
  </section>;
}
