import { clockLabel, wibTime } from "./appraisal";
import { rangeLabel, type Countdown } from "./timeline";
import type { WamLook } from "./theme";
import {
  dayEntries, decimalHour, entryOwner, entryState, fit, fitText, hourSpan, legendFor, legendItem, legendRows, nowAt, place, playlistOf,
  shownDays, tvDateLabel, tvDayHead, tvLegend, tvLegendUnits, tvWeekLabel, type TvBirthday, type TvDay, type TvDayEntry, type TvEntry, type TvFeed,
  type TvItem, type TvLegendItem, type TvMode, type TvNote, type TvRoom, type TvSlide, type TvTimelineEntry, type TvWelcome, type TvWelcomeDesign,
} from "./tv";
import { TV_BIRTHDAY_CARD, TV_BIRTHDAY_FLOWERS, TV_WELCOME_ART } from "@/lib/routes";

/*
 * TV Announcement, lite (11 Nov 2026): the board for an old smart-TV browser (a Samsung of 2017
 * on Tizen 3.0, about Chromium 47; an LG on webOS 23, about Chromium 94). The board at /tv needs a
 * browser of 2023 (Next 16 builds for Chrome 111), so on those TVs it stays empty. This page plays
 * the same list (Admin TV → Tayangan, narrowed to this TV, today and now, or what takes it over)
 * as plain HTML written whole on the server: no script at all, and CSS such a browser knows
 * (flexbox and absolute positions; no grid, no custom properties, no `gap`, no color-mix, no
 * `inset`, no container units). Sizes are in vmin, worked out here as TvBoard does in JavaScript.
 * One item a load: a meta refresh opens the next item (`?s=` its key) after the item's own time,
 * at most a minute, so a change in the admin and a new build of the site reach the TV within a
 * minute. Videos are passed over (a page without script cannot tell when one ends). A landscape TV only.
 */

/** What this page plays of the TV's list, in its order: everything but videos. */
export function liteItems(feed: Pick<TvFeed, "playlist" | "settings" | "slides" | "welcomes" | "meetingPhotos">): TvItem[] {
  return playlistOf(feed).filter(item => item.kind !== "video");
}

/**
 * Which item an address asks for: `?s=` its key; an address from before the whole list was played
 * (`?v=hari`, `?v=minggu`) the first calendar of that kind. Anything else, or an item no longer in
 * the list, starts it from the top.
 */
export function liteIndex(items: readonly TvItem[], ask: { s?: string | null; v?: string | null }): number {
  const byKey = ask.s ? items.findIndex(item => item.key === ask.s) : -1;
  if (byKey >= 0) return byKey;
  const byView = ask.v === "hari" || ask.v === "minggu" ? items.findIndex(item => item.kind === ask.v) : -1;
  return Math.max(0, byView);
}

/** What a lite address asks for: `?s=` (an item's key) and the older `?v=`. */
export function liteAsk(url: string): { s: string | null; v: string | null } {
  const search = new URL(url).searchParams;
  return { s: search.get("s"), v: search.get("v") };
}

/** Seconds until just past the next whole minute, so the clock on the page is the right minute. */
export function refreshSeconds(nowIso: string): number {
  const second = new Date(nowIso).getUTCSeconds();
  return 60 - second + 1;
}
/** The shortest an item stays: each one is a whole page load, which an old TV takes a moment over. */
export const LITE_LEAST_SECONDS = 8;
/** How long an item stays before the next load: its own time, between LITE_LEAST_SECONDS and a minute (so changes arrive within one). */
export const liteSeconds = (item: Pick<TvItem, "seconds">) => Math.min(60, Math.max(LITE_LEAST_SECONDS, Math.round(item.seconds || 0)));

/* ---- Colours: WAM's theme tokens (pra-wam.module.css), written out, since old browsers have no var() ---- */

type Palette = {
  page: string; app: string; surface: string; soft: string; line: string; text: string; muted: string;
  primary: string; primarySoft: string; accent: string; onAccent: string; display: string; body: string;
};
const SERIF = "Lora, Georgia, 'Times New Roman', serif";
const SANS = "Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const POPPINS = "Poppins, 'Segoe UI', Roboto, Arial, sans-serif";
/** The four the board can be in: Dream Out Loud or Werkudara, dark or light (Admin TV → Tampilan). */
export const LITE_PALETTES: Record<WamLook, Record<TvMode, Palette>> = {
  dream: {
    dark: { page: "#060a22", app: "#0a0f2e", surface: "#141a45", soft: "#1a1f52", line: "#2a2f68", text: "#f7f0e1", muted: "#aba8d6", primary: "#cfc5f5", primarySoft: "#2a2766", accent: "#f0d894", onAccent: "#1b1650", display: SERIF, body: SANS },
    light: { page: "#f2eada", app: "#fbf7ee", surface: "#fffdf8", soft: "#f4effb", line: "#e8dfcb", text: "#1b1650", muted: "#5e5a86", primary: "#3a3182", primarySoft: "#ece8fb", accent: "#d4af61", onAccent: "#ffffff", display: SERIF, body: SANS },
  },
  werkudara: {
    dark: { page: "#090b10", app: "#0e1117", surface: "#161a22", soft: "#13242f", line: "#272c36", text: "#f1f4f8", muted: "#9aa3b2", primary: "#5cb8ff", primarySoft: "#0f2a44", accent: "#ffc933", onAccent: "#0e1117", display: POPPINS, body: SANS },
    light: { page: "#eef1f5", app: "#f5f7fa", surface: "#ffffff", soft: "#eef8fd", line: "#e4e8ee", text: "#14171f", muted: "#667085", primary: "#006ec1", primarySoft: "#e5f1fa", accent: "#ffba00", onAccent: "#ffffff", display: POPPINS, body: SANS },
  },
};
/*
 * Dream Out Loud's sky behind the board (--pw-stars in pra-wam.module.css): small stars and two gold
 * sparkles, bright on the night, faint on the cream. Werkudara has none.
 */
