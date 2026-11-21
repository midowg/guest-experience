import type { SVGProps } from "react";

/**
 * WG People's mark (21 Nov 2026): a person with both arms up, drawn as a W, with a round head. The
 * same drawing as the app icon (public/hr/icon-*.png). The W takes the colour of the text around
 * it; `head` gives the head its own colour (cream on pine, as in the icon), else a lighter W colour.
 */
export function WgMark({ size = 24, head, ...rest }: { size?: number | string; head?: string } & SVGProps<SVGSVGElement>) {
  return <svg viewBox="96 120 320 270" width={size} height={size} fill="none" {...rest}>
    <path d="M128 214 L184 350 L226 248 L256 312 L286 248 L328 350 L384 214" stroke="currentColor" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="256" cy="170" r="32" fill={head ?? "currentColor"} opacity={head ? 1 : .78} />
  </svg>;
}
