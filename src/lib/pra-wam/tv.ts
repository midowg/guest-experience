import { z } from "zod";
import type { WamLook } from "./theme";

/*
 * TV Announcement (Admin WAM → TV Announcement, 10 Nov 2026): what an office TV plays. Every TV
 * shows the same thing, sized to its own screen: today's rooms as a calendar (rooms against the
 * hours), this week's as a calendar (a column per day), then the uploaded pictures, one after
 * another, forever. A calendar always fits one screen: its rows and text shrink as the day or the
 * week fills up, so everything stays in view. The rules here are shared by the TV page, the
 * admin's preview and the server, and are pure.
 */

/** One use of a room on a day. `start`/`end` are WIB clock times cut at the day's edges ("24:00" = runs past midnight). */
export type TvEntry = { key: string; title: string; by: string; start: string; end: string; startsAt: string; endsAt: string };
export type TvRoom = { id: string; name: string; entries: TvEntry[] };
/** One day of the week: the rooms in use on it, in the rooms' own order. */
export type TvDay = { date: string; rooms: TvRoom[] };
export type TvSlide = { id: string; title: string; seconds: number; src: string };
/** The board's mode: the colours are the WAM theme's (Admin WAM → Tema aplikasi), in its dark or its light. */
export const tvModes = ["dark", "light"] as const;
export type TvMode = (typeof tvModes)[number];
export const tvModeLabels: Record<TvMode, string> = { dark: "Gelap", light: "Terang" };
/** The corner the QR code sits in. */
export const tvQrPositions = ["kanan-bawah", "kiri-bawah", "kanan-atas", "kiri-atas"] as const;
export type TvQrPosition = (typeof tvQrPositions)[number];
export const tvQrPositionLabels: Record<TvQrPosition, string> = { "kanan-bawah": "Kanan bawah", "kiri-bawah": "Kiri bawah", "kanan-atas": "Kanan atas", "kiri-atas": "Kiri atas" };
/** Which calendars play and for how long. */
export type TvLoopSettings = { showDay: boolean; daySeconds: number; showWeek: boolean; weekSeconds: number };
/** How the board looks: its mode, and the QR code (`qrUrl` empty = the address the TV itself opened). */
export type TvLookSettings = { mode: TvMode; qrShow: boolean; qrUrl: string; qrLabel: string; qrPosition: TvQrPosition };
export type TvSettings = TvLoopSettings & TvLookSettings;
export const TV_DEFAULT_LOOK: TvLookSettings = { mode: "dark", qrShow: false, qrUrl: "", qrLabel: "", qrPosition: "kanan-bawah" };
/**
 * `days` is the week of `date`, Monday to Sunday. `now` is the server's clock, so a TV whose own
 * clock is wrong still draws "now" in the right place.
 */
export type TvFeed = {
  now: string; date: string; days: TvDay[]; slides: TvSlide[]; settings: TvSettings;
  /** The WAM theme picked in Admin WAM → Tema aplikasi; the board paints with its colours. */
  look: WamLook;
  /**
   * Which build of the site answered. A TV stays open for weeks: when this is no longer the build
   * its page came from, the page loads itself afresh, so a new version reaches every TV by itself.
   */
  version?: string;
};

/** How long a TV waits before loading itself afresh again, so two builds answering in turn (a deploy in progress) cannot make it flicker. */
export const TV_RELOAD_EVERY_MS = 3 * 60_000;
/** Whether a TV should load its page afresh: the site answers from another build than the page's, and it has not just done so. */
export function shouldReload(pageVersion: string | undefined, feedVersion: string | undefined, lastReloadAt: number | null, now: number): boolean {
  if (!pageVersion || !feedVersion || pageVersion === feedVersion) return false;
  return lastReloadAt == null || now - lastReloadAt >= TV_RELOAD_EVERY_MS;
}

