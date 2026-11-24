import "server-only";
import { canOpenFile } from "@/lib/main-wam/momen/access";
import { ServiceError } from "../../config";
import type { MainWamContext } from "../gate";
import { photoRecord } from "./feed";
import { redirectSeconds, storageReady, viewAddress, type PhotoSize } from "./storage";

export type { PhotoSize } from "./storage";
export const parsePhotoSize = (raw: string | null): PhotoSize => (raw === "kecil" || raw === "ubin" ? raw : "besar");

/**
 * A short-lived storage address of one photo's file (mainWamApi.photoFile): for whoever sees the
 * photo, and for panitia (K08 shows reported and hidden photos through it). Anyone else: 404.
 * How long it works depends on the size (storage.ts VIEW_POLICY: besar 15 minutes at most).
 */
export async function photoFileAddress(context: MainWamContext, id: string, size: PhotoSize, options: { download?: boolean } = {}): Promise<{ address: string; cacheSeconds: number }> {
  const photo = await photoRecord(id);
  if (!photo || !canOpenFile(context.viewer, photo) || !storageReady()) throw new ServiceError(404, "Foto tidak ditemukan.");
  const key = size === "ubin" ? photo.tileKey ?? photo.thumbKey ?? photo.fileKey : size === "kecil" ? photo.thumbKey ?? photo.fileKey : photo.fileKey;
  // A photo without its own tile or small copy is served from a larger file, with that file's lifetime.
  const served: PhotoSize = key === photo.fileKey ? "besar" : key === photo.thumbKey ? "kecil" : "ubin";
  // A download is always the large file, under a plain name; the same access check as a view (nothing here loosens it).
  const address = await viewAddress(key, served, Date.now(), options.download ? `wam-2026-${id.replace(/-/g, "").slice(0, 8).toLowerCase()}.jpg` : undefined);
  if (!address) throw new ServiceError(404, "Foto tidak ditemukan.");
  return { address, cacheSeconds: redirectSeconds(served) };
}
