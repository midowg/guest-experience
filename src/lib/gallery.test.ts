import { describe, expect, it } from "vitest";
import { fitWithin, galleryOpen, photoPatchSchema, uploadRequestSchema } from "./gallery";
import { r2Config } from "./server/r2";

describe("gallery", () => {
  it("scales the long edge down, never up", () => {
    expect(fitWithin(6000, 4000, 2048)).toEqual({ width: 2048, height: 1365 });
    expect(fitWithin(3000, 4500, 480)).toEqual({ width: 320, height: 480 });
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });

  it("stays open until six months after the event", () => {
    const event = { starts_at: "2026-11-02T09:00:00+07:00", ends_at: "2026-11-03T17:00:00+07:00" };
    expect(galleryOpen(event, Date.parse("2027-04-30T00:00:00Z"))).toBe(true);
    expect(galleryOpen(event, Date.parse("2027-05-10T00:00:00Z"))).toBe(false);
  });

  it("limits upload sizes", () => {
    const ok = { original: { type: "image/jpeg", size: 5_000_000 }, large: { size: 900_000 }, thumb: { size: 50_000 }, width: 4000, height: 3000 };
    expect(uploadRequestSchema.safeParse(ok).success).toBe(true);
    expect(uploadRequestSchema.safeParse({ ...ok, original: { type: "image/jpeg", size: 30_000_000 } }).success).toBe(false);
    expect(uploadRequestSchema.safeParse({ ...ok, thumb: { size: 600_000 } }).success).toBe(false);
  });

  it("only lets review change to pending, ready or hidden", () => {
    expect(photoPatchSchema.safeParse({ status: "ready" }).success).toBe(true);
    expect(photoPatchSchema.safeParse({ status: "uploading" }).success).toBe(false);
    expect(photoPatchSchema.safeParse({}).success).toBe(false);
  });

  it("treats storage as not set up until all four R2 variables are present", () => {
    const all = { R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "b", R2_SECRET_ACCESS_KEY: "c", R2_BUCKET: "d" };
    expect(r2Config(all)).toEqual({ accountId: "a", accessKeyId: "b", secretAccessKey: "c", bucket: "d" });
    expect(r2Config({ ...all, R2_BUCKET: " " })).toBeNull();
    expect(r2Config({})).toBeNull();
  });
});
