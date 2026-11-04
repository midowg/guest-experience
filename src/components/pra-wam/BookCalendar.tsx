"use client";

import { Fragment, useState, type CSSProperties, type PointerEvent, type MouseEvent } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { appraisalRules, clockAt, clockLabel, dayLabel, dayMinutes, hoursInGap, nowOffset, roomDay, startInGap, weekSummary, wibTime, type Booking, type DaySegment, type Room } from "@/lib/pra-wam/appraisal";
import css from "./book-calendar.module.css";

/*
 * Book's calendar, simplified from "Werkudara Room Booking" (rooms by time). On a phone: a week
 * strip, then each room as a card listing its day in big rows (bookings, free time to tap, time
 * gone by) with a "Sekarang" line on today. From 1024px: the day as a timeline (rooms as columns,
 * 09.00–18.00 as rows) or the week overview (Mon–Fri × rooms). No grid of tiny half-hour cells.
 */

export type BookPick = { room: Room; start: string; end: string };
type Kind = "busy" | "mine" | "session";

const time = (offset: number) => clockLabel(clockAt(offset));
const spanOf = (from: number, to: number) => `${time(from)}–${time(to)}`;
const shortDay = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const dayNumber = (date: string) => Number(date.slice(8, 10));
const monthShort = (date: string) => new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
/** "2–6 Nov", or "26 Okt–30 Okt" across months. */
export const weekLabel = (week: string[]) => {
  const first = week[0], last = week.at(-1) ?? first;
  return monthShort(first) === monthShort(last) ? `${dayNumber(first)}–${dayNumber(last)} ${monthShort(last)}` : `${dayNumber(first)} ${monthShort(first)}–${dayNumber(last)} ${monthShort(last)}`;
};
const hours = (minutes: number) => minutes % 60 === 0 ? `${minutes / 60} jam` : `${(minutes / 60).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jam`;
/** Minutes on the desktop timeline → a CSS length, in multiples of --hour. */
const at = (minutes: number) => `calc(${minutes / 60} * var(--hour))`;

function kindOf(booking: Booking, viewerId: string): Kind {
  if (booking.isSession) return "session";
  return booking.bookedBy.id === viewerId ? "mine" : "busy";
}
const whoOf = (booking: Booking, viewerId: string) => booking.isSession ? "Sesi Pra WAM" : booking.bookedBy.id === viewerId ? "Booking kamu"
  : `${booking.bookedBy.name}${booking.bookedBy.department ? ` · ${booking.bookedBy.department}` : ""}`;
export const bookingKey = (booking: Booking) => `${booking.id}@${booking.roomId}@${booking.startsAt}`;

/** The colour key, in the words used on the blocks. */
export function Legend() {
  return <ul className={css.legend} aria-label="Keterangan warna">
    <li><i className={`${css.swatch} ${css.free}`} aria-hidden />Kosong</li>
    <li><i className={`${css.swatch} ${css.busy}`} aria-hidden />Terpakai</li>
    <li><i className={`${css.swatch} ${css.mine}`} aria-hidden />Booking kamu</li>
    <li><i className={`${css.swatch} ${css.session}`} aria-hidden />Sesi Pra WAM</li>
  </ul>;
}

/** Monday to Friday as five equal buttons (no sideways scrolling), with the week's arrows above. */
export function WeekStrip({ week, selected, today, counts, onPick, prevHref, nextHref }: {
  week: string[]; selected: string; today: string; counts: Record<string, number>; onPick: (date: string) => void; prevHref?: string; nextHref?: string;
}) {
  const inPeriod = (date: string) => date >= appraisalRules.periodStart && date <= appraisalRules.periodEnd;
  return <div className={css.strip}>
    <div className={css.stripHead}>
      <p>{weekLabel(week)} {week[0].slice(0, 4)}</p>
      <div className={css.stripNav}>
        {prevHref ? <Link className={css.arrow} href={prevHref} scroll={false} aria-label="Minggu sebelumnya"><ChevronLeft aria-hidden /></Link>
          : <span className={css.arrow} aria-hidden data-off><ChevronLeft /></span>}
        {nextHref ? <Link className={css.arrow} href={nextHref} scroll={false} aria-label="Minggu berikutnya"><ChevronRight aria-hidden /></Link>
          : <span className={css.arrow} aria-hidden data-off><ChevronRight /></span>}
      </div>
    </div>
    <div className={css.days} role="group" aria-label="Pilih hari">
      {week.map(date => {
        const count = counts[date] ?? 0;
        const off = !inPeriod(date);
        return <button key={date} type="button" className={css.day} aria-pressed={date === selected} disabled={off} onClick={() => onPick(date)}
          aria-label={`${dayLabel(date)}${date === today ? ", hari ini" : ""}${off ? ", di luar periode" : `, ${count ? `${count} terpakai` : "semua kosong"}`}`}>
          <span className={css.dayName}>{date === today ? "Hari ini" : shortDay(date)}</span>
          <strong>{dayNumber(date)}</strong>
          <span className={css.dayCount} aria-hidden>{off ? "–" : count ? `${count} terpakai` : "Kosong"}</span>
        </button>;
      })}
    </div>
  </div>;
}

