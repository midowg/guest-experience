import "server-only";
import { MIGRATION_WELLBEING, defaultSettings, type DimensionId, type WellbeingSettings } from "@/lib/wellbeing/rules";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { isR2Configured, presignDownload } from "../r2";
import { createPrivilegedClient } from "../supabase/admin";
import { PHOTO_VIEW_SECONDS, UPLOAD_PREFIX } from "./uploads";

/*
 * What Admin Wellbeing (admin.ts) and the employee app (member.ts) share: telling a missing
 * migration apart from a real database error, the programme settings, the points per person, and
 * proof photos made ready to show.
 */

export type Row = Record<string, unknown>;

/*
 * Paging cursor (17 Nov 2026): "<created_at>~<id>" of the last row shown. Imported rows keep their
 * old times and some share one, so the next page asks for rows before that time, or at that time
 * with a smaller id. Both parts are checked before they go into the filter.
 */
const CURSOR = /^(\d{4}-\d{2}-\d{2}[T ][0-9:.]+(?:Z|[+-]\d{2}(?::?\d{2})?)?)~([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export const cursorOf = (row: { createdAt: string; id: string }) => `${row.createdAt}~${row.id}`;
/** Riwayat's cursor: the day first ("<date>~<created_at>~<id>"), for a list ordered by day, then time, then id. */
export const dayCursorOf = (row: { date: string; createdAt: string; id: string }) => `${row.date}~${row.createdAt}~${row.id}`;
export function afterDayCursor(cursor: string): string {
  const day = /^(\d{4}-\d{2}-\d{2})~(.+)$/.exec(cursor);
  if (!day || Number.isNaN(Date.parse(`${day[1]}T00:00:00Z`))) throw new ServiceError(422, "Halaman berikutnya tidak dikenali. Muat ulang daftarnya.");
  const [, time, id] = /^created_at\.lt\."([^"]+)",and\(created_at\.eq\."[^"]+",id\.lt\.([0-9a-f-]+)\)$/.exec(afterCursor(day[2]))!;
  return `happened_on.lt.${day[1]},and(happened_on.eq.${day[1]},created_at.lt."${time}"),and(happened_on.eq.${day[1]},created_at.eq."${time}",id.lt.${id})`;
}
/** The PostgREST `or` filter for "after this cursor" in a newest-first list, or a 422 for a cursor that is not ours. */
export function afterCursor(cursor: string): string {
  const match = CURSOR.exec(cursor);
  if (!match || Number.isNaN(Date.parse(match[1].replace(" ", "T")))) throw new ServiceError(422, "Halaman berikutnya tidak dikenali. Muat ulang daftarnya.");
  return `created_at.lt."${match[1]}",and(created_at.eq."${match[1]}",id.lt.${match[2]})`;
}
type DbError = { code?: string; message?: string };

/** The wb_* tables or wb_totals are not there yet (migration 202611160050 not applied). */
export const missing = (error: DbError | null) => !!error && (["PGRST205", "PGRST202", "42P01", "42883"].includes(error.code ?? "") || /wb_[a-z_]+/.test(error.message ?? "") && /does not exist|could not find/i.test(error.message ?? ""));
export const waiting = () => new ServiceError(503, `Wellbeing menunggu migrasi ${MIGRATION_WELLBEING}. Minta pemilik menjalankannya di Supabase SQL Editor.`);
export const fail = (error: { code?: string; message: string }): never => { if (missing(error)) throw waiting(); return databaseError(error); };
export const zeroDims = (): Record<DimensionId, number> => ({ physical: 0, emotional: 0, social: 0, financial: 0, spiritual: 0 });
export const db = () => createPrivilegedClient();

/** PostgREST answers at most its max-rows (1000 on Supabase) per request: read every page. */
const PAGE = 1000;
export async function readAll(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>, maxPages = 30): Promise<{ rows: Row[]; error: { code?: string; message: string } | null }> {
  const rows: Row[] = [];
  for (let index = 0; index < maxPages; index++) {
    const { data, error } = await page(index * PAGE, index * PAGE + PAGE - 1);
    if (error) return { rows, error };
    const got = (data ?? []) as Row[];
    rows.push(...got);
    if (got.length < PAGE) break;
  }
  return { rows, error: null };
}

export type Totals = { employee_id: string; dimension_id: DimensionId | null; points: number; activities: number };
/** wb_totals: points per person and dimension within the dates (null = no bound). */
export async function readTotals(from: string | null, to: string | null): Promise<{ migrated: boolean; rows: Totals[] }> {
  const { rows, error } = await readAll((start, end) => db().rpc("wb_totals", { p_from: from, p_to: to }).order("employee_id").order("dimension_id").range(start, end));
  if (error) { if (missing(error)) return { migrated: false, rows: [] }; databaseError(error); }
  return { migrated: true, rows: rows.map(row => ({ employee_id: row.employee_id as string, dimension_id: (row.dimension_id as DimensionId | null) ?? null, points: Number(row.points), activities: Number(row.activities) })) };
}

/** The programme's rules (defaults while the row is not there); migrated false before the migration. */
export async function readSettings(): Promise<{ migrated: boolean; settings: WellbeingSettings }> {
  const { data, error } = await db().from("wb_settings").select("backdate_days,max_kcal,max_steps,program_start").eq("id", 1).maybeSingle();
  if (error) { if (missing(error)) return { migrated: false, settings: defaultSettings }; databaseError(error); }
  if (!data) return { migrated: true, settings: defaultSettings };
  return { migrated: true, settings: { backdateDays: data.backdate_days as number, maxKcal: data.max_kcal as number, maxSteps: data.max_steps as number, programStart: data.program_start as string } };
}

/**
 * Proof photos ready to show: a link imported from the old app passes through; a key of ours
 * becomes a signed address (one hour). Without storage set up (local development), or for a key
 * that is not under wellbeing/, there is no address: dropped, or kept as the bare key with
 * `keepUnsigned` (Admin Periksa shows "Foto belum bisa ditampilkan" for those).
 */
export async function photoUrls(values: readonly string[], options: { keepUnsigned?: boolean } = {}): Promise<string[]> {
  const storage = isR2Configured();
  const out = await Promise.all(values.map(async value => {
    if (/^https?:\/\//i.test(value)) return value;
    if (storage && value.startsWith(UPLOAD_PREFIX)) {
      const signed = await presignDownload(value, { seconds: PHOTO_VIEW_SECONDS }).catch(() => null);
      if (signed) return signed;
    }
    return options.keepUnsigned ? value : null;
  }));
  return out.filter((value): value is string => value !== null);
}

/** The same for a list of activities (or one), after mapping. */
export async function withPhotoUrls<T extends { photos: string[] }>(items: T[], options: { keepUnsigned?: boolean } = {}): Promise<T[]> {
  return Promise.all(items.map(async item => ({ ...item, photos: await photoUrls(item.photos, options) })));
}
