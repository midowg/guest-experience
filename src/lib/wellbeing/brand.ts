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
// Square (1080 × 1080): the small preview in WhatsApp is a square crop, so a square card shows whole.
const SHARE_IMAGE = { url: "/wlm/opengraph-image", width: 1080, height: 1080, alt: "WLM: aplikasi wellbeing Werkudara. Masuk dengan akun WAM." };

/** WLM's own background, light (the default theme) and dark: the launcher's splash, the status bar before the app paints it. */
export const WLM_BG = { light: "#F3F4F6", dark: "#0A0E15" } as const;

/*
 * The launch screens (19 Nov 2026): an iPhone opening WLM from the home screen shows a picture of exactly
 * its screen's size (portrait CSS width, height, pixel ratio), else white. Drawn at build by
 * app/wlm/launch/[size]/route.tsx, the same picture as the splash.
 */
export const WLM_LAUNCH_SCREENS = [
  [320, 568, 2], [375, 667, 2], [414, 736, 3], [375, 812, 3], [414, 896, 2], [414, 896, 3],
  [390, 844, 3], [428, 926, 3], [393, 852, 3], [430, 932, 3], [402, 874, 3], [440, 956, 3],
] as const;
export const launchSize = ([width, height, ratio]: readonly [number, number, number]) => `${width * ratio}x${height * ratio}`;
const startupImages = WLM_LAUNCH_SCREENS.map(screen => ({
  url: `/wlm/launch/${launchSize(screen)}`,
  media: `(device-width: ${screen[0]}px) and (device-height: ${screen[1]}px) and (-webkit-device-pixel-ratio: ${screen[2]}) and (orientation: portrait)`,
}));

/** Metadata for a WLM page: its tab title and icon, the share card (title, text, picture), and the home-screen name and icon. */
export function wlmMetadata(page?: string): Metadata {
  return {
    title: { absolute: wlmTitle(page) },
    description: WLM_DESCRIPTION,
    applicationName: WLM_TITLE,
    icons: {
      icon: [{ url: "/wlm/icon", type: "image/png", sizes: "64x64" }, { url: "/wlm/icon-192.png", type: "image/png", sizes: "192x192" }],
      apple: [{ url: "/wlm/apple-icon", type: "image/png", sizes: "180x180" }],
    },
    // Its own installable app (19 Nov 2026): the launcher says WLM, shows WLM's icon and opens /wlm.
    manifest: "/wlm/manifest.webmanifest",
    openGraph: { title: WLM_TITLE, description: WLM_DESCRIPTION, siteName: WLM_TITLE, type: "website", locale: "id_ID", images: [SHARE_IMAGE] },
    // "summary": the card type for a square picture (summary_large_image wants a wide one).
    twitter: { card: "summary", title: WLM_TITLE, description: WLM_DESCRIPTION, images: [SHARE_IMAGE.url] },
    appleWebApp: { capable: true, title: WLM_SHORT, statusBarStyle: "black-translucent", startupImage: startupImages },
    robots: { index: false, follow: false },
  };
}
