import type { Viewport } from "next";
import { notFound } from "next/navigation";
import admin from "@/components/admin/admin.module.css";
import { CoffeeAdminWaiting } from "@/components/coffee-admin/CoffeeAdminNav";
import { sectionOfPath } from "@/components/coffee-admin/sections";
import { coffeeAdminPath } from "@/lib/routes";
import { AdminPreview } from "./AdminPreview";

export const dynamic = "force-dynamic";
/** The phone layout reaches under the notch and the home bar; the screen pads itself with the safe-area insets. */
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

/*
 * Werkudara Coffee, pengelola (F1): the real components of /admin/coffee on a make-believe server
 * kept in memory ("Contoh ..." people; nothing is saved, a reload starts over). For looking at the
 * screens before the migration runs. ?layar=rekap or ?layar=pengaturan opens that section first.
 * ?alamat=1 lets the sections change the address as the real pages do (a reload then asks for the
 * admin sign-in); ?tunggu=1 shows what every page shows before the migration runs (the frame and the notice).
 * The prototype it was built from stays at /dev-preview/coffee/hr.
 */
export default async function DevCoffeeAdminPage({ searchParams }: { searchParams: Promise<{ layar?: string; tunggu?: string; alamat?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { layar, tunggu, alamat } = await searchParams;
  const view = sectionOfPath(layar === "rekap" ? coffeeAdminPath.recap() : layar === "pengaturan" ? coffeeAdminPath.settings : coffeeAdminPath.home) ?? "antrean";
  if (tunggu) return <CoffeeAdminWaiting current={view} notice="Werkudara Coffee menunggu migrasi 202612010001_coffee.sql." personName="Dewi Lestari (contoh)" className={admin.shell} />;
  return <AdminPreview view={view} now={new Date().toISOString()} routing={alamat ? "history" : "memory"} />;
}
