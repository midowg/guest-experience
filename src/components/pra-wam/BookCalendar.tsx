"use client";

import { useState, type CSSProperties, type PointerEvent, type MouseEvent } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { appraisalRules, bookableFrom, clockAt, clockLabel, dayLabel, dayMinutes, hoursInGap, nowOffset, roomDay, startInGap, wibDate, wibTime, type Booking, type DaySegment, type Room } from "@/lib/pra-wam/appraisal";
import { durationLabel } from "@/lib/pra-wam/room-day";
import css from "./book-calendar.module.css";

/*
 * Book's calendar, in the design system's agenda style (DS "Agenda dan permintaan", "Jadwal,
 * tampilan minggu"). On a phone: under the month calendar, the picked day as one compact card per
 * room: a 07.00–22.00 bar of what is taken, then the bookings and the free stretches to tap, in
 * order. From 1024px: the day as a timeline (rooms as columns), or the week as a grid (days as
 * columns, hours down) for one room picked above it.
 */

export type BookPick = { room: Room; start: string; end: string };
type Kind = "busy" | "mine" | "session";
type Gap = { from: number; to: number };

const time = (offset: number) => clockLabel(clockAt(offset));
const spanOf = (from: number, to: number) => `${time(from)}–${time(to)}`;
const utc = (date: string) => new Date(`${date}T12:00:00Z`);
const shortDay = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" }).format(utc(date));
const dayNumber = (date: string) => Number(date.slice(8, 10));
const monthShort = (date: string) => new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" }).format(utc(date));
const inPeriod = (date: string) => date >= appraisalRules.periodStart && date <= appraisalRules.periodEnd;
/** "2–6 Nov", or "26 Okt–30 Okt" across months. */
export const weekLabel = (week: string[]) => {
  const first = week[0], last = week.at(-1) ?? first;
  return monthShort(first) === monthShort(last) ? `${dayNumber(first)}–${dayNumber(last)} ${monthShort(last)}` : `${dayNumber(first)} ${monthShort(first)}–${dayNumber(last)} ${monthShort(last)}`;
};
/** Minutes on a timeline → a CSS length, in multiples of --hour. */
const at = (minutes: number) => `calc(${minutes / 60} * var(--hour))`;
/** Minutes on the phone bar → a share of its width. */
const across = (from: number, to: number) => ({ left: `${(from / dayMinutes) * 100}%`, width: `${((to - from) / dayMinutes) * 100}%` });

function kindOf(booking: Booking, viewerId: string): Kind {
  if (booking.isSession) return "session";
  return booking.bookedBy.id === viewerId ? "mine" : "busy";
}
const whoOf = (booking: Booking, viewerId: string) => booking.isSession ? "Sesi Pra WAM" : booking.bookedBy.id === viewerId ? "Booking kamu"
  : `${booking.bookedBy.name}${booking.bookedBy.department ? ` · ${booking.bookedBy.department}` : ""}`;
export const bookingKey = (booking: Booking) => `${booking.id}@${booking.roomId}@${booking.startsAt}`;
const bookingSpan = (booking: Booking) => `${clockLabel(wibTime(booking.startsAt))}–${clockLabel(wibTime(booking.endsAt))}`;

/** The colour key as a plain line: a dot and a word each, no pills; wraps on a narrow screen. */
export function Legend() {
  return <ul className={css.legend} aria-label="Keterangan warna">
    <li><i className={css.mine} aria-hidden />Booking kamu</li>
    <li><i className={css.busy} aria-hidden />Terpakai</li>
    <li><i className={css.session} aria-hidden />Sesi Pra WAM</li>
    <li><i className={css.free} aria-hidden />Kosong</li>
    <li><i className={css.crowded} aria-hidden />Hampir penuh</li>
  </ul>;
}

type DayProps = {
  date: string; rooms: Room[]; bookings: Booking[]; now: Date; viewerId: string;
  /** Booking is allowed (open, and the form's data is there). */
  canBook: boolean;
  onOpen: (booking: Booking) => void;
  onBook: (pick: BookPick) => void;
  /** Desktop: hidden from 1024px when the week grid shows instead. */
  phoneOnly?: boolean;
};

