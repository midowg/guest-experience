import { describe, expect, it } from "vitest";
import { bookingProblems } from "@/lib/pra-wam/appraisal";
import { availability, endOf, nextStart, officeBookingSchema, officeDateOr, officeDates, officeLastDate, officeNeighbour, officePeriod, roomNow } from "./rules";

// Selasa 10 Nov 2026, 09.00 WIB.
const now = new Date("2026-11-10T02:00:00Z");
const room = "0b0e7c3e-4a0e-4b8e-9a51-3c1f2d6f7a10";
const base = { roomId: room, date: "2026-11-11", start: "10:00", end: "11:00", title: "Rapat", participants: [] };

describe("officeDates", () => {
  it("lists weekdays from today for 30 days", () => {
    const dates = officeDates("2026-11-10");
    expect(dates[0]).toBe("2026-11-10");
    expect(dates).not.toContain("2026-11-14");
    expect(dates.at(-1)).toBe("2026-12-10");
    expect(officeLastDate("2026-11-10")).toBe("2026-12-10");
  });
  it("moves a weekend or far date to the first bookable day", () => {
    expect(officeDateOr("2026-11-14", "2026-11-10")).toBe("2026-11-10");
    expect(officeDateOr("2026-11-12", "2026-11-10")).toBe("2026-11-12");
    expect(officeDateOr(undefined, "2026-11-14")).toBe("2026-11-16");
  });
  it("steps over the weekend", () => {
    expect(officeNeighbour("2026-11-13", "2026-11-10", 1)).toBe("2026-11-16");
    expect(officeNeighbour("2026-11-10", "2026-11-10", -1)).toBeNull();
  });
});

describe("office period", () => {
  it("allows a day after WAM's period and refuses one too far ahead", () => {
    const later = new Date("2027-01-04T02:00:00Z");
    expect(bookingProblems({ ...base, date: "2027-01-05" }, later, officePeriod(later))).toEqual({});
    expect(bookingProblems({ ...base, date: "2027-01-05" }, later).date).toMatch(/periode/);
    expect(bookingProblems({ ...base, date: "2026-12-11" }, now, officePeriod(now)).date).toMatch(/30 hari/);
  });
  it("keeps the room rules", () => {
    expect(bookingProblems({ ...base, date: "2026-11-14" }, now, officePeriod(now)).date).toMatch(/Senin–Jumat/);
    expect(bookingProblems({ ...base, end: "15:00" }, now, officePeriod(now)).end).toMatch(/4 jam/);
  });
});

describe("officeBookingSchema", () => {
  it("defaults to internal", () => {
    expect(officeBookingSchema.parse(base)).toMatchObject({ audience: "internal", externalNote: "" });
  });
  it("asks who the guest is for eksternal", () => {
    expect(officeBookingSchema.safeParse({ ...base, audience: "eksternal" }).success).toBe(false);
    expect(officeBookingSchema.safeParse({ ...base, audience: "eksternal", externalNote: "PT Contoh" }).success).toBe(true);
  });
  it("refuses a booking outside the office", () => {
    expect(officeBookingSchema.safeParse({ ...base, roomId: "luar", place: "Kafe" }).success).toBe(false);
  });
});

describe("time first", () => {
  const ananta = { id: room, slug: "ananta", name: "Ananta", kind: "utama" as const, capacity: 12, bookable: true, minPeople: 3, planKey: null, facilities: [] };
  const context = { now, largest: 30, departments: ["GA"] };
  // Rabu 11 Nov, 10.00–11.00 WIB is taken.
  const taken = [{ startsAt: "2026-11-11T03:00:00Z", endsAt: "2026-11-11T04:00:00Z" }];
  const ask = (start: string, minutes: number, people: number | null = null) => ({ date: "2026-11-11", start, minutes, people });

  it("finds the next half hour", () => {
    expect(nextStart("2026-11-10", now)).toBe("09:30");
    expect(nextStart("2026-11-11", now)).toBe("07:00");
    expect(nextStart("2026-11-09", now)).toBeNull();
    expect(endOf("10:00", 90)).toBe("11:30");
  });
  it("is free until the next booking", () => {
    expect(availability(ananta, taken, ask("08:00", 60), context)).toEqual({ ok: true, until: "10:00" });
    expect(availability(ananta, taken, ask("11:00", 60), context)).toEqual({ ok: true, until: "22:00" });
  });
  it("says why not", () => {
    expect(availability(ananta, taken, ask("10:30", 60), context)).toMatchObject({ ok: false, why: "terisi", text: "Terisi sampai 11.00" });
    expect(availability(ananta, taken, ask("21:30", 60), context)).toMatchObject({ ok: false, why: "tutup" });
    // No fewest-people rule here: two may take a room meant for three or more.
    expect(availability(ananta, taken, ask("13:00", 60, 2), context)).toEqual({ ok: true, until: "22:00" });
    expect(availability(ananta, taken, ask("13:00", 60, 20), context)).toMatchObject({ ok: false, why: "kecil" });
    expect(availability({ ...ananta, departments: ["Sales"] }, taken, ask("13:00", 60), context)).toMatchObject({ ok: false, why: "khusus" });
    expect(availability(ananta, taken, { ...ask("08:00", 60), date: "2026-11-10" }, context)).toMatchObject({ ok: false, why: "lewat" });
  });
});

describe("roomNow", () => {
  const morning = { startsAt: "2026-11-10T01:30:00Z", endsAt: "2026-11-10T02:30:00Z" };
  const noon = { startsAt: "2026-11-10T05:00:00Z", endsAt: "2026-11-10T06:00:00Z" };
  it("names the booking in progress", () => expect(roomNow([noon, morning], now)).toEqual({ busy: morning }));
  it("names the next one when free", () => expect(roomNow([noon], now)).toEqual({ busy: null, next: noon }));
  it("is free for the rest of the day", () => expect(roomNow([], now)).toEqual({ busy: null, next: null }));
});
