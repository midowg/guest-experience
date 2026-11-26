import type { Viewport } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import css from "@/components/coffee/coffee.module.css";
import { HOLD_COOKIE } from "@/components/coffee/ga/hold";
import { sampleState } from "@/components/coffee/pushSample";
import { GaPreview } from "./GaPreview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pratinjau Mode GA · WG Coffee" };
/** As the real tablet page (src/app/coffee/ga/layout.tsx). */
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FFFDF9", colorScheme: "light", viewportFit: "cover", interactiveWidget: "resizes-content" };

/*
 * WG Coffee, GA tablet and the guest menu book (F3): the real components of /coffee/ga on a
 * make-believe server kept in memory ("... (contoh)" people; nothing is saved, a reload starts
 * over). For looking at the screens before the migration runs, at 1280×800, 1024×768 and 768×1024.
 * The "Pratinjau" box plays the pengelola (Selesai, Tolak) and a network that goes away.
 *   ?kosong=1   no orders yet today (otherwise two were sent this morning)
 *   ?lambat=1   every answer takes a second and a half (to press Kirim twice)
 *   ?pin=1      a PIN GA is set (1234), so leaving the guest menu book asks for it
 *   ?notif=on|denied|ios-install|unsupported|not-ready   the state web push is found in (F4;
 *               otherwise it can be turned on). A make-believe device: nothing is registered or sent.
 * A reload while "Serahkan ke tamu" is open lands on the menu book again, as on the real page.
 * The prototype it was built from stays at /dev-preview/coffee/ga.
 */
export default async function DevCoffeeGaRealPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { kosong, lambat, pin, notif } = await searchParams;
  const held = (await cookies()).get(HOLD_COOKIE)?.value === "1";
  // The same wrapper as src/app/coffee/layout.tsx, so the tablet is seen inside the employee app's theme as on the real page.
  return <div className={css.theme} lang="id"><GaPreview empty={kosong === "1"} slow={lambat === "1"} pin={pin === "1"} held={held} push={sampleState(notif)} /></div>;
}
