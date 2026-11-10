import { describe, expect, it } from "vitest";
import type { Booking, Room } from "@/lib/pra-wam/appraisal";
import type { ScheduleRequest } from "@/lib/pra-wam/requests";
import type { RoomUse, Session } from "@/lib/pra-wam/sessions";
import { bookingTone, dayRows, dayStatus, hourWindow, hoursOn, nextSessionLabel, phaseDay, readiness, requestCheck, roomRows, sessionBlock, spanOn, withQuery } from "./schedule";

const session = (patch: Partial<Session>): Session => ({
  id: "s1", title: "Forum HC", kind: "forum", description: "", status: "terbit", planFrom: null, planTo: null,
  startsAt: "2026-11-05T02:00:00.000Z", endsAt: "2026-11-05T04:30:00.000Z", roomId: "r1", roomName: "Limasan", location: "",
  participantCount: 2, isParticipant: false, participants: [{ id: "p1", name: "Ayu", department: "HC" }, { id: "p2", name: "Budi", department: "IT" }], ...patch,
});
const room = (patch: Partial<Room>): Room => ({ id: "r1", slug: "limasan", name: "Limasan", kind: "utama", capacity: 40, bookable: true, minPeople: null, planKey: null, facilities: [], ...patch });
const booking = (patch: Partial<Booking>): Booking => ({
  id: "b1", roomId: "r2", title: "Appraisal tim", description: "", startsAt: "2026-11-05T06:00:00.000Z", endsAt: "2026-11-05T07:00:00.000Z",
  bookedBy: { id: "p3", name: "Citra", department: "" }, participants: null, ...patch,
});

describe("hours on a day (WIB)", () => {
  it("reads the clock in WIB and clips a span to the day", () => {
    expect(hoursOn("2026-11-05", "2026-11-05T02:30:00.000Z")).toBe(9.5);
    expect(hoursOn("2026-11-05", "2026-11-04T10:00:00.000Z")).toBe(0);
    expect(hoursOn("2026-11-05", "2026-11-06T02:00:00.000Z")).toBe(24);
    // 19.00 on the 5th to 01.00 on the 6th WIB: on the 5th from 19 to the end of the day.
    expect(spanOn("2026-11-05", "2026-11-05T12:00:00.000Z", "2026-11-05T18:00:00.000Z")).toEqual({ start: 19, end: 24 });
    expect(spanOn("2026-11-07", "2026-11-05T02:00:00.000Z", "2026-11-05T04:00:00.000Z")).toBeNull();
  });
});

