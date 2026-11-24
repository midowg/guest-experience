import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { CopyObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isJpeg } from "@/lib/pra-wam/minutes-photos";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import { ServiceError } from "../../config";
import { isR2Configured, presignUpload, r2Config, removeObjects, uploadedStart } from "../../r2";

/*
 * Where Momen's files live (R2, private) and how they are reached:
 *   - a photo's id is derived from its owner and the phone's clientId (HMAC with the server's
 *     secret), so a queued photo sent again lands on the same files and the same row, and nobody
 *     can aim at someone else's files;
 *   - three files per photo: <id>.jpg (besar), <id>-kecil.jpg, <id>-ubin.jpg (Mozaik);
 *   - uploads (audit L4): the browser puts the files under tmp/main-wam/momen/ (presigned PUT, type
 *     and size signed, r2.ts); "simpan" checks their first bytes and copies them inside storage to
 *     main-wam/momen/, then removes the uploads. An upload never kept stays under tmp/, which the
 *     bucket's lifecycle rule empties after a day (KONTRAK §10: set once in the R2 dashboard);
 *   - views: presigned GET handed out unchanged for a while, so a list fetched again carries the
 *     same addresses and the browser keeps its cached pictures. How long depends on the size
 *     (VIEW_POLICY): the large photo closes within 15 minutes (audit L5), the grid's small copy
 *     within two hours, the Mozaik's tile within two days (audit R3).
 */

export type PhotoKeys = { besar: string; kecil: string; ubin: string };
/** The sizes a photo is kept in: kecil (480 px), besar (1600 px), ubin (160 px square, Mozaik). */
export type PhotoSize = keyof PhotoKeys;
const SIZES: readonly PhotoSize[] = ["besar", "kecil", "ubin"];
const filesUnder = (prefix: string, id: string): PhotoKeys => ({ besar: `${prefix}${id}.jpg`, kecil: `${prefix}${id}-kecil.jpg`, ubin: `${prefix}${id}-ubin.jpg` });

/** The kept files (the row's file_key, thumb_key, tile_key; moderation removes them by that prefix). */
export const PHOTO_PREFIX = "main-wam/momen/";
export const keysOf = (id: string): PhotoKeys => filesUnder(PHOTO_PREFIX, id);
/** Where the browser uploads before "simpan". The R2 lifecycle rule on `tmp/` deletes leftovers after 1 day. */
export const UPLOAD_PREFIX = "tmp/main-wam/momen/";
export const uploadKeysOf = (id: string): PhotoKeys => filesUnder(UPLOAD_PREFIX, id);

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

/** Three upload addresses under tmp/ (10 minutes each), type and exact size signed. */
export async function uploadAddresses(id: string, sizes: { size: number; thumbSize: number; tileSize: number }): Promise<PhotoKeys> {
  if (!storageReady()) throw notReady();
  const keys = uploadKeysOf(id);
  const [besar, kecil, ubin] = await Promise.all([
    presignUpload(keys.besar, "image/jpeg", sizes.size), presignUpload(keys.kecil, "image/jpeg", sizes.thumbSize), presignUpload(keys.ubin, "image/jpeg", sizes.tileSize),
  ]);
  return { besar, kecil, ubin };
}

/** The three uploads are there, with the agreed sizes, and are JPEGs; otherwise 422 (and the uploads are removed). */
export async function checkUploaded(id: string, sizes: { size: number; thumbSize: number; tileSize: number }): Promise<void> {
  if (!storageReady()) throw notReady();
  const keys = uploadKeysOf(id);
  let starts: Uint8Array[];
  try {
    starts = await Promise.all([uploadedStart(keys.besar, sizes.size), uploadedStart(keys.kecil, sizes.thumbSize), uploadedStart(keys.ubin, sizes.tileSize)]);
  } catch (error) {
    await removeUploads(id);
    throw error;
  }
  if (!starts.every(isJpeg)) { await removeUploads(id); throw new ServiceError(422, "Isi berkas bukan foto JPEG. Ambil ulang fotonya."); }
}

/** A kept file never changes under its key (the id is per photo): browsers may keep it as long as its address works. */
export const KEPT_CACHE_CONTROL = "private, max-age=31536000, immutable";

/**
 * "Simpan": the three checked uploads copied, inside storage, to the photo's own keys. A failed copy
 * answers 503 (the phone's queue tries again from the start and the copy overwrites); the uploads
 * stay until removeUploads or the lifecycle rule.
 */