const STARS: [number, number, number, number][] = [
  [23, 31, 1.1, 0], [97, 12, 0.8, 1], [151, 58, 1.3, 2], [214, 24, 0.9, 0], [262, 97, 1.1, 1], [41, 121, 0.8, 2], [118, 146, 1.2, 0],
  [191, 129, 0.8, 1], [236, 188, 1.3, 2], [16, 214, 1, 1], [84, 252, 0.8, 0], [163, 231, 1.1, 2], [259, 262, 0.8, 1],
];
function sky(star: string, strength: readonly number[], sparkle: string, shine: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280">${STARS.map(([x, y, r, level]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${star}" fill-opacity="${strength[level]}"/>`).join("")}`
    + `<path d="M66 69Q66 74 71 74Q66 74 66 79Q66 74 61 74Q66 74 66 69Z" fill="${sparkle}" fill-opacity="${shine}"/>`
    + `<path d="M206 164Q206 168 210 168Q206 168 206 172Q206 168 202 168Q206 168 206 164Z" fill="${sparkle}" fill-opacity="${shine}"/></svg>`;
  return `url("data:image/svg+xml,${svg.replace(/"/g, "'").replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E")}")`;
}
const SKY: Record<WamLook, Record<TvMode, string>> = {
  dream: { dark: sky("#f7f0e1", [0.85, 0.55, 0.35], "#f0d894", 0.9), light: sky("#6e55c2", [0.28, 0.2, 0.14], "#d4af61", 0.55) },
  werkudara: { dark: "none", light: "none" },
};
/** Lucide's hourglass, before Pra WAM's countdown as on the board. */
const HOURGLASS = "<svg class=\"icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\">"
  + "<path d=\"M5 22h14\"/><path d=\"M5 2h14\"/><path d=\"M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22\"/>"
  + "<path d=\"M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2\"/></svg>";
/** The nine activity colours of the board (tv.module.css, .c0 to .c8). */
const TONES = ["#ffb000", "#4da3ff", "#2fd67b", "#ff5d5d", "#b98cff", "#00cfc5", "#ff7ec8", "#c3e03a", "#ff8a3d"];

const channels = (hex: string) => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
/** `share` (0–1) of colour `a` over colour `b`, as color-mix(in srgb) would give: old browsers have no color-mix. */
export function mix(a: string, b: string, share: number): string {
  const [x, y] = [channels(a), channels(b)];
  return `#${x.map((value, index) => Math.round(value * share + y[index] * (1 - share)).toString(16).padStart(2, "0")).join("")}`;
}

/* ---- Writing HTML -------------------------------------------------------------------------------- */

/** Text and attribute values, escaped. */
export const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const round = (value: number) => Math.round(value * 100) / 100;
/** A size in units of 1 % of the screen's shorter side. */
const u = (value: number) => `${round(value)}vmin`;
const pct = (value: number) => `${round(value)}%`;
const clamp = (value: number, least: number, most: number) => Math.min(most, Math.max(least, value));

/** The screen, in units: a landscape TV of 16:9. The head and paddings are TvBoard's. */
const SCREEN = { width: 177.78, height: 100 };
const HEAD = 18, PAD_X = 4, PAD_BOTTOM = 5;
const ROOM = { width: SCREEN.width - PAD_X * 2, height: SCREEN.height - HEAD - PAD_BOTTOM };

const span = (entry: Pick<TvEntry, "start" | "end">) => `${clockLabel(entry.start)}–${clockLabel(entry.end)}`;
const pad = (hour: number) => `${String(hour).padStart(2, "0")}.00`;
function hoursOf(from: number, to: number) {
  const all = Array.from({ length: to - from + 1 }, (_, index) => from + index);
  const step = to - from > 12 ? 2 : 1;
  return { all, labelled: all.filter(hour => (hour - from) % step === 0), at: (hour: number) => ((hour - from) / Math.max(1, to - from)) * 100 };
}
const HOURS_LETTERS = 7, START_LETTERS = 3.4, BLOCK_PAD = 2.2;
function hoursIn(entry: Pick<TvEntry, "start" | "end">, wide: number, most: number) {
  const whole = wide >= 1.25 * HOURS_LETTERS + BLOCK_PAD;
  return { text: whole ? span(entry) : clockLabel(entry.start), size: clamp((wide - BLOCK_PAD) / (whole ? HOURS_LETTERS : START_LETTERS), 1.25, most) };
}

/** An activity's number on its colour, as in the legend. */
const badge = (code: number | null, size: number, color: number) =>
  (code == null ? "" : `<b class="badge" style="background-color:${TONES[color % TONES.length]};font-size:${u(size)}">${code}</b>`);
/** A tile's colours by its activity and state, written out (the board tints with color-mix). */
function tile(p: Palette, color: number, state: ReturnType<typeof entryState>): string {
  const tone = TONES[color % TONES.length];
  if (state === "berlangsung") return `border-color:${tone};background-color:${mix(tone, p.surface, 0.38)};box-shadow:0 0 0 0.3vmin ${mix(tone, p.app, 0.35)}`;
  return `border-color:${mix(tone, p.line, 0.7)};background-color:${mix(tone, p.surface, 0.22)}${state === "selesai" ? ";opacity:0.7" : ""}`;
}

type Legend = { rows: TvLegendItem[][]; more: number };
const legendHeight = (legend: Legend) => (legend.rows.length ? legend.rows.length * tvLegendUnits.row + 1 : 0);
function legendHtml(legend: Legend): string {
  if (!legend.rows.length) return "";
  return `<div class="legend">${legend.rows.map((row, index) => `<div class="legendRow">${row.map(item =>
    `<span class="chip">${badge(item.code, 1.5, item.color)}<span class="one">${esc(item.title)}</span></span>`).join("")}${
    index === legend.rows.length - 1 && legend.more ? `<span class="chipMore">+${legend.more} lainnya</span>` : ""}</div>`).join("")}</div>`;
}

