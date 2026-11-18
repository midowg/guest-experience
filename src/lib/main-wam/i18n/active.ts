import { DEFAULT_LANG, type Lang } from "./types";

/*
 * The language of the screen in this browser, for the plain functions that cannot call a hook (a
 * request helper's failure words, a queue that reports from a timer). LangProvider sets it; on the
 * server it stays Indonesian and nothing reads it there (the server asks readLang()).
 */
let active: Lang = DEFAULT_LANG;
export const activeLang = (): Lang => active;
export const setActiveLang = (lang: Lang): void => { active = lang; };
