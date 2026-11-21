import { describe, expect, it } from "vitest";
import { asViewerZone, fromWibClock, instantLabel, wibClockLabel, zoneDate, zoneOfTimeZone, zoneSpan, zoneSuffix, zoneTime } from "./zone";

// 14.00 WITA in Bali is 13.00 WIB in Jogja: one instant.
const meeting = { startsAt: "2026-11-19T06:00:00Z", endsAt: "2026-11-19T07:00:00Z" };

describe("viewer zones (19 Nov 2026)", () => {
  it("reads one instant in each zone", () => {
    expect(zoneTime(meeting.startsAt, "WIB")).toBe("13:00");
    expect(zoneTime(meeting.startsAt, "WITA")).toBe("14:00");
    expect(zoneTime(meeting.startsAt, "WIT")).toBe("15:00");
    expect(zoneDate("2026-11-19T16:30:00Z", "WIB")).toBe("2026-11-19");
    expect(zoneDate("2026-11-19T16:30:00Z", "WITA")).toBe("2026-11-20");
  });

  it("names the zone only for those outside WIB", () => {
    expect(zoneSpan(meeting.startsAt, meeting.endsAt, "WIB")).toBe("13.00–14.00");
    expect(zoneSpan(meeting.startsAt, meeting.endsAt, "WITA")).toBe("14.00–15.00 WITA");
    expect(zoneSpan(meeting.startsAt, meeting.endsAt, "WIB", true)).toBe("13.00–14.00 WIB");
    expect(instantLabel(meeting.startsAt, "WIT")).toBe("15.00");
    expect(zoneSuffix("WIB")).toBe("");
    expect(zoneSuffix("WITA")).toBe(" WITA");
  });

  it("reads the forms' WIB clock times in the viewer's zone, past midnight too", () => {
    expect(fromWibClock("13:00", "WITA")).toEqual({ time: "14:00", nextDay: false });
    expect(fromWibClock("23:30", "WITA")).toEqual({ time: "00:30", nextDay: true });
    expect(wibClockLabel("13:00", "WIB")).toBe("13.00");
    expect(wibClockLabel("13:00", "WITA")).toBe("14.00");
    expect(wibClockLabel("22:00", "WIT")).toBe("00.00 (+1)");
  });

  it("knows a device's zone by name or offset, else WIB", () => {
    expect(zoneOfTimeZone("Asia/Jakarta")).toBe("WIB");
    expect(zoneOfTimeZone("Asia/Makassar")).toBe("WITA");
    expect(zoneOfTimeZone("Asia/Jayapura")).toBe("WIT");
    expect(zoneOfTimeZone("Asia/Singapore")).toBe("WITA");
    expect(zoneOfTimeZone("Asia/Tokyo")).toBe("WIT");
    expect(zoneOfTimeZone("Europe/London")).toBe("WIB");
    expect(zoneOfTimeZone(undefined)).toBe("WIB");
    expect(asViewerZone("WITA")).toBe("WITA");
    expect(asViewerZone("PST")).toBe("WIB");
  });
});