describe("timeline blocks", () => {
  it("colours a session by kind, a draft neutral, and skips a cancelled one", () => {
    expect(sessionBlock(session({}), "2026-11-05", "/x")).toMatchObject({ title: "Forum HC", start: 9, end: 11.5, tone: "brass", sub: "Forum · 09.00–11.30" });
    expect(sessionBlock(session({ kind: "rapat" }), "2026-11-05", "/x")?.tone).toBe("ok");
    expect(sessionBlock(session({ status: "draf" }), "2026-11-05", "/x")).toMatchObject({ tone: "neutral", sub: "Draf · 09.00–11.30" });
    expect(sessionBlock(session({ status: "batal" }), "2026-11-05", "/x")).toBeNull();
    expect(sessionBlock(session({ startsAt: null, endsAt: null }), "2026-11-05", "/x")).toBeNull();
  });

  it("tells a one-on-one booking from other bookings", () => {
    expect(bookingTone("Appraisal 1-on-1")).toBe("purple");
    expect(bookingTone("One on one Dewi")).toBe("purple");
    expect(bookingTone("Appraisal tim")).toBe("blue");
  });

  it("lays a day out by room, sessions held elsewhere last, without daySchedule's copies of sessions", () => {
    const rows = roomRows({
      date: "2026-11-05",
      rooms: [room({}), room({ id: "r2", name: "Antareja", capacity: 4 }), room({ id: "r3", name: "Gudang", bookable: false })],
      bookings: [booking({}), booking({ id: "sesi:s1", roomId: "r1", isSession: true, title: "Forum HC" })],
      sessions: [session({}), session({ id: "s2", title: "Makan malam", kind: "acara", roomId: null, roomName: null, location: "Resto Bumi", startsAt: "2026-11-05T11:00:00.000Z", endsAt: "2026-11-05T13:00:00.000Z" })],
      sessionHref: item => `/sesi/${item.id}`, bookingHref: item => `/book/${item.id}`,
    });
    expect(rows.map(row => row.label)).toEqual(["Limasan", "Antareja", "Resto Bumi"]);
    expect(rows[0].blocks.map(block => block.key)).toEqual(["sesi-s1"]);
    expect(rows[1].blocks[0]).toMatchObject({ title: "Appraisal tim", tone: "blue", href: "/book/b1", sub: "Citra · 13.00–14.00" });
    expect(rows[2]).toMatchObject({ sub: "Di luar ruang booking" });
    expect(hourWindow(rows)).toEqual({ from: 8, to: 20 });
  });

  it("draws a booking that is a published session once, as the session with its booker", () => {
    const fromBooking = session({ id: "s9", title: "Appraisal tim", kind: "rapat", roomId: "r2", roomName: "Antareja", startsAt: "2026-11-05T06:00:00.000Z", endsAt: "2026-11-05T07:00:00.000Z", booking: { id: "b1", bookedBy: { id: "p3", name: "Citra", department: "Sales & Marketing" } } });
    const rows = roomRows({
      date: "2026-11-05", rooms: [room({}), room({ id: "r2", name: "Antareja", capacity: 4 })],
      bookings: [booking({}), booking({ id: "b2", roomId: "r1", startsAt: "2026-11-05T08:00:00.000Z", endsAt: "2026-11-05T09:00:00.000Z" })],
      sessions: [fromBooking], sessionHref: item => `/sesi/${item.id}`, bookingHref: item => `/book/${item.id}`,
    });
    expect(rows[1].blocks.map(block => block.key)).toEqual(["sesi-s9"]);
    expect(rows[1].blocks[0]).toMatchObject({ href: "/sesi/s9", sub: "SM - Citra · 13.00–14.00" });
    // Another booking without a session is still drawn.
    expect(rows[0].blocks.map(block => block.key)).toEqual(["booking-b2"]);
    // A cancelled session gives the room back to its booking row (nothing drawn twice, nothing lost).
    const cancelled = roomRows({ date: "2026-11-05", rooms: [room({ id: "r2", name: "Antareja" })], bookings: [booking({})], sessions: [{ ...fromBooking, status: "batal" }], sessionHref: () => "", bookingHref: () => "/book" });
    expect(cancelled[0].blocks.map(block => block.key)).toEqual(["booking-b1"]);
  });

  it("lays a week out by day", () => {
    const rows = dayRows(["2026-11-04", "2026-11-05"], [session({})], item => `/sesi/${item.id}`, "2026-11-05");
    expect(rows[0]).toMatchObject({ key: "2026-11-04", sub: "0 sesi", blocks: [] });
    expect(rows[1]).toMatchObject({ sub: "Hari ini" });
    expect(rows[1].blocks[0]).toMatchObject({ sub: "Limasan", href: "/sesi/s1" });
    expect(hourWindow([])).toEqual({ from: 8, to: 18 });
  });
});

