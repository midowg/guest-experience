// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { WbBoardRow, WbLedgerItem } from "@/lib/wellbeing/app-types";
import { chaseOf, daysLeft, daysLeftLabel, medalOf, nearBeyond, rankTrend, recordsOf } from "./race";

const row = (rank: number, points: number, me = false, id = `p${rank}${me ? "me" : ""}`): WbBoardRow => ({ rank, employeeId: id, name: `Orang ${rank}`, department: "", points, me });

describe("days left", () => {
  it("counts today and stops at the month's end", () => {
    expect(daysLeft("2026-11-17")).toBe(14);
    expect(daysLeft("2026-11-30")).toBe(1);
    expect(daysLeft("2026-02-01")).toBe(28);
    expect(daysLeftLabel("2026-11-30")).toBe("Hari terakhir");
    expect(daysLeftLabel("2026-11-29")).toBe("Sisa 2 hari");
  });
});

describe("chase", () => {
  it("names the one to catch and the gap", () => {
    const me = row(16, 7240, true), ahead = row(15, 7360), behind = row(17, 7000);
    const chase = chaseOf({ me, ahead, items: [ahead, me, behind], near: [ahead, me, behind] });
    expect(chase).toMatchObject({ kind: "chase", gap: 120, ahead: { rank: 15 }, behind: { rank: 17 } });
    // Between the one behind (7.000) and the one ahead (7.360).
    expect(chase.kind === "chase" && chase.progress).toBeCloseTo(240 / 360);
    // Last on the board: measured from zero.
    expect(chaseOf({ me, ahead, items: [ahead, me], near: [ahead, me] })).toMatchObject({ behind: null, progress: 7240 / 7360 });
  });
  it("leads, ties at the top, or has not started", () => {
    const me = row(1, 15000, true), second = row(2, 14200);
    expect(chaseOf({ me, ahead: null, items: [me, second], near: [me, second] })).toMatchObject({ kind: "lead", margin: 800, runnerUp: { rank: 2 } });
    expect(chaseOf({ me, ahead: null, items: [me], near: [me] })).toMatchObject({ kind: "lead", runnerUp: null });
    const twin = row(1, 15000);
    expect(chaseOf({ me, ahead: null, items: [twin, me], near: [twin, me] })).toMatchObject({ kind: "tied", with: { employeeId: twin.employeeId } });
    expect(chaseOf({ me: null, ahead: null, items: [second], near: [] })).toEqual({ kind: "none" });
  });
});

describe("board helpers", () => {
  it("gives medals to the top three only", () => {
    expect([1, 2, 3, 4].map(medalOf)).toEqual(["gold", "silver", "bronze", null]);
  });
  it("lists the rows around me that the top list leaves out", () => {
    const top = Array.from({ length: 30 }, (_, index) => row(index + 1, 1000 - index));
    const near = [row(30, 971), row(31, 960), row(32, 950, true), row(33, 940), row(34, 930)];
    expect(nearBeyond({ items: top, near: near.map((item, index) => index === 0 ? top[29] : item) }).map(item => item.rank)).toEqual([31, 32, 33, 34]);
    expect(nearBeyond({ items: top, near: top.slice(0, 5) })).toEqual([]);
  });
});

describe("records", () => {
  const item = (date: string, points: number, kind: WbLedgerItem["kind"] = "activity"): WbLedgerItem => ({ date, title: "", sub: "", points, kind, dimension: null });
  it("finds the best month and the longest run of active days", () => {
    const records = recordsOf([
      item("2026-11-17", 400), item("2026-11-16", 80), item("2026-11-15", 80), item("2026-11-13", 900),
      item("2026-10-30", 500), item("2026-10-31", 500), item("2026-11-01", 100), item("2026-11-02", 100),
      item("2026-10-05", 3000, "admin"), item("2026-11-03", -200, "admin"),
    ]);
    expect(records.bestMonth).toEqual({ month: "2026-10", points: 4000 });
    // 30 Oct to 2 Nov: four days in a row, across the month's end; admin points do not make a day.
    expect(records.longestStreak).toBe(4);
    expect(recordsOf([])).toEqual({ bestMonth: null, longestStreak: 0 });
  });
});

describe("rank trend", () => {
  afterEach(() => window.localStorage.clear());
  it("compares with the last day seen this month, on this device", () => {
    expect(rankTrend("k", "2026-11-16", 18)).toBeNull();
    expect(rankTrend("k", "2026-11-16", 17)).toBeNull();
    expect(rankTrend("k", "2026-11-17", 15)).toEqual({ delta: 2, since: "2026-11-16" });
    // The same day again keeps the comparison with the earlier day.
    expect(rankTrend("k", "2026-11-17", 16)).toEqual({ delta: 1, since: "2026-11-16" });
    expect(rankTrend("k", "2026-11-18", 18)).toEqual({ delta: -2, since: "2026-11-17" });
    expect(rankTrend("k", "2026-12-01", 3)).toBeNull();
    expect(rankTrend("k", "2026-12-02", null)).toBeNull();
  });
});
