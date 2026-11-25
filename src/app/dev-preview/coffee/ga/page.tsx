import { notFound } from "next/navigation";
import { GaPrototype } from "@/components/coffee/prototype/GaPrototype";

export const dynamic = "force-dynamic";

/*
 * Werkudara Coffee, GA tablet (25 Nov 2026): a clickable prototype of meeting orders (Input cepat)
 * and the guest menu book (Serahkan ke tamu). Orders land in the prototypes' shared localStorage
 * store, so /dev-preview/coffee/hr in another tab sees them. Nothing reaches a server.
 */
export default function DevCoffeeGaPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GaPrototype />;
}
