import { describe, expect, it } from "vitest";
import { sessionInputSchema, sessionProblems, sessionTimes, sessionWhen } from "./sessions";

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
