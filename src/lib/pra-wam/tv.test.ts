import { describe, expect, it } from "vitest";
import {
  agoLabel, dayEntries, entryState, fit, fitText, hourSpan, imageFit, looksLikeTvSlug, loopCount, msUntilReload, suggestSlug, tvScreenPatchSchema, tvScreenSchema, nowAt, place, playlist, shownDays, tvDateLabel, tvDayHead, tvIsOn,
  tvScreen, tvSettingsSchema, tvSlidePatchSchema, tvWeekLabel, weekOf, type TvDay, type TvEntry, type TvRoom,
} from "./tv";

const at = (time: string, date = "2026-11-10") => `${date}T${time}:00+07:00`;
const entry = (key: string, start: string, end: string): TvEntry => ({ key, title: `Rapat ${key}`, by: "SM - Contoh", start, end, startsAt: at(start), endsAt: at(end) });
const now = (time: string) => Date.parse(at(time));

describe("dates", () => {
  it("gives the week of a date, Monday first, across a month's end too", () => {
    expect(weekOf("2026-11-10")).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
    expect(weekOf("2026-11-15")[0]).toBe("2026-11-09");
    expect(weekOf("2026-11-09")[0]).toBe("2026-11-09");
    expect(weekOf("2026-12-01")).toEqual(["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]);
  });

  it("names days in Indonesian", () => {
    expect(tvDateLabel("2026-11-10")).toBe("Selasa, 10 November 2026");
    expect(tvDayHead("2026-11-10")).toEqual({ name: "Selasa", day: "10 Nov" });
    expect(tvWeekLabel(["2026-11-09", "2026-11-13"])).toBe("9 Nov – 13 November 2026");
    expect(tvWeekLabel([])).toBe("");
  });

  it("draws Monday to Friday, and a weekend day only when a room is used on it", () => {
    const room: TvRoom = { id: "a", name: "Ruang A", entries: [entry("a1", "09:00", "10:00")] };
    const week: TvDay[] = weekOf("2026-11-10").map((date, index) => ({ date, rooms: index === 5 ? [room] : [] }));
    expect(shownDays(week).map(day => day.date)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"]);
    expect(shownDays(week.map(day => ({ ...day, rooms: [] })))).toHaveLength(5);
  });
});

describe("entries", () => {
  it("says whether an entry is over, on, or still to come", () => {
    const one = entry("a", "10:00", "11:30");
    expect(entryState(one, now("09:59"))).toBe("nanti");
    expect(entryState(one, now("10:00"))).toBe("berlangsung");
    expect(entryState(one, now("11:29"))).toBe("berlangsung");
    expect(entryState(one, now("11:30"))).toBe("selesai");
  });

  it("lists a day's entries by start time, each with its room", () => {
    const day: TvDay = { date: "2026-11-10", rooms: [
      { id: "b", name: "Vasuki", entries: [entry("b1", "10:00", "11:00")] },
      { id: "a", name: "Arjuna", entries: [entry("a2", "13:00", "14:00"), entry("a1", "10:00", "12:00")] },
    ] };
    expect(dayEntries(day).map(item => [item.key, item.room])).toEqual([["a1", "Arjuna"], ["b1", "Vasuki"], ["a2", "Arjuna"]]);
  });
});

describe("the day calendar's hours", () => {
  const rooms = (...entries: TvEntry[]): TvRoom[] => [{ id: "a", name: "Ruang A", entries }];

  it("spans 08–18, widened to whole hours around anything outside", () => {
    expect(hourSpan([])).toEqual({ from: 8, to: 18 });
    expect(hourSpan(rooms(entry("a", "10:00", "11:00")))).toEqual({ from: 8, to: 18 });
    expect(hourSpan(rooms(entry("a", "07:30", "09:00"), entry("b", "18:00", "20:30")))).toEqual({ from: 7, to: 21 });
    expect(hourSpan(rooms(entry("a", "00:00", "24:00")))).toEqual({ from: 0, to: 24 });
  });

  it("places an entry along the hours in per cent", () => {
    const span = { from: 8, to: 18 };
    expect(place(entry("a", "08:00", "18:00"), span)).toEqual({ at: 0, size: 100 });
    expect(place(entry("a", "13:00", "15:30"), span)).toEqual({ at: 50, size: 25 });
    // Outside the span: cut at its edges, never drawn past them.
    expect(place(entry("a", "06:00", "09:00"), span)).toEqual({ at: 0, size: 10 });
  });

  it("places now, or not when it is outside the hours", () => {
    expect(nowAt("13:00", { from: 8, to: 18 })).toBe(50);
    expect(nowAt("07:00", { from: 8, to: 18 })).toBeNull();
    expect(nowAt("19:30", { from: 8, to: 18 })).toBeNull();
  });
});

describe("fitting a calendar to a screen", () => {
  it("measures the screen in units of its shorter side", () => {
    expect(tvScreen(1920, 1080)).toMatchObject({ wide: true, height: 100 });
    expect(Math.round(tvScreen(1920, 1080).width)).toBe(178);
    expect(tvScreen(1080, 1920)).toMatchObject({ wide: false, width: 100 });
    expect(tvScreen(0, 0).wide).toBe(true);
  });

  it("shares the room among the rows, so more rows are smaller and all fit", () => {
    expect(fit(72, 3, 16)).toBe(16);
    expect(fit(72, 6, 16)).toBe(12);
    expect(fit(72, 24, 16)).toBe(3);
    for (const count of [1, 5, 12, 30, 60]) expect(fit(72, count, 16) * count).toBeLessThanOrEqual(72);
    expect(fit(72, 0, 16)).toBe(16);
  });

  it("sizes text with its row, between the smallest readable size and the largest", () => {
    expect(fitText(16, 0.3, 3.2)).toBe(3.2);
    expect(fitText(6, 0.3, 3.2)).toBeCloseTo(1.8);
    expect(fitText(2, 0.3, 3.2)).toBe(1.25);
  });
});

describe("the loop", () => {
  const slides = [{ id: "s1", title: "", seconds: 8, src: "/satu" }, { id: "s2", title: "", seconds: 12, src: "/dua" }];
  const settings = { showDay: true, daySeconds: 20, showWeek: true, weekSeconds: 30 };

  it("plays today, the week, then the pictures, each for its own time", () => {
    const items = playlist(settings, slides);
    expect(items.map(item => [item.kind, item.seconds])).toEqual([["hari", 20], ["minggu", 30], ["gambar", 8], ["gambar", 12]]);
    expect(new Set(items.map(item => item.key)).size).toBe(items.length);
  });

  it("counts what the loop plays, so a single item needs no duration", () => {
    expect(loopCount(settings, 2)).toBe(4);
    expect(loopCount({ ...settings, showWeek: false }, 0)).toBe(1);
    expect(loopCount({ ...settings, showDay: false, showWeek: false }, 1)).toBe(1);
    expect(loopCount({ ...settings, showDay: false, showWeek: false }, 0)).toBe(0);
  });

  it("leaves out a calendar that is off, and plays nothing when all is off", () => {
    expect(playlist({ ...settings, showDay: false }, slides).map(item => item.kind)).toEqual(["minggu", "gambar", "gambar"]);
    expect(playlist({ ...settings, showWeek: false }, []).map(item => item.kind)).toEqual(["hari"]);
    expect(playlist({ ...settings, showDay: false, showWeek: false }, [])).toEqual([]);
  });
});

describe("pictures and clocks", () => {
  it("fills the screen only with a picture close to its shape", () => {
    expect(imageFit(1920, 1080, 1920, 1080)).toBe("cover");
    expect(imageFit(2000, 1080, 1920, 1080)).toBe("cover");
    expect(imageFit(1080, 1920, 1920, 1080)).toBe("contain");
    expect(imageFit(1080, 1350, 1080, 1920)).toBe("contain");
    expect(imageFit(0, 0, 1920, 1080)).toBe("contain");
  });

  it("reloads at the next 03.00 WIB", () => {
    expect(msUntilReload(new Date("2026-11-10T02:00:00+07:00"))).toBe(3_600_000);
    expect(msUntilReload(new Date("2026-11-10T03:00:00+07:00"))).toBe(24 * 3_600_000);
    expect(msUntilReload(new Date("2026-11-10T15:00:00+07:00"))).toBe(12 * 3_600_000);
  });

  it("says when a TV was last seen, and whether it is on", () => {
    const base = now("12:00");
    expect(agoLabel(at("12:00"), base)).toBe("baru saja");
    expect(agoLabel(at("11:55"), base)).toBe("5 menit lalu");
    expect(agoLabel(at("09:00"), base)).toBe("3 jam lalu");
    expect(agoLabel(at("12:00", "2026-11-07"), base)).toBe("3 hari lalu");
    expect(tvIsOn(at("11:59"), base)).toBe(true);
    expect(tvIsOn(at("11:50"), base)).toBe(false);
    expect(tvIsOn(null, base)).toBe(false);
  });
});

describe("a TV's short address", () => {
  it("is lower-case letters, digits and single dashes, 2 to 40 long", () => {
    for (const good of ["lobi", "tv", "pantry-2", "ruang-meeting-lantai-3", "a1"]) expect(looksLikeTvSlug(good), good).toBe(true);
    for (const bad of ["", "a", "Lobi", "lobi utama", "-lobi", "lobi-", "lobi--dua", "lobi_dua", "lobi/dua", "é", "a".repeat(41), null, 12]) expect(looksLikeTvSlug(bad), String(bad)).toBe(false);
  });

  it("is never mistaken for an old key address", () => {
    expect(looksLikeTvSlug(`tv_${"a".repeat(43)}`)).toBe(false);
  });

  it("is suggested from the TV's name", () => {
    expect(suggestSlug("Lobi")).toBe("lobi");
    expect(suggestSlug("  Lobi Utama ")).toBe("lobi-utama");
    expect(suggestSlug("Pantry (Lt. 2)")).toBe("pantry-lt-2");
    expect(suggestSlug("Résepsionis")).toBe("resepsionis");
    expect(suggestSlug("!!")).toBe("");
    expect(looksLikeTvSlug(suggestSlug("Ruang ".repeat(20)))).toBe(true);
  });

  it("is checked and lower-cased when the admin sends it", () => {
    expect(tvScreenSchema.parse({ name: " Lobi ", slug: " Lobi-Utama " })).toEqual({ name: "Lobi", slug: "lobi-utama" });
    expect(tvScreenSchema.safeParse({ name: "Lobi", slug: "lobi utama" }).success).toBe(false);
    expect(tvScreenSchema.safeParse({ name: "Lobi" }).success).toBe(false);
    expect(tvScreenPatchSchema.safeParse({}).success).toBe(false);
    expect(tvScreenPatchSchema.safeParse({ slug: "pantry-2" }).success).toBe(true);
  });
});

describe("what the admin may send", () => {
  it("keeps durations within sensible bounds", () => {
    expect(tvSettingsSchema.safeParse({ showDay: true, daySeconds: 20, showWeek: false, weekSeconds: 20 }).success).toBe(true);
    expect(tvSettingsSchema.safeParse({ showDay: true, daySeconds: 2, showWeek: true, weekSeconds: 20 }).success).toBe(false);
    expect(tvSettingsSchema.safeParse({ showDay: true, daySeconds: 20 }).success).toBe(false);
    expect(tvSlidePatchSchema.safeParse({ seconds: 500 }).success).toBe(false);
    expect(tvSlidePatchSchema.safeParse({}).success).toBe(false);
    expect(tvSlidePatchSchema.safeParse({ active: false }).success).toBe(true);
  });
});
