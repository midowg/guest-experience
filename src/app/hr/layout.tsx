import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { HR_PATH } from "@/lib/routes";
import { jakarta } from "@/components/hr/font";
import hr from "@/components/hr/hr.module.css";

/**
 * WG People (/hr, 20 Nov 2026): the employees' HR app, apart from WAM. Installable as its own
 * app (its manifest and service worker, scope /hr/). Absensi first; cuti and lembur DW to come.
 */
export const metadata: Metadata = {
  title: { default: "WG People", template: "%s · WG People" },
  applicationName: "WG People",
  robots: { index: false },
  manifest: `${HR_PATH}/manifest.webmanifest`,
  icons: { icon: `${HR_PATH}/icon-192.png`, apple: `${HR_PATH}/apple-touch-icon.png` },
  appleWebApp: { capable: true, title: "WG People", statusBarStyle: "default" },
};
export function generateViewport(): Viewport {
  return { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F7F3EE" }, { media: "(prefers-color-scheme: dark)", color: "#161210" }], viewportFit: "cover" };
}

export default function HrLayout({ children }: { children: ReactNode }) {
  return <div className={`${jakarta.variable} ${hr.theme}`}>{children}</div>;
}
