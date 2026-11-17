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
import { checkUploaded, keysOf, photoIdFor, removePhotoFiles, storageReady, tokenMatches, uploadAddresses, uploadToken } from "./storage";

/*
 * Sending a Momen photo (U01–U04, KONTRAK §8): two steps, as the MoM photos.
 *   1. start: the server checks who sends (kelompok published for "Kelompokku", the limits), picks
 *      the files (from the owner and the phone's clientId) and signs three uploads (type and size).
 *   2. the browser puts the three JPEGs straight into storage (never through this server).
 *   3. confirm: the server checks the token, the sizes and the first bytes, then keeps the photo;
 *      others see it 5 seconds later (Batalkan).
 * Every step can run again: a photo sent twice (a retry, a queue after a lost answer) is kept once.
 */

const db = () => createPrivilegedClient();
const notReady = () => new ServiceError(503, "Penyimpanan foto belum disiapkan. Hubungi admin WAM.");
const unknownUpload = () => new ServiceError(403, "Unggahan tidak dikenali. Ulangi dari awal.");
const noGroup = () => new ServiceError(409, "Kelompokmu belum diterbitkan panitia. Pilih Untuk: Semua.");

/** "Untuk: Kelompokku" needs the person's kelompok (published); answers the group id to keep. */
function groupFor(context: MainWamContext, audience: PhotoStart["audience"]): string | null {
  if (audience !== "kelompok") return null;
  if (!context.viewer.group) throw noGroup();
  return context.viewer.group.id;
}

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
  groupFor(context, input.audience);
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
  const groupId = groupFor(context, input.audience);
  const sessionId = await keptSession(input.sessionId);
  await checkUploaded(id, sizes);
  const keys = keysOf(id);
  const { data, error } = await db().from("mw_photos").insert({
    id, owner_id: context.viewer.id, client_id: input.clientId.toLowerCase(), audience: input.audience, group_id: groupId, session_id: sessionId,
    file_key: keys.besar, thumb_key: keys.kecil, tile_key: keys.ubin, size: input.size, width: input.width, height: input.height,
    taken_at: keptTakenAt(input.takenAt, now),
  }).select("id,visible_at").single();
  if (error) {
    // The same photo confirmed twice at once: the first one kept it.
    if (error.code === "23505") { const again = await photoRecord(id); if (again) return { id: again.id, visibleAt: again.visibleAt }; }
    await removePhotoFiles(id);
    mwFail(error as DbError, MOMEN_AREA_MIGRATION);
  }
  return { id: data.id as string, visibleAt: data.visible_at as string };
}

/**
 * Batalkan (within the 5 seconds), Hapus foto (the owner), or K08 Hapus (panitia): the row and its
 * three files go, and with them its hearts, reports and Mozaik cell. A photo cancelled before it was
 * kept: the sender names its clientId, and only its own files are removed.
 */
export async function deletePhoto(context: MainWamContext, id: string, clientId?: string): Promise<void> {
  const photo = await photoRecord(id);
  if (!photo) {
    if (clientId && photoIdFor(context.viewer.id, clientId) === id.toLowerCase()) { await removePhotoFiles(id.toLowerCase()); return; }
    throw new ServiceError(404, "Foto tidak ditemukan.");
  }
  if (!canDelete(context.viewer, photo)) throw new ServiceError(canSee(context.viewer, photo) ? 403 : 404, canSee(context.viewer, photo) ? "Hanya pemilik foto yang bisa menghapusnya." : "Foto tidak ditemukan.");
  const { error } = await db().from("mw_photos").delete().eq("id", photo.id);
  if (error) mwFail(error as DbError, MOMEN_AREA_MIGRATION);
  await removePhotoFiles(photo.id, [photo.fileKey, photo.thumbKey, photo.tileKey]);
}