export async function keepUploaded(id: string): Promise<PhotoKeys> {
  const storage = storageClient();
  if (!storage) throw notReady();
  const from = uploadKeysOf(id), to = keysOf(id);
  try {
    await Promise.all(SIZES.map(size => storage.s3.send(new CopyObjectCommand({
      Bucket: storage.bucket, Key: to[size], CopySource: `${storage.bucket}/${from[size].split("/").map(encodeURIComponent).join("/")}`,
      ContentType: "image/jpeg", CacheControl: KEPT_CACHE_CONTROL, MetadataDirective: "REPLACE",
    }))));
  } catch {
    throw new ServiceError(503, "Foto belum dapat disimpan. Terkirim sendiri sebentar lagi.");
  }
  return to;
}

/** The uploads of one photo (after "simpan", or given up); a failure is left to the lifecycle rule. */
export async function removeUploads(id: string): Promise<void> {
  if (!storageReady()) return;
  await removeObjects(Object.values(uploadKeysOf(id))).catch(() => undefined);
}

/** A photo's files, kept and uploaded (Hapus foto, Batalkan before it was kept), plus any `extra` keys. */
export async function removePhotoFiles(id: string, extra: (string | null | undefined)[] = []): Promise<void> {
  if (!storageReady()) return;
  const keys = [...Object.values(keysOf(id)), ...Object.values(uploadKeysOf(id)), ...extra.filter((key): key is string => !!key)];
  await removeObjects([...new Set(keys)]).catch(() => undefined);
}

/* ── Short-lived view addresses ─────────────────────────────────────────────────────────────── */

const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;

/**
 * Per size: one address is handed out for `window` (aligned to `offset`), and works for `valid`
 * from the window's start, so every address works at least `valid - window` after it was handed out.
 *   - besar (audit L5): a photo hidden by panitia, deleted, or no longer the person's kelompok's
 *     cannot be opened large with an old address after 15 minutes at most;
 *   - kecil: the gallery's grid keeps the same addresses for the hour (its cache stays);
 *   - ubin (audit R3): the Mozaik's 160 px tiles, only photos for everyone, keep their addresses
 *     for the day (new ones at 03.00 WIB), so phones and the TV download the tiles once a day.
 * R2 accepts up to 7 days.
 */
export const VIEW_POLICY: Record<PhotoSize, { window: number; offset: number; valid: number }> = {
  besar: { window: 5 * MINUTE, offset: 0, valid: 15 * MINUTE },
  kecil: { window: HOUR, offset: 0, valid: 2 * HOUR },
  ubin: { window: DAY, offset: 20 * HOUR, valid: 2 * DAY },
};

/** When the address handed out at `now` was signed, and when it stops working. */
export function viewWindow(size: PhotoSize, now = Date.now()): { signedAt: number; expiresAt: number } {
  const { window, offset, valid } = VIEW_POLICY[size];
  const signedAt = Math.floor((now - offset) / window) * window + offset;
  return { signedAt, expiresAt: signedAt + valid };
}

/**
 * How long a browser may reuse the redirect of mainWamApi.photoFile: at most 50 minutes, and five
 * minutes less than the address is sure to work (besar: 5 minutes, kecil and ubin: 50).
 */
export function redirectSeconds(size: PhotoSize): number {
  const { window, valid } = VIEW_POLICY[size];
  return Math.max(0, Math.min(50 * 60, (valid - window) / 1000 - 5 * 60));
}

let client: { key: string; s3: S3Client; bucket: string } | null = null;
function storageClient(): { s3: S3Client; bucket: string } | null {
  const config = r2Config();
  if (!config) return null;
  const key = `${config.accountId}:${config.accessKeyId}:${config.bucket}`;
  if (client?.key !== key) {
    client = { key, bucket: config.bucket, s3: new S3Client({ region: "auto", endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }) };
  }
  return client;
}

/**
 * A view address of a private file of the given size, the same throughout its window (VIEW_POLICY). With `download` (a plain
 * file name) the address answers Content-Disposition: attachment, so opening it saves the file instead of showing it.
 */
export async function viewAddress(key: string | null | undefined, size: PhotoSize, now = Date.now(), download?: string): Promise<string | null> {
  if (!key) return null;
  const view = storageClient();
  if (!view) return null;
  const { signedAt } = viewWindow(size, now);
  const disposition = download ? { ResponseContentDisposition: `attachment; filename="${download.replace(/[^0-9A-Za-z._-]/g, "")}"` } : {};
  return getSignedUrl(view.s3, new GetObjectCommand({ Bucket: view.bucket, Key: key, ...disposition }), { expiresIn: VIEW_POLICY[size].valid / 1000, signingDate: new Date(signedAt) });
}
