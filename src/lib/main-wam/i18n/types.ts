/*
 * Main WAM's languages (docs/main-wam/KONTRAK.md §i18n). Indonesian is the default and the source of
 * every text; English is a translation of it. Kept apart from the dictionaries so a file that only
 * needs to know "which language" does not load them. Pure.
 */

export const LANGS = ["id", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "id";

/** The cookie that remembers the language on this device (written by the browser, read by the server). */
export const LANG_COOKIE = "mw_lang";
/** One year, in seconds. */
export const LANG_MAX_AGE = 31_536_000;

/** What each language calls itself (never translated: a person must find their own language). */
export const LANG_NAMES: Record<Lang, string> = { id: "Indonesia", en: "English" };

export const isLang = (value: unknown): value is Lang => typeof value === "string" && (LANGS as readonly string[]).includes(value);

/** Any stored or asked value to a language; anything unknown is the default (Indonesian). */
export const parseLang = (value: unknown): Lang => (isLang(value) ? value : DEFAULT_LANG);

/** The BCP 47 tag for the `lang` attribute and for Intl. */
export const htmlLang = (lang: Lang): string => (lang === "en" ? "en" : "id");
