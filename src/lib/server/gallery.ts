import "server-only";
import { cookies } from "next/headers";
import { DEVICE_COOKIE, isDeviceId } from "@/lib/admin-token";
import { kindFromMime, photoExtension, photoMime, type PhotoKind } from "@/lib/image-signature";
import { currentPhase } from "@/lib/event-phase";
import type { EventRecord } from "@/lib/types";
import { galleryLimits, galleryOpen, type GalleryPhoto, type GalleryStatus, type UploadRequest } from "@/lib/gallery";
import { createPrivilegedClient } from "./supabase/admin";
import { databaseError } from "./http";
import { ServiceError } from "./config";
import { isR2Configured, presignDownload, presignUpload, removeObjects, verifyUpload } from "./r2";

const MIGRATION = "202610210002_gallery_photos.sql";
const columns = "id,status,original_key,original_kind,original_bytes,large_key,large_bytes,thumb_key,thumb_bytes,width,height,caption,alt,sort_order,created_at";
type Row = {
  id: string; status: GalleryStatus; original_key: string; original_kind: string; original_bytes: number;
  large_key: string; large_bytes: number; thumb_key: string; thumb_bytes: number; width: number | null; height: number | null;
  caption: string; alt: string; sort_order: number; created_at: string;
};
const notMigrated = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205"].includes(error.code ?? "") || /gallery_photos/.test(error.message ?? "");

/** Whether uploads can work: R2 variables present and the table migrated. */
export async function galleryReadiness(eventId: string): Promise<{ configured: boolean; migrated: boolean }> {
  const { error } = await createPrivilegedClient().from("gallery_photos").select("id", { head: true, count: "exact" }).eq("event_id", eventId);
  if (error && !notMigrated(error)) databaseError(error);
  return { configured: isR2Configured(), migrated: !error };
}

async function rows(eventId: string, statuses?: GalleryStatus[]): Promise<Row[]> {
  let query = createPrivilegedClient().from("gallery_photos").select(columns).eq("event_id", eventId);
  if (statuses) query = query.in("status", statuses);
  const { data, error } = await query.order("sort_order").order("created_at").limit(galleryLimits.perEvent);
  if (error) { if (notMigrated(error)) return []; databaseError(error); }
  return (data ?? []) as Row[];
}

async function withUrls(row: Row, large: boolean): Promise<GalleryPhoto> {
  return {
    id: row.id, status: row.status, width: row.width, height: row.height, caption: row.caption, alt: row.alt, sort_order: row.sort_order,
    created_at: row.created_at, original_bytes: row.original_bytes,
    thumb_url: await presignDownload(row.thumb_key, { seconds: 6 * 3600 }),
    large_url: large ? await presignDownload(row.large_key, { seconds: 6 * 3600 }) : "",
  };
}

/** Every photo of an event for the admin, uploads in progress included. Empty without R2. */
export async function listAdminPhotos(eventId: string): Promise<GalleryPhoto[]> {
  if (!isR2Configured()) return [];
  return Promise.all((await rows(eventId)).map(row => withUrls(row, true)));
}

/** Ready photos for guests. Callers check the event is published first. */
export async function listPublicPhotos(eventId: string): Promise<GalleryPhoto[]> {
  if (!isR2Configured()) return [];
  return Promise.all((await rows(eventId, ["ready"])).map(row => withUrls(row, true)));
}

export async function readyPhotoCount(eventId: string): Promise<number> {
  if (!isR2Configured()) return 0;
  const { count, error } = await createPrivilegedClient().from("gallery_photos").select("id", { head: true, count: "exact" }).eq("event_id", eventId).eq("status", "ready");
  if (error) { if (notMigrated(error)) return 0; databaseError(error); }
  return count ?? 0;
}

/**
 * Step 1 of an upload: a row in "uploading" and three signed addresses (original, large, thumb)
 * whose keys, types and sizes the server fixed.
 */
