import { z } from "zod";
import { appraisalRules, bookingInputSchema, clockMinutes, isWorkday, minutesClock, OUTSIDE_ROOM, overlaps, roomKeptFrom, slotTimes, wibDate, wibInstant, wibTime, type Booking, type BookingPeriod, type Room } from "@/lib/pra-wam/appraisal";
import { roomFit } from "@/lib/pra-wam/room-fit";

/*
 * Booking Kantor (/booking, 10 Nov 2026): the office's own booking app, outside WAM, on the same
 * rooms and bookings as WAM's Book ruang (so the two never clash; migration 202611100006). The
 * room rules are WAM's and the database's: 07.00–22.00, Monday–Friday, half hours, at most 4 hours,
 * 4 active bookings per person a day. What differs is here: no WAM period (any weekday from today,
 * `daysAhead` days on), no "Di luar kantor", and Internal or Eksternal with who the guest is.
 */

export const officeRules = {
  /** How far ahead a room may be booked, in days from today. */
  daysAhead: 30,
  open: appraisalRules.open, close: appraisalRules.close, stepMinutes: appraisalRules.stepMinutes,
  maxMinutes: appraisalRules.maxMinutes, maxPerDay: appraisalRules.maxPerDay,
} as const;

export const MIGRATION_BOOKING_APP = "202611100006_booking_app.sql";

const shift = (date: string, days: number) => {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
};

/** The last day that can be booked today. */
export const officeLastDate = (today: string) => shift(today, officeRules.daysAhead);

/** The days a booking may be on, as bookingProblems() takes them. */
export const officePeriod = (now: Date): BookingPeriod => {
  const today = wibDate(now.toISOString());
  return { start: today, end: officeLastDate(today), message: `Ruangan bisa dipesan dari hari ini sampai ${officeRules.daysAhead} hari ke depan.` };
};

/** Every weekday from today to the last bookable day, for the date picker. */
export function officeDates(today: string): string[] {
  const dates: string[] = [];
  for (let date = today; date <= officeLastDate(today); date = shift(date, 1)) if (isWorkday(date)) dates.push(date);
  return dates;
}

/** The weekday to show for an asked date: itself when bookable, else the first bookable day. */
export const officeDateOr = (asked: string | undefined, today: string) => {
  const dates = officeDates(today);
  return asked && dates.includes(asked) ? asked : dates[0] ?? today;
};

/** The weekday before or after `date` inside the bookable days, or null at either end. */
export function officeNeighbour(date: string, today: string, step: -1 | 1): string | null {
  const dates = officeDates(today);
  return dates[dates.indexOf(date) + step] ?? null;
}

