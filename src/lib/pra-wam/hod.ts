import { z } from "zod";

/*
 * Meeting HOD (6 Nov 2026): a HOD books a room "sebagai HOD" in Book ruang and picks departments
 * instead of people; the room is booked at once and the HODs of those departments are invited.
 * Each answers Terima or Tolak on their notification or the booking's detail; the meeting is
 * scheduled once everyone accepts and declined as soon as one declines. Shared by server and pages.
 */

export type HodResponse = "menunggu" | "terima" | "tolak";
export type HodMeetingStatus = "menunggu" | "terjadwal" | "ditolak" | "batal";
export type HodPerson = { id: string; name: string; unit: string };
export type HodInvite = HodPerson & { response: HodResponse; note: string; respondedAt: string | null };
/** A department (by name, from Data karyawan) and the HODs who answer for it: whoever Admin WAM ticked as HOD there, and its leads. */
export type HodDepartment = { id: string; name: string; heads: { id: string; name: string }[] };

export const hodAnswerSchema = z.object({ accept: z.boolean(), note: z.string().trim().max(300).default("") });

/** A booking made "sebagai HOD" (6 Nov 2026): its meeting, whether all answered, and each HOD's answer. */
export type HodBookingInfo = { meetingId: string; status: HodMeetingStatus; invites: HodInvite[]; requesterId: string };
/** The departments picked when booking as HOD, sent with the booking. */
export const hodUnitsSchema = z.object({ hodUnits: z.array(z.string().trim().min(1).max(160)).max(40).default([]) });

/** The meeting's status from its answers: declined once one declines, scheduled once all accept. */
export function statusFromAnswers(responses: readonly HodResponse[]): Exclude<HodMeetingStatus, "batal"> {
  if (responses.includes("tolak")) return "ditolak";
  return responses.length > 0 && responses.every(response => response === "terima") ? "terjadwal" : "menunggu";
}

export const hodStatusLabels: Record<HodMeetingStatus, string> = { menunggu: "Menunggu jawaban", terjadwal: "Terjadwal", ditolak: "Ditolak", batal: "Dibatalkan" };
export const hodResponseLabels: Record<HodResponse, string> = { menunggu: "Belum menjawab", terima: "Menerima", tolak: "Menolak" };
