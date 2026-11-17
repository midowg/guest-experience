import "server-only";
import { canOpenFile } from "@/lib/main-wam/momen/access";
import { ServiceError } from "../../config";
import type { MainWamContext } from "../gate";
import { photoRecord } from "./feed";
import { storageReady, viewAddress } from "./storage";

/** The sizes a photo is kept in: kecil (480 px), besar (1600 px), ubin (160 px square, Mozaik). */
export type PhotoSize = "kecil" | "besar" | "ubin";
export const parsePhotoSize = (raw: string | null): PhotoSize => (raw === "kecil" || raw === "ubin" ? raw : "besar");

/**
 * A short-lived storage address of one photo's file (mainWamApi.photoFile): for whoever sees the
 * photo, and for panitia (K08 shows reported and hidden photos through it). Anyone else: 404.
 */
export async function photoFileAddress(context: MainWamContext, id: string, size: PhotoSize): Promise<string> {
  const photo = await photoRecord(id);
  if (!photo || !canOpenFile(context.viewer, photo) || !storageReady()) throw new ServiceError(404, "Foto tidak ditemukan.");
  const key = size === "ubin" ? photo.tileKey ?? photo.thumbKey ?? photo.fileKey : size === "kecil" ? photo.thumbKey ?? photo.fileKey : photo.fileKey;
  const address = await viewAddress(key);
  if (!address) throw new ServiceError(404, "Foto tidak ditemukan.");
  return address;
}
