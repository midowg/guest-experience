import { BerandaScreen } from "@/components/main-wam/peserta/beranda/BerandaScreen";
import { SessionAbsen } from "@/components/main-wam/modul/SessionModule";
import { BerandaMisi } from "@/components/main-wam/misi/BerandaMisi";
import { BerandaMomen } from "@/components/main-wam/momen/BerandaMomen";
import { BerandaMozaik } from "@/components/main-wam/momen/BerandaMozaik";
import { BerandaCarbon } from "@/components/main-wam/peserta/karbon/BerandaCarbon";
import { BerandaKuis } from "@/components/main-wam/kuis/BerandaKuis";
import { moduleOn } from "@/lib/main-wam/modules";
import { hhmm } from "@/lib/main-wam/peserta/format";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
import { readLang } from "@/lib/server/main-wam/lang";
import { loadHome } from "@/lib/server/main-wam/peserta/home";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beranda · WAM", robots: { index: false } };

/**
 * P01/P02 Beranda (panitia's tools are the Panitia tab, K01). Owner A (peserta), see
 * docs/main-wam/KONTRAK.md §6: the gate first, then Sekarang and the contextual card (agen A),
 * BerandaMomen (B) after the contextual card, then Jejak karbon's card (module karbon, everyone).
 * The Sekarang card holds D's SessionAbsen while its absen is open. The greeting and the bell are
 * the frame's.
 */
export default async function HomePage() {
  const context = await requireMainWamPage(mainWamPath.home);
  const now = new Date();
  const data = await loadHome(context, now);
  return <BerandaScreen data={data} serverNow={now.toISOString()} since={hhmm(now.toISOString(), await readLang())} slots={{
    absen: data.session ? <SessionAbsen session={data.session} context={context} now={now} home /> : null,
    momen: <BerandaMomen context={context} now={now} />,
    misi: <BerandaMisi context={context} now={now} />,
    mozaik: moduleOn(context.settings.modules, "mozaik") ? <BerandaMozaik context={context} now={now} /> : null,
    carbon: <BerandaCarbon context={context} now={now} />,
    kuis: <BerandaKuis context={context} />,
  }} />;
}
