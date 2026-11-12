import { describe, expect, it } from "vitest";
import { alternatives, bookableDates, bookingCancelledText, bookingClock, isRecordDate, bookingInputSchema, bookingProblems, bookingSavedText, bookingWhere, durationsFrom, OUTSIDE_ROOM, overlaps, slotTimes, titleSuggestions, wibDate, wibInstant, wibTime, type Room } from "./appraisal";

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
    // The period runs to 29 Dec (9 Nov 2026): the last week has Mon 28 and Tue 29 only.
    const dates = bookableDates("2026-12-24");
    expect(dates).toEqual(["2026-12-24", "2026-12-25", "2026-12-28", "2026-12-29"]);
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
    expect(bookingProblems({ date: "2026-11-07", start: "10:00", end: "11:00" }, now).date).toBe("Ruang hanya bisa dipesan Senin–Jumat. Di luar kantor boleh akhir pekan.");
    expect(bookingProblems({ date: "2026-12-30", start: "10:00", end: "11:00" }, now).date).toBeTruthy();
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

describe("Di luar kantor", () => {
  const away = (patch: { date?: string; start: string; end: string }) => ({ date: "2026-11-07", roomId: OUTSIDE_ROOM, ...patch });
  it("may be on a weekend, at any half hour of the day, and longer than 4 hours", () => {
    expect(bookingProblems(away({ start: "19:00", end: "23:30" }), now)).toEqual({});
    expect(bookingProblems(away({ start: "08:00", end: "17:00" }), now)).toEqual({});
    expect(slotTimes(true)[0]).toBe("00:00");
    expect(slotTimes(true).at(-1)).toBe("23:30");
    expect(durationsFrom("22:00", true)).toEqual([30, 60, 90]);
  });
  it("still keeps the period, the half hours, and one day", () => {
    expect(bookingProblems(away({ date: "2026-12-30", start: "10:00", end: "11:00" }), now).date).toBeTruthy();
    expect(bookingProblems(away({ start: "10:15", end: "11:00" }), now).start).toBeTruthy();
    expect(bookingProblems(away({ start: "23:00", end: "23:45" }), now).end).toBeTruthy();
  });
  it("a room booking keeps its weekdays and hours", () => {
    expect(bookingProblems({ date: "2026-11-07", roomId: "r1", start: "10:00", end: "11:00" }, now).date).toBe("Ruang hanya bisa dipesan Senin–Jumat. Di luar kantor boleh akhir pekan.");
  });
  it("needs a place name, and says where it is", () => {
    const input = { roomId: OUTSIDE_ROOM, date: "2026-11-07", start: "10:00", end: "11:00", title: "Makan siang tim" };
    expect(bookingInputSchema.safeParse({ ...input, place: " " }).success).toBe(false);
    expect(bookingInputSchema.safeParse({ ...input, place: "Kopi Klotok" }).success).toBe(true);
    expect(bookingWhere({ roomId: OUTSIDE_ROOM, place: "Kopi Klotok" }, [])).toBe("Kopi Klotok · di luar kantor");
    expect(bookingWhere({ roomId: "r1" }, [{ id: "r1", name: "Vasuki" }])).toBe("Vasuki");
    expect(bookingSavedText({ roomId: OUTSIDE_ROOM })).toBe("Booking di luar kantor tersimpan.");
    expect(bookingSavedText({ roomId: "r1" })).toBe("Ruang berhasil dipesan.");
    expect(bookingCancelledText({ roomId: OUTSIDE_ROOM })).toBe("Booking dibatalkan.");
    expect(bookingCancelledText({ roomId: "r1" })).toBe("Booking dibatalkan. Ruang kembali tersedia.");
  });
});

describe("rooms kept for departments (10 Nov 2026)", () => {
  it("lets everyone book a room kept for no one, and only the named departments otherwise", async () => {
    const { roomKeptFrom } = await import("./appraisal");
    expect(roomKeptFrom({ departments: [] }, ["Accounting"])).toBeNull();
    expect(roomKeptFrom({}, [])).toBeNull();
    expect(roomKeptFrom({ departments: ["Sales & Marketing"] }, ["sales & marketing"])).toBeNull();
    expect(roomKeptFrom({ departments: ["Sales & Marketing"] }, ["Accounting", "Corporate"])).toBe("Khusus Sales & Marketing");
  });
});

describe("a booking on a day gone (a record)", () => {
  it("is a record inside the period before today; its hours are not past, today's still are", () => {
    expect(isRecordDate("2026-11-02", now)).toBe(true);
    expect(isRecordDate("2026-10-27", now)).toBe(false);
    expect(isRecordDate("2026-11-04", now)).toBe(false);
    expect(bookingProblems({ date: "2026-11-02", start: "09:00", end: "10:00" }, bookingClock("2026-11-02", now))).toEqual({});
    expect(bookingProblems({ date: "2026-11-02", start: "09:00", end: "10:00" }, now)).toHaveProperty("start");
    expect(bookingProblems({ date: "2026-11-04", start: "08:00", end: "09:00" }, bookingClock("2026-11-04", now))).toHaveProperty("start");
    expect(bookingProblems({ date: "2026-10-27", start: "09:00", end: "10:00" }, bookingClock("2026-10-27", now))).toHaveProperty("date");
  });

  it("takes an hour already gone today as a record too, once its start is given (a booking put on the wrong day)", () => {
    const today = wibDate(now.toISOString());
    // 09.05 WIB now: 08.00 is gone, inside office hours.
    const gone = "08:00";
    expect(isRecordDate(today, now)).toBe(false);
    expect(isRecordDate(today, now, gone)).toBe(true);
    expect(bookingProblems({ date: today, start: gone, end: "09:00" }, bookingClock(today, now, gone))).not.toHaveProperty("start");
    // A start still to come today is not a record: it invites as always.
    const later = wibTime(new Date(now.getTime() + 2 * 3600_000).toISOString()).slice(0, 2) + ":00";
    expect(isRecordDate(today, now, later)).toBe(false);
  });
});
