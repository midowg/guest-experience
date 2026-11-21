import { Barlow_Condensed } from "next/font/google";

/*
 * The display face of Splash and Masuk (final prototype): Barlow Condensed, bold and heavy, served
 * from this site by next/font. Put its class on the page that draws them (masuk/page.tsx), not on the
 * theme root, so no other screen loads it; masuk.module.css reads --lg-font-display. Tests do not
 * import this file (next/font only runs inside Next's compiler); the components do not either.
 */
export const barlow = Barlow_Condensed({ subsets: ["latin"], weight: ["700", "800"], variable: "--lg-font-display", display: "swap" });
