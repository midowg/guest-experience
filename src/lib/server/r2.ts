import "server-only";
import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { sniffPhoto, type PhotoKind } from "@/lib/image-signature";
import { ServiceError } from "./config";

type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

const NOT_READY = "Penyimpanan foto belum disiapkan. Isi R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, dan R2_BUCKET, lalu deploy ulang.";

/** The four R2 variables, or null while any is missing: the gallery then shows "not set up". */
export function r2Config(env: Record<string, string | undefined> = process.env): R2Config | null {
  const accountId = env.R2_ACCOUNT_ID?.trim(), accessKeyId = env.R2_ACCESS_KEY_ID?.trim(), secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim(), bucket = env.R2_BUCKET?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}
export const isR2Configured = () => r2Config() !== null;

let cached: { key: string; client: S3Client } | null = null;
function connect(): { client: S3Client; bucket: string } {
  const config = r2Config();
  if (!config) throw new ServiceError(503, NOT_READY);
  const key = `${config.accountId}:${config.accessKeyId}:${config.bucket}`;
  if (cached?.key !== key) {
    cached = { key, client: new S3Client({ region: "auto", endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }) };
  }
  return { client: cached.client, bucket: config.bucket };
}

/**
 * A ten-minute upload address for one object. Type and exact size are signed, so the browser can
 * upload only what the server agreed to; the key is always chosen by the server.
 */
export async function presignUpload(key: string, contentType: string, length: number): Promise<string> {
  const { client, bucket } = connect();
  return getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: length }), {
    expiresIn: 600, signableHeaders: new Set(["content-type", "content-length"]),
  });
}

/** A short-lived address to show or download a private object. */
export async function presignDownload(key: string, options: { seconds?: number; filename?: string } = {}): Promise<string> {
  const { client, bucket } = connect();
  return getSignedUrl(client, new GetObjectCommand({
    Bucket: bucket, Key: key,
    ...(options.filename ? { ResponseContentDisposition: `attachment; filename="${options.filename.replace(/[^\w.-]/g, "_")}"` } : {}),
  }), { expiresIn: options.seconds ?? 3600 });
}

/**
 * After an upload: the object exists, has the agreed size, and its first bytes are a photo of an
 * allowed kind. Anything else is refused (and the caller deletes it).
 */
export async function verifyUpload(key: string, length: number, allowed: PhotoKind[]): Promise<PhotoKind> {
  const { client, bucket } = connect();
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })).catch(() => null);
  if (!head) throw new ServiceError(422, "Berkas belum terunggah. Coba unggah ulang.");
  if (head.ContentLength !== length) throw new ServiceError(422, "Ukuran berkas tidak sesuai. Coba unggah ulang.");
  const start = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: "bytes=0-31" }));
  const kind = sniffPhoto(new Uint8Array(await start.Body!.transformToByteArray()));
  if (!kind || !allowed.includes(kind)) throw new ServiceError(422, "Berkas bukan foto JPEG, PNG, WebP, atau HEIC.");
  return kind;
}

export async function removeObjects(keys: string[]): Promise<void> {
  if (!keys.length) return;
  const { client, bucket } = connect();
  await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map(Key => ({ Key })), Quiet: true } }));
}