/**
 * The rooms of a day as cards (RoomCard), the same list under Kalender and under Denah (5 Nov
 * 2026: the switch only changes the picture above and its key). `always` keeps it on a desktop
 * too (Denah); under Kalender a desktop has the timeline instead. A card is `ruang-<id>`, so the
 * floor plan can bring it into view; `focusId` marks the one picked there.
 */
export function RoomList({ date, rooms, bookings, now, viewerId, canBook, onOpen, onBook, always, focusId }: Omit<DayProps, "phoneOnly"> & { always?: boolean; focusId?: string | null }) {
  const line = nowOffset(date, now);
  const over = bookableFrom(date, now) >= dayMinutes;
  const book = (room: Room, gap: Gap, start: number) => onBook({ room, ...hoursInGap(gap, start) });
  if (!rooms.length) return <p className={css.empty}>Belum ada ruang yang bisa dibooking. Admin WAM mengaturnya di Kelola acara.</p>;
  return <ul className={`${css.phone} ${always ? css.phoneAlways : ""}`} aria-label={`Ruang, ${dayLabel(date)}`}>
    {rooms.map(room => <li key={room.id} id={`ruang-${room.id}`} tabIndex={-1} className={focusId === room.id ? css.roomOn : undefined}>
      <RoomCard date={date} room={room} segments={roomDay(date, bookings.filter(booking => booking.roomId === room.id), now)} viewerId={viewerId} line={line} over={over} canBook={canBook} onOpen={onOpen} onBook={book} />
    </li>)}
  </ul>;
}

/** One day: a card per room on a phone (RoomList), the room-by-hour timeline from 1024px. */
export function DayCalendar({ date, rooms, bookings, now, viewerId, canBook, onOpen, onBook, phoneOnly }: DayProps) {
  const days = rooms.map(room => ({ room, segments: roomDay(date, bookings.filter(booking => booking.roomId === room.id), now) }));
  const line = nowOffset(date, now);
  const book = (room: Room, gap: Gap, start: number) => onBook({ room, ...hoursInGap(gap, start) });
  if (!rooms.length) return <p className={css.empty}>Belum ada ruang yang bisa dibooking. Admin WAM mengaturnya di Kelola acara.</p>;

  return <>
    <RoomList date={date} rooms={rooms} bookings={bookings} now={now} viewerId={viewerId} canBook={canBook} onOpen={onOpen} onBook={onBook} />

    <div className={`${css.desk} ${phoneOnly ? css.hiddenDesk : ""}`} style={{ "--cols": rooms.length, "--hours": dayMinutes / 60 } as CSSProperties}>
      <div className={css.deskHead}>
        <span />
        {days.map(({ room, segments }) => <div key={room.id} className={css.deskRoom}>
          <strong title={room.name}>{room.name}</strong>
          <span>{room.capacity ? `${room.capacity} orang · ` : ""}{segments.filter(segment => segment.kind === "busy").length || "Belum ada"} booking</span>
        </div>)}
      </div>
      <div className={css.deskBody} role="group" aria-label={`Jadwal ruang ${dayLabel(date)}, ${clockLabel(appraisalRules.open)}–${clockLabel(appraisalRules.close)}`}>
        <Axis line={line} />
        {days.map(({ room, segments }) => <div key={room.id} className={css.column} role="group" aria-label={room.name}>
          {segments.map(segment => segment.kind === "busy"
            ? <TimeBlock key={bookingKey(segment.booking)} segment={segment} viewerId={viewerId} line={line} onOpen={onOpen} />
            : segment.kind === "free" && canBook
              ? <FreeSlot key={`free-${segment.from}`} gap={segment} label={`Book ${room.name}, kosong ${spanOf(segment.from, segment.to)}`} onPick={start => book(room, segment, start)} />
              : <div key={`${segment.kind}-${segment.from}`} className={segment.kind === "past" ? css.past : css.freeIdle} style={{ top: at(segment.from), height: at(segment.to - segment.from) }} aria-hidden />)}
        </div>)}
        {line != null && <NowLine line={line} />}
      </div>
    </div>
  </>;
}

