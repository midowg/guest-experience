"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LANG, LANG_COOKIE, LANG_MAX_AGE, htmlLang, setActiveLang, translateKnown, translator, type Lang, type Translate } from "@/lib/main-wam/i18n";

/*
 * The language of the screen in front of the person (docs/main-wam/KIT.md, "Bahasa"): the server
 * reads the cookie (readLang) and gives it here once, at the top of Main WAM; every client component
 * under it reads it with useLang()/useT(). Choosing another language writes the cookie, changes the
 * labels at once, and asks the server for the screen again (router.refresh) so what the server wrote
 * (dates, the Sekarang card) follows. No provider (a test, a preview) = Indonesian.
 */

type Value = { lang: Lang; setLang: (lang: Lang) => void };

const LangContext = createContext<Value>({ lang: DEFAULT_LANG, setLang: () => undefined });

export function LangProvider({ lang: served, children }: { lang: Lang; children: ReactNode }) {
  const router = useRouter();
  // The language just chosen shows at once; once the server's own answer agrees (or changes by itself) it takes over.
  const [chosen, setChosen] = useState<{ base: Lang; lang: Lang } | null>(null);
  const lang = chosen && chosen.base === served ? chosen.lang : served;
  const setLang = useCallback((next: Lang) => {
    try {
      const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${LANG_COOKIE}=${next}; Path=/; Max-Age=${LANG_MAX_AGE}; SameSite=Lax${secure}`;
    } catch { /* cookies off: the choice lasts until the page is left */ }
    setChosen({ base: served, lang: next });
    router.refresh();
  }, [router, served]);
  useEffect(() => { setActiveLang(lang); }, [lang]);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  // display: contents keeps the wrapper out of the layout; `lang` is what screen readers and the browser's hyphenation read.
  return <LangContext.Provider value={value}><div lang={htmlLang(lang)} data-mw-lang={lang} style={{ display: "contents" }}>{children}</div></LangContext.Provider>;
}

/** The language, and the way to change it. */
export const useLang = (): Value => useContext(LangContext);

/** `t` for the current language: `const t = useT(); t("shell.skip")`. */
export function useT(): Translate {
  const { lang } = useLang();
  return useMemo(() => translator(lang), [lang]);
}

/** A text the server wrote in Indonesian, said in the current language when the dictionary knows it (translateKnown). */
export function useKnown(): (text: string) => string {
  const { lang } = useLang();
  return useCallback((text: string) => translateKnown(lang, text), [lang]);
}