export const TV_DEFAULT_SETTINGS: TvSettings = { showDay: true, daySeconds: 20, showWeek: true, weekSeconds: 20, ...TV_DEFAULT_LOOK };
export const tvLimits = {
  screens: 10, slides: 30,
  /** A picture as stored: made in the browser as WebP, longest side 2560 px. */
  imageBytes: 4 * 1024 * 1024, imageEdge: 2560,
  minSeconds: 3, maxSeconds: 120, minScheduleSeconds: 5,
} as const;

export const tvImageTypes = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" } as const;
export type TvImageMime = keyof typeof tvImageTypes;
export const TV_IMAGE_PREFIX = "pra-wam/tv/";
export const tvImageKey = (id: string, mime: TvImageMime) => `${TV_IMAGE_PREFIX}${id}.${tvImageTypes[mime]}`;

const seconds = z.number().int().min(tvLimits.minSeconds, `Paling singkat ${tvLimits.minSeconds} detik.`).max(tvLimits.maxSeconds, `Paling lama ${tvLimits.maxSeconds} detik.`);
const scheduleSeconds = z.number().int().min(tvLimits.minScheduleSeconds, `Paling singkat ${tvLimits.minScheduleSeconds} detik.`).max(tvLimits.maxSeconds, `Paling lama ${tvLimits.maxSeconds} detik.`);
const title = z.string().trim().max(80, "Nama gambar paling panjang 80 karakter.");
/*
 * A TV's address is /tv/{slug}, short and picked by the admin: "lobi", "pantry-lantai-2". Lower
 * case letters, digits and single dashes, so it is easy to type on a TV remote. It is not a
 * secret: whoever knows or guesses it sees the board (the owner's decision, 10 Nov 2026).
 */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const tvSlugLimits = { min: 2, max: 40 } as const;
/** Not for a TV: /api/tv/image/… is where the one address for every TV (/tv) gets its pictures. */
const RESERVED_SLUGS: readonly string[] = ["image"];
export const looksLikeTvSlug = (value: unknown): value is string =>
  typeof value === "string" && value.length >= tvSlugLimits.min && value.length <= tvSlugLimits.max && SLUG_PATTERN.test(value) && !RESERVED_SLUGS.includes(value);
/** A name as an address: "Lobi Utama" → "lobi-utama", "Pantry (Lt. 2)" → "pantry-lt-2". May be too short to use ("" for "!!"). */
export const suggestSlug = (name: string) =>
  name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, tvSlugLimits.max).replace(/-+$/, "");
const screenName = z.string().trim().min(2, "Isi nama TV, misalnya Lobi.").max(60, "Nama TV paling panjang 60 karakter.");
const screenSlug = z.string().trim().toLowerCase()
  .min(tvSlugLimits.min, "Alamat paling pendek 2 karakter.").max(tvSlugLimits.max, "Alamat paling panjang 40 karakter.")
  .regex(SLUG_PATTERN, "Alamat hanya huruf kecil, angka, dan tanda hubung, misalnya lobi atau pantry-2.")
  .refine(value => !RESERVED_SLUGS.includes(value), "Alamat ini dipakai sistem. Pilih alamat lain.");
export const tvScreenSchema = z.object({ name: screenName, slug: screenSlug });
export const tvScreenPatchSchema = z.object({ name: screenName.optional(), slug: screenSlug.optional() })
  .refine(value => value.name !== undefined || value.slug !== undefined, { message: "Tidak ada yang diubah." });
