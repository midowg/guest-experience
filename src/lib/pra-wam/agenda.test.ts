import { describe, expect, it } from "vitest";
import { checkInStatus, checkInText, pickDay, pickItem } from "./agenda";

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
  it("opens the item asked for, else the next one, else the first", () => {
    const today = items.slice(1);
    expect(pickItem(today, "b", now)?.key).toBe("b");
    expect(pickItem(today, "missing", now)?.key).toBe("c");
    expect(pickItem(today, undefined, at("2026-11-26T09:00:00Z"))?.key).toBe("b");
    expect(pickItem([], "b", now)).toBeUndefined();
  });
});
