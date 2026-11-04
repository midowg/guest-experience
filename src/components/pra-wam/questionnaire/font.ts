import { Bowlby_One_SC, Sofia_Sans } from "next/font/google";

/** The questionnaire's sticker look, as in the mockup: Bowlby One SC for display, Sofia Sans for text, served from this site. */
export const display = Bowlby_One_SC({ subsets: ["latin"], weight: "400", variable: "--cq-display", display: "swap" });
export const body = Sofia_Sans({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--cq-body", display: "swap" });