/** A web address a phone can open, for the QR code; "" means the TV's own address. */
const isWebAddress = (value: string) => { try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } };
export const tvSettingsSchema = z.object({
  showDay: z.boolean(), daySeconds: scheduleSeconds, showWeek: z.boolean(), weekSeconds: scheduleSeconds,
  mode: z.enum(tvModes), qrShow: z.boolean(),
  qrUrl: z.string().trim().max(500, "Alamat QR paling panjang 500 karakter.").refine(value => value === "" || isWebAddress(value), "Isi alamat lengkap yang diawali https://, atau kosongkan untuk alamat TV ini."),
  qrLabel: z.string().trim().max(60, "Keterangan QR paling panjang 60 karakter."),
  qrPosition: z.enum(tvQrPositions),
});
export const tvSlideStartSchema = z.object({
  mime: z.enum(Object.keys(tvImageTypes) as [TvImageMime, ...TvImageMime[]], { message: "Pilih gambar WebP, PNG, atau JPG." }),
  size: z.number().int().min(1).max(tvLimits.imageBytes, "Gambar lebih dari 4 MB."),
});
export type TvSlideStart = z.infer<typeof tvSlideStartSchema>;
export const tvSlideConfirmSchema = tvSlideStartSchema.extend({ key: z.string().min(1).max(200), token: z.string().min(1).max(200), title: title.default("") });
export const tvSlidePatchSchema = z.object({ title: title.optional(), seconds: seconds.optional(), active: z.boolean().optional() })
  .refine(value => Object.values(value).some(item => item !== undefined), { message: "Tidak ada yang diubah." });
export const tvOrderSchema = z.object({ ids: z.array(z.uuid()).min(1).max(tvLimits.slides) });

/* ---- Dates ------------------------------------------------------------------------------------- */

