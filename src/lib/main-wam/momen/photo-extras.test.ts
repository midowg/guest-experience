import { describe, expect, it } from "vitest";
import { photoConfirmSchema, photoStartSchema } from "./filters";

/*
 * The two optional extras of a Momen photo (docs/main-wam/KONTRAK.md §13): the friends tagged and the coarse position. Both can be
 * left out (an older phone, a gallery pick), and nothing outside the schema gets through.
 */

const base = { clientId: "22222222-2222-4222-8222-222222222222", sessionId: null, takenAt: "2027-01-05T08:20:00.000Z", width: 1280, height: 1600, size: 400_000, thumbSize: 40_000, tileSize: 9_000 };
const ID = "33333333-3333-4333-8333-333333333333";

describe("photoStartSchema's extras", () => {
  it("fills in no tags, no position and not from the gallery when they are left out", () => {
    expect(photoStartSchema.parse(base)).toMatchObject({ tags: [], geo: null, gallery: false });
  });

  it("takes people, a position and the gallery flag, in both steps", () => {
    const extras = { tags: [ID], geo: { latitude: -7.88, longitude: 112.52, accuracy: 14 }, gallery: true };
    expect(photoStartSchema.parse({ ...base, ...extras })).toMatchObject(extras);
    expect(photoConfirmSchema.parse({ ...base, ...extras, token: `1767000000.${"a".repeat(64)}` })).toMatchObject(extras);
  });

  it("has no limit on how many people one photo tags (KONTRAK §38): a whole department, and more than the old six", () => {
    const ids = Array.from({ length: 120 }, (_, index) => `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`);
    expect(photoStartSchema.parse({ ...base, tags: ids.slice(0, 7) }).tags).toHaveLength(7);
    expect(photoStartSchema.parse({ ...base, tags: ids }).tags).toHaveLength(120);
    expect(photoConfirmSchema.safeParse({ ...base, tags: ids, token: `1767000000.${"a".repeat(64)}` }).success).toBe(true);
  });

  it("refuses a person who is not an id, a position outside the globe and a position with extra fields", () => {
    expect(photoStartSchema.safeParse({ ...base, tags: ["Sari"] }).success).toBe(false);
    expect(photoStartSchema.safeParse({ ...base, geo: { latitude: 91, longitude: 0, accuracy: 5 } }).success).toBe(false);
    expect(photoStartSchema.safeParse({ ...base, geo: { latitude: 0, longitude: 181, accuracy: 5 } }).success).toBe(false);
    expect(photoStartSchema.safeParse({ ...base, geo: { latitude: 0, longitude: 0, accuracy: -1 } }).success).toBe(false);
    expect(photoStartSchema.safeParse({ ...base, geo: { latitude: 0, longitude: 0, accuracy: 5, altitude: 3 } }).success).toBe(false);
  });
});