type DayProps = {
  date: string; rooms: Room[]; bookings: Booking[]; now: Date; viewerId: string;
  /** Booking is allowed (open, and the form's data is there). */
  canBook: boolean;
  onOpen: (booking: Booking) => void;
  onBook: (pick: BookPick) => void;
  /** Desktop: hidden from 1024px when the week overview shows instead. */
  phoneOnly?: boolean;
};

/** One day: room cards on a phone, the room-by-hour timeline from 1024px. */
export function DayCalendar({ date, rooms, bookings, now, viewerId, canBook, onOpen, onBook, phoneOnly }: DayProps) {
  const days = rooms.map(room => ({ room, segments: roomDay(date, bookings.filter(booking => booking.roomId === room.id), now) }));
  const line = nowOffset(date, now);
  const label = (offset: number) => `Sekarang ${time(offset)}`;
  const book = (room: Room, gap: { from: number; to: number }, start: number) =>
    onBook({ room, ...hoursInGap(gap, start) });
  if (!rooms.length) return <p className={css.empty}>Belum ada ruang yang bisa dibooking. Admin WAM mengaturnya di Kelola acara.</p>;

  return <>
    <div className={css.phone}>
      {days.map(({ room, segments }) => {
        const taken = segments.filter(segment => segment.kind === "busy").length;
        // The line goes above the first stretch that is not over yet.
        const lineAt = line == null ? -1 : segments.findIndex(segment => segment.kind !== "past" && segment.to > line);
        return <section key={room.id} className={css.room} aria-label={`${room.name}, ${dayLabel(date)}`}>
          <header className={css.roomHead}>
            <h3>{room.name}</h3>
            <span>{room.capacity ? `${room.capacity} orang · ` : ""}{taken ? `${taken} terpakai` : "Kosong seharian"}</span>
          </header>
          <MiniBar segments={segments} viewerId={viewerId} line={line} />
          <ol className={css.rows}>
            {segments.map((segment, index) => <Fragment key={segment.kind === "busy" ? bookingKey(segment.booking) : `${segment.kind}-${segment.from}`}>
              {index === lineAt && line != null && <li className={css.nowRow}><span>{label(line)}</span></li>}
              <li><PhoneRow segment={segment} room={room} viewerId={viewerId} line={line} canBook={canBook} onOpen={onOpen} onBook={book} /></li>
            </Fragment>)}
            {lineAt === -1 && line != null && <li className={css.nowRow}><span>{label(line)}</span></li>}
          </ol>
        </section>;
      })}
    </div>

    <div className={`${css.desk} ${phoneOnly ? css.hiddenDesk : ""}`} style={{ "--rooms": rooms.length } as CSSProperties}>
      <div className={css.deskHead}>
        <span />
        {days.map(({ room, segments }) => <div key={room.id} className={css.deskRoom}>
          <strong title={room.name}>{room.name}</strong>
          <span>{room.capacity ? `${room.capacity} orang · ` : ""}{segments.filter(segment => segment.kind === "busy").length || "Belum ada"} booking</span>
        </div>)}
      </div>
      <div className={css.deskBody} role="group" aria-label={`Jadwal ruang ${dayLabel(date)}, ${clockLabel(appraisalRules.open)}–${clockLabel(appraisalRules.close)}`}>
        <div className={css.axis} aria-hidden>
          {Array.from({ length: dayMinutes / 60 + 1 }, (_, hour) => <span key={hour} style={{ top: at(hour * 60) }}>{time(hour * 60)}</span>)}
        </div>
        {days.map(({ room, segments }) => <div key={room.id} className={css.column} role="group" aria-label={room.name}>
          {segments.map(segment => segment.kind === "busy"
            ? <DeskBlock key={bookingKey(segment.booking)} segment={segment} viewerId={viewerId} line={line} onOpen={onOpen} />
            : segment.kind === "free" && canBook
              ? <FreeSlot key={`free-${segment.from}`} gap={segment} room={room} onBook={book} />
              : <div key={`${segment.kind}-${segment.from}`} className={segment.kind === "past" ? css.past : css.freeIdle} style={{ top: at(segment.from), height: at(segment.to - segment.from) }} aria-hidden />)}
        </div>)}
        {line != null && <div className={css.nowLine} style={{ top: at(line) }} role="img" aria-label={label(line)}><span>{time(line)}</span></div>}
      </div>
    </div>
  </>;
}

