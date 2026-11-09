import { describe, expect, it } from "vitest";
import { calendarWeeks, rangeLabel, timelineLanes, timelineMonths, TIMELINE_COLORS, type TimelineItem } from "./timeline";

const item = (patch: Partial<TimelineItem>): TimelineItem => ({
  id: patch.title ?? "x", title: "x", kind: "forum", published: false, planFrom: null, planTo: null, startsAt: null, endsAt: null, mine: false, ...patch,
});

describe("Timeline", () => {
  it("labels a range within a month, across months, and one day", () => {
    expect(rangeLabel("2026-11-24", "2026-11-27")).toBe("24–27 Nov");
    expect(rangeLabel("2026-11-30", "2026-12-04")).toBe("30 Nov – 4 Des");
    expect(rangeLabel("2026-12-29", "2026-12-29")).toMatch(/29 Des/);
  });

  it("orders by date, groups by the month it starts, and says what is done, running and ahead", () => {
    const months = timelineMonths([
      item({ title: "End Year Dinner", kind: "acara", planFrom: "2026-12-29", planTo: "2026-12-29" }),
      item({ title: "HOD Meeting", planFrom: "2026-11-24", planTo: "2026-11-27" }),
      item({ title: "Rekonsiliasi ACC", planFrom: "2026-11-11", planTo: "2026-11-12" }),
      item({ title: "Review", published: true, startsAt: "2026-11-10T02:30:00Z", endsAt: "2026-11-10T06:00:00Z", mine: true }),
      item({ title: "Tanpa tanggal" }),
    ], "2026-11-11");
    expect(months.map(month => month.label)).toEqual(["November 2026", "Desember 2026"]);
    expect(months[0].entries.map(entry => [entry.title, entry.state])).toEqual([
      ["Review", "selesai"], ["Rekonsiliasi ACC", "berlangsung"], ["HOD Meeting", "akan"],
    ]);
    // A published one has its WIB hours; a draft only its planned dates.
    expect(months[0].entries[0].hours).toBe("09.30–13.00");
    expect(months[0].entries[1].hours).toBeNull();
  });
});

describe("Timeline calendar", () => {
  const months = timelineMonths([
    item({ title: "CSM", planFrom: "2026-11-24", planTo: "2026-11-27" }),
    item({ title: "HOD", planFrom: "2026-11-24", planTo: "2026-11-27" }),
    item({ title: "Revenue", planFrom: "2026-11-24", planTo: "2026-12-04" }),
    item({ title: "BOD", planFrom: "2026-11-30", planTo: "2026-12-04" }),
  ], "2026-11-01");
  const entries = months.flatMap(month => month.entries);

  it("gives every entry its own colour, in order", () => {
    expect(entries.map(entry => entry.color)).toEqual([0, 1, 2, 3]);
    expect(TIMELINE_COLORS).toBeGreaterThan(entries.length);
  });

  it("puts overlapping entries on separate lanes and reuses a lane once it is free", () => {
    const lanes = timelineLanes(entries);
    expect(lanes.get("Revenue")).not.toBe(lanes.get("CSM"));
    expect(new Set(["CSM", "HOD", "Revenue"].map(id => lanes.get(id))).size).toBe(3);
    // BOD starts after CSM and HOD have ended: it takes a freed lane, not a fourth one.
    expect(lanes.get("BOD")).toBeLessThan(3);
  });

  it("lays out November in Monday-first weeks, a bar crossing a week end continuing in the next", () => {
    const weeks = calendarWeeks("2026-11", entries);
    expect(weeks[0].days[0].date).toBe("2026-10-26");
    expect(weeks[0].days.filter(day => day.inMonth).map(day => day.date)).toEqual(["2026-11-01"]);
    expect(weeks.at(-1)!.days.at(-1)!.date).toBe("2026-12-06");
    const week = weeks.find(item => item.days[0].date === "2026-11-23")!;
    expect(week.bars.find(bar => bar.id === "CSM")).toMatchObject({ start: 1, end: 4, before: false, after: false });
    expect(week.bars.find(bar => bar.id === "Revenue")).toMatchObject({ start: 1, end: 6, after: true });
    const next = weeks.find(item => item.days[0].date === "2026-11-30")!;
    expect(next.bars.find(bar => bar.id === "Revenue")).toMatchObject({ start: 0, end: 4, before: true, after: false });
  });
});