describe("statuses", () => {
  const now = new Date("2026-11-05T03:00:00.000Z");
  it("says where a session stands", () => {
    expect(readiness(session({}), now)).toEqual({ label: "Berlangsung", tone: "blue" });
    expect(readiness(session({ endsAt: "2026-11-05T02:30:00.000Z" }), now)).toEqual({ label: "Selesai absen", tone: "ok" });
    expect(readiness(session({ startsAt: "2026-11-05T05:00:00.000Z" }), now)).toEqual({ label: "Terjadwal", tone: "neutral" });
    expect(readiness(session({ roomId: null, location: "" }), now)).toEqual({ label: "Tempat belum ada", tone: "warn" });
    expect(readiness(session({ status: "draf" }), now).label).toBe("Draf");
    expect(readiness(session({ status: "batal" }), now).tone).toBe("bad");
  });

  it("names the Pra WAM day", () => {
    const phase = { kind: "pra_wam", name: "Pra WAM", startDate: "2026-10-28", endDate: "2026-12-23" };
    expect(phaseDay(phase, "2026-11-05")).toBe("Pra WAM hari ke-9");
    expect(phaseDay({ ...phase, kind: "wam", name: "WAM 2027" }, "2026-11-05")).toBe("WAM 2027");
    expect(phaseDay(null, "2026-11-05")).toBeNull();
  });

  it("knows who came today, who is still expected, and who has no session", () => {
    const todays = [session({})];
    expect(dayStatus("p1", todays, new Set(["s1:p1"]))).toBe("hadir");
    expect(dayStatus("p2", todays, new Set(["s1:p1"]))).toBe("belum");
    expect(dayStatus("p9", todays, new Set())).toBe("kosong");
    // Attendance not recorded: nobody shows as present.
    expect(dayStatus("p1", todays, null)).toBe("belum");
  });

  it("finds a person's next session", () => {
    const later = session({ id: "s3", title: "Rapat IT", startsAt: "2026-11-06T06:00:00.000Z", endsAt: "2026-11-06T07:00:00.000Z" });
    expect(nextSessionLabel("p1", [session({}), later], now)).toBe("Rapat IT · Jum, 6 Nov 13.00");
    expect(nextSessionLabel("p9", [later], now)).toBeNull();
  });
});

describe("a waiting request's check", () => {
  const request: Pick<ScheduleRequest, "sessionId" | "stillCurrent" | "toStartsAt" | "toEndsAt" | "toRoomId" | "toRoomName"> = {
    sessionId: "s1", stillCurrent: true, toStartsAt: "2026-11-06T02:00:00.000Z", toEndsAt: "2026-11-06T03:00:00.000Z", toRoomId: null, toRoomName: null,
  };
  const use = (patch: Partial<RoomUse>): RoomUse => ({ roomId: "r1", startsAt: "2026-11-06T02:30:00.000Z", endsAt: "2026-11-06T04:00:00.000Z", source: "booking", sourceId: "b1", label: "Appraisal (Citra)", ...patch });
  const current = { roomId: "r1", roomName: "Limasan", location: "" };

  it("says the room is free, taken, or not a booked room, and warns when the session moved", () => {
    expect(requestCheck(request, current, [])).toEqual({ tone: "ok", text: "Limasan kosong pada jam itu." });
    expect(requestCheck(request, current, [use({})]).tone).toBe("warn");
    expect(requestCheck(request, current, [use({})]).text).toMatch(/^Limasan dipakai Appraisal \(Citra\), 09\.30–11\.00/);
    // The session's own hold and other rooms do not count.
    expect(requestCheck(request, current, [use({ sourceId: "s1" }), use({ roomId: "r2" })]).tone).toBe("ok");
    expect(requestCheck({ ...request, toRoomId: "r2", toRoomName: "Antareja" }, current, [use({})]).text).toBe("Antareja kosong pada jam itu.");
    expect(requestCheck(request, { roomId: null, roomName: null, location: "Resto Bumi" }, []).tone).toBe("neutral");
    expect(requestCheck({ ...request, stillCurrent: false }, current, []).tone).toBe("warn");
  });
});

it("adds a query to a path", () => {
  expect(withQuery("/wam/manage/sessions", { view: "linimasa", tanggal: undefined })).toBe("/wam/manage/sessions?view=linimasa");
  expect(withQuery("/wam/manage/requests", {})).toBe("/wam/manage/requests");
});
