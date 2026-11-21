"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { copies, type Copy } from "@/lib/hr/copy";
import { LANG_COOKIE, type Lang } from "@/lib/hr/lang";
import { errorText } from "@/components/pra-wam/api";

/*
 * WG People's language on this device (21 Nov 2026): English unless the person picked Indonesia.
 * The server reads the cookie for the first screen; switching here changes every word at once, with
 * no reload, and is remembered for the next visit. Without a provider (tests of one screen) it is
 * English, the default.
 */

type LangValue = { lang: Lang; t: Copy; setLang(next: Lang): void };
const LangContext = createContext<LangValue>({ lang: "en", t: copies.en, setLang: () => undefined });

export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setShown] = useState<Lang>(initial);
  const setLang = useCallback((next: Lang) => {
    setShown(next);
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.getElementById("wg-tema")?.setAttribute("lang", next);
  }, []);
  const value = useMemo(() => ({ lang, t: copies[lang], setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

/** The words in the person's language, the language, and the switch. */
export const useCopy = () => useContext(LangContext);

/** A failed request's message, in the person's language. */
export const problemText = (t: Copy, error: unknown) => t.server(errorText(error));
