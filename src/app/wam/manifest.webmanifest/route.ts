import { PRA_WAM_PATH } from "@/lib/routes";

/*
 * WAM as an installable app ("Tambahkan ke layar utama"): its own name, icon and scope, so it
 * opens full screen at /wam and stays apart from Journey's guest pages.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json({
    id: `${PRA_WAM_PATH}/`,
    name: "WAM · Werkudara",
    short_name: "WAM",
    description: "Satu aplikasi untuk setiap langkah menuju WAM 2027, dari Pra WAM sampai hari H.",
    lang: "id",
    start_url: `${PRA_WAM_PATH}/`,
    scope: `${PRA_WAM_PATH}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#FAFAF7",
    theme_color: "#1551A0",
    icons: [
      { src: `${PRA_WAM_PATH}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${PRA_WAM_PATH}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${PRA_WAM_PATH}/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
