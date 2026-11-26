import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { coffeePath } from "@/lib/routes";
import css from "@/components/coffee/coffee.module.css";

/**
 * WG Coffee (/coffee, 26 Nov 2026): the employees' app for claiming the monthly coffee
 * quota, apart from WAM, Booking Kantor and WG People but on the same employee account.
 * Installable as its own app (its manifest, icons and service worker). Indonesian only, light only:
 * the warm cream and green of the approved prototype.
 */
const NAME = "WG Coffee";
const DESCRIPTION = "Klaim kopi kantor Werkudara dari HP, lalu ambil di mesin pantry.";
/** The link preview (WhatsApp, 26 Nov 2026): a square picture, so the small card with the picture at the side ("summary"). The root layout's metadataBase makes its address absolute. */
const preview = { url: coffeePath.preview, width: 1200, height: 1200, alt: "WG Coffee: klaim kopi kantor Werkudara", type: "image/jpeg" };
export const metadata: Metadata = {
  title: { default: NAME, template: `%s · ${NAME}` },
  description: DESCRIPTION,
  applicationName: NAME,
  robots: { index: false, follow: false },
  manifest: coffeePath.manifest,
  icons: { icon: coffeePath.icon("icon-192.png"), apple: coffeePath.icon("apple-touch-icon.png") },
  appleWebApp: { capable: true, title: NAME, statusBarStyle: "default" },
  openGraph: { title: NAME, description: DESCRIPTION, siteName: NAME, type: "website", locale: "id_ID", url: coffeePath.home, images: [preview] },
  twitter: { card: "summary", title: NAME, description: DESCRIPTION, images: [preview] },
};
/** The status bar takes the cream of the page; the app pads itself around the notch and the home bar. */
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FBF6EE", colorScheme: "light", viewportFit: "cover" };

export default function CoffeeLayout({ children }: { children: ReactNode }) {
  return <div className={css.theme} lang="id">{children}</div>;
}
