import { describe, expect, it } from "vitest";
import {
  activityKey, agoLabel, dayEntries, entryOwner, isOneOnOne, isPhoneScreen, isTemplateKind, itemLabel, itemShows, playlistOf, scheduleLabel, searchEntries, tvItemCreateSchema, tvItemPatchSchema, entryState, legendFor, legendItem, legendRows, TV_COLORS, tvLegend, tvLegendUnits, fit, fitText, hourSpan, imageFit, looksLikeTvSlug, loopCount, msUntilReload, suggestSlug, tvScreenPatchSchema, tvScreenSchema, nowAt, place, playlist, shownDays, tvDateLabel, tvDayHead, tvIsOn,
  shouldReload, sniffVideo, tvVideoStartSchema, youtubeEmbed, youtubeId, takeoverOn, takeoverRuns, tvTakeoverSchema, TV_DEFAULT_SETTINGS, TV_DEFAULT_LOOK, TV_RELOAD_EVERY_MS, tvScreen, tvSettingsSchema, tvSlidePatchSchema, tvWeekLabel, weekOf, type TvDay, type TvEntry, type TvRoom,
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

describe("whose an entry is, on the week calendar", () => {
  const owned = (title: string, person: string, dept: string, by = "SM - Contoh") => ({ title, person, dept, by });

  it("names the person alone for a one-on-one, however it is written", () => {
    for (const title of ["Appraisal 1-on-1", "Appraisal: isi form & 1-on-1", "1 on 1 bulanan", "One on One", "one-on-one"]) {
      expect(isOneOnOne(title), title).toBe(true);
      expect(entryOwner(owned(title, "Contoh Satu", "Sales & Marketing"))).toBe("Contoh Satu");
    }
  });

  it("names the department in full for anything else", () => {
    expect(isOneOnOne("Internal Dept Meeting")).toBe(false);
    expect(entryOwner(owned("Internal Dept Meeting", "Contoh Satu", "Sales & Marketing"))).toBe("Sales & Marketing");
    expect(entryOwner(owned("ITEM: antar-departemen", "Contoh Satu", " Center of Excellence (CoE) "))).toBe("Center of Excellence (CoE)");
  });

  it("falls back to what is known, and to nothing for a panitia session", () => {
    expect(entryOwner(owned("Appraisal 1-on-1", "", "Sales & Marketing"))).toBe("Sales & Marketing");
    expect(entryOwner(owned("Rapat", "Contoh Satu", ""))).toBe("Contoh Satu");
    expect(entryOwner({ title: "Rapat", by: "SM - Contoh" })).toBe("SM - Contoh");
    expect(entryOwner({ title: "Forum Pra WAM", by: "" })).toBe("");
  });
});

describe("search on a phone", () => {
  const booked = (key: string, title: string, person: string, dept: string, start = "10:00"): TvEntry => ({ ...entry(key, start, "23:00"), title, person, dept, by: `${dept} - ${person}` });
  const week: TvDay[] = [
    { date: "2026-11-10", rooms: [
      { id: "gm", name: "Ruang GM", entries: [booked("a", "Appraisal 1-on-1", "Contoh Andri", "Sales & Marketing")] },
      { id: "naga", name: "Nagapadma", entries: [booked("b", "Internal Dept Meeting", "Contoh Jaka", "Center of Excellence", "11:00")] },
    ] },
    { date: "2026-11-11", rooms: [{ id: "gm", name: "Ruang GM", entries: [booked("c", "Résumé tim", "Contoh Dita", "Human Resources")] }] },
    { date: "2026-11-12", rooms: [] },
  ];
  const keys = (query: string) => searchEntries(week, query).map(day => [day.date, day.entries.map(item => item.key)]);

  it("finds by the booker's name, the department, the room or the activity, whatever the capitals", () => {
    expect(keys("andri")).toEqual([["2026-11-10", ["a"]]]);
    expect(keys("EXCELLENCE")).toEqual([["2026-11-10", ["b"]]]);
    expect(keys("ruang gm")).toEqual([["2026-11-10", ["a"]], ["2026-11-11", ["c"]]]);
    expect(keys("appraisal")).toEqual([["2026-11-10", ["a"]]]);
    expect(keys("resume")).toEqual([["2026-11-11", ["c"]]]);
  });

  it("needs every word typed, in any order, and gives each entry its room", () => {
    expect(keys("gm andri")).toEqual([["2026-11-10", ["a"]]]);
    expect(keys("gm jaka")).toEqual([]);
    expect(searchEntries(week, "dita")[0].entries[0].room).toBe("Ruang GM");
  });

  it("finds nothing for nothing typed, and nothing for what is not there", () => {
    expect(keys("")).toEqual([]);
    expect(keys("   ")).toEqual([]);
    expect(keys("tidak ada")).toEqual([]);
  });
});

describe("welcoming guests and taking the TVs over", () => {
  const visit = { id: "v1", name: "Contoh Satu", greeting: "Selamat datang di Werkudara", note: "", hours: "10.00–12.00", place: "Lobi", image: "" };
  const row = (kind: "sambutan" | "tamu", title = "", body = "") => ({ id: kind, kind, title, body, seconds: 15 });
  const base = { settings: TV_DEFAULT_SETTINGS, slides: [] };

  it("gives each of today's visits its own slide, and passes the template over on a day without one", () => {
    const two = playlistOf({ ...base, playlist: [row("sambutan")], welcomes: [visit, { ...visit, id: "v2", name: "Contoh Dua" }] });
    expect(two.map(item => item.key)).toEqual(["item-sambutan-v1", "item-sambutan-v2"]);
    expect(two.map(itemLabel)).toEqual(["Sambutan: Contoh Satu", "Sambutan: Contoh Dua"]);
    expect(two.every(item => item.kind === "sambutan" && item.design === "werkudara")).toBe(true);
    expect(playlistOf({ ...base, playlist: [{ ...row("sambutan"), design: "foto" }], welcomes: [visit] })[0]).toMatchObject({ design: "foto" });
    expect(playlistOf({ ...base, playlist: [{ ...row("sambutan"), design: "apa saja" }], welcomes: [visit] })[0]).toMatchObject({ design: "werkudara" });
    expect(tvItemPatchSchema.safeParse({ design: "polos" }).success).toBe(true);
    expect(tvItemPatchSchema.safeParse({ design: "lain" }).success).toBe(false);
    expect(playlistOf({ ...base, playlist: [row("sambutan")], welcomes: [] })).toEqual([]);
    expect(playlistOf({ ...base, playlist: [row("sambutan")] })).toEqual([]);
  });

  it("welcomes a typed guest by name with the typed greeting", () => {
    const [item] = playlistOf({ ...base, playlist: [row("tamu", "Contoh Satu", "Senang Anda datang.")] });
    expect(item).toMatchObject({ kind: "sambutan", welcome: { name: "Contoh Satu", greeting: "Selamat datang", note: "Senang Anda datang.", image: "" } });
    expect(tvItemCreateSchema.safeParse({ kind: "tamu", title: " " }).success).toBe(false);
    expect(tvItemCreateSchema.safeParse({ kind: "sambutan" }).success).toBe(true);
  });

  it("takes over until its time is up, on every TV or only on the ones named", () => {
    const now = Date.parse("2026-11-10T03:00:00Z");
    const all = { itemId: "a", until: "2026-11-10T03:15:00Z", screenIds: [] };
    expect(takeoverOn(all, { now, screenId: null })).toBe(true);
    expect(takeoverOn(all, { now, screenId: "lobi" })).toBe(true);
    expect(takeoverOn(all, { now: now + 15 * 60_000, screenId: null })).toBe(false);
    expect(takeoverOn({ ...all, until: null }, { now: now + 86_400_000, screenId: null })).toBe(true);
    const some = { ...all, screenIds: ["lobi"] };
    expect(takeoverOn(some, { now, screenId: "lobi" })).toBe(true);
    expect(takeoverOn(some, { now, screenId: "pantry" })).toBe(false);
    expect(takeoverOn(some, { now, screenId: null })).toBe(false);
    expect(takeoverRuns(some, now)).toBe(true);
    expect(takeoverOn(null, { now, screenId: null })).toBe(false);
  });

  it("accepts the four lengths or until stopped", () => {
    const id = "6f1c2b7e-3a4d-4e5f-8a9b-0c1d2e3f4a5b";
    expect(tvTakeoverSchema.safeParse({ itemId: id, minutes: 15 }).success).toBe(true);
    expect(tvTakeoverSchema.safeParse({ itemId: id, minutes: null }).success).toBe(true);
    expect(tvTakeoverSchema.safeParse({ itemId: id, minutes: 7 }).success).toBe(false);
  });
});

describe("a YouTube video", () => {
  it("reads the video's id from the addresses people paste, and nothing from anything else", () => {
    for (const address of ["https://www.youtube.com/watch?v=FWN1B1B7Gu8", "https://youtu.be/FWN1B1B7Gu8?si=abc", "youtube.com/shorts/FWN1B1B7Gu8", "https://m.youtube.com/watch?t=10&v=FWN1B1B7Gu8", "https://www.youtube.com/embed/FWN1B1B7Gu8", " FWN1B1B7Gu8 "]) expect(youtubeId(address)).toBe("FWN1B1B7Gu8");
    for (const address of ["", "https://example.com/watch?v=FWN1B1B7Gu8", "https://www.youtube.com/watch?v=pendek", "https://www.youtube.com/@werkudara", "bukan alamat"]) expect(youtubeId(address)).toBeNull();
  });

  it("plays muted from the start, and repeats only when it is alone", () => {
    expect(youtubeEmbed("FWN1B1B7Gu8", false)).toContain("/embed/FWN1B1B7Gu8?autoplay=1&mute=1");
    expect(youtubeEmbed("FWN1B1B7Gu8", false)).not.toContain("loop=1");
    expect(youtubeEmbed("FWN1B1B7Gu8", true)).toContain("loop=1&playlist=FWN1B1B7Gu8");
  });

  it("is a slide of its own, left out when its id is not one", () => {
    const base = { settings: TV_DEFAULT_SETTINGS, slides: [] };
    const video = { id: "v", kind: "video" as const, title: "Annual Meeting", body: "FWN1B1B7Gu8", seconds: 15 };
    expect(playlistOf({ ...base, playlist: [video] })).toEqual([{ key: "item-v", kind: "video", title: "Annual Meeting", video: "FWN1B1B7Gu8", seconds: 15 }]);
    expect(itemLabel(playlistOf({ ...base, playlist: [video] })[0])).toBe("Annual Meeting");
    expect(playlistOf({ ...base, playlist: [{ ...video, body: "rusak" }] })).toEqual([]);
    expect(tvItemCreateSchema.safeParse({ kind: "video", title: "A", body: "https://youtu.be/FWN1B1B7Gu8" }).success).toBe(true);
    expect(tvItemCreateSchema.safeParse({ kind: "video", title: "A", body: "https://example.com" }).success).toBe(false);
  });
});

describe("a video file", () => {
  it("is played from its own address, whatever its row's body says", () => {
    const base = { settings: TV_DEFAULT_SETTINGS, slides: [] };
    const [item] = playlistOf({ ...base, playlist: [{ id: "v", kind: "video" as const, title: "Profil", body: "", seconds: 15, src: "/api/tv/video/v" }] });
    expect(item).toEqual({ key: "item-v", kind: "video", title: "Profil", video: "", file: "/api/tv/video/v", seconds: 15 });
  });

  it("is told from other files by its first bytes, and has a size limit", () => {
    expect(sniffVideo(new Uint8Array([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]))).toBe("video/mp4");
    expect(sniffVideo(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]))).toBe("video/webm");
    expect(sniffVideo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBeNull();
    expect(tvVideoStartSchema.safeParse({ mime: "video/mp4", size: 50 * 1024 * 1024 }).success).toBe(true);
    expect(tvVideoStartSchema.safeParse({ mime: "video/mp4", size: 201 * 1024 * 1024 }).success).toBe(false);
    expect(tvVideoStartSchema.safeParse({ mime: "video/quicktime", size: 10 }).success).toBe(false);
  });

  it("lets a TV be told whether it plays videos", () => {
    expect(tvScreenPatchSchema.safeParse({ playsVideo: false }).success).toBe(true);
    expect(tvScreenPatchSchema.safeParse({}).success).toBe(false);
  });
});

