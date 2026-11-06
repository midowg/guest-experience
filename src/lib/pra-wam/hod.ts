import { z } from "zod";

/*
 * Meeting HOD (6 Nov 2026, migration 202611060001): a HOD asks the HODs of the departments they
 * pick to a meeting. Each invited HOD accepts or declines; the meeting is scheduled once everyone
 * accepts and declined as soon as one declines; the HOD who asked may cancel it. Every HOD sees the
 * list; only the invited take part. Shared by the server and the page.
 */

export type HodResponse = "menunggu" | "terima" | "tolak";
export type HodMeetingStatus = "menunggu" | "terjadwal" | "ditolak" | "batal";
export type HodPerson = { id: string; name: string; unit: string };
export type HodInvite = HodPerson & { response: HodResponse; note: string; respondedAt: string | null };
export type HodMeeting = {
  id: string; title: string; agenda: string; startsAt: string; endsAt: string; place: string;
  status: HodMeetingStatus; requester: HodPerson; invites: HodInvite[]; createdAt: string;
  /** The office room picked, and whether it is booked (once scheduled); false when it could not be. */
  roomId: string | null; roomBooked: boolean;
};
/** A department (by name, from Data karyawan) and the HODs who answer for it: whoever Admin WAM ticked as HOD there, and its leads. */
export type HodDepartment = { id: string; name: string; heads: { id: string; name: string }[] };

const TIME = /^([01]\d|2[0-3]):[03]0$/;
export const hodMeetingSchema = z.object({
  title: z.string().trim().min(2, "Tulis judul meeting (minimal 2 huruf).").max(120),
  agenda: z.string().trim().max(1000).default(""),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pilih tanggal."),
  start: z.string().regex(TIME, "Pilih jam mulai."),
  end: z.string().regex(TIME, "Pilih jam selesai."),
  place: z.string().trim().max(120).default(""),
  /** The office room picked (booked once every HOD accepts); none for a place outside the office. */
  roomId: z.union([z.uuid(), z.literal("")]).default(""),
  /** The departments picked, by name (the department column of Data karyawan). */
  unitIds: z.array(z.string().trim().min(1).max(160)).min(1, "Pilih minimal satu departemen.").max(40),
}).refine(input => input.end > input.start, { message: "Jam selesai harus setelah jam mulai.", path: ["end"] });
export type HodMeetingInput = z.infer<typeof hodMeetingSchema>;

export const hodAnswerSchema = z.object({ accept: z.boolean(), note: z.string().trim().max(300).default("") });

/** The meeting's status from its answers: declined once one declines, scheduled once all accept. */
export function statusFromAnswers(responses: readonly HodResponse[]): Exclude<HodMeetingStatus, "batal"> {
  if (responses.includes("tolak")) return "ditolak";
  return responses.length > 0 && responses.every(response => response === "terima") ? "terjadwal" : "menunggu";
}

export const hodStatusLabels: Record<HodMeetingStatus, string> = { menunggu: "Menunggu jawaban", terjadwal: "Terjadwal", ditolak: "Ditolak", batal: "Dibatalkan" };
export const hodResponseLabels: Record<HodResponse, string> = { menunggu: "Belum menjawab", terima: "Menerima", tolak: "Menolak" };

/** Half hours from 07.00 to 22.00, for the time pickers. */
export const hodTimes = Array.from({ length: 31 }, (_, index) => {
  const minutes = 7 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${minutes % 60 ? "30" : "00"}`;
});

/** Where each meeting goes on the page, for this HOD. */
export function sortMeetings(meetings: readonly HodMeeting[], viewerId: string, now: Date) {
  const past = (meeting: HodMeeting) => new Date(meeting.endsAt) <= now;
  const mine = (meeting: HodMeeting) => meeting.invites.find(invite => invite.id === viewerId);
  const byStart = (a: HodMeeting, b: HodMeeting) => a.startsAt.localeCompare(b.startsAt);
  const toAnswer = meetings.filter(meeting => meeting.status === "menunggu" && !past(meeting) && mine(meeting)?.response === "menunggu").sort(byStart);
  const upcoming = meetings.filter(meeting => !past(meeting) && !toAnswer.includes(meeting) && (meeting.status === "terjadwal" || meeting.status === "menunggu")).sort(byStart);
  const history = meetings.filter(meeting => !toAnswer.includes(meeting) && !upcoming.includes(meeting)).sort((a, b) => byStart(b, a));
  return { toAnswer, upcoming, history };
}
