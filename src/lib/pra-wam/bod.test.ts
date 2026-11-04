import { describe, expect, it } from "vitest";
import { accountState, activeForum, attentionItems, forumMark, greeting, initials, lowAttendance, percent } from "./bod";

const forum = (id: string, startsAt: string, live = false) => ({ id, title: id, present: 1, expected: 2, live, startsAt });

describe("BOD summary", () => {
  it("greets by the hour in WIB", () => {
    expect(greeting(new Date("2026-11-26T01:00:00Z"))).toBe("Selamat pagi"); // 08.00 WIB
    expect(greeting(new Date("2026-11-26T05:30:00Z"))).toBe("Selamat siang"); // 12.30
    expect(greeting(new Date("2026-11-26T09:00:00Z"))).toBe("Selamat sore"); // 16.00
    expect(greeting(new Date("2026-11-26T13:00:00Z"))).toBe("Selamat malam"); // 20.00
  });

  it("takes the forum running now, else the one that started last", () => {
    expect(activeForum([])).toBeNull();
    expect(activeForum([forum("a", "2026-11-10T02:00:00Z"), forum("b", "2026-11-24T02:00:00Z")])?.id).toBe("b");
    expect(activeForum([forum("a", "2026-11-10T02:00:00Z", true), forum("b", "2026-11-24T02:00:00Z")])?.id).toBe("a");
  });

  it("flags a department under half, and never divides by zero", () => {
    expect(lowAttendance({ present: 1, expected: 3 })).toBe(true);
    expect(lowAttendance({ present: 2, expected: 4 })).toBe(false);
    expect(lowAttendance({ present: 0, expected: 0 })).toBe(false);
    expect(percent(44, 57)).toBe(77);
    expect(percent(3, 0)).toBe(0);
  });

  it("lists only what the data shows", () => {
    expect(attentionItems({ lowUnits: [], openRequests: 0, drafts: 0, notSignedIn: 0, deadline: null, today: "2026-11-26" })).toEqual([]);
    const items = attentionItems({ lowUnits: ["A", "B", "C", "D", "E"], openRequests: 3, drafts: 2, notSignedIn: 6, deadline: "2026-12-23", today: "2026-11-26" });
    expect(items.map(item => item.kind)).toEqual(["low-attendance", "requests", "drafts", "not-signed-in", "deadline"]);
    expect(items[0]).toMatchObject({ title: "5 departemen hadir di bawah 50%", detail: "A, B, C, dan 2 lainnya" });
    expect(items[4].title).toBe("Batas final laporan & materi WAM");
    expect(items[4].detail).toMatch(/23 Desember 2026 · 27 hari lagi$/);
  });

  it("drops the deadline once it has passed", () => {
    expect(attentionItems({ lowUnits: [], openRequests: 0, drafts: 0, notSignedIn: 0, deadline: "2026-12-23", today: "2026-12-23" })[0].detail).toMatch(/hari ini$/);
    expect(attentionItems({ lowUnits: [], openRequests: 0, drafts: 0, notSignedIn: 0, deadline: "2026-12-23", today: "2026-12-24" })).toEqual([]);
  });
});

describe("BOD participant profile", () => {
  it("names the account state", () => {
    expect(accountState(null)).toBe("tanpa-akun");
    expect(accountState({ active: false, lastLoginAt: "2026-11-04T01:00:00Z" })).toBe("nonaktif");
    expect(accountState({ active: true, lastLoginAt: null })).toBe("belum-masuk");
    expect(accountState({ active: true, lastLoginAt: "2026-11-04T01:00:00Z" })).toBe("aktif");
  });

  it("marks a forum as attended, missed, or still running", () => {
    const now = new Date("2026-11-26T03:00:00Z");
    expect(forumMark(true, "2026-11-26T02:00:00Z", now)).toBe("hadir");
    expect(forumMark(false, "2026-11-26T02:00:00Z", now)).toBe("tidak-hadir");
    expect(forumMark(false, "2026-11-26T05:00:00Z", now)).toBe("berlangsung");
  });

  it("makes initials from two words", () => {
    expect(initials("Fadli Fahmi Ali")).toBe("FA");
    expect(initials("Yulia")).toBe("Y");
  });
});
