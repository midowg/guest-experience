import "server-only";
import { canDelete, canSee } from "@/lib/main-wam/momen/access";
import { keptTakenAt, MOMEN_AREA_MIGRATION, PHOTOS_PER_10_MINUTES, PHOTOS_PER_DAY, type PhotoConfirm, type PhotoStart } from "@/lib/main-wam/momen/filters";
import type { UploadDone, UploadStart } from "@/lib/main-wam/momen/types";
import { wibDate } from "@/lib/main-wam/rundown";
import { ServiceError } from "../../config";
import { createPrivilegedClient } from "../../supabase/admin";
import { mwFail, type DbError } from "../errors";
import type { MainWamContext } from "../gate";
import { allSessions } from "../read";
import { personLimit, photoRecord } from "./feed";
import { checkUploaded, keepUploaded, photoIdFor, removePhotoFiles, removeUploads, storageReady, tokenMatches, uploadAddresses, uploadToken, type PhotoKeys } from "./storage";

/*
 * Sending a Momen photo (U01–U04, KONTRAK §8): two steps, as the MoM photos.
 *   1. start: the server checks the limits (every photo is for everyone: no audience any more), picks
 *      the files (from the owner and the phone's clientId) and signs three uploads (type and size)
 *      under tmp/ (audit L4: what is never kept is deleted by the bucket's lifecycle rule).
 *   2. the browser puts the three JPEGs straight into storage (never through this server).
 *   3. confirm: the server checks the token, the sizes and the first bytes, copies the files to the
 *      photo's own keys, keeps the photo and removes the uploads; others see it 5 seconds later (Batalkan).
 * Every step can run again: a photo sent twice (a retry, a queue after a lost answer) is kept once.
 */

const db = () => createPrivilegedClient();
const notReady = () => new ServiceError(503, "Penyimpanan foto belum disiapkan. Hubungi admin WAM.");
const unknownUpload = () => new ServiceError(403, "Unggahan tidak dikenali. Ulangi dari awal.");

/** The session tag kept: a published session; anything else (deleted meanwhile) makes it Umum. */
async function keptSession(sessionId: string | null): Promise<string | null> {
  if (!sessionId) return null;
  const sessions = await allSessions().catch(() => ({ data: [], migrated: false }));
  return sessions.data.some(session => session.id === sessionId && session.status === "terbit") ? sessionId : null;
}

/** How many photos the person kept in the last 10 minutes and today (WIB). */
async function sentRecently(ownerId: string, now: Date): Promise<{ tenMinutes: number; today: number }> {
  const since = (iso: string) => db().from("mw_photos").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).gte("created_at", iso);
  const dayStart = new Date(`${wibDate(now.toISOString())}T00:00:00+07:00`).toISOString();
  const [recent, day] = await Promise.all([since(new Date(now.getTime() - 10 * 60_000).toISOString()), since(dayStart)]);
  if (recent.error) mwFail(recent.error as DbError, MOMEN_AREA_MIGRATION);
  if (day.error) mwFail(day.error as DbError, MOMEN_AREA_MIGRATION);
  return { tenMinutes: recent.count ?? 0, today: day.count ?? 0 };
}

/** Step one. */
export async function startUpload(context: MainWamContext, input: PhotoStart, now = new Date()): Promise<UploadStart> {
  if (!storageReady()) throw notReady();
  const id = photoIdFor(context.viewer.id, input.clientId);
  const kept = await photoRecord(id);
  if (kept) return { kind: "selesai", id: kept.id, visibleAt: kept.visibleAt };
  await personLimit("mw-foto-unggah", context.viewer.id, PHOTOS_PER_10_MINUTES * 2);
  const recent = await sentRecently(context.viewer.id, now);
  if (recent.tenMinutes >= PHOTOS_PER_10_MINUTES) throw new ServiceError(429, `Paling banyak ${PHOTOS_PER_10_MINUTES} foto per 10 menit. Foto ini menunggu dan terkirim sendiri nanti.`);
  if (recent.today >= PHOTOS_PER_DAY) throw new ServiceError(429, `Paling banyak ${PHOTOS_PER_DAY} foto sehari. Terima kasih sudah banyak berbagi.`);
  const sizes = { size: input.size, thumbSize: input.thumbSize, tileSize: input.tileSize };
  const uploads = await uploadAddresses(id, sizes);
  return { kind: "unggah", id, token: uploadToken({ id, ...sizes, width: input.width, height: input.height }, now.getTime()), uploads };
}

