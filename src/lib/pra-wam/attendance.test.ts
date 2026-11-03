import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkInWindow, newQrToken, windowState } from "./attendance";

describe("check-in window", () => {
  // Senin 9 Nov 2026, 10.00–12.00 WIB.
  const window = checkInWindow("2026-11-09T03:00:00Z", "2026-11-09T05:00:00Z");
  it("opens 30 minutes before and closes 30 minutes after", () => {
    expect(window).toEqual({ opens: "2026-11-09T02:30:00.000Z", closes: "2026-11-09T05:30:00.000Z" });
  });
  it("is not open yet, open, then closed", () => {
    expect(windowState(window, new Date("2026-11-09T02:29:59Z"))).toBe("belum");
    expect(windowState(window, new Date("2026-11-09T02:30:00Z"))).toBe("buka");
    expect(windowState(window, new Date("2026-11-09T05:30:00Z"))).toBe("buka");
    expect(windowState(window, new Date("2026-11-09T05:30:01Z"))).toBe("tutup");
  });
});

describe("QR token", () => {
  it("is 24 URL-safe characters and different each time", () => {
    const token = newQrToken(size => randomBytes(size));
    expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(newQrToken(size => randomBytes(size))).not.toBe(token);
  });
});
