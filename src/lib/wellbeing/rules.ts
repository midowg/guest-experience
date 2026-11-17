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

/* ---------- Kontrol aplikasi karyawan (17 Nov 2026, migration 202611170002) ---------- */

export const MIGRATION_WELLBEING_APP = "202611170002_wellbeing_time_app.sql";

/**
 * What Admin Wellbeing → Pengaturan → Aplikasi karyawan sets for the employee app. Only what an admin
 * really needs to steer the programme: an announcement on Beranda, this month's prize (shown with the
 * race), reading proof photos on the phone (off if it misbehaves on some phones), and pausing Catat
 * with a message (during a data move or a fix). Rules (backdate, caps) stay in Aturan pencatatan.
 */
export const appControlsSchema = z.object({
  announcement: z.object({
    on: z.boolean(),
    title: z.string().trim().max(80, "Judul paling banyak 80 karakter."),
    message: z.string().trim().max(300, "Isi paling banyak 300 karakter."),
    /** The last day it shows (WIB), or null for until it is turned off. */
    until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid.").nullable(),
  }),
  prize: z.string().trim().max(160, "Hadiah paling banyak 160 karakter."),
  photoReading: z.boolean(),
  logging: z.object({ paused: z.boolean(), message: z.string().trim().max(200, "Pesan paling banyak 200 karakter.") }),
}).superRefine((value, ctx) => {
  if (value.announcement.on && !value.announcement.title && !value.announcement.message) ctx.addIssue({ code: "custom", path: ["announcement", "title"], message: "Isi judul atau isi pengumuman." });
});
export type AppControls = z.infer<typeof appControlsSchema>;
export const defaultAppControls: AppControls = { announcement: { on: false, title: "", message: "", until: null }, prize: "", photoReading: true, logging: { paused: false, message: "" } };

/** The stored value (any shape, from an older version or none) as complete controls: what is not valid falls back to the default. */
export function appControlsOf(raw: unknown): AppControls {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const part = <T,>(schema: z.ZodType<T>, input: unknown, fallback: T): T => { const parsed = schema.safeParse(input); return parsed.success ? parsed.data : fallback; };
  return {
    announcement: part(z.object({ on: z.boolean(), title: z.string().max(80), message: z.string().max(300), until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }), value.announcement, defaultAppControls.announcement),
    prize: part(z.string().max(160), value.prize, ""),
    photoReading: part(z.boolean(), value.photoReading, true),
    logging: part(z.object({ paused: z.boolean(), message: z.string().max(200) }), value.logging, defaultAppControls.logging),
  };
}

