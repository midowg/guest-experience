import "server-only";
import { keptTakenAt } from "@/lib/main-wam/momen/filters";
import { MISSIONS_PHOTO_MIGRATION } from "@/lib/main-wam/misi/types";
import { ServiceError } from "../../config";
import { createPrivilegedClient } from "../../supabase/admin";
import { copyObject } from "../../r2";
import { mwFail, mwMissing, type DbError } from "../errors";
import { photoRecord } from "./feed";
import { keysOf, photoIdFor, removePhotoFiles, storageReady, type PhotoKeys } from "./storage";

/*
 * A mission's proof as a Momen photo (docs/main-wam/KONTRAK.md §13): the proof's three kept files are
 * copied, inside storage, to the photo's own keys under main-wam/momen/, and a mw_photos row is made for
 * everyone (audience "semua", so the Mozaik takes it too) with mission_id, which is what labels it
 * "Misi: <judul>". The same rules as any Momen photo apply: it is the owner's (they can delete it), panitia
 * can hide it, and others see it only when its status is "tampil". Until the proof is approved the photo
 * waits as "ditinjau" (hidden from everyone but its owner's own screens); approval shows it (visible_at
 * = then), rejection removes it. Nothing here runs for a rejected proof.
 */

const db = () => createPrivilegedClient();

export type MissionPhotoInput = {
  ownerId: string;
  /** The phone's id of the proof photo: the same id gives the same Momen photo (sent twice = made once). */
  clientId: string;
  /** The proof's kept files (main-wam/misi/...). */
  proof: PhotoKeys;
  size: number;
  width: number;
  height: number;
  takenAt: string;
  missionId: string;
  /** true: shown at once (the proof is already approved); false: waits as "ditinjau". */
  approved: boolean;
};

/** Makes the Momen photo of a proof (or finds the one already made). Returns its id. */
export async function createMissionPhoto(input: MissionPhotoInput, now = new Date()): Promise<string> {
  if (!storageReady()) throw new ServiceError(503, "Penyimpanan foto belum disiapkan. Hubungi admin WAM.");
  const id = photoIdFor(input.ownerId, input.clientId);
  const kept = await photoRecord(id);
  if (kept) return kept.id;
  const to = keysOf(id);
  try {
    await Promise.all((["besar", "kecil", "ubin"] as const).map(size => copyObject(input.proof[size], to[size], "image/jpeg")));
  } catch {
    throw new ServiceError(503, "Foto belum dapat disimpan. Coba kirim lagi.");
  }
  const visibleNow = input.approved;
  const { data, error } = await db().from("mw_photos").insert({
    id, owner_id: input.ownerId, client_id: input.clientId.toLowerCase(), audience: "semua", group_id: null, session_id: null,
    file_key: to.besar, thumb_key: to.kecil, tile_key: to.ubin, size: input.size, width: input.width, height: input.height,
    taken_at: keptTakenAt(input.takenAt, now), mission_id: input.missionId, status: visibleNow ? "tampil" : "ditinjau",
  }).select("id").single();
  if (error) {
    if (error.code === "23505") { const again = await photoRecord(id); if (again) return again.id; }
    await removePhotoFiles(id);
    mwFail(error as DbError, MISSIONS_PHOTO_MIGRATION);
  }
  return data.id as string;
}

/** The proof was approved: its Momen photo is shown from now. A photo that is hidden by panitia stays hidden. */
export async function publishMissionPhoto(photoId: string, now = new Date()): Promise<void> {
  const { error } = await db().from("mw_photos").update({ status: "tampil", visible_at: now.toISOString() }).eq("id", photoId).eq("status", "ditinjau").is("hidden_by", null);
  if (error && !mwMissing(error as DbError)) mwFail(error as DbError, MISSIONS_PHOTO_MIGRATION);
}

/** The proof was rejected (or taken back): its Momen photo goes, with its files. A nominated photo (the database refuses) is only hidden. */
export async function withdrawMissionPhoto(photoId: string): Promise<void> {
  const photo = await photoRecord(photoId).catch(() => null);
  if (!photo) return;
  const { error } = await db().from("mw_photos").delete().eq("id", photo.id);
  if (error) {
    if (error.code === "23503") { await db().from("mw_photos").update({ status: "disembunyikan", hidden_at: new Date().toISOString(), hidden_reason: "Bukti misi ditarik." }).eq("id", photo.id); return; }
    mwFail(error as DbError, MISSIONS_PHOTO_MIGRATION);
  }
  await removePhotoFiles(photo.id, [photo.fileKey, photo.thumbKey, photo.tileKey]);
}

/** For Momen (to be wired by its screens): the mission label of these photos ("Misi: <judul>"); photos not made from a proof are not in the map. */
export async function missionLabelsOf(photoIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(photoIds)].filter(id => /^[0-9a-f-]{36}$/i.test(id));
  if (!ids.length) return out;
  const photos = await db().from("mw_photos").select("id,mission_id").in("id", ids).not("mission_id", "is", null);
  if (photos.error) { if (mwMissing(photos.error as DbError)) return out; mwFail(photos.error as DbError, MISSIONS_PHOTO_MIGRATION); }
  const missionIds = [...new Set((photos.data ?? []).map(row => row.mission_id as string))];
  if (!missionIds.length) return out;
  const missions = await db().from("mw_missions").select("id,title").in("id", missionIds);
  if (missions.error) return out;
  const titles = new Map((missions.data ?? []).map(row => [row.id as string, row.title as string]));
  for (const row of photos.data ?? []) { const title = titles.get(row.mission_id as string); if (title) out.set(row.id as string, `Misi: ${title}`); }
  return out;
}