/** Step two: checked and kept (or the photo already kept). */
export async function confirmUpload(context: MainWamContext, input: PhotoConfirm, now = new Date()): Promise<UploadDone> {
  if (!storageReady()) throw notReady();
  const id = photoIdFor(context.viewer.id, input.clientId);
  const sizes = { size: input.size, thumbSize: input.thumbSize, tileSize: input.tileSize };
  if (!tokenMatches(input.token, { id, ...sizes, width: input.width, height: input.height }, now.getTime())) throw unknownUpload();
  const kept = await photoRecord(id);
  if (kept) return { id: kept.id, visibleAt: kept.visibleAt };
  const sessionId = await keptSession(input.sessionId);
  // A repeat that lost the race (an answer lost, the queue sent it again): the first one kept the
  // photo and removed the uploads, so this one finds them gone. Its answer is the kept photo.
  const keptMeanwhile = async () => { const again = await photoRecord(id); return again ? { id: again.id, visibleAt: again.visibleAt } : null; };
  try {
    await checkUploaded(id, sizes);
  } catch (error) { const again = await keptMeanwhile(); if (again) return again; throw error; }
  let keys: PhotoKeys;
  try {
    keys = await keepUploaded(id);
  } catch (error) { const again = await keptMeanwhile(); if (again) return again; throw error; }
  const { data, error } = await db().from("mw_photos").insert({
    id, owner_id: context.viewer.id, client_id: input.clientId.toLowerCase(), audience: "semua", group_id: null, session_id: sessionId,
    file_key: keys.besar, thumb_key: keys.kecil, tile_key: keys.ubin, size: input.size, width: input.width, height: input.height,
    taken_at: keptTakenAt(input.takenAt, now),
  }).select("id,visible_at").single();
  if (error) {
    // The same photo confirmed twice at once: the first one kept it.
    if (error.code === "23505") { const again = await keptMeanwhile(); if (again) { await removeUploads(id); return again; } }
    await removePhotoFiles(id);
    mwFail(error as DbError, MOMEN_AREA_MIGRATION);
  }
  // Kept: the uploads under tmp/ are no longer needed (if this fails, the lifecycle rule removes them).
  await removeUploads(id);
  return { id: data.id as string, visibleAt: data.visible_at as string };
}

/** Audit M3: a photo nominated for Awarding cannot be deleted (its votes and the BOD's approval would go). */
export const NOMINATED_PHOTO = "Foto ini masuk nominasi Awarding, jadi tidak bisa dihapus.";

/**
 * Batalkan (within the 5 seconds) or Hapus foto, by the photo's owner only: the row and its three
 * files go, and with them its reactions, reports and Mozaik cell. Panitia remove others' photos through
 * moderation (K08, mw_moderate_photo: hidden first, logged, the owner told), never here (audit M2).
 * A photo cancelled before it was kept: the sender names its clientId, and only its own files
 * (kept or still uploaded) are removed. A nominated photo stays: 409 (the database refuses, 23503).
 */
export async function deletePhoto(context: MainWamContext, id: string, clientId?: string): Promise<void> {
  const photo = await photoRecord(id);
  if (!photo) {
    if (clientId && photoIdFor(context.viewer.id, clientId) === id.toLowerCase()) { await removePhotoFiles(id.toLowerCase()); return; }
    throw new ServiceError(404, "Foto tidak ditemukan.");
  }
  if (!canDelete(context.viewer, photo)) {
    // Someone else's photo: 403 when the person sees it (panitia included), else nothing about it.
    if (canSee(context.viewer, photo)) throw new ServiceError(403, "Hanya pemilik foto yang bisa menghapusnya.");
    throw new ServiceError(404, "Foto tidak ditemukan.");
  }
  const { error } = await db().from("mw_photos").delete().eq("id", photo.id);
  if (error) {
    if (error.code === "23503") throw new ServiceError(409, NOMINATED_PHOTO);
    mwFail(error as DbError, MOMEN_AREA_MIGRATION);
  }
  await removePhotoFiles(photo.id, [photo.fileKey, photo.thumbKey, photo.tileKey]);
}
