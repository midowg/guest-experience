import { describe, expect, it } from "vitest";
import { claimNumbers, countsForQuota, dayStart, monthRange, nextDay, previousMonth, quotaFor, quotaGroupOf, usedInMonth, wibClock, wibDay, wibMonth } from "./quota";

const claim = (id: string, orderedAt: string, status: "diproses" | "selesai" | "ditolak" | "batal" = "selesai", employeeId = "e1") =>
  ({ id, kind: "klaim" as const, status, employeeId, orderedAt });

describe("the monthly quota", () => {
  it("maps Data karyawan's categories to the quota groups (dw is the GA group)", () => {
    expect(quotaGroupOf("karyawan")).toBe("karyawan");
    expect(quotaGroupOf("dw")).toBe("ga");
    expect(quotaGroupOf("ga")).toBe("ga");
    expect(quotaGroupOf("intern")).toBe("intern");
    expect(quotaGroupOf(undefined)).toBe("karyawan");
    expect(quotaFor("ga", { karyawan: 4, ga: 2, intern: 1 })).toBe(2);
  });

  it("turns the month over at midnight WIB, not UTC", () => {
    // 31 Dec 23.59 WIB is 16.59 UTC; 1 Jan 00.00 WIB is 31 Dec 17.00 UTC.
    expect(wibMonth("2026-12-31T16:59:59Z")).toBe("2026-12");
    expect(wibMonth("2026-12-31T17:00:00Z")).toBe("2027-01");
    expect(wibDay("2026-12-31T17:00:00+00:00")).toBe("2027-01-01");
    expect(wibClock("2026-11-25T02:14:00Z")).toBe("09:14");
    expect(monthRange("2026-12")).toEqual({ from: "2026-11-30T17:00:00.000Z", to: "2026-12-31T17:00:00.000Z" });
    expect(dayStart("2027-01-01")).toBe("2026-12-31T17:00:00.000Z");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(previousMonth("2027-01")).toBe("2026-12");
    expect(previousMonth("2026-11")).toBe("2026-10");
  });

  it("counts only claims that are being processed or done", () => {
    expect(["diproses", "selesai", "ditolak", "batal"].map(status => countsForQuota(status as "batal"))).toEqual([true, true, false, false]);
    const orders = [
      claim("a", "2026-11-03T02:00:00Z"), claim("b", "2026-11-05T02:00:00Z", "ditolak"), claim("c", "2026-11-07T02:00:00Z", "batal"),
      claim("d", "2026-11-09T02:00:00Z", "diproses"), claim("e", "2026-11-30T17:00:00Z"),
      { ...claim("f", "2026-11-10T02:00:00Z"), kind: "rapat" as const },
    ];
    expect(usedInMonth(orders, "2026-11")).toBe(2);
    expect(usedInMonth(orders, "2026-12")).toBe(1);
  });

  it("numbers the claims per person and month, and closes the gap after a cancellation", () => {
    const orders = [
      claim("c", "2026-11-09T02:00:00Z", "diproses"), claim("a", "2026-11-03T02:00:00+00:00"), claim("b", "2026-11-05T02:00:00Z", "batal"),
      claim("x", "2026-11-04T02:00:00Z", "selesai", "e2"), claim("d", "2026-12-01T02:00:00Z"), claim("r", "2026-11-06T02:00:00Z", "ditolak"),
    ];
    const numbers = claimNumbers(orders);
    expect(Object.fromEntries(numbers)).toEqual({ a: 1, c: 2, x: 1, d: 1 });
    expect(numbers.has("b")).toBe(false);
    expect(numbers.has("r")).toBe(false);
  });
});
