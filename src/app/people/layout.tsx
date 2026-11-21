import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { asTheme, THEME_COOKIE, themeColors } from "@/lib/hr/theme";
import { HR_PATH } from "@/lib/routes";
import { jakarta } from "@/components/hr/font";
import hr from "@/components/hr/hr.module.css";

/**
 * WG People (/people; /hr until 21 Nov 2026, which still redirects): the employees' HR app, apart
 * from WAM. Installable as its own app (its manifest and service worker, scope /people/). Absensi,
 * cuti and izin; lembur DW to come. Light unless the person picked dark (cookie wg_tema), drawn by
 * the server so nothing flashes.
 */
/** iPhone screens (CSS width, height, pixel ratio) with a launch picture in public/people (splash-<px>.png). */
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
export async function generateViewport(): Promise<Viewport> {
  const theme = asTheme((await cookies()).get(THEME_COOKIE)?.value);
  return { themeColor: themeColors[theme], colorScheme: theme === "gelap" ? "dark" : "light", viewportFit: "cover" };
}

export default async function HrLayout({ children }: { children: ReactNode }) {
  const theme = asTheme((await cookies()).get(THEME_COOKIE)?.value);
  return <div id="wg-tema" className={`${jakarta.variable} ${hr.theme}`} data-tema={theme}>{children}</div>;
}
