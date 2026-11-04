import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { isOwnPhotoKey, PHOTO_MIGRATION, photoColumnMissing, photoKeyFor, photoMagicMatches, photoPath, type PhotoStart } from "@/lib/pra-wam/photo";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { isR2Configured, presignDownload, presignUpload, removeObjects, uploadedStart } from "../r2";
import { createPrivilegedClient } from "../supabase/admin";
import type { Member } from "./session";

/*
 * A member's own profile photo in private R2 storage, under pra-wam/foto/<employee id>/. Upload in
 * two steps, as documents do: the server agrees a key, type and size (signed, and valid for a short
 * while), the browser puts the file, and the server checks it before keeping its key on the account.
 * The previous photo is deleted once the new one is kept.
 */

export { photoPath };

/** How long the agreed upload may be confirmed; the upload address itself lasts ten minutes. */
const TOKEN_SECONDS = 15 * 60;
/** The storage address the photo route redirects to: longer than the hour the redirect is cached. */
const VIEW_SECONDS = 75 * 60;

const notReady = () => new ServiceError(503, "Penyimpanan foto belum disiapkan. Isi R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, dan R2_BUCKET.");
const waiting = () => new ServiceError(503, `Foto profil menunggu migrasi ${PHOTO_MIGRATION}. Hubungi admin WAM.`);
const unknownUpload = () => new ServiceError(403, "Unggahan tidak dikenali. Ulangi dari awal.");

function signature(key: string, input: PhotoStart, member: Member, expires: number): string {
  const secret = praWamSecret();
  if (!secret) throw new ServiceError(503, "Login Pra WAM belum disiapkan.");
  return createHmac("sha256", secret).update(`foto\0${key}\0${input.size}\0${input.mime}\0${member.id}\0${expires}`).digest("hex");
}

/** The photo key on the account now; the migration's absence becomes a clear message. */
async function currentKey(employeeId: string): Promise<string | null> {
  const { data, error } = await createPrivilegedClient().from("pw_accounts").select("photo_key").eq("employee_id", employeeId).maybeSingle();
  if (error) { if (photoColumnMissing(error)) throw waiting(); databaseError(error); }
  if (!data) throw new ServiceError(401, "Sesi berakhir. Masuk kembali sebelum melanjutkan.");
  return (data as { photo_key: string | null }).photo_key;
}

/** Step one: where to put the photo, and a token to confirm it with. */
export async function startPhotoUpload(input: PhotoStart, member: Member): Promise<{ key: string; uploadUrl: string; token: string }> {
  if (!isR2Configured()) throw notReady();
  await currentKey(member.id); // no upload at all while the migration is missing
  const key = photoKeyFor(member.id, randomUUID(), input.mime);
  const expires = Math.floor(Date.now() / 1000) + TOKEN_SECONDS;
  return { key, uploadUrl: await presignUpload(key, input.mime, input.size), token: `${expires}.${signature(key, input, member, expires)}` };
}

/** Whether the token was made for this key, type, size and person, and is still valid. */
export function tokenMatches(token: string, key: string, input: PhotoStart, member: Member, now = Date.now()): boolean {
  const [expiresText, given] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isInteger(expires) || expires * 1000 < now || !/^[0-9a-f]{64}$/.test(given ?? "")) return false;
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(signature(key, input, member, expires), "hex"));
}

/**
 * Step two: the photo is there with the agreed size and its first bytes are WebP or JPEG; then
 * the account points to it and the old one is deleted. A photo that fails any check is deleted.
 */
export async function confirmPhotoUpload(input: PhotoStart & { key: string; token: string }, member: Member): Promise<{ photo: string | null }> {
  if (!isR2Configured()) throw notReady();
  if (!isOwnPhotoKey(input.key, member.id, input.mime) || !tokenMatches(input.token, input.key, input, member)) throw unknownUpload();
  const discard = () => removeObjects([input.key]).catch(() => undefined);
  let start: Uint8Array;
  try { start = await uploadedStart(input.key, input.size); } catch (error) { await discard(); throw error; }
  if (!photoMagicMatches(input.mime, start)) {
    await discard();
    throw new ServiceError(422, "Isi berkas bukan foto WebP atau JPEG. Pilih foto lain.");
  }
  let previous: string | null;
  try { previous = await currentKey(member.id); } catch (error) { await discard(); throw error; }
  const updatedAt = new Date().toISOString();
  const { error } = await createPrivilegedClient().from("pw_accounts").update({ photo_key: input.key, photo_updated_at: updatedAt }).eq("employee_id", member.id);
  if (error) {
    await discard();
    if (photoColumnMissing(error)) throw waiting();
    databaseError(error);
  }
  if (previous && previous !== input.key) await removeObjects([previous]).catch(() => undefined);
  return { photo: photoPath({ id: member.id, photoKey: input.key, photoUpdatedAt: updatedAt }) };
}

/** Back to initials: the key is cleared, then the stored photo deleted. */
export async function removePhoto(member: Member): Promise<void> {
  const previous = await currentKey(member.id);
  if (!previous) return;
  const { error } = await createPrivilegedClient().from("pw_accounts").update({ photo_key: null, photo_updated_at: new Date().toISOString() }).eq("employee_id", member.id);
  if (error) { if (photoColumnMissing(error)) throw waiting(); databaseError(error); }
  if (isR2Configured()) await removeObjects([previous]).catch(() => undefined);
}

/** For any signed-in member: a short-lived storage address of someone's photo, or 404. */
export async function photoViewUrl(employeeId: string): Promise<string> {
  const none = new ServiceError(404, "Foto tidak ditemukan.");
  if (!isR2Configured()) throw none;
  const { data, error } = await createPrivilegedClient().from("pw_accounts").select("photo_key,active").eq("employee_id", employeeId).maybeSingle();
  if (error) { if (photoColumnMissing(error)) throw none; databaseError(error); }
  const row = data as { photo_key: string | null; active: boolean } | null;
  if (!row?.photo_key || !row.active) throw none;
  return presignDownload(row.photo_key, { seconds: VIEW_SECONDS });
}
