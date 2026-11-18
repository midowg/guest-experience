import { en } from "./en";
import { id, type MessageKey } from "./id";
import { DEFAULT_LANG, type Lang } from "./types";

/*
 * t(lang, key, vars): the one way Main WAM's screens say a fixed text. A text is `{name}` for a
 * value and, for counts, `{n, plural, one {# photo} other {# photos}}` (`#` = the number; `one` is
 * used for 1, `other` for everything else; Indonesian texts just say `{n} foto`). Pure, no
 * dependencies: the dictionaries are plain objects (id.ts is the source, en.ts the translation, a
 * test keeps them the same).
 */

export type Vars = Record<string, string | number>;

const DICTIONARIES: Record<Lang, Record<MessageKey, string>> = { id, en };

const PLURAL = /\{(\w+),\s*plural,\s*one\s*\{([^{}]*)\}\s*other\s*\{([^{}]*)\}\s*\}/g;
const SLOT = /\{(\w+)\}/g;

/** Fills a text's slots. A slot without a value stays as written (a missing value is visible, not silent). */
export function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text
    .replace(PLURAL, (whole, name: string, one: string, other: string) => {
      const value = vars[name];
      if (value === undefined) return whole;
      return (Number(value) === 1 ? one : other).replaceAll("#", String(value));
    })
    .replace(SLOT, (whole, name: string) => (vars[name] === undefined ? whole : String(vars[name])));
}

/** The text of a key in a language (the Indonesian one if the English lacks it), slots filled. */
export function t(lang: Lang, key: MessageKey, vars?: Vars): string {
  const text = DICTIONARIES[lang]?.[key] || DICTIONARIES[DEFAULT_LANG][key] || key;
  return fill(text, vars);
}

/** `t` bound to a language: what a screen holds on to (`const tr = translator(lang)`). */
export type Translate = (key: MessageKey, vars?: Vars) => string;
export const translator = (lang: Lang): Translate => (key, vars) => t(lang, key, vars);

/** Every variable a text uses (for the tests that keep Indonesian and English the same). */
export function variablesOf(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(PLURAL)) names.add(match[1]);
  for (const match of text.replace(PLURAL, "").matchAll(SLOT)) names.add(match[1]);
  return [...names].sort();
}

export const dictionaries = DICTIONARIES;

/* ── Words that arrive in Indonesian ───────────────────────────────────────────────────────────── */

let reverse: Map<string, MessageKey> | null = null;

/**
 * A text the server (or a library shared with Pra WAM) wrote in Indonesian, said in `lang`: when it
 * is exactly one of the dictionary's Indonesian texts (without variables), its translation; any
 * other text comes back as it is. This is how a failed request's message ("Fitur ini menunggu
 * pembaruan sistem...") follows the language without every route handler knowing it: put the
 * server's exact text in the dictionary (any key; `err.*` or the area's `srv.*`) and it is found.
 */
export function translateKnown(lang: Lang, text: string): string {
  if (lang === DEFAULT_LANG || !text) return text;
  if (!reverse) {
    reverse = new Map();
    for (const [key, value] of Object.entries(id) as [MessageKey, string][]) if (!reverse.has(value)) reverse.set(value, key);
  }
  const key = reverse.get(text);
  return key ? t(lang, key) : text;
}
