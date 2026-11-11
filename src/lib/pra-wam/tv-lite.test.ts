import { describe, expect, it } from "vitest";
import { TV_BIRTHDAY_CARD, TV_WELCOME_ART, tvLitePath } from "@/lib/routes";
import { TV_DEFAULT_SETTINGS, weekOf, type TvEntry, type TvFeed, type TvPlayItem } from "./tv";
import { esc, liteAsk, liteIndex, liteItems, liteSeconds, mix, refreshSeconds, tvLiteHtml, tvLiteNotice, tvLiteResponse } from "./tv-lite";

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
const path = (item: string) => tvLitePath(null, item);
const row = (kind: TvPlayItem["kind"], change: Partial<TvPlayItem> = {}): TvPlayItem => ({ id: kind, kind, title: "", body: "", seconds: 20, ...change });
/** One of every kind of item, in the order an admin might put them. */
const everything: Partial<TvFeed> = {
  playlist: [
    row("sambutan", { design: "werkudara" }), row("tamu", { title: "Pak <Dewa>", body: "Selamat datang di kantor", design: "polos" }),
    row("kalender_hari"), row("kalender_minggu"), row("teks", { title: "Rapat bulanan", body: "Jumat\npukul 14.00" }),
    row("gambar", { id: "s1", title: "Poster", src: "/api/tv/image/s1" }), row("video", { body: "dQw4w9WgXcQ" }),
    row("ultah", { title: "Contoh Tiga", call: "Tiga", date: "2026-11-11", src: "/api/tv/image/f1" }), row("timeline"), row("pengumuman"),
  ],
  welcomes: [{ id: "v1", name: "PT Contoh & Rekan", greeting: "Selamat datang", note: "", hours: "10.00–12.00 WIB", place: "Kantor Werkudara", image: "https://example.test/sampul.jpg" }],
  timeline: [{ id: "a", title: "Appraisal", when: "28 Okt–20 Nov", hours: null, state: "berlangsung", color: 0, left: "berakhir 10 hari lagi" }],
  notes: [{ id: "n1", title: "Kumpul di lobi", body: "Pukul 08.30.", at: at("08:00") }],
};
const keyOf = (kind: string) => liteItems(feed(everything)).find(item => item.kind === kind)!.key;

