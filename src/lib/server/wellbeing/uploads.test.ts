import { describe, expect, it } from "vitest";
import { isOwnUploadKey, UPLOAD_TOKEN_SECONDS, uploadKeyFor, uploadToken, uploadTokenMatches } from "./uploads";

const secret = "w".repeat(40);
const me = "2f1c6a4e-8b7d-4c3a-9e21-5d6f7a8b9c0d";
const someoneElse = "7a8b9c0d-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const now = Date.parse("2026-11-17T03:00:00Z");

describe("proof photo keys", () => {
  it("are chosen by the server under the person's own folder", () => {
    const key = uploadKeyFor(me, "0b9f3f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", "image/webp");
    expect(key).toBe(`wellbeing/${me}/0b9f3f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.webp`);
    expect(uploadKeyFor(me, "0b9f3f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", "image/jpeg")).toMatch(/\.jpg$/);
    expect(isOwnUploadKey(key, me, "image/webp")).toBe(true);
    expect(isOwnUploadKey(key, someoneElse, "image/webp")).toBe(false);
    expect(isOwnUploadKey(key, me, "image/jpeg")).toBe(false);
    expect(isOwnUploadKey(`wellbeing/${me}/../${someoneElse}/x.webp`, me, "image/webp")).toBe(false);
    expect(isOwnUploadKey(`pra-wam/absen/${me}/0b9f3f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.webp`, me, "image/webp")).toBe(false);
  });
});

describe("upload tokens", () => {
  const photo = { key: uploadKeyFor(me, "0b9f3f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", "image/jpeg"), mime: "image/jpeg", size: 812_345 };
  it("round-trip for the same person, key, type and size within the hour", () => {
    const token = uploadToken(secret, photo, me, now);
    expect(token).toMatch(/^\d{10}\.[0-9a-f]{64}$/);
    expect(uploadTokenMatches(secret, token, photo, me, now + 59 * 60 * 1000)).toBe(true);
  });
  it("refuse another person, a changed photo, another secret, or an old token", () => {
    const token = uploadToken(secret, photo, me, now);
    expect(uploadTokenMatches(secret, token, photo, someoneElse, now)).toBe(false);
    expect(uploadTokenMatches(secret, token, { ...photo, size: photo.size + 1 }, me, now)).toBe(false);
    expect(uploadTokenMatches(secret, token, { ...photo, mime: "image/png" }, me, now)).toBe(false);
    expect(uploadTokenMatches(secret, token, { ...photo, key: photo.key.replace(".jpg", ".png") }, me, now)).toBe(false);
    expect(uploadTokenMatches("x".repeat(40), token, photo, me, now)).toBe(false);
    expect(uploadTokenMatches(null, token, photo, me, now)).toBe(false);
    expect(uploadTokenMatches(secret, token, photo, me, now + (UPLOAD_TOKEN_SECONDS + 1) * 1000)).toBe(false);
    expect(uploadTokenMatches(secret, "123.abc", photo, me, now)).toBe(false);
  });
});
