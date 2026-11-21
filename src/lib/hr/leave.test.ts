import { describe, expect, it } from "vitest";
import { covers, datesOf, leaveDateProblem, leaveDays, leaveSchema, leaveSummary, monthSpan, overlaps, spanLabel } from "./leave";

describe("cuti, sakit, izin and dinas", () => {
  it("counts days with both ends and lists them", () => {
    expect(leaveDays("2026-11-24", "2026-11-26")).toBe(3);
    expect(leaveDays("2026-11-30", "2026-12-02")).toBe(3);
    expect(datesOf("2026-11-30", "2026-12-01")).toEqual(["2026-11-30", "2026-12-01"]);
    expect(covers({ startDate: "2026-11-24", endDate: "2026-11-26" }, "2026-11-26")).toBe(true);
    expect(overlaps({ startDate: "2026-11-24", endDate: "2026-11-26" }, { startDate: "2026-11-26", endDate: "2026-11-27" })).toBe(true);
    expect(overlaps({ startDate: "2026-11-24", endDate: "2026-11-25" }, { startDate: "2026-11-26", endDate: "2026-11-27" })).toBe(false);
  });
  it("says spans the way people write them", () => {
    expect(spanLabel("2026-11-24", "2026-11-24")).toBe("24 Nov");
    expect(spanLabel("2026-11-24", "2026-11-26")).toBe("24–26 Nov");
    expect(spanLabel("2026-11-30", "2026-12-02")).toBe("30 Nov – 2 Des");
    expect(leaveSummary({ type: "sakit", startDate: "2026-11-24", endDate: "2026-11-25" })).toBe("Sakit · 24–25 Nov (2 hari)");
  });
  it("checks a request: the order of dates, the length, a note", () => {
    expect(leaveSchema.safeParse({ type: "cuti", startDate: "2026-11-24", endDate: "2026-11-26", note: "Pulang kampung" }).success).toBe(true);
    expect(leaveSchema.safeParse({ type: "cuti", startDate: "2026-11-26", endDate: "2026-11-24", note: "Pulang kampung" }).success).toBe(false);
    expect(leaveSchema.safeParse({ type: "cuti", startDate: "2026-11-01", endDate: "2027-01-31", note: "Lama" }).success).toBe(false);
    expect(leaveSchema.safeParse({ type: "izin", startDate: "2026-11-24", endDate: "2026-11-24", note: "ab" }).success).toBe(false);
    expect(leaveSchema.safeParse({ type: "libur", startDate: "2026-11-24", endDate: "2026-11-24", note: "Libur dong" }).success).toBe(false);
    expect(leaveSchema.safeParse({ type: "izin", startDate: "2026-02-30", endDate: "2026-03-01", note: "Tanggal aneh" }).success).toBe(false);
  });
  it("allows 31 days back and a year ahead", () => {
    expect(leaveDateProblem("2026-10-21", "2026-11-21")).toBeNull();
    expect(leaveDateProblem("2026-10-20", "2026-11-21")).toMatch(/31 hari/);
    expect(leaveDateProblem("2027-11-23", "2026-11-21")).toMatch(/setahun/);
  });
  it("knows a month's first and last day and its neighbours", () => {
    expect(monthSpan("2026-11")).toEqual({ first: "2026-11-01", last: "2026-11-30", before: "2026-10", after: "2026-12" });
    expect(monthSpan("2026-12")).toMatchObject({ last: "2026-12-31", after: "2027-01" });
    expect(monthSpan("2026-01")).toMatchObject({ before: "2025-12" });
  });
});
