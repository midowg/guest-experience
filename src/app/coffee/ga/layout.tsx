import type { Viewport } from "next";
import type { ReactNode } from "react";

/**
 * Mode GA (/coffee/ga): the office tablet, lying down or standing up. It sits under Werkudara
 * Coffee's own layout (theme, manifest), outside the phone frame of the employee app, with a
 * viewport of its own: the top bar's surface colour reaches under the status bar.
 */
/** `interactiveWidget`: the page shrinks when the on-screen keyboard comes up, so a list of names under a search field stays in view (audit F3-07). */
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FFFDF9", colorScheme: "light", viewportFit: "cover", interactiveWidget: "resizes-content" };

export default function CoffeeGaLayout({ children }: { children: ReactNode }) {
  return children;
}
