import { describe, expect, it } from "vitest";
import { canDelete, canOpenFile, canReport, canSee, moderates } from "./access";
import { filterGroups, tagGroups, countTotals, choiceSub, dayHead } from "./sessions";
import { sampleSessions, sampleSessionIds } from "../sample";

/* Who may see, open, report and delete one photo (the single-photo APIs), and the session sheets. */

const now = new Date("2027-01-05T10:05:00+07:00");
const g4 = { id: "g4", number: 4, name: "Arjuno", coordinator: false, size: 10 };
const rani = { id: "rani", roles: [] as never[], group: g4 };
const dimas = { id: "dimas", roles: [] as never[], group: { ...g4, id: "g2", number: 2 } };
const yoga = { id: "yoga", roles: [] as never[], group: null };
const panitia = { id: "putri", roles: ["panitia"] as never[], group: null };
const photo = (over: Partial<{ ownerId: string; audience: "semua" | "kelompok"; groupId: string | null; status: "tampil" | "ditinjau" | "disembunyikan"; visibleAt: string }> = {}) => ({
  ownerId: "sari", audience: "semua" as const, groupId: null, status: "tampil" as const, visibleAt: "2027-01-05T10:00:00+07:00", ...over,
});

describe("one photo's access", () => {
  it("shows a photo for everyone to all, after its 5 seconds", () => {
    expect(canSee(rani, photo(), now)).toBe(true);
    expect(canSee(yoga, photo(), now)).toBe(true);
    expect(canSee(rani, photo({ visibleAt: "2027-01-05T10:05:03+07:00" }), now)).toBe(false);
    expect(canSee({ ...rani, id: "sari" }, photo({ visibleAt: "2027-01-05T10:05:03+07:00" }), now)).toBe(true);
  });

  it("shows a kelompok photo only to that kelompok (and its owner)", () => {
    const forG4 = photo({ audience: "kelompok", groupId: "g4" });
    expect(canSee(rani, forG4, now)).toBe(true);
    expect(canSee(dimas, forG4, now)).toBe(false);
    expect(canSee(yoga, forG4, now)).toBe(false);
    expect(canOpenFile(dimas, forG4, now)).toBe(false);
  });

  it("hides a photo in review or hidden from everyone but its owner and panitia", () => {
    const hidden = photo({ status: "ditinjau" });
    expect(canSee(rani, hidden, now)).toBe(false);
    expect(canSee({ ...rani, id: "sari" }, hidden, now)).toBe(true);
    expect(canOpenFile(panitia, hidden, now)).toBe(true);
    expect(moderates(panitia)).toBe(true);
    expect(moderates(rani)).toBe(false);
  });

  it("lets only the owner delete (panitia go through moderation); anyone who sees it (not the owner) report", () => {
    expect(canDelete({ ...rani, id: "sari" }, photo())).toBe(true);
    // Audit M2: panitia may see and open the file of any photo, but not delete it here.
    expect(canDelete(panitia, photo())).toBe(false);
    expect(canDelete(panitia, photo({ audience: "kelompok", groupId: "g4" }))).toBe(false);
    expect(canDelete({ ...panitia, id: "sari" }, photo())).toBe(true);
    expect(canDelete(rani, photo())).toBe(false);
    expect(canReport(rani, photo(), now)).toBe(true);
    expect(canReport({ ...rani, id: "sari" }, photo(), now)).toBe(false);
    expect(canReport(dimas, photo({ audience: "kelompok", groupId: "g4" }), now)).toBe(false);
  });
});

describe("the session sheets", () => {
  it("Saring sesi: sessions with photos, newest day first, latest first in a day", () => {
    const choices = sampleSessions.map(session => ({ id: session.id, title: session.title, date: session.startsAt.slice(0, 10), startsAt: session.startsAt, time: "", running: false }));
    const groups = filterGroups(choices, [{ sessionId: sampleSessionIds.pemaparan, photos: 24 }, { sessionId: sampleSessionIds.wellness, photos: 3 }, { sessionId: sampleSessionIds.pembukaan, photos: 40 }, { sessionId: null, photos: 5 }], now);
    expect(groups.map(group => group.head)).toEqual(["Hari ini · Sel, 5 Jan", "Kemarin · Sen, 4 Jan"]);
    expect(groups[0].rows.map(row => row.title)).toEqual(["Pemaparan departemen", "Wellness pagi"]);
    expect(countTotals([{ sessionId: "a", photos: 3 }, { sessionId: null, photos: 5 }])).toEqual({ all: 8, umum: 5 });
  });

  it("Tag sesi: only sessions already started; the running one says so", () => {
    const at = new Date("2027-01-05T15:20:00+07:00");
    const groups = tagGroups(sampleSessions, at);
    expect(groups[0].head).toBe("Hari ini · Sel, 5 Jan");
    expect(groups[0].rows[0]).toMatchObject({ title: "Team building", running: true });
    expect(groups.flatMap(group => group.rows).some(row => row.title === "Makan malam" && row.date === "2027-01-05")).toBe(false);
    expect(choiceSub(groups[0].rows[0])).toBe("15.00–17.00 · sedang berlangsung");
    expect(dayHead("2027-01-07", "2027-01-05")).toBe("Kam, 7 Jan");
  });
});
