import type { Viewport } from "next";
import { notFound } from "next/navigation";
import { CoffeeForgot, CoffeeLogin, CoffeeNewPassword, CoffeeWaiting } from "@/components/coffee/CoffeeAuth";
import css from "@/components/coffee/coffee.module.css";
import { sampleState } from "@/components/coffee/pushSample";
import { ALL_OPTIONS, NO_OPTIONS, type QuotaGroup } from "@/lib/coffee/menu";
import { EmployeePreview } from "./EmployeePreview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pratinjau WG Coffee" };
/** As the real app: the screen reaches under the notch and the home bar and pads itself. */
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FBF6EE", colorScheme: "light", viewportFit: "cover" };

/*
 * WG Coffee, employee app (F2): the real components of /coffee on a make-believe server kept
 * in memory ("... (contoh)" people; nothing is saved, a reload starts over). For looking at the
 * screens before the migration runs. The "Pratinjau" box plays the pengelola (Selesai, Tolak).
 *   ?sebagai=ga|intern   the quota group (karyawan 4, GA 2, intern 2)
 *   ?habis=1             the quota is already used up
 *   ?riwayat=1           two earlier claims this month
 *   ?akses=1             holds Mode GA and Pengelola (the links in the account sheet)
 *   ?layar=pesanan       opens at Pesanan saya
 *   ?layar=atur          "Atur sekali" first (&hp=iphone)
 *   ?notif=on|denied|ios-install|unsupported|not-ready   the state web push is found in on this
 *                        make-believe device (F4; otherwise it can be turned on): seen in "Atur
 *                        sekali" and in the Akun sheet. Nothing is registered or sent.
 *   ?opsi=semua|suhu|gula   what a claim is asked (Pengaturan → Opsi minuman, F6). Without it the
 *                        real default: nothing, the sheet is the photo, the name and "Ajukan klaim".
 *   ?pesan=ga            the note someone without Mode GA sees
 *   ?layar=masuk|lupa|password|tunggu   the sign-in pages and the "belum dibuka" state. The sign-in
 *                        forms are the real ones: sending them calls the real sign-in API.
 * The prototype it was built from stays at /dev-preview/coffee.
 */
export default async function DevCoffeeEmployeePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { layar, sebagai, habis, riwayat, akses, notif, hp, pesan, opsi } = await searchParams;
  const group: QuotaGroup = sebagai === "ga" || sebagai === "intern" ? sebagai : "karyawan";
  return (
    <div className={css.theme} lang="id">
      {layar === "masuk" ? <CoffeeLogin next={null} />
        : layar === "lupa" ? <CoffeeForgot />
        : layar === "password" ? <CoffeeNewPassword next="/dev-preview/coffee/nyata" />
        : layar === "tunggu" ? <CoffeeWaiting detail="WG Coffee menunggu migrasi 202612010001_coffee.sql." />
        : <EmployeePreview group={group} full={habis === "1"} history={riwayat === "1"} access={akses === "1"} tab={layar === "pesanan" ? "pesanan" : "menu"}
            setup={layar === "atur"} options={opsi === "semua" ? ALL_OPTIONS : opsi === "suhu" ? { ...NO_OPTIONS, suhu: true, es: true } : opsi === "gula" ? { ...NO_OPTIONS, gula: true } : NO_OPTIONS} push={sampleState(notif)} phone={hp === "iphone" ? "iphone" : "android"}
            note={pesan === "ga" ? "Mode GA hanya untuk tim GA dan pengelola WG Coffee." : undefined} />}
    </div>
  );
}