export async function startUpload(eventId: string, request: UploadRequest) {
  if (!isR2Configured()) throw new ServiceError(503, "Penyimpanan foto belum disiapkan.");
  const kind = kindFromMime(request.original.type);
  if (!kind) throw new ServiceError(422, "Format foto belum didukung. Gunakan JPEG, PNG, WebP, atau HEIC.");
  const client = createPrivilegedClient();
  const { count, error: countError } = await client.from("gallery_photos").select("id", { head: true, count: "exact" }).eq("event_id", eventId);
  if (countError) { if (notMigrated(countError)) throw new ServiceError(503, `Galeri menunggu migrasi ${MIGRATION}.`); databaseError(countError); }
  if ((count ?? 0) >= galleryLimits.perEvent) throw new ServiceError(409, `Batas ${galleryLimits.perEvent} foto per acara tercapai.`);
  const id = crypto.randomUUID();
  const folder = `events/${eventId}/photos/${id}`;
  const device = (await cookies()).get(DEVICE_COOKIE)?.value;
  const row = {
    id, event_id: eventId, status: "uploading", sort_order: Math.round(Date.now() / 1000),
    original_key: `${folder}/original.${photoExtension[kind]}`, original_kind: kind, original_bytes: request.original.size,
    large_key: `${folder}/large.webp`, large_bytes: request.large.size, thumb_key: `${folder}/thumb.webp`, thumb_bytes: request.thumb.size,
    width: request.width, height: request.height, uploaded_device: device && isDeviceId(device) ? device : null,
  };
  const { error } = await client.from("gallery_photos").insert(row);
  if (error) databaseError(error);
  return {
    id,
    uploads: {
      original: await presignUpload(row.original_key, photoMime[kind], row.original_bytes),
      large: await presignUpload(row.large_key, "image/webp", row.large_bytes),
      thumb: await presignUpload(row.thumb_key, "image/webp", row.thumb_bytes),
    },
  };
}

async function one(eventId: string, photoId: string): Promise<Row> {
  const { data, error } = await createPrivilegedClient().from("gallery_photos").select(columns).eq("event_id", eventId).eq("id", photoId).maybeSingle();
  if (error) databaseError(error);
  if (!data) throw new ServiceError(404, "Foto tidak ditemukan.");
  return data as Row;
}

/** Step 2: all three files are there with the agreed size and are real photos; then it awaits review. */
export async function finishUpload(eventId: string, photoId: string): Promise<GalleryPhoto> {
  const row = await one(eventId, photoId);
  if (row.status !== "uploading") return withUrls(row, true);
  try {
    await verifyUpload(row.original_key, row.original_bytes, [row.original_kind as PhotoKind]);
    await verifyUpload(row.large_key, row.large_bytes, ["webp"]);
    await verifyUpload(row.thumb_key, row.thumb_bytes, ["webp"]);
  } catch (error) {
    await deletePhoto(eventId, photoId).catch(() => {});
    throw error;
  }
  return updatePhoto(eventId, photoId, { status: "pending" });
}

export async function updatePhoto(eventId: string, photoId: string, patch: Partial<Pick<GalleryPhoto, "status" | "caption" | "alt" | "sort_order">>): Promise<GalleryPhoto> {
  const { data, error } = await createPrivilegedClient().from("gallery_photos").update({ ...patch, updated_at: new Date().toISOString() }).eq("event_id", eventId).eq("id", photoId).select(columns).maybeSingle();
  if (error) databaseError(error);
  if (!data) throw new ServiceError(404, "Foto tidak ditemukan.");
  return withUrls(data as Row, true);
}

export async function deletePhoto(eventId: string, photoId: string): Promise<void> {
  const row = await one(eventId, photoId);
  await removeObjects([row.original_key, row.large_key, row.thumb_key]);
  const { error } = await createPrivilegedClient().from("gallery_photos").delete().eq("event_id", eventId).eq("id", photoId);
  if (error) databaseError(error);
}

/** A one-hour download address for the original of a ready photo. */
export async function originalDownload(eventId: string, photoId: string, slug: string): Promise<string> {
  const row = await one(eventId, photoId);
  if (row.status !== "ready") throw new ServiceError(404, "Foto tidak ditemukan.");
  return presignDownload(row.original_key, { filename: `${slug}-${photoId.slice(0, 8)}.${photoExtension[row.original_kind as PhotoKind] ?? "jpg"}` });
}

/** Ready photos to link from the page after the event; 0 before it, without R2, or on any error. */
export async function afterPhotos(event: EventRecord): Promise<number> {
  if (currentPhase(event) !== "after" || !galleryOpen(event)) return 0;
  return readyPhotoCount(event.id).catch(() => 0);
}
