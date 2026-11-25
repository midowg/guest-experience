import { z } from "zod";
import { REPORT_REASONS } from "../types";
import { isReactionEmoji } from "./reactions";
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

/** ?lihat=: Semua (default) or Fotoku (gallery only). There is no Kelompokku any more: every photo is for everyone. */
export function parseView(raw: string | string[] | undefined | null, allowSaya = true): FeedView {
  const value = one(raw);
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
 * The cursor of a list: which list (b = "baru", the stack: the photos not seen yet; r = the same, with the last
 * photo being the person's own unseen one, which leads the stack; s = all of a view) and the last photo shown, by its (visible_at,
 * id) exactly as the database wrote it (microseconds kept, so no photo is skipped or repeated). "b~" alone
 * asks for the first page of the stack.
 */
export type FeedMode = "baru" | "semua";
export type Cursor = { mode: FeedMode; at: string | null; id: string | null; /** The last photo is the person's own unseen one (it leads the stack). */ rest: boolean };
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})$/;

export function encodeCursor(mode: FeedMode, at: string | null, id: string | null, rest = false): string {
  const tag = mode === "baru" ? (rest ? "r" : "b") : "s";
  return at && id ? `${tag}~${at}~${id}` : `${tag}~`;
}

export function decodeCursor(raw: string | string[] | undefined | null): Cursor | null {
  const value = one(raw);
  if (!value || value.length > 120) return null;
  const [tag, at, id] = value.split("~");
  if (tag !== "b" && tag !== "r" && tag !== "s") return null;
  const mode: FeedMode = tag === "s" ? "semua" : "baru";
  const rest = tag === "r";
  if (!at && !id) return rest ? null : { mode, at: null, id: null, rest };
  if (!at || !ISO.test(at) || !isUuid(id)) return null;
  return { mode, at, id: id.toLowerCase(), rest };
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

/** Where the photo was taken, only when the person switched "Tandai lokasi" on: the server uses it to match missions, never shows it. */
export const photoGeoSchema = z.object({
  latitude: z.number("Lokasi belum terbaca.").min(-90).max(90),
  longitude: z.number("Lokasi belum terbaca.").min(-180).max(180),
  accuracy: z.number("Lokasi belum terbaca.").min(0).max(100_000),
}).strict();
export type PhotoGeo = z.infer<typeof photoGeoSchema>;
const size = (max: number) => z.number().int().min(1, "Berkas kosong.").max(max, "Foto terlalu besar. Ambil ulang fotonya.");
export const photoStartSchema = z.object({
  clientId: z.string().regex(UUID, "Foto tidak dikenali. Ambil ulang fotonya."),
  sessionId: z.string().regex(UUID).nullable(),
  takenAt: z.string().regex(ISO).refine(value => Number.isFinite(Date.parse(value)), "Waktu foto tidak dikenali."),
  width: z.number().int().min(1).max(4000),
  height: z.number().int().min(1).max(4000),
  size: size(MAX_LARGE_BYTES),
  thumbSize: size(MAX_THUMB_BYTES),
  tileSize: size(MAX_TILE_BYTES),
  /** Optional: the people in the photo (employee ids), chosen in "Periksa fotomu". No limit on how many (KONTRAK §40); the server keeps each person once. */
  tags: z.array(z.string().regex(UUID, "Orang yang ditandai tidak dikenali.")).default([]),
  /** Optional: the coarse position, kept only for matching missions. */
  geo: photoGeoSchema.nullable().default(null),
  /** Picked from the gallery (not the camera): never a "foto langsung", and no position is kept. */
  gallery: z.boolean().default(false),
});
/** What the phone sends (tags, geo and gallery may be left out: the schema fills them in). */
export type PhotoStart = z.input<typeof photoStartSchema>;
export const photoConfirmSchema = photoStartSchema.extend({
  token: z.string().regex(/^\d{10,13}\.[0-9a-f]{64}$/, "Unggahan tidak dikenali. Ulangi dari awal."),
});
export type PhotoConfirm = z.input<typeof photoConfirmSchema>;

/** DELETE photo: `clientId` lets the sender clean up an upload that was cancelled before it was kept. */
export const photoDeleteSchema = z.object({ clientId: z.string().regex(UUID).optional() });
/** PUT reaction: the emoji, only from the app's list (reactions.ts). */
export const reactionSchema = z.object({ emoji: z.string().refine(isReactionEmoji, "Reaksi ini belum tersedia.") });
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
