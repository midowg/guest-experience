import { appraisalRules, clockLabel, overlaps, wibInstant, wibTime } from "./appraisal";

/*
 * A room's whole day for the Book plan: how much of 09.00–18.00 is taken (bookings and Pra WAM
 * sessions), the next half hour that can still be booked, and so its status on the plan: empty,
 * partly used, full (no free half hour left), or over (the day's hours have passed).
 */

export type DayHold = { startsAt: string; endsAt: string; session?: boolean };
/** How a room shows on the Book plan for a whole day. */
export type DayTone = "free" | "part" | "full" | "off" | "closed";
export type DayStatus = { tone: DayTone; text: string };
export type RoomDay = {
  status: DayStatus;
  /** Bookings and sessions on the day, counted apart. */
  bookings: number; sessions: number;
  /** Minutes of opening hours taken, overlaps counted once. */
  takenMinutes: number;
  /** The first free half hour that has not begun, and the free run it starts ("13:00"–"15:30"); null when none. */
  nextFree: { start: string; end: string } | null;
};

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const fromMinutes = (total: number) => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
const OPEN = toMinutes(appraisalRules.open), CLOSE = toMinutes(appraisalRules.close), STEP = appraisalRules.stepMinutes;

/** 210 → "3 jam 30 mnt", 60 → "1 jam", 30 → "30 mnt". */
export function durationLabel(total: number): string {
  const hours = Math.floor(total / 60), rest = total % 60;
  return [hours ? `${hours} jam` : "", rest ? `${rest} mnt` : ""].filter(Boolean).join(" ") || "0 mnt";
}

/** "2 booking, 1 sesi". */
export function countLabel(bookings: number, sessions: number): string {
  return [bookings ? `${bookings} booking` : "", sessions ? `${sessions} sesi` : ""].filter(Boolean).join(", ");
}

/** Minutes of `date`'s opening hours covered by the holds, each minute once. */
function takenWithin(date: string, holds: DayHold[]): number {
  const spans = holds
    .map(hold => [hold.startsAt, hold.endsAt].map(iso => {
      const day = new Date(iso).getTime() - new Date(wibInstant(date, "00:00")).getTime();
      return Math.round(day / 60_000);
    }) as [number, number])
    .map(([from, to]) => [Math.max(from, OPEN), Math.min(to, CLOSE)] as [number, number])
    .filter(([from, to]) => to > from)
    .sort((a, b) => a[0] - b[0]);
  let total = 0, reached = OPEN;
  for (const [from, to] of spans) {
    const start = Math.max(from, reached);
    if (to > start) { total += to - start; reached = to; }
  }
  return total;
}

/**
 * The day of one room on `date`: `holds` are its bookings and sessions that day. A half hour that
 * has begun (`now`) can no longer be booked, so today's past hours never count as free; a day whose
 * hours are all past is "over" rather than full.
 */
export function roomDay(input: { date: string; bookable: boolean; holds: DayHold[]; now: Date }): RoomDay {
  const { date, bookable, holds, now } = input;
  const sessions = holds.filter(hold => hold.session).length;
  const bookings = holds.length - sessions;
  const takenMinutes = takenWithin(date, holds);
  const slot = (at: number) => ({ startsAt: wibInstant(date, fromMinutes(at)), endsAt: wibInstant(date, fromMinutes(at + STEP)) });
  const ahead: number[] = [];
  for (let at = OPEN; at + STEP <= CLOSE; at += STEP) if (new Date(slot(at).startsAt) > now) ahead.push(at);
  const isFree = (at: number) => !holds.some(hold => overlaps(hold, slot(at)));
  const first = ahead.find(isFree);
  let nextFree: RoomDay["nextFree"] = null;
  if (first != null) {
    let end = first + STEP;
    while (end + STEP <= CLOSE && isFree(end)) end += STEP;
    nextFree = { start: fromMinutes(first), end: fromMinutes(end) };
  }
  const counted = countLabel(bookings, sessions);
  const base = { bookings, sessions, takenMinutes, nextFree };
  if (!bookable) return { ...base, status: { tone: "off", text: "Tidak bisa dibooking" } };
  if (!ahead.length) return { ...base, status: { tone: "closed", text: counted ? `Sudah lewat · ${counted}` : "Sudah lewat" } };
  if (!nextFree) return { ...base, status: { tone: "full", text: "Penuh" } };
  if (holds.length) return { ...base, status: { tone: "part", text: `Terpakai · ${counted}` } };
  return { ...base, status: { tone: "free", text: "Kosong" } };
}

/** "13.00–15.30" for a free run. */
export const runLabel = (run: { start: string; end: string }) => `${clockLabel(run.start)}–${clockLabel(run.end)}`;

/** Where "Book ruang ini" starts: the free run's start, an hour long when the run allows. */
export function bookingFrom(run: { start: string; end: string }): { start: string; end: string } {
  const start = toMinutes(run.start);
  return { start: run.start, end: fromMinutes(Math.min(start + 60, toMinutes(run.end))) };
}

/** A hold's hours in WIB, "09.30–10.00". */
export const holdLabel = (hold: { startsAt: string; endsAt: string }) => `${clockLabel(wibTime(hold.startsAt))}–${clockLabel(wibTime(hold.endsAt))}`;
