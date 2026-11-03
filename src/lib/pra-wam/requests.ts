import { z } from "zod";
import { clockLabel, dayLabel, wibDate, wibTime } from "./appraisal";

/*
 * A participant asks panitia to move a published session. The request keeps where the session
 * was when asked; approving only moves it if it is still there.
 */

export type RequestStatus = "diajukan" | "disetujui" | "ditolak" | "ditarik";
export const requestStatusLabels: Record<RequestStatus, string> = { diajukan: "Menunggu panitia", disetujui: "Disetujui", ditolak: "Ditolak", ditarik: "Ditarik" };

export type ScheduleRequest = {
  id: string; sessionId: string; sessionTitle: string; requester: string; requesterId: string;
  fromStartsAt: string; fromEndsAt: string; toStartsAt: string; toEndsAt: string; toRoomId: string | null; toRoomName: string | null;
  reason: string; status: RequestStatus; reviewNote: string; reviewedAt: string | null; createdAt: string;
  /** False once the session has moved since the request: approving it would undo someone else's change. */
  stillCurrent: boolean;
};

const TIME = /^([01]\d|2[0-3]):[03]0$/;
export const requestInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pilih tanggal."),
  start: z.string().regex(TIME, "Pilih jam mulai."),
  end: z.string().regex(TIME, "Pilih jam selesai."),
  roomId: z.union([z.literal(""), z.uuid()]).default(""),
  reason: z.string().trim().min(5, "Tulis alasan singkat (minimal 5 huruf).").max(1000),
}).refine(input => input.end > input.start, { path: ["end"], message: "Jam selesai harus setelah jam mulai." });
export type RequestInput = z.infer<typeof requestInputSchema>;

export const reviewSchema = z.object({ approve: z.boolean(), note: z.string().trim().max(1000).default("") });

/** "Rabu, 13 Nov · 10.00–12.00" */
export const spanLabel = (startsAt: string, endsAt: string) => `${dayLabel(wibDate(startsAt))} · ${clockLabel(wibTime(startsAt))}–${clockLabel(wibTime(endsAt))}`;
