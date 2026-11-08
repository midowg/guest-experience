"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Notice } from "@/components/ui";
import { appraisalRules, clockLabel, dayLabel, isOutside, wibDate, wibTime, type Booking, type Room } from "@/lib/pra-wam/appraisal";
import { durationLabel, type DaySummary } from "@/lib/pra-wam/room-day";
import { praWamApi } from "@/lib/routes";
import { errorText, praWamRequest } from "./api";
import { bookingKey } from "./BookCalendar";
import tone from "./book-calendar.module.css";
import css from "./book-month.module.css";

/*
 * Book, Bulan (8 Nov 2026): the month at a glance from 1024px, Sunday to Saturday as the small
 * calendar beside it. Each day lists its bookings in time order (the hours, the title, the room
 * when all rooms show), three at most and "+N lagi" for the rest; a day's number opens that day.
 * The month's bookings are fetched when the view opens (the page only holds the week).
 */

const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const SHOWN = 3;
const ALL = "semua";

const utc = (date: string) => new Date(`${date}T12:00:00Z`);
const iso = (day: Date) => day.toISOString().slice(0, 10);
const shift = (date: string, days: number) => { const day = utc(date); day.setUTCDate(day.getUTCDate() + days); return iso(day); };
export const monthOf = (date: string) => date.slice(0, 7);
export const shiftMonth = (month: string, by: number) => { const day = utc(`${month}-01`); day.setUTCMonth(day.getUTCMonth() + by); return iso(day).slice(0, 7); };
const monthName = (month: string) => new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(utc(`${month}-01`));
const inPeriod = (date: string) => date >= appraisalRules.periodStart && date <= appraisalRules.periodEnd;

/** The whole weeks (Sunday to Saturday) that hold `month`: four to six rows of seven dates. */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const weeks: string[][] = [];
  // From the Sunday on or before the 1st, a row at a time while the row still starts in the month (or before it).
  for (let start = shift(first, -utc(first).getUTCDay()); monthOf(start) <= month; start = shift(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, index) => shift(start, index)));
  }
  return weeks;
}

type Props = {
  month: string; rooms: Room[]; viewerId: string; today: string; selected: string;
  /** Per weekday of the window: how much of the rooms is taken (windowSummary). */
  summary: Record<string, DaySummary>;
  /** Changes after a save or a cancel, so the month is fetched again. */
  version: number;
  onMonth: (month: string) => void;
  onPickDay: (date: string) => void;
  onOpen: (booking: Booking) => void;
  /** Where the bookings come from; the API by default (a layout preview passes sample ones). */
  load?: (from: string, to: string) => Promise<Booking[]>;
};

const fromApi = async (from: string, to: string) => (await praWamRequest<{ bookings: Booking[] }>(praWamApi.bookings(undefined, { from, to }))).data.bookings;

