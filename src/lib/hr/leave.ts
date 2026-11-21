import { z } from "zod";

/*
 * Cuti, sakit, izin and dinas in WG People (decided 21 Nov 2026, migration 202611280001):
 * - The employee asks for a span of days (one day up to 61) with a short note; Admin HR approves or
 *   refuses. A waiting one can be withdrawn by its owner.
 * - Everyone sees the team's waiting and approved ones (who, which kind, which days, and whether it
 *   is approved yet) in WG People → Tim, as a calendar or a list. The note stays with the owner and
 *   Admin HR (a reason for sakit is health data).
 * - Admin HR's tables colour those days (approved in full, waiting as waiting).
 * Pure, so it is tested without a server.
 */

export const LEAVE_MIGRATION = "202611280001_hr_cuti.sql";
export const LEAVE_TYPES = ["cuti", "sakit", "izin", "dinas"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];
export const leaveLabels: Record<LeaveType, string> = { cuti: "Cuti", sakit: "Sakit", izin: "Izin", dinas: "Dinas" };
/** One line under each kind, in the form. */
export const leaveHints: Record<LeaveType, string> = {
  cuti: "Cuti tahunan atau cuti lain yang sudah dibicarakan.",
  sakit: "Surat dokter, bila ada, serahkan ke HR.",
  izin: "Keperluan pribadi, setengah hari atau lebih.",
  dinas: "Tugas kantor di luar kota atau di tempat klien.",
};
export const LEAVE_STATUSES = ["menunggu", "disetujui", "ditolak", "dibatalkan"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];
export const leaveStatusLabels: Record<LeaveStatus, string> = { menunggu: "Menunggu", disetujui: "Disetujui", ditolak: "Ditolak", dibatalkan: "Dibatalkan" };
/** The longest span one request may cover, in days (the database allows end − start ≤ 60). */
export const LEAVE_MAX_DAYS = 61;
/** How far back a request may start (sakit is often told afterwards). */
export const LEAVE_BACK_DAYS = 31;

/** The person's own request (with the note and the decision). */
export type LeaveRequest = {
  id: string; type: LeaveType; startDate: string; endDate: string; note: string; status: LeaveStatus;
  decidedLabel: string | null; decisionNote: string | null; createdAt: string;
};
/** Someone's waiting or approved days, as the team sees them: no note. */
export type TeamLeave = { id: string; employeeId: string; name: string; department: string; type: LeaveType; startDate: string; endDate: string; status: "menunggu" | "disetujui"; mine: boolean };
/** Admin HR → Cuti & izin: a request with whose it is. */
export type AdminLeave = LeaveRequest & { employeeId: string; name: string; department: string };

const DAY_MS = 86_400_000;
const parse = (date: string) => Date.parse(`${date}T00:00:00Z`);
const format = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const shift = (date: string, days: number) => format(parse(date) + days * DAY_MS);
/** How many calendar days a span covers, both ends counted: 24–26 Nov is 3. */
export const leaveDays = (startDate: string, endDate: string) => Math.round((parse(endDate) - parse(startDate)) / DAY_MS) + 1;
/** Every date of a span, in order. */
export const datesOf = (startDate: string, endDate: string) => Array.from({ length: Math.max(0, leaveDays(startDate, endDate)) }, (_, index) => shift(startDate, index));
/** Whether a span covers a date. */
export const covers = (leave: { startDate: string; endDate: string }, date: string) => leave.startDate <= date && date <= leave.endDate;
/** Whether two spans share a day. */
export const overlaps = (a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }) => a.startDate <= b.endDate && b.startDate <= a.endDate;

const short = (date: string, withMonth = true) => new Intl.DateTimeFormat("id-ID", { day: "numeric", ...(withMonth ? { month: "short" } : {}), timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
/** "24 Nov", "24–26 Nov", "30 Nov – 2 Des". */
export function spanLabel(startDate: string, endDate: string): string {
  if (startDate === endDate) return short(startDate);
  if (startDate.slice(0, 7) === endDate.slice(0, 7)) return `${short(startDate, false)}–${short(endDate)}`;
  return `${short(startDate)} – ${short(endDate)}`;
}
/** "Cuti · 24–26 Nov (3 hari)". */
export const leaveSummary = (leave: { type: LeaveType; startDate: string; endDate: string }) =>
  `${leaveLabels[leave.type]} · ${spanLabel(leave.startDate, leave.endDate)} (${leaveDays(leave.startDate, leave.endDate)} hari)`;

/** A real calendar date: 2026-02-30 is refused, not rolled over to March. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak dikenali.").refine(value => !Number.isNaN(parse(value)) && format(parse(value)) === value, "Tanggal tidak dikenali.");
/** A request from the app; `today` is checked on the server (the span, how far back). */
export const leaveSchema = z.object({
  type: z.enum(LEAVE_TYPES, { message: "Pilih jenisnya." }),
  startDate: isoDate,
  endDate: isoDate,
  note: z.string().trim().min(3, "Tulis keterangan singkat (minimal 3 huruf).").max(300, "Keterangan paling banyak 300 karakter."),
}).refine(input => input.endDate >= input.startDate, { message: "Tanggal selesai tidak boleh sebelum tanggal mulai.", path: ["endDate"] })
  .refine(input => leaveDays(input.startDate, input.endDate) <= LEAVE_MAX_DAYS, { message: `Paling lama ${LEAVE_MAX_DAYS} hari dalam satu pengajuan.`, path: ["endDate"] });
export type LeaveInput = z.infer<typeof leaveSchema>;

/** Why a request cannot start on that date, or null: up to 31 days back, up to a year ahead. */
export function leaveDateProblem(startDate: string, today: string): string | null {
  if (startDate < shift(today, -LEAVE_BACK_DAYS)) return `Pengajuan paling jauh ${LEAVE_BACK_DAYS} hari ke belakang.`;
  if (startDate > shift(today, 366)) return "Pengajuan paling jauh setahun ke depan.";
  return null;
}

/** A month as "2026-11": its first and last date, and the month before and after. */
export function monthSpan(month: string): { first: string; last: string; before: string; after: string } {
  const [year, number] = month.split("-").map(Number);
  const first = `${month}-01`;
  const last = format(Date.UTC(year, number, 0));
  const before = format(Date.UTC(year, number - 2, 1)).slice(0, 7);
  const after = format(Date.UTC(year, number, 1)).slice(0, 7);
  return { first, last, before, after };
}
export const isMonth = (value: string | null | undefined): value is string => !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
/** "November 2026". */
export const monthLabel = (month: string) => new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`));
