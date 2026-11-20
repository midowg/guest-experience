import { HR_PATH } from "@/lib/routes";

/*
 * HR Werkudara as an installable app ("Tambahkan ke layar utama", 20 Nov 2026): its own name, icon
 * and scope, so it opens full screen at /hr, apart from WAM and Booking Kantor.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json({
    id: `${HR_PATH}/`,
    name: "HR Werkudara",
    short_name: "HR Werkudara",
    description: "Absensi dengan wajah dan titik kantor; nanti cuti dan lembur.",
    lang: "id",
    start_url: `${HR_PATH}/`,
    scope: `${HR_PATH}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#F6F7F9",
    theme_color: "#2F6FEB",
    icons: [
      { src: `${HR_PATH}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${HR_PATH}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${HR_PATH}/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
