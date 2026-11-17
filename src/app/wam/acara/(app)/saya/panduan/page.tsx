import { GuidesScreen } from "@/components/main-wam/peserta/panduan/GuidesScreen";
import { hhmm } from "@/lib/main-wam/peserta/format";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
import { loadGuides } from "@/lib/server/main-wam/peserta/saya";

export const dynamic = "force-dynamic";
export const metadata = { title: "Panduan · WAM", robots: { index: false } };

/** L04 Panduan. Owner A (peserta); the gate first. Published guides only. */
export default async function GuidesPage() {
  await requireMainWamPage(mainWamPath.guides);
  const data = await loadGuides();
  return <GuidesScreen {...data} since={hhmm(new Date().toISOString())} />;
}
