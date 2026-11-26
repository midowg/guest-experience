import { COFFEE_PATH, coffeePath } from "@/lib/routes";

/*
 * WG Coffee as an installable app ("Pasang di layar utama", 26 Nov 2026): its own name,
 * icon and scope, so it opens full screen at /coffee, apart from WAM, Booking Kantor and WG People.
 * The scope is the app's address without a slash at the end: the app's first page is /coffee
 * itself, which "/coffee/" would leave outside (the phone would then show a browser bar on it).
 * The service worker has the same scope (coffeePath.scope).
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json({
    id: COFFEE_PATH,
    name: "WG Coffee",
    short_name: "WG Coffee",
    description: "Klaim jatah kopi bulanan dari HP, lalu ambil di mesin pantry.",
    lang: "id",
    start_url: COFFEE_PATH,
    scope: COFFEE_PATH,
    display: "standalone",
    // No `orientation`: the same manifest covers the GA tablet (/coffee/ga), which is laid out lying down.
    // The launch screen Android draws from these: the cream of the app with its icon.
    background_color: "#FBF6EE",
    theme_color: "#FBF6EE",
    icons: [
      { src: coffeePath.icon("icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: coffeePath.icon("icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: coffeePath.icon("icon-maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
