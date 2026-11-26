import type { Viewport } from "next";
import { notFound } from "next/navigation";
import { CoffeeForgot, CoffeeLogin, CoffeeNewPassword, CoffeeWaiting } from "@/components/coffee/CoffeeAuth";
import css from "@/components/coffee/coffee.module.css";
import type { QuotaGroup } from "@/lib/coffee/menu";
import { EmployeePreview } from "./EmployeePreview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pratinjau Werkudara Coffee" };
/** As the real app: the screen reaches under the notch and the home bar and pads itself. */
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FBF6EE", colorScheme: "light", viewportFit: "cover" };

/*
 * Werkudara Coffee, employee app (F2): the real components of /coffee on a make-believe server kept
 * in memory ("... (contoh)" people; nothing is saved, a reload starts over). For looking at the
 * screens before the migration runs. The "Pratinjau" box plays the pengelola (Selesai, Tolak).
 *   ?sebagai=ga|intern   the quota group (karyawan 4, GA 2, intern 2)
 *   ?habis=1             the quota is already used up
 *   ?riwayat=1           two earlier claims this month
 *   ?akses=1             holds Mode GA and Pengelola (the links in the account sheet)
 *   ?layar=pesanan       opens at Pesanan saya
 *   ?layar=atur          "Atur sekali" first (&notif=1: with the permission step F4 will switch on; &hp=iphone)
 *   ?pesan=ga            the note someone without Mode GA sees
 *   ?layar=masuk|lupa|password|tunggu   the sign-in pages and the "belum dibuka" state. The sign-in
 *                        forms are the real ones: sending them calls the real sign-in API.
 * The prototype it was built from stays at /dev-preview/coffee.
 */
export default async function DevCoffeeEmployeePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { layar, sebagai, habis, riwayat, akses, notif, hp, pesan } = await searchParams;
  const group: QuotaGroup = sebagai === "ga" || sebagai === "intern" ? sebagai : "karyawan";
  return (
    <div className={css.theme} lang="id">
      {layar === "masuk" ? <CoffeeLogin next={null} />
        : layar === "lupa" ? <CoffeeForgot />
        : layar === "password" ? <CoffeeNewPassword next="/dev-preview/coffee/nyata" />
        : layar === "tunggu" ? <CoffeeWaiting detail="Werkudara Coffee menunggu migrasi 202612010001_coffee.sql." />
        : <EmployeePreview group={group} full={habis === "1"} history={riwayat === "1"} access={akses === "1"} tab={layar === "pesanan" ? "pesanan" : "menu"}
            setup={layar === "atur"} push={notif === "1"} phone={hp === "iphone" ? "iphone" : "android"}
            note={pesan === "ga" ? "Mode GA hanya untuk tim GA dan pengelola Werkudara Coffee." : undefined} />}
    </div>
  );
}
