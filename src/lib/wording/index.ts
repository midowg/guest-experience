import { en, id, type WordKey } from "./dictionary";

export type { WordKey };
export type Lang = "id" | "en";
/** How an event offers languages: Indonesian only, English only, or both with a switch. */
export type EventLanguage = "id" | "en" | "id_en";
export const eventLanguages: EventLanguage[] = ["id", "en", "id_en"];
export type WordVars = Record<string, string | number>;

export const langLocales: Record<Lang, string> = { id: "id-ID", en: "en-GB" };

/** Fills {name}-style variables. A missing English text falls back to the Indonesian one. */
export function t(lang: Lang, key: WordKey, vars: WordVars = {}): string {
  const text = (lang === "en" && en[key]) || id[key];
  // Types rule this out; a stale or hand-edited dictionary must still not break the page.
  if (text === undefined) {
    if (process.env.NODE_ENV !== "production") console.warn(`wording: kunci "${key}" tidak ada di kamus.`);
    return key;
  }
  return text.replace(/\{(\w+)\}/g, (match, name: string) => name in vars ? String(vars[name]) : match);
}

export function defaultLang(language: EventLanguage | undefined): Lang {
  return language === "en" ? "en" : "id";
}
export function offersSwitch(language: EventLanguage | undefined) {
  return language === "id_en";
}
