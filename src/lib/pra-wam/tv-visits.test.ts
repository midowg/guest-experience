import { describe, expect, it } from "vitest";
import { liteNote } from "./tv";
import { kindsLabel, tvDevice, visitIsOn, visitSummary, type TvVisit } from "./tv-visits";

describe("what a device is, from what its browser says", () => {
  it("knows a TV by its make, with its browser", () => {
    expect(tvDevice("Mozilla/5.0 (SMART-TV; Linux; Tizen 3.0) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/2.0 TV Safari/538.1")).toEqual({ kind: "tv", name: "TV Samsung · Samsung Internet 2" });
    expect(tvDevice("Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.34 Safari/537.36 WebAppManager")).toEqual({ kind: "tv", name: "TV LG · Chrome 53" });
    expect(tvDevice("Mozilla/5.0 (Linux; Android 11; BRAVIA 4K VH2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")?.name).toBe("TV Sony · Chrome 120");
    expect(tvDevice("Mozilla/5.0 (Linux; Android 12; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")?.name).toBe("TV Android · Chrome 131");
  });

  it("tells a phone, a tablet and a computer apart", () => {
    expect(tvDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36")).toEqual({ kind: "hp", name: "HP Android · Chrome 131" });
    expect(tvDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toEqual({ kind: "hp", name: "iPhone · Safari" });
    expect(tvDevice("Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")?.kind).toBe("tablet");
    expect(tvDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0")).toEqual({ kind: "komputer", name: "Komputer Windows · Edge 131" });
    expect(tvDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15")?.name).toBe("Mac · Safari");
  });

  it("does not count a robot or a browser that says nothing", () => {
    for (const agent of ["", null, undefined, "curl/8.5.0", "Mozilla/5.0 (compatible; Googlebot/2.1)", "vercel-screenshot/1.0", "WhatsApp/2.23", "python-requests/2.32"]) expect(tvDevice(agent)).toBeNull();
  });
});

describe("the numbers of who opened", () => {
  const now = Date.parse("2026-11-10T03:00:00Z");
  const visit = (device: string, more: Partial<TvVisit> = {}): TvVisit => ({
    id: `${device}-${more.address ?? "/tv"}-${more.day ?? "2026-11-10"}`, device, net: "n", address: "/tv", version: "papan", kind: "tv", name: "TV", width: null, height: null,
    firstSeenAt: "2026-11-10T01:00:00Z", lastSeenAt: "2026-11-10T02:59:30Z", day: "2026-11-10", ...more,
  });

  it("counts a device once a day, whatever addresses it opened", () => {
    const summary = visitSummary([
      visit("a"), visit("a", { address: "/tv/lite", version: "lite" }),
      visit("b", { kind: "hp", version: "hp", lastSeenAt: "2026-11-10T02:00:00Z" }),
      visit("a", { day: "2026-11-09" }), visit("c", { day: "2026-11-09", kind: "komputer" }),
    ], "2026-11-10", now);
    expect(summary.today).toBe(2);
    expect(summary.byKind).toEqual({ tv: 1, hp: 1, tablet: 0, komputer: 0 });
    expect(summary.now).toBe(1);
    expect(summary.lite).toBe(1);
    expect(summary.days).toHaveLength(7);
    expect(summary.days.at(-1)).toEqual({ day: "2026-11-10", devices: 2 });
    expect(summary.days.at(-2)).toEqual({ day: "2026-11-09", devices: 2 });
    expect(summary.days[0]).toEqual({ day: "2026-11-04", devices: 0 });
  });

  it("says a device looks now for two minutes after it last asked", () => {
    expect(visitIsOn({ lastSeenAt: "2026-11-10T02:58:30Z" }, now)).toBe(true);
    expect(visitIsOn({ lastSeenAt: "2026-11-10T02:57:59Z" }, now)).toBe(false);
  });

  it("writes the kinds that came in words", () => {
    expect(kindsLabel({ tv: 2, hp: 1, tablet: 0, komputer: 3 })).toBe("2 TV · 1 HP · 3 Komputer");
    expect(kindsLabel({ tv: 0, hp: 0, tablet: 0, komputer: 0 })).toBe("");
  });
});

describe("whether a row plays on the board for old TVs", () => {
  it("plays everything but a YouTube video and a video file whose length is not known, and says why", () => {
    expect(liteNote({ kind: "kalender_hari" })).toEqual({ plays: true, why: "" });
    expect(liteNote({ kind: "gambar" }).plays).toBe(true);
    expect(liteNote({ kind: "video", videoFile: true, length: 95 }).plays).toBe(true);
    expect(liteNote({ kind: "video", videoFile: false })).toMatchObject({ plays: false, why: expect.stringContaining("YouTube") });
    expect(liteNote({ kind: "video", videoFile: true, length: null })).toMatchObject({ plays: false, why: expect.stringContaining("Lama videonya") });
  });
});