const countdownLine = (countdown: Countdown) => `${countdown.edge} <strong>${esc(countdown.left)}</strong> · ${esc(rangeLabel(countdown.date, countdown.date))}`;
function head(kicker: string, title: string, note: string, clock: string, countdown: Countdown | null | undefined): string {
  return `<header class="head"><div class="headText"><p class="kicker">${esc(kicker)}</p><h1 class="date">${esc(title)}</h1>${note ? `<p class="summary">${esc(note)}</p>` : ""}</div>`
    + (countdown ? `<p class="countdown"><span class="countdownTitle">${HOURGLASS}<span class="one">${esc(countdown.entry.title)}</span></span><span class="countdownLeft">${countdownLine(countdown)}</span></p>` : "")
    + `<p class="clock">${esc(clock)}<span>WIB</span></p></header>`;
}
const message = (title: string, body: string) => `<div class="message"><h2>${esc(title)}</h2><p>${esc(body)}</p></div>`;

/* ---- Today: a card per room against the hours (TvBoard's DayWide) ------------------------------------ */

function dayHtml(p: Palette, rooms: TvRoom[], legend: readonly TvLegendItem[], now: number, time: string, height: number): string {
  const AXIS = 5, NAME = 26, GAP = 0.5;
  const hours = hourSpan(rooms), marks = hoursOf(hours.from, hours.to);
  const row = fit(height - AXIS, rooms.length, 22);
  const roomy = row >= 11;
  const track = ROOM.width - NAME;
  const nowPlace = nowAt(time, hours);
  const gone = nowPlace ?? (decimalHour(time) > hours.to ? 100 : 0);
  const axis = `<div class="axis" style="margin-left:${u(NAME)};height:${u(AXIS)}">${marks.labelled.map(hour => `<span class="hour" style="left:${pct(marks.at(hour))}">${pad(hour)}</span>`).join("")}</div>`;
  const over = nowPlace == null ? "" : `<div class="over" style="left:${u(NAME)};height:${u(row * rooms.length)}"><div class="nowLine" style="left:${pct(nowPlace)}"><b>${esc(clockLabel(time))}</b></div></div>`;
  const rows = rooms.map(item => {
    const name = `<div class="rowName" style="width:${u(NAME)}"><strong class="${row >= 7 ? "wrap" : "one"}" style="font-size:${u(fitText(row, 0.16, 2.6))};-webkit-line-clamp:2">${esc(item.name)}</strong>${
      row >= 10 ? `<small class="one" style="font-size:${u(1.6)}">${item.entries.length} jadwal</small>` : ""}</div>`;
    const lines = marks.all.slice(1, -1).map(hour => `<i style="left:${pct(marks.at(hour))}"></i>`).join("");
    const shade = gone > 0 ? `<div class="gone" style="width:${pct(gone)}"></div>` : "";
    const blocks = item.entries.map(entry => {
      const spot = place(entry, hours), state = entryState(entry, now), who = legendItem(legend, entry.title);
      const wide = (spot.size / 100) * track;
      const when = hoursIn(entry, wide, 1.6);
      const on = state === "berlangsung" && wide >= 10;
      const text = clamp((wide - BLOCK_PAD) * 0.13, 1.35, 2.6);
      const clampLines = Math.max(1, Math.floor((row - GAP * 2 - 1.6 - 3 - when.size * 1.3 * (on ? 2 : 1)) / (text * 1.2)));
      const owner = entryOwner(entry);
      const inside = roomy
        ? (wide >= 4.6 ? badge(who.code, 1.5, who.color) : "")
          + (owner ? `<span class="wrap title" style="font-size:${u(text)};-webkit-line-clamp:${clampLines}">${esc(owner)}</span>` : "")
          + `<span class="one sub" style="font-size:${u(when.size)}">${esc(when.text)}</span>`
          + (on ? `<span class="one on" style="font-size:${u(when.size)}">Berlangsung</span>` : "")
        : `<span class="one" style="font-size:${u(clamp(row * 0.3, 1.25, 1.8))}">${wide >= 4.6 ? badge(who.code, clamp(row * 0.26, 1.2, 1.5), who.color) + " " : ""}${esc(when.text)}</span>`;
      return `<div class="block" title="${esc(entry.title)}" style="left:${pct(spot.at)};width:${pct(spot.size)};top:${u(GAP)};bottom:${u(GAP)};${tile(p, who.color, state)}">${inside}</div>`;
    }).join("");
    return `<div class="row" style="height:${u(row)}">${name}<div class="track">${lines}${shade}${blocks}</div></div>`;
  }).join("");
  return `${axis}<div class="rows">${over}${rows}</div>`;
}

/* ---- The week: a column per day (TvBoard's WeekWide) ------------------------------------------------ */

function weekItem(p: Palette, entry: TvDayEntry, who: { color: number; code: number | null }, now: number, height: number, gap: number, hours: number, small: number | null, width: number): string {
  const state = entryState(entry, now);
  const owner = entryOwner(entry);
  const fitted = (size: number, letters: number) => clamp(width / (letters * 0.58), 1.1, size);
  const body = small != null
    ? `<span class="pair"><span class="line"><span class="title">${esc(span(entry))}</span><span class="one sub" style="font-size:${u(clamp((width - hours * 0.6 * 11 - 1.2) / (Math.max(1, entry.room.length) * 0.58), 1.1, small))}">${esc(entry.room)}</span></span>${
      owner ? `<span class="one sub" style="font-size:${u(fitted(small, owner.length))}">${esc(owner)}</span>` : ""}</span>`
    : `<span class="one grow"><span class="title">${esc(span(entry))}</span><span class="sub"> · ${esc(entry.room)}</span></span>`;
  return `<div class="item" title="${esc(entry.title)}" style="height:${u(height)};margin-top:${u(gap)};font-size:${u(hours)};${tile(p, who.color, state)}">${badge(who.code, Math.min(1.7, hours * 0.75), who.color)}${body}${
    state === "berlangsung" ? `<span class="on" style="font-size:${u(Math.min(hours, 1.8))}">Kini</span>` : ""}</div>`;
}

