import { BerandaScreen } from "@/components/main-wam/peserta/beranda/BerandaScreen";
import { SessionAbsen } from "@/components/main-wam/modul/SessionModule";
import { BerandaMomen } from "@/components/main-wam/momen/BerandaMomen";
import { BerandaBod } from "@/components/main-wam/panitia/BerandaBod";
import { hhmm } from "@/lib/main-wam/peserta/format";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
import { readLang } from "@/lib/server/main-wam/lang";
import { loadHome } from "@/lib/server/main-wam/peserta/home";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beranda · WAM", robots: { index: false } };

/**
 * P01/P02 Beranda (BOD B01 adds its card; panitia's tools are the Panitia tab, K01). Owner A (peserta), see
 * docs/main-wam/KONTRAK.md §6: the gate first, then Sekarang and the contextual card (agen A),
 * BerandaBod (C) under Sekarang (panitia have no card here: their tools are the Panitia tab), BerandaMomen (B) after the contextual card.
 * The Sekarang card holds D's SessionAbsen while its absen is open. The greeting and the bell are
 * the frame's.
 */
export default async function HomePage() {
  const context = await requireMainWamPage(mainWamPath.home);
  const now = new Date();
  const data = await loadHome(context, now);
  return <BerandaScreen data={data} serverNow={now.toISOString()} since={hhmm(now.toISOString(), await readLang())} slots={{
    absen: data.session ? <SessionAbsen session={data.session} context={context} now={now} /> : null,
    bod: <BerandaBod context={context} now={now} />,
    momen: <BerandaMomen context={context} now={now} />,
  }} />;
}
