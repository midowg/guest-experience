import { zoneTime, type ViewerZone } from "@/lib/pra-wam/zone";

/*
 * WG People's language (21 Nov 2026, the owner's ask): English by default, Bahasa Indonesia when the
 * person picks it in Profile → Settings → Language. Kept in a cookie (wg_bahasa), read by the server so
 * the first screen is drawn in the right language. Admin HR stays in Indonesian. Pure: the formats
 * that differ by language (dates, clock times, durations, distances).
 */

export const LANGS = ["en", "id"] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_COOKIE = "wg_bahasa";
/** Anything but "id" is English, the default. */
export const asLang = (value: unknown): Lang => (value === "id" ? "id" : "en");
/** Each language in its own words, for the switch. */
export const langNames: Record<Lang, string> = { en: "English", id: "Indonesia" };
export const locales: Record<Lang, string> = { en: "en-GB", id: "id-ID" };

/** A calendar date ("2026-11-20") in words, the same anywhere in the world. */
export const sayDate = (lang: Lang, date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locales[lang], { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/** A clock time written the local way: "08:52" in English, "08.52" in Indonesian. */
export const hhmm = (lang: Lang, value: string) => (lang === "id" ? value.replace(":", ".") : value.replace(".", ":"));
/** An instant's clock time in a zone, the local way. */
export const clockAt = (lang: Lang, iso: string, zone: ViewerZone) => hhmm(lang, zoneTime(iso, zone));
