import "server-only";

/** One rendered size of an uploaded photo, ready to be stored. */
export type ImageVariant = { width: number; height: number; bytes: Uint8Array; contentType: string };
export type ResizeResult = { variants: ImageVariant[] };

/** Raised whenever the photo could not be optimised. The caller must report this honestly, never swallow it. */
export class ImageProcessingError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "ImageProcessingError";
  }
}

export const TARGET_WIDTHS = [480, 1024, 2048] as const;
export const VARIANT_CONTENT_TYPE = "image/webp";
/** Mirrors the magic-number allowlist in the upload endpoint. */
const DECODABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

/**
 * Widths to render for a photo whose displayed width is `source`.
 * Never enlarges: a photo narrower than the smallest target yields a single variant at its own width.
 */
export function plannedWidths(source: number): number[] {
  const largest = TARGET_WIDTHS[TARGET_WIDTHS.length - 1];
  const widths = TARGET_WIDTHS.filter(width => width < source);
  return [...new Set([...widths, Math.min(source, largest)])].sort((a, b) => a - b);
}

/**
 * Renders WebP variants at 480/1024/2048 px. EXIF is dropped and EXIF orientation is baked in
 * so the photo is never shown sideways. Throws `ImageProcessingError` when sharp cannot be
 * loaded or cannot decode the bytes — the upload route then stores the original and says so.
 */
export async function resizeImage(bytes: Uint8Array, detectedType: string): Promise<ResizeResult> {
  if (!DECODABLE.has(detectedType)) throw new ImageProcessingError(`Tipe gambar tidak didukung untuk pengecilan: ${detectedType}`);
  if (bytes.byteLength === 0) throw new ImageProcessingError("Berkas gambar kosong.");

  let sharp: typeof import("sharp").default;
  try {
    sharp = (await import("sharp")).default;
  } catch (error) {
    throw new ImageProcessingError("Pustaka pengolah gambar (sharp) tidak dapat dimuat di server ini.", error);
  }

  // Buffer copy: sharp must not read a view that the caller may reuse.
  const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const open = () => sharp(input, { failOn: "error" });

  let source: number;
  try {
    const metadata = await open().metadata();
    // autoOrient.width already accounts for the EXIF orientation flag.
    source = metadata.autoOrient?.width || metadata.width;
    if (!source || !Number.isFinite(source)) throw new Error("Lebar gambar tidak terbaca.");
  } catch (error) {
    throw new ImageProcessingError("Gambar tidak dapat dibaca oleh pengolah gambar.", error);
  }

  const variants: ImageVariant[] = [];
  for (const width of plannedWidths(source)) {
    try {
      const { data, info } = await open()
        .autoOrient()
        .resize({ width, withoutEnlargement: true, fit: "inside" })
        // No .keepExif()/.withMetadata(): sharp drops EXIF, ICC, IPTC and XMP by default.
        .webp({ quality: 82, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      variants.push({ width: info.width, height: info.height, bytes: new Uint8Array(data), contentType: VARIANT_CONTENT_TYPE });
    } catch (error) {
      throw new ImageProcessingError(`Gambar gagal dikecilkan ke lebar ${width} px.`, error);
    }
  }
  if (variants.length === 0) throw new ImageProcessingError("Tidak ada varian gambar yang dihasilkan.");
  return { variants };
}