/** The day at a glance above a room's rows: where it is taken, and now. */
function MiniBar({ segments, viewerId, line }: { segments: DaySegment<Booking>[]; viewerId: string; line: number | null }) {
  const pos = (from: number, to: number) => ({ left: `${(from / dayMinutes) * 100}%`, width: `${((to - from) / dayMinutes) * 100}%` });
  return <div className={css.mini} aria-hidden>
    {segments.map(segment => segment.kind === "busy"
      ? <i key={bookingKey(segment.booking)} className={css[kindOf(segment.booking, viewerId)]} style={pos(segment.from, segment.to)} />
      : segment.kind === "past" ? <i key={`p-${segment.from}`} className={css.miniPast} style={pos(segment.from, segment.to)} /> : null)}
    {line != null && <b style={{ left: `${(line / dayMinutes) * 100}%` }} />}
  </div>;
}

function PhoneRow({ segment, room, viewerId, line, canBook, onOpen, onBook }: {
  segment: DaySegment<Booking>; room: Room; viewerId: string; line: number | null; canBook: boolean;
  onOpen: (booking: Booking) => void; onBook: (room: Room, gap: { from: number; to: number }, start: number) => void;
}) {
  const when = <span className={css.when}><b>{time(segment.from)}</b>{time(segment.to)}</span>;
  if (segment.kind === "past") return <div className={css.rowPast}>{when}<span>Sudah lewat</span></div>;
  if (segment.kind === "free") return canBook
    ? <button type="button" className={`${css.row} ${css.rowFree}`} onClick={() => onBook(room, segment, segment.from)} aria-label={`Book ${room.name}, kosong ${spanOf(segment.from, segment.to)}`}>
      {when}<span className={css.what}><strong>Kosong</strong><small>Ketuk untuk book</small></span><Plus className={css.rowIcon} aria-hidden />
    </button>
    : <div className={`${css.row} ${css.rowFreeIdle}`}>{when}<span className={css.what}><strong>Kosong</strong></span></div>;
  const { booking } = segment;
  const kind = kindOf(booking, viewerId);
  const running = line != null && segment.from <= line && line < segment.to;
  return <button type="button" className={`${css.row} ${css[kind]}`} onClick={() => onOpen(booking)} aria-haspopup="dialog">
    <span className={css.when}><b>{clockLabel(wibTime(booking.startsAt))}</b>{clockLabel(wibTime(booking.endsAt))}</span>
    <span className={css.what}>
      <strong>{booking.title}</strong>
      <small>{whoOf(booking, viewerId)}{running ? " · berlangsung" : ""}</small>
    </span>
    <ChevronRight className={css.rowIcon} aria-hidden />
  </button>;
}

function DeskBlock({ segment, viewerId, line, onOpen }: { segment: Extract<DaySegment<Booking>, { kind: "busy" }>; viewerId: string; line: number | null; onOpen: (booking: Booking) => void }) {
  const { booking } = segment;
  const kind = kindOf(booking, viewerId);
  const running = line != null && segment.from <= line && line < segment.to;
  const span = `${clockLabel(wibTime(booking.startsAt))}–${clockLabel(wibTime(booking.endsAt))}`;
  return <button type="button" className={`${css.block} ${css[kind]}`} style={{ top: at(segment.from), height: at(segment.to - segment.from) }}
    onClick={() => onOpen(booking)} aria-haspopup="dialog" title={`${booking.title} · ${span} · ${whoOf(booking, viewerId)}`}
    aria-label={`${booking.title}, ${span}, ${whoOf(booking, viewerId)}${running ? ", sedang berlangsung" : ""}`}>
    <strong>{booking.title}</strong>
    <small>{span} · {whoOf(booking, viewerId)}</small>
  </button>;
}

/**
 * Free time on the desktop timeline: the half hour under the pointer shows "+ 10.30" and a click
 * books from there; from the keyboard it books from the start of the free time.
 */
