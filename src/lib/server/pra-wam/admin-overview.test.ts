import { describe, expect, it, vi } from "vitest";
import type { Room } from "@/lib/pra-wam/appraisal";
import type { RoomUse } from "@/lib/pra-wam/sessions";

vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({ createPrivilegedClient: () => { throw new Error("no database in this test"); } }));

const { dayLine, decimalHours, questionnaireCounts, scheduleRows, scheduleSpan } = await import("./admin-overview");

const room = (id: string, patch: Partial<Room> = {}): Room => ({ id, slug: id, name: id.toUpperCase(), kind: "utama", capacity: 6, bookable: true, minPeople: null, planKey: null, facilities: [], ...patch });
const use = (roomId: string, startsAt: string, endsAt: string, source: RoomUse["source"] = "booking", label = "Appraisal (Dewi)"): RoomUse =>
  ({ roomId, startsAt, endsAt, source, sourceId: `${roomId}-${startsAt}`, label });

describe("today's schedule as timeline rows", () => {
  it("has a row per bookable room, and per other room in use, with blocks in WIB hours", () => {
    const rows = scheduleRows(
      [room("a"), room("b", { capacity: null }), room("lobi", { bookable: false }), room("gudang", { bookable: false })],
      [use("a", "2026-11-05T03:00:00Z", "2026-11-05T04:30:00Z"), use("lobi", "2026-11-05T06:00:00Z", "2026-11-05T08:00:00Z", "sesi", "Kick-off")],
      "2026-11-05",
    );
    expect(rows.map(row => row.key)).toEqual(["a", "b", "lobi"]);
    expect(rows[0].sub).toBe("6 orang");
    expect(rows[1].sub).toBeUndefined();
    expect(rows[0].blocks).toEqual([{ key: "booking:a-2026-11-05T03:00:00Z", title: "Appraisal (Dewi)", sub: "10.00–11.30", start: 10, end: 11.5, kind: "booking" }]);
    expect(rows[2].blocks[0]).toMatchObject({ title: "Kick-off", kind: "sesi", start: 13, end: 15 });
  });

  it("cuts a hold from yesterday or into tomorrow at the day's edges", () => {
    const [row] = scheduleRows([room("a")], [use("a", "2026-11-04T15:00:00Z", "2026-11-05T03:00:00Z"), use("a", "2026-11-05T14:00:00Z", "2026-11-05T18:00:00Z")], "2026-11-05");
    expect(row.blocks.map(block => [block.start, block.end])).toEqual([[0, 10], [21, 24]]);
  });

  it("spans 09–18, widened to whole hours around blocks outside it", () => {
    expect(scheduleSpan([])).toEqual({ from: 9, to: 18 });
    expect(scheduleSpan([{ key: "a", label: "A", blocks: [{ key: "x", title: "x", sub: "", start: 7.5, end: 19.25, kind: "sesi" }] }])).toEqual({ from: 7, to: 20 });
    expect(decimalHours("10:45")).toBe(10.75);
  });
});

describe("the Ringkasan's date line", () => {
  it("names the day, which day of Pra WAM it is, and how far WAM is", () => {
    expect(dayLine("2026-11-05", { kind: "pra_wam", name: "Pra WAM", startDate: "2026-10-28", daysToWam: 60 })).toBe("Kamis, 5 November 2026 · Pra WAM hari ke-9 · WAM 60 hari lagi");
    expect(dayLine("2027-01-05", { kind: "wam", name: "WAM 2027", startDate: "2027-01-04", daysToWam: null })).toBe("Selasa, 5 Januari 2027 · WAM 2027 hari ke-2");
    expect(dayLine("2026-11-05", null)).toBe("Kamis, 5 November 2026");
  });
});

it("answers null instead of failing when the questionnaire cannot be read", async () => {
  await expect(questionnaireCounts()).resolves.toBeNull();
});
