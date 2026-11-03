import { z } from "zod";

/*
 * Appraisal room booking for Pra WAM: the rules shared by the form, the server and the tests.
 * Times are WIB (UTC+7, no daylight saving), so a fixed offset is exact. The database repeats the
 * hard rules (migration 202611040001) and settles a race between two people booking at once.
 */

export const appraisalRules = {
  /** Appraisal & meeting 1-on-1 in the Pra WAM calendar. */
  periodStart: "2026-10-28",
  periodEnd: "2026-11-20",
  open: "09:00",
  close: "18:00",
  stepMinutes: 30,
  maxMinutes: 240,
  maxPerDay: 4,
  maxParticipants: 15,
} as const;

/** Offered while typing the activity name, before the names people have already used. */
export const standardTitles = ["Appraisal 1-on-1", "Appraisal tim", "Review KPI", "Kalibrasi nilai", "Feedback session"];

export type Room = { id: string; slug: string; name: string; kind: "utama" | "area"; capacity: number | null; bookable: boolean };
export type Person = { id: string; name: string; department: string };
export type Booking = {
  id: string; roomId: string; title: string; description: string; startsAt: string; endsAt: string;
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

/** Every bookable clock time, 09:00 to 18:00 in half hours. */
export function slotTimes(): string[] {
  const times: string[] = [];
  for (let at = toMinutes(appraisalRules.open); at <= toMinutes(appraisalRules.close); at += appraisalRules.stepMinutes) times.push(fromMinutes(at));
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

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const bookingInputSchema = z.object({
  roomId: z.uuid("Pilih ruang."),
  date: z.string().regex(DATE, "Pilih tanggal."),
  start: z.string().regex(TIME, "Pilih jam mulai."),
  end: z.string().regex(TIME, "Pilih jam selesai."),
  title: z.string().trim().min(2, "Isi nama kegiatan.").max(120, "Nama kegiatan paling panjang 120 karakter."),
  description: z.string().trim().max(500, "Deskripsi paling panjang 500 karakter.").default(""),
  participants: z.array(z.uuid()).max(appraisalRules.maxParticipants, `Paling banyak ${appraisalRules.maxParticipants} partisipan.`).default([]),
});
export type BookingInput = z.infer<typeof bookingInputSchema>;

/** The rules a booking must meet, as field errors; empty when it may be saved. `now` decides "past". */
export function bookingProblems(input: Pick<BookingInput, "date" | "start" | "end">, now: Date): Record<string, string> {
  const problems: Record<string, string> = {};
  const times = slotTimes();
  if (input.date < appraisalRules.periodStart || input.date > appraisalRules.periodEnd) problems.date = "Tanggal di luar periode appraisal (28 Okt–20 Nov 2026).";
  else if (!isWorkday(input.date)) problems.date = "Ruang hanya bisa dipesan Senin–Jumat.";
  if (!times.includes(input.start) || input.start === appraisalRules.close) problems.start = "Jam mulai 09.00–17.30, setiap 30 menit.";
  if (!times.includes(input.end) || input.end === appraisalRules.open) problems.end = "Jam selesai 09.30–18.00, setiap 30 menit.";
  const minutes = toMinutes(input.end) - toMinutes(input.start);
  if (!problems.start && !problems.end) {
    if (minutes <= 0) problems.end = "Jam selesai harus setelah jam mulai.";
    else if (minutes > appraisalRules.maxMinutes) problems.end = "Paling lama 4 jam.";
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
