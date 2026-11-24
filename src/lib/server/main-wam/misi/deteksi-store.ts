import "server-only";
import { MISSIONS_DETECT_MIGRATION } from "@/lib/main-wam/misi/types";
import { createPrivilegedClient } from "../../supabase/admin";
import { mwFail, mwMissing, type DbError } from "../errors";

/*
 * Where mission detection keeps its notes (migration 202611300003; every reader answers empty and every
 * writer stays quiet before it, so detection never stops a photo from being kept):
 *   mw_photo_signals     per Momen photo: from the app's camera or not, the coarse position when the person
 *                        switched "Tandai lokasi" on, and whether the photo was looked at. Never read by a
 *                        feed or an API for other people; it goes with the photo (on delete cascade).
 *   mw_photo_detections  what was done for a photo and a mission (sent, offered, taken back, waved off).
 *   mw_misi_prefs        the person's own switch "Deteksi misi otomatis".
 */

const db = () => createPrivilegedClient();

export type PhotoSignal = { photoId: string; live: boolean; geo: { latitude: number; longitude: number; accuracy: number | null } | null; checkedAt: string | null };
export type DetectionOutcome = "diajukan" | "saran" | "ditarik" | "diabaikan";
export type DetectionRow = { photoId: string; missionId: string; status: "cocok" | "mungkin"; outcome: DetectionOutcome; completionId: string | null; reasons: string[]; createdAt: string };

const OUTCOMES: readonly DetectionOutcome[] = ["diajukan", "saran", "ditarik", "diabaikan"];

/** Keeps what the phone said about a photo. Quiet: false when the table is not there yet (the position is then not kept at all). */
export async function saveSignals(input: { photoId: string; ownerId: string; live: boolean; geo: { latitude: number; longitude: number; accuracy: number } | null }): Promise<boolean> {
  const { error } = await db().from("mw_photo_signals").upsert({
    photo_id: input.photoId, owner_id: input.ownerId, live: input.live,
    geo_lat: input.geo?.latitude ?? null, geo_lng: input.geo?.longitude ?? null, geo_acc: input.geo ? Math.round(input.geo.accuracy) : null,
  }, { onConflict: "photo_id" });
  if (error) { if (!mwMissing(error as DbError)) console.warn("main-wam: sinyal foto belum tersimpan", error.message); return false; }
  return true;
}

export async function signalsOf(photoIds: readonly string[]): Promise<Map<string, PhotoSignal>> {
  const out = new Map<string, PhotoSignal>();
  if (!photoIds.length) return out;
  const { data, error } = await db().from("mw_photo_signals").select("photo_id,live,geo_lat,geo_lng,geo_acc,checked_at").in("photo_id", [...photoIds]).limit(500);
  if (error) { if (mwMissing(error as DbError)) return out; mwFail(error as DbError, MISSIONS_DETECT_MIGRATION); }
  for (const row of (data ?? []) as { photo_id: string; live: boolean; geo_lat: number | null; geo_lng: number | null; geo_acc: number | null; checked_at: string | null }[]) {
    out.set(row.photo_id, {
      photoId: row.photo_id, live: row.live !== false, checkedAt: row.checked_at,
      geo: row.geo_lat !== null && row.geo_lng !== null ? { latitude: row.geo_lat, longitude: row.geo_lng, accuracy: row.geo_acc } : null,
    });
  }
  return out;
}

/** The photos have been looked at (for "Periksa fotoku"). A photo that has no signals row gets one (live, no position). */
export async function markChecked(photos: readonly { id: string; ownerId: string }[]): Promise<void> {
  if (!photos.length) return;
  const at = new Date().toISOString();
  const existing = await signalsOf(photos.map(photo => photo.id)).catch(() => new Map<string, PhotoSignal>());
  const fresh = photos.filter(photo => !existing.has(photo.id));
  const tasks: PromiseLike<unknown>[] = [];
  if (existing.size) tasks.push(db().from("mw_photo_signals").update({ checked_at: at }).in("photo_id", [...existing.keys()]).then(undefined, () => undefined));
  if (fresh.length) tasks.push(db().from("mw_photo_signals").upsert(fresh.map(photo => ({ photo_id: photo.id, owner_id: photo.ownerId, live: true, checked_at: at })), { onConflict: "photo_id", ignoreDuplicates: true }).then(undefined, () => undefined));
  await Promise.all(tasks);
}

export async function detectionsOf(photoIds: readonly string[]): Promise<DetectionRow[]> {
  if (!photoIds.length) return [];
  const { data, error } = await db().from("mw_photo_detections").select("photo_id,mission_id,status,outcome,completion_id,reasons,created_at").in("photo_id", [...photoIds]).limit(1000);
  if (error) { if (mwMissing(error as DbError)) return []; mwFail(error as DbError, MISSIONS_DETECT_MIGRATION); }
  return ((data ?? []) as Record<string, unknown>[]).flatMap(row => {
    const outcome = OUTCOMES.find(item => item === row.outcome);
    if (!outcome) return [];
    return [{
      photoId: String(row.photo_id), missionId: String(row.mission_id), status: row.status === "cocok" ? "cocok" as const : "mungkin" as const, outcome,
      completionId: typeof row.completion_id === "string" ? row.completion_id : null, reasons: Array.isArray(row.reasons) ? row.reasons.map(String) : [], createdAt: String(row.created_at ?? ""),
    }];
  });
}

/** Keeps (or changes) what was done for a photo and a mission. Quiet before the migration. */
export async function recordDetection(row: { photoId: string; missionId: string; status: "cocok" | "mungkin"; outcome: DetectionOutcome; completionId: string | null; reasons: readonly string[] }): Promise<void> {
  const { error } = await db().from("mw_photo_detections").upsert({
    photo_id: row.photoId, mission_id: row.missionId, status: row.status, outcome: row.outcome, completion_id: row.completionId, reasons: [...row.reasons].slice(0, 12), updated_at: new Date().toISOString(),
  }, { onConflict: "photo_id,mission_id" });
  if (error && !mwMissing(error as DbError)) console.warn("main-wam: hasil deteksi belum tersimpan", error.message);
}

/** The person's own switch. The table missing means nothing can be switched off yet, so the app only suggests, never sends by itself. */
export async function readAutoPref(employeeId: string): Promise<{ on: boolean; stored: boolean }> {
  const { data, error } = await db().from("mw_misi_prefs").select("auto_detect").eq("employee_id", employeeId).maybeSingle();
  if (error) { if (mwMissing(error as DbError)) return { on: false, stored: false }; mwFail(error as DbError, MISSIONS_DETECT_MIGRATION); }
  return { on: (data as { auto_detect?: boolean } | null)?.auto_detect !== false, stored: true };
}

export async function saveAutoPref(employeeId: string, on: boolean): Promise<void> {
  const { error } = await db().from("mw_misi_prefs").upsert({ employee_id: employeeId, auto_detect: on, updated_at: new Date().toISOString() }, { onConflict: "employee_id" });
  if (error) mwFail(error as DbError, MISSIONS_DETECT_MIGRATION);
}
