import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isJpeg } from "@/lib/pra-wam/minutes-photos";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import { ServiceError } from "../../config";
import { copyObject, isR2Configured, presignDownload, presignUpload, removeObjects, uploadedStart } from "../../r2";

/*
 * Where a mission photo lives (R2, private), the same two steps as a Momen photo but kept apart from
 * Momen: it is a proof for the admin, never shown to other participants.
 *   - the proof's id comes from the person, the mission and the phone's clientId (HMAC), so a photo
 *     sent twice lands on the same files;
 *   - three JPEGs, as a Momen photo: <id>.jpg (besar), <id>-kecil.jpg and <id>-ubin.jpg (the Mozaik's tile),
 *     so the proof can also become a Momen photo (momen/mission-photo.ts copies them);
 *   - the browser uploads under tmp/main-wam/misi/ (presigned PUT, type and exact size signed);
 *     "simpan" checks the first bytes and copies them inside storage to main-wam/misi/, then removes
 *     the uploads (what is never kept is emptied by the `tmp/` lifecycle rule, KONTRAK §10);
 *   - only Admin WAM opens them, with a short-lived address.
 */

export const PROOF_PREFIX = "main-wam/misi/";
export const PROOF_UPLOAD_PREFIX = "tmp/main-wam/misi/";
export type ProofKeys = { besar: string; kecil: string; ubin: string };
const filesUnder = (prefix: string, id: string): ProofKeys => ({ besar: `${prefix}${id}.jpg`, kecil: `${prefix}${id}-kecil.jpg`, ubin: `${prefix}${id}-ubin.jpg` });
export const proofKeysOf = (id: string) => filesUnder(PROOF_PREFIX, id);
export const proofUploadKeysOf = (id: string) => filesUnder(PROOF_UPLOAD_PREFIX, id);

const notReady = () => new ServiceError(503, "Penyimpanan foto belum disiapkan. Hubungi admin WAM.");
export const proofStorageReady = () => isR2Configured();

function secret(): string {
  const value = praWamSecret();
  if (!value) throw new ServiceError(503, "Login WAM belum disiapkan.");
  return value;
}

/** A v4-shaped uuid from an HMAC: stable for one person, mission and phone photo, unguessable. */
export function proofIdFor(ownerId: string, missionId: string, clientId: string, key = secret()): string {
  const bytes = createHmac("sha256", key).update(`mw-misi\0${ownerId}\0${missionId}\0${clientId.toLowerCase()}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type Agreed = { id: string; size: number; thumbSize: number; tileSize: number; width: number; height: number };
const TOKEN_SECONDS = 15 * 60;
const signature = (agreed: Agreed, expires: number, key: string) =>
  createHmac("sha256", key).update(`mw-misi-unggah\0${agreed.id}\0${agreed.size}\0${agreed.thumbSize}\0${agreed.width}\0${agreed.height}\0${expires}`).digest("hex");

export function proofToken(agreed: Agreed, now = Date.now(), key = secret()): string {
  const expires = Math.floor(now / 1000) + TOKEN_SECONDS;
  return `${expires}.${signature(agreed, expires, key)}`;
}

export function proofTokenMatches(token: string, agreed: Agreed, now = Date.now(), key = secret()): boolean {
  const [expiresText, given] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isInteger(expires) || expires * 1000 < now || !/^[0-9a-f]{64}$/.test(given ?? "")) return false;
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(signature(agreed, expires, key), "hex"));
}

/** Two upload addresses under tmp/ (10 minutes each), type and exact size signed. */
export async function proofUploadAddresses(id: string, sizes: { size: number; thumbSize: number; tileSize: number }): Promise<ProofKeys> {
  if (!proofStorageReady()) throw notReady();
  const keys = proofUploadKeysOf(id);
  const [besar, kecil, ubin] = await Promise.all([presignUpload(keys.besar, "image/jpeg", sizes.size), presignUpload(keys.kecil, "image/jpeg", sizes.thumbSize), presignUpload(keys.ubin, "image/jpeg", sizes.tileSize)]);
  return { besar, kecil, ubin };
}

export async function removeProofUploads(id: string): Promise<void> {
  if (!proofStorageReady()) return;
  await removeObjects(Object.values(proofUploadKeysOf(id))).catch(() => undefined);
}
/** The kept files of a proof (a completion that failed after the copy, or an admin taking it back). */
export async function removeProofFiles(id: string, extra: (string | null | undefined)[] = []): Promise<void> {
  if (!proofStorageReady()) return;
  const keys = [...Object.values(proofKeysOf(id)), ...Object.values(proofUploadKeysOf(id)), ...extra.filter((key): key is string => !!key)];
  await removeObjects([...new Set(keys)]).catch(() => undefined);
}

/** Kept files by their exact keys (an earlier, rejected proof that a new one replaced). Quiet: a file that stays is only an orphan. */
export async function removeProofKeys(keys: readonly (string | null | undefined)[]): Promise<void> {
  const list = [...new Set(keys.filter((key): key is string => !!key))];
  if (!list.length || !proofStorageReady()) return;
  await removeObjects(list).catch(() => undefined);
}

/** Both uploads are there with the agreed sizes and are JPEGs; otherwise 422 (and the uploads go). */
export async function checkProofUploaded(id: string, sizes: { size: number; thumbSize: number; tileSize: number }): Promise<void> {
  if (!proofStorageReady()) throw notReady();
  const keys = proofUploadKeysOf(id);
  let starts: Uint8Array[];
  try {
    starts = await Promise.all([uploadedStart(keys.besar, sizes.size), uploadedStart(keys.kecil, sizes.thumbSize), uploadedStart(keys.ubin, sizes.tileSize)]);
  } catch (error) {
    await removeProofUploads(id);
    throw error;
  }
  if (!starts.every(isJpeg)) { await removeProofUploads(id); throw new ServiceError(422, "Isi berkas bukan foto JPEG. Ambil ulang fotonya."); }
}

/** "Simpan": the checked uploads copied, inside storage, to the proof's own keys. */
export async function keepProof(id: string): Promise<ProofKeys> {
  if (!proofStorageReady()) throw notReady();
  const from = proofUploadKeysOf(id), to = proofKeysOf(id);
  try {
    await Promise.all([copyObject(from.besar, to.besar, "image/jpeg"), copyObject(from.kecil, to.kecil, "image/jpeg"), copyObject(from.ubin, to.ubin, "image/jpeg")]);
  } catch {
    throw new ServiceError(503, "Foto belum dapat disimpan. Coba kirim lagi.");
  }
  return to;
}

/** A short-lived address of a kept proof, for Admin WAM. */
export async function proofAddress(key: string | null | undefined): Promise<string | null> {
  if (!key || !proofStorageReady()) return null;
  return presignDownload(key, { seconds: 1800 }).catch(() => null);
}