/**
 * A room's day on a phone (DS itinerary card): name and size, a status pill, the 07.00–22.00 bar,
 * then in order its bookings (tap for the detail) and free stretches (soft green chips, tap to
 * book). Time gone by shows only on the bar, greyed, with a thin blue tick for now.
 */
function RoomCard({ date, room, segments, viewerId, line, over, canBook, onOpen, onBook }: {
  date: string; room: Room; segments: DaySegment<Booking>[]; viewerId: string; line: number | null; over: boolean; canBook: boolean;
  onOpen: (booking: Booking) => void; onBook: (room: Room, gap: Gap, start: number) => void;
}) {
  const taken = segments.filter(segment => segment.kind === "busy").length;
  const free = segments.filter(segment => segment.kind === "free");
  // One tag says it all: gone by, full, free all day, or the hours still free (overlaps counted once).
  const status = over ? { tone: css.pillMuted, text: "Sudah lewat" }
    : !free.length ? { tone: css.pillWarn, text: "Penuh" }
    : !taken ? { tone: css.pillFree, text: "Kosong" }
    : { tone: css.pillFree, text: `Sisa ${durationLabel(dayMinutes - takenOf(segments))}` };
  const items = segments.filter(segment => segment.kind !== "past");
  return <section className={css.room} aria-label={`${room.name}, ${dayLabel(date)}`}>
    <header className={css.roomHead}>
      <h3>{room.name}</h3>
      {room.capacity ? <span className={css.roomSize}>{room.capacity} orang</span> : null}
      <span className={`${css.pill} ${status.tone}`}>{status.text}</span>
    </header>
    <DayBar segments={segments} viewerId={viewerId} line={line} />
    {items.length ? <ol className={css.items}>
      {items.map(segment => {
        if (segment.kind === "busy") {
          const { booking } = segment;
          const done = line != null ? segment.to <= line : over;
          const running = line != null && segment.from <= line && line < segment.to;
          return <li key={bookingKey(booking)}>
            <button type="button" className={`${css.item} ${css[kindOf(booking, viewerId)]} ${done ? css.done : ""}`} onClick={() => onOpen(booking)} aria-haspopup="dialog">
              <span className={css.itemTime}>{bookingSpan(booking)}</span>
              <span className={css.itemWhat}>
                <strong>{booking.title}</strong>
                <small>{whoOf(booking, viewerId)}{running ? " · berlangsung" : done ? " · selesai" : ""}</small>
              </span>
              <ChevronRight className={css.itemIcon} aria-hidden />
            </button>
          </li>;
        }
        const words = <>Kosong <b>{spanOf(segment.from, segment.to)}</b></>;
        return <li key={`free-${segment.from}`}>
          {canBook
            ? <button type="button" className={css.chip} onClick={() => onBook(room, segment, segment.from)} aria-label={`Book ${room.name}, kosong ${spanOf(segment.from, segment.to)}`} aria-haspopup="dialog">
              {words}<Plus aria-hidden />
            </button>
            : <span className={`${css.chip} ${css.chipIdle}`}>{words}</span>}
        </li>;
      })}
    </ol> : null}
  </section>;
}

/** Minutes of the day taken by bookings and sessions, overlaps counted once. */
function takenOf(segments: DaySegment<Booking>[]): number {
  let total = 0, reached = 0;
  for (const segment of segments.filter(item => item.kind === "busy").sort((a, b) => a.from - b.from)) {
    const start = Math.max(segment.from, reached);
    if (segment.to > start) { total += segment.to - start; reached = segment.to; }
  }
  return total;
}

/** The day at a glance: taken blocks with their colour edge, time gone by greyed, a tick for now. */
function DayBar({ segments, viewerId, line }: { segments: DaySegment<Booking>[]; viewerId: string; line: number | null }) {
  return <div className={css.bar} aria-hidden>
    <div className={css.track}>
      {segments.map(segment => segment.kind === "busy"
        ? <i key={bookingKey(segment.booking)} className={`${css.barBlock} ${css[kindOf(segment.booking, viewerId)]}`} style={across(segment.from, segment.to)} />
        : segment.kind === "past" ? <i key={`p-${segment.from}`} className={css.barPast} style={across(segment.from, segment.to)} /> : null)}
      {line != null && <b className={css.barNow} style={{ left: `${(line / dayMinutes) * 100}%` }} />}
    </div>
    <div className={css.ticks}>{Array.from({ length: dayMinutes / 180 + 1 }, (_, index) => index * 180).map(offset => <span key={offset}>{time(offset)}</span>)}</div>
  </div>;
}

