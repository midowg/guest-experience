import { z } from "zod";
import { praWamApi } from "@/lib/routes";

/*
 * Profile photos in WAM. The browser crops the picked photo to a square, makes it 320 × 320 and
 * saves it as WebP (JPEG where the browser cannot write WebP), lowering the quality until it is at
 * most 200 KB. The server agrees the type and size, the browser puts it in private storage, and the
 * server checks its first bytes before keeping it. Only the storage key is kept on the account.
 */

export const PHOTO_MIGRATION = "202611040010_pra_wam_photos_reset_requests.sql";
/** What is stored: small enough for every avatar, sharp enough at 2× for the largest one. */
export const PHOTO_SIDE = 320;
export const MAX_PHOTO_BYTES = 200 * 1024;
/** What may be picked, before it is decoded: a phone's full-size photo fits, a stray video does not. */
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

export const photoTypes = {
  "image/webp": { ext: "webp", steps: [0.82, 0.74, 0.66, 0.58, 0.5, 0.42, 0.34] },
  "image/jpeg": { ext: "jpg", steps: [0.85, 0.77, 0.69, 0.61, 0.53, 0.45, 0.37] },
} as const;
export type PhotoMime = keyof typeof photoTypes;
const photoMimes = Object.keys(photoTypes) as [PhotoMime, ...PhotoMime[]];

/** What the file picker offers; HEIC only decodes where the browser can (Safari). */
export const acceptPhotos = "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";

/** Why a picked file cannot be used, in plain words, or null when it may be decoded. */
export function sourceProblem(file: { name: string; type: string; size: number }): string | null {
  const type = file.type.toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const known = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(type) || (!type && ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext));
  if (!known) return "Pilih foto JPG, PNG, WebP, atau HEIC.";
  if (file.size > MAX_SOURCE_BYTES) return "Foto lebih dari 15 MB. Pilih foto lain.";
  if (file.size === 0) return "Berkas kosong. Pilih foto lain.";
  return null;
}

/** The middle square of a picture, to draw it without stretching. */
export function squareCrop(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  return { sx: Math.round((width - side) / 2), sy: Math.round((height - side) / 2), side };
}

/**
 * Tries WebP at each quality step, then JPEG if the browser wrote something else (a canvas that
 * cannot make WebP quietly answers PNG), until one is within `limit`. `encode` is the canvas.
 */
export async function encodeWithinLimit(encode: (mime: PhotoMime, quality: number) => Promise<Blob | null>, limit = MAX_PHOTO_BYTES): Promise<{ blob: Blob; mime: PhotoMime; quality: number }> {
  for (const mime of photoMimes) {
    for (const quality of photoTypes[mime].steps) {
      const blob = await encode(mime, quality);
      if (!blob || blob.type !== mime) break; // this browser cannot write this type: try the next
      if (blob.size <= limit) return { blob, mime, quality };
    }
  }
  throw new Error("Foto belum dapat diperkecil sampai 200 KB. Coba foto lain.");
}

/** Where a person's photo lives in storage; the migration's check allows only this shape. */
export const photoKeyPattern = /^pra-wam\/foto\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/;
export const photoKeyFor = (employeeId: string, id: string, mime: PhotoMime) => `pra-wam/foto/${employeeId}/${id}.${photoTypes[mime].ext}`;
/** The key is a photo of this person, of the agreed type: nobody confirms into someone else's folder. */
export const isOwnPhotoKey = (key: string, employeeId: string, mime: PhotoMime) =>
  photoKeyPattern.test(key) && key.startsWith(`pra-wam/foto/${employeeId}/`) && key.endsWith(`.${photoTypes[mime].ext}`);

/** Whether the first bytes are the agreed kind: RIFF····WEBP, or FF D8 FF. */
export function photoMagicMatches(mime: PhotoMime, start: Uint8Array): boolean {
  if (mime === "image/jpeg") return start.length >= 3 && start[0] === 0xff && start[1] === 0xd8 && start[2] === 0xff;
  const ascii = (from: number, to: number) => String.fromCharCode(...start.slice(from, to));
  return start.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
}

export const photoStartSchema = z.object({
  mime: z.enum(photoMimes, { message: "Foto harus WebP atau JPEG." }),
  size: z.number().int().min(1, "Berkas kosong.").max(MAX_PHOTO_BYTES, "Foto lebih dari 200 KB."),
});
export type PhotoStart = z.infer<typeof photoStartSchema>;
export const photoConfirmSchema = photoStartSchema.extend({
  key: z.string().regex(photoKeyPattern, "Unggahan tidak dikenali. Ulangi dari awal."),
  token: z.string().regex(/^\d{10,13}\.[0-9a-f]{64}$/, "Unggahan tidak dikenali. Ulangi dari awal."),
});

/** Before migration 202611040010 the photo columns are missing: no photo, initials instead. */
export const photoColumnMissing = (error: { code?: string; message?: string }) =>
  ["42703", "PGRST204", "42P01", "PGRST205"].includes(error.code ?? "") || /photo_(key|updated_at)/.test(error.message ?? "");

/**
 * The app address of a person's photo, or null without one. The version changes with the photo,
 * so a browser that kept the old one asks again.
 */
export function photoPath(account: { id: string; photoKey: string | null; photoUpdatedAt: string | null }): string | null {
  if (!account.photoKey) return null;
  const time = account.photoUpdatedAt ? Date.parse(account.photoUpdatedAt) : NaN;
  return praWamApi.photoOf(account.id, Number.isFinite(time) ? String(time) : undefined);
}

/** "Bagus Werkudara" → "BW". */
export const initialsOf = (name: string) => name.replace(/^(Pak|Bu)\s+/, "").split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase()).join("");