/** What the employee app shows: the announcement only while on and not past its day. */
export function controlsForApp(controls: AppControls, today: string): { announcement: { title: string; message: string } | null; prize: string | null; photoReading: boolean; pausedMessage: string | null } {
  const { announcement } = controls;
  const showing = announcement.on && (announcement.title || announcement.message) && (!announcement.until || announcement.until >= today);
  return {
    announcement: showing ? { title: announcement.title, message: announcement.message } : null,
    prize: controls.prize.trim() || null,
    photoReading: controls.photoReading,
    pausedMessage: controls.logging.paused ? controls.logging.message.trim() || "Pencatatan sedang dijeda admin. Coba lagi nanti." : null,
  };
}

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
  if (!DAY.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return "Tanggal tidak valid.";
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

/**
 * Who is around me on a ranked list (18 Nov 2026), for "Di sekitarmu" and "Kejar #n" on Beranda:
 * up to two above and two below (five in all; more of one side at either end), and the nearest
 * person with more points than me (the one to catch; ties share my place, so they do not count).
 */
export function aroundMe<T extends { points: number; me: boolean }>(rows: readonly T[]): { near: T[]; ahead: T | null } {
  const at = rows.findIndex(row => row.me);
  if (at < 0) return { near: [], ahead: null };
  const start = Math.max(0, Math.min(at - 2, rows.length - 5));
  let ahead: T | null = null;
  for (let index = at - 1; index >= 0 && !ahead; index--) if (rows[index].points > rows[at].points) ahead = rows[index];
  return { near: rows.slice(start, start + 5), ahead };
}

/*
 * The employee app (/wellbeing, 17 Nov 2026): proof photos and the "Catat" form. The server checks
 * the same rules again with the programme's settings (logValues) and the employee's own history.
 */

/** The most proof photos one activity may carry (the database allows 5). */
export const MAX_PHOTOS = 5;
/** One proof photo: a phone photo or screenshot, at most 8 MB. */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
// No HEIC (17 Nov 2026): browsers other than Safari cannot show it in Periksa; with these types a phone sends JPEG.
export const PHOTO_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
/** A proof that is a short video (a few from the old app, moved with scripts/wellbeing-storage.mjs): shown with a player, not as a picture. */
export const isVideoProof = (url: string) => /\.(mp4|mov|webm)(?:$|[?#])/i.test(url);
export type PhotoMime = (typeof PHOTO_MIMES)[number];
/** Fewer steps than this is not a day's walk worth logging. */
export const MIN_STEPS = 100;

export const uploadStartSchema = z.object({
  mime: z.enum(PHOTO_MIMES, { message: "Foto harus JPG, PNG, atau WebP." }),
  size: z.number().int().min(1, "Berkas kosong.").max(MAX_PHOTO_BYTES, "Foto lebih dari 8 MB."),
});
export type UploadStartInput = z.infer<typeof uploadStartSchema>;

const unknownUpload = "Unggahan tidak dikenali. Unggah ulang fotonya.";
const uploadedPhotoSchema = uploadStartSchema.extend({
  key: z.string().max(200, unknownUpload),
  token: z.string().regex(/^\d{10,13}\.[0-9a-f]{64}$/, unknownUpload),
});

export const logSchema = z.object({
  code: z.string().trim().regex(/^[a-z]+\.[a-z0-9_]{2,60}$/, "Pilih kegiatannya."),
  date: z.string().regex(DAY, "Tanggal tidak valid."),
  /** The time of day (WIB), optional (17 Nov 2026). */
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Jam tidak valid.").nullish(),
  steps: z.number().int("Jumlah langkah harus bilangan bulat.").min(0).max(200000, "Jumlah langkah terlalu besar.").nullish(),
  kcal: z.number().min(0).max(20000, "Kalori terlalu besar.").nullish(),
  minutes: z.number().int("Durasi dalam menit, bilangan bulat.").min(1, "Durasi minimal 1 menit.").max(1440, "Durasi paling lama 1440 menit (sehari).").nullish(),
  note: z.string().trim().max(500, "Catatan paling banyak 500 karakter.").default(""),
  photos: z.array(uploadedPhotoSchema).min(1, "Lampirkan minimal satu foto bukti.").max(MAX_PHOTOS, `Paling banyak ${MAX_PHOTOS} foto.`),
  force: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if (new Set(value.photos.map(photo => photo.key)).size !== value.photos.length) ctx.addIssue({ code: "custom", path: ["photos"], message: "Ada foto yang terkirim dua kali." });
});
export type LogInput = z.infer<typeof logSchema>;

const count = (value: number) => value.toLocaleString("id-ID");

/**
 * What a log stores for its type's points mode, or the field errors: steps for a steps type
 * (MIN_STEPS to maxSteps), kcal for a kcal type (1 to maxKcal, rounded; minutes optional), nothing
 * for a fixed type (anything else sent is dropped).
 */
export function logValues(mode: PointsMode, input: Pick<LogInput, "steps" | "kcal" | "minutes">, settings: Pick<WellbeingSettings, "maxKcal" | "maxSteps">):
  { ok: true; steps: number | null; kcal: number | null; minutes: number | null } | { ok: false; fieldErrors: Record<string, string[]> } {
  if (mode === "fixed") return { ok: true, steps: null, kcal: null, minutes: null };
  if (mode === "steps") {
    const steps = input.steps ?? null;
    const problem = steps === null ? "Isi jumlah langkahnya." : steps < MIN_STEPS ? `Langkah minimal ${count(MIN_STEPS)}.` : steps > settings.maxSteps ? `Paling banyak ${count(settings.maxSteps)} langkah sehari.` : null;
    return problem ? { ok: false, fieldErrors: { steps: [problem] } } : { ok: true, steps, kcal: null, minutes: null };
  }
  const kcal = input.kcal === null || input.kcal === undefined ? null : Math.round(input.kcal);
  const problem = kcal === null ? "Isi kalori yang terbakar." : kcal < 1 ? "Kalori minimal 1." : kcal > settings.maxKcal ? `Paling banyak ${count(settings.maxKcal)} kkal untuk satu olahraga.` : null;
  return problem ? { ok: false, fieldErrors: { kcal: [problem] } } : { ok: true, steps: null, kcal, minutes: input.minutes ?? null };
}

/* ---------- Hadiah (18 Nov 2026, migration 202611180001) ---------- */

export const MIGRATION_WELLBEING_REWARDS = "202611180001_wellbeing_rewards.sql";
export const MAX_REWARD_PHOTOS = 6;

/**
 * A claim's life: requested (points held, waiting for the admin), approved, delivered (handed over), or
 * rejected (with a reason) / cancelled (by the employee while it waits): the last two give the points back.
 */
export const CLAIM_STATUSES = ["requested", "approved", "delivered", "rejected", "cancelled"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
export const claimStatusLabels: Record<ClaimStatus, string> = {
  requested: "Diajukan", approved: "Disetujui", delivered: "Diserahkan", rejected: "Ditolak", cancelled: "Dibatalkan",
};
/** The claims that hold points (and count against the stock and the per-person limit). */
export const claimHolds = (status: ClaimStatus) => status === "requested" || status === "approved" || status === "delivered";

/** The saldo: every point that counts (the board's total), minus what open and handed-over claims hold. */
export function saldoOf(earned: number, claims: readonly { status: ClaimStatus; cost: number }[]) {
  const held = claims.filter(claim => claimHolds(claim.status)).reduce((sum, claim) => sum + claim.cost, 0);
  return { earned, held, available: earned - held };
}

export type RewardState = "available" | "short" | "sold_out" | "limit";
/** What a reward is for this person now (the server checks it again, in one transaction, on a claim). */
export function rewardState(input: { cost: number; stock: number | null; taken: number; perPerson: number; mine: number; available: number }): RewardState {
  if (input.mine >= input.perPerson) return "limit";
  if (input.stock !== null && input.taken >= input.stock) return "sold_out";
  return input.available >= input.cost ? "available" : "short";
}

/** An admin's next steps for a claim: approve or reject a request, hand over a request or an approved one. */
export const CLAIM_ACTIONS = ["approve", "deliver", "reject"] as const;
export type ClaimAction = (typeof CLAIM_ACTIONS)[number];
export const claimActionFrom: Record<ClaimAction, ClaimStatus[]> = { approve: ["requested"], deliver: ["requested", "approved"], reject: ["requested", "approved"] };
export const claimActionTo: Record<ClaimAction, ClaimStatus> = { approve: "approved", deliver: "delivered", reject: "rejected" };

const rewardPhotoSchema = z.object({
  key: z.string().min(1).max(500),
  /** Only for a photo uploaded just now (its upload is checked); kept photos have none. */
  upload: uploadStartSchema.extend({ token: z.string().regex(/^\d{10,13}\.[0-9a-f]{64}$/, "Unggahan tidak dikenali. Unggah ulang fotonya.") }).optional(),
});
export const rewardInputSchema = z.object({
  title: z.string().trim().min(2, "Isi nama hadiah.").max(120, "Nama hadiah paling banyak 120 karakter."),
  description: z.string().trim().max(2000, "Keterangan paling banyak 2.000 karakter.").default(""),
  photos: z.array(rewardPhotoSchema).max(MAX_REWARD_PHOTOS, `Paling banyak ${MAX_REWARD_PHOTOS} foto.`).default([]),
  cost: z.number().int("Harga dalam poin, bilangan bulat.").min(1, "Harga minimal 1 poin.").max(10_000_000, "Harga terlalu besar."),
  stock: z.number().int().min(0, "Stok tidak boleh minus.").max(100_000, "Stok terlalu besar.").nullable(),
  perPerson: z.number().int().min(1, "Batas per orang minimal 1.").max(100, "Batas per orang paling banyak 100."),
  active: z.boolean(),
}).superRefine((value, ctx) => {
  if (new Set(value.photos.map(photo => photo.key)).size !== value.photos.length) ctx.addIssue({ code: "custom", path: ["photos"], message: "Ada foto yang terpasang dua kali." });
});
export type RewardInput = z.infer<typeof rewardInputSchema>;

export const claimRequestSchema = z.object({
  rewardId: z.string().uuid("Hadiah tidak dikenali."),
  note: z.string().trim().max(300, "Catatan paling banyak 300 karakter.").default(""),
});
export type ClaimRequestInput = z.infer<typeof claimRequestSchema>;

export const claimDecisionSchema = z.object({
  action: z.enum(CLAIM_ACTIONS),
  reason: z.string().trim().max(300, "Alasan paling banyak 300 karakter.").default(""),
}).superRefine((value, ctx) => {
  if (value.action === "reject" && value.reason.length < 2) ctx.addIssue({ code: "custom", path: ["reason"], message: "Tulis alasan penolakan (dibaca karyawan)." });
});
export type ClaimDecisionInput = z.infer<typeof claimDecisionSchema>;
