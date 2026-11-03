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
};

/** What uses a room on a day: an appraisal booking or another session. */
export type RoomUse = { roomId: string; startsAt: string; endsAt: string; source: "booking" | "sesi"; sourceId: string; label: string };

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
