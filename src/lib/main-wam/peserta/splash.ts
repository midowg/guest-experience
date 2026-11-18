import { monthName, type Lang } from "../i18n";

/*
 * O01 Splash (prototipe/layar/O01.html): the opening screen before Masuk (mode semua): the event's
 * colour (or Admin WAM's splash image), "WAM 2026", "Werkudara Annual Meeting 2026" and the dates.
 * Brief: it never holds sign-in up. Pure.
 */

/** sessionStorage key: the splash was shown in this browser session (a reload or a later visit to Masuk skips it). */
export const SPLASH_KEY = "mw-splash-v1";
/** The splash stays at least this long after the page started loading, so it is seen, not flashed. */
export const SPLASH_MIN_MS = 700;
/** And never longer than this (the CSS ends it at this time too, also without JavaScript). */
export const SPLASH_MAX_MS = 1_200;

/** How much longer the splash stays, `sinceLoad` ms after the page started loading (performance.now()). */
export function splashWait(sinceLoad: number): number {
  const since = Number.isFinite(sinceLoad) ? Math.max(sinceLoad, 0) : SPLASH_MAX_MS;
  return Math.min(Math.max(SPLASH_MIN_MS - since, 0), SPLASH_MAX_MS);
}

const parts = (date: string, lang: Lang) => {
  const parsed = new Date(`${date}T12:00:00Z`);
  return { day: parsed.getUTCDate(), month: monthName(lang, date), year: parsed.getUTCFullYear() };
};

/** "4–7 Januari 2027"; across months "30 Desember–2 Januari 2027"; across years with both years. "" without valid dates. */
export function eventDateRange(start: string, end: string, lang: Lang = "id"): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return "";
  const a = parts(start, lang), b = parts(end, lang);
  if (start === end) return `${a.day} ${a.month} ${a.year}`;
  if (a.year !== b.year) return `${a.day} ${a.month} ${a.year}–${b.day} ${b.month} ${b.year}`;
  if (a.month !== b.month) return `${a.day} ${a.month}–${b.day} ${b.month} ${b.year}`;
  return `${a.day}–${b.day} ${b.month} ${b.year}`;
}

/** The line under the name: "WAM 2026" → "Werkudara Annual Meeting 2026"; nothing for another name. */
export function splashSubtitle(name: string): string | null {
  const year = /^WAM\s+(\d{4})$/i.exec(name.trim())?.[1];
  return year ? `Werkudara Annual Meeting ${year}` : null;
}