export function MonthView({ month, rooms, viewerId, today, selected, summary, version, onMonth, onPickDay, onOpen, load = fromApi }: Props) {
  const weeks = monthGrid(month);
  const from = weeks[0][0], to = weeks.at(-1)![6];
  const [room, setRoom] = useState(ALL);
  const [loaded, setLoaded] = useState<{ key: string; bookings: Booking[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = `${from}:${to}:${version}`;

  useEffect(() => {
    let live = true;
    load(from, to)
      .then(list => { if (live) { setLoaded({ key, bookings: list }); setError(null); } })
      .catch(problem => { if (live) setError(errorText(problem)); });
    return () => { live = false; };
  }, [from, to, key, load]);

  const ready = loaded?.key === key;
  const shown = (ready ? loaded.bookings : []).filter(booking => room === ALL || booking.roomId === room);
  const byDay = new Map<string, Booking[]>();
  for (const booking of shown) {
    const day = wibDate(booking.startsAt);
    byDay.set(day, [...(byDay.get(day) ?? []), booking]);
  }
  const roomName = (booking: Booking) => isOutside(booking) ? booking.place || "Di luar kantor" : rooms.find(item => item.id === booking.roomId)?.name ?? "Ruang";
  const kindOf = (booking: Booking) => booking.isSession ? tone.session : booking.bookedBy.id === viewerId ? tone.mine : tone.busy;
  const total = shown.filter(booking => monthOf(wibDate(booking.startsAt)) === month).length;

  return <section className={css.card} aria-label={`Booking ruang, ${monthName(month)}`} aria-busy={!ready}>
    <div className={css.top}>
      <div className={css.nav}>
        <button type="button" className={tone.round} onClick={() => onMonth(shiftMonth(month, -1))} disabled={month <= monthOf(appraisalRules.periodStart)} aria-label="Bulan sebelumnya"><ChevronLeft aria-hidden /></button>
        <h3>{monthName(month)}</h3>
        <button type="button" className={tone.round} onClick={() => onMonth(shiftMonth(month, 1))} disabled={month >= monthOf(appraisalRules.periodEnd)} aria-label="Bulan berikutnya"><ChevronRight aria-hidden /></button>
        <span className={css.count} aria-live="polite">{ready ? `${total} booking` : "Memuat…"}</span>
      </div>
      <div className={`${tone.segmented} ${tone.roomPick}`} role="group" aria-label="Pilih ruang">
        <button type="button" aria-pressed={room === ALL} onClick={() => setRoom(ALL)}>Semua ruang</button>
        {rooms.map(item => <button key={item.id} type="button" aria-pressed={room === item.id} onClick={() => setRoom(item.id)}>{item.name}</button>)}
      </div>
    </div>
    {error && <div className={css.error}><Notice tone="error">{error}</Notice></div>}

    <div className={css.weekdays} aria-hidden>{WEEKDAYS.map((name, index) => <span key={name} data-weekend={index === 0 || index === 6 || undefined}>{name}</span>)}</div>
    <div className={css.grid}>
      {weeks.flat().map((date, index) => {
        const weekend = index % 7 === 0 || index % 7 === 6;
        const other = monthOf(date) !== month;
        const open = inPeriod(date);
        const list = (byDay.get(date) ?? []).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        const day = summary[date];
        // Under "Semua ruang", how much of the day is still free; for one room, its bookings speak for themselves.
        const left = room === ALL && open && !weekend && date >= today && day && !other ? day.full ? "Penuh" : day.bookings === 0 ? "Kosong" : null : null;
        return <div key={date} className={css.day} data-weekend={weekend || undefined} data-other={other || undefined} data-off={!open || undefined}
          data-today={date === today || undefined} data-selected={date === selected || undefined}>
          <div className={css.dayHead}>
            <button type="button" className={css.number} onClick={() => onPickDay(date)} disabled={!open}
              aria-label={`Buka ${dayLabel(date)}${date === today ? ", hari ini" : ""}${list.length ? `, ${list.length} booking` : ""}`}>{Number(date.slice(8))}</button>
            {left && <span className={`${css.left} ${day?.full ? css.leftFull : ""}`}>{left}</span>}
          </div>
          {!ready && !error && open && !weekend && !other ? <span className={css.skeleton} aria-hidden /> : <ul className={css.list}>
            {list.slice(0, SHOWN).map(booking => <li key={bookingKey(booking)}>
              <button type="button" className={`${css.chip} ${kindOf(booking)}`} onClick={() => onOpen(booking)} aria-haspopup="dialog"
                title={`${booking.title} · ${clockLabel(wibTime(booking.startsAt))}–${clockLabel(wibTime(booking.endsAt))} · ${roomName(booking)}`}>
                <small className={css.chipTime}>{clockLabel(wibTime(booking.startsAt))}{room === ALL ? ` · ${roomName(booking)}` : `–${clockLabel(wibTime(booking.endsAt))}`}</small>
                <strong>{booking.title}</strong>
              </button>
            </li>)}
            {list.length > SHOWN && <li><button type="button" className={css.more} onClick={() => onPickDay(date)}>+{list.length - SHOWN} lagi</button></li>}
          </ul>}
        </div>;
      })}
    </div>
    <p className={css.foot}>Ketuk tanggal untuk membuka harinya. {room !== ALL && ready ? `${rooms.find(item => item.id === room)?.name}: ${durationLabel(Math.round(shown.filter(booking => monthOf(wibDate(booking.startsAt)) === month).reduce((sum, booking) => sum + (Date.parse(booking.endsAt) - Date.parse(booking.startsAt)) / 60_000, 0)))} terpakai bulan ini.` : ""}</p>
  </section>;
}
