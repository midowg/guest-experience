import { z } from "zod";
import { clockLabel, dayLabel, wibDate, wibInstant, wibTime, type Person } from "./appraisal";

/*
 * Pra WAM sessions: the calendar's forums and other meetings, made by panitia. A draft may have
 * only the calendar's date range; publishing needs a date and hours. Times are WIB, in half hours
 * from 06.00 to 23.30 (a dinner runs late), unlike appraisal's office hours.
 */

export const sessionKinds = ["forum", "rapat", "acara"] as const;
export type SessionKind = (typeof sessionKinds)[number];
export const sessionKindLabels: Record<SessionKind, string> = { forum: "Forum", rapat: "Rapat", acara: "Acara" };
export type SessionStatus = "draf" | "terbit" | "batal";
export const sessionStatusLabels: Record<SessionStatus, string> = { draf: "Draf", terbit: "Terbit", batal: "Batal" };

export type Session = {
  id: string; title: string; kind: SessionKind; description: string; status: SessionStatus;
  planFrom: string | null; planTo: string | null; startsAt: string | null; endsAt: string | null;
  roomId: string | null; roomName: string | null; location: string;
  participantCount: number; isParticipant: boolean;
  /** Only for panitia, BOD and admin. */
  participants: Person[] | null;
  /**
   * The room booking this session was made from (migration 202611050004), with who booked it.
   * Its time, room and people follow the booking, so it is changed there; null otherwise.
   */
  booking?: { id: string; bookedBy: Person; /** Booked for something outside WAM (13 Nov 2026): no check-in, no MoM. */ outside?: boolean } | null;
  /**
   * Notulen (12 Nov 2026): the session's own choice (follow Admin WAM's rule, always, never), and
   * whether it needs a MoM after that choice and the rule. Absent where a session is made by hand.
   */
  minutesChoice?: "ikut" | "wajib" | "tidak";
  minutesRequired?: boolean;
};

/** What panitia sees when trying to change a booking's session here. */
export const BOOKING_SESSION_LOCKED = "Sesi ini dari booking ruang; ubah lewat booking.";

/** "Dari booking · dipesan Ayu Lestari", the pill on a booking's session; null for other sessions. */
export const bookingSessionLabel = (session: Pick<Session, "booking">) => !session.booking ? null
  : `${session.booking.outside ? "Di luar WAM" : "Dari booking"} · dipesan ${session.booking.bookedBy.name}`;
/** A session from a booking outside WAM (13 Nov 2026): on the schedule, without check-in or MoM. */
export const outsideWam = (session: Partial<Pick<Session, "booking">>) => !!session.booking?.outside;

/**
 * A booking that has its own session is shown once, as that session: the bookings left over once
 * the sessions are listed (Agenda, Beranda, Ringkasan, Linimasa). Only a published session counts,
 * so a booking whose session is somehow not published still shows as a booking.
 */
export function withoutSessionBookings<T extends { id: string }>(bookings: readonly T[], sessions: readonly Pick<Session, "status" | "booking">[]): T[] {
  const held = new Set(sessions.flatMap(session => session.status === "terbit" && session.booking ? [session.booking.id] : []));
  return held.size ? bookings.filter(booking => !held.has(booking.id)) : [...bookings];
}

/** What uses a room on a day: an appraisal booking or another session. */
export type RoomUse = {
  roomId: string; startsAt: string; endsAt: string; source: "booking" | "sesi"; sourceId: string; label: string;
  /** The label's two parts on their own (TV Announcement): the title, and who booked as "SM - Raja" ("" for a panitia session). */
  title?: string; by?: string;
  /** The booker's two parts on their own: the name colleagues call them by, and their department in full. */
  byName?: string; byDept?: string;
};

export function sessionTimes(): string[] {
  const times: string[] = [];
  for (let minutes = 6 * 60; minutes <= 23 * 60 + 30; minutes += 30) times.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  return times;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[03]0$/;
const optional = <T extends z.ZodType>(schema: T) => z.union([z.literal(""), schema]).default("");

export const sessionInputSchema = z.object({
  title: z.string().trim().min(2, "Isi nama sesi.").max(150, "Nama sesi paling panjang 150 karakter."),
  kind: z.enum(sessionKinds),
  description: z.string().trim().max(2000, "Deskripsi paling panjang 2.000 karakter.").default(""),
  date: optional(z.string().regex(DATE, "Tanggal tidak valid.")),
  start: optional(z.string().regex(TIME, "Jam mulai setiap 30 menit.")),
  end: optional(z.string().regex(TIME, "Jam selesai setiap 30 menit.")),
  roomId: z.union([z.literal(""), z.uuid()]).default(""),
  location: z.string().trim().max(200).default(""),
  participants: z.array(z.uuid()).max(500).default([]),
  /** MoM: follow Admin WAM's rule (default), always, or never (migration 202611120001). */
  minutes: z.enum(["ikut", "wajib", "tidak"]).default("ikut"),
});
export type SessionInput = z.infer<typeof sessionInputSchema>;

/** Field problems; `publish` also needs the date and hours. */
export function sessionProblems(input: Pick<SessionInput, "date" | "start" | "end" | "roomId" | "location">, publish: boolean): Record<string, string> {
  const problems: Record<string, string> = {};
  const some = !!(input.date || input.start || input.end);
  if (some || publish) {
    if (!input.date) problems.date = publish ? "Isi tanggal sebelum menerbitkan." : "Isi tanggal, atau kosongkan jam.";
    if (!input.start) problems.start = "Isi jam mulai.";
    if (!input.end) problems.end = "Isi jam selesai.";
    if (input.start && input.end && input.end <= input.start) problems.end = "Jam selesai harus setelah jam mulai.";
  }
  if (input.roomId && !input.date) problems.roomId = "Pilih tanggal dan jam dulu, baru ruang.";
  return problems;
}

export const sessionSpan = (input: Pick<SessionInput, "date" | "start" | "end">) =>
  input.date && input.start && input.end ? { startsAt: wibInstant(input.date, input.start), endsAt: wibInstant(input.date, input.end) } : null;

const shortDate = (date: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/** "Rabu, 4 Nov · 10.00–11.00", or the calendar range while the time is open. */
export function sessionWhen(session: Pick<Session, "startsAt" | "endsAt" | "planFrom" | "planTo">): string {
  if (session.startsAt && session.endsAt) return `${dayLabel(wibDate(session.startsAt))} · ${clockLabel(wibTime(session.startsAt))}–${clockLabel(wibTime(session.endsAt))}`;
  if (session.planFrom) return `${session.planTo && session.planTo !== session.planFrom ? `${shortDate(session.planFrom)} – ${shortDate(session.planTo)}` : shortDate(session.planFrom)} · jam belum ditentukan`;
  return "Tanggal belum ditentukan";
}

/** Where: the office room, the place written by panitia, or not yet known. */
export const sessionWhere = (session: Pick<Session, "roomName" | "location">) => session.roomName ?? (session.location || "Tempat belum ditentukan");