describe("the legend: one colour per activity", () => {
  const named = (key: string, title: string, start: string, date = "2026-11-10"): TvEntry => ({ ...entry(key, start, "23:00"), title, startsAt: at(start, date) });
  const week: TvDay[] = [
    { date: "2026-11-09", rooms: [{ id: "a", name: "Ruang A", entries: [named("m1", "Appraisal 1-on-1", "16:00", "2026-11-09")] }] },
    { date: "2026-11-10", rooms: [
      { id: "a", name: "Ruang A", entries: [named("t1", "Internal Dept Meeting", "11:00"), named("t2", "appraisal  1-on-1 ", "13:30")] },
      { id: "b", name: "Ruang B", entries: [named("t3", "HOD Meeting", "09:00")] },
    ] },
  ];

  it("gives each activity one colour for the week, in the order they first start, whatever its spelling", () => {
    expect(tvLegend(week)).toEqual([{ title: "Appraisal 1-on-1", color: 0, code: 1 }, { title: "HOD Meeting", color: 1, code: 2 }, { title: "Internal Dept Meeting", color: 2, code: 3 }]);
    expect(legendItem(tvLegend(week), "APPRAISAL 1-on-1")).toMatchObject({ color: 0, code: 1 });
    expect(legendItem(tvLegend(week), "Tidak ada")).toEqual({ color: 0, code: null });
    expect(activityKey("  Appraisal   1-on-1 ")).toBe("appraisal 1-on-1");
  });

  it("cycles through the colours when there are more activities than colours", () => {
    const many: TvDay[] = [{ date: "2026-11-10", rooms: [{ id: "a", name: "Ruang A", entries: Array.from({ length: TV_COLORS + 2 }, (_, index) => named(`k${index}`, `Kegiatan ${index}`, `${String(8 + index).padStart(2, "0")}:00`)) }] }];
    expect(tvLegend(many).map(item => item.color)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 1]);
    // The number never repeats, so two activities sharing a colour are still told apart.
    expect(tvLegend(many).map(item => item.code)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("shows a calendar only the activities it draws, in the same colours", () => {
    const legend = tvLegend(week);
    expect(legendFor(legend, week[1].rooms).map(item => item.title)).toEqual(["Appraisal 1-on-1", "HOD Meeting", "Internal Dept Meeting"]);
    expect(legendFor(legend, week[0].rooms)).toEqual([{ title: "Appraisal 1-on-1", color: 0, code: 1 }]);
    expect(legendFor(legend, [])).toEqual([]);
  });

  it("lays the legend out in rows that fit, and counts what does not", () => {
    const items = Array.from({ length: 10 }, (_, index) => ({ title: "Kegiatan ke-" + index, color: index % TV_COLORS, code: index + 1 }));
    const one = items[0].title.length * tvLegendUnits.letter + tvLegendUnits.chip;
    const width = one * 3 + tvLegendUnits.gap * 2;
    const laid = legendRows(items, width, 2);
    expect(laid.rows.map(row => row.length)).toEqual([3, 3]);
    expect(laid.more).toBe(4);
    expect(legendRows(items, width, 4)).toMatchObject({ more: 0 });
    expect(legendRows([], width)).toEqual({ rows: [], more: 0 });
    // A name longer than a row still gets its own row.
    expect(legendRows([{ title: "x".repeat(400), color: 0, code: 1 }, items[0]], 60).rows.map(row => row.length)).toEqual([1, 1]);
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

  it("knows a phone from a TV, upright or lying down", () => {
    for (const [width, height] of [[390, 844], [360, 640], [412, 915]]) expect(isPhoneScreen(width, height, true), `${width}x${height}`).toBe(true);
    // A TV, whatever its browser says its size is: many report 960 × 540, and an upright one 540 × 960; none has a touch screen.
    for (const [width, height] of [[1920, 1080], [960, 540], [1280, 720], [540, 960], [1080, 1920], [3840, 2160]]) expect(isPhoneScreen(width, height, false), `TV ${width}x${height}`).toBe(false);
    // Lying on its side it is never a phone, touch or not (a TV box that claims touch, a phone held sideways).
    for (const [width, height] of [[960, 540], [844, 390], [1366, 768], [1920, 1080]]) expect(isPhoneScreen(width, height, true), `mendatar ${width}x${height}`).toBe(false);
    // A tablet or a wide touch screen upright keeps the board too.
    for (const [width, height] of [[768, 1024], [1080, 1920], [0, 0]]) expect(isPhoneScreen(width, height, true), `${width}x${height}`).toBe(false);
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

  it("is never mistaken for an old key address, nor takes the address the pictures of /tv use", () => {
    expect(looksLikeTvSlug("image")).toBe(false);
    expect(tvScreenSchema.safeParse({ name: "Gambar", slug: "image" }).success).toBe(false);
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

describe("a TV that stays open for weeks", () => {
  it("loads itself afresh when a newer build of the site answers", () => {
    expect(shouldReload("a", "b", null, 1_000)).toBe(true);
    expect(shouldReload("a", "a", null, 1_000)).toBe(false);
  });

  it("does nothing when either side does not say which build it is", () => {
    expect(shouldReload(undefined, "b", null, 1_000)).toBe(false);
    expect(shouldReload("a", undefined, null, 1_000)).toBe(false);
  });

  it("does not reload again at once, so two builds answering in turn cannot make it flicker", () => {
    expect(shouldReload("a", "b", 1_000, 1_000 + TV_RELOAD_EVERY_MS - 1)).toBe(false);
    expect(shouldReload("a", "b", 1_000, 1_000 + TV_RELOAD_EVERY_MS)).toBe(true);
  });
});

describe("the playlist", () => {
  const always = { active: true, showFrom: null, showUntil: null, timeFrom: null, timeUntil: null, screenIds: [] as string[] };
  const lobby = "11111111-1111-4111-8111-111111111111", pantry = "22222222-2222-4222-8222-222222222222";
  const here = { date: "2026-11-10", time: "10:15", screenId: null as string | null };

  it("plays a row that is on, with no limits, everywhere", () => {
    expect(itemShows(always, here)).toBe(true);
    expect(itemShows(always, { ...here, screenId: lobby })).toBe(true);
    expect(itemShows({ ...always, active: false }, here)).toBe(false);
  });

  it("keeps a dated row to its days, both ends included", () => {
    const dated = { ...always, showFrom: "2026-11-10", showUntil: "2026-11-12" };
    for (const date of ["2026-11-10", "2026-11-11", "2026-11-12"]) expect(itemShows(dated, { ...here, date }), date).toBe(true);
    for (const date of ["2026-11-09", "2026-11-13"]) expect(itemShows(dated, { ...here, date }), date).toBe(false);
    expect(itemShows({ ...always, showUntil: "2026-11-09" }, here)).toBe(false);
    expect(itemShows({ ...always, showFrom: "2026-11-11" }, here)).toBe(false);
  });

  it("keeps a timed row to its hours, the end excluded, and past midnight when it says so", () => {
    const office = { ...always, timeFrom: "08:00", timeUntil: "17:00" };
    expect(itemShows(office, { ...here, time: "08:00" })).toBe(true);
    expect(itemShows(office, { ...here, time: "16:59" })).toBe(true);
    expect(itemShows(office, { ...here, time: "17:00" })).toBe(false);
    expect(itemShows(office, { ...here, time: "07:59" })).toBe(false);
    const night = { ...always, timeFrom: "22:00", timeUntil: "06:00" };
    for (const time of ["22:00", "23:30", "00:10", "05:59"]) expect(itemShows(night, { ...here, time }), time).toBe(true);
    for (const time of ["06:00", "12:00", "21:59"]) expect(itemShows(night, { ...here, time }), time).toBe(false);
    // The database gives a time with its seconds.
    expect(itemShows({ ...always, timeFrom: "08:00:00", timeUntil: "17:00:00" }, here)).toBe(true);
    expect(itemShows({ ...always, timeFrom: "11:00" }, here)).toBe(false);
    expect(itemShows({ ...always, timeUntil: "10:00" }, here)).toBe(false);
  });

  it("plays a row kept for some TVs on those only, and never at the one address for all", () => {
    const forLobby = { ...always, screenIds: [lobby] };
    expect(itemShows(forLobby, { ...here, screenId: lobby })).toBe(true);
    expect(itemShows(forLobby, { ...here, screenId: pantry })).toBe(false);
    expect(itemShows(forLobby, here)).toBe(false);
  });

  it("says a row's schedule in words", () => {
    const name = (id: string) => (id === lobby ? "Lobi" : null);
    expect(scheduleLabel(always, name)).toBe("");
    expect(scheduleLabel({ ...always, showFrom: "2026-12-01", showUntil: "2026-12-10", timeFrom: "08:00:00", timeUntil: "17:00", screenIds: [lobby] }, name)).toBe("1 Des – 10 Des · 08.00–17.00 · Lobi");
    expect(scheduleLabel({ ...always, showUntil: "2026-12-10" }, name)).toBe("sampai 10 Des");
    expect(scheduleLabel({ ...always, showFrom: "2026-12-10", showUntil: "2026-12-10" }, name)).toBe("10 Des");
    expect(scheduleLabel({ ...always, screenIds: [pantry] }, name)).toBe("TV yang sudah dihapus");
  });

  const settings = { showDay: true, daySeconds: 20, showWeek: true, weekSeconds: 30, ...TV_DEFAULT_LOOK };
  const slides = [{ id: "s1", title: "Poster", seconds: 8, src: "/satu" }];

  it("is what the TV plays when the server sends one, in its order, each row with its own time", () => {
    const sent = [
      { id: "a", kind: "teks" as const, title: "Selamat datang", body: "Isi", seconds: 10 },
      { id: "b", kind: "kalender_minggu" as const, title: "", body: "", seconds: 25 },
      { id: "c", kind: "timeline" as const, title: "", body: "", seconds: 15 },
      { id: "d", kind: "gambar" as const, title: "Poster", body: "", seconds: 8, src: "/gambar/d" },
      { id: "e", kind: "pengumuman" as const, title: "", body: "", seconds: 12 },
      { id: "f", kind: "kalender_hari" as const, title: "", body: "", seconds: 20 },
    ];
    const items = playlistOf({ playlist: sent, settings, slides });
    expect(items.map(item => [item.kind, item.seconds])).toEqual([["teks", 10], ["minggu", 25], ["timeline", 15], ["gambar", 8], ["pengumuman", 12], ["hari", 20]]);
    expect(new Set(items.map(item => item.key)).size).toBe(items.length);
    expect(items.map(itemLabel)).toEqual(["Selamat datang", "Kalender minggu ini", "Timeline Pra WAM", "Poster", "Pengumuman", "Kalender hari ini"]);
  });

  it("leaves out a picture without its address, and plays nothing for an empty playlist", () => {
    expect(playlistOf({ playlist: [{ id: "d", kind: "gambar", title: "", body: "", seconds: 8 }], settings, slides })).toEqual([]);
    expect(playlistOf({ playlist: [], settings, slides })).toEqual([]);
  });

  it("falls back to the two calendars and the pictures before the playlist exists", () => {
    expect(playlistOf({ settings, slides }).map(item => item.kind)).toEqual(["hari", "minggu", "gambar"]);
  });

  it("knows the templates fed by WAM from what the admin makes", () => {
    for (const kind of ["kalender_hari", "kalender_minggu", "timeline", "pengumuman"] as const) expect(isTemplateKind(kind), kind).toBe(true);
    for (const kind of ["teks", "gambar"] as const) expect(isTemplateKind(kind), kind).toBe(false);
  });

  it("takes a template or a text to add, and a row's changes", () => {
    expect(tvItemCreateSchema.safeParse({ kind: "timeline" }).success).toBe(true);
    expect(tvItemCreateSchema.safeParse({ kind: "teks", title: " Selamat datang " }).success).toBe(true);
    expect(tvItemCreateSchema.safeParse({ kind: "teks" }).success).toBe(false);
    expect(tvItemCreateSchema.safeParse({ kind: "gambar" }).success).toBe(false);
    expect(tvItemPatchSchema.safeParse({ showFrom: "2026-12-01", showUntil: "2026-12-10", timeFrom: "08:00", timeUntil: null, screenIds: [lobby] }).success).toBe(true);
    expect(tvItemPatchSchema.safeParse({ showFrom: "2026-12-10", showUntil: "2026-12-01" }).success).toBe(false);
    expect(tvItemPatchSchema.safeParse({ timeFrom: "8 pagi" }).success).toBe(false);
    expect(tvItemPatchSchema.safeParse({ screenIds: ["lobi"] }).success).toBe(false);
    expect(tvItemPatchSchema.safeParse({}).success).toBe(false);
  });
});

describe("what the admin may send", () => {
  it("keeps durations within sensible bounds", () => {
    const sent = { showDay: true, daySeconds: 20, showWeek: false, weekSeconds: 20, ...TV_DEFAULT_LOOK };
    expect(tvSettingsSchema.safeParse(sent).success).toBe(true);
    expect(tvSettingsSchema.safeParse({ ...sent, daySeconds: 2 }).success).toBe(false);
    expect(tvSettingsSchema.safeParse({ showDay: true, daySeconds: 20 }).success).toBe(false);
  });

  it("takes dark or light, and a QR code to a web address or to the TV's own", () => {
    const sent = { showDay: true, daySeconds: 20, showWeek: true, weekSeconds: 20, ...TV_DEFAULT_LOOK };
    expect(TV_DEFAULT_LOOK).toMatchObject({ mode: "dark", qrShow: false, qrUrl: "" });
    expect(tvSettingsSchema.safeParse({ ...sent, mode: "light", qrShow: true, qrUrl: " https://contoh.test/book ", qrLabel: "Book ruang", qrPosition: "kiri-atas" }).success).toBe(true);
    expect(tvSettingsSchema.parse({ ...sent, qrUrl: " https://contoh.test/book " }).qrUrl).toBe("https://contoh.test/book");
    expect(tvSettingsSchema.safeParse({ ...sent, qrShow: true, qrUrl: "" }).success).toBe(true);
    for (const bad of ["contoh.test/book", "javascript:alert(1)", "ftp://contoh.test", "bukan alamat"]) expect(tvSettingsSchema.safeParse({ ...sent, qrUrl: bad }).success, bad).toBe(false);
    expect(tvSettingsSchema.safeParse({ ...sent, mode: "biru" }).success).toBe(false);
    expect(tvSettingsSchema.safeParse({ ...sent, qrPosition: "tengah" }).success).toBe(false);
    expect(tvSlidePatchSchema.safeParse({ seconds: 500 }).success).toBe(false);
    expect(tvSlidePatchSchema.safeParse({}).success).toBe(false);
    expect(tvSlidePatchSchema.safeParse({ active: false }).success).toBe(true);
  });
});
