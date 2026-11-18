import { TravelScreen } from "@/components/main-wam/peserta/saya/TravelScreen";
import { directionLabel, travelDirection } from "@/lib/main-wam/peserta/travel";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
import { readLang } from "@/lib/server/main-wam/lang";
import { loadTravel } from "@/lib/server/main-wam/peserta/saya";

export const dynamic = "force-dynamic";
export const metadata = { title: "Perjalanan · WAM", robots: { index: false } };

/** L03 Perjalanan: ?arah=pulang opens the way back (else by date). Owner A (peserta); the gate first. */
export default async function TravelPage({ searchParams }: { searchParams: Promise<{ arah?: string | string[] }> }) {
  const { arah } = await searchParams;
  const context = await requireMainWamPage(mainWamPath.travel(arah === "pulang" ? "pulang" : undefined));
  const data = await loadTravel(context);
  const lang = await readLang();
  return <TravelScreen initial={travelDirection(arah, new Date(), context.settings.event)}
    labels={{ berangkat: directionLabel("berangkat", data.trips, lang), pulang: directionLabel("pulang", data.trips, lang) }}
    steps={data.steps} coordinators={data.coordinators} changed={data.changed} migrated={data.migrated} />;
}
