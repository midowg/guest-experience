import { CarbonBody } from "@/components/main-wam/peserta/karbon/CarbonBody";
import { mainWamPath } from "@/lib/routes";
import { requireModulePage } from "@/lib/server/main-wam/gate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jejak karbon · WAM", robots: { index: false } };

/** E01 Jejak karbon, opened from Saya → Info acara (Saya's tab stays lit). Owner A (peserta); module Jejak karbon, the gate first. */
export default async function CarbonFromMePage() {
  return <CarbonBody context={await requireModulePage("karbon", mainWamPath.carbon("saya"))} />;
}
