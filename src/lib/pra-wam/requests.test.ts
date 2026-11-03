import { describe, expect, it } from "vitest";
import { requestInputSchema, spanLabel } from "./requests";

describe("schedule change request", () => {
  const base = { date: "2026-11-13", start: "13:00", end: "15:00", reason: "Bentrok dengan kunjungan klien" };
  it("needs a later end, half-hour times, and a short reason", () => {
    expect(requestInputSchema.safeParse(base).success).toBe(true);
    expect(requestInputSchema.safeParse({ ...base, end: "12:00" }).success).toBe(false);
    expect(requestInputSchema.safeParse({ ...base, start: "13:15" }).success).toBe(false);
    expect(requestInputSchema.safeParse({ ...base, reason: "ok" }).success).toBe(false);
  });
  it("names the span in WIB", () => {
    expect(spanLabel("2026-11-13T06:00:00Z", "2026-11-13T08:00:00Z")).toBe("Jumat, 13 Nov · 13.00–15.00");
  });
});
