import { describe, expect, it } from "vitest";
import { wibInstant } from "./appraisal";
import { bookingFrom, countLabel, durationLabel, roomDay, runLabel } from "./room-day";

const date = "2026-11-05";
const hold = (start: string, end: string, session = false) => ({ startsAt: wibInstant(date, start), endsAt: wibInstant(date, end), session });
/** The evening before, so every hour of `date` is ahead. */
const before = new Date(wibInstant("2026-11-04", "20:00"));

describe("a room's day on the Book plan", () => {
  it("is empty with no holds, free from opening to closing", () => {
    const day = roomDay({ date, bookable: true, holds: [], now: before });
    expect(day.status).toEqual({ tone: "free", text: "Kosong" });
    expect(day.nextFree).toEqual({ start: "09:00", end: "18:00" });
    expect(day.takenMinutes).toBe(0);
  });

  it("is partly used, with the count, the time taken once and the next free run", () => {
    const day = roomDay({ date, bookable: true, holds: [hold("09:00", "10:30"), hold("10:00", "11:00"), hold("13:00", "15:00")], now: before });
    expect(day.status).toEqual({ tone: "part", text: "Terpakai · 3 booking" });
    expect(day.takenMinutes).toBe(240);
    expect(day.nextFree).toEqual({ start: "11:00", end: "13:00" });
  });

  it("is full when no half hour is left, counting Pra WAM sessions", () => {
    const day = roomDay({ date, bookable: true, holds: [hold("09:00", "12:00"), hold("12:00", "18:00", true)], now: before });
    expect(day.status).toEqual({ tone: "full", text: "Penuh" });
    expect(day.nextFree).toBeNull();
    expect([day.bookings, day.sessions, day.takenMinutes]).toEqual([1, 1, 540]);
  });

  it("names sessions apart in the status", () => {
    expect(roomDay({ date, bookable: true, holds: [hold("09:00", "10:00", true)], now: before }).status.text).toBe("Terpakai · 1 sesi");
  });

  it("does not count past hours of today as free", () => {
    const noon = new Date(wibInstant(date, "12:10"));
    // Free in the morning only: after noon it is taken, so nothing is left.
    expect(roomDay({ date, bookable: true, holds: [hold("12:30", "18:00")], now: noon }).status.tone).toBe("full");
    // The half hour that began at 12:00 is gone; the next free one is 12:30.
    expect(roomDay({ date, bookable: true, holds: [], now: noon }).nextFree).toEqual({ start: "12:30", end: "18:00" });
  });

  it("is over, not full, once the day's hours have passed", () => {
    const evening = new Date(wibInstant(date, "17:45"));
    expect(roomDay({ date, bookable: true, holds: [hold("09:00", "10:00")], now: evening }).status).toEqual({ tone: "closed", text: "Sudah lewat · 1 booking" });
    expect(roomDay({ date, bookable: true, holds: [], now: new Date(wibInstant("2026-11-06", "08:00")) }).status.text).toBe("Sudah lewat");
  });

  it("marks a room that cannot be booked, whatever its holds", () => {
    expect(roomDay({ date, bookable: false, holds: [hold("09:00", "10:00")], now: before }).status).toEqual({ tone: "off", text: "Tidak bisa dibooking" });
  });

  it("ignores time outside opening hours", () => {
    expect(roomDay({ date, bookable: true, holds: [hold("08:00", "09:30")], now: before }).takenMinutes).toBe(30);
  });
});

describe("labels", () => {
  it("reads durations, counts and runs", () => {
    expect([durationLabel(210), durationLabel(60), durationLabel(30), durationLabel(0)]).toEqual(["3 jam 30 mnt", "1 jam", "30 mnt", "0 mnt"]);
    expect(countLabel(2, 1)).toBe("2 booking, 1 sesi");
    expect(runLabel({ start: "13:00", end: "15:30" })).toBe("13.00–15.30");
  });
  it("starts a booking at the free run, an hour long when it fits", () => {
    expect(bookingFrom({ start: "13:00", end: "15:30" })).toEqual({ start: "13:00", end: "14:00" });
    expect(bookingFrom({ start: "17:30", end: "18:00" })).toEqual({ start: "17:30", end: "18:00" });
  });
});
