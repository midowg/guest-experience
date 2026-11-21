import { describe, expect, it } from "vitest";
import { cellOf, cellWords, countCells, isWeekend, type DayInput } from "./recap";

const office = (local: string, patch: Partial<NonNullable<DayInput["masuk"]>> = {}) => ({ status: "sah" as const, reasonKind: null, officeName: "Kantor Contoh", method: "wajah" as const, local, ...patch });
const day = (patch: Partial<DayInput>): DayInput => ({ date: "2026-11-18", today: "2026-11-21", lateAfter: "09:00", masuk: null, pulang: null, leaves: [], ...patch });

describe("Admin HR's coloured cells", () => {
  it("is Hadir up to the late time and Telat after it, in the office", () => {
    expect(cellOf(day({ masuk: office("09:00"), pulang: office("17:30") }))).toMatchObject({ kind: "hadir", masuk: "09.00", pulang: "17.30", incomplete: false });
    expect(cellOf(day({ masuk: office("09:01"), pulang: office("17:30") })).kind).toBe("telat");
    expect(cellOf(day({ lateAfter: "08:30", masuk: office("08:45"), pulang: office("17:00") })).kind).toBe("telat");
    // Saturday work is never late.
    expect(cellOf(day({ date: "2026-11-21", masuk: office("10:00"), pulang: office("14:00") })).kind).toBe("hadir");
  });
  it("names the place by the reason given outside the office, never late", () => {
    expect(cellOf(day({ masuk: office("10:30", { reasonKind: "dinas", officeName: null }) })).kind).toBe("dinas");
    expect(cellOf(day({ masuk: office("10:30", { reasonKind: "event", officeName: null }) })).kind).toBe("event");
    expect(cellOf(day({ masuk: office("10:30", { reasonKind: "wfh", officeName: null }) })).kind).toBe("wfh");
    expect(cellOf(day({ masuk: office("10:30", { reasonKind: "lainnya", officeName: null }) })).kind).toBe("luar");
    expect(cellOf(day({ masuk: office("08:00", { method: "manual", officeName: null }) })).kind).toBe("hadir");
  });
  it("lets an approved cuti, sakit, izin or dinas win; a waiting one only on an empty day", () => {
    const leave = { type: "cuti" as const, startDate: "2026-11-17", endDate: "2026-11-19" };
    expect(cellOf(day({ leaves: [{ ...leave, status: "disetujui" }], masuk: office("08:00") })).kind).toBe("cuti");
    expect(cellOf(day({ leaves: [{ ...leave, status: "menunggu" }] }))).toMatchObject({ kind: "cuti", waiting: true });
    expect(cellOf(day({ leaves: [{ ...leave, status: "menunggu" }], masuk: office("08:00") })).kind).toBe("hadir");
  });
  it("marks a missing pulang on a past day, a record to check, and a refused one", () => {
    expect(cellOf(day({ masuk: office("08:00") }))).toMatchObject({ kind: "hadir", incomplete: true });
    expect(cellOf(day({ date: "2026-11-21", masuk: office("08:00") })).incomplete).toBe(false);
    expect(cellOf(day({ masuk: office("08:00", { status: "perlu_cek" }), pulang: office("17:00") })).check).toBe(true);
    expect(cellOf(day({ masuk: office("08:00", { status: "ditolak" }) })).kind).toBe("ditolak");
    // A refused pulang only leaves the pulang missing.
    expect(cellOf(day({ masuk: office("08:00"), pulang: office("17:00", { status: "ditolak" }) }))).toMatchObject({ kind: "hadir", incomplete: true });
  });
  it("tells empty days apart: Libur on the weekend, nothing for today and later, else Tidak absen", () => {
    expect(isWeekend("2026-11-21")).toBe(true); // a Saturday
    expect(cellOf(day({ date: "2026-11-22" })).kind).toBe("libur");
    expect(cellOf(day({ date: "2026-11-23", today: "2026-11-21" })).kind).toBe("nanti");
    expect(cellOf(day({ date: "2026-11-20", today: "2026-11-20" })).kind).toBe("belum");
    expect(cellOf(day({ date: "2026-11-18" })).kind).toBe("alpa");
    // Before absensi started nothing is missing.
    expect(cellOf(day({ date: "2026-11-18", since: "2026-11-19" })).kind).toBe("nanti");
  });
  it("counts the days and says a cell in words", () => {
    const cells = [
      cellOf(day({ masuk: office("08:00"), pulang: office("17:00") })),
      cellOf(day({ date: "2026-11-19", masuk: office("09:30"), pulang: office("17:00") })),
      cellOf(day({ date: "2026-11-20" })),
      cellOf(day({ date: "2026-11-17", leaves: [{ type: "izin", startDate: "2026-11-17", endDate: "2026-11-17", status: "menunggu" }] })),
    ];
    expect(countCells(cells)).toMatchObject({ hadir: 1, telat: 1, alpa: 1, izin: 0, masuk: 2 });
    expect(cellWords(cells[1])).toBe("Telat, masuk 09.30, pulang 17.00");
    expect(cellWords(cells[3])).toBe("Izin (menunggu persetujuan)");
  });
});
