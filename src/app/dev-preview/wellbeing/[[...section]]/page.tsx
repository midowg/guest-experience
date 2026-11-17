import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WellbeingPreview } from "./Preview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "Wellbeing (pratinjau)" }, robots: { index: false, follow: false } };

const SECTIONS = ["riwayat", "peringkat", "profil"];

/**
 * Layout and flow check for the Wellbeing employee app on sample data (src/components/wellbeing/mock-api.ts),
 * no sign-in and no database. Development only; never reachable in a production build. Every name is made up.
 *
 * /dev-preview/wellbeing[/riwayat|/peringkat|/profil] · ?lambat=1 slow answers · ?gagal=1 some calls fail
 * · ?kosong=1 a brand-new person · ?kembar=1 a Strava Running yesterday (log Running for yesterday to see
 * "Tetap simpan") · ?belumsiap=1 before the migration (migrated: false) · ?masuk=1 the sign-in page instead
 * (it calls the real WAM sign-in API) · ?pengumuman=1 an announcement and a prize · ?jeda=1 Catat paused ·
 * ?tanpafoto=1 photo reading off · ?belumhariini=1 nothing logged today (the streak flame is off; log one to light it)
 * · ?tanpakartu=1 no WAM character card yet (Profil → Foto profil).
 */
export default async function DevWellbeingPage({ params, searchParams }: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { section = [] } = await params;
  if (section.length > 1 || (section[0] && !SECTIONS.includes(section[0]))) notFound();
  const search = await searchParams;
  const on = (key: string) => { const value = search[key]; return (Array.isArray(value) ? value[0] : value) === "1"; };
  // Admin Wellbeing → Aplikasi karyawan, as set: an announcement and a prize, Catat paused, photo reading off.
  const controls = {
    ...(on("pengumuman") ? { announcement: { title: "Balapan November ditutup 30 Nov", message: "Catat aktivitas sebelum Senin pukul 23.59. Juara diumumkan di Friday Sharing." }, prize: "Juara 1 voucher Decathlon Rp250 rb, juara 2–3 tumbler" } : {}),
    ...(on("jeda") ? { pausedMessage: "Pencatatan dibuka lagi Senin pukul 08.00 setelah pindah data." } : {}),
    ...(on("tanpafoto") ? { photoReading: false } : {}),
  };
  return <WellbeingPreview options={{ slow: on("lambat"), fail: on("gagal"), empty: on("kosong"), stravaTwin: on("kembar"), notReady: on("belumsiap"), notToday: on("belumhariini"), noCard: on("tanpakartu"), controls }} login={on("masuk")} />;
}
