import type { Lang } from "./types";

/*
 * How each language writes the event's clock and calendar (always WIB; the caller passes a WIB date
 * or the "HH:mm" of one). Indonesian: "08.00", "Sel, 5 Jan", "Januari". English: "08:00", "Tue, 5 Jan",
 * "January". Pure.
 */

/** "08:00" (WIB, as wibTime gives it) in a language's way: "08.00" or "08:00". */
export const clock = (lang: Lang, time: string): string => (lang === "en" ? time : time.replace(":", "."));

const SHORT_DAY = { id: new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }), en: new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) };

function shortDayOf(lang: Lang, date: Date, zone: "UTC" | "Asia/Jakarta"): string {
  if (lang === "id") {
    const format = zone === "UTC" ? SHORT_DAY.id : new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: zone });
    return format.format(date).replace(/\./g, "");
  }
  const format = zone === "UTC" ? SHORT_DAY.en : new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: zone });
  const parts = Object.fromEntries(format.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.weekday}, ${parts.day} ${parts.month}`;
}

/** "Sel, 5 Jan" / "Tue, 5 Jan" for a WIB date ("2027-01-05"). */
export const shortDate = (lang: Lang, date: string): string => shortDayOf(lang, new Date(`${date}T12:00:00Z`), "UTC");

/** The same for an instant, read on the WIB calendar. */
export const shortDateOfInstant = (lang: Lang, now: Date): string => shortDayOf(lang, now, "Asia/Jakarta");

const MONTH_LONG = { id: new Intl.DateTimeFormat("id-ID", { month: "long", timeZone: "UTC" }), en: new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }) };

/** "Januari" / "January" of a WIB date. */
export const monthName = (lang: Lang, date: string): string => MONTH_LONG[lang].format(new Date(`${date}T12:00:00Z`));

/** "1.240" / "1,240" and "13,6" / "13.6". */
export const number = (lang: Lang, value: number, fractionDigits = 0): string =>
  new Intl.NumberFormat(lang === "en" ? "en-GB" : "id-ID", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(value);
