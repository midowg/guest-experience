import { describe, expect, it } from "vitest";
import { rangeLabel, timelineMonths, type TimelineItem } from "./timeline";

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
