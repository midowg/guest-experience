import { describe, expect, it } from "vitest";
import { askedItem, bookingRights, checkInStatus, checkInText, pickDay, withItem } from "./agenda";

// A published session on 26 Nov 2026, 13.00–15.00 WIB (06.00–08.00 UTC).
const session = { status: "terbit" as const, isParticipant: true, startsAt: "2026-11-26T06:00:00Z", endsAt: "2026-11-26T08:00:00Z" };
const ready = { ready: true, checkedInAt: null };
const at = (iso: string) => new Date(iso);

describe("check-in status on Detail sesi", () => {
  it("shows nothing for drafts, sessions without time, and people who do not take part", () => {
    expect(checkInStatus({ ...session, status: "draf" }, ready, at("2026-11-26T06:30:00Z"))).toBeNull();
    expect(checkInStatus({ ...session, startsAt: null, endsAt: null }, ready, at("2026-11-26T06:30:00Z"))).toBeNull();
    expect(checkInStatus({ ...session, isParticipant: false }, ready, at("2026-11-26T06:30:00Z"))).toBeNull();
  });
  it("follows the window: 30 minutes before the start to 30 minutes after the end", () => {
    expect(checkInStatus(session, ready, at("2026-11-26T05:00:00Z"))).toEqual({ kind: "belum", opens: "2026-11-26T05:30:00.000Z", closes: "2026-11-26T08:30:00.000Z" });
    expect(checkInStatus(session, ready, at("2026-11-26T05:30:00Z"))?.kind).toBe("buka");
    expect(checkInStatus(session, ready, at("2026-11-26T08:30:00Z"))?.kind).toBe("buka");
    expect(checkInStatus(session, ready, at("2026-11-26T08:31:00Z"))?.kind).toBe("tutup");
  });
  it("says present once recorded, and does not offer a scan while attendance is not set up", () => {
    expect(checkInStatus(session, { ready: true, checkedInAt: "2026-11-26T06:02:00Z" }, at("2026-11-26T09:00:00Z"))).toEqual({ kind: "hadir", at: "2026-11-26T06:02:00Z" });
    expect(checkInStatus(session, { ready: false, checkedInAt: null }, at("2026-11-26T06:30:00Z"))).toEqual({ kind: "tidak-tersedia" });
  });
  it("words: the time it was recorded, and the hours of the QR (with the day when it is not today)", () => {
    expect(checkInText({ kind: "hadir", at: "2026-11-26T06:02:00Z" }, at("2026-11-26T06:30:00Z")).body).toBe("Absen tercatat 13.02.");
    expect(checkInText({ kind: "belum", opens: "2026-11-26T05:30:00.000Z", closes: "2026-11-26T08:30:00.000Z" }, at("2026-11-26T01:00:00Z")).body).toBe("QR sesi ini berlaku 12.30–15.30.");
    expect(checkInText({ kind: "belum", opens: "2026-11-26T05:30:00.000Z", closes: "2026-11-26T08:30:00.000Z" }, at("2026-11-24T01:00:00Z")).body).toMatch(/^QR sesi ini berlaku Kam.*26 Nov.*, 12\.30–15\.30\.$/);
    expect(checkInText({ kind: "buka", closes: "2026-11-26T08:30:00.000Z" }, at("2026-11-26T06:00:00Z")).title).toBe("Terdaftar · belum absen");
  });
});

describe("which day and item Agenda opens", () => {
  const items = [
    { key: "a", startsAt: "2026-11-24T02:00:00Z", endsAt: "2026-11-24T03:00:00Z" },
    { key: "b", startsAt: "2026-11-26T02:00:00Z", endsAt: "2026-11-26T05:00:00Z" },
    { key: "c", startsAt: "2026-11-26T06:00:00Z", endsAt: "2026-11-26T08:00:00Z" },
  ];
  const now = at("2026-11-26T05:30:00Z");
  it("lists today even when empty, and opens the first day with something still to come", () => {
    expect(pickDay(items, undefined, "2026-11-25", at("2026-11-25T01:00:00Z"))).toEqual({ days: ["2026-11-24", "2026-11-25", "2026-11-26"], day: "2026-11-26" });
    expect(pickDay([], undefined, "2026-11-25", now)).toEqual({ days: ["2026-11-25"], day: "2026-11-25" });
  });
  it("keeps a day asked for only if it is in the list", () => {
    expect(pickDay(items, "2026-11-24", "2026-11-26", now).day).toBe("2026-11-24");
    expect(pickDay(items, "2026-12-01", "2026-11-26", now).day).toBe("2026-11-26");
  });
});

describe("an agenda item open over the page", () => {
  it("reads the item from the address, and the older ?session= too", () => {
    expect(askedItem(new URLSearchParams("date=2026-11-26&item=b-1"))).toBe("b-1");
    expect(askedItem(new URLSearchParams("session=s-1"))).toBe("s-1");
    expect(askedItem(new URLSearchParams("item=b-1&session=s-1"))).toBe("b-1");
    expect(askedItem(new URLSearchParams("date=2026-11-26&item="))).toBeNull();
  });
  it("puts the item in the address and takes it out, keeping the day and the rest", () => {
    expect(withItem("/wam/agenda?date=2026-11-26", "b-1")).toBe("/wam/agenda?date=2026-11-26&item=b-1");
    expect(withItem("/wam/agenda?date=2026-11-26&item=b-1", "c-2")).toBe("/wam/agenda?date=2026-11-26&item=c-2");
    expect(withItem("/wam/agenda?date=2026-11-26&item=b-1", null)).toBe("/wam/agenda?date=2026-11-26");
    expect(withItem("/wam?session=s-1#materi", null)).toBe("/wam#materi");
    expect(withItem("/wam", "a b")).toBe("/wam?item=a+b");
  });
});

describe("what the person may do with a booking on the agenda", () => {
  const before = at("2026-11-26T05:00:00Z");
  const after = at("2026-11-26T09:00:00Z");
  const booking = { endsAt: "2026-11-26T08:00:00Z" };
  it("lets the booker change, cancel before it ends, and delete", () => {
    expect(bookingRights({ ...booking, mine: true }, { cancelsAny: false, bookingOpen: true }, before)).toEqual({ edit: true, cancel: true, remove: true });
    expect(bookingRights({ ...booking, mine: true }, { cancelsAny: false, bookingOpen: true }, after)).toEqual({ edit: true, cancel: false, remove: true });
  });
  it("offers Ubah only while booking is open", () => {
    expect(bookingRights({ ...booking, mine: true }, { cancelsAny: false, bookingOpen: false }, before).edit).toBe(false);
  });
  it("lets panitia and admin cancel or delete someone else's, but never change it", () => {
    expect(bookingRights({ ...booking, mine: false }, { cancelsAny: true, bookingOpen: true }, before)).toEqual({ edit: false, cancel: true, remove: true });
  });
  it("gives a participant who did not book it nothing to do", () => {
    expect(bookingRights({ ...booking, mine: false }, { cancelsAny: false, bookingOpen: true }, before)).toEqual({ edit: false, cancel: false, remove: false });
  });
});
