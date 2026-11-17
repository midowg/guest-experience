import { Plus_Jakarta_Sans } from "next/font/google";

/*
 * Main WAM's type (DESIGN_SYSTEM.md §2): Plus Jakarta Sans, served from this site by next/font (no
 * request to Google from the browser, fallback metrics adjusted so text does not jump when it
 * loads). The variable font covers the five weights the kit uses (400–800) in one file. Same
 * approach as Wellbeing (src/components/wellbeing/font.ts); theme.module.css reads --mw-font-jakarta.
 * Tests mock this module: next/font only runs inside Next's compiler.
 */
export const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--mw-font-jakarta", display: "swap" });

/** Class names to put on the theme root so the font variables exist under it. */
export const mainWamFontVars = jakarta.variable;
