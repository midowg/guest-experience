import type { Viewport } from "next";
import type { ReactNode } from "react";
import { WLM_BG } from "@/lib/wellbeing/brand";

/*
 * Every WLM page (19 Nov 2026): the status bar and the page behind the app in WLM's own background from
 * the first paint, light or dark as the device is (the app then follows the person's Tema), so neither
 * Journey's white nor its blue ever shows while WLM opens.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: WLM_BG.light },
    { media: "(prefers-color-scheme: dark)", color: WLM_BG.dark },
  ],
  viewportFit: "cover",
};

const bodyStyle = `body{background:${WLM_BG.light}}@media (prefers-color-scheme:dark){body{background:${WLM_BG.dark}}}`;

export default function WlmLayout({ children }: { children: ReactNode }) {
  return <>
    <style>{bodyStyle}</style>
    {children}
  </>;
}