/** The hours down the left of a timeline, and now in blue when it is today. */
function Axis({ line }: { line: number | null }) {
  return <div className={css.axis} aria-hidden>
    {Array.from({ length: dayMinutes / 60 + 1 }, (_, hour) => <span key={hour} style={{ top: at(hour * 60) }}>{time(hour * 60)}</span>)}
    {line != null && <span className={css.axisNow} style={{ top: at(line) }}>{time(line)}</span>}
  </div>;
}

/** DS "garis sekarang": a thin blue line across the columns with a dot where it starts. */
function NowLine({ line }: { line: number }) {
  return <div className={css.nowLine} style={{ top: at(line) }} role="img" aria-label={`Sekarang ${time(line)}`} />;
}

/** A booking on a timeline (DS "Blok jadwal"): the hours small above the title, a colour edge by kind. */
function TimeBlock({ segment, viewerId, line, onOpen }: {
  segment: Extract<DaySegment<Booking>, { kind: "busy" }>; viewerId: string; line: number | null; onOpen: (booking: Booking) => void;
}) {
  const { booking } = segment;
  const kind = kindOf(booking, viewerId);
  const running = line != null && segment.from <= line && line < segment.to;
  const span = bookingSpan(booking);
  const short = segment.to - segment.from <= 30;
  return <button type="button" className={`${css.block} ${css[kind]} ${short ? css.blockShort : ""}`} style={{ top: at(segment.from), height: at(segment.to - segment.from) }}
    onClick={() => onOpen(booking)} aria-haspopup="dialog" title={`${booking.title} · ${span} · ${whoOf(booking, viewerId)}`}
    aria-label={`${booking.title}, ${span}, ${whoOf(booking, viewerId)}${running ? ", sedang berlangsung" : ""}`}>
    {/* A half hour has room for one line: the title (its hours are where it sits, and in the tip). */}
    {!short && <small className={css.blockTime}>{span}</small>}
    <strong>{booking.title}</strong>
    {!short && <small className={css.blockWho}>{whoOf(booking, viewerId)}</small>}
  </button>;
}

/**
 * Free time on a timeline: the half hour under the pointer shows "+ 10.30" and a click books from
 * there; from the keyboard it books from the start of the free time.
 */
