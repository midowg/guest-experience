import type { Metadata } from "next";

/*
 * WLM's name and what it says about itself (18 Nov 2026): the browser tab, the home-screen name, and
 * the link card WhatsApp and others show when /wlm is shared. Plain and clear about what the app is
 * and how to get in (the WAM account); no slogan. The name is just "WLM": it already stands for
 * Werkudara Life Mode (the owner, 18 Nov 2026).
 */
export const WLM_TITLE = "WLM";
export const WLM_SHORT = "WLM";
export const WLM_DESCRIPTION = "Aplikasi wellbeing Werkudara: catat aktivitas fisik, emosional, sosial, finansial, dan spiritual, kumpulkan poin, dan kejar peringkat bulanan. Masuk dengan akun WAM.";

/** The tab title: the page first when there is one ("Peringkat · WLM"), else the name alone. */
export const wlmTitle = (page?: string) => page ? `${page} · ${WLM_TITLE}` : WLM_TITLE;

/** The pictures, drawn by src/app/wlm/{opengraph-image,icon,apple-icon}.tsx (named here: a page's own openGraph and the root's icons would hide them). */
const SHARE_IMAGE = { url: "/wlm/opengraph-image", width: 1200, height: 630, alt: "WLM: aplikasi wellbeing Werkudara. Masuk dengan akun WAM." };

/** Metadata for a WLM page: its tab title and icon, the share card (title, text, picture), and the home-screen name and icon. */
export function wlmMetadata(page?: string): Metadata {
  return {
    title: { absolute: wlmTitle(page) },
    description: WLM_DESCRIPTION,
    applicationName: WLM_TITLE,
    icons: { icon: [{ url: "/wlm/icon", type: "image/png", sizes: "64x64" }], apple: [{ url: "/wlm/apple-icon", type: "image/png", sizes: "180x180" }] },
    openGraph: { title: WLM_TITLE, description: WLM_DESCRIPTION, siteName: WLM_TITLE, type: "website", locale: "id_ID", images: [SHARE_IMAGE] },
    twitter: { card: "summary_large_image", title: WLM_TITLE, description: WLM_DESCRIPTION, images: [SHARE_IMAGE.url] },
    appleWebApp: { capable: true, title: WLM_SHORT, statusBarStyle: "black-translucent" },
    robots: { index: false, follow: false },
  };
}
