import { describe, expect, it } from "vitest";
import type { DailyRecord } from "./attendance";
import { byWeek, durationLabel, historySummary, shiftDate, weekLabel, weekOf, weekStart, workedMinutes } from "./history";

const record = (patch: Partial<DailyRecord>): DailyRecord => ({
  id: "r", kind: "masuk", at: "2026-11-20T01:52:00Z", workDate: "2026-11-20", method: "wajah", status: "sah", flags: [], officeName: "Kantor Contoh",
  distanceM: 30, accuracyM: 10, faceScore: 0.5, reasonKind: null, reasonText: null, hasSelfie: false, reviewNote: null, ...patch,
});

describe("Beranda's week and Riwayat's groups", () => {
  it("starts the week on Monday", () => {
    expect(weekStart("2026-11-20")).toBe("2026-11-16"); // a Friday
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // a Sunday
    expect(weekOf("2026-11-20")).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(shiftDate("2026-11-01", -1)).toBe("2026-10-31");
  });
  it("names weeks the way people say them", () => {
    expect(weekLabel("2026-11-18", "2026-11-20")).toBe("Minggu ini");
    expect(weekLabel("2026-11-12", "2026-11-20")).toBe("Minggu lalu");
    expect(weekLabel("2026-11-04", "2026-11-20")).toBe("2–8 Nov");
    expect(weekLabel("2026-10-28", "2026-11-20")).toBe("26 Okt – 1 Nov");
  });
  it("groups dates newest first", () => {
    expect(byWeek(["2026-11-12", "2026-11-19", "2026-11-18", "2026-11-19"], "2026-11-20")).toEqual([
      { label: "Minggu ini", dates: ["2026-11-19", "2026-11-18"] },
      { label: "Minggu lalu", dates: ["2026-11-12"] },
    ]);
  });
  it("counts days, records to check and the usual masuk time", () => {
    const summary = historySummary([
      record({}),
      record({ id: "b", workDate: "2026-11-19", at: "2026-11-19T02:10:00Z", status: "perlu_cek" }),
      record({ id: "c", kind: "pulang", at: "2026-11-19T10:00:00Z" }),
    ], "WIB");
    expect(summary).toEqual({ days: 2, toCheck: 1, usualIn: "09.01" });
    expect(historySummary([], "WIB")).toEqual({ days: 0, toCheck: 0, usualIn: null });
  });
  it("says how long someone worked", () => {
    expect(workedMinutes("2026-11-20T01:52:00Z", "2026-11-20T10:31:00Z")).toBe(519);
    expect(durationLabel(519)).toBe("8 j 39 m");
    expect(durationLabel(45)).toBe("45 m");
  });
});
