import { describe, expect, it } from "vitest";
import { wibInstant } from "./appraisal";
import { bookingFrom, countLabel, daySummaries, durationLabel, roomDay, runLabel, stripDay } from "./room-day";

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

describe("a whole day across the rooms, for the date strip", () => {
  const rooms = [{ id: "a", bookable: true }, { id: "b", bookable: true }, { id: "x", bookable: false }];
  const on = (roomId: string, day: string, start: string, end: string, session = false) => ({ roomId, startsAt: wibInstant(day, start), endsAt: wibInstant(day, end), session });

  it("counts the bookable rooms' bookings and sessions per date, and is not full while a half hour is free", () => {
    const summary = daySummaries(["2026-11-05", "2026-11-06"], rooms, [on("a", "2026-11-05", "09:00", "18:00"), on("b", "2026-11-05", "09:00", "12:00", true), on("x", "2026-11-05", "09:00", "18:00")], before);
    expect(summary).toEqual({ "2026-11-05": { bookings: 2, full: false, crowded: true }, "2026-11-06": { bookings: 0, full: false, crowded: false } });
  });

  it("is full when every bookable room has no free half hour, counting Pra WAM sessions", () => {
    const summary = daySummaries([date], rooms, [on("a", date, "09:00", "18:00"), on("b", date, "09:00", "13:00"), on("b", date, "13:00", "18:00", true)], before);
    expect(summary[date]).toEqual({ bookings: 3, full: true, crowded: true });
  });

  it("is crowded when one room has three quarters of its hours taken, not before", () => {
    expect(daySummaries([date], rooms, [on("a", date, "09:00", "15:45")], before)[date].crowded).toBe(true);
    expect(daySummaries([date], rooms, [on("a", date, "09:00", "15:30")], before)[date].crowded).toBe(false);
  });

  it("ignores today's half hours that have begun", () => {
    const late = new Date(wibInstant(date, "16:40"));
    const summary = daySummaries([date], rooms, [on("a", date, "17:00", "18:00"), on("b", date, "16:30", "18:00")], late);
    expect(summary[date].full).toBe(true);
    // Earlier the same holds leave the morning free.
    expect(daySummaries([date], rooms, [on("a", date, "17:00", "18:00"), on("b", date, "16:30", "18:00")], before)[date].full).toBe(false);
  });

  it("is never full on a day whose hours are over, or without a bookable room", () => {
    expect(daySummaries([date], rooms, [], new Date(wibInstant(date, "18:30")))[date].full).toBe(false);
    expect(daySummaries([date], [{ id: "x", bookable: false }], [], before)[date]).toEqual({ bookings: 0, full: false, crowded: false });
  });

  it("says each strip day's state in words", () => {
    const at = { today: "2026-11-04", selected: "2026-11-05" };
    expect(stripDay("2026-11-03", { ...at, summary: { bookings: 3, full: true } })).toMatchObject({ past: true, full: false, note: "Lewat" });
    expect(stripDay("2026-11-04", { ...at, summary: { bookings: 0, full: false } })).toMatchObject({ today: true, selected: false, note: "Kosong" });
    expect(stripDay("2026-11-05", { ...at, summary: { bookings: 2, full: false } })).toMatchObject({ selected: true, note: "2 terpakai" });
    expect(stripDay("2026-11-06", { ...at, summary: { bookings: 9, full: true } })).toMatchObject({ full: true, note: "Penuh" });
    expect(stripDay("2026-11-09", at).note).toBe("");
  });
});