const atNoon = (date: string) => new Date(`${date}T12:00:00Z`);
const shift = (date: string, days: number) => { const day = atNoon(date); day.setUTCDate(day.getUTCDate() + days); return day.toISOString().slice(0, 10); };
const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { ...options, timeZone: "UTC" });
const longDate = format({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
const weekdayName = format({ weekday: "long" });
const dayMonth = format({ day: "numeric", month: "short" });
const dayMonthYear = format({ day: "numeric", month: "long", year: "numeric" });

/** The week a date is in, Monday first: seven dates. */
export function weekOf(date: string): string[] {
  const monday = shift(date, -((atNoon(date).getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => shift(monday, index));
}
/** "Selasa, 10 November 2026". */
export const tvDateLabel = (date: string) => longDate.format(atNoon(date));
/** A day's column head: "Selasa" and "10 Nov". */
export const tvDayHead = (date: string) => ({ name: weekdayName.format(atNoon(date)), day: dayMonth.format(atNoon(date)) });
/** "9 Nov – 13 November 2026", the week on show. */
export const tvWeekLabel = (dates: readonly string[]) => dates.length ? `${dayMonth.format(atNoon(dates[0]))} – ${dayMonthYear.format(atNoon(dates[dates.length - 1]))}` : "";

/** The days the week calendar draws: Monday to Friday, and a weekend day only when a room is used on it. */
export const shownDays = (days: readonly TvDay[]): TvDay[] => days.filter((day, index) => index < 5 || day.rooms.length > 0);

/* ---- Entries ----------------------------------------------------------------------------------- */

export type TvState = "selesai" | "berlangsung" | "nanti";
export const entryState = (entry: Pick<TvEntry, "startsAt" | "endsAt">, now: number): TvState =>
  Date.parse(entry.endsAt) <= now ? "selesai" : Date.parse(entry.startsAt) <= now ? "berlangsung" : "nanti";

export type TvDayEntry = TvEntry & { room: string };
/** A day's entries as one list for its column, by start time, each with its room's name. */
export function dayEntries(day: TvDay): TvDayEntry[] {
  return day.rooms.flatMap(room => room.entries.map(entry => ({ ...entry, room: room.name })))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.room.localeCompare(b.room));
}

/* ---- The legend: one colour per activity --------------------------------------------------------- */

/*
 * As the app's Timeline does for forums: each activity has its own colour, shown as a dot beside
 * its name in a legend, and its blocks in the calendars are tinted with it. So a block needs no
 * title (only its hours), and nothing is cut short however narrow the block is.
 */
/** How many colours the board cycles through (tv.module.css, .c0 to .c8; the Timeline's own nine). */
export const TV_COLORS = 9;
/**
 * `code` is the activity's number in the legend (1, 2, 3…), written on its dot and on its blocks: a TV
 * may show two colours almost alike, and a number still tells them apart. It never repeats;
 * the colour does, past TV_COLORS.
 */
export type TvLegendItem = { title: string; color: number; code: number };
/** Two spellings of one activity ("Appraisal 1-on-1", "appraisal  1-on-1 ") are the same activity. */
export const activityKey = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The week's activities, each with its colour, in the order they first start. The colour is fixed
 * for the week, so an activity is the same colour on the day calendar and on the week's.
 */
export function tvLegend(days: readonly TvDay[]): TvLegendItem[] {
  const entries = days.flatMap(day => day.rooms.flatMap(room => room.entries))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || activityKey(a.title).localeCompare(activityKey(b.title)));
  const seen = new Map<string, TvLegendItem>();
  for (const entry of entries) {
    const key = activityKey(entry.title);
    if (!seen.has(key)) seen.set(key, { title: entry.title.trim().replace(/\s+/g, " "), color: seen.size % TV_COLORS, code: seen.size + 1 });
  }
  return [...seen.values()];
}
/** An activity's place in a legend: its colour and number (the first colour and no number when it is somehow not there). */
export const legendItem = (legend: readonly TvLegendItem[], title: string): { color: number; code: number | null } =>
  legend.find(item => activityKey(item.title) === activityKey(title)) ?? { color: 0, code: null };
/** The legend's items that some entry of these rooms uses, in the legend's order. */
export function legendFor(legend: readonly TvLegendItem[], rooms: readonly TvRoom[]): TvLegendItem[] {
  const used = new Set(rooms.flatMap(room => room.entries.map(entry => activityKey(entry.title))));
  return legend.filter(item => used.has(activityKey(item.title)));
}

/** What the legend's layout is measured in, in units: a letter's width, a chip's dot and padding, the gap between chips, a row's height. */
export const tvLegendUnits = { letter: 1.22, chip: 6.4, gap: 2.6, row: 4.8 } as const;
/**
 * The legend laid out in rows that fit `width` units, at most `most` rows; what does not fit is
 * counted in `more` ("+3 lainnya"), never squeezed. A name longer than a row is cut to the row.
 */
export function legendRows(items: readonly TvLegendItem[], width: number, most = 3): { rows: TvLegendItem[][]; more: number } {
  const rows: TvLegendItem[][] = [];
  let used = 0;
  for (const [index, item] of items.entries()) {
    const size = Math.min(width, item.title.length * tvLegendUnits.letter + tvLegendUnits.chip);
    if (!rows.length || used + tvLegendUnits.gap + size > width) {
      if (rows.length === most) return { rows, more: items.length - index };
      rows.push([]); used = 0;
    }
    used += (rows[rows.length - 1].length ? tvLegendUnits.gap : 0) + size;
    rows[rows.length - 1].push(item);
  }
  return { rows, more: 0 };
}

/* ---- The day calendar's hours ------------------------------------------------------------------- */

/** "10:30" → 10.5. */
export const decimalHour = (time: string) => Number(time.slice(0, 2)) + Number(time.slice(3, 5)) / 60;
export type TvSpan = { from: number; to: number };
/** The hours the day calendar spans: 08–18, widened to whole hours around anything outside it. */
export function hourSpan(rooms: readonly TvRoom[], from = 8, to = 18): TvSpan {
  const entries = rooms.flatMap(room => room.entries);
  if (!entries.length) return { from, to };
  return {
    from: Math.max(0, Math.min(from, Math.floor(Math.min(...entries.map(entry => decimalHour(entry.start)))))),
    to: Math.min(24, Math.max(to, Math.ceil(Math.max(...entries.map(entry => decimalHour(entry.end)))))),
  };
}
/** Where an entry sits along the hours, in per cent of the span: where it starts and how long it is. */
export function place(entry: Pick<TvEntry, "start" | "end">, span: TvSpan): { at: number; size: number } {
  const length = Math.max(1, span.to - span.from);
  const start = Math.max(span.from, Math.min(span.to, decimalHour(entry.start)));
  const end = Math.max(start, Math.min(span.to, decimalHour(entry.end)));
  return { at: ((start - span.from) / length) * 100, size: ((end - start) / length) * 100 };
}
/** Where "now" sits along the hours in per cent, or null outside them. */
export function nowAt(time: string, span: TvSpan): number | null {
  const hour = decimalHour(time);
  return hour < span.from || hour > span.to ? null : ((hour - span.from) / Math.max(1, span.to - span.from)) * 100;
}

/* ---- Fitting a calendar to a screen ------------------------------------------------------------- */

/*
 * The board is drawn in units of 1 % of the screen's shorter side (CSS: 1vmin). A calendar never
 * scrolls or pages: the room it has is shared by however many rows the day or the week needs.
 */
export type TvScreen = { wide: boolean; width: number; height: number };
/** The screen in units: a landscape TV is 100 tall and about 178 wide, a portrait one the other way round. */
export function tvScreen(width: number, height: number): TvScreen {
  const unit = Math.max(1, Math.min(width, height)) / 100;
  return { wide: width >= height, width: width / unit, height: height / unit };
}
/** The size of one of `count` equal rows sharing `available` units, never more than `most` (few rows stay a sensible size). */
export const fit = (available: number, count: number, most: number) => Math.min(most, available / Math.max(1, count));
/** Text for a row of `unit` units: a share of it, kept between the smallest size still readable on a TV and `most`. */
export const fitText = (unit: number, share: number, most: number, least = 1.25) => Math.max(least, Math.min(most, unit * share));

/* ---- The loop ---------------------------------------------------------------------------------- */

export type TvItem =
  | { key: string; kind: "hari"; seconds: number }
  | { key: string; kind: "minggu"; seconds: number }
  | { key: string; kind: "gambar"; slide: TvSlide; seconds: number };

/**
 * How many things the loop plays: with one (or none) nothing ever changes on screen, so a
 * duration means nothing and the admin page does not ask for one.
 */
export const loopCount = (settings: TvLoopSettings, activeSlides: number) => Number(settings.showDay) + Number(settings.showWeek) + activeSlides;

/** What plays, in order: today's calendar, the week's, then the pictures. Empty when both calendars are off and there is no picture. */
export function playlist(settings: TvLoopSettings, slides: readonly TvSlide[]): TvItem[] {
  return [
    ...(settings.showDay ? [{ key: "hari", kind: "hari" as const, seconds: settings.daySeconds }] : []),
    ...(settings.showWeek ? [{ key: "minggu", kind: "minggu" as const, seconds: settings.weekSeconds }] : []),
    ...slides.map(slide => ({ key: `gambar-${slide.id}`, kind: "gambar" as const, slide, seconds: slide.seconds })),
  ];
}

/** A picture close to the screen's shape fills it (a sliver is cropped); any other is shown whole. */
export function imageFit(imageWidth: number, imageHeight: number, screenWidth: number, screenHeight: number): "cover" | "contain" {
  if (!imageWidth || !imageHeight || !screenWidth || !screenHeight) return "contain";
  const screen = screenWidth / screenHeight;
  return Math.abs(imageWidth / imageHeight - screen) / screen <= 0.12 ? "cover" : "contain";
}

/** Milliseconds until the next 03.00 WIB (20.00 UTC), when a TV loads the page afresh. */
export function msUntilReload(now: Date): number {
  const next = new Date(now);
  next.setUTCHours(20, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

/** "2 menit lalu", "3 jam lalu", "5 hari lalu", for when a TV last asked for content. */
export function agoLabel(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} jam lalu`;
  return `${Math.round(minutes / (60 * 24))} hari lalu`;
}
/** A TV counts as on while it asked for content in the last two minutes (it asks every 10 seconds). */
export const tvIsOn = (lastSeenAt: string | null, now: number) => !!lastSeenAt && now - Date.parse(lastSeenAt) < 2 * 60_000;
