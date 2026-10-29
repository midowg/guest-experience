import { EB_Garamond, Jost } from "next/font/google";

/** Body text of Panduan lokasi: EB Garamond, a book face that stays legible small, served from this site. */
export const garamond = EB_Garamond({ subsets: ["latin"], weight: ["400", "500"], style: ["normal", "italic"], variable: "--font-garamond", display: "swap" });

/**
 * The "Resort" theme reads in Jost, a clean geometric sans. Its titles use Cormorant Garamond, which
 * the site already loads (src/app/layout.tsx, @fontsource); next/font's copy of it breaks the
 * Turbopack build ("next/font/google queries have exactly one entry").
 */
export const jost = Jost({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jost", display: "swap" });
