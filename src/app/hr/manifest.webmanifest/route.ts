import { HR_PATH } from "@/lib/routes";

/*
 * WG People as an installable app ("Tambahkan ke layar utama", 20 Nov 2026): its own name, icon
 * and scope, so it opens full screen at /hr, apart from WAM and Booking Kantor.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json({
    id: `${HR_PATH}/`,
    name: "WG People",
    short_name: "WG People",
    description: "Absensi dengan wajah dan titik kantor; nanti cuti dan lembur.",
    lang: "id",
    start_url: `${HR_PATH}/`,
    scope: `${HR_PATH}/`,
    display: "standalone",
    orientation: "portrait",
    // The launch screen Android draws from these: pine with the icon, like the splash in the app; each page sets its own bar colour after.
    background_color: "#123B2F",
    theme_color: "#123B2F",
    icons: [
      { src: `${HR_PATH}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${HR_PATH}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${HR_PATH}/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