describe("the lite board for old TV browsers", () => {
  it("is plain HTML for every kind of item: no script, and none of the CSS an old browser does not know", () => {
    const items = liteItems(feed(everything));
    expect(items.map(item => item.kind)).toEqual(["sambutan", "sambutan", "hari", "minggu", "teks", "gambar", "ultah", "timeline", "pengumuman"]);
    for (const item of items) {
      const html = tvLiteHtml(feed(everything), { ask: { s: item.key }, path });
      expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
      expect(html, item.kind).toContain(`data-item="${item.kind}"`);
      expect(html).not.toMatch(/<script|<iframe|<video|javascript:|\son[a-z]+=/i);
      expect(html).not.toMatch(/display:\s*grid|var\(--|[;{\s]gap:|color-mix|[;{\s]inset:|:has\(|:is\(|:where\(|clamp\(|\bdvh\b|cq[whi]\b|[;{\s]aspect-ratio:|rgb\(\d+ /);
      // The portrait rules are media queries on the screen's shape, which old browsers know.
      expect(html).not.toMatch(/@container|@supports/);
    }
  });

  it("plays the list in order, one item a load, each for its own time", () => {
    const html = tvLiteHtml(feed(everything), { ask: { s: keyOf("teks") }, path });
    expect(html).toContain(`<meta http-equiv="refresh" content="20;url=/tv/lite?s=${keyOf("gambar")}">`);
    // The video is passed over; after the last item the list starts again.
    expect(tvLiteHtml(feed(everything), { ask: { s: keyOf("gambar") }, path })).toContain(`url=/tv/lite?s=${keyOf("ultah")}`);
    expect(tvLiteHtml(feed(everything), { ask: { s: keyOf("pengumuman") }, path })).toContain(`url=/tv/lite?s=${liteItems(feed(everything))[0].key}`);
    expect(liteSeconds({ seconds: 3 })).toBe(8);
    expect(liteSeconds({ seconds: 25 })).toBe(25);
    expect(liteSeconds({ seconds: 120 })).toBe(60);
  });

  it("starts from the top for an address it does not know, and follows an address from before (?v=)", () => {
    const items = liteItems(feed(everything));
    expect(liteIndex(items, {})).toBe(0);
    expect(liteIndex(items, { s: "item-gone" })).toBe(0);
    expect(liteIndex(items, { v: "minggu" })).toBe(3);
    expect(liteIndex(items, { s: keyOf("teks"), v: "hari" })).toBe(4);
    expect(liteAsk("https://x.test/tv/lite?s=item-1&v=hari")).toEqual({ s: "item-1", v: "hari" });
  });

  it("welcomes a guest on the Werkudara sign, in the board's colours, or on the visit's photo", () => {
    const sign = tvLiteHtml(feed(everything), { ask: { s: keyOf("sambutan") }, path });
    expect(sign).toContain(`src="${TV_WELCOME_ART}"`);
    expect(sign).toContain(">PT Contoh &amp; Rekan</h1>");
    expect(sign).toContain("10.00–12.00 WIB");
    const typed = tvLiteHtml(feed(everything), { ask: { s: "item-tamu" }, path });
    expect(typed).toContain(">Pak &lt;Dewa&gt;</h1>");
    expect(typed).toContain("Selamat datang di kantor");
    const photo = tvLiteHtml(feed({ ...everything, playlist: [row("sambutan", { design: "foto" })] }), { ask: {}, path });
    expect(photo).toContain('src="https://example.test/sampul.jpg"');
  });

  it("fits the welcome sign and the birthday card whole on a portrait TV too, without script", () => {
    const sign = tvLiteHtml(feed(everything), { ask: { s: keyOf("sambutan") }, path });
    // Wider than 16:9: the sign is the screen's height; narrower (a portrait TV): its width.
    expect(sign).toContain(".signFrame{width:177.78vh;height:100vh;");
    expect(sign).toContain("@media (max-aspect-ratio:16/9){.signFrame{width:100vw;height:56.25vw;");
    const card = tvLiteHtml(feed(everything), { ask: { s: keyOf("ultah") }, path });
    expect(card).toContain(".bdayCard{width:70.69vh;height:100vh;");
    expect(card).toContain("@media (max-aspect-ratio:1131/1600){.bdayCard{width:100vw;height:141.47vw;");
  });

  it("shows a text, a picture, a birthday, Timeline and the announcements", () => {
    const html = (kind: string) => tvLiteHtml(feed(everything), { ask: { s: keyOf(kind) }, path });
    expect(html("teks")).toContain("<h1>Rapat bulanan</h1>");
    expect(html("gambar")).toContain('<img src="/api/tv/image/s1" alt="Poster">');
    expect(html("ultah")).toContain(`src="${TV_BIRTHDAY_CARD}"`);
    expect(html("ultah")).toContain("Happy Birthday Tiga");
    expect(html("ultah")).toContain('src="/api/tv/image/f1"');
    expect(html("timeline")).toContain("Sedang berlangsung · </em>berakhir 10 hari lagi");
    expect(html("pengumuman")).toContain("Kumpul di lobi");
  });

  it("shows today's rooms with the activity in progress marked, and the week next", () => {
    const html = tvLiteHtml(feed(), { ask: { v: "hari" }, path });
    expect(html).toContain("Jadwal ruang hari ini");
    expect(html).toContain("Selasa, 10 November 2026");
    expect(html).toContain("Nagapadma");
    expect(html).toContain("2 ruang dipakai · 3 jadwal · 1 sedang berlangsung");
    expect(html).toContain(">Berlangsung<");
    expect(html).toContain("10.15<span>WIB</span>");
    // Before the playlist's migration: the two calendars as the settings say, 20 seconds each.
    expect(html).toContain('<meta http-equiv="refresh" content="20;url=/tv/lite?s=minggu">');
  });

  it("shows the week, Monday to Friday, with today marked", () => {
    const html = tvLiteHtml(feed(), { ask: { s: "minggu" }, path });
    expect(html).toContain("Jadwal ruang minggu ini");
    expect(html).toContain("9 Nov – 13 November 2026");
    expect(html).toContain("15 jadwal minggu ini");
    for (const day of ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"]) expect(html).toContain(`>${day}<`);
    expect(html).not.toContain(">Sabtu<");
    expect(html).toContain("<em>Hari ini</em>");
    expect(html).toContain(">Kini<");
    expect(html).toContain('content="20;url=/tv/lite?s=hari"');
  });

  it("escapes what people typed", () => {
    const html = tvLiteHtml(feed(), { ask: { s: "hari" }, path });
    expect(html).toContain("Review &lt;data&gt; &amp; &quot;angka&quot;");
    expect(html).not.toContain("<data>");
    expect(esc(`<a href="x">'b'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;b&#39;&lt;/a&gt;");
  });

  it("reloads itself just past each minute when the list has one item, and says so when it has none", () => {
    const one = tvLiteHtml(feed({ playlist: [row("tamu", { title: "Pak Dewa" })] }), { ask: {}, path });
    expect(one).toContain('<meta http-equiv="refresh" content="41">');
    expect(one).toContain(">Pak Dewa</h1>");
    const none = tvLiteHtml(feed({ playlist: [row("video", { body: "dQw4w9WgXcQ" })] }), { ask: {}, path });
    expect(none).toContain("Belum ada yang ditayangkan");
    expect(none).toContain('<meta http-equiv="refresh" content="41">');
    expect(tvLiteNotice("Jadwal belum bisa dibaca", "Dicoba lagi.")).toContain('<meta http-equiv="refresh" content="60">');
  });

  it("says so when no room is used", () => {
    const empty = feed({ days: weekOf(DATE).map(date => ({ date, rooms: [] })) });
    expect(tvLiteHtml(empty, { ask: { s: "hari" }, path })).toContain("Belum ada jadwal ruang hari ini");
    expect(tvLiteHtml(empty, { ask: { s: "minggu" }, path })).toContain("Belum ada jadwal ruang minggu ini");
  });

  it("follows the theme and mode picked for the TVs", () => {
    expect(tvLiteHtml(feed(), { path })).toContain("background-color:#0a0f2e");
    expect(tvLiteHtml(feed({ look: "werkudara" }), { path })).toContain("background-color:#0e1117");
    expect(tvLiteHtml(feed({ settings: { ...TV_DEFAULT_SETTINGS, mode: "light" } }), { path })).toContain("background-color:#fbf7ee");
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
    expect(tvLitePath(null, "minggu")).toBe("/tv/lite?s=minggu");
    expect(tvLitePath("lobi", "item-1-v 2")).toBe("/tv/lobi/lite?s=item-1-v%202");
  });
});
