import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { ImageProcessingError, plannedWidths, resizeImage, TARGET_WIDTHS } from "@/lib/server/images";

/** A plain JPEG of the given size, no metadata. */
async function jpeg(width: number, height: number): Promise<Uint8Array> {
  const buffer = await sharp({ create: { width, height, channels: 3, background: { r: 30, g: 90, b: 160 } } }).jpeg().toBuffer();
  return new Uint8Array(buffer);
}

/** A PNG of the given size. */
async function png(width: number, height: number): Promise<Uint8Array> {
  const buffer = await sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } }).png().toBuffer();
  return new Uint8Array(buffer);
}

/**
 * A landscape JPEG whose EXIF says orientation 6 ("rotate 90° clockwise to display").
 * A viewer that honours EXIF shows it as portrait; one that ignores EXIF shows it sideways.
 */
async function rotatedJpeg(storedWidth: number, storedHeight: number): Promise<Uint8Array> {
  const buffer = await sharp({ create: { width: storedWidth, height: storedHeight, channels: 3, background: { r: 10, g: 150, b: 60 } } })
    .withExif({ IFD0: { Make: "AgenUji", Model: "KameraPalsu" } })
    // Only `withMetadata`'s deprecated `exif` field is discouraged; `orientation` is the supported way to set the tag.
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  return new Uint8Array(buffer);
}

/** A JPEG carrying obvious EXIF tags, so their absence after resizing is meaningful. */
async function taggedJpeg(width: number, height: number): Promise<Uint8Array> {
  const buffer = await sharp({ create: { width, height, channels: 3, background: { r: 120, g: 120, b: 20 } } })
    .withExif({ IFD0: { Make: "AgenUji", Model: "KameraPalsu", Copyright: "RahasiaLokasi" }, IFD2: { GPSLatitudeRef: "S" } })
    .jpeg()
    .toBuffer();
  return new Uint8Array(buffer);
}

describe("plannedWidths", () => {
  it("renders every target below the source plus the capped source width", () => {
    expect(plannedWidths(4000)).toEqual([480, 1024, 2048]);
    expect(plannedWidths(2048)).toEqual([480, 1024, 2048]);
  });
  it("never plans a width above the source", () => {
    expect(plannedWidths(1500)).toEqual([480, 1024, 1500]);
    expect(plannedWidths(700)).toEqual([480, 700]);
    expect(plannedWidths(300)).toEqual([300]);
  });
});

describe("resizeImage", () => {
  it("produces WebP at 480/1024/2048 for a large photo", async () => {
    const { variants } = await resizeImage(await jpeg(3000, 2000), "image/jpeg");
    expect(variants.map(variant => variant.width)).toEqual([...TARGET_WIDTHS]);
    for (const variant of variants) {
      expect(variant.contentType).toBe("image/webp");
      const metadata = await sharp(Buffer.from(variant.bytes)).metadata();
      expect(metadata.format).toBe("webp");
      // Declared width must match the actual pixels, and the 3:2 aspect ratio must survive.
      expect(metadata.width).toBe(variant.width);
      expect(metadata.height).toBe(Math.round(variant.width * 2 / 3));
      expect(variant.height).toBe(metadata.height);
    }
  });

  it("does not enlarge a photo smaller than the smallest target", async () => {
    const { variants } = await resizeImage(await png(320, 240), "image/png");
    expect(variants).toHaveLength(1);
    expect(variants[0].width).toBe(320);
    const metadata = await sharp(Buffer.from(variants[0].bytes)).metadata();
    expect(metadata.width).toBe(320);
    expect(metadata.height).toBe(240);
  });

  it("keeps a mid-sized photo at its own width instead of upscaling to 2048", async () => {
    const { variants } = await resizeImage(await jpeg(1500, 1000), "image/jpeg");
    expect(variants.map(variant => variant.width)).toEqual([480, 1024, 1500]);
    expect(Math.max(...variants.map(variant => variant.width))).toBeLessThanOrEqual(1500);
  });

  it("strips EXIF from every variant", async () => {
    const { variants } = await resizeImage(await taggedJpeg(2400, 1600), "image/jpeg");
    // The fixture really does carry the tags, otherwise this test proves nothing.
    const before = await sharp(Buffer.from(await taggedJpeg(2400, 1600))).metadata();
    expect(before.exif).toBeDefined();
    expect(before.exif!.toString("latin1")).toContain("AgenUji");

    for (const variant of variants) {
      const metadata = await sharp(Buffer.from(variant.bytes)).metadata();
      expect(metadata.exif).toBeUndefined();
      expect(metadata.xmp).toBeUndefined();
      expect(metadata.iptc).toBeUndefined();
      // No stray copy of the tags anywhere in the bytes.
      expect(Buffer.from(variant.bytes).toString("latin1")).not.toContain("RahasiaLokasi");
    }
  });

  it("bakes in EXIF orientation so the photo is not sideways", async () => {
    // Stored 1600x900 landscape, EXIF orientation 6 => displayed as 900x1600 portrait.
    const bytes = await rotatedJpeg(1600, 900);
    const source = await sharp(Buffer.from(bytes)).metadata();
    expect(source.orientation).toBe(6);
    expect([source.width, source.height]).toEqual([1600, 900]);

    const { variants } = await resizeImage(bytes, "image/jpeg");
    // The portrait display width is 900, so 2048 is not planned.
    expect(variants.map(variant => variant.width)).toEqual([480, 900]);
    for (const variant of variants) {
      const metadata = await sharp(Buffer.from(variant.bytes)).metadata();
      // Portrait after rotation, and no leftover orientation flag to rotate it twice.
      expect(metadata.height).toBeGreaterThan(metadata.width);
      expect(metadata.width).toBe(variant.width);
      expect(metadata.height).toBe(Math.round(variant.width * 16 / 9));
      expect(metadata.orientation).toBeUndefined();
    }
  });

  it("rejects bytes that are not an image", async () => {
    const text = new Uint8Array(Buffer.from("ini bukan gambar, hanya teks biasa yang dinamai .jpg"));
    await expect(resizeImage(text, "image/jpeg")).rejects.toBeInstanceOf(ImageProcessingError);
  });

  it("rejects a truncated image instead of reporting success", async () => {
    const full = await jpeg(1200, 800);
    await expect(resizeImage(full.subarray(0, 64), "image/jpeg")).rejects.toBeInstanceOf(ImageProcessingError);
  });

  it("rejects empty input and unsupported types", async () => {
    await expect(resizeImage(new Uint8Array(0), "image/jpeg")).rejects.toBeInstanceOf(ImageProcessingError);
    await expect(resizeImage(await jpeg(600, 400), "image/svg+xml")).rejects.toBeInstanceOf(ImageProcessingError);
  });
});
