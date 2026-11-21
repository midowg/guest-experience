import type { CSSProperties, ReactNode } from "react";
import type { MainWamMode } from "@/lib/main-wam/appearance";
import { mainWamFontVars } from "./font";
import css from "./theme.module.css";
import { PAGE_COLORS, resolveTheme, themeVars, type DisplayFont, type MainWamThemeInput, type ResolvedTheme } from "./tokens";

export type { MainWamMode };

/** A display face other than the default is written as a slot; the default needs nothing. */
const DISPLAY_FONT_VARS: Record<DisplayFont, string | null> = { "plus-jakarta-sans": null };

/*
 * The page behind the app (overscroll, the strip under the iPhone's home bar, the space beside the
 * column on a laptop) is the app's own colour from the first paint. Pra WAM's layout paints body
 * too (wamBodyStyle); `html body:has(…)` outranks it while Main WAM is on screen and stops applying
 * the moment it leaves, so it never leaks. Fixed values only: the background is not a theme slot.
 * The page's own scrollbar is hidden while Main WAM is on screen too (the rule for every scrollbar in
 * the app, theme.module.css hides the inner ones): the screen still scrolls, by touch and wheel.
 */
const PAGE_STYLE = `html body:has([data-main-wam]){background:${PAGE_COLORS.light};color-scheme:light}`
  + `html body:has([data-main-wam][data-mw-mode=dark]){background:${PAGE_COLORS.dark};color-scheme:dark}`
  + `html:has([data-main-wam]){scrollbar-width:none}html:has([data-main-wam])::-webkit-scrollbar{display:none}`
  + `@media (prefers-color-scheme:dark){html body:has([data-main-wam][data-mw-mode=system]){background:${PAGE_COLORS.dark};color-scheme:dark}}`;

/**
 * Main WAM's theme root: every token (theme.module.css) and the font live under it, and the admin's
 * theme (colours, display face, KV images) is laid over the neutral default here, checked first
 * (tokens.ts). Server-safe (no hooks), so the layout renders it on the server and there is no flash.
 * Put it once around the shell; a preview may pass a theme of its own.
 */
export function MainWamTheme({ theme, mode = "light", reduceMotion = false, children, className }: {
  /** From the theme reader (agen fondasi), or an already resolved theme. Missing = neutral. */
  theme?: MainWamThemeInput | ResolvedTheme | null;
  /** Terang, Gelap or Sistem (the phone's own); the app reads the person's pick from a cookie (lib/main-wam/appearance.ts). */
  mode?: MainWamMode;
  /** "Kurangi gerak" from Pengaturan (a cookie): every animation and transition under the root is cut to nothing. */
  reduceMotion?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const resolved = theme && "warnings" in theme && "colors" in theme ? theme as ResolvedTheme : resolveTheme(theme as MainWamThemeInput | null | undefined);
  if (process.env.NODE_ENV !== "production" && resolved.warnings.length > 0) {
    console.warn(`[WAM 2026] tema: ${resolved.warnings.join("; ")}`);
  }
  const vars: Record<string, string> = themeVars(resolved);
  const fontVar = DISPLAY_FONT_VARS[resolved.displayFont];
  if (fontVar) vars["--mw-kv-display-font"] = `var(${fontVar})`;
  return <div data-main-wam="" data-mw-mode={mode} data-mw-reduce={reduceMotion ? "" : undefined} className={[css.root, mainWamFontVars, className].filter(Boolean).join(" ")} style={vars as CSSProperties}>
    <style>{PAGE_STYLE}</style>
    {children}
  </div>;
}
