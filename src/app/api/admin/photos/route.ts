import { randomUUID } from "node:crypto";
import { createPrivilegedClient } from "@/lib/server/supabase/admin";
import { publicConfig, ServiceError } from "@/lib/server/config";
import { checkOrigin, databaseError, failure, success } from "@/lib/server/http";
import { resizeImage } from "@/lib/server/images";
import type { ImageSource } from "@/lib/types";
import { requireApiAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

const BUCKET = "event-photos";
const MAX_BYTES = 8 * 1024 * 1024;
// Extensions are derived from the detected type, never from the uploaded filename.
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };

/** Magic-number check: a renamed file must not pass as an image. */
function sniff(bytes: Uint8Array): string | null {
  const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  const tag = (offset: number, text: string) => [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
  if (tag(0, "RIFF") && tag(8, "WEBP")) return "image/webp";
  if (tag(4, "ftyp") && (tag(8, "avif") || tag(8, "avis"))) return "image/avif";
  return null;
}

type Storage = Awaited<ReturnType<typeof createPrivilegedClient>>["storage"];

async function store(storage: Storage, path: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const { error } = await storage.from(BUCKET).upload(path, bytes, { contentType, cacheControl: "31536000", upsert: false });
  if (error) {
    if (/bucket/i.test(error.message)) throw new ServiceError(503, "Penyimpanan foto belum disiapkan. Jalankan migrasi penyimpanan terlebih dahulu.");
    databaseError(error);
  }
  const { data } = storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl || `${publicConfig().url}/storage/v1/object/public/${BUCKET}/${path}`;
}

export async function POST(request: Request) {
  try {
    await requireApiAdmin();
    checkOrigin(request);
    const length = request.headers.get("content-length");
    if (length && Number(length) > MAX_BYTES + 8192) throw new ServiceError(413, "Ukuran foto maksimal 8 MB.");

    const form = await request.formData().catch(() => { throw new ServiceError(400, "Unggahan tidak terbaca."); });
    const file = form.get("file");
    if (!(file instanceof File)) throw new ServiceError(400, "Pilih satu berkas foto.");
    if (file.size === 0) throw new ServiceError(400, "Berkas kosong.");
    if (file.size > MAX_BYTES) throw new ServiceError(413, "Ukuran foto maksimal 8 MB.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = sniff(bytes);
    if (!detected) throw new ServiceError(415, "Format tidak dikenali. Gunakan JPG, PNG, WebP, atau AVIF.");

    // Server-generated names only; the uploaded filename never reaches storage.
    const base = `${new Date().getUTCFullYear()}/${randomUUID()}`;
    const storage = (await createPrivilegedClient()).storage;

    // Resizing is best-effort. A failure here must degrade honestly, not pretend to succeed.
    const resized = await resizeImage(bytes, detected).catch(() => null);

    if (!resized) {
      const path = `${base}.${TYPES[detected]}`;
      const url = await store(storage, path, bytes, detected);
      return success(
        { url, path, srcset: [] as ImageSource[] },
        "Foto terunggah, tetapi belum dioptimalkan: server gagal membuat versi kecil, sehingga berkas asli yang dipakai. Unggah ulang nanti bila ingin versi ringan.",
      );
    }

    const srcset: ImageSource[] = [];
    for (const variant of resized.variants) {
      const url = await store(storage, `${base}-${variant.width}.webp`, variant.bytes, variant.contentType);
      srcset.push({ width: variant.width, url });
    }
    srcset.sort((a, b) => a.width - b.width);

    // The widest variant is the plain-`src` fallback for browsers that ignore srcset.
    const largest = srcset[srcset.length - 1];
    return success({ url: largest.url, path: `${base}-${largest.width}.webp`, srcset }, "Foto terunggah dan dioptimalkan.");
  } catch (error) {
    return failure(error);
  }
}
