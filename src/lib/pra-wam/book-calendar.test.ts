import { describe, expect, it } from "vitest";
import { praWamPath } from "@/lib/routes";
import { bookableFrom, clockAt, dayMinutes, draftHours, hoursInGap, nowOffset, roomDay, startInGap, weekShift, weekSummary, wibInstant, workWeek } from "./appraisal";

const at = (date: string, time: string) => new Date(wibInstant(date, time));
const hold = (id: string, roomId: string, date: string, start: string, end: string) => ({ id, roomId, startsAt: wibInstant(date, start), endsAt: wibInstant(date, end) });

describe("the work week", () => {
  it("runs Monday to Friday around a weekday", () => {
    expect(workWeek("2026-11-04")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
  });
  it("puts a weekend in the week before", () => {
    expect(workWeek("2026-11-08")[0]).toBe("2026-11-02");
    expect(workWeek("2026-11-07")[4]).toBe("2026-11-06");
  });
  it("moves a week at a time, across months", () => {
    expect(weekShift("2026-11-04", 1)).toBe("2026-11-09");
    expect(weekShift("2026-11-04", -1)).toBe("2026-10-26");
  });
});

describe("now on the calendar", () => {
  it("can book from the next half hour that has not started", () => {
    // Minutes from opening, 07.00.
    expect(bookableFrom("2026-11-04", at("2026-11-04", "10:12"))).toBe(210);
    expect(bookableFrom("2026-11-04", at("2026-11-04", "10:00"))).toBe(210);
    expect(bookableFrom("2026-11-04", at("2026-11-04", "06:30"))).toBe(0);
    expect(bookableFrom("2026-11-04", at("2026-11-04", "22:30"))).toBe(dayMinutes);
  });
  it("treats other days as all open or all gone", () => {
    expect(bookableFrom("2026-11-05", at("2026-11-04", "10:12"))).toBe(0);
    expect(bookableFrom("2026-11-03", at("2026-11-04", "10:12"))).toBe(dayMinutes);
  });
  it("draws the line only during that day's hours", () => {
    expect(nowOffset("2026-11-04", at("2026-11-04", "10:12"))).toBe(192);
    expect(nowOffset("2026-11-05", at("2026-11-04", "10:12"))).toBeNull();
    expect(nowOffset("2026-11-04", at("2026-11-04", "22:30"))).toBeNull();
  });
});

describe("a room's day", () => {
  it("is one free stretch when nothing is booked", () => {
    expect(roomDay("2026-11-05", [], at("2026-11-04", "10:00"))).toEqual([{ kind: "free", from: 0, to: dayMinutes }]);
  });
  it("places bookings and the free time between them", () => {
    const a = hold("a", "r", "2026-11-05", "10:00", "11:30"), b = hold("b", "r", "2026-11-05", "13:00", "14:00");
    expect(roomDay("2026-11-05", [b, a], at("2026-11-04", "10:00"))).toEqual([
      { kind: "free", from: 0, to: 180 },
      { kind: "busy", from: 180, to: 270, booking: a },
      { kind: "free", from: 270, to: 360 },
      { kind: "busy", from: 360, to: 420, booking: b },
      { kind: "free", from: 420, to: dayMinutes },
    ]);
  });
  it("splits today's gaps at the next bookable half hour", () => {
    const a = hold("a", "r", "2026-11-04", "09:30", "10:00");
    expect(roomDay("2026-11-04", [a], at("2026-11-04", "10:40"))).toEqual([
      { kind: "past", from: 0, to: 150 },
      { kind: "busy", from: 150, to: 180, booking: a },
      { kind: "past", from: 180, to: 240 },
      { kind: "free", from: 240, to: dayMinutes },
    ]);
  });
  it("keeps a day gone as past around its bookings", () => {
    const a = hold("a", "r", "2026-11-03", "09:00", "10:00");
    expect(roomDay("2026-11-03", [a], at("2026-11-04", "10:00"))).toEqual([
      { kind: "past", from: 0, to: 120 },
      { kind: "busy", from: 120, to: 180, booking: a },
      { kind: "past", from: 180, to: dayMinutes },
    ]);
  });
  it("clips a session running past closing and opens no gap inside an overlap", () => {
    const a = hold("a", "r", "2026-11-05", "20:00", "23:00"), b = hold("b", "r", "2026-11-05", "19:00", "21:00");
    const day = roomDay("2026-11-05", [a, b], at("2026-11-04", "10:00"));
    expect(day.map(segment => [segment.kind, segment.from, segment.to])).toEqual([["free", 0, 720], ["busy", 720, 840], ["busy", 780, dayMinutes]]);
  });
});

describe("booking from a free stretch", () => {
  const gap = { from: 120, to: 300 };
  it("picks the half hour under the pointer", () => {
    expect(startInGap(gap, 170)).toBe(150);
    expect(startInGap(gap, 100)).toBe(120);
    expect(startInGap(gap, 299)).toBe(270);
  });
  it("offers an hour, or what is left", () => {
    expect(hoursInGap(gap, 150)).toEqual({ start: "09:30", end: "10:30" });
    expect(hoursInGap(gap, 270)).toEqual({ start: "11:30", end: "12:00" });
    expect(clockAt(dayMinutes)).toBe("22:00");
  });
  it("starts a new booking at the asked hours when they still fit", () => {
    const now = at("2026-11-04", "10:12");
    expect(draftHours("2026-11-04", now)).toEqual({ start: "10:30", end: "11:30" });
    expect(draftHours("2026-11-04", now, { start: "09:30" })).toEqual({ start: "10:30", end: "11:30" });
    expect(draftHours("2026-11-05", now, { start: "13:00", end: "15:00" })).toEqual({ start: "13:00", end: "15:00" });
    expect(draftHours("2026-11-05", now, { start: "13:00", end: "18:00" })).toEqual({ start: "13:00", end: "14:00" });
    expect(draftHours("2026-11-05", now, { start: "21:30" })).toEqual({ start: "21:30", end: "22:00" });
  });
});

describe("the week overview", () => {
  it("counts each day's bookings and busy minutes per room", () => {
    const week = workWeek("2026-11-04");
    const list = [hold("a", "r1", "2026-11-03", "10:00", "11:00"), hold("b", "r2", "2026-11-03", "09:00", "09:30"), hold("c", "r1", "2026-11-05", "14:00", "16:00"), hold("x", "gone", "2026-11-05", "09:00", "10:00")];
    const summary = weekSummary(week, ["r1", "r2"], list);
    expect(summary.map(day => [day.date, day.count, day.busyMinutes])).toEqual([
      ["2026-11-02", 0, 0], ["2026-11-03", 2, 90], ["2026-11-04", 0, 0], ["2026-11-05", 1, 120], ["2026-11-06", 0, 0],
    ]);
    expect(summary[1].rooms.r1).toEqual([{ from: 180, to: 240, booking: list[0] }]);
    expect(summary[3].rooms.r2).toEqual([]);
  });
});

describe("the address of an open sheet", () => {
  it("names the booking, the change, or the new booking's room and hours", () => {
    expect(praWamPath.bookSheet()).toBe("/wam/book");
    expect(praWamPath.bookSheet({ date: "2026-11-05", booking: "b-1" })).toBe("/wam/book?date=2026-11-05&booking=b-1");
    expect(praWamPath.bookSheet({ date: "2026-11-05", new: "1", room: "r", start: "10:00", end: "" })).toBe("/wam/book?date=2026-11-05&new=1&room=r&start=10%3A00");
  });
});
