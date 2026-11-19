import { WLM_BG, WLM_DESCRIPTION, WLM_SHORT } from "@/lib/wellbeing/brand";
import { WELLBEING_PATH } from "@/lib/routes";

/*
 * WLM as its own installable app (19 Nov 2026, "Tambahkan ke layar utama"): the launcher says WLM, shows
 * WLM's icon, opens /wlm full screen and stays apart from Journey and WAM. Android's launch screen is
 * the background colour with the icon and the name; WLM opens in the light theme, so it is light too.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json({
    id: `${WELLBEING_PATH}/`,
    name: "WLM · Werkudara Life Mode",
    short_name: WLM_SHORT,
    description: WLM_DESCRIPTION,
    lang: "id",
    start_url: WELLBEING_PATH,
    scope: `${WELLBEING_PATH}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: WLM_BG.light,
    theme_color: WLM_BG.light,
    icons: [
      { src: `${WELLBEING_PATH}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${WELLBEING_PATH}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${WELLBEING_PATH}/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
