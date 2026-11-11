import { describe, expect, it } from "vitest";
import { tvLitePath } from "@/lib/routes";
import { TV_DEFAULT_SETTINGS, weekOf, type TvEntry, type TvFeed, type TvPlayItem } from "./tv";
import { esc, liteViews, mix, parseLiteView, refreshSeconds, tvLiteHtml, tvLiteNotice, tvLiteResponse } from "./tv-lite";

const DATE = "2026-11-10";
const at = (time: string, date = DATE) => `${date}T${time}:00+07:00`;
const entry = (key: string, title: string, start: string, end: string, date = DATE): TvEntry =>
  ({ key: `${date}-${key}`, title, by: "SM - Contoh Satu", person: "Contoh Satu", dept: "Sales & Marketing", start, end, startsAt: at(start, date), endsAt: at(end, date) });

function feed(change: Partial<TvFeed> = {}, time = "10:15:20"): TvFeed {
  return {
    now: new Date(`${DATE}T${time}+07:00`).toISOString(), date: DATE,
    days: weekOf(DATE).map((date, index) => ({
      date,
      rooms: index > 4 ? [] : [
        { id: "a", name: "Nagapadma", entries: [entry("a1", "Appraisal 1-on-1", "09:00", "10:00", date), entry("a2", "Review <data> & \"angka\"", "10:00", "12:30", date)] },
        { id: "b", name: "Vasuki", entries: [entry("b1", "HOD Meeting", "14:00", "15:00", date)] },
      ],
    })),
    slides: [], settings: TV_DEFAULT_SETTINGS, look: "dream", ...change,
  };
}
const path = (view: "hari" | "minggu") => tvLitePath(null, view);
const row = (kind: TvPlayItem["kind"]): TvPlayItem => ({ id: kind, kind, title: "", body: "", seconds: 20 });

describe("the lite board for old TV browsers", () => {
  it("is plain HTML: no script, and none of the CSS an old browser does not know", () => {
    for (const view of ["hari", "minggu"] as const) {
      const html = tvLiteHtml(feed(), { view, path });
      expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
      expect(html).not.toMatch(/<script|javascript:|\son[a-z]+=/i);
      expect(html).not.toMatch(/display:\s*grid|var\(--|[;{\s]gap:|color-mix|[;{\s]inset:|:has\(|:is\(|:where\(|clamp\(|\bdvh\b/);
    }
  });

  it("shows today's rooms with the activity in progress marked, and loads the week next", () => {
    const html = tvLiteHtml(feed(), { view: "hari", path });
    expect(html).toContain("Jadwal ruang hari ini");
    expect(html).toContain("Selasa, 10 November 2026");
    expect(html).toContain("Nagapadma");
    expect(html).toContain("Vasuki");
    expect(html).toContain("2 ruang dipakai · 3 jadwal · 1 sedang berlangsung");
    expect(html).toContain(">Berlangsung<");
    expect(html).toContain("10.15<span>WIB</span>");
    // Back again just past the next minute (it is 10.15.20), with the other calendar.
    expect(html).toContain('<meta http-equiv="refresh" content="41;url=/tv/lite?v=minggu">');
  });

  it("shows the week, Monday to Friday, with today marked, and loads today next", () => {
    const html = tvLiteHtml(feed(), { view: "minggu", path });
    expect(html).toContain("Jadwal ruang minggu ini");
    expect(html).toContain("9 Nov – 13 November 2026");
    expect(html).toContain("15 jadwal minggu ini");
    for (const day of ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"]) expect(html).toContain(`>${day}<`);
    expect(html).not.toContain(">Sabtu<");
    expect(html).toContain("<em>Hari ini</em>");
    expect(html).toContain(">Kini<");
    expect(html).toContain("content=\"41;url=/tv/lite?v=hari\"");
  });

  it("escapes what people typed", () => {
    const html = tvLiteHtml(feed(), { view: "hari", path });
    expect(html).toContain("Review &lt;data&gt; &amp; &quot;angka&quot;");
    expect(html).not.toContain("<data>");
    expect(esc(`<a href="x">'b'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;b&#39;&lt;/a&gt;");
  });

  it("plays only the calendars the TV's list has, in its order, and both when it has neither", () => {
    expect(liteViews(feed({ playlist: [row("gambar"), row("kalender_minggu"), row("teks"), row("kalender_hari")] }))).toEqual(["minggu", "hari"]);
    expect(liteViews(feed({ playlist: [row("kalender_minggu")] }))).toEqual(["minggu"]);
    expect(liteViews(feed({ playlist: [row("teks")] }))).toEqual(["hari", "minggu"]);
    expect(liteViews(feed({ settings: { ...TV_DEFAULT_SETTINGS, showWeek: false } }))).toEqual(["hari"]);
    // One calendar: the page reloads itself, without going anywhere else; an unknown ?v= gets the first.
    const html = tvLiteHtml(feed({ playlist: [row("kalender_minggu")] }), { view: "hari", path });
    expect(html).toContain('data-view="minggu"');
    expect(html).toContain('<meta http-equiv="refresh" content="41">');
    expect(parseLiteView("minggu")).toBe("minggu");
    expect(parseLiteView("bulan")).toBeNull();
    expect(parseLiteView(null)).toBeNull();
  });

  it("says so when no room is used, and still reloads", () => {
    const empty = feed({ days: weekOf(DATE).map(date => ({ date, rooms: [] })) });
    expect(tvLiteHtml(empty, { view: "hari", path })).toContain("Belum ada jadwal ruang hari ini");
    expect(tvLiteHtml(empty, { view: "minggu", path })).toContain("Belum ada jadwal ruang minggu ini");
    expect(tvLiteNotice("Jadwal belum bisa dibaca", "Dicoba lagi.")).toContain('<meta http-equiv="refresh" content="60">');
  });

  it("follows the theme and mode picked for the TVs", () => {
    expect(tvLiteHtml(feed(), { view: "hari", path })).toContain("background-color:#0a0f2e");
    expect(tvLiteHtml(feed({ look: "werkudara" }), { view: "hari", path })).toContain("background-color:#0e1117");
    expect(tvLiteHtml(feed({ settings: { ...TV_DEFAULT_SETTINGS, mode: "light" } }), { view: "hari", path })).toContain("background-color:#fbf7ee");
  });

  it("reloads just past the next whole minute", () => {
    expect(refreshSeconds("2026-11-10T03:15:00.000Z")).toBe(61);
    expect(refreshSeconds("2026-11-10T03:15:59.000Z")).toBe(2);
    expect(refreshSeconds("2026-11-10T03:15:20.400Z")).toBe(41);
  });

  it("mixes colours as color-mix would", () => {
    expect(mix("#ffffff", "#000000", 0.5)).toBe("#808080");
    expect(mix("#ff0000", "#0000ff", 1)).toBe("#ff0000");
  });

  it("is answered as HTML that no cache keeps", async () => {
    const response = tvLiteResponse("<p>x</p>", 503);
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("<p>x</p>");
  });

  it("has an address for every TV and for one", () => {
    expect(tvLitePath()).toBe("/tv/lite");
    expect(tvLitePath(null, "minggu")).toBe("/tv/lite?v=minggu");
    expect(tvLitePath("lobi", "hari")).toBe("/tv/lobi/lite?v=hari");
  });
});
