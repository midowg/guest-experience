import { describe, expect, it } from "vitest";
import { defaultSettings, logSchema, logValues, uploadStartSchema } from "./rules";

const photo = { key: "wellbeing/2f1c6a4e-8b7d-4c3a-9e21-5d6f7a8b9c0d/0b9f3f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.jpg", mime: "image/jpeg", size: 812_345, token: `1795400000.${"a".repeat(64)}` };
const base = { code: "physical.steps", date: "2026-11-17", note: "", photos: [photo] };

describe("Catat form (17 Nov 2026)", () => {
  it("needs a type, a date and one to five photos", () => {
    expect(logSchema.safeParse({ ...base, steps: 9128 }).success).toBe(true);
    expect(logSchema.safeParse({ ...base, photos: [] }).success).toBe(false);
    expect(logSchema.safeParse({ ...base, photos: Array.from({ length: 6 }, (_, index) => ({ ...photo, key: photo.key.replace(".jpg", `${index}.jpg`) })) }).success).toBe(false);
    expect(logSchema.safeParse({ ...base, photos: [photo, photo] }).success).toBe(false);
    expect(logSchema.safeParse({ ...base, code: "Langkah" }).success).toBe(false);
    expect(logSchema.safeParse({ ...base, date: "17-11-2026" }).success).toBe(false);
    expect(logSchema.safeParse({ ...base, photos: [{ ...photo, token: "bukan" }] }).success).toBe(false);
  });
  it("trims the note and is not forced unless asked", () => {
    const parsed = logSchema.parse({ ...base, note: "  pagi di GBK  " });
    expect(parsed.note).toBe("pagi di GBK");
    expect(parsed.force).toBe(false);
  });
  it("agrees photos up to 8 MB as JPG, PNG or WebP (no HEIC: Periksa could not show it)", () => {
    expect(uploadStartSchema.safeParse({ mime: "image/heic", size: 3_000_000 }).success).toBe(false);
    expect(uploadStartSchema.safeParse({ mime: "image/gif", size: 3_000 }).success).toBe(false);
    expect(uploadStartSchema.safeParse({ mime: "image/jpeg", size: 9 * 1024 * 1024 }).success).toBe(false);
    expect(uploadStartSchema.safeParse({ mime: "image/jpeg", size: 0 }).success).toBe(false);
  });
});

describe("logValues", () => {
  it("keeps steps between 100 and the day's cap", () => {
    expect(logValues("steps", { steps: 9128, kcal: 50 }, defaultSettings)).toEqual({ ok: true, steps: 9128, kcal: null, minutes: null });
    expect(logValues("steps", { steps: 99 }, defaultSettings)).toMatchObject({ ok: false, fieldErrors: { steps: [expect.stringMatching(/minimal 100/)] } });
    expect(logValues("steps", { steps: 60001 }, defaultSettings)).toMatchObject({ ok: false, fieldErrors: { steps: [expect.stringMatching(/60\.000/)] } });
    expect(logValues("steps", {}, defaultSettings)).toMatchObject({ ok: false });
  });
  it("keeps a sport's kcal between 1 and the cap, rounded, with optional minutes", () => {
    expect(logValues("kcal", { kcal: 412.6, minutes: 45 }, defaultSettings)).toEqual({ ok: true, steps: null, kcal: 413, minutes: 45 });
    expect(logValues("kcal", { kcal: 300 }, defaultSettings)).toEqual({ ok: true, steps: null, kcal: 300, minutes: null });
    expect(logValues("kcal", { kcal: 0.4 }, defaultSettings)).toMatchObject({ ok: false, fieldErrors: { kcal: [expect.any(String)] } });
    expect(logValues("kcal", { kcal: 3001 }, defaultSettings)).toMatchObject({ ok: false, fieldErrors: { kcal: [expect.stringMatching(/3\.000/)] } });
    expect(logValues("kcal", { kcal: null }, defaultSettings)).toMatchObject({ ok: false });
  });
  it("stores nothing extra for a fixed-points activity", () => {
    expect(logValues("fixed", { steps: 5000, kcal: 200, minutes: 30 }, defaultSettings)).toEqual({ ok: true, steps: null, kcal: null, minutes: null });
  });
});
