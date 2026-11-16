import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PhotoMime } from "@/lib/wellbeing/rules";

/*
 * Proof photos for Wellbeing (17 Nov 2026), in private R2 storage under wellbeing/<employee>/. The
 * server picks the key; the browser PUTs the photo to a ten-minute address and later sends the key
 * back with a token that ties it to this person, type, size and an expiry (signed with the WAM
 * session secret, purpose "wellbeing"), so nobody logs an activity with someone else's file.
 */

/** How long an agreed upload may be attached to an activity (the form may stay open a while). */
export const UPLOAD_TOKEN_SECONDS = 60 * 60;
/** How long a shown photo's address works. */
export const PHOTO_VIEW_SECONDS = 60 * 60;
export const UPLOAD_PREFIX = "wellbeing/";

const extensions: Record<PhotoMime, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const KEY = new RegExp(`^wellbeing/${UUID}/${UUID}\\.(jpg|png|webp)$`);

export const uploadKeyFor = (employeeId: string, id: string, mime: PhotoMime) => `${UPLOAD_PREFIX}${employeeId}/${id}.${extensions[mime]}`;
/** The key is this person's, of the agreed type: nobody attaches a file from another folder. */
export const isOwnUploadKey = (key: string, employeeId: string, mime: PhotoMime) =>
  KEY.test(key) && key.startsWith(`${UPLOAD_PREFIX}${employeeId}/`) && key.endsWith(`.${extensions[mime]}`);

type Photo = { key: string; mime: string; size: number };
const signature = (secret: string, photo: Photo, employeeId: string, expires: number) =>
  createHmac("sha256", secret).update(["wellbeing", "v1", photo.key, photo.size, photo.mime, employeeId, expires].join("\0")).digest("hex");

/** `<expires>.<signature>` for one agreed upload. */
export function uploadToken(secret: string, photo: Photo, employeeId: string, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + UPLOAD_TOKEN_SECONDS;
  return `${expires}.${signature(secret, photo, employeeId, expires)}`;
}

/** Whether the token was made for this key, type, size and person, and is still valid. */
export function uploadTokenMatches(secret: string | null, token: string, photo: Photo, employeeId: string, now = Date.now()): boolean {
  if (!secret) return false;
  const [expiresText, given] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isInteger(expires) || expires * 1000 < now || expires * 1000 > now + UPLOAD_TOKEN_SECONDS * 1000 || !/^[0-9a-f]{64}$/.test(given ?? "")) return false;
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(signature(secret, photo, employeeId, expires), "hex"));
}
