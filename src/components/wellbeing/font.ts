import { Barlow_Condensed, Plus_Jakarta_Sans } from "next/font/google";

/*
 * Wellbeing's type (18 Nov 2026), served from this site: Plus Jakarta Sans for text (the house
 * default, brain/aturan/desain-ui.md), Barlow Condensed for the race numbers (places, points), the
 * scoreboard face of sports apps. wellbeing.module.css reads them as --wb-sans and --wb-num.
 */
export const sans = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--wb-sans", display: "swap" });
export const numbers = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--wb-num", display: "swap" });
export const fontVars = `${sans.variable} ${numbers.variable}`;
