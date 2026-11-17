import { describe, expect, it } from "vitest";
import { board, ledgerItems, placeOf, streakDays, streakStart, weekSeries, type LedgerActivity } from "./member-rules";

const today = "2026-11-17";

describe("streak", () => {
  it("counts days in a row ending today or, before today's first activity, yesterday", () => {
    expect(streakDays(["2026-11-17", "2026-11-16", "2026-11-15", "2026-11-13"], today)).toBe(3);
    expect(streakDays(["2026-11-16", "2026-11-15"], today)).toBe(2);
    expect(streakDays(["2026-11-15", "2026-11-14"], today)).toBe(0);
    expect(streakDays([], today)).toBe(0);
  });
  it("counts a day with several activities once, across a month end", () => {
    expect(streakDays(["2026-11-01", "2026-11-01", "2026-10-31", "2026-10-30"], "2026-11-01")).toBe(3);
  });
  it("names the first day of the streak, so older history is read only when needed", () => {
    expect(streakStart(["2026-11-17", "2026-11-16", "2026-11-15"], today)).toBe("2026-11-15");
    expect(streakStart(["2026-11-16"], today)).toBe("2026-11-16");
    expect(streakStart(["2026-11-10"], today)).toBeNull();
  });
});

describe("week", () => {
  it("gives the last seven days, oldest first and today last, summing each day", () => {
    const week = weekSeries([{ date: "2026-11-17", points: 80 }, { date: "2026-11-17", points: 912 }, { date: "2026-11-11", points: 150 }, { date: "2026-11-10", points: 999 }], today);
    expect(week.map(day => day.date)).toEqual(["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17"]);
    expect(week.map(day => day.points)).toEqual([150, 0, 0, 0, 0, 0, 992]);
  });
});

describe("board", () => {
  const people = [
    { id: "a", name: "Contoh Satu", department: "CoE", points: 900 },
    { id: "b", name: "Contoh Dua", department: "Finance", points: 1200 },
    { id: "c", name: "Contoh Tiga", department: "CoE", points: 900 },
    { id: "d", name: "Contoh Empat", department: "HR", points: 300 },
    { id: "e", name: "Contoh Lima", department: "HR", points: 0 },
  ];
  it("ranks people with points, ties sharing a place and listed by name", () => {
    const { items, me } = board(people, "c");
    expect(items.map(row => [row.name, row.rank])).toEqual([["Contoh Dua", 1], ["Contoh Satu", 2], ["Contoh Tiga", 2], ["Contoh Empat", 4]]);
    expect(me).toMatchObject({ employeeId: "c", rank: 2, points: 900, me: true });
    expect(items.filter(row => row.me)).toHaveLength(1);
  });
  it("carries each person's profile photo, and none for initials (18 Nov 2026)", () => {
    const { items } = board(people.map(person => person.id === "b" ? { ...person, photo: "/api/wam/photo/b?v=1" } : { ...person, photo: null }), "c");
    expect(items[0]).toMatchObject({ employeeId: "b", photo: "/api/wam/photo/b?v=1" });
    expect("photo" in items[1]).toBe(false);
  });
  it("lists only the top rows but still gives my place, and none without points", () => {
    expect(board(people, "d", 2).items).toHaveLength(2);
    expect(board(people, "d", 2).me).toMatchObject({ rank: 4 });
    expect(board(people, "e").me).toBeNull();
  });
  it("gives who is around me, also past the top rows, and the nearest one with more points (18 Nov 2026)", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({ id: `p${index}`, name: `Orang ${String(index).padStart(2, "0")}`, department: "", points: 1000 - index * 10 }));
    expect(board(many, "p35").items).toHaveLength(40);
    const deep = board(many, "p35", 30);
    expect(deep.items).toHaveLength(30);
    expect(deep.near.map(row => row.rank)).toEqual([34, 35, 36, 37, 38]);
    expect(deep.ahead).toMatchObject({ employeeId: "p34", rank: 35 });
    expect(board(many, "p0").near.map(row => row.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(board(many, "p0").ahead).toBeNull();
    expect(board(many, "p39").near.map(row => row.rank)).toEqual([36, 37, 38, 39, 40]);
    // Ties share my place: the one to catch is the nearest with more points.
    expect(board(people, "c").ahead).toMatchObject({ employeeId: "b", rank: 1 });
    expect(board(people, "e")).toMatchObject({ near: [], ahead: null });
  });
  it("gives the same place on Beranda as on the board (17 Nov 2026)", () => {
    expect(placeOf(people, "a")).toBe(2);
    expect(placeOf(people, "d")).toBe(4);
    expect(placeOf(people, "e")).toBeNull();
    expect(placeOf([{ id: "x", points: -50 }], "x")).toBeNull();
  });
});

describe("ledger", () => {
  const activity = (over: Partial<LedgerActivity>): LedgerActivity => ({
    date: "2026-11-17", createdAt: "2026-11-17T02:00:00Z", title: "", typeName: "Langkah harian", dimension: "physical", source: "manual",
    steps: null, kcal: null, minutes: null, points: 0, status: "approved", ...over,
  });
  it("merges counted activities and admin points, newest first, with their total", () => {
    const { items, total } = ledgerItems([
      activity({ steps: 9128, points: 912 }),
      activity({ date: "2026-11-15", title: "Morning Run", typeName: "Lari", source: "strava", kcal: 412, minutes: 45, points: 412 }),
      activity({ date: "2026-11-16", typeName: "Meditasi", dimension: "emotional", points: 70, status: "rejected" }),
      activity({ date: "2026-11-16", typeName: "Meditasi", dimension: "emotional", points: 50, status: "adjusted", createdAt: "2026-11-16T01:00:00Z" }),
    ], [
      { date: "2026-11-16", createdAt: "2026-11-16T09:00:00Z", reason: "Kehadiran internal activities", points: 100, dimension: "social", kind: "admin" },
      { date: "2026-05-22", createdAt: "2026-11-17T00:00:00Z", reason: "Saldo awal", points: 1500, dimension: null, kind: "import" },
    ]);
    expect(items.map(item => item.title)).toEqual(["Langkah harian", "Kehadiran internal activities", "Meditasi", "Morning Run", "Saldo awal"]);
    expect(items[0]).toMatchObject({ sub: "Fisik · 9.128 langkah", points: 912, kind: "activity", dimension: "physical" });
    expect(items[1]).toMatchObject({ sub: "Dari admin · Sosial", kind: "admin" });
    expect(items[2].sub).toBe("Emosional · Poin diubah admin");
    expect(items[3].sub).toBe("Fisik · 412 kkal · 45 menit · Strava");
    expect(items[4]).toMatchObject({ sub: "Saldo dari aplikasi lama", kind: "import", dimension: null });
    expect(total).toBe(912 + 100 + 50 + 412 + 1500);
  });
});
