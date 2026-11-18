import { clock, shortDate, t, type Lang } from "../i18n";
import { wibDate, wibTime } from "../rundown";

/*
 * The handbook's words for time (Bahasa Indonesia, WIB): "08.00", "Sel, 5 Jan", "Sel, 5 Jan · 08.00",
 * "20 menit lagi", "±7,5 jam". Every instant goes through fondasi's WIB helpers (rundown.ts), so a
 * phone in another time zone still reads the event's own clock. Pure.
 */

/** "08.00" (WIB). */
export const hhmm = (iso: string, lang: Lang = "id") => clock(lang, wibTime(iso));

/** "Sel, 5 Jan" for a WIB date ("2027-01-05"). */
export const dateLabel = (date: string, lang: Lang = "id") => shortDate(lang, date);

/** "Sel, 5 Jan" for an instant (its WIB date). */
export const dayOf = (iso: string, lang: Lang = "id") => dateLabel(wibDate(iso), lang);

/** "Sel, 5 Jan · 08.00". */
export const dayTime = (iso: string, lang: Lang = "id") => `${dayOf(iso, lang)} · ${hhmm(iso, lang)}`;

/**
 * How long until an instant, as the Sekarang card says it: "Sebentar lagi" (under a minute),
 * "20 menit lagi", "1 jam lagi", "1 jam 20 menit lagi"; another day: "Besok 06.00" or "Rab, 6 Jan · 06.00".
 * Null when it has passed.
 */
export function untilLabel(now: Date, iso: string, lang: Lang = "id"): string | null {
  const minutes = Math.ceil((Date.parse(iso) - now.getTime()) / 60_000);
  if (minutes <= 0) return null;
  const today = wibDate(now.toISOString()), day = wibDate(iso);
  if (day !== today) {
    const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    return day === tomorrow ? t(lang, "fmt.tomorrowAt", { time: hhmm(iso, lang) }) : dayTime(iso, lang);
  }
  if (minutes <= 1) return t(lang, "fmt.soon");
  if (minutes < 60) return t(lang, "fmt.inMinutes", { n: minutes });
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? t(lang, "fmt.inHoursMinutes", { h: hours, m: rest }) : t(lang, "fmt.inHours", { h: hours });
}

/** "±7,5 jam", "45 menit": a trip's length, to the half hour from an hour on. */
export function durationLabel(startIso: string, endIso: string, lang: Lang = "id"): string {
  const minutes = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000);
  if (minutes <= 0) return "";
  if (minutes < 60) return t(lang, "fmt.minutesApprox", { n: minutes });
  const halves = Math.round(minutes / 30) / 2;
  return t(lang, "fmt.hoursApprox", { n: lang === "en" ? String(halves) : String(halves).replace(".", ",") });
}

/** "3 orang". */
export const people = (count: number, lang: Lang = "id") => t(lang, "fmt.people", { n: count });
