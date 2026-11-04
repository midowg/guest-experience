import { describe, expect, it } from "vitest";
import {
  encodeWithinLimit, isOwnPhotoKey, MAX_PHOTO_BYTES, photoColumnMissing, photoConfirmSchema, photoKeyFor, photoKeyPattern,
  photoMagicMatches, photoPath, photoStartSchema, sourceProblem, squareCrop, type PhotoMime,
} from "./photo";

const me = "11111111-2222-4333-8444-555555555555";
const other = "99999999-2222-4333-8444-555555555555";
const object = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const bytes = (...values: (number | string)[]) => new Uint8Array(values.flatMap(value => typeof value === "string" ? [...value].map(char => char.charCodeAt(0)) : [value]));

describe("storage key", () => {
  it("is pra-wam/foto/<person>/<uuid>.<ext>, the shape the migration allows", () => {
    expect(photoKeyFor(me, object, "image/webp")).toBe(`pra-wam/foto/${me}/${object}.webp`);
    expect(photoKeyFor(me, object, "image/jpeg")).toBe(`pra-wam/foto/${me}/${object}.jpg`);
    expect(photoKeyPattern.test(photoKeyFor(me, object, "image/jpeg"))).toBe(true);
    expect(photoKeyPattern.test(`pra-wam/foto/${me}/${object}.png`)).toBe(false);
    expect(photoKeyPattern.test(`pra-wam/dokumen/${me}/${object}.webp`)).toBe(false);
  });

  it("must be the person's own folder and the agreed type", () => {
    expect(isOwnPhotoKey(photoKeyFor(me, object, "image/webp"), me, "image/webp")).toBe(true);
    expect(isOwnPhotoKey(photoKeyFor(other, object, "image/webp"), me, "image/webp")).toBe(false);
    expect(isOwnPhotoKey(photoKeyFor(me, object, "image/jpeg"), me, "image/webp")).toBe(false);
    expect(isOwnPhotoKey(`pra-wam/foto/${me}/../${object}.webp`, me, "image/webp")).toBe(false);
  });
});

describe("agreed size and type", () => {
  it("allows WebP and JPEG up to 200 KB only", () => {
    expect(photoStartSchema.safeParse({ mime: "image/webp", size: MAX_PHOTO_BYTES }).success).toBe(true);
    expect(photoStartSchema.safeParse({ mime: "image/webp", size: MAX_PHOTO_BYTES + 1 }).success).toBe(false);
    expect(photoStartSchema.safeParse({ mime: "image/jpeg", size: 0 }).success).toBe(false);
    expect(photoStartSchema.safeParse({ mime: "image/png", size: 1000 }).success).toBe(false);
  });

  it("confirms only a photo key with an expiring token", () => {
    const base = { mime: "image/webp", size: 1000, key: photoKeyFor(me, object, "image/webp") };
    const token = `1790000000.${"a".repeat(64)}`;
    expect(photoConfirmSchema.safeParse({ ...base, token }).success).toBe(true);
    expect(photoConfirmSchema.safeParse({ ...base, token: "a".repeat(64) }).success).toBe(false);
    expect(photoConfirmSchema.safeParse({ ...base, key: `pra-wam/dokumen/${object}/x.webp`, token }).success).toBe(false);
  });
});

describe("first bytes", () => {
  it("know WebP (RIFF, size, WEBP) and JPEG (FF D8 FF)", () => {
    const webp = bytes("RIFF", 0x10, 0, 0, 0, "WEBPVP8 ");
    const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
    expect(photoMagicMatches("image/webp", webp)).toBe(true);
    expect(photoMagicMatches("image/jpeg", jpeg)).toBe(true);
    expect(photoMagicMatches("image/webp", jpeg)).toBe(false);
    expect(photoMagicMatches("image/jpeg", webp)).toBe(false);
    expect(photoMagicMatches("image/webp", bytes("RIFF", 0, 0, 0, 0, "WAVEfmt "))).toBe(false);
    expect(photoMagicMatches("image/jpeg", bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe(false);
    expect(photoMagicMatches("image/webp", bytes("RIFF"))).toBe(false);
  });
});

describe("picked file", () => {
  it("accepts common photos up to 15 MB, HEIC by name when the browser gives no type", () => {
    expect(sourceProblem({ name: "a.jpg", type: "image/jpeg", size: 3_000_000 })).toBeNull();
    expect(sourceProblem({ name: "IMG_1.HEIC", type: "", size: 2_000_000 })).toBeNull();
    expect(sourceProblem({ name: "a.png", type: "image/png", size: 16 * 1024 * 1024 })).toMatch(/15 MB/);
    expect(sourceProblem({ name: "a.gif", type: "image/gif", size: 1000 })).toMatch(/JPG, PNG, WebP, atau HEIC/);
    expect(sourceProblem({ name: "a.mp4", type: "video/mp4", size: 1000 })).not.toBeNull();
  });

  it("is cropped to its middle square", () => {
    expect(squareCrop(4000, 3000)).toEqual({ sx: 500, sy: 0, side: 3000 });
    expect(squareCrop(1080, 1920)).toEqual({ sx: 0, sy: 420, side: 1080 });
    expect(squareCrop(320, 320)).toEqual({ sx: 0, sy: 0, side: 320 });
  });
});

describe("quality steps", () => {
  const blob = (type: string, size: number) => new Blob([new Uint8Array(size)], { type });

  it("starts with WebP at 0.82 and stops at the first that fits", async () => {
    const tried: [PhotoMime, number][] = [];
    const result = await encodeWithinLimit(async (mime, quality) => { tried.push([mime, quality]); return blob(mime, quality > 0.7 ? 300_000 : 150_000); });
    expect(tried).toEqual([["image/webp", 0.82], ["image/webp", 0.74], ["image/webp", 0.66]]);
    expect(result).toMatchObject({ mime: "image/webp", quality: 0.66 });
    expect(result.blob.size).toBeLessThanOrEqual(MAX_PHOTO_BYTES);
  });

  it("uses JPEG from 0.85 when the browser cannot write WebP (it answers PNG)", async () => {
    const tried: [PhotoMime, number][] = [];
    const result = await encodeWithinLimit(async (mime, quality) => { tried.push([mime, quality]); return mime === "image/webp" ? blob("image/png", 500_000) : blob(mime, 100_000); });
    expect(tried).toEqual([["image/webp", 0.82], ["image/jpeg", 0.85]]);
    expect(result).toMatchObject({ mime: "image/jpeg", quality: 0.85 });
  });

  it("says so when even the lowest step is too large", async () => {
    await expect(encodeWithinLimit(async mime => blob(mime, 400_000))).rejects.toThrow(/200 KB/);
  });
});

describe("photo address", () => {
  it("is null without a photo and names the version otherwise", () => {
    const key = photoKeyFor(me, object, "image/webp");
    expect(photoPath({ id: me, photoKey: null, photoUpdatedAt: null })).toBeNull();
    expect(photoPath({ id: me, photoKey: key, photoUpdatedAt: "2026-11-04T03:00:00.000Z" })).toBe(`/api/wam/photo/${me}?v=${Date.parse("2026-11-04T03:00:00.000Z")}`);
    expect(photoPath({ id: me, photoKey: key, photoUpdatedAt: null })).toBe(`/api/wam/photo/${me}`);
  });

  it("treats missing photo columns as not migrated yet", () => {
    for (const code of ["42703", "PGRST204", "42P01", "PGRST205"]) expect(photoColumnMissing({ code })).toBe(true);
    expect(photoColumnMissing({ code: "23505", message: "duplicate key" })).toBe(false);
  });
});
