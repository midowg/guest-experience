import { describe, expect, it } from "vitest";
import { eventPhase, localDay } from "./event-phase";

const base = { starts_at: "2026-11-09T10:00:00+07:00", ends_at: "2026-11-09T14:00:00+07:00", timezone: "Asia/Jakarta", phase_override: "auto" as const };
const at = (iso: string) => Date.parse(iso);

describe("eventPhase", () => {
  it("follows the Jakarta calendar day, not the UTC one", () => {
    // 23.30 WIB on the 8th is already the 8th in Jakarta although 16.30 UTC.
    expect(eventPhase(base, at("2026-11-08T23:30:00+07:00"))).toBe("before");
    // 00.10 WIB on the 9th is still the 8th in UTC.
    expect(eventPhase(base, at("2026-11-09T00:10:00+07:00"))).toBe("day");
    expect(eventPhase(base, at("2026-11-09T22:00:00+07:00"))).toBe("day");
    expect(eventPhase(base, at("2026-11-10T00:01:00+07:00"))).toBe("after");
  });
  it("follows the event's own zone for WITA and WIT", () => {
    const lombok = { ...base, timezone: "Asia/Makassar", starts_at: "2026-11-09T08:00:00+08:00", ends_at: "2026-11-09T12:00:00+08:00" };
    // 23.30 WIB on the 8th is already 00.30 WITA on the 9th.
    expect(eventPhase(lombok, at("2026-11-08T23:30:00+07:00"))).toBe("day");
    expect(eventPhase({ ...lombok, timezone: "Asia/Jakarta" }, at("2026-11-08T23:30:00+07:00"))).toBe("before");
    const papua = { ...base, timezone: "Asia/Jayapura", starts_at: "2026-11-09T08:00:00+09:00", ends_at: null };
    expect(eventPhase(papua, at("2026-11-09T23:30:00+07:00"))).toBe("after");
  });
  it("stays on the day for every date of a multi-day programme", () => {
    const programme = { ...base, ends_at: "2026-11-11T16:00:00+07:00" };
    expect(eventPhase(programme, at("2026-11-10T12:00:00+07:00"))).toBe("day");
    expect(eventPhase(programme, at("2026-11-11T20:00:00+07:00"))).toBe("day");
    expect(eventPhase(programme, at("2026-11-12T08:00:00+07:00"))).toBe("after");
  });
  it("uses the start date when no end time is set", () => {
    expect(eventPhase({ ...base, ends_at: null }, at("2026-11-09T20:00:00+07:00"))).toBe("day");
    expect(eventPhase({ ...base, ends_at: null }, at("2026-11-10T08:00:00+07:00"))).toBe("after");
  });
  it("lets hospitality override the automatic phase", () => {
    expect(eventPhase({ ...base, phase_override: "after" }, at("2026-11-01T08:00:00+07:00"))).toBe("after");
    expect(eventPhase({ ...base, phase_override: "before" }, at("2026-12-01T08:00:00+07:00"))).toBe("before");
  });
  it("treats an event without a start as upcoming", () => {
    expect(eventPhase({ ...base, starts_at: "" }, at("2026-11-09T12:00:00+07:00"))).toBe("before");
  });
  it("formats local days in sortable order", () => {
    expect(localDay("2026-11-09T00:10:00+07:00")).toBe("2026-11-09");
  });
});
