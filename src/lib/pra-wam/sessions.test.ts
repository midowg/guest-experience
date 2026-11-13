import { describe, expect, it } from "vitest";
import { bookingSessionLabel, outsideWam, sessionInputSchema, sessionProblems, sessionTimes, sessionWhen, withoutSessionBookings } from "./sessions";

describe("session rules", () => {
  it("lets a draft wait without time, but not half a time", () => {
    expect(sessionProblems({ date: "", start: "", end: "", roomId: "", location: "" }, false)).toEqual({});
    expect(sessionProblems({ date: "2026-11-09", start: "", end: "", roomId: "", location: "" }, false)).toMatchObject({ start: "Isi jam mulai.", end: "Isi jam selesai." });
  });
  it("needs a date and hours to publish, and a room only after the time", () => {
    expect(sessionProblems({ date: "", start: "", end: "", roomId: "", location: "" }, true).date).toBe("Isi tanggal sebelum menerbitkan.");
    expect(sessionProblems({ date: "2026-11-09", start: "11:00", end: "10:00", roomId: "", location: "" }, true).end).toBe("Jam selesai harus setelah jam mulai.");
    expect(sessionProblems({ date: "", start: "", end: "", roomId: "r1", location: "" }, false).roomId).toBeTruthy();
  });
  it("offers 06.00 to 23.30 and accepts half hours only", () => {
    expect(sessionTimes()[0]).toBe("06:00");
    expect(sessionTimes().at(-1)).toBe("23:30");
    expect(sessionInputSchema.safeParse({ title: "Forum", kind: "forum", start: "10:15" }).success).toBe(false);
  });
});

describe("when a session is", () => {
  it("shows the time once set, else the calendar range", () => {
    expect(sessionWhen({ startsAt: "2026-11-09T03:00:00Z", endsAt: "2026-11-09T05:00:00Z", planFrom: null, planTo: null })).toBe("Senin, 9 Nov · 10.00–12.00");
    expect(sessionWhen({ startsAt: null, endsAt: null, planFrom: "2026-11-24", planTo: "2026-11-27" })).toBe("24 Nov – 27 Nov · jam belum ditentukan");
    expect(sessionWhen({ startsAt: null, endsAt: null, planFrom: "2026-11-13", planTo: "2026-11-13" })).toBe("13 Nov · jam belum ditentukan");
  });
});

describe("sessions made from a room booking", () => {
  const citra = { id: "p3", name: "Citra Dewi", department: "HC" };
  it("names who booked it", () => {
    expect(bookingSessionLabel({ booking: { id: "b1", bookedBy: citra } })).toBe("Dari booking · dipesan Citra Dewi");
    expect(bookingSessionLabel({ booking: null })).toBeNull();
    expect(bookingSessionLabel({ booking: { id: "b1", bookedBy: citra, outside: true } })).toBe("Di luar WAM · dipesan Citra Dewi");
    expect([outsideWam({ booking: { id: "b1", bookedBy: citra, outside: true } }), outsideWam({ booking: { id: "b1", bookedBy: citra } }), outsideWam({})]).toEqual([true, false, false]);
    expect(bookingSessionLabel({})).toBeNull();
  });
  it("keeps only the bookings that are not a published session already", () => {
    const bookings = [{ id: "b1" }, { id: "b2" }, { id: "b3" }];
    expect(withoutSessionBookings(bookings, [
      { status: "terbit", booking: { id: "b1", bookedBy: citra } },
      // A cancelled or draft session does not hide its booking; a panitia session hides nothing.
      { status: "batal", booking: { id: "b2", bookedBy: citra } },
      { status: "terbit", booking: null },
      { status: "terbit" },
    ]).map(item => item.id)).toEqual(["b2", "b3"]);
    // Before migration 202611050004 no session has a booking: every booking stays.
    expect(withoutSessionBookings(bookings, [{ status: "terbit" }])).toEqual(bookings);
  });
});
