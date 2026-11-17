import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isJpeg } from "@/lib/pra-wam/minutes-photos";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import { ServiceError } from "../../config";
import { isR2Configured, presignUpload, r2Config, removeObjects, uploadedStart } from "../../r2";

/*
 * Where Momen's files live (R2, private, under main-wam/momen/) and how they are reached:
 *   - a photo's id is derived from its owner and the phone's clientId (HMAC with the server's
 *     secret), so a queued photo sent again lands on the same files and the same row, and nobody
 *     can aim at someone else's files;
 *   - three files per photo: <id>.jpg (besar), <id>-kecil.jpg, <id>-ubin.jpg (Mozaik);
 *   - uploads: presigned PUT with type and size signed (r2.ts), then the first bytes checked;
 *   - views: presigned GET signed at the start of the hour and valid two hours, so a list fetched
 *     again within the hour carries the same addresses and the browser keeps its cached pictures.
 */

export type PhotoKeys = { besar: string; kecil: string; ubin: string };
export const keysOf = (id: string): PhotoKeys => ({ besar: `main-wam/momen/${id}.jpg`, kecil: `main-wam/momen/${id}-kecil.jpg`, ubin: `main-wam/momen/${id}-ubin.jpg` });

function secret(): string {
  const value = praWamSecret();
  if (!value) throw new ServiceError(503, "Login WAM belum disiapkan.");
  return value;
}

/** The photo's id for one owner's phone photo: a v4-shaped uuid from an HMAC (stable, unguessable). */
export function photoIdFor(ownerId: string, clientId: string, key = secret()): string {
  const bytes = createHmac("sha256", key).update(`mw-momen\0${ownerId}\0${clientId.toLowerCase()}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The upload token: what was agreed (id and sizes), until when. */
export type Agreed = { id: string; size: number; thumbSize: number; tileSize: number; width: number; height: number };
const TOKEN_SECONDS = 15 * 60;
const signature = (agreed: Agreed, expires: number, key: string) =>
  createHmac("sha256", key).update(`mw-momen-unggah\0${agreed.id}\0${agreed.size}\0${agreed.thumbSize}\0${agreed.tileSize}\0${agreed.width}\0${agreed.height}\0${expires}`).digest("hex");

export function uploadToken(agreed: Agreed, now = Date.now(), key = secret()): string {
  const expires = Math.floor(now / 1000) + TOKEN_SECONDS;
  return `${expires}.${signature(agreed, expires, key)}`;
}

export function tokenMatches(token: string, agreed: Agreed, now = Date.now(), key = secret()): boolean {
  const [expiresText, given] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isInteger(expires) || expires * 1000 < now || !/^[0-9a-f]{64}$/.test(given ?? "")) return false;
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(signature(agreed, expires, key), "hex"));
}

export const storageReady = () => isR2Configured();
const notReady = () => new ServiceError(503, "Penyimpanan foto belum disiapkan. Hubungi admin WAM.");

/** Three upload addresses (10 minutes each), type and exact size signed. */
export async function uploadAddresses(id: string, sizes: { size: number; thumbSize: number; tileSize: number }): Promise<PhotoKeys> {
  if (!storageReady()) throw notReady();
  const keys = keysOf(id);
  const [besar, kecil, ubin] = await Promise.all([
    presignUpload(keys.besar, "image/jpeg", sizes.size), presignUpload(keys.kecil, "image/jpeg", sizes.thumbSize), presignUpload(keys.ubin, "image/jpeg", sizes.tileSize),
  ]);
  return { besar, kecil, ubin };
}

/** The three files are there, with the agreed sizes, and are JPEGs; otherwise 422 (and they are removed). */
export async function checkUploaded(id: string, sizes: { size: number; thumbSize: number; tileSize: number }): Promise<void> {
  if (!storageReady()) throw notReady();
  const keys = keysOf(id);
  let starts: Uint8Array[];
  try {
    starts = await Promise.all([uploadedStart(keys.besar, sizes.size), uploadedStart(keys.kecil, sizes.thumbSize), uploadedStart(keys.ubin, sizes.tileSize)]);
  } catch (error) {
    await removePhotoFiles(id);
    throw error;
  }
  if (!starts.every(isJpeg)) { await removePhotoFiles(id); throw new ServiceError(422, "Isi berkas bukan foto JPEG. Ambil ulang fotonya."); }
}

export async function removePhotoFiles(id: string, extra: (string | null | undefined)[] = []): Promise<void> {
  if (!storageReady()) return;
  const keys = keysOf(id);
  await removeObjects([...new Set([keys.besar, keys.kecil, keys.ubin, ...extra.filter((key): key is string => !!key)])]).catch(() => undefined);
}

/* ── Short-lived view addresses ───────────────────────────────────────────────────────────────── */

const HOUR = 60 * 60_000;
let client: { key: string; s3: S3Client; bucket: string } | null = null;
function viewClient(): { s3: S3Client; bucket: string } | null {
  const config = r2Config();
  if (!config) return null;
  const key = `${config.accountId}:${config.accessKeyId}:${config.bucket}`;
  if (client?.key !== key) {
    client = { key, bucket: config.bucket, s3: new S3Client({ region: "auto", endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }) };
  }
  return client;
}

/** A view address of a private file, the same for the whole hour (valid until the next one ends). */
export async function viewAddress(key: string | null | undefined, now = Date.now()): Promise<string | null> {
  if (!key) return null;
  const view = viewClient();
  if (!view) return null;
  const signingDate = new Date(Math.floor(now / HOUR) * HOUR);
  return getSignedUrl(view.s3, new GetObjectCommand({ Bucket: view.bucket, Key: key }), { expiresIn: 2 * 60 * 60, signingDate });
}