function FreeSlot({ gap, room, onBook }: { gap: { from: number; to: number }; room: Room; onBook: (room: Room, gap: { from: number; to: number }, start: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const startAt = (event: PointerEvent<HTMLButtonElement> | MouseEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return startInGap(gap, gap.from + ((event.clientY - box.top) / box.height) * (gap.to - gap.from));
  };
  const step = appraisalRules.stepMinutes;
  return <button type="button" className={css.freeSlot} style={{ top: at(gap.from), height: at(gap.to - gap.from) }}
    aria-label={`Book ${room.name}, kosong ${spanOf(gap.from, gap.to)}`}
    onPointerMove={event => setHover(startAt(event))} onPointerLeave={() => setHover(null)}
    onClick={event => onBook(room, gap, event.detail === 0 ? gap.from : startAt(event))}>
    {hover != null
      ? <span className={css.ghost} style={{ top: at(hover - gap.from), height: at(step) }} aria-hidden><Plus aria-hidden />{time(hover)}</span>
      : gap.to - gap.from >= 60 && <span className={css.freeHint} aria-hidden>Kosong</span>}
  </button>;
}

/**
 * The week overview from 1024px: rooms down, Monday to Friday across, each day's bookings as a bar
 * from 09.00 to 18.00 and their first lines. A day opens its timeline.
 */
export function WeekCalendar({ week, rooms, bookings, viewerId, today, selected, onPickDay }: {
  week: string[]; rooms: Room[]; bookings: Booking[]; viewerId: string; today: string; selected: string; onPickDay: (date: string) => void;
}) {
  const summary = weekSummary(week, rooms.map(room => room.id), bookings);
  const inPeriod = (date: string) => date >= appraisalRules.periodStart && date <= appraisalRules.periodEnd;
  const pos = (from: number, to: number) => ({ left: `${(from / dayMinutes) * 100}%`, width: `${((to - from) / dayMinutes) * 100}%` });
  return <table className={css.week}>
    <caption className={css.srOnly}>Ringkasan minggu {weekLabel(week)}: jumlah booking per ruang per hari</caption>
    <thead>
      <tr>
        <th scope="col" className={css.weekCorner}>Ruang</th>
        {summary.map(day => <th key={day.date} scope="col" data-today={day.date === today || undefined} data-selected={day.date === selected || undefined}>
          <button type="button" className={css.weekDay} disabled={!inPeriod(day.date)} onClick={() => onPickDay(day.date)} aria-label={`Buka ${dayLabel(day.date)}`}>
            <span>{day.date === today ? "Hari ini" : shortDay(day.date)}, {dayNumber(day.date)} {monthShort(day.date)}</span>
            <small>{!inPeriod(day.date) ? "Di luar periode" : day.count ? `${day.count} terpakai · ${hours(day.busyMinutes)}` : "Semua kosong"}</small>
          </button>
        </th>)}
      </tr>
    </thead>
    <tbody>
      {rooms.map(room => <tr key={room.id}>
        <th scope="row" className={css.weekRoom}><strong>{room.name}</strong>{room.capacity ? <small>{room.capacity} orang</small> : null}</th>
        {summary.map(day => {
          const blocks = day.rooms[room.id] ?? [];
          const busy = blocks.reduce((total, block) => total + block.to - block.from, 0);
          return <td key={day.date} data-today={day.date === today || undefined} data-past={day.date < today || undefined}>
            {inPeriod(day.date) ? <button type="button" className={css.weekCell} onClick={() => onPickDay(day.date)}
              aria-label={`${room.name}, ${dayLabel(day.date)}: ${blocks.length ? `${blocks.length} terpakai, ${hours(busy)}` : "kosong"}. Buka hari ini`}>
              <span className={css.weekBar} aria-hidden>{blocks.map(block => <i key={bookingKey(block.booking)} className={css[kindOf(block.booking, viewerId)]} style={pos(block.from, block.to)} />)}</span>
              {blocks.length ? <span className={css.weekLines} aria-hidden>
                {blocks.slice(0, 3).map(block => <span key={bookingKey(block.booking)} className={css[`text${kindOf(block.booking, viewerId)}`]}>
                  <b>{time(block.from)}</b> {block.booking.title}
                </span>)}
                {blocks.length > 3 && <span className={css.weekMore}>+{blocks.length - 3} lagi</span>}
              </span> : <span className={css.weekFree} aria-hidden>Kosong</span>}
            </button> : <span className={css.weekOff} aria-hidden>–</span>}
          </td>;
        })}
      </tr>)}
    </tbody>
  </table>;
}