function weekHtml(p: Palette, days: TvDay[], legend: readonly TvLegendItem[], today: string, now: number, height: number): string {
  const HEADING = 7, GAP = 0.9, COLUMN_GAP = 2.4;
  const lists = days.map(day => ({ day, entries: dayEntries(day) }));
  const unit = fit(height - HEADING - 1, Math.max(...lists.map(list => list.entries.length)), 10);
  const column = (ROOM.width - COLUMN_GAP * (days.length - 1)) / days.length;
  const stacked = unit >= 4.6;
  const hours = stacked ? Math.min(fitText(unit - GAP, 0.4, 2.4), fitText(column, 0.062, 2.4)) : Math.min(fitText(unit, 0.42, 2.2), fitText(column, 0.06, 2.2));
  const small = Math.min(fitText(unit - GAP, 0.25, 1.75), fitText(column, 0.052, 1.75));
  return `<div class="week" style="height:${u(height)}">${lists.map(({ day, entries }, index) => {
    const dayHead = tvDayHead(day.date), isToday = day.date === today;
    return `<div class="weekDay${isToday ? " today" : ""}"${index ? ` style="margin-left:${u(COLUMN_GAP)}"` : ""}>`
      + `<div class="dayHead" style="height:${u(HEADING - 1)};font-size:${u(fitText(column, 0.085, 2.6))}"><strong class="one">${esc(dayHead.name)}</strong><span class="one">${esc(dayHead.day)}</span>${isToday ? "<em>Hari ini</em>" : ""}</div>`
      + (entries.length ? "" : `<p class="free" style="margin-top:${u(1.2)};font-size:${u(2)}">Kosong</p>`)
      + entries.map(entry => weekItem(p, entry, legendItem(legend, entry.title), now, unit - GAP, GAP, hours, stacked ? small : null, column - 7.6)).join("")
      + "</div>";
  }).join("")}</div>`;
}

/* ---- The other items of the list (TvTemplates.tsx), without script ------------------------------- */

const noteDate = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" });
/** The welcome sign is 16:9: one hundredth of its width is this many hundredths of its height. */
const SIGN = 16 / 9;
/** The birthday card is 1131 × 1600: one hundredth of its height is this many hundredths of its width. */
const CARD = 1600 / 1131;
const sized = (value: number, unit: "vh" | "vw") => `${round(value)}${unit}`;
/**
 * The welcome sign's sizes, `k` `unit`s to one hundredth of its width: on a screen wider than 16:9
 * the sign is the screen's height (vh), on any narrower one, a portrait TV too, its width (vw). The
 * board does this with min() and container units, which old browsers do not have.
 */
function signSizes(unit: "vh" | "vw", k: number): string {
  const at = (value: number) => sized(value * k, unit);
  return `.signFrame{width:${at(100)};height:${at(56.25)};margin:${at(-28.125)} 0 0 ${at(-50)}}`
    + `.signText h1{font-size:${at(5.6)}}.signText h1.sedang{font-size:${at(4.4)}}.signText h1.kecil{font-size:${at(3.4)}}`
    + `.signText p{margin-top:${at(1.6)};font-size:${at(2)}}`
    + `.signText .facts{margin-top:${at(1.6)};font-size:${at(1.9)}}.signText .facts li{margin:0 ${at(1.5)}}`;
}
/**
 * The birthday card's sizes, `k` `unit`s to one hundredth of its height: the screen's height, or on a
 * screen narrower than the card (a portrait TV), its width. The wish is a little smaller than the
 * board's: an old TV has no Cormorant Garamond, and its Georgia is wider.
 */
function cardSizes(unit: "vh" | "vw", k: number): string {
  const at = (value: number) => sized(value * k, unit);
  return `.bdayCard{width:${at(100 / CARD)};height:${at(100)};margin:${at(-50)} 0 0 ${at(-50 / CARD)}}`
    + `.bdayName{font-size:${at(6)}}.bdayName.sedang{font-size:${at(4.9)}}.bdayName.kecil{font-size:${at(3.9)}}`
    + `.bdayDate strong{font-size:${at(6)}}.bdayDate span{margin-top:${at(1)};font-size:${at(2.8)}}`
    + `.bdayWish h2{font-size:${at(1.95)}}.bdayWish p{margin-top:${at(0.4)};font-size:${at(1.8)}}`;
}

/** Timeline: what is on and what comes next. Rows share the height, so all of them are on screen. */
function timelineHtml(p: Palette, entries: readonly TvTimelineEntry[], height: number): string {
  if (!entries.length) return message("Belum ada forum atau acara berikutnya", "Jadwal dari Kelola acara muncul di sini dengan sendirinya.");
  const row = fit(height, entries.length, 13);
  const text = fitText(row, 0.3, 3.2), small = fitText(row, 0.2, 2.1);
  return entries.map(entry => {
    const tone = TONES[entry.color % TONES.length], on = entry.state === "berlangsung";
    return `<div class="tlRow" style="height:${u(row - 1)};margin-bottom:${u(1)};border-color:${on ? tone : mix(tone, p.line, 0.6)};background-color:${mix(tone, p.surface, on ? 0.3 : 0.16)}">`
      + `<i class="dot" style="background-color:${tone}"></i>`
      + `<span class="tlMain"><strong class="one" style="font-size:${u(text)}">${esc(entry.title)}</strong><span class="one" style="font-size:${u(small)}">${on ? "<em>Sedang berlangsung · </em>" : ""}${esc(entry.left)}</span></span>`
      + `<span class="tlWhen" style="font-size:${u(small)}"><strong style="font-size:${u(Math.min(text, 2.6))}">${esc(entry.when)}</strong>${entry.hours ? `<span>${esc(entry.hours)}</span>` : ""}</span></div>`;
  }).join("");
}

/** Panitia's announcements to everyone, newest first (three at most), sharing the height. */
function notesHtml(notes: readonly TvNote[]): string {
  const shown = notes.slice(0, 3);
  if (!shown.length) return message("Belum ada pengumuman baru", "Pengumuman panitia untuk semua peserta muncul di sini.");
  return `<div class="noteList${shown.length === 1 ? " single" : ""}">${shown.map((note, index) => `<div class="note"${index ? ' style="margin-top:2vmin"' : ""}>`
    + `<strong>${esc(note.title)}</strong>${note.body ? `<p>${esc(note.body)}</p>` : ""}<small>${esc(noteDate.format(new Date(note.at)))}</small></div>`).join("")}</div>`;
}

const textHtml = (title: string, body: string) =>
  `<div class="slide textSlide" data-item="teks">${title ? `<h1>${esc(title)}</h1>` : ""}${body ? `<p${title ? ' style="margin-top:3vmin"' : ""}>${esc(body)}</p>` : ""}</div>`;