export const AUDIENCES = ["internal", "eksternal"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const audienceLabels: Record<Audience, string> = { internal: "Internal", eksternal: "Eksternal" };

/** What the office app sends: WAM's booking, always in a room, with who it is for. */
export const officeBookingSchema = bookingInputSchema.and(z.object({
  audience: z.enum(AUDIENCES, "Pilih Internal atau Eksternal.").default("internal"),
  externalNote: z.string().trim().max(200, "Keterangan tamu paling panjang 200 karakter.").default(""),
})).superRefine((input, context) => {
  if (input.roomId === OUTSIDE_ROOM) context.addIssue({ code: "custom", path: ["roomId"], message: "Pilih ruangan." });
  if (input.audience === "eksternal" && input.externalNote.length < 2) context.addIssue({ code: "custom", path: ["externalNote"], message: "Isi nama tamu atau perusahaannya." });
});
export type OfficeBookingInput = z.infer<typeof officeBookingSchema>;

/** A booking as the office app shows it: where it was made, and who it is for (once migrated). */
export type OfficeBooking = Booking & {
  source: "wam" | "kantor"; audience: Audience; externalNote: string; mine: boolean;
  /** The full name of the administration staff member who made it for the booker; absent when the booker did. */
  createdBy?: string;
};

/*
 * Time first, then the room (11 Nov 2026), as Google Calendar, Outlook's Room Finder and Robin do:
 * the person sets the day, the start, how long and how many come, and every room answers whether
 * it is free for exactly that, and if not, why.
 */

/**
 * Booking Kantor has no fewest-people rule (11 Nov 2026, the owner): any room may be booked by
 * however few, only its capacity counts. WAM keeps `minPeople` (no one-on-one in the big room).
 */
export const withoutMinimum = <R extends Pick<Room, "minPeople">>(room: R): R => ({ ...room, minPeople: null });

/** The lengths offered as one tap, in minutes. */
export const DURATIONS = [30, 60, 90, 120] as const;

/** "10:00" + 90 → "11:30". */
export const endOf = (start: string, minutes: number) => minutesClock(clockMinutes(start) + minutes);

/** The first half hour on `date` that has not started, or null when the day is over (or the date passed). */
export function nextStart(date: string, now: Date): string | null {
  return slotTimes().slice(0, -1).find(time => new Date(wibInstant(date, time)) > now) ?? null;
}

/** The person's search: a day, a start, a length, and how many people (the booker included; null = not asked). */
export type RoomSearch = { date: string; start: string; minutes: number; people: number | null };

export type Availability =
  | { ok: true; until: string }
  | { ok: false; why: "terisi" | "kecil" | "besar" | "khusus" | "lewat" | "tutup"; text: string };

type Span = { startsAt: string; endsAt: string };

/**
 * Whether `room` is free for the search, and until when; else the first reason it is not, in the
 * order a person would care: the time, the department, the size, then who has it.
 * `bookings` are what holds that room on that day (WAM's bookings and sessions included).
 */
export function availability(room: Room, bookings: Span[], search: RoomSearch, context: { now: Date; largest: number | null; departments: readonly string[] }): Availability {
  const end = clockMinutes(search.start) + search.minutes;
  if (end > clockMinutes(officeRules.close)) return { ok: false, why: "tutup", text: `Melewati jam tutup ${officeRules.close.replace(":", ".")}` };
  if (search.minutes > officeRules.maxMinutes) return { ok: false, why: "tutup", text: "Paling lama 4 jam" };
  const span = { startsAt: wibInstant(search.date, search.start), endsAt: wibInstant(search.date, minutesClock(end)) };
  if (new Date(span.startsAt) <= context.now) return { ok: false, why: "lewat", text: "Jam ini sudah lewat" };
  const kept = roomKeptFrom(room, context.departments);
  if (kept) return { ok: false, why: "khusus", text: kept };
  if (search.people != null) {
    const fit = roomFit(withoutMinimum(room), search.people, context.largest);
    if (!fit.ok) return { ok: false, why: fit.reason === "besar" ? "besar" : "kecil", text: fit.text };
  }
  // Instants are compared as numbers: the database writes "Z", the form "+07:00".
  const at = (iso: string) => Date.parse(iso);
  const clash = bookings.filter(item => overlaps(item, span)).sort((a, b) => at(b.endsAt) - at(a.endsAt))[0];
  if (clash) return { ok: false, why: "terisi", text: `Terisi sampai ${wibTime(clash.endsAt).replace(":", ".")}` };
  const after = bookings.filter(item => at(item.startsAt) >= at(span.endsAt)).sort((a, b) => at(a.startsAt) - at(b.startsAt))[0];
  return { ok: true, until: after ? wibTime(after.startsAt) : officeRules.close };
}

/** What a room is doing at `now`: in use until when, or free until its next booking today (null = rest of the day). */
export function roomNow<B extends Span>(bookings: B[], now: Date): { busy: B } | { busy: null; next: B | null } {
  const at = now.getTime();
  const sorted = [...bookings].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const busy = sorted.find(item => Date.parse(item.startsAt) <= at && at < Date.parse(item.endsAt));
  if (busy) return { busy };
  return { busy: null, next: sorted.find(item => Date.parse(item.startsAt) > at) ?? null };
}
