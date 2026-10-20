"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { defaultLang, offersSwitch, t as translate, type EventLanguage, type Lang, type WordKey, type WordVars } from "@/lib/wording";
import styles from "./guest.module.css";

const STORAGE_KEY = "wk_lang";

type Wording = {
  lang: Lang;
  t: (key: WordKey, vars?: WordVars) => string;
  date: (iso: string, timeZone: string) => string;
  time: (iso: string, timeZone: string) => string;
  dateTime: (iso: string, timeZone: string) => string;
};
const wordingFor = (lang: Lang): Wording => ({
  lang,
  t: (key, vars) => translate(lang, key, vars),
  date: (iso, tz) => formatDate(iso, tz, lang),
  time: (iso, tz) => formatTime(iso, tz, lang),
  dateTime: (iso, tz) => formatDateTime(iso, tz, lang),
});
// Outside a provider (e.g. the admin's hero preview) everything reads in Indonesian.
const WordingContext = createContext<Wording>(wordingFor("id"));

export function useWording() { return useContext(WordingContext); }

/**
 * The guest's language for one event. With both languages offered, the last choice is kept in
 * this browser; the first render always uses the event's default so server and client agree.
 */
export function useEventLanguage(language: EventLanguage | undefined) {
  const [lang, setLangState] = useState<Lang>(defaultLang(language));
  useEffect(() => {
    if (!offersSwitch(language)) return;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      // Restoring a saved preference after hydration; the server cannot know it.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "id" || saved === "en") setLangState(saved);
    } catch { /* storage blocked: keep the default */ }
  }, [language]);
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* storage blocked */ }
  }, []);
  return [lang, setLang] as const;
}

export function WordingProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(() => wordingFor(lang), [lang]);
  return <WordingContext.Provider value={value}>{children}</WordingContext.Provider>;
}

export function LanguageSwitch({ lang, onChange }: { lang: Lang; onChange: (lang: Lang) => void }) {
  const { t } = useWording();
  return <div className={styles.langSwitch} role="group" aria-label={t("lang.label")}>
    {(["id", "en"] as const).map(option => <button key={option} type="button" lang={option} aria-pressed={lang === option} onClick={() => onChange(option)}>
      {option.toUpperCase()}<span className="sr-only">{option === "id" ? " — Bahasa Indonesia" : " — English"}</span>
    </button>)}
  </div>;
}
