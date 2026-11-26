import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { coffeePath } from "@/lib/routes";
import css from "@/components/coffee/coffee.module.css";

/**
 * Werkudara Coffee (/coffee, 26 Nov 2026): the employees' app for claiming the monthly coffee
 * quota, apart from WAM, Booking Kantor and WG People but on the same employee account.
 * Installable as its own app (its manifest, icons and service worker). Indonesian only, light only:
 * the warm cream and green of the approved prototype.
 */
export const metadata: Metadata = {
  title: { default: "Werkudara Coffee", template: "%s · Werkudara Coffee" },
  description: "Klaim jatah kopi bulanan dari HP, lalu ambil di mesin pantry.",
  applicationName: "Werkudara Coffee",
  robots: { index: false },
  manifest: coffeePath.manifest,
  icons: { icon: coffeePath.icon("icon-192.png"), apple: coffeePath.icon("apple-touch-icon.png") },
  appleWebApp: { capable: true, title: "Coffee", statusBarStyle: "default" },
};
/** The status bar takes the cream of the page; the app pads itself around the notch and the home bar. */
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FBF6EE", colorScheme: "light", viewportFit: "cover" };

export default function CoffeeLayout({ children }: { children: ReactNode }) {
  return <div className={css.theme} lang="id">{children}</div>;
}
