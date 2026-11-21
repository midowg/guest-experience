import type { SVGProps } from "react";
import type { Lang } from "@/lib/main-wam/i18n";

/*
 * Small flags for the language choice (prototype Pengaturan): Indonesia (red over white) and the United
 * Kingdom for English. Plain SVG (24 × 16), decorative: the language is named in words beside it.
 * `data-flag` lets the segmented control size them (20 wide) instead of as a 16 px icon.
 */
type Props = SVGProps<SVGSVGElement>;

export function FlagId(props: Props) {
  return <svg viewBox="0 0 24 16" data-flag="" focusable="false" {...props}>
    <rect width="24" height="8" fill="#E70011" />
    <rect y="8" width="24" height="8" fill="#FFFFFF" />
    <rect width="24" height="16" fill="none" stroke="#000000" strokeOpacity="0.18" />
  </svg>;
}

export function FlagEn(props: Props) {
  return <svg viewBox="0 0 24 16" data-flag="" focusable="false" {...props}>
    <rect width="24" height="16" fill="#012169" />
    <path d="M0 0L24 16M24 0L0 16" stroke="#FFFFFF" strokeWidth="3.2" />
    <path d="M0 0L24 16M24 0L0 16" stroke="#C8102E" strokeWidth="1.2" />
    <path d="M12 0V16M0 8H24" stroke="#FFFFFF" strokeWidth="5" />
    <path d="M12 0V16M0 8H24" stroke="#C8102E" strokeWidth="3" />
  </svg>;
}

/** The flag of a language, as the element a Segmented option takes for `icon`. */
export const flagOf = (lang: Lang) => (lang === "en" ? <FlagEn /> : <FlagId />);
