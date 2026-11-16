import { describe, expect, it } from "vitest";
import { afterCursor, cursorOf } from "./shared";

describe("paging cursor (17 Nov 2026)", () => {
  const id = "0b9f3f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
  it("asks for rows before the time, or at the same time with a smaller id", () => {
    const cursor = cursorOf({ createdAt: "2026-07-12T02:17:05.806408+00:00", id });
    expect(afterCursor(cursor)).toBe(`created_at.lt."2026-07-12T02:17:05.806408+00:00",and(created_at.eq."2026-07-12T02:17:05.806408+00:00",id.lt.${id})`);
  });
  it("refuses anything that is not our cursor", () => {
    expect(() => afterCursor("2026-07-12T02:17:05Z")).toThrow(/tidak dikenali/);
    expect(() => afterCursor(`2026-07-12T02:17:05Z),or(id.gt.0~${id}`)).toThrow(/tidak dikenali/);
    expect(() => afterCursor(`2026-13-45T99:99:99Z~${id}`)).toThrow(/tidak dikenali/);
  });
});

describe("Riwayat cursor by day (17 Nov 2026)", () => {
  it("continues within the same day, then earlier days", async () => {
    const { afterDayCursor, dayCursorOf } = await import("./shared");
    const id = "0b9f3f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
    const cursor = dayCursorOf({ date: "2026-11-10", createdAt: "2026-11-12T03:00:00+00:00", id });
    expect(afterDayCursor(cursor)).toBe(`happened_on.lt.2026-11-10,and(happened_on.eq.2026-11-10,created_at.lt."2026-11-12T03:00:00+00:00"),and(happened_on.eq.2026-11-10,created_at.eq."2026-11-12T03:00:00+00:00",id.lt.${id})`);
    expect(() => afterDayCursor(`2026-11-10~bad~${id}`)).toThrow(/tidak dikenali/);
    expect(() => afterDayCursor("x")).toThrow(/tidak dikenali/);
  });
});
