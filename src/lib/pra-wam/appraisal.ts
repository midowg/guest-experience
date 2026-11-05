import { z } from "zod";
import { headcount, peopleLabel, roomFit } from "./room-fit";

/*
 * Appraisal room booking for Pra WAM: the rules shared by the form, the server and the tests.
 * Times are WIB (UTC+7, no daylight saving), so a fixed offset is exact. The database repeats the
 * hard rules (migration 202611040001) and settles a race between two people booking at once.
 */

export const appraisalRules = {
  /** Appraisal & meeting 1-on-1 in the Pra WAM calendar. */
  periodStart: "2026-10-28",
  periodEnd: "2026-11-20",
  /** Opening hours, 07.00–22.00 since 5 Nov 2026 (migration 202611050005; was 09.00–18.00). */
  open: "07:00",
  close: "22:00",
  stepMinutes: 30,
  maxMinutes: 240,
  maxPerDay: 4,
  maxParticipants: 15,
} as const;

/** Offered while typing the activity name, before the names people have already used. */
export const standardTitles = ["Appraisal 1-on-1", "Appraisal tim", "Review KPI", "Kalibrasi nilai", "Feedback session"];

export type Room = {
  id: string; slug: string; name: string; kind: "utama" | "area"; capacity: number | null; bookable: boolean;
  /** The fewest people the room is for (a big room is not for a one-on-one); null = no lower limit. */
  minPeople: number | null;
  /** The floor plan spot the super admin picked; null = matched by name (migration 202611040009). */
  planKey: string | null;
  /** What the room has, for its line on the floor plan: "TV", "Whiteboard"… */
  facilities: string[];
};
export type Person = { id: string; name: string; department: string };
/**
 * "Di luar kantor" (5 Nov 2026, migration 202611050006): a booking without an office room, with a
 * place name instead. Its roomId is this marker (never a room's id, which are uuids), so every list
 * that goes by room leaves it out on its own; `place` names where it is.
 */
export const OUTSIDE_ROOM = "luar";
export const isOutside = (booking: { roomId: string }) => booking.roomId === OUTSIDE_ROOM;
/** Where a booking is, in words: the room's name, or "Kopi Klotok · di luar kantor". */
export const bookingWhere = (booking: { roomId: string; place?: string }, rooms: { id: string; name: string }[]) =>
  isOutside(booking) ? `${booking.place || "Tempat belum diisi"} · di luar kantor` : rooms.find(room => room.id === booking.roomId)?.name ?? "Ruang";
/** An outside booking may start at any half hour of the day and end by 23.30 the same day. */
export const OUTSIDE_HOURS = { open: "00:00", close: "23:30" } as const;

export type Booking = {
  id: string; roomId: string; title: string; description: string; startsAt: string; endsAt: string;
  /** The place of an outside booking ("Kopi Klotok, Kaliurang"); absent for a room booking. */
  place?: string;
  bookedBy: Person;
  /** Only sent to the booker, its participants, and the people who manage Pra WAM. */
  participants: Person[] | null;
  /** A Pra WAM session holding the room (set by panitia), shown on the schedule but not a booking. */
  isSession?: boolean;
};

const WIB = "+07:00";
const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const fromMinutes = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** "2026-11-04" + "10:00" → the instant, as ISO with the WIB offset. */
export const wibInstant = (date: string, time: string) => `${date}T${time}:00${WIB}`;
const wibParts = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString();
/** The WIB calendar date of an instant, "2026-11-04". */
export const wibDate = (iso: string) => wibParts(iso).slice(0, 10);
/** The WIB clock time of an instant, "10:00". */
export const wibTime = (iso: string) => wibParts(iso).slice(11, 16);

/** Every bookable clock time in half hours: a room's open to close (07:00 to 22:00), or the whole day outside the office. */
export function slotTimes(outside = false): string[] {
  const hours = outside ? OUTSIDE_HOURS : appraisalRules;
  const times: string[] = [];
  for (let at = toMinutes(hours.open); at <= toMinutes(hours.close); at += appraisalRules.stepMinutes) times.push(fromMinutes(at));
  return times;
}

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
export const isWorkday = (date: string) => weekday(date) >= 1 && weekday(date) <= 5;

