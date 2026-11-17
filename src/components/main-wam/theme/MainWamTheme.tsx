import type { CSSProperties, ReactNode } from "react";
import { mainWamFontVars } from "./font";
import css from "./theme.module.css";
import { resolveTheme, themeVars, type DisplayFont, type MainWamThemeInput, type ResolvedTheme } from "./tokens";

export type MainWamMode = "light" | "dark" | "system";

/** A display face other than the default is written as a slot; the default needs nothing. */
const DISPLAY_FONT_VARS: Record<DisplayFont, string | null> = { "plus-jakarta-sans": null };

/*
 * The page behind the app (overscroll, the strip under the iPhone's home bar, the space beside the
 * column on a laptop) is the app's own colour from the first paint. Pra WAM's layout paints body
 * too (wamBodyStyle); `html body:has(…)` outranks it while Main WAM is on screen and stops applying
 * the moment it leaves, so it never leaks. Fixed values only: the background is not a theme slot.
 */
const PAGE_STYLE = "html body:has([data-main-wam]){background:#F6F7F9;color-scheme:light}"
  + "html body:has([data-main-wam][data-mw-mode=dark]){background:#0E1116;color-scheme:dark}"
  + "@media (prefers-color-scheme:dark){html body:has([data-main-wam][data-mw-mode=system]){background:#0E1116;color-scheme:dark}}"
  + "html body:has([data-mw-tone=dark]){background:#000}";

/**
 * Main WAM's theme root: every token (theme.module.css) and the font live under it, and the admin's
 * theme (colours, display face, KV images) is laid over the neutral default here, checked first
 * (tokens.ts). Server-safe (no hooks), so the layout renders it on the server and there is no flash.
 * Put it once around the shell; a preview may pass a theme of its own.
 */
export function MainWamTheme({ theme, mode = "light", children, className }: {
  /** From the theme reader (agen fondasi), or an already resolved theme. Missing = neutral. */
  theme?: MainWamThemeInput | ResolvedTheme | null;
  /** Light is the designed mode; dark tokens are prepared (DESIGN_SYSTEM §1.6). */
  mode?: MainWamMode;
  children: ReactNode;
  className?: string;
}) {
  const resolved = theme && "warnings" in theme && "colors" in theme ? theme as ResolvedTheme : resolveTheme(theme as MainWamThemeInput | null | undefined);
  if (process.env.NODE_ENV !== "production" && resolved.warnings.length > 0) {
    console.warn(`[Main WAM] tema: ${resolved.warnings.join("; ")}`);
  }
  const vars: Record<string, string> = themeVars(resolved);
  const fontVar = DISPLAY_FONT_VARS[resolved.displayFont];
  if (fontVar) vars["--mw-kv-display-font"] = `var(${fontVar})`;
  return <div data-main-wam="" data-mw-mode={mode} className={[css.root, mainWamFontVars, className].filter(Boolean).join(" ")} style={vars as CSSProperties}>
    <style>{PAGE_STYLE}</style>
    {children}
  </div>;
}