/** Lucide's clock and map pin, for a visit's hours and place. */
const CLOCK = "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><polyline points=\"12 6 12 12 16 14\"/></svg>";
const PIN = "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0\"/><circle cx=\"12\" cy=\"10\" r=\"3\"/></svg>";
const facts = (welcome: TvWelcome) => (welcome.hours || welcome.place
  ? `<ul class="facts">${welcome.hours ? `<li>${CLOCK}${esc(welcome.hours)}</li>` : ""}${welcome.place ? `<li>${PIN}${esc(welcome.place)}</li>` : ""}</ul>` : "");

/**
 * A guest is welcomed, in the row's design: "werkudara", the office's welcome sign with the name in
 * its empty middle; "foto", the visit's cover photo, darkened, behind the greeting and the name;
 * "polos", the board's colours.
 */
function welcomeHtml(welcome: TvWelcome, design: TvWelcomeDesign): string {
  if (design === "werkudara") {
    const size = welcome.name.length > 44 ? "kecil" : welcome.name.length > 26 ? "sedang" : "besar";
    return `<div class="slide sign" data-item="sambutan"><div class="signFrame"><img src="${esc(TV_WELCOME_ART)}" alt="Welcome. Werkudara Group.">`
      + `<div class="signText"><h1 class="${size}">${esc(welcome.name)}</h1>${welcome.note ? `<p>${esc(welcome.note)}</p>` : ""}${facts(welcome)}</div></div></div>`;
  }
  const photo = design === "foto" ? welcome.image : "";
  const size = welcome.name.length > 36 ? 6.5 : welcome.name.length > 20 ? 8.5 : 11;
  return `<div class="slide welcome${photo ? " withPhoto" : ""}" data-item="sambutan">`
    + (photo ? `<img class="welcomePhoto" src="${esc(photo)}" alt=""><div class="shade"></div>` : "")
    + `<div class="welcomeText"><p class="greeting">${esc(welcome.greeting)}</p><h1 style="font-size:${u(size)}">${esc(welcome.name)}</h1>`
    + `${welcome.note ? `<p class="welcomeNote">${esc(welcome.note)}</p>` : ""}${facts(welcome)}</div></div>`;
}

/** A birthday greeting on the team's own card, whole and upright in the middle of the screen (BirthdaySlide). */
function birthdayHtml(birthday: TvBirthday): string {
  const size = birthday.name.length > 28 ? "kecil" : birthday.name.length > 18 ? "sedang" : "besar";
  return `<div class="slide bday" data-item="ultah"><div class="bdayCard"><img class="bdayArt" src="${esc(TV_BIRTHDAY_CARD)}" alt="">`
    + `<h1 class="bdayName ${size}">${esc(birthday.name)}</h1>`
    + (birthday.day ? `<p class="bdayDate"><strong>${esc(birthday.day)}</strong><span>${esc(birthday.month)}</span></p>` : "")
    + (birthday.photo ? `<img class="${birthday.cut ? "bdayPerson" : "bdayPhoto"}" src="${esc(birthday.photo)}" alt="">` : "")
    + (birthday.photo && birthday.cut ? `<img class="bdayArt" src="${esc(TV_BIRTHDAY_FLOWERS)}" alt="">` : "")
    + `<div class="bdayWish"><h2>Happy Birthday ${esc(birthday.call)}</h2><p>${esc(birthday.wish)}</p></div></div></div>`;
}

const pictureHtml = (slide: TvSlide) =>
  `<div class="slide picture" data-item="gambar"><img src="${esc(slide.src)}" alt="${esc(slide.title || "Gambar pengumuman")}"></div>`;

/* ---- The page ------------------------------------------------------------------------------------- */

