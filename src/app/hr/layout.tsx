import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { HR_PATH } from "@/lib/routes";
import { jakarta } from "@/components/hr/font";
import hr from "@/components/hr/hr.module.css";

/**
 * WG People (/hr, 20 Nov 2026): the employees' HR app, apart from WAM. Installable as its own
 * app (its manifest and service worker, scope /hr/). Absensi first; cuti and lembur DW to come.
 */
/** iPhone screens (CSS width, height, pixel ratio) with a launch picture in public/hr (splash-<px>.png). */
const LAUNCH: [number, number, number][] = [
  [440, 956, 3], [420, 912, 3], [402, 874, 3], [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3],
  [375, 812, 3], [360, 780, 3], [414, 896, 3], [414, 896, 2], [414, 736, 3], [375, 667, 2], [320, 568, 2],
];
export const metadata: Metadata = {
  title: { default: "WG People", template: "%s · WG People" },
  applicationName: "WG People",
  robots: { index: false },
  manifest: `${HR_PATH}/manifest.webmanifest`,
  icons: { icon: `${HR_PATH}/icon-192.png`, apple: `${HR_PATH}/apple-touch-icon.png` },
  appleWebApp: {
    capable: true, title: "WG People", statusBarStyle: "default",
    // The phone's own launch picture on iPhone (21 Nov 2026): the same as the splash in the app, so opening reads as one step.
    startupImage: LAUNCH.map(([width, height, ratio]) => ({
      url: `${HR_PATH}/splash-${width * ratio}x${height * ratio}.png`,
      media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`,
    })),
  },
};
export function generateViewport(): Viewport {
  return { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F3F2EC" }, { media: "(prefers-color-scheme: dark)", color: "#0D1411" }], viewportFit: "cover" };
}

export default function HrLayout({ children }: { children: ReactNode }) {
  return <div className={`${jakarta.variable} ${hr.theme}`}>{children}</div>;
}
