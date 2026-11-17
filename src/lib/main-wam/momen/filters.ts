import { z } from "zod";
import { PHOTO_AUDIENCES, REPORT_REASONS } from "../types";
import { UMUM, type FeedView, type SessionFilter } from "./types";

/*
 * Momen's addresses and inputs: the filters of the stack and the gallery (lihat, sesi, foto), the
 * paging cursor, and the zod schemas every Momen API validates with. Pure; shared by the pages, the
 * APIs and the tests.
 */

/** Area B's migration (tile key, feed, counts, reports, Mozaik placement). */
export const MOMEN_AREA_MIGRATION = "202611200201_main_wam_momen_area.sql";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const one = (value: string | string[] | undefined | null) => (Array.isArray(value) ? value[0] : value) ?? undefined;

/** ?lihat=: Semua (default), Kelompokku, Fotoku (gallery only). */
export function parseView(raw: string | string[] | undefined | null, allowSaya = true): FeedView {
  const value = one(raw);
  if (value === "kelompok") return "kelompok";
  if (value === "saya" && allowSaya) return "saya";
  return "semua";
}

/** ?sesi=: one session (uuid), "umum", or every session. */
export function parseSession(raw: string | string[] | undefined | null): SessionFilter {
  const value = one(raw);
  if (value === UMUM) return UMUM;
  return isUuid(value) ? value.toLowerCase() : null;
}

/** ?foto=: the photo a stack opens at (from the gallery or the Mozaik). */
export function parsePhotoId(raw: string | string[] | undefined | null): string | null {
  const value = one(raw);
  return isUuid(value) ? value.toLowerCase() : null;
}

/*
 * The cursor of a list: which list (b = "baru", the stack's unseen photos; s = all of a view) and the
 * last photo shown, by its (visible_at, id) exactly as the database wrote it (microseconds kept, so
 * no photo is skipped or repeated). "b~" alone asks for the first page of the unseen photos.
 */
export type FeedMode = "baru" | "semua";
export type Cursor = { mode: FeedMode; at: string | null; id: string | null };
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})$/;

export function encodeCursor(mode: FeedMode, at: string | null, id: string | null): string {
  const tag = mode === "baru" ? "b" : "s";
  return at && id ? `${tag}~${at}~${id}` : `${tag}~`;
}

export function decodeCursor(raw: string | string[] | undefined | null): Cursor | null {
  const value = one(raw);
  if (!value || value.length > 120) return null;
  const [tag, at, id] = value.split("~");
  if (tag !== "b" && tag !== "s") return null;
  const mode: FeedMode = tag === "b" ? "baru" : "semua";
  if (!at && !id) return { mode, at: null, id: null };
  if (!at || !ISO.test(at) || !isUuid(id)) return null;
  return { mode, at, id: id.toLowerCase() };
}

/** The feed's page size: a stack prefetches when 5 cards are left; a gallery fills a few screens. */
export const STACK_PAGE = 20;
export const GALLERY_PAGE = 30;

/* ── Upload ───────────────────────────────────────────────────────────────────────────────────── */

/** The large photo: at most 1 MB on the server (the app makes it ≤ 500 KB); the small copies. */
export const MAX_LARGE_BYTES = 1024 * 1024;
export const MAX_THUMB_BYTES = 200 * 1024;
export const MAX_TILE_BYTES = 60 * 1024;
/** How many photos one person may send: per 10 minutes and per day (RISET §11). */
export const PHOTOS_PER_10_MINUTES = 30;
export const PHOTOS_PER_DAY = 200;
/** How many reports one person may send per 10 minutes (RISET §8: an attack is not a report). */
export const REPORTS_PER_10_MINUTES = 10;
/** Different reporters that hide a photo for everyone until panitia decide (task: ≥ 3). */
export const REPORT_THRESHOLD = 3;
/** U04: at most 10 photos from the gallery at once. */
export const GALLERY_PICK_MAX = 10;

const size = (max: number) => z.number().int().min(1, "Berkas kosong.").max(max, "Foto terlalu besar. Ambil ulang fotonya.");
export const photoStartSchema = z.object({
  clientId: z.string().regex(UUID, "Foto tidak dikenali. Ambil ulang fotonya."),
  audience: z.enum(PHOTO_AUDIENCES),
  sessionId: z.string().regex(UUID).nullable(),
  takenAt: z.string().regex(ISO).refine(value => Number.isFinite(Date.parse(value)), "Waktu foto tidak dikenali."),
  width: z.number().int().min(1).max(4000),
  height: z.number().int().min(1).max(4000),
  size: size(MAX_LARGE_BYTES),
  thumbSize: size(MAX_THUMB_BYTES),
  tileSize: size(MAX_TILE_BYTES),
});
export type PhotoStart = z.infer<typeof photoStartSchema>;
export const photoConfirmSchema = photoStartSchema.extend({
  token: z.string().regex(/^\d{10,13}\.[0-9a-f]{64}$/, "Unggahan tidak dikenali. Ulangi dari awal."),
});
export type PhotoConfirm = z.infer<typeof photoConfirmSchema>;

/** DELETE photo: `clientId` lets the sender clean up an upload that was cancelled before it was kept. */
export const photoDeleteSchema = z.object({ clientId: z.string().regex(UUID).optional() });
export const photosSeenSchema = z.object({ ids: z.array(z.string().regex(UUID)).min(1).max(100) });
export const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS, "Pilih satu alasan."),
  note: z.string().trim().max(300, "Catatan paling panjang 300 huruf.").default(""),
}).refine(input => input.reason !== "lainnya" || input.note.length > 0, { path: ["note"], message: "Tulis catatan untuk alasan Lainnya." });
export type ReportInput = z.infer<typeof reportSchema>;

/** A taken-at time the server keeps: the phone's, unless it is far off (a wrong clock). */
export function keptTakenAt(given: string, now = new Date()): string {
  const at = Date.parse(given);
  if (!Number.isFinite(at)) return now.toISOString();
  const week = 7 * 24 * 60 * 60_000;
  return at > now.getTime() + 5 * 60_000 || at < now.getTime() - week ? now.toISOString() : new Date(at).toISOString();
}

/** Re-exported for callers that take the filters from here (feed, sheets). */
export { UMUM };
