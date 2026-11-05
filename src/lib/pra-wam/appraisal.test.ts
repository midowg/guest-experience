import { describe, expect, it } from "vitest";
import { alternatives, bookableDates, bookingProblems, overlaps, slotTimes, titleSuggestions, wibDate, wibInstant, wibTime, type Room } from "./appraisal";

const now = new Date("2026-11-04T02:05:00Z"); // Rabu 4 Nov, 09.05 WIB
const room = (id: string, bookable = true): Room => ({ id, slug: id, name: id, kind: "utama", capacity: null, bookable, minPeople: null, planKey: null, facilities: [] });

describe("WIB time", () => {
  it("round-trips a date and clock time", () => {
    const iso = wibInstant("2026-11-04", "10:30");
    expect(new Date(iso).toISOString()).toBe("2026-11-04T03:30:00.000Z");
    expect(wibDate(iso)).toBe("2026-11-04");
    expect(wibTime(iso)).toBe("10:30");
  });
  it("offers 07.00 to 22.00 in half hours", () => {
    const times = slotTimes();
    expect(times[0]).toBe("07:00");
    expect(times.at(-1)).toBe("22:00");
    expect(times).toHaveLength(31);
  });
  it("lists only weekdays inside the period", () => {
    const dates = bookableDates("2026-11-19");
    expect(dates).toEqual(["2026-11-19", "2026-11-20"]);
    expect(bookableDates("2026-11-06")).not.toContain("2026-11-07");
  });
});

describe("booking rules", () => {
  it("accepts an hour inside office hours", () => {
    expect(bookingProblems({ date: "2026-11-04", start: "10:00", end: "11:00" }, now)).toEqual({});
  });
  it("refuses times outside 07.00–22.00, off the half hour, past, too long, or on weekends", () => {
    expect(bookingProblems({ date: "2026-11-05", start: "06:30", end: "07:30" }, now).start).toBe("Jam mulai 07.00–21.30, setiap 30 menit.");
    expect(bookingProblems({ date: "2026-11-05", start: "21:30", end: "22:30" }, now).end).toBe("Jam selesai 07.30–22.00, setiap 30 menit.");
    expect(bookingProblems({ date: "2026-11-05", start: "07:00", end: "08:00" }, now)).toEqual({});
    expect(bookingProblems({ date: "2026-11-05", start: "10:15", end: "11:00" }, now).start).toBeTruthy();
    expect(bookingProblems({ date: "2026-11-05", start: "11:00", end: "10:00" }, now).end).toBe("Jam selesai harus setelah jam mulai.");
    expect(bookingProblems({ date: "2026-11-05", start: "09:00", end: "13:30" }, now).end).toBe("Paling lama 4 jam.");
    expect(bookingProblems({ date: "2026-11-04", start: "09:00", end: "10:00" }, now).start).toBe("Jam ini sudah lewat.");
    expect(bookingProblems({ date: "2026-11-07", start: "10:00", end: "11:00" }, now).date).toBe("Ruang hanya bisa dipesan Senin–Jumat.");
    expect(bookingProblems({ date: "2026-11-23", start: "10:00", end: "11:00" }, now).date).toBeTruthy();
  });
});

describe("when the room is taken", () => {
  const taken = [{ id: "b1", roomId: "vasuki", startsAt: wibInstant("2026-11-04", "10:00"), endsAt: wibInstant("2026-11-04", "11:00") }];
  it("treats back-to-back as free", () => {
    expect(overlaps(taken[0], { startsAt: wibInstant("2026-11-04", "11:00"), endsAt: wibInstant("2026-11-04", "12:00") })).toBe(false);
  });
  it("offers the nearest free hour in the same room and other free rooms", () => {
    const result = alternatives({ roomId: "vasuki", date: "2026-11-04", start: "10:00", end: "11:00" }, [room("vasuki"), room("nagapadma"), room("limasan", false)], taken, now);
    expect(result.sameRoom[0]).toEqual({ start: "11:00", end: "12:00" });
    expect(result.sameRoom.map(span => span.start)).not.toContain("09:00"); // already past
    expect(result.otherRooms).toEqual(["nagapadma"]);
  });
  it("ignores the booking being edited", () => {
    const result = alternatives({ roomId: "vasuki", date: "2026-11-04", start: "10:00", end: "11:00" }, [room("vasuki")], taken, now, "b1");
    expect(result.sameRoom[0]).toEqual({ start: "10:00", end: "11:00" });
  });
});

describe("activity name suggestions", () => {
  const used = [{ title: "Appraisal tim marketing", count: 5 }, { title: "appraisal 1-on-1", count: 3 }, { title: "Sync mingguan", count: 9 }];
  it("puts names that start with the typed text first, most used first", () => {
    expect(titleSuggestions("appr", used)).toEqual(["Appraisal tim marketing", "Appraisal 1-on-1", "Appraisal tim"]);
  });
  it("matches inside a name too, and merges case", () => {
    expect(titleSuggestions("mingg", used)).toEqual(["Sync mingguan"]);
    expect(titleSuggestions("", used).filter(title => /1-on-1/i.test(title))).toHaveLength(1);
  });
});