function FreeSlot({ gap, label, onPick }: { gap: Gap; label: string; onPick: (start: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const startAt = (event: PointerEvent<HTMLButtonElement> | MouseEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return startInGap(gap, gap.from + ((event.clientY - box.top) / box.height) * (gap.to - gap.from));
  };
  const step = appraisalRules.stepMinutes;
  return <button type="button" className={css.freeSlot} style={{ top: at(gap.from), height: at(gap.to - gap.from) }}
    aria-label={label} aria-haspopup="dialog"
    onPointerMove={event => setHover(startAt(event))} onPointerLeave={() => setHover(null)}
    onClick={event => onPick(event.detail === 0 ? gap.from : startAt(event))}>
    {hover != null
      ? <span className={css.ghost} style={{ top: at(hover - gap.from), height: at(step) }} aria-hidden><Plus aria-hidden />{time(hover)}</span>
      : gap.to - gap.from >= 60 && <span className={css.freeHint} aria-hidden>Kosong</span>}
  </button>;
}

type WeekProps = {
  week: string[]; rooms: Room[]; bookings: Booking[]; viewerId: string; now: Date; today: string; selected: string;
  /** Booking is allowed at all (open, and the form's data is there); past days and days outside the period never are. */
  canBook: boolean;
  /** The room shown; the first one when it is not among `rooms`. */
  roomId: string; onRoom: (roomId: string) => void;
  onPickDay: (date: string) => void;
  /** The week before (-1) or after (1). */
  onWeek: (direction: -1 | 1) => void;
  onOpen: (booking: Booking) => void;
  onBook: (pick: BookPick & { date: string }) => void;
};

/**
 * DS "Jadwal, tampilan minggu" from 1024px: Monday to Friday as columns, 07.00–22.00 down, for one
 * room picked in "Pilih ruang". Today's column is tinted, now is a thin blue line, each booking a
 * pale block with a colour edge; free time books that room at that time; a day's head opens its day.
 */
export function WeekCalendar({ week, rooms, bookings, viewerId, now, today, selected, canBook, roomId, onRoom, onPickDay, onWeek, onOpen, onBook }: WeekProps) {
  const room = rooms.find(item => item.id === roomId) ?? rooms[0];
  if (!room) return <p className={css.empty}>Belum ada ruang yang bisa dibooking. Admin WAM mengaturnya di Kelola acara.</p>;
  const ofRoom = bookings.filter(booking => booking.roomId === room.id);
  const columns = week.map(date => ({ date, open: inPeriod(date), segments: roomDay(date, ofRoom.filter(booking => wibDate(booking.startsAt) === date), now) }));
  const line = week.includes(today) ? nowOffset(today, now) : null;
  const first = week[0], last = week.at(-1) ?? first;

  return <section className={css.weekCard} aria-label={`Jadwal ${room.name}, minggu ${weekLabel(week)}`}>
    <div className={css.weekTop}>
      <div className={css.weekNav}>
        <button type="button" className={css.round} onClick={() => onWeek(-1)} disabled={first <= appraisalRules.periodStart} aria-label="Minggu sebelumnya"><ChevronLeft aria-hidden /></button>
        <h3>{weekLabel(week)}</h3>
        <button type="button" className={css.round} onClick={() => onWeek(1)} disabled={last >= appraisalRules.periodEnd} aria-label="Minggu berikutnya"><ChevronRight aria-hidden /></button>
      </div>
      <div className={`${css.segmented} ${css.roomPick}`} role="group" aria-label="Pilih ruang">
        {rooms.map(item => <button key={item.id} type="button" aria-pressed={item.id === room.id} onClick={() => onRoom(item.id)}>{item.name}</button>)}
      </div>
    </div>

    <div className={css.timeline} style={{ "--cols": week.length, "--hours": dayMinutes / 60 } as CSSProperties}>
      <div className={css.deskHead}>
        <span />
        {columns.map(({ date, open }) => <button key={date} type="button" className={css.weekDay} data-today={date === today || undefined} data-selected={date === selected || undefined}
          disabled={!open} onClick={() => onPickDay(date)} aria-label={`Buka ${dayLabel(date)}${date === today ? ", hari ini" : ""}${open ? "" : ", di luar periode"}`}>
          <span>{shortDay(date)}</span><strong>{dayNumber(date)}</strong>
        </button>)}
      </div>
      <div className={css.deskBody} role="group" aria-label={`${room.name}, ${weekLabel(week)}, ${clockLabel(appraisalRules.open)}–${clockLabel(appraisalRules.close)}`}>
        <Axis line={line} />
        {columns.map(({ date, open, segments }) => {
          const bookable = canBook && open && date >= today;
          const dayLine = date === today ? line : null;
          return <div key={date} className={css.column} data-today={date === today || undefined} role="group" aria-label={`${dayLabel(date)}${open ? "" : ", di luar periode"}`}>
            {!open ? <div className={css.off} style={{ top: 0, height: at(dayMinutes) }} aria-hidden />
              : segments.map(segment => segment.kind === "busy"
                ? <TimeBlock key={bookingKey(segment.booking)} segment={segment} viewerId={viewerId} line={dayLine} onOpen={onOpen} />
                : segment.kind === "free" && bookable
                  ? <FreeSlot key={`free-${segment.from}`} gap={segment} label={`Book ${room.name}, ${dayLabel(date)}, kosong ${spanOf(segment.from, segment.to)}`}
                    onPick={start => onBook({ date, room, ...hoursInGap(segment, start) })} />
                  : <div key={`${segment.kind}-${segment.from}`} className={segment.kind === "past" ? css.past : css.freeIdle} style={{ top: at(segment.from), height: at(segment.to - segment.from) }} aria-hidden />)}
          </div>;
        })}
        {line != null && <NowLine line={line} />}
      </div>
    </div>
  </section>;
}
