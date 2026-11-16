import { z } from "zod";

/*
 * Wellbeing (16 Nov 2026): the office wellbeing programme, rebuilt inside Journey from the old
 * welbeing.netlify.app (docs/rancangan-wellbeing.md). Employees log activities per dimension and earn
 * points; admins check what came in afterwards (Periksa) and give points to many people at once.
 * Pure: the rules here are shared by the API, the screens and the tests.
 */

export const MIGRATION_WELLBEING = "202611160050_wellbeing.sql";

export const DIMENSIONS = ["physical", "emotional", "social", "financial", "spiritual"] as const;
export type DimensionId = (typeof DIMENSIONS)[number];
export const dimensionLabels: Record<DimensionId, string> = {
  physical: "Fisik", emotional: "Emosional", social: "Sosial", financial: "Finansial", spiritual: "Spiritual",
};

/** How an activity type earns points: a fixed number, steps / 10, or 1 point per kcal. */
export const POINTS_MODES = ["fixed", "steps", "kcal"] as const;
export type PointsMode = (typeof POINTS_MODES)[number];
/** How often a type may be logged: no limit, once a day, or once a month. */
export const LIMITS = ["day", "month"] as const;
export type Limit = (typeof LIMITS)[number];

export type WellbeingSettings = {
  /** How many days back an activity may be dated (today counts as 0). */
  backdateDays: number;
  /** The most kcal one sport activity may claim. */
  maxKcal: number;
  /** The most steps one day may claim. */
  maxSteps: number;
  /** The first day of the programme (points before it are history, still counted). */
  programStart: string;
};
export const defaultSettings: WellbeingSettings = { backdateDays: 7, maxKcal: 3000, maxSteps: 60000, programStart: "2026-05-22" };

export const settingsSchema = z.object({
  backdateDays: z.number().int().min(0).max(60),
  maxKcal: z.number().int().min(100).max(20000),
  maxSteps: z.number().int().min(1000).max(200000),
});

/** Steps become points at 10 steps a point (as in the old app). */
export const STEPS_PER_POINT = 10;

/** The points an activity claims, from its type and what was entered; never negative. */
export function claimedPoints(mode: PointsMode, fixedPoints: number, input: { steps?: number | null; kcal?: number | null }, settings: Pick<WellbeingSettings, "maxKcal" | "maxSteps">): number {
  if (mode === "fixed") return Math.max(0, Math.round(fixedPoints));
  if (mode === "steps") return Math.floor(Math.min(Math.max(0, input.steps ?? 0), settings.maxSteps) / STEPS_PER_POINT);
  return Math.min(Math.max(0, Math.round(input.kcal ?? 0)), settings.maxKcal);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const shift = (date: string, days: number) => {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
};
export const addDays = shift;
/** Today in WIB (Asia/Jakarta), as YYYY-MM-DD. */
export const wibToday = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
/** The first and last day of the month that `date` is in. */
export function monthRange(date: string): { from: string; to: string } {
  const from = `${date.slice(0, 7)}-01`;
  const next = new Date(`${from}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { from, to: shift(next.toISOString().slice(0, 10), -1) };
}
/** The month before the one `date` is in. */
export const previousMonth = (date: string) => monthRange(shift(`${date.slice(0, 7)}-01`, -1));

/** Why an activity date is refused, or null when it may be logged today. */
export function dateProblem(date: string, today: string, backdateDays: number): string | null {
  if (!DAY.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return "Tanggal tidak valid.";
  if (date > today) return "Tanggal tidak boleh setelah hari ini.";
  if (date < shift(today, -backdateDays)) return backdateDays === 0 ? "Hanya bisa mencatat untuk hari ini." : `Paling lama ${backdateDays} hari ke belakang.`;
  return null;
}

/** Whether a type with this limit was already logged in the same day/month as `date`. */
export function limitReached(limit: Limit | null, date: string, loggedDates: readonly string[]): boolean {
  if (!limit) return false;
  return loggedDates.some(logged => limit === "day" ? logged === date : logged.slice(0, 7) === date.slice(0, 7));
}

/*
 * Periksa: every activity counts the moment it is logged; an admin looks afterwards. "Oke" marks it
 * checked, "Ubah poin" sets other points, "Tolak" counts nothing. A rejected or changed activity
 * needs a reason the employee will read. Undo sends the previous state back.
 */
export const REVIEW_STATUSES = ["approved", "adjusted", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const reviewSchema = z.object({
  status: z.enum(REVIEW_STATUSES),
  points: z.number().int().min(0).max(100000),
  reason: z.string().trim().max(300).nullable().default(null),
  checked: z.boolean(),
}).superRefine((value, ctx) => {
  if (value.status !== "approved" && !value.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "Tulis alasannya; karyawan akan membacanya." });
});
export type ReviewInput = z.infer<typeof reviewSchema>;

/** Ready-made reasons for Tolak, so checking stays quick. */
export const rejectReasons = [
  "Foto bukti tidak jelas.",
  "Foto bukan kegiatan ini.",
  "Sudah tercatat (dobel).",
  "Sudah masuk dari Strava.",
  "Tanggal tidak sesuai bukti.",
] as const;

/** The points an activity counts with its review state. */
export const countedPoints = (status: ReviewStatus, points: number) => status === "rejected" ? 0 : points;

/** Tambah poin ke banyak orang (e.g. everyone who came to an office event), or take points back. */
export const pointBatchSchema = z.object({
  employeeIds: z.array(z.uuid()).min(1, "Pilih minimal satu orang.").max(500),
  points: z.number().int().min(-100000).max(100000).refine(value => value !== 0, "Poin tidak boleh 0."),
  reason: z.string().trim().min(2, "Tulis alasannya, mis. nama acara.").max(200),
  dimension: z.enum(DIMENSIONS).nullable().default(null),
  date: z.string().regex(DAY, "Tanggal tidak valid."),
});
export type PointBatchInput = z.infer<typeof pointBatchSchema>;

export const catalogItemSchema = z.object({
  name: z.string().trim().min(2).max(200),
  dimension: z.enum(DIMENSIONS),
  kind: z.enum(["daily", "sport"]),
  mode: z.enum(POINTS_MODES),
  points: z.number().int().min(0).max(10000),
  limit: z.enum(LIMITS).nullable(),
  proofHint: z.string().trim().max(200).default(""),
  active: z.boolean(),
});
export type CatalogItemInput = z.infer<typeof catalogItemSchema>;

/** Ranks with ties sharing a place (1, 2, 2, 4), highest first. */
export function rank<T extends { points: number }>(rows: readonly T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.points - a.points);
  let last = Number.NaN, place = 0;
  return sorted.map((row, index) => {
    if (row.points !== last) { place = index + 1; last = row.points; }
    return { ...row, rank: place };
  });
}
