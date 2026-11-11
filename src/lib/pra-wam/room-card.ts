import { appraisalRules, clockLabel, isWorkday, wibInstant, wibTime, type Booking, type Room } from "./appraisal";
import { durationLabel } from "./room-day";

/*
 * Timeline's room cards (11 Nov 2026): one card per room for the day picked on the calendar, as the
 * design panitia shared: the room's name and Book, its capacity, a bar of the opening hours (what
 * is still free as "Sisa 8 jam", then each booking as its own block), and the day's bookings with
 * who booked them ("Sofyan +3"). Pure, so it is tested without a page.
 */

const OPEN = Number(appraisalRules.open.slice(0, 2)) * 60 + Number(appraisalRules.open.slice(3));
const CLOSE = Number(appraisalRules.close.slice(0, 2)) * 60 + Number(appraisalRules.close.slice(3));
const DAY = CLOSE - OPEN;
/** Minutes after midnight (WIB) of `iso` on `date`, held to the opening hours. */
const minuteOf = (date: string, iso: string) => Math.min(CLOSE, Math.max(OPEN, Math.round((Date.parse(iso) - Date.parse(wibInstant(date, "00:00"))) / 60_000)));

export type RoomCardItem = { id: string; title: string; time: string; who: string; tone: number; session: boolean };
export type RoomCard = {
  room: Room;
  /** "Sisa 8 jam", "Penuh", "Sudah lewat", "Tidak bisa dibooking". */
  left: string;
  /** Share of the opening hours still free (0–1), drawn first. */
  free: number;
  /** Each booking's share of the opening hours, in its tone. */
  blocks: { id: string; share: number; tone: number }[];
  items: RoomCardItem[];
};

/** "Sofyan +3", or "Sofyan" alone; panitia's own sessions say "Panitia". */
export const whoLabel = (booking: Pick<Booking, "bookedBy" | "others" | "isSession">) =>
  booking.isSession ? "Panitia" : `${booking.bookedBy.name}${booking.others ? ` +${booking.others}` : ""}`;

/** One room's card on `date`: `bookings` are that day's, of every room (those of this room are taken). */
export function roomCard(room: Room, bookings: readonly Booking[], date: string, now: Date): RoomCard {
  const mine = bookings.filter(booking => booking.roomId === room.id).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const spans = mine.map(booking => ({ booking, from: minuteOf(date, booking.startsAt), to: minuteOf(date, booking.endsAt) })).filter(span => span.to > span.from);
  // Free time from now on: all of a coming day, the rest of today, none of a day gone. Overlaps count once.
  const from = minuteOf(date, now.toISOString());
  const ahead = CLOSE - from;
  const taken = new Set<number>();
  for (const span of spans) for (let minute = Math.max(span.from, from); minute < span.to; minute++) taken.add(minute);
  const freeAhead = ahead - taken.size;
  const usedShare = Math.min(1, spans.reduce((sum, span) => sum + (span.to - span.from), 0) / DAY);
  const left = !room.bookable ? "Tidak bisa dibooking"
    : !isWorkday(date) ? "Tutup akhir pekan"
    : ahead === 0 ? "Sudah lewat"
    : freeAhead <= 0 ? "Penuh"
    : `Sisa ${durationLabel(freeAhead)}`;
  return {
    room, left, free: Math.max(0, 1 - usedShare),
    blocks: spans.map((span, index) => ({ id: span.booking.id, share: (span.to - span.from) / DAY, tone: index % 2 })),
    items: mine.map((booking, index) => ({
      id: booking.id, title: booking.title, tone: index % 2, session: !!booking.isSession, who: whoLabel(booking),
      time: `${clockLabel(wibTime(booking.startsAt))}–${clockLabel(wibTime(booking.endsAt))}`,
    })),
  };
}

/** The cards of a day: every bookable room, and any other room holding something, in the admin's order. */
export function roomCards(rooms: readonly Room[], bookings: readonly Booking[], date: string, now: Date): RoomCard[] {
  return rooms.filter(room => room.bookable || bookings.some(booking => booking.roomId === room.id)).map(room => roomCard(room, bookings, date, now));
}