function styles(p: Palette, stars: string): string {
  return `html,body{margin:0;padding:0;height:100%;overflow:hidden;background-color:${p.app}}`
    + `body{background-image:${stars};color:${p.text};font-family:${p.body};font-size:2.4vmin;line-height:1.2;-webkit-text-size-adjust:none}`
    + "h1,h2,p{margin:0}"
    + `.schedule{position:absolute;top:0;left:0;right:0;bottom:0;padding:0 ${u(PAD_X)} ${u(PAD_BOTTOM)};overflow:hidden}`
    + `.head{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;height:${u(HEAD)}}`
    + ".headText{-webkit-flex:1 1 auto;flex:1 1 auto;min-width:0;overflow:hidden}"
    + `.kicker{color:${p.accent};font-size:2.3vmin;font-weight:700;letter-spacing:.04em;text-transform:uppercase}`
    + `.date{margin-top:.8vmin;overflow:hidden;font-family:${p.display};font-size:4.6vmin;font-weight:600;line-height:1.1;text-overflow:ellipsis;white-space:nowrap}`
    + `.summary{margin-top:.8vmin;overflow:hidden;color:${p.muted};font-size:2.2vmin;text-overflow:ellipsis;white-space:nowrap}`
    + `.countdown{-webkit-flex:0 1 auto;flex:0 1 auto;max-width:64vmin;min-width:0;margin:0 4vmin 0 4vmin;padding-right:4vmin;border-right:1px solid ${p.line};text-align:right}`
    + ".countdownTitle{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;-webkit-justify-content:flex-end;justify-content:flex-end;min-width:0;font-size:2.6vmin;font-weight:700}"
    + `.countdownTitle .icon{-webkit-flex:none;flex:none;width:2.6vmin;height:2.6vmin;margin-right:1vmin;color:${p.accent}}`
    + ".countdownTitle .one{min-width:0}"
    + `.countdownLeft{display:block;margin-top:.6vmin;color:${p.muted};font-size:2.3vmin;white-space:nowrap}`
    + `.countdownLeft strong{color:${p.accent}}`
    + `.clock{-webkit-flex:none;flex:none;font-family:${p.display};font-size:8vmin;font-weight:600;line-height:1;white-space:nowrap}`
    + `.clock span{margin-left:1vmin;color:${p.muted};font-size:2.4vmin;font-weight:500}`
    + ".legend{margin:0 0 1vmin}"
    + `.legendRow{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;height:${u(tvLegendUnits.row)};overflow:hidden;white-space:nowrap}`
    + ".chip{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;min-width:0;margin-right:2.6vmin;font-size:2vmin;font-weight:600}"
    + ".chip .badge{margin-right:1vmin}"
    + `.chipMore{-webkit-flex:none;flex:none;color:${p.muted};font-size:1.8vmin}`
    + ".badge{display:inline-block;-webkit-flex:none;flex:none;box-sizing:border-box;min-width:1.7em;height:1.7em;padding:0 .35em;border-radius:999px;color:#101322;"
    + `font-family:${p.body};font-weight:700;font-style:normal;line-height:1.7em;text-align:center;vertical-align:middle;background-color:${p.primary}}`
    + ".body{position:relative}"
    + ".one{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
    + ".wrap{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;line-height:1.2;word-wrap:break-word;overflow-wrap:break-word}"
    + ".title{font-weight:600}"
    + `.sub{color:${mix(p.text, p.app, 0.78)}}`
    + `.on{color:${p.accent};font-weight:700}`
    + `.hour{color:${p.muted}}`
    // Today
    + ".axis{position:relative;font-size:2vmin}"
    + ".axis span{position:absolute;top:0;-webkit-transform:translateX(-50%);transform:translateX(-50%);white-space:nowrap}"
    + ".rows{position:relative}"
    + ".row{display:-webkit-flex;display:flex;-webkit-align-items:stretch;align-items:stretch;box-sizing:border-box;padding:.5vmin 0}"
    + ".rowName{display:-webkit-flex;display:flex;-webkit-flex:none;flex:none;-webkit-flex-direction:column;flex-direction:column;-webkit-justify-content:center;justify-content:center;box-sizing:border-box;min-width:0;padding-right:1.5vmin}"
    + `.rowName strong{font-family:${p.display};font-weight:600}`
    + `.rowName small{margin-top:.2vmin;color:${p.muted}}`
    + `.track{position:relative;-webkit-flex:1 1 0;flex:1 1 0;min-width:0;overflow:hidden;border:.15vmin solid ${p.line};border-radius:1.6vmin;background-color:${p.surface}}`
    + `.track i{position:absolute;top:0;bottom:0;width:0;border-left:.12vmin solid ${p.line}}`
    + `.gone{position:absolute;top:0;bottom:0;left:0;background-color:${p.page};opacity:.55}`
    + `.block{position:absolute;z-index:1;display:-webkit-flex;display:flex;-webkit-flex-direction:column;flex-direction:column;-webkit-align-items:flex-start;align-items:flex-start;-webkit-justify-content:center;justify-content:center;box-sizing:border-box;overflow:hidden;padding:0 .9vmin;border:.2vmin solid ${p.line};border-radius:1.2vmin}`
    + ".block>span{max-width:100%}"
    + ".block>*+*{margin-top:.35vmin}"
    + ".over{position:absolute;top:0;right:0;z-index:2}"
    + `.nowLine{position:absolute;top:0;bottom:0;width:0;border-left:.35vmin solid ${p.accent}}`
    + `.nowLine b{position:absolute;top:0;left:0;padding:.3vmin 1.1vmin;border-radius:999px;background-color:${p.accent};color:${p.onAccent};font-size:1.8vmin;font-weight:700;white-space:nowrap;-webkit-transform:translate(-50%,-115%);transform:translate(-50%,-115%)}`
    // The week
    + ".week{display:-webkit-flex;display:flex}"
    + ".weekDay{-webkit-flex:1 1 0;flex:1 1 0;min-width:0;overflow:hidden}"
    + `.dayHead{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;box-sizing:border-box;border-bottom:.25vmin solid ${p.line};font-family:${p.display};white-space:nowrap}`
    + ".dayHead strong{font-weight:600}"
    + `.dayHead span{margin-left:1vmin;color:${p.muted}}`
    + `.today .dayHead{border-bottom-color:${p.accent}}`
    + `.dayHead em{margin-left:auto;padding-left:1vmin;color:${p.accent};font-style:normal;font-weight:700}`
    + `.free{color:${p.muted}}`
    + `.item{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;box-sizing:border-box;overflow:hidden;padding:0 1.3vmin;border:.2vmin solid ${p.line};border-radius:1.2vmin}`
    + ".item .badge{margin-right:1.2vmin}"
    + ".pair{display:-webkit-flex;display:flex;-webkit-flex-direction:column;flex-direction:column;-webkit-flex:1 1 0;flex:1 1 0;min-width:0}"
    + ".line{display:-webkit-flex;display:flex;-webkit-align-items:baseline;align-items:baseline;min-width:0;white-space:nowrap}"
    + ".line .title{-webkit-flex:none;flex:none;margin-right:.9vmin}"
    + ".line .sub{-webkit-flex:1 1 0;flex:1 1 0;min-width:0}"
    + ".grow{-webkit-flex:1 1 0;flex:1 1 0;min-width:0}"
    + ".item .on{-webkit-flex:none;flex:none;margin-left:1.2vmin}"
    // Nothing to show
    + `.message{position:absolute;top:0;left:0;right:0;bottom:0;display:-webkit-flex;display:flex;-webkit-flex-direction:column;flex-direction:column;-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center;padding:0 10vmin;text-align:center}`
    + `.message h2{font-family:${p.display};font-size:5vmin;font-weight:600}`
    + `.message p{margin-top:2vmin;color:${p.muted};font-size:2.6vmin}`
    + ".schedule .message{position:static;height:60vmin}"
    // A whole-screen item
    + ".slide{position:absolute;top:0;left:0;right:0;bottom:0;overflow:hidden}"
    // Timeline
    + `.tlRow{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;box-sizing:border-box;padding:0 2.4vmin;border:.2vmin solid ${p.line};border-radius:1.6vmin}`
    + ".dot{display:block;-webkit-flex:none;flex:none;width:2vmin;height:2vmin;margin-right:2vmin;border-radius:50%}"
    + ".tlMain{-webkit-flex:1 1 0;flex:1 1 0;min-width:0}"
    + `.tlMain strong{font-family:${p.display};font-weight:600}`
    + `.tlMain span{margin-top:.3vmin;color:${p.muted}}`
    + `.tlMain em{color:${p.accent};font-style:normal;font-weight:700}`
    + `.tlWhen{-webkit-flex:none;flex:none;margin-left:2vmin;color:${p.muted};text-align:right}`
    + `.tlWhen strong{display:block;color:${p.text};font-weight:700}`
    + ".tlWhen span{display:block;margin-top:.2vmin}"
    // Announcements
    + ".noteList{display:-webkit-flex;display:flex;-webkit-flex-direction:column;flex-direction:column;height:77vmin}"
    + `.note{display:-webkit-flex;display:flex;-webkit-flex-direction:column;flex-direction:column;-webkit-flex:1 1 0;flex:1 1 0;box-sizing:border-box;min-height:0;padding:2.4vmin 3vmin;overflow:hidden;border:.2vmin solid ${p.line};border-radius:2vmin;background-color:${p.surface}}`
    + `.note strong{-webkit-flex:none;flex:none;font-family:${p.display};font-size:3.4vmin;font-weight:600;line-height:1.2}`
    + ".note p{-webkit-flex:1 1 0;flex:1 1 0;min-height:0;margin-top:1vmin;overflow:hidden;font-size:2.5vmin;line-height:1.4;white-space:pre-line}"
    + `.note small{-webkit-flex:none;flex:none;margin-top:1vmin;color:${p.muted};font-size:1.9vmin}`
    + ".single .note strong{font-size:4.6vmin}.single .note p{font-size:3.2vmin}"
    // Text
    + ".textSlide{display:-webkit-flex;display:flex;-webkit-flex-direction:column;flex-direction:column;-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center;box-sizing:border-box;padding:8vmin 10vmin;text-align:center}"
    + `.textSlide h1{font-family:${p.display};font-size:7vmin;font-weight:600;line-height:1.15;word-wrap:break-word}`
    + `.textSlide p{max-width:100%;color:${mix(p.text, p.app, 0.86)};font-size:3.6vmin;line-height:1.4;white-space:pre-line;word-wrap:break-word}`
    // Welcome: the sign, or the photo or the board's colours
    + ".facts{display:-webkit-flex;display:flex;-webkit-flex-wrap:wrap;flex-wrap:wrap;-webkit-justify-content:center;justify-content:center;margin:1.5vmin 0 0;padding:0;list-style:none;font-size:3.2vmin;font-weight:600}"
    + ".facts li{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;margin:.8vmin 2vmin 0;word-wrap:break-word}"
    + ".facts svg{-webkit-flex:none;flex:none;width:1em;height:1em;margin-right:1.2vmin}"
    + ".sign{background-color:#003797}"
    + ".signFrame{position:absolute;top:50%;left:50%}"
    + ".signFrame img{display:block;width:100%;height:100%}"
    + `.signText{position:absolute;top:44%;left:12%;right:12%;bottom:23%;display:-webkit-flex;display:flex;-webkit-flex-direction:column;flex-direction:column;-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center;color:#ffffff;font-family:${p.body};text-align:center}`
    + ".signText h1{display:-webkit-box;max-width:100%;overflow:hidden;font-weight:600;line-height:1.15;letter-spacing:.02em;-webkit-box-orient:vertical;-webkit-line-clamp:2;word-wrap:break-word}"
    + `.signText p{display:-webkit-box;max-width:100%;overflow:hidden;color:#cfe6fb;line-height:1.35;-webkit-box-orient:vertical;-webkit-line-clamp:2;word-wrap:break-word}`
    + ".signText .facts{color:#8fd0f5}"
    + signSizes("vh", SIGN) + `@media (max-aspect-ratio:16/9){${signSizes("vw", 1)}}`
    + ".welcome{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center}"
    + ".welcomePhoto{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover}"
    + ".shade{position:absolute;top:0;left:0;right:0;bottom:0;background-color:rgba(5,10,24,.66);background-image:-webkit-linear-gradient(top,rgba(5,10,24,.55),rgba(5,10,24,.78));background-image:linear-gradient(180deg,rgba(5,10,24,.55),rgba(5,10,24,.78))}"
    + ".welcomeText{position:relative;z-index:1;box-sizing:border-box;max-width:100%;padding:8vmin 9vmin;text-align:center}"
    + ".withPhoto .welcomeText{color:#ffffff}"
    + `.greeting{color:${p.accent};font-size:3.4vmin;font-weight:700;letter-spacing:.06em;text-transform:uppercase;word-wrap:break-word}`
    + ".withPhoto .greeting{color:#ffd98a}"
    + `.welcomeText h1{display:-webkit-box;margin-top:2.4vmin;overflow:hidden;font-family:${p.display};font-weight:600;line-height:1.1;-webkit-box-orient:vertical;-webkit-line-clamp:3;word-wrap:break-word}`
    + ".welcomeNote{margin-top:2.4vmin;font-size:3.4vmin;line-height:1.4;white-space:pre-line;word-wrap:break-word}"
    // Birthday: the card is 1131 × 1600, the screen's height; its own sizes are in its height (cqh = vmin here)
    + ".bday{background-color:#f0f0f0;color:#0d0d0f}"
    + ".bdayCard{position:absolute;top:50%;left:50%;overflow:hidden}"
    + cardSizes("vh", 1) + `@media (max-aspect-ratio:1131/1600){${cardSizes("vw", CARD)}}`
    + ".bdayArt{position:absolute;top:0;left:0;display:block;width:100%;height:100%}"
    + ".bdayName{position:absolute;left:21%;bottom:75.9%;display:-webkit-box;width:46%;padding-bottom:.14em;overflow:hidden;font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-weight:800;line-height:.94;letter-spacing:-.02em;-webkit-box-orient:vertical;-webkit-line-clamp:2;word-wrap:break-word}"
    + ".bdayDate{position:absolute;left:66%;top:12.6%;width:17%;line-height:1;text-align:center}"
    + ".bdayDate strong{display:block;font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-weight:800}"
    + ".bdayDate span{display:block;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-weight:700;letter-spacing:.01em}"
    + ".bdayPerson{position:absolute;left:50%;bottom:27.8%;height:47%;max-width:62%;object-fit:contain;object-position:center bottom;-webkit-transform:translateX(-50%);transform:translateX(-50%)}"
    + ".bdayPhoto{position:absolute;left:26.3%;top:35.3%;width:47.4%;height:36.9%;object-fit:cover;object-position:center top}"
    + ".bdayWish{position:absolute;left:21.5%;top:81.4%;width:57%;text-align:center;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-style:italic}"
    + ".bdayWish h2{font-weight:700;line-height:1.25;word-wrap:break-word}"
    + ".bdayWish p{display:-webkit-box;overflow:hidden;font-weight:600;line-height:1.22;white-space:pre-line;-webkit-box-orient:vertical;-webkit-line-clamp:5;word-wrap:break-word}"
    // A picture, whole, on black
    + ".picture{background-color:#000000}"
    + ".picture img{display:block;width:100%;height:100%;object-fit:contain}";
}

