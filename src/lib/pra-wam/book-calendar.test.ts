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
    expect(bookableFrom("2026-11-04", at("2026-11-04", "10:12"))).toBe(90);
    expect(bookableFrom("2026-11-04", at("2026-11-04", "10:00"))).toBe(90);
    expect(bookableFrom("2026-11-04", at("2026-11-04", "07:30"))).toBe(0);
    expect(bookableFrom("2026-11-04", at("2026-11-04", "19:00"))).toBe(dayMinutes);
  });
  it("treats other days as all open or all gone", () => {
    expect(bookableFrom("2026-11-05", at("2026-11-04", "10:12"))).toBe(0);
    expect(bookableFrom("2026-11-03", at("2026-11-04", "10:12"))).toBe(dayMinutes);
  });
  it("draws the line only during that day's hours", () => {
    expect(nowOffset("2026-11-04", at("2026-11-04", "10:12"))).toBe(72);
    expect(nowOffset("2026-11-05", at("2026-11-04", "10:12"))).toBeNull();
    expect(nowOffset("2026-11-04", at("2026-11-04", "18:30"))).toBeNull();
  });
});

describe("a room's day", () => {
  it("is one free stretch when nothing is booked", () => {
    expect(roomDay("2026-11-05", [], at("2026-11-04", "10:00"))).toEqual([{ kind: "free", from: 0, to: dayMinutes }]);
  });
  it("places bookings and the free time between them", () => {
    const a = hold("a", "r", "2026-11-05", "10:00", "11:30"), b = hold("b", "r", "2026-11-05", "13:00", "14:00");
    expect(roomDay("2026-11-05", [b, a], at("2026-11-04", "10:00"))).toEqual([
      { kind: "free", from: 0, to: 60 },
      { kind: "busy", from: 60, to: 150, booking: a },
      { kind: "free", from: 150, to: 240 },
      { kind: "busy", from: 240, to: 300, booking: b },
      { kind: "free", from: 300, to: dayMinutes },
    ]);
  });
  it("splits today's gaps at the next bookable half hour", () => {
    const a = hold("a", "r", "2026-11-04", "09:30", "10:00");
    expect(roomDay("2026-11-04", [a], at("2026-11-04", "10:40"))).toEqual([
      { kind: "past", from: 0, to: 30 },
      { kind: "busy", from: 30, to: 60, booking: a },
      { kind: "past", from: 60, to: 120 },
      { kind: "free", from: 120, to: dayMinutes },
    ]);
  });
  it("keeps a day gone as past around its bookings", () => {
    const a = hold("a", "r", "2026-11-03", "09:00", "10:00");
    expect(roomDay("2026-11-03", [a], at("2026-11-04", "10:00"))).toEqual([
      { kind: "busy", from: 0, to: 60, booking: a },
      { kind: "past", from: 60, to: dayMinutes },
    ]);
  });
  it("clips a session running past closing and opens no gap inside an overlap", () => {
    const a = hold("a", "r", "2026-11-05", "16:00", "19:00"), b = hold("b", "r", "2026-11-05", "15:00", "17:00");
    const day = roomDay("2026-11-05", [a, b], at("2026-11-04", "10:00"));
    expect(day.map(segment => [segment.kind, segment.from, segment.to])).toEqual([["free", 0, 360], ["busy", 360, 480], ["busy", 420, dayMinutes]]);
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
    expect(hoursInGap(gap, 150)).toEqual({ start: "11:30", end: "12:30" });
    expect(hoursInGap(gap, 270)).toEqual({ start: "13:30", end: "14:00" });
    expect(clockAt(dayMinutes)).toBe("18:00");
  });
  it("starts a new booking at the asked hours when they still fit", () => {
    const now = at("2026-11-04", "10:12");
    expect(draftHours("2026-11-04", now)).toEqual({ start: "10:30", end: "11:30" });
    expect(draftHours("2026-11-04", now, { start: "09:30" })).toEqual({ start: "10:30", end: "11:30" });
    expect(draftHours("2026-11-05", now, { start: "13:00", end: "15:00" })).toEqual({ start: "13:00", end: "15:00" });
    expect(draftHours("2026-11-05", now, { start: "13:00", end: "18:00" })).toEqual({ start: "13:00", end: "14:00" });
    expect(draftHours("2026-11-05", now, { start: "17:30" })).toEqual({ start: "17:30", end: "18:00" });
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
    expect(summary[1].rooms.r1).toEqual([{ from: 60, to: 120, booking: list[0] }]);
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