/** Weekdays of the appraisal period from `from` on, for the date picker. */
export function bookableDates(from: string): string[] {
  const dates: string[] = [];
  const start = from > appraisalRules.periodStart ? from : appraisalRules.periodStart;
  for (let day = new Date(`${start}T12:00:00Z`); day.toISOString().slice(0, 10) <= appraisalRules.periodEnd; day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    if (isWorkday(date)) dates.push(date);
  }
  return dates;
}

/** Every weekday of the appraisal period, 28 Okt–20 Nov: the booking window the date strip shows. */
export const periodDates = () => bookableDates(appraisalRules.periodStart);

/** Every day of the period, weekends too: the days an outside booking may take. */
export function periodAllDates(): string[] {
  const dates: string[] = [];
  for (let day = new Date(`${appraisalRules.periodStart}T12:00:00Z`); day.toISOString().slice(0, 10) <= appraisalRules.periodEnd; day.setUTCDate(day.getUTCDate() + 1)) dates.push(day.toISOString().slice(0, 10));
  return dates;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const bookingInputSchema = z.object({
  roomId: z.union([z.uuid("Pilih ruang."), z.literal(OUTSIDE_ROOM)], "Pilih ruang."),
  /** The place of an outside booking; ignored for a room. */
  place: z.string().trim().max(120, "Nama tempat paling panjang 120 karakter.").default(""),
  date: z.string().regex(DATE, "Pilih tanggal."),
  start: z.string().regex(TIME, "Pilih jam mulai."),
  end: z.string().regex(TIME, "Pilih jam selesai."),
  title: z.string().trim().min(2, "Isi nama kegiatan.").max(120, "Nama kegiatan paling panjang 120 karakter."),
  description: z.string().trim().max(500, "Deskripsi paling panjang 500 karakter.").default(""),
  participants: z.array(z.uuid()).max(appraisalRules.maxParticipants, `Paling banyak ${appraisalRules.maxParticipants} partisipan.`).default([]),
}).superRefine((input, context) => {
  if (input.roomId === OUTSIDE_ROOM && input.place.length < 2) context.addIssue({ code: "custom", path: ["place"], message: "Isi nama tempat." });
});
export type BookingInput = z.infer<typeof bookingInputSchema>;

/**
 * The rules a booking must meet, as field errors; empty when it may be saved. `now` decides "past".
 * An outside booking (roomId OUTSIDE_ROOM) may be on a weekend, at any hour of the day and longer
 * than 4 hours; the period, the half hours and "one day" still hold.
 */
export function bookingProblems(input: Pick<BookingInput, "date" | "start" | "end"> & { roomId?: string }, now: Date): Record<string, string> {
  const problems: Record<string, string> = {};
  const outside = input.roomId === OUTSIDE_ROOM;
  const hours = outside ? OUTSIDE_HOURS : appraisalRules;
  const times = slotTimes(outside);
  if (input.date < appraisalRules.periodStart || input.date > appraisalRules.periodEnd) problems.date = "Tanggal di luar periode appraisal (28 Okt–20 Nov 2026).";
  else if (!outside && !isWorkday(input.date)) problems.date = "Ruang hanya bisa dipesan Senin–Jumat. Di luar kantor boleh akhir pekan.";
  const step = appraisalRules.stepMinutes;
  const label = (minutes: number) => fromMinutes(minutes).replace(":", ".");
  const [open, close] = [toMinutes(hours.open), toMinutes(hours.close)];
  if (!times.includes(input.start) || input.start === hours.close) problems.start = `Jam mulai ${label(open)}–${label(close - step)}, setiap ${step} menit.`;
  if (!times.includes(input.end) || input.end === hours.open) problems.end = `Jam selesai ${label(open + step)}–${label(close)}, setiap ${step} menit.`;
  const minutes = toMinutes(input.end) - toMinutes(input.start);
  if (!problems.start && !problems.end) {
    if (minutes <= 0) problems.end = "Jam selesai harus setelah jam mulai.";
    else if (!outside && minutes > appraisalRules.maxMinutes) problems.end = "Paling lama 4 jam.";
  }
  if (!problems.date && !problems.start && new Date(wibInstant(input.date, input.start)) < now) problems.start = "Jam ini sudah lewat.";
  return problems;
}

type Span = { startsAt: string; endsAt: string };
export const overlaps = (a: Span, b: Span) => new Date(a.startsAt) < new Date(b.endsAt) && new Date(b.startsAt) < new Date(a.endsAt);

/**
 * What to offer when the chosen room and hours are taken: the nearest free spans of the same
 * length in that room on that day, and the other rooms that are free at the chosen hours.
 */
export function alternatives(input: Pick<BookingInput, "roomId" | "date" | "start" | "end">, rooms: Room[], bookings: Pick<Booking, "id" | "roomId" | "startsAt" | "endsAt">[], now: Date, ignoreId?: string) {
  const active = bookings.filter(booking => booking.id !== ignoreId);
  const length = toMinutes(input.end) - toMinutes(input.start);
  const isFree = (roomId: string, start: string, end: string) =>
    !active.some(booking => booking.roomId === roomId && overlaps(booking, { startsAt: wibInstant(input.date, start), endsAt: wibInstant(input.date, end) }));
  const sameRoom: { start: string; end: string }[] = [];
  for (let at = toMinutes(appraisalRules.open); at + length <= toMinutes(appraisalRules.close); at += appraisalRules.stepMinutes) {
    const start = fromMinutes(at), end = fromMinutes(at + length);
    if (new Date(wibInstant(input.date, start)) < now) continue;
    if (isFree(input.roomId, start, end)) sameRoom.push({ start, end });
  }
  const wanted = toMinutes(input.start);
  sameRoom.sort((a, b) => Math.abs(toMinutes(a.start) - wanted) - Math.abs(toMinutes(b.start) - wanted) || a.start.localeCompare(b.start));
  const otherRooms = rooms.filter(room => room.bookable && room.id !== input.roomId && isFree(room.id, input.start, input.end)).map(room => room.id);
  return { sameRoom: sameRoom.slice(0, 3), otherRooms };
}

/**
 * Suggestions for the activity name: the standard names and the ones already used, those that
 * start with what was typed first, then those that contain it; the most used first.
 */
export function titleSuggestions(typed: string, used: { title: string; count: number }[], limit = 6): string[] {
  const counts = new Map<string, { title: string; count: number }>();
  for (const title of standardTitles) counts.set(title.toLowerCase(), { title, count: 0 });
  for (const item of used) {
    const key = item.title.trim().toLowerCase();
    if (!key) continue;
    const known = counts.get(key);
    counts.set(key, { title: known?.title ?? item.title.trim(), count: (known?.count ?? 0) + item.count });
  }
  const query = typed.trim().toLowerCase();
  const all = [...counts.entries()].filter(([key]) => key !== query);
  const rank = ([key]: [string, unknown]) => (!query ? 0 : key.startsWith(query) ? 0 : key.includes(query) ? 1 : 2);
  return all.filter(entry => rank(entry) < 2)
    .sort((a, b) => rank(a) - rank(b) || b[1].count - a[1].count || a[1].title.localeCompare(b[1].title))
    .slice(0, limit).map(([, item]) => item.title);
}

/** "Rabu, 4 Nov" */
export function dayLabel(date: string): string {
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
/** "10.00" */
export const clockLabel = (time: string) => time.replace(":", ".");

/* ── Book calendar: the day and week layout (BookCalendar.tsx). Minutes count from opening. ── */

/** "10:30" → 630. */
export const clockMinutes = toMinutes;
/** 630 → "10:30". */
export const minutesClock = fromMinutes;
/** The length of the bookable day, 540 minutes. */
export const dayMinutes = toMinutes(appraisalRules.close) - toMinutes(appraisalRules.open);
/** Minutes after opening → the clock time, "10:30". */
export const clockAt = (offset: number) => fromMinutes(toMinutes(appraisalRules.open) + offset);

const shiftDays = (date: string, days: number) => {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
};

/** Monday to Friday of the week holding `date` (a Saturday or Sunday belongs to the week before). */
export function workWeek(date: string): string[] {
  const monday = shiftDays(date, -((weekday(date) + 6) % 7));
  return [0, 1, 2, 3, 4].map(days => shiftDays(monday, days));
}

/** Monday to Sunday of the week holding `date`: the days Book loads, since "Di luar kantor" may be on a weekend. */
export function loadedWeek(date: string): string[] {
  const monday = workWeek(date)[0];
  return [0, 1, 2, 3, 4, 5, 6].map(days => shiftDays(monday, days));
}

/** The Monday `weeks` weeks before or after the week holding `date`. */
export const weekShift = (date: string, weeks: number) => shiftDays(workWeek(date)[0], weeks * 7);

/** Where an instant falls on `date`, in minutes after opening, kept inside the opening hours. */
function offsetOn(date: string, iso: string): number {
  const day = wibDate(iso);
  if (day < date) return 0;
  if (day > date) return dayMinutes;
  return Math.min(dayMinutes, Math.max(0, toMinutes(wibTime(iso)) - toMinutes(appraisalRules.open)));
}

/**
 * The first minute after opening that can still be booked on `date`: 0 for a day ahead, the whole
 * day for a day gone, and on the day itself the next half hour that has not started.
 */
export function bookableFrom(date: string, now: Date): number {
  const today = wibDate(now.toISOString());
  if (date > today) return 0;
  if (date < today) return dayMinutes;
  const passed = toMinutes(wibTime(now.toISOString())) - toMinutes(appraisalRules.open);
  const step = appraisalRules.stepMinutes;
  return Math.min(dayMinutes, Math.max(0, Math.floor(passed / step) * step + step));
}

/** The "Sekarang" line on `date`: minutes after opening, or null when it is not that day's hours. */
export function nowOffset(date: string, now: Date): number | null {
  if (wibDate(now.toISOString()) !== date) return null;
  const at = toMinutes(wibTime(now.toISOString())) - toMinutes(appraisalRules.open);
  return at >= 0 && at <= dayMinutes ? at : null;
}

/** A stretch of one room's day: a booking (or session), free time to book, or time gone by. */
export type DaySegment<B> =
  | { kind: "busy"; from: number; to: number; booking: B }
  | { kind: "free"; from: number; to: number }
  | { kind: "past"; from: number; to: number };

/**
 * One room's day from opening to closing, in order: its bookings, and the gaps between them split
 * into time already gone (`past`) and time that can still be booked (`free`). `bookings` are that
 * room's on that date; overlapping ones (which the database refuses) do not open a gap.
 */
export function roomDay<B extends Pick<Booking, "startsAt" | "endsAt">>(date: string, bookings: B[], now: Date): DaySegment<B>[] {
  const cutoff = bookableFrom(date, now);
  const segments: DaySegment<B>[] = [];
  const gap = (from: number, to: number) => {
    if (from < cutoff) {
      const end = Math.min(to, cutoff);
      const last = segments.at(-1);
      if (last?.kind === "past" && last.to === from) last.to = end;
      else segments.push({ kind: "past", from, to: end });
    }
    if (to > cutoff) segments.push({ kind: "free", from: Math.max(from, cutoff), to });
  };
  let cursor = 0;
  const blocks = bookings.map(booking => ({ booking, from: offsetOn(date, booking.startsAt), to: offsetOn(date, booking.endsAt) }))
    .filter(block => block.to > block.from).sort((a, b) => a.from - b.from || a.to - b.to);
  for (const block of blocks) {
    if (block.from > cursor) gap(cursor, block.from);
    segments.push({ kind: "busy", ...block });
    cursor = Math.max(cursor, block.to);
  }
  if (cursor < dayMinutes) gap(cursor, dayMinutes);
  return segments;
}

/**
 * The half hour under the pointer in a free stretch: `at` minutes into the day, rounded down to the
 * step and kept inside the stretch (the last start still leaves one step).
 */
export function startInGap(gap: { from: number; to: number }, at: number): number {
  const step = appraisalRules.stepMinutes;
  const snapped = gap.from + Math.floor(Math.max(0, at - gap.from) / step) * step;
  return Math.max(gap.from, Math.min(snapped, gap.to - step));
}

/** A new booking's hours from a free stretch: from `start`, an hour or what is left of the stretch. */
export function hoursInGap(gap: { from: number; to: number }, start: number): { start: string; end: string } {
  return { start: clockAt(start), end: clockAt(Math.min(start + 60, gap.to, start + appraisalRules.maxMinutes)) };
}

/** One day in the week overview: its bookings per room, how many, and how long rooms are taken. */
export type WeekDay<B> = { date: string; count: number; busyMinutes: number; rooms: Record<string, { from: number; to: number; booking: B }[]> };

/** The week overview (Mon–Fri × rooms): for every day and room the blocks, a count and busy minutes. */
export function weekSummary<B extends Pick<Booking, "roomId" | "startsAt" | "endsAt">>(dates: string[], roomIds: string[], bookings: B[]): WeekDay<B>[] {
  return dates.map(date => {
    const rooms: WeekDay<B>["rooms"] = Object.fromEntries(roomIds.map(id => [id, []]));
    let count = 0, busyMinutes = 0;
    for (const booking of bookings) {
      if (!rooms[booking.roomId] || wibDate(booking.startsAt) !== date) continue;
      const from = offsetOn(date, booking.startsAt), to = offsetOn(date, booking.endsAt);
      if (to <= from) continue;
      rooms[booking.roomId].push({ from, to, booking });
      count += 1; busyMinutes += to - from;
    }
    for (const list of Object.values(rooms)) list.sort((a, b) => a.from - b.from);
    return { date, count, busyMinutes, rooms };
  });
}

/**
 * The hours a new booking starts with: the asked start when it can still be booked, else the next
 * half hour that has not started; the asked end when it fits (after the start, at most 4 hours),
 * else an hour later.
 */
export function draftHours(date: string, now: Date, asked: { start?: string; end?: string } = {}): { start: string; end: string } {
  const open = slotTimes().slice(0, -1).filter(time => new Date(wibInstant(date, time)) > now);
  const start = asked.start && open.includes(asked.start) ? asked.start : open[0] ?? appraisalRules.open;
  const fits = (time: string) => toMinutes(time) > toMinutes(start) && toMinutes(time) - toMinutes(start) <= appraisalRules.maxMinutes;
  const end = asked.end && slotTimes().includes(asked.end) && fits(asked.end) ? asked.end
    : fromMinutes(Math.min(toMinutes(start) + 60, toMinutes(appraisalRules.close)));
  return { start, end };
}

/* ── The booking form's steps (BookingForm.tsx) and the room rule the server repeats. ── */

/** 30 → "30 mnt", 60 → "1 jam", 90 → "1 jam 30 mnt". */
export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return [hours ? `${hours} jam` : "", rest ? `${rest} mnt` : ""].filter(Boolean).join(" ") || "0 mnt";
}

/** The lengths a booking from `start` may take: every half hour up to 4 hours, ending by closing. */
export function durationsFrom(start: string, outside = false): number[] {
  // Outside the office: until 23.30, with no 4-hour cap.
  const room = outside ? toMinutes(OUTSIDE_HOURS.close) - toMinutes(start) : Math.min(appraisalRules.maxMinutes, toMinutes(appraisalRules.close) - toMinutes(start));
  const lengths: number[] = [];
  for (let length = appraisalRules.stepMinutes; length <= room; length += appraisalRules.stepMinutes) lengths.push(length);
  return lengths;
}

/**
 * Why a booking may not take its room for the people it brings (the booker and each other
 * participant once), as roomFit() says; null when it may. An unknown or closed room is left to the
 * database, which answers those with its own message.
 */
export function roomFitProblem(rooms: Room[], input: Pick<BookingInput, "roomId" | "participants">, bookerId: string): { message: string; reason: string } | null {
  const room = rooms.find(item => item.id === input.roomId);
  if (!room || !room.bookable) return null;
  const people = headcount(new Set(input.participants.filter(id => id !== bookerId)).size);
  const fit = roomFit(room, people);
  if (fit.ok) return null;
  return { message: `${room.name} tidak cocok untuk ${peopleLabel(people)}. ${fit.text}.`, reason: fit.text };
}