function page(p: Palette, stars: string, refresh: string, body: string): string {
  return "<!DOCTYPE html>\n<html lang=\"id\"><head><meta charset=\"utf-8\">"
    + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
    + `<meta http-equiv="refresh" content="${esc(refresh)}">`
    + "<meta name=\"robots\" content=\"noindex, nofollow\"><meta name=\"referrer\" content=\"no-referrer\">"
    + `<meta name="theme-color" content="${p.app}"><title>TV Announcement</title>`
    + `<style>${styles(p, stars)}</style></head><body>${body}</body></html>`;
}

/**
 * The lite board for one load: the item of this TV's list the address asks for (`ask`, see
 * liteIndex), drawn whole, and a meta refresh that opens the next one (`path` gives an item's
 * address) after the item's time. A list of one reloads itself just past each minute.
 */
export function tvLiteHtml(feed: TvFeed, options: { ask?: { s?: string | null; v?: string | null }; path: (key: string) => string }): string {
  const p = LITE_PALETTES[feed.look]?.[feed.settings.mode] ?? LITE_PALETTES.dream.dark;
  const stars = SKY[feed.look]?.[feed.settings.mode] ?? "none";
  const items = liteItems(feed);
  if (!items.length) {
    return page(p, stars, String(refreshSeconds(feed.now)), message("Belum ada yang ditayangkan", "Tambahkan tayangan di Admin TV → Tayangan."));
  }
  const index = liteIndex(items, options.ask ?? {});
  const item = items[index], next = items[(index + 1) % items.length];
  const refresh = items.length > 1 ? `${liteSeconds(item)};url=${options.path(next.key)}` : String(refreshSeconds(feed.now));
  const now = Date.parse(feed.now), time = wibTime(feed.now), clock = clockLabel(time);

  if (item.kind === "teks") return page(p, stars, refresh, textHtml(item.title, item.body));
  if (item.kind === "sambutan") return page(p, stars, refresh, welcomeHtml(item.welcome, item.design));
  if (item.kind === "ultah") return page(p, stars, refresh, birthdayHtml(item.birthday));
  if (item.kind === "gambar") return page(p, stars, refresh, pictureHtml(item.slide));
  if (item.kind === "timeline") {
    return page(p, stars, refresh, `<main class="schedule" data-item="timeline">${head("Timeline Pra WAM", "Forum dan acara", "", clock, null)}<div class="body">${timelineHtml(p, feed.timeline ?? [], ROOM.height)}</div></main>`);
  }
  if (item.kind === "pengumuman") {
    return page(p, stars, refresh, `<main class="schedule" data-item="pengumuman">${head("Pengumuman", "Dari panitia", "", clock, null)}${notesHtml(feed.notes ?? [])}</main>`);
  }
  const view = item.kind === "minggu" ? "minggu" : "hari";
  const legend = tvLegend(feed.days);
  let content: string;
  if (view === "hari") {
    const rooms = feed.days.find(day => day.date === feed.date)?.rooms ?? [];
    const entries = rooms.flatMap(room => room.entries);
    const onNow = entries.filter(entry => entryState(entry, now) === "berlangsung").length;
    const note = entries.length ? [`${rooms.length} ruang dipakai`, `${entries.length} jadwal`, ...(onNow ? [`${onNow} sedang berlangsung`] : [])].join(" · ") : "";
    const shown = legendRows(legendFor(legend, rooms), ROOM.width);
    content = head("Jadwal ruang hari ini", tvDateLabel(feed.date), note, clock, feed.countdown) + legendHtml(shown)
      + (rooms.length
        ? `<div class="body" style="height:${u(ROOM.height - legendHeight(shown))}">${dayHtml(p, rooms, legend, now, time, ROOM.height - legendHeight(shown))}</div>`
        : message("Belum ada jadwal ruang hari ini", "Ruang yang dibooking lewat WAM tampil di sini."));
  } else {
    const week = shownDays(feed.days);
    const count = week.reduce((sum, day) => sum + day.rooms.reduce((total, room) => total + room.entries.length, 0), 0);
    const shown = legendRows(legendFor(legend, week.flatMap(day => day.rooms)), ROOM.width);
    content = head("Jadwal ruang minggu ini", tvWeekLabel(week.map(day => day.date)), count ? `${count} jadwal minggu ini` : "", clock, feed.countdown) + legendHtml(shown)
      + (count
        ? `<div class="body">${weekHtml(p, week, legend, feed.date, now, ROOM.height - legendHeight(shown))}</div>`
        : message("Belum ada jadwal ruang minggu ini", "Ruang yang dibooking lewat WAM tampil di sini."));
  }
  return page(p, stars, refresh, `<main class="schedule" data-item="${view}">${content}</main>`);
}

/**
 * A lite page with nothing to show but a note (an address that is not a TV's, or content that
 * cannot be read now). It still loads itself afresh every minute, so the TV recovers on its own.
 */
export function tvLiteNotice(title: string, body: string): string {
  return page(LITE_PALETTES.dream.dark, SKY.dream.dark, "60", message(title, body));
}

const HEADERS = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
/** The answer for a lite page: HTML that is never kept by a cache. */
export const tvLiteResponse = (html: string, status = 200) => new Response(html, { status, headers: HEADERS });
