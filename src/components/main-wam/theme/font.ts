import { Barlow_Condensed, Plus_Jakarta_Sans } from "next/font/google";

/*
 * Main WAM's type (prototipe final): Barlow Condensed for display (titles, numbers, the small
 * letter-spaced capitals that label things) and Plus Jakarta Sans for everything you read. Both are
 * served from this site by next/font (no request to Google from the browser, fallback metrics
 * adjusted so text does not jump when it loads). Same approach as Wellbeing
 * (src/components/wellbeing/font.ts); theme.module.css reads --mw-font-jakarta and --mw-font-barlow.
 * Tests mock this module: next/font only runs inside Next's compiler.
 */
export const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--mw-font-jakarta", display: "swap" });
export const barlow = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--mw-font-barlow", display: "swap" });

/** Class names to put on the theme root so the font variables exist under it. */
export const mainWamFontVars = `${jakarta.variable} ${barlow.variable}`;
