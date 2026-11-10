import { describe, expect, it } from "vitest";
import { hashTvKey, looksLikeTvKey, newTvKey, tvKeyHint } from "./tv-key";

describe("TV keys", () => {
  it("make a new key each time, in the shape the address expects", () => {
    const first = newTvKey(), second = newTvKey();
    expect(first).not.toBe(second);
    expect(looksLikeTvKey(first)).toBe(true);
    expect(first.startsWith("tv_")).toBe(true);
    expect(tvKeyHint(first)).toBe(first.slice(-4));
  });

  it("refuse anything that is not a key before the database is asked", () => {
    for (const value of ["", "tv_", "tv_pendek", `wam_${"a".repeat(43)}`, `tv_${"a".repeat(42)}`, `tv_${"a".repeat(42)}!`, null, 12, undefined]) {
      expect(looksLikeTvKey(value), String(value)).toBe(false);
    }
  });

  it("keep only a sha256 of the key", () => {
    const key = newTvKey();
    expect(hashTvKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashTvKey(key)).toBe(hashTvKey(key));
    expect(hashTvKey(key)).not.toContain(key.slice(3, 12));
  });
});
