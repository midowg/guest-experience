import type { Viewport } from "next";
import { notFound } from "next/navigation";
import { PengelolaPrototype } from "@/components/coffee/prototype/PengelolaPrototype";

export const dynamic = "force-dynamic";
/** Phone layout reaches under the notch and home bar; the page pads itself with the safe-area insets. */
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#F6F5F3" };

/*
 * Werkudara Coffee, pengelola side (25 Nov 2026): the desktop tool for everyone who holds the
 * Werkudara Coffee access (HR and admins). Antrean, Catat manual, Rekap. Clickable prototype on the
 * shared make-believe store (localStorage), so GA's tablet prototype in another tab feeds the queue.
 */
export default function DevCoffeePengelolaPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PengelolaPrototype />;
}
